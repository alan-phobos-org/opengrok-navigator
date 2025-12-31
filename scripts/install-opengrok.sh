#!/usr/bin/env bash
set -euo pipefail

#==============================================================================
# OpenGrok Installation Script (Offline)
#==============================================================================
# Installs OpenGrok and all dependencies from pre-downloaded files
#
# Usage: ./install-opengrok.sh <dependencies_dir> <source_code_dir> [options]
#
# Options:
#   --install-dir DIR       Base installation directory (default: /opt)
#   --data-dir DIR          OpenGrok data directory (default: /var/opengrok)
#   --port PORT             Tomcat HTTP port (default: 8080)
#   --project-name NAME     Project name (default: auto-detect from source dir)
#   --no-systemd            Skip systemd service installation
#   --skip-indexing         Skip initial indexing (index later manually)
#   -y, --yes               Non-interactive mode (auto-confirm all prompts)
#   --indexer-memory SIZE   Memory for indexer in MB (default: auto-detect)
#   --help                  Show this help message
#
# Example:
#   ./install-opengrok.sh ./opengrok-dependencies ./my-source-code
#==============================================================================

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Default configuration
INSTALL_BASE="/opt"
DATA_BASE="/var/opengrok"
TOMCAT_PORT="8080"
PROJECT_NAME=""  # Auto-detect if not specified
INSTALL_SYSTEMD=true
RUN_INDEXING=true
ASSUME_YES=false
INDEXER_MEMORY_MB=""  # Auto-detect if not specified

# Will be set from arguments
DEPS_DIR=""
SOURCE_DIR=""

# Track temporary files for cleanup
TEMP_FILES=()

#==============================================================================
# Cleanup
#==============================================================================

cleanup() {
    local exit_code=$?
    if [[ ${#TEMP_FILES[@]} -gt 0 ]]; then
        log_info "Cleaning up temporary files..."
        for temp_file in "${TEMP_FILES[@]}"; do
            if [[ -e "$temp_file" ]]; then
                rm -rf "$temp_file"
            fi
        done
    fi
    exit $exit_code
}

trap cleanup EXIT ERR INT TERM

#==============================================================================
# Functions
#==============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

# Check if a port is in use
# Returns 0 if port is in use, 1 if free
check_port_in_use() {
    local port="$1"

    # Try multiple methods to check port availability
    if command -v lsof &>/dev/null; then
        lsof -i ":${port}" -sTCP:LISTEN &>/dev/null && return 0
    fi
    if command -v ss &>/dev/null; then
        ss -tlnp 2>/dev/null | grep -q ":${port} " && return 0
    fi
    if command -v netstat &>/dev/null; then
        netstat -tlnp 2>/dev/null | grep -q ":${port} " && return 0
    fi
    # Fallback: try to connect
    if command -v nc &>/dev/null; then
        nc -z localhost "$port" 2>/dev/null && return 0
    fi

    return 1
}

# Kill any process using the specified port
# Returns 0 on success, 1 on failure
kill_port_process() {
    local port="$1"
    local pids=""

    if command -v lsof &>/dev/null; then
        pids=$(lsof -t -i ":${port}" -sTCP:LISTEN 2>/dev/null || true)
    elif command -v ss &>/dev/null; then
        pids=$(ss -tlnp 2>/dev/null | grep ":${port} " | sed -n 's/.*pid=\([0-9]*\).*/\1/p' || true)
    fi

    if [[ -n "$pids" ]]; then
        log_info "Killing processes on port ${port}: $pids"
        echo "$pids" | xargs -r kill -TERM 2>/dev/null || true
        sleep 2
        # Force kill if still running
        echo "$pids" | xargs -r kill -KILL 2>/dev/null || true
        return 0
    fi
    return 1
}

# Wait for Tomcat to be ready (HTTP responding)
# Returns 0 when ready, 1 on timeout
wait_for_tomcat() {
    local timeout="${1:-60}"
    local url="http://localhost:${TOMCAT_PORT}/"
    local elapsed=0

    # Check if we have a way to make HTTP requests
    if ! command -v curl &>/dev/null && ! command -v wget &>/dev/null; then
        log_warn "Neither curl nor wget available - falling back to port check"
        # Fall back to just checking if port is listening
        while [[ $elapsed -lt $timeout ]]; do
            if check_port_in_use "$TOMCAT_PORT"; then
                log_success "Tomcat port is listening (${elapsed}s) - assuming ready"
                return 0
            fi
            sleep 2
            elapsed=$((elapsed + 2))
        done
        log_warn "Tomcat port not listening after ${timeout}s"
        return 1
    fi

    log_info "Waiting for Tomcat to be ready (timeout: ${timeout}s)..."

    while [[ $elapsed -lt $timeout ]]; do
        local http_code=""
        # Use curl if available, otherwise wget
        if command -v curl &>/dev/null; then
            http_code=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 2 "$url" 2>/dev/null || echo "000")
        else
            # wget returns 0 on success, 8 on server error (which is still "up")
            if wget -q --spider --timeout=2 "$url" 2>/dev/null; then
                http_code="200"
            else
                http_code="000"
            fi
        fi

        if [[ "$http_code" =~ ^[234][0-9]{2}$ ]]; then
            log_success "Tomcat is ready (${elapsed}s)"
            return 0
        fi

        sleep 2
        elapsed=$((elapsed + 2))
        if [[ $((elapsed % 10)) -eq 0 ]]; then
            log_info "Still waiting for Tomcat... (${elapsed}s elapsed, last status: ${http_code})"
        fi
    done

    log_warn "Tomcat not responding after ${timeout}s"
    return 1
}

# Wait for Tomcat to fully stop
# Returns 0 when stopped, 1 on timeout
wait_for_tomcat_stop() {
    local timeout="${1:-30}"
    local elapsed=0

    log_info "Waiting for Tomcat to stop (timeout: ${timeout}s)..."

    while [[ $elapsed -lt $timeout ]]; do
        if ! check_port_in_use "$TOMCAT_PORT"; then
            log_success "Tomcat stopped (${elapsed}s)"
            return 0
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done

    log_warn "Tomcat still running after ${timeout}s"
    return 1
}

# Show Tomcat logs on failure for debugging
show_tomcat_logs() {
    local log_file="${INSTALL_BASE}/tomcat/logs/catalina.out"
    if [[ -f "$log_file" ]]; then
        log_info "Last 30 lines of Tomcat log:"
        tail -30 "$log_file" 2>/dev/null || true
    fi
}

# Ensure Tomcat is stopped before starting
# Handles stale processes and PID files
ensure_tomcat_stopped() {
    # Check if port is in use
    if check_port_in_use "$TOMCAT_PORT"; then
        log_warn "Port $TOMCAT_PORT is already in use"

        # Try graceful shutdown first
        if [[ -f "${INSTALL_BASE}/tomcat/bin/shutdown.sh" ]]; then
            log_info "Attempting graceful shutdown..."
            su - tomcat -s /bin/bash -c "${INSTALL_BASE}/tomcat/bin/shutdown.sh" 2>/dev/null || true
            if wait_for_tomcat_stop 15; then
                return 0
            fi
        fi

        # Ask user before force-killing
        if prompt_yes_no "Port $TOMCAT_PORT still in use. Force kill the process?"; then
            kill_port_process "$TOMCAT_PORT"
            sleep 2
            if ! check_port_in_use "$TOMCAT_PORT"; then
                log_success "Port $TOMCAT_PORT is now free"
                return 0
            else
                log_error "Failed to free port $TOMCAT_PORT"
                return 1
            fi
        else
            log_error "Cannot proceed with port $TOMCAT_PORT in use"
            return 1
        fi
    fi

    # Clean up stale PID file
    local pid_file="${INSTALL_BASE}/tomcat/temp/tomcat.pid"
    if [[ -f "$pid_file" ]]; then
        local pid
        pid=$(cat "$pid_file" 2>/dev/null || true)
        if [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then
            log_info "Removing stale PID file"
            rm -f "$pid_file"
        fi
    fi

    return 0
}

# Prompt user for yes/no confirmation (respects ASSUME_YES)
# Returns 0 for yes, 1 for no
prompt_yes_no() {
    local message="$1"

    if [[ "$ASSUME_YES" == "true" ]]; then
        log_info "${message} Auto-confirmed (non-interactive mode)"
        return 0
    fi

    read -p "${message} (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        return 0
    else
        return 1
    fi
}

# Portable sed in-place editing (works on both Linux and macOS)
sed_inplace() {
    local pattern="$1"
    local file="$2"

    if sed --version &>/dev/null 2>&1; then
        # GNU sed (Linux)
        sed -i "$pattern" "$file"
    else
        # BSD sed (macOS)
        sed -i '' "$pattern" "$file"
    fi
}

show_help() {
    sed -n '3,17p' "$0" | sed 's/^# //' | sed 's/^#//'
    exit 0
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

check_disk_space() {
    local required_mb="$1"
    local path="$2"

    # Get available space in MB
    # Check parent directory if path doesn't exist yet
    local check_path="$path"
    if [[ ! -e "$path" ]]; then
        check_path="$(dirname "$path")"
    fi

    local available_mb
    available_mb=$(df -m "$check_path" | awk 'NR==2 {print $4}')

    if [[ $available_mb -lt $required_mb ]]; then
        log_error "Insufficient disk space on $path"
        log_error "Required: ${required_mb}MB, Available: ${available_mb}MB"
        return 1
    fi

    log_info "Disk space check: ${available_mb}MB available (${required_mb}MB required)"
    return 0
}

detect_memory() {
    local total_mb

    # Detect OS and get total memory in MB
    if [[ -f /proc/meminfo ]]; then
        # Linux
        total_mb=$(awk '/MemTotal/ {printf "%.0f", $2/1024}' /proc/meminfo)
    elif command -v sysctl &> /dev/null; then
        # macOS/BSD
        local total_bytes
        total_bytes=$(sysctl -n hw.memsize 2>/dev/null || sysctl -n hw.physmem 2>/dev/null)
        total_mb=$((total_bytes / 1024 / 1024))
    else
        log_warn "Cannot detect system memory - defaulting to 2048MB for indexer" >&2
        echo "2048"
        return 0
    fi

    # Allocate 50% of total memory for indexer (min 512MB, max 8192MB)
    local indexer_mb=$((total_mb / 2))
    if [[ $indexer_mb -lt 512 ]]; then
        indexer_mb=512
    elif [[ $indexer_mb -gt 8192 ]]; then
        indexer_mb=8192
    fi

    log_info "System memory: ${total_mb}MB, Allocating ${indexer_mb}MB for indexer" >&2
    echo "$indexer_mb"
}

show_progress() {
    local current="$1"
    local total="$2"
    local message="$3"
    local percent=$((current * 100 / total))

    printf "\r${BLUE}[%3d%%]${NC} %s" "$percent" "$message"

    if [[ $current -eq $total ]]; then
        echo  # New line when complete
    fi
}

check_dependencies_dir() {
    local dir="$1"

    if [[ ! -d "$dir" ]]; then
        log_error "Dependencies directory not found: $dir"
        return 1
    fi

    # Check for required files (support both uctags and ctags naming)
    local required_patterns=(
        "opengrok-*.tar.gz"
        "apache-tomcat-*.tar.gz"
        "OpenJDK*.tar.gz"
    )

    for pattern in "${required_patterns[@]}"; do
        if ! ls "$dir"/$pattern 1> /dev/null 2>&1; then
            log_error "Missing required file: $pattern in $dir"
            return 1
        fi
    done

    # Check for ctags (support both uctags and ctags naming)
    if ! ls "$dir"/uctags-*.tar.gz 1> /dev/null 2>&1 && ! ls "$dir"/ctags-*.tar.gz 1> /dev/null 2>&1; then
        log_error "Missing required file: uctags-*.tar.gz or ctags-*.tar.gz in $dir"
        return 1
    fi

    return 0
}

check_source_dir() {
    local dir="$1"

    if [[ ! -d "$dir" ]]; then
        log_error "Source directory not found: $dir"
        return 1
    fi

    if [[ -z "$(ls -A "$dir")" ]]; then
        log_warn "Source directory is empty: $dir"
        log_warn "You can add source code later and re-run indexing"
    fi

    return 0
}

detect_project_name() {
    local src_dir="$1"
    local project_name

    # Use basename of source directory as project name
    project_name=$(basename "$src_dir")

    # If it's a temp directory or generic name, try to find a better name
    if [[ "$project_name" =~ ^tmp\. ]] || [[ "$project_name" == "source-code" ]]; then
        # Use the first directory name in source root as project name
        local first_dir=$(find "$src_dir" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | head -1)
        if [[ -n "$first_dir" ]]; then
            project_name="$first_dir"
        fi
    fi

    echo "$project_name"
}

extract_tarball() {
    local tarball="$1"
    local dest_dir="$2"
    local strip_components="${3:-1}"

    log_info "Extracting $(basename "$tarball")..."

    mkdir -p "$dest_dir"

    # Show progress for extraction
    if command -v pv &> /dev/null; then
        # Use pv if available for progress bar
        pv "$tarball" | tar -xzf - -C "$dest_dir" --strip-components="$strip_components"
    else
        # Otherwise just extract with verbose output suppressed
        tar -xzf "$tarball" -C "$dest_dir" --strip-components="$strip_components" &
        local tar_pid=$!

        # Show spinner while extracting
        local spin='-\|/'
        local i=0
        while kill -0 $tar_pid 2>/dev/null; do
            i=$(( (i+1) % 4 ))
            printf "\r${BLUE}[%c]${NC} Extracting..." "${spin:$i:1}"
            sleep 0.1
        done
        wait $tar_pid
        printf "\r"
    fi

    if [[ $? -eq 0 ]]; then
        log_success "Extracted to $dest_dir"
        return 0
    else
        log_error "Failed to extract $tarball"
        return 1
    fi
}

install_java() {
    local deps_dir="$1"
    local java_tarball
    java_tarball=$(ls "$deps_dir"/OpenJDK*.tar.gz | head -1)

    if [[ -z "$java_tarball" ]]; then
        log_error "Java tarball not found in $deps_dir"
        return 1
    fi

    log_info "Installing Java..."

    # Check if Java is already installed
    if command -v java &> /dev/null; then
        local java_version
        java_version=$(java -version 2>&1 | head -1)
        log_warn "Java already installed: $java_version"
        if ! prompt_yes_no "Overwrite with bundled version?"; then
            log_info "Keeping existing Java installation"
            # Still set JAVA_HOME for current session
            if [[ -d "${INSTALL_BASE}/java" ]]; then
                export JAVA_HOME="${INSTALL_BASE}/java"
                export PATH="$JAVA_HOME/bin:$PATH"
            fi
            return 0
        fi
        rm -rf "${INSTALL_BASE}/java"
    fi

    extract_tarball "$java_tarball" "${INSTALL_BASE}/java" 1

    # Set JAVA_HOME in profile
    if ! grep -q "JAVA_HOME=${INSTALL_BASE}/java" /etc/profile.d/java.sh 2>/dev/null; then
        cat > /etc/profile.d/java.sh << EOF
export JAVA_HOME=${INSTALL_BASE}/java
export PATH=\$JAVA_HOME/bin:\$PATH
EOF
        chmod +x /etc/profile.d/java.sh
        log_success "Created /etc/profile.d/java.sh"
    fi

    # Source for current session
    export JAVA_HOME="${INSTALL_BASE}/java"
    export PATH="$JAVA_HOME/bin:$PATH"

    # Verify installation
    if "${JAVA_HOME}/bin/java" -version &> /dev/null; then
        log_success "Java installed successfully"
        "${JAVA_HOME}/bin/java" -version 2>&1 | head -1
        return 0
    else
        log_error "Java installation verification failed"
        return 1
    fi
}

install_ctags() {
    local deps_dir="$1"
    local ctags_tarball
    ctags_tarball=$(ls "$deps_dir"/uctags-*.tar.gz 2>/dev/null || ls "$deps_dir"/ctags-*.tar.gz 2>/dev/null | head -1)

    if [[ -z "$ctags_tarball" ]]; then
        log_error "Ctags tarball not found in $deps_dir (looking for uctags-*.tar.gz or ctags-*.tar.gz)"
        return 1
    fi

    log_info "Installing Universal Ctags..."

    # Extract to temp directory
    local temp_dir
    temp_dir=$(mktemp -d)
    TEMP_FILES+=("$temp_dir")  # Register for cleanup
    tar -xzf "$ctags_tarball" -C "$temp_dir"

    # Find the ctags binary
    local ctags_bin
    ctags_bin=$(find "$temp_dir" -name ctags -type f | head -1)

    if [[ -z "$ctags_bin" ]]; then
        log_error "Ctags binary not found in tarball"
        return 1
    fi

    # Install to /usr/local/bin
    cp "$ctags_bin" /usr/local/bin/ctags
    chmod +x /usr/local/bin/ctags

    # Cleanup will happen via trap

    # Verify installation
    if ctags --version &> /dev/null; then
        log_success "Ctags installed successfully"
        ctags --version | head -1
        return 0
    else
        log_error "Ctags installation verification failed"
        return 1
    fi
}

install_tomcat() {
    local deps_dir="$1"
    local tomcat_tarball
    tomcat_tarball=$(ls "$deps_dir"/apache-tomcat-*.tar.gz | head -1)

    if [[ -z "$tomcat_tarball" ]]; then
        log_error "Tomcat tarball not found in $deps_dir"
        return 1
    fi

    log_info "Installing Apache Tomcat..."

    if [[ -d "${INSTALL_BASE}/tomcat" ]]; then
        log_warn "Tomcat directory already exists"
        if prompt_yes_no "Remove and reinstall?"; then
            rm -rf "${INSTALL_BASE}/tomcat"
        else
            log_info "Keeping existing Tomcat installation"
            return 0
        fi
    fi

    extract_tarball "$tomcat_tarball" "${INSTALL_BASE}/tomcat" 1

    # Make scripts executable
    chmod +x "${INSTALL_BASE}/tomcat/bin/"*.sh

    # Create tomcat user
    if ! id tomcat &> /dev/null; then
        useradd -r -m -U -d "${INSTALL_BASE}/tomcat" -s /bin/false tomcat
        log_success "Created tomcat user"
    fi

    # Set permissions
    chown -R tomcat:tomcat "${INSTALL_BASE}/tomcat"

    # Configure port if not default
    if [[ "$TOMCAT_PORT" != "8080" ]]; then
        sed_inplace "s/port=\"8080\"/port=\"$TOMCAT_PORT\"/" \
            "${INSTALL_BASE}/tomcat/conf/server.xml"
        log_info "Configured Tomcat port: $TOMCAT_PORT"
    fi

    log_success "Tomcat installed successfully"
    return 0
}

install_opengrok() {
    local deps_dir="$1"
    local opengrok_tarball
    opengrok_tarball=$(ls "$deps_dir"/opengrok-*.tar.gz | head -1)

    if [[ -z "$opengrok_tarball" ]]; then
        log_error "OpenGrok tarball not found in $deps_dir"
        return 1
    fi

    log_info "Installing OpenGrok..."

    if [[ -d "${INSTALL_BASE}/opengrok" ]]; then
        log_warn "OpenGrok directory already exists"
        if prompt_yes_no "Remove and reinstall?"; then
            rm -rf "${INSTALL_BASE}/opengrok"
        else
            log_info "Keeping existing OpenGrok installation"
            return 0
        fi
    fi

    extract_tarball "$opengrok_tarball" "${INSTALL_BASE}/opengrok" 1

    # Create data directories
    mkdir -p "${DATA_BASE}/src"
    mkdir -p "${DATA_BASE}/data"
    mkdir -p "${DATA_BASE}/etc"

    # Set permissions for tomcat user (create user first if needed)
    if ! id tomcat &> /dev/null; then
        useradd -r -m -U -d "${INSTALL_BASE}/tomcat" -s /bin/false tomcat || true
    fi
    chown -R tomcat:tomcat "$DATA_BASE"

    log_success "OpenGrok installed successfully"
    return 0
}

deploy_webapp() {
    log_info "Deploying OpenGrok web application..."

    # Ensure no stale Tomcat is running
    ensure_tomcat_stopped || {
        log_error "Cannot deploy webapp - failed to stop existing Tomcat"
        return 1
    }

    # Copy WAR file to Tomcat
    if [[ ! -f "${INSTALL_BASE}/opengrok/lib/source.war" ]]; then
        log_error "WAR file not found: ${INSTALL_BASE}/opengrok/lib/source.war"
        return 1
    fi
    cp "${INSTALL_BASE}/opengrok/lib/source.war" \
       "${INSTALL_BASE}/tomcat/webapps/"
    chown tomcat:tomcat "${INSTALL_BASE}/tomcat/webapps/source.war"

    # Start Tomcat to auto-deploy
    log_info "Starting Tomcat to deploy WAR..."
    if ! su - tomcat -s /bin/bash -c "${INSTALL_BASE}/tomcat/bin/startup.sh" 2>&1; then
        log_error "Failed to start Tomcat"
        show_tomcat_logs
        return 1
    fi

    # Wait for Tomcat to be fully ready (HTTP responding)
    if ! wait_for_tomcat 90; then
        log_error "Tomcat failed to start"
        show_tomcat_logs
        # Try to stop it anyway
        su - tomcat -s /bin/bash -c "${INSTALL_BASE}/tomcat/bin/shutdown.sh" 2>/dev/null || true
        return 1
    fi

    # Wait for deployment with timeout
    local web_xml="${INSTALL_BASE}/tomcat/webapps/source/WEB-INF/web.xml"
    local timeout=90
    local elapsed=0
    log_info "Waiting for WAR deployment (timeout: ${timeout}s)..."

    while [[ ! -f "$web_xml" ]] && [[ $elapsed -lt $timeout ]]; do
        sleep 2
        elapsed=$((elapsed + 2))
        if [[ $((elapsed % 10)) -eq 0 ]]; then
            log_info "Still waiting for WAR extraction... (${elapsed}s elapsed)"
        fi
    done

    local deployment_ok=false
    if [[ -f "$web_xml" ]]; then
        # Give it a couple more seconds for full deployment
        sleep 3
        log_success "WAR deployed successfully (${elapsed}s)"
        deployment_ok=true
    else
        log_error "WAR deployment timeout - web.xml not found after ${timeout}s"
        show_tomcat_logs
    fi

    # Stop Tomcat and wait for it to fully stop
    log_info "Stopping Tomcat..."
    su - tomcat -s /bin/bash -c "${INSTALL_BASE}/tomcat/bin/shutdown.sh" 2>/dev/null || true

    if ! wait_for_tomcat_stop 30; then
        log_warn "Tomcat did not stop gracefully, forcing..."
        kill_port_process "$TOMCAT_PORT"
        sleep 2
    fi

    if [[ "$deployment_ok" == true ]] && [[ -f "$web_xml" ]]; then
        # Backup original
        cp "$web_xml" "${web_xml}.bak"

        # Add configuration parameter
        if ! grep -q "CONFIGURATION" "$web_xml"; then
            # Insert before </web-app>
            sed_inplace "/<\/web-app>/i\\    <context-param>\n        <param-name>CONFIGURATION</param-name>\n        <param-value>${DATA_BASE}/etc/configuration.xml</param-value>\n    </context-param>" "$web_xml"
            log_success "Configured web.xml"
        fi
    else
        log_error "WAR deployment failed"
        return 1
    fi

    return 0
}

setup_source_code() {
    local source_dir="$1"

    log_info "Setting up source code..."

    # Detect or use provided project name
    local project_name
    if [[ -n "$PROJECT_NAME" ]]; then
        project_name="$PROJECT_NAME"
        log_info "Using provided project name: $project_name"
    else
        project_name=$(detect_project_name "$source_dir")
        log_info "Detected project name: $project_name"
    fi

    # Create project directory
    local project_dir="${DATA_BASE}/src/${project_name}"

    if [[ -d "$project_dir" ]]; then
        log_warn "Project directory already exists: $project_dir"
        if prompt_yes_no "Remove and recreate?"; then
            rm -rf "$project_dir"
        else
            log_info "Keeping existing project directory"
            return 0
        fi
    fi

    # Copy or link source code
    log_info "Copying source code to $project_dir..."
    mkdir -p "$project_dir"
    cp -r "$source_dir"/. "$project_dir/"

    # Set permissions
    chown -R "$USER:$USER" "${DATA_BASE}/src"

    log_success "Source code ready: $project_dir"
    return 0
}

run_indexer() {
    log_info "Running OpenGrok indexer..."
    log_warn "This may take a while depending on source code size..."

    # Ensure JAVA_HOME is set
    export JAVA_HOME="${INSTALL_BASE}/java"
    export PATH="$JAVA_HOME/bin:$PATH"

    # Auto-detect memory if not specified
    local memory_mb="$INDEXER_MEMORY_MB"
    if [[ -z "$memory_mb" ]]; then
        memory_mb=$(detect_memory)
    fi

    log_info "Using ${memory_mb}MB memory for indexer"

    # Run indexer with memory settings
    if "${JAVA_HOME}/bin/java" \
        -Xmx${memory_mb}m \
        -jar "${INSTALL_BASE}/opengrok/lib/opengrok.jar" \
        -c /usr/local/bin/ctags \
        -s "${DATA_BASE}/src" \
        -d "${DATA_BASE}/data" \
        -H -P -S -G \
        -W "${DATA_BASE}/etc/configuration.xml"; then
        log_success "Indexing completed successfully"
        return 0
    else
        log_error "Indexing failed"
        return 1
    fi
}

install_systemd_service() {
    log_info "Creating systemd service..."

    cat > /etc/systemd/system/tomcat.service << EOF
[Unit]
Description=Apache Tomcat Web Application Container for OpenGrok
After=network.target

[Service]
Type=forking
PIDFile=${INSTALL_BASE}/tomcat/temp/tomcat.pid

Environment="JAVA_HOME=${INSTALL_BASE}/java"
Environment="CATALINA_PID=${INSTALL_BASE}/tomcat/temp/tomcat.pid"
Environment="CATALINA_HOME=${INSTALL_BASE}/tomcat"
Environment="CATALINA_BASE=${INSTALL_BASE}/tomcat"

ExecStart=${INSTALL_BASE}/tomcat/bin/startup.sh
ExecStop=${INSTALL_BASE}/tomcat/bin/shutdown.sh

# Startup/shutdown timeouts
TimeoutStartSec=90
TimeoutStopSec=30

# Clean up stale PID file before starting
ExecStartPre=/bin/bash -c 'rm -f ${INSTALL_BASE}/tomcat/temp/tomcat.pid'

User=tomcat
Group=tomcat
UMask=0007
RestartSec=10
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd
    systemctl daemon-reload

    # Enable service
    systemctl enable tomcat

    log_success "Systemd service created and enabled"
    return 0
}

start_opengrok() {
    log_info "Starting OpenGrok..."

    # Ensure no stale Tomcat is running first
    ensure_tomcat_stopped || {
        log_error "Cannot start OpenGrok - failed to stop existing Tomcat"
        return 1
    }

    if [[ "$INSTALL_SYSTEMD" == true ]] && command -v systemctl &> /dev/null; then
        # Check if service file exists
        if [[ ! -f /etc/systemd/system/tomcat.service ]]; then
            log_warn "Systemd service not found, starting directly"
        else
            if ! systemctl start tomcat; then
                log_error "systemctl start tomcat failed"
                journalctl -u tomcat -n 30 --no-pager 2>/dev/null || true
                show_tomcat_logs
                return 1
            fi

            # Wait for Tomcat to be actually ready (HTTP responding)
            if wait_for_tomcat 90; then
                log_success "OpenGrok started via systemd"
                return 0
            else
                log_error "Failed to start via systemd - Tomcat not responding"
                journalctl -u tomcat -n 30 --no-pager 2>/dev/null || true
                show_tomcat_logs
                return 1
            fi
        fi
    fi

    # Start directly (non-systemd or systemd service not found)
    log_info "Starting Tomcat directly..."
    if ! su - tomcat -s /bin/bash -c "${INSTALL_BASE}/tomcat/bin/startup.sh" 2>&1; then
        log_error "Failed to execute startup.sh"
        show_tomcat_logs
        return 1
    fi

    # Wait for Tomcat to be actually ready (HTTP responding)
    if wait_for_tomcat 90; then
        log_success "OpenGrok started"
        return 0
    else
        log_error "Tomcat failed to become ready"
        show_tomcat_logs
        return 1
    fi
}

print_summary() {
    local source_dir="$1"
    local project_name
    project_name=$(detect_project_name "$source_dir")

    echo
    echo "================================================================"
    log_success "OpenGrok installation completed!"
    echo "================================================================"
    echo
    echo "Installation paths:"
    echo "  Java:      ${INSTALL_BASE}/java"
    echo "  Ctags:     /usr/local/bin/ctags"
    echo "  Tomcat:    ${INSTALL_BASE}/tomcat"
    echo "  OpenGrok:  ${INSTALL_BASE}/opengrok"
    echo "  Data:      ${DATA_BASE}"
    echo "  Source:    ${DATA_BASE}/src/${project_name}"
    echo
    echo "Access OpenGrok:"
    echo "  http://localhost:${TOMCAT_PORT}/source"
    echo
    echo "Management:"
    if [[ "$INSTALL_SYSTEMD" == true ]]; then
        echo "  Start:    sudo systemctl start tomcat"
        echo "  Stop:     sudo systemctl stop tomcat"
        echo "  Status:   sudo systemctl status tomcat"
        echo "  Logs:     sudo journalctl -u tomcat -f"
    else
        echo "  Start:    sudo su - tomcat -s /bin/bash -c '${INSTALL_BASE}/tomcat/bin/startup.sh'"
        echo "  Stop:     sudo su - tomcat -s /bin/bash -c '${INSTALL_BASE}/tomcat/bin/shutdown.sh'"
        echo "  Logs:     tail -f ${INSTALL_BASE}/tomcat/logs/catalina.out"
    fi
    echo
    echo "Re-index source code:"
    local memory_example="${INDEXER_MEMORY_MB}"
    if [[ -z "$memory_example" ]]; then
        memory_example=$(detect_memory)
    fi
    echo "  sudo ${JAVA_HOME:-${INSTALL_BASE}/java}/bin/java \\"
    echo "    -Xmx${memory_example}m \\"
    echo "    -jar ${INSTALL_BASE}/opengrok/lib/opengrok.jar \\"
    echo "    -c /usr/local/bin/ctags \\"
    echo "    -s ${DATA_BASE}/src \\"
    echo "    -d ${DATA_BASE}/data \\"
    echo "    -H -P -S -G \\"
    echo "    -W ${DATA_BASE}/etc/configuration.xml"
    echo
}

#==============================================================================
# Main
#==============================================================================

main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --install-dir)
                INSTALL_BASE="$2"
                shift 2
                ;;
            --data-dir)
                DATA_BASE="$2"
                shift 2
                ;;
            --port)
                TOMCAT_PORT="$2"
                shift 2
                ;;
            --project-name)
                PROJECT_NAME="$2"
                shift 2
                ;;
            --indexer-memory)
                INDEXER_MEMORY_MB="$2"
                shift 2
                ;;
            --no-systemd)
                INSTALL_SYSTEMD=false
                shift
                ;;
            --skip-indexing)
                RUN_INDEXING=false
                shift
                ;;
            -y|--yes)
                ASSUME_YES=true
                shift
                ;;
            --help|-h)
                show_help
                ;;
            -*)
                log_error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
            *)
                if [[ -z "$DEPS_DIR" ]]; then
                    DEPS_DIR="$1"
                elif [[ -z "$SOURCE_DIR" ]]; then
                    SOURCE_DIR="$1"
                else
                    log_error "Too many arguments"
                    echo "Use --help for usage information"
                    exit 1
                fi
                shift
                ;;
        esac
    done

    # Validate required arguments
    if [[ -z "$DEPS_DIR" ]] || [[ -z "$SOURCE_DIR" ]]; then
        log_error "Missing required arguments"
        echo
        show_help
    fi

    # Print banner
    echo "================================================================"
    echo "  OpenGrok Offline Installation"
    echo "================================================================"
    echo "  Dependencies: $DEPS_DIR"
    echo "  Source code:  $SOURCE_DIR"
    echo "  Install to:   $INSTALL_BASE"
    echo "  Data dir:     $DATA_BASE"
    echo "  HTTP port:    $TOMCAT_PORT"
    echo "================================================================"
    echo

    # Check if running as root
    check_root

    # Pre-flight checks
    log_info "Running pre-flight checks..."

    # Check for required commands
    local missing_cmds=()
    for cmd in tar gzip; do
        if ! command -v "$cmd" &>/dev/null; then
            missing_cmds+=("$cmd")
        fi
    done
    if [[ ${#missing_cmds[@]} -gt 0 ]]; then
        log_error "Missing required commands: ${missing_cmds[*]}"
        exit 1
    fi

    # Check if port is already in use
    if check_port_in_use "$TOMCAT_PORT"; then
        log_warn "Port $TOMCAT_PORT is already in use"
        if prompt_yes_no "Attempt to stop the process using port $TOMCAT_PORT?"; then
            kill_port_process "$TOMCAT_PORT"
            sleep 2
            if check_port_in_use "$TOMCAT_PORT"; then
                log_error "Failed to free port $TOMCAT_PORT - cannot proceed"
                exit 1
            fi
            log_success "Port $TOMCAT_PORT is now free"
        else
            log_error "Port $TOMCAT_PORT must be free to proceed"
            exit 1
        fi
    fi

    # Check disk space (require 2GB for installation)
    check_disk_space 2048 "$INSTALL_BASE" || exit 1
    check_disk_space 2048 "$DATA_BASE" || exit 1

    # Validate directories
    log_info "Validating directories..."
    if ! check_dependencies_dir "$DEPS_DIR"; then
        exit 1
    fi
    if ! check_source_dir "$SOURCE_DIR"; then
        exit 1
    fi
    log_success "Directory validation passed"
    echo

    # Installation progress tracking
    local total_steps=7
    local current_step=0

    # Install components
    current_step=$((current_step + 1))
    show_progress "$current_step" "$total_steps" "Installing Java (step $current_step/$total_steps)"
    install_java "$DEPS_DIR" || exit 1
    echo

    current_step=$((current_step + 1))
    show_progress "$current_step" "$total_steps" "Installing Ctags (step $current_step/$total_steps)"
    install_ctags "$DEPS_DIR" || exit 1
    echo

    current_step=$((current_step + 1))
    show_progress "$current_step" "$total_steps" "Installing Tomcat (step $current_step/$total_steps)"
    install_tomcat "$DEPS_DIR" || exit 1
    echo

    current_step=$((current_step + 1))
    show_progress "$current_step" "$total_steps" "Installing OpenGrok (step $current_step/$total_steps)"
    install_opengrok "$DEPS_DIR" || exit 1
    echo

    current_step=$((current_step + 1))
    show_progress "$current_step" "$total_steps" "Deploying web application (step $current_step/$total_steps)"
    deploy_webapp || exit 1
    echo

    current_step=$((current_step + 1))
    show_progress "$current_step" "$total_steps" "Setting up source code (step $current_step/$total_steps)"
    setup_source_code "$SOURCE_DIR" || exit 1
    echo

    # Run indexing
    if [[ "$RUN_INDEXING" == true ]]; then
        current_step=$((current_step + 1))
        show_progress "$current_step" "$total_steps" "Running indexer (step $current_step/$total_steps)"
        run_indexer || log_warn "Indexing failed - you can run it manually later"
        echo
    else
        log_info "Skipping indexing (use --skip-indexing was specified)"
        echo
    fi

    # Install systemd service
    if [[ "$INSTALL_SYSTEMD" == true ]]; then
        install_systemd_service || log_warn "Systemd service installation failed"
        echo
    fi

    # Start OpenGrok
    log_info "Starting OpenGrok..."
    start_opengrok || log_warn "Failed to start OpenGrok - start manually"

    # Print summary
    print_summary "$SOURCE_DIR"
}

# Run main function
main "$@"
