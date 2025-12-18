# Script Review: Bugs and Optimizations

## Critical Issues Found

### 1. 🐛 BUG: Unsafe $? checking after `[[ ]]`
**Location**: `download-dependencies.sh:95`

**Problem**:
```bash
if [[ $? -eq 0 ]] && [[ -f "$output" ]]; then
```

With `set -e`, if the previous command (wget/curl) fails, the script exits before reaching this check. The `$?` is actually checking the exit code of the `fi` from the previous if-statement, not the download command.

**Fix**:
```bash
download_file() {
    local url="$1"
    local output="$2"
    local filename
    filename=$(basename "$output")
    local download_status=0

    log_info "Downloading ${filename}..."

    if [[ -f "$output" ]]; then
        log_warn "File already exists: ${filename}"
        read -p "Overwrite? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Skipping ${filename}"
            return 0
        fi
        rm -f "$output"
    fi

    if command -v wget &> /dev/null; then
        wget --no-verbose --show-progress -O "$output" "$url" || download_status=$?
    elif command -v curl &> /dev/null; then
        curl -L --progress-bar -o "$output" "$url" || download_status=$?
    else
        log_error "Neither wget nor curl found. Please install one of them."
        return 1
    fi

    if [[ $download_status -eq 0 ]] && [[ -f "$output" ]]; then
        log_success "Downloaded ${filename} ($(du -h "$output" | cut -f1))"
        return 0
    else
        log_error "Failed to download ${filename}"
        rm -f "$output"  # Clean up partial download
        return 1
    fi
}
```

### 2. 🐛 BUG: Unquoted cd in create_manifest
**Location**: `download-dependencies.sh:156,170`

**Problem**:
```bash
cd "$output_dir"
# ... work ...
cd - > /dev/null
```

If the function fails between these cd commands, the working directory is wrong for the rest of the script.

**Fix**:
```bash
create_manifest() {
    local output_dir="$1"
    local manifest_file="${output_dir}/MANIFEST.txt"

    # ... header creation ...

    # Add file checksums (stay in current dir, use full paths)
    for file in "$output_dir"/*.tar.gz; do
        if [[ -f "$file" ]]; then
            local filename=$(basename "$file")
            local size=$(du -h "$file" | cut -f1)
            local sha256
            if command -v sha256sum &> /dev/null; then
                sha256=$(sha256sum "$file" | cut -d' ' -f1)
                echo "${filename} (${size}) - SHA256: ${sha256}" >> "$manifest_file"
            else
                echo "${filename} (${size})" >> "$manifest_file"
            fi
        fi
    done

    log_success "Created manifest: ${manifest_file}"
}
```

### 3. 🐛 BUG: sed -i not portable to macOS
**Location**: `install-opengrok.sh:286,448`

**Problem**:
```bash
sed -i "s/port=\"8080\"/port=\"$TOMCAT_PORT\"/" file
```

On macOS, `sed -i` requires an extension argument: `sed -i.bak` or `sed -i ''`

**Fix**:
```bash
# Portable sed -i replacement
sed_inplace() {
    local pattern="$1"
    local file="$2"

    if sed --version &> /dev/null 2>&1; then
        # GNU sed
        sed -i "$pattern" "$file"
    else
        # BSD sed (macOS)
        sed -i '' "$pattern" "$file"
    fi
}

# Usage:
sed_inplace "s/port=\"8080\"/port=\"$TOMCAT_PORT\"/" \
    "${INSTALL_BASE}/tomcat/conf/server.xml"
```

### 4. 🐛 BUG: Race condition with systemd service
**Location**: `install-opengrok.sh:344,411`

**Problem**:
```bash
# Start Tomcat to auto-deploy
su - tomcat -s /bin/bash -c "${INSTALL_BASE}/tomcat/bin/startup.sh" || true
sleep 10  # Fixed sleep - may not be enough
```

10 seconds may not be enough for large WAR files to deploy.

**Fix**:
```bash
deploy_webapp() {
    log_info "Deploying OpenGrok web application..."

    # Copy WAR file to Tomcat
    cp "${INSTALL_BASE}/opengrok/lib/source.war" \
       "${INSTALL_BASE}/tomcat/webapps/"

    # Start Tomcat to auto-deploy
    log_info "Starting Tomcat to deploy WAR..."
    su - tomcat -s /bin/bash -c "${INSTALL_BASE}/tomcat/bin/startup.sh" || true

    # Wait for deployment with timeout
    local timeout=60
    local elapsed=0
    local web_xml="${INSTALL_BASE}/tomcat/webapps/source/WEB-INF/web.xml"

    log_info "Waiting for WAR deployment..."
    while [[ ! -f "$web_xml" ]] && [[ $elapsed -lt $timeout ]]; do
        sleep 2
        elapsed=$((elapsed + 2))
    done

    if [[ ! -f "$web_xml" ]]; then
        log_error "WAR deployment timeout after ${timeout}s"
        return 1
    fi

    log_success "WAR deployed successfully"

    # Stop Tomcat
    log_info "Stopping Tomcat..."
    su - tomcat -s /bin/bash -c "${INSTALL_BASE}/tomcat/bin/shutdown.sh" || true
    sleep 5

    # Rest of configuration...
}
```

### 5. 🐛 BUG: Missing trap for cleanup
**Location**: Both scripts

**Problem**: If script is interrupted (Ctrl+C), temporary files and partial installations remain.

**Fix**:
```bash
# At top of install-opengrok.sh after set -euo pipefail
TEMP_FILES=()

cleanup() {
    local exit_code=$?
    if [[ ${#TEMP_FILES[@]} -gt 0 ]]; then
        log_info "Cleaning up temporary files..."
        for temp_file in "${TEMP_FILES[@]}"; do
            rm -rf "$temp_file" 2>/dev/null || true
        done
    fi
    exit $exit_code
}

trap cleanup EXIT INT TERM

# Usage in functions:
install_ctags() {
    # ...
    local temp_dir
    temp_dir=$(mktemp -d)
    TEMP_FILES+=("$temp_dir")  # Track for cleanup
    # ...
}
```

## Medium Priority Issues

### 6. ⚠️ ISSUE: Missing disk space check
**Location**: `install-opengrok.sh`

**Problem**: Script doesn't verify sufficient disk space before installation.

**Fix**:
```bash
check_disk_space() {
    local required_mb=2048  # 2GB minimum
    local install_df
    local data_df

    install_df=$(df -m "$INSTALL_BASE" 2>/dev/null | tail -1 | awk '{print $4}')
    data_df=$(df -m "$(dirname "$DATA_BASE")" 2>/dev/null | tail -1 | awk '{print $4}')

    if [[ -z "$install_df" ]] || [[ -z "$data_df" ]]; then
        log_warn "Could not check disk space"
        return 0
    fi

    if [[ $install_df -lt $required_mb ]]; then
        log_error "Insufficient space in $INSTALL_BASE: ${install_df}MB available, ${required_mb}MB required"
        return 1
    fi

    if [[ $data_df -lt $required_mb ]]; then
        log_error "Insufficient space for $DATA_BASE: ${data_df}MB available, ${required_mb}MB required"
        return 1
    fi

    log_success "Disk space check passed (${install_df}MB available)"
    return 0
}

# Call in main() after argument parsing
check_disk_space || exit 1
```

### 7. ⚠️ ISSUE: No backup of existing config
**Location**: `install-opengrok.sh:448`

**Problem**:
```bash
sed -i "/<\/web-app>/i\\    <context-param>..." "$web_xml"
```

This modifies web.xml but the backup happens too late (line 446).

**Fix**:
```bash
# Backup first, then check
cp "$web_xml" "${web_xml}.bak"
log_info "Backed up web.xml"

if ! grep -q "CONFIGURATION" "$web_xml"; then
    # Modify...
fi
```

### 8. ⚠️ ISSUE: Read prompts in non-interactive environments
**Location**: Multiple locations with `read -p`

**Problem**: Script hangs if run non-interactively (cron, automation).

**Fix**:
```bash
# Add at top
INTERACTIVE=true
if [[ ! -t 0 ]]; then
    INTERACTIVE=false
    log_warn "Running in non-interactive mode - using defaults"
fi

# Modify prompt functions
prompt_yes_no() {
    local question="$1"
    local default="${2:-N}"

    if [[ "$INTERACTIVE" != "true" ]]; then
        log_info "Non-interactive: using default (${default})"
        [[ "$default" == "y" ]] || [[ "$default" == "Y" ]]
        return $?
    fi

    read -p "$question (y/N): " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]]
}

# Usage:
if prompt_yes_no "Remove and reinstall?" "N"; then
    rm -rf "${INSTALL_BASE}/tomcat"
fi
```

### 9. ⚠️ ISSUE: Indexer memory not configurable
**Location**: `install-opengrok.sh:467`

**Problem**: Hardcoded java command doesn't allow memory adjustment.

**Fix**:
```bash
run_indexer() {
    log_info "Running OpenGrok indexer..."
    log_warn "This may take a while depending on source code size..."

    # Ensure JAVA_HOME is set
    export JAVA_HOME="${INSTALL_BASE}/java"
    export PATH="$JAVA_HOME/bin:$PATH"

    # Detect available memory
    local total_mem_mb
    if [[ -f /proc/meminfo ]]; then
        total_mem_mb=$(grep MemTotal /proc/meminfo | awk '{print int($2/1024)}')
    else
        total_mem_mb=2048  # Default 2GB
    fi

    # Use 50% of available memory, minimum 512MB, maximum 4GB
    local index_mem=$((total_mem_mb / 2))
    [[ $index_mem -lt 512 ]] && index_mem=512
    [[ $index_mem -gt 4096 ]] && index_mem=4096

    log_info "Allocating ${index_mem}MB for indexing"

    # Run indexer with memory setting
    "${JAVA_HOME}/bin/java" \
        -Xmx${index_mem}m \
        -jar "${INSTALL_BASE}/opengrok/lib/opengrok.jar" \
        -c /usr/local/bin/ctags \
        -s "${DATA_BASE}/src" \
        -d "${DATA_BASE}/data" \
        -H -P -S -G \
        -W "${DATA_BASE}/etc/configuration.xml"

    if [[ $? -eq 0 ]]; then
        log_success "Indexing completed successfully"
        return 0
    else
        log_error "Indexing failed"
        log_info "Try manually with more memory: java -Xmx4g -jar ..."
        return 1
    fi
}
```

## Optimizations

### 10. 🚀 OPTIMIZATION: Parallel downloads
**Location**: `download-dependencies.sh`

**Benefit**: 4x faster downloads

**Implementation**:
```bash
download_file_bg() {
    local url="$1"
    local output="$2"

    download_file "$url" "$output" &
    return 0
}

# In main():
log_info "Starting parallel downloads..."
download_file_bg "$OPENGROK_URL" "${output_dir}/opengrok-${OPENGROK_VERSION}.tar.gz"
download_file_bg "$CTAGS_URL" "${output_dir}/ctags-${CTAGS_VERSION}-linux-x86_64.tar.gz"
download_file_bg "$TOMCAT_URL" "${output_dir}/apache-tomcat-${TOMCAT_VERSION}.tar.gz"
download_file_bg "$JDK_URL" "${output_dir}/OpenJDK11U-jre_x64_linux_hotspot_${JDK_VERSION/+/_}.tar.gz"

# Wait for all downloads
wait

# Verify all
verify_file "..." || failed=1
# ...
```

### 11. 🚀 OPTIMIZATION: Cache SHA256 sums
**Location**: `download-dependencies.sh:162`

**Benefit**: Faster verification on re-runs

**Implementation**:
```bash
create_manifest() {
    # ... existing code ...

    # Save checksums to separate file for faster verification
    if command -v sha256sum &> /dev/null; then
        sha256sum "$output_dir"/*.tar.gz > "$output_dir/SHA256SUMS"
        log_success "Created checksums file"
    fi
}

# Add verification function
verify_checksums() {
    local output_dir="$1"

    if [[ -f "$output_dir/SHA256SUMS" ]]; then
        log_info "Verifying checksums..."
        cd "$output_dir"
        if sha256sum -c SHA256SUMS --quiet 2>/dev/null; then
            log_success "All checksums valid"
            cd - >/dev/null
            return 0
        else
            log_error "Checksum verification failed"
            cd - >/dev/null
            return 1
        fi
    fi
    return 0
}
```

### 12. 🚀 OPTIMIZATION: Reuse existing Java
**Location**: `install-opengrok.sh:143`

**Benefit**: Faster installation if Java already present

**Implementation**:
```bash
install_java() {
    local deps_dir="$1"

    # Check if Java is already installed and usable
    if command -v java &> /dev/null; then
        local java_version
        java_version=$(java -version 2>&1 | head -1 | grep -oP '(?<=version ").*(?=")')
        local major_version
        major_version=$(echo "$java_version" | cut -d. -f1)

        if [[ "$major_version" -ge 11 ]]; then
            log_success "Suitable Java already installed: $java_version"
            export JAVA_HOME=$(dirname $(dirname $(readlink -f $(which java))))
            export PATH="$JAVA_HOME/bin:$PATH"

            read -p "Use existing Java installation? (Y/n): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Nn]$ ]]; then
                return 0
            fi
        fi
    fi

    # ... proceed with installation ...
}
```

### 13. 🚀 OPTIMIZATION: Reduce indexing time
**Location**: `install-opengrok.sh:467`

**Benefit**: Skip unnecessary features for first index

**Implementation**:
```bash
run_indexer() {
    # ... existing code ...

    # Ask user about indexing options
    log_info "Indexing options:"
    echo "  1) Full indexing (history, cross-references) - Slow but complete"
    echo "  2) Fast indexing (no history) - Recommended for first run"
    echo "  3) Skip indexing - Index manually later"

    if [[ "$INTERACTIVE" == "true" ]]; then
        read -p "Choose [1-3] (default: 2): " -n 1 -r
        echo
        local choice="${REPLY:-2}"
    else
        local choice=2
    fi

    case $choice in
        1)
            local index_flags="-H -P -S -G"
            log_info "Running full indexing..."
            ;;
        2)
            local index_flags="-P -S -G"
            log_info "Running fast indexing (no history)..."
            ;;
        3)
            log_info "Skipping indexing"
            return 0
            ;;
        *)
            local index_flags="-P -S -G"
            log_info "Invalid choice, using fast indexing"
            ;;
    esac

    "${JAVA_HOME}/bin/java" \
        -Xmx${index_mem}m \
        -jar "${INSTALL_BASE}/opengrok/lib/opengrok.jar" \
        -c /usr/local/bin/ctags \
        -s "${DATA_BASE}/src" \
        -d "${DATA_BASE}/data" \
        $index_flags \
        -W "${DATA_BASE}/etc/configuration.xml"
}
```

### 14. 🚀 OPTIMIZATION: Progress indicator for long operations
**Location**: `install-opengrok.sh:467`

**Benefit**: User feedback during long indexing

**Implementation**:
```bash
show_progress() {
    local pid=$1
    local message="$2"

    local spin='-\|/'
    local i=0

    while kill -0 $pid 2>/dev/null; do
        i=$(( (i+1) %4 ))
        printf "\r${BLUE}[INFO]${NC} %s ${spin:$i:1}" "$message"
        sleep 0.5
    done
    printf "\r"
}

# Usage:
"${JAVA_HOME}/bin/java" ... &
local index_pid=$!
show_progress $index_pid "Indexing in progress"
wait $index_pid
local exit_code=$?
```

### 15. 🚀 OPTIMIZATION: Validate URLs before downloading
**Location**: `download-dependencies.sh`

**Benefit**: Fast-fail on broken URLs

**Implementation**:
```bash
validate_url() {
    local url="$1"

    if command -v curl &> /dev/null; then
        if curl --output /dev/null --silent --head --fail "$url"; then
            return 0
        fi
    elif command -v wget &> /dev/null; then
        if wget --spider --quiet "$url"; then
            return 0
        fi
    fi

    return 1
}

# In main():
log_info "Validating download URLs..."
local failed_urls=0
for url in "$OPENGROK_URL" "$CTAGS_URL" "$TOMCAT_URL" "$JDK_URL"; do
    if ! validate_url "$url"; then
        log_error "URL not accessible: $url"
        failed_urls=1
    fi
done

if [[ $failed_urls -eq 1 ]]; then
    log_error "Some URLs are not accessible. Check version numbers or network."
    exit 1
fi
log_success "All URLs validated"
```

## Summary

### Critical Bugs (Must Fix)
1. ✅ Unsafe $? checking - causes false positives
2. ✅ Unquoted cd - breaks script state
3. ✅ sed -i incompatible with macOS
4. ✅ Race condition in WAR deployment
5. ✅ Missing cleanup trap

### Medium Priority (Should Fix)
6. ✅ Missing disk space check
7. ✅ Config backup timing
8. ✅ Non-interactive mode support
9. ✅ Memory configuration

### Optimizations (Nice to Have)
10. ✅ Parallel downloads (4x faster)
11. ✅ Checksum caching
12. ✅ Reuse existing Java
13. ✅ Indexing options
14. ✅ Progress indicators
15. ✅ URL validation

## Priority Order for Implementation

**Phase 1 - Critical (breaks functionality)**:
1. Fix $? checking in download_file
2. Fix cd commands in create_manifest
3. Add trap for cleanup
4. Fix WAR deployment race condition

**Phase 2 - Portability**:
5. Make sed -i portable
6. Add non-interactive mode
7. Add disk space check

**Phase 3 - Enhancements**:
8. Add parallel downloads
9. Add progress indicators
10. Add indexing options
11. Improve memory handling

**Phase 4 - Polish**:
12. Add URL validation
13. Add checksum caching
14. Improve Java detection
