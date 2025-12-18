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
    local available_mb
    available_mb=$(df -m "$path" | awk 'NR==2 {print $4}')

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
        log_warn "Cannot detect system memory - defaulting to 2048MB for indexer"
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

    log_info "System memory: ${total_mb}MB, Allocating ${indexer_mb}MB for indexer"
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

    # Check for required files
    local required_files=(
        "opengrok-*.tar.gz"
        "ctags-*.tar.gz"
        "apache-tomcat-*.tar.gz"
        "OpenJDK*.tar.gz"
    )

    for pattern in "${required_files[@]}"; do
        if ! ls "$dir"/$pattern 1> /dev/null 2>&1; then
            log_error "Missing required file: $pattern in $dir"
            return 1
        fi
    done

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

    # Use the first directory name in source root as project name
    project_name=$(find "$src_dir" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | head -1)

    if [[ -z "$project_name" ]]; then
        # If no subdirectories, use basename of source dir
        project_name=$(basename "$src_dir")
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
    ctags_tarball=$(ls "$deps_dir"/ctags-*.tar.gz | head -1)

    if [[ -z "$ctags_tarball" ]]; then
        log_error "Ctags tarball not found in $deps_dir"
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

    # Set permissions
    chown -R "$USER:$USER" "$DATA_BASE"

    log_success "OpenGrok installed successfully"
    return 0
}

deploy_webapp() {
    log_info "Deploying OpenGrok web application..."

    # Copy WAR file to Tomcat
    cp "${INSTALL_BASE}/opengrok/lib/source.war" \
       "${INSTALL_BASE}/tomcat/webapps/"

    # Start Tomcat to auto-deploy
    log_info "Starting Tomcat to deploy WAR..."
    su - tomcat -s /bin/bash -c "${INSTALL_BASE}/tomcat/bin/startup.sh" || true

    # Wait for deployment with timeout
    local web_xml="${INSTALL_BASE}/tomcat/webapps/source/WEB-INF/web.xml"
    local timeout=60
    local elapsed=0
    log_info "Waiting for WAR deployment (timeout: ${timeout}s)..."

    while [[ ! -f "$web_xml" ]] && [[ $elapsed -lt $timeout ]]; do
        sleep 2
        elapsed=$((elapsed + 2))
        if [[ $((elapsed % 10)) -eq 0 ]]; then
            log_info "Still waiting... (${elapsed}s elapsed)"
        fi
    done

    if [[ ! -f "$web_xml" ]]; then
        log_warn "WAR deployment timeout - web.xml not found after ${timeout}s"
    else
        log_success "WAR deployed successfully (${elapsed}s)"
    fi

    # Stop Tomcat
    log_info "Stopping Tomcat..."
    su - tomcat -s /bin/bash -c "${INSTALL_BASE}/tomcat/bin/shutdown.sh" || true
    sleep 5

    if [[ -f "$web_xml" ]]; then
        # Backup original
        cp "$web_xml" "${web_xml}.bak"

        # Add configuration parameter
        if ! grep -q "CONFIGURATION" "$web_xml"; then
            # Insert before </web-app>
            sed_inplace "/<\/web-app>/i\\    <context-param>\n        <param-name>CONFIGURATION</param-name>\n        <param-value>${DATA_BASE}/etc/configuration.xml</param-value>\n    </context-param>" "$web_xml"
            log_success "Configured web.xml"
        fi
    else
        log_warn "web.xml not found - WAR may not be deployed yet"
    fi

    return 0
}

setup_source_code() {
    local source_dir="$1"

    log_info "Setting up source code..."

    # Detect project name
    local project_name
    project_name=$(detect_project_name "$source_dir")
    log_info "Detected project: $project_name"

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
    cp -r "$source_dir" "$project_dir"

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
    "${JAVA_HOME}/bin/java" \
        -Xmx${memory_mb}m \
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

Environment="JAVA_HOME=${INSTALL_BASE}/java"
Environment="CATALINA_PID=${INSTALL_BASE}/tomcat/temp/tomcat.pid"
Environment="CATALINA_HOME=${INSTALL_BASE}/tomcat"
Environment="CATALINA_BASE=${INSTALL_BASE}/tomcat"

ExecStart=${INSTALL_BASE}/tomcat/bin/startup.sh
ExecStop=${INSTALL_BASE}/tomcat/bin/shutdown.sh

User=tomcat
Group=tomcat
UMask=0007
RestartSec=10
Restart=always

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

    if [[ "$INSTALL_SYSTEMD" == true ]] && command -v systemctl &> /dev/null; then
        systemctl start tomcat

        # Wait for startup
        sleep 5

        if systemctl is-active --quiet tomcat; then
            log_success "OpenGrok started via systemd"
            return 0
        else
            log_error "Failed to start via systemd"
            journalctl -u tomcat -n 20 --no-pager
            return 1
        fi
    else
        # Start directly
        su - tomcat -s /bin/bash -c "${INSTALL_BASE}/tomcat/bin/startup.sh"
        sleep 5
        log_success "OpenGrok started"
        return 0
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
