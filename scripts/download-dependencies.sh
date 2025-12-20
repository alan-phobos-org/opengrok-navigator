#!/usr/bin/env bash
set -euo pipefail

#==============================================================================
# OpenGrok Dependencies Download Script
#==============================================================================
# Downloads all required dependencies for offline OpenGrok installation
#
# Usage: ./download-dependencies.sh [output_directory]
#
# Dependencies will be downloaded to ./opengrok-dependencies/ (or specified dir)
#==============================================================================

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Version configuration - update these to change versions
readonly OPENGROK_VERSION="1.13.9"
readonly CTAGS_VERSION="2025.11.27"
readonly CTAGS_COMMIT="e23bae9c83ac579c6db6fe8fea1ca48cde8b7f75"
readonly TOMCAT_VERSION="10.1.34"
readonly JDK_VERSION="11.0.25+9"

# Script options
ASSUME_YES=false
PARALLEL=false

# Detect architecture for VM (multipass uses host arch on Apple Silicon)
detect_target_arch() {
    local arch
    arch=$(uname -m)

    case "$arch" in
        aarch64|arm64)
            echo "aarch64"
            ;;
        x86_64|amd64)
            echo "x64"
            ;;
        *)
            echo "x64"  # Default to x64
            ;;
    esac
}

readonly TARGET_ARCH=$(detect_target_arch)

# Base URLs
readonly OPENGROK_BASE_URL="https://github.com/oracle/opengrok/releases/download"
readonly CTAGS_BASE_URL="https://github.com/universal-ctags/ctags-nightly-build/releases/download"
readonly TOMCAT_BASE_URL="https://archive.apache.org/dist/tomcat/tomcat-10/v${TOMCAT_VERSION}/bin"
readonly ADOPTIUM_BASE_URL="https://github.com/adoptium/temurin11-binaries/releases/download"

# Map architecture for ctags filename
CTAGS_ARCH="x86_64"
if [[ "$TARGET_ARCH" == "aarch64" ]]; then
    CTAGS_ARCH="aarch64"
fi

# Derived URLs
readonly OPENGROK_URL="${OPENGROK_BASE_URL}/${OPENGROK_VERSION}/opengrok-${OPENGROK_VERSION}.tar.gz"
readonly CTAGS_URL="${CTAGS_BASE_URL}/${CTAGS_VERSION}%2B${CTAGS_COMMIT}/uctags-${CTAGS_VERSION}-linux-${CTAGS_ARCH}.release.tar.gz"
readonly TOMCAT_URL="${TOMCAT_BASE_URL}/apache-tomcat-${TOMCAT_VERSION}.tar.gz"
readonly JDK_URL="${ADOPTIUM_BASE_URL}/jdk-${JDK_VERSION}/OpenJDK11U-jre_${TARGET_ARCH}_linux_hotspot_${JDK_VERSION/+/_}.tar.gz"

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

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "Required command '$1' not found. Please install it first."
        return 1
    fi
    return 0
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

download_file() {
    local url="$1"
    local output="$2"
    local silent="${3:-false}"  # Optional third parameter for silent mode
    local filename
    filename=$(basename "$output")

    if [[ "$silent" != "true" ]]; then
        log_info "Downloading ${filename}..."
    fi

    if [[ -f "$output" ]]; then
        log_warn "File already exists: ${filename}"
        if [[ "$ASSUME_YES" == "true" ]]; then
            log_info "Auto-overwriting (non-interactive mode)"
        else
            read -p "Overwrite? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log_info "Skipping ${filename}"
                return 0
            fi
        fi
        rm -f "$output"
    fi

    local download_status=0
    if [[ "$silent" == "true" ]]; then
        # Silent mode for parallel downloads - no progress bars
        if command -v wget &> /dev/null; then
            wget --quiet -O "$output" "$url" || download_status=$?
        elif command -v curl &> /dev/null; then
            curl -L --silent -o "$output" "$url" || download_status=$?
        else
            log_error "Neither wget nor curl found. Please install one of them."
            return 1
        fi
    else
        # Interactive mode with progress bars
        if command -v wget &> /dev/null; then
            wget --no-verbose --show-progress -O "$output" "$url" || download_status=$?
        elif command -v curl &> /dev/null; then
            curl -L --progress-bar -o "$output" "$url" || download_status=$?
        else
            log_error "Neither wget nor curl found. Please install one of them."
            return 1
        fi
    fi

    if [[ $download_status -eq 0 ]] && [[ -f "$output" ]]; then
        log_success "Downloaded ${filename} ($(du -h "$output" | cut -f1))"
        return 0
    else
        log_error "Failed to download ${filename}"
        return 1
    fi
}

# Download file in background (for parallel downloads)
download_file_bg() {
    local url="$1"
    local output="$2"
    local log_file="$3"

    {
        download_file "$url" "$output" "true" 2>&1  # Pass "true" for silent mode
        echo $? > "${output}.status"
    } > "$log_file" 2>&1
}

verify_file() {
    local filepath="$1"
    local filename
    filename=$(basename "$filepath")

    if [[ ! -f "$filepath" ]]; then
        log_error "File not found: ${filename}"
        return 1
    fi

    # Check if it's a valid tar.gz file by listing contents
    if ! tar -tzf "$filepath" >/dev/null 2>&1; then
        log_error "File appears corrupted: ${filename}"
        return 1
    fi

    log_success "Verified ${filename}"
    return 0
}

create_manifest() {
    local output_dir="$1"
    local manifest_file="${output_dir}/MANIFEST.txt"

    cat > "$manifest_file" << EOF
OpenGrok Dependencies Package
Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Downloaded from: $(hostname)

Components:
-----------
1. OpenGrok ${OPENGROK_VERSION}
   File: opengrok-${OPENGROK_VERSION}.tar.gz
   URL: ${OPENGROK_URL}

2. Universal Ctags ${CTAGS_VERSION}
   File: uctags-${CTAGS_VERSION}-linux-${CTAGS_ARCH}.release.tar.gz
   URL: ${CTAGS_URL}

3. Apache Tomcat ${TOMCAT_VERSION}
   File: apache-tomcat-${TOMCAT_VERSION}.tar.gz
   URL: ${TOMCAT_URL}

4. OpenJDK ${JDK_VERSION}
   File: OpenJDK11U-jre_${TARGET_ARCH}_linux_hotspot_${JDK_VERSION/+/_}.tar.gz
   URL: ${JDK_URL}

Files:
------
EOF

    # Add file checksums
    (
        cd "$output_dir" || exit 1
        for file in *.tar.gz; do
            if [[ -f "$file" ]]; then
                size=$(du -h "$file" | cut -f1)
                if command -v sha256sum &> /dev/null; then
                    sha256=$(sha256sum "$file" | cut -d' ' -f1)
                    echo "${file} (${size}) - SHA256: ${sha256}" >> MANIFEST.txt
                elif command -v shasum &> /dev/null; then
                    sha256=$(shasum -a 256 "$file" | cut -d' ' -f1)
                    echo "${file} (${size}) - SHA256: ${sha256}" >> MANIFEST.txt
                else
                    echo "${file} (${size})" >> MANIFEST.txt
                fi
            fi
        done
    )

    log_success "Created manifest: ${manifest_file}"
}

create_readme() {
    local output_dir="$1"
    local readme_file="${output_dir}/README.txt"

    cat > "$readme_file" << 'EOF'
OpenGrok Dependencies Package
=============================

This package contains all required dependencies for offline OpenGrok installation.

Contents:
---------
1. opengrok-*.tar.gz        - OpenGrok application
2. uctags-*.tar.gz          - Universal Ctags for code indexing
3. apache-tomcat-*.tar.gz   - Tomcat web server
4. OpenJDK11U-*.tar.gz      - Java Runtime Environment

Installation:
-------------
Transfer this entire directory to your target machine, then run:

    ./install-opengrok.sh /path/to/dependencies /path/to/source/code

Or manually:
    1. Extract each tarball to appropriate location
    2. Follow instructions in OPENGROK_OFFLINE_SETUP.md

Verification:
-------------
Check MANIFEST.txt for file sizes and checksums to verify integrity.

Next Steps:
-----------
1. Copy this directory to your offline machine
2. Prepare your source code to index
3. Run the installation script

For detailed instructions, see:
docs/OPENGROK_OFFLINE_SETUP.md in the opengrok-navigator repository
EOF

    log_success "Created README: ${readme_file}"
}

#==============================================================================
# Main
#==============================================================================

main() {
    # Parse arguments
    local output_dir="opengrok-dependencies"

    while [[ $# -gt 0 ]]; do
        case $1 in
            -y|--yes)
                ASSUME_YES=true
                shift
                ;;
            -p|--parallel)
                PARALLEL=true
                shift
                ;;
            -h|--help)
                cat << EOF
Usage: $0 [OPTIONS] [OUTPUT_DIR]

Downloads all required dependencies for offline OpenGrok installation.

OPTIONS:
  -y, --yes       Non-interactive mode (auto-confirm all prompts)
  -p, --parallel  Download files in parallel (faster)
  -h, --help      Show this help message

OUTPUT_DIR:
  Directory to download files to (default: opengrok-dependencies)

Examples:
  $0                        # Download to ./opengrok-dependencies/
  $0 my-deps                # Download to ./my-deps/
  $0 -y -p /tmp/deps        # Download to /tmp/deps/ in parallel without prompts
EOF
                exit 0
                ;;
            -*)
                log_error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
            *)
                output_dir="$1"
                shift
                ;;
        esac
    done

    # Print banner
    echo "================================================================"
    echo "  OpenGrok Dependencies Downloader"
    echo "================================================================"
    echo "  OpenGrok:  v${OPENGROK_VERSION}"
    echo "  Ctags:     v${CTAGS_VERSION}"
    echo "  Tomcat:    v${TOMCAT_VERSION}"
    echo "  OpenJDK:   ${JDK_VERSION}"
    echo "================================================================"
    echo

    # Check prerequisites
    log_info "Checking prerequisites..."
    local has_errors=0
    check_command "tar" || has_errors=1
    check_command "gunzip" || has_errors=1

    # Check for wget or curl (need at least one)
    if ! command -v wget &> /dev/null && ! command -v curl &> /dev/null; then
        log_error "Need either wget or curl to download files"
        has_errors=1
    fi

    if [[ $has_errors -eq 1 ]]; then
        log_error "Prerequisites check failed. Please install missing tools."
        exit 1
    else
        log_success "Prerequisites OK"
    fi
    echo

    # Create output directory
    if [[ ! -d "$output_dir" ]]; then
        mkdir -p "$output_dir"
        log_info "Created directory: ${output_dir}"
    fi

    # Check disk space (require 250MB for downloads)
    check_disk_space 250 "$output_dir" || exit 1
    echo

    # Download files
    if [[ "$PARALLEL" == "true" ]]; then
        log_info "Starting parallel downloads..."
    else
        log_info "Starting downloads..."
    fi
    echo

    local failed=0

    if [[ "$PARALLEL" == "true" ]]; then
        # Parallel downloads using background jobs
        local pids=()
        local files=(
            "${output_dir}/opengrok-${OPENGROK_VERSION}.tar.gz"
            "${output_dir}/uctags-${CTAGS_VERSION}-linux-${CTAGS_ARCH}.release.tar.gz"
            "${output_dir}/apache-tomcat-${TOMCAT_VERSION}.tar.gz"
            "${output_dir}/OpenJDK11U-jre_${TARGET_ARCH}_linux_hotspot_${JDK_VERSION/+/_}.tar.gz"
        )
        local urls=(
            "$OPENGROK_URL"
            "$CTAGS_URL"
            "$TOMCAT_URL"
            "$JDK_URL"
        )

        # Start all downloads in background
        for i in "${!urls[@]}"; do
            local filename=$(basename "${files[$i]}")
            log_info "Starting download: ${filename}"
            download_file_bg "${urls[$i]}" "${files[$i]}" "${files[$i]}.log" &
            pids+=($!)
        done

        # Wait for all downloads to complete
        echo
        log_info "Waiting for ${#pids[@]} parallel downloads to complete..."
        for pid in "${pids[@]}"; do
            wait "$pid" || true
        done
        echo

        # Check status of each download
        for file in "${files[@]}"; do
            if [[ -f "${file}.status" ]]; then
                local status
                status=$(cat "${file}.status")
                if [[ "$status" != "0" ]]; then
                    failed=1
                fi
                rm -f "${file}.status" "${file}.log"
            else
                failed=1
            fi
        done
    else
        # Sequential downloads
        download_file "$OPENGROK_URL" \
            "${output_dir}/opengrok-${OPENGROK_VERSION}.tar.gz" || failed=1

        download_file "$CTAGS_URL" \
            "${output_dir}/uctags-${CTAGS_VERSION}-linux-${CTAGS_ARCH}.release.tar.gz" || failed=1

        download_file "$TOMCAT_URL" \
            "${output_dir}/apache-tomcat-${TOMCAT_VERSION}.tar.gz" || failed=1

        download_file "$JDK_URL" \
            "${output_dir}/OpenJDK11U-jre_${TARGET_ARCH}_linux_hotspot_${JDK_VERSION/+/_}.tar.gz" || failed=1
    fi

    if [[ $failed -eq 1 ]]; then
        log_error "Some downloads failed. Please check errors above."
        exit 1
    fi

    echo
    log_info "Verifying downloaded files..."

    verify_file "${output_dir}/opengrok-${OPENGROK_VERSION}.tar.gz" || failed=1
    verify_file "${output_dir}/uctags-${CTAGS_VERSION}-linux-${CTAGS_ARCH}.release.tar.gz" || failed=1
    verify_file "${output_dir}/apache-tomcat-${TOMCAT_VERSION}.tar.gz" || failed=1
    verify_file "${output_dir}/OpenJDK11U-jre_${TARGET_ARCH}_linux_hotspot_${JDK_VERSION/+/_}.tar.gz" || failed=1

    if [[ $failed -eq 1 ]]; then
        log_error "File verification failed. Please re-download."
        exit 1
    fi

    echo
    log_info "Creating documentation..."
    create_manifest "$output_dir"
    create_readme "$output_dir"

    echo
    echo "================================================================"
    log_success "All dependencies downloaded successfully!"
    echo "================================================================"
    echo
    echo "Output directory: ${output_dir}"
    echo "Total size: $(du -sh "$output_dir" | cut -f1)"
    echo
    echo "Next steps:"
    echo "  1. Transfer ${output_dir}/ to your offline machine"
    echo "  2. Prepare source code to index"
    echo "  3. Run: ./install-opengrok.sh ${output_dir} /path/to/source"
    echo
    echo "Files downloaded:"
    ls -lh "$output_dir"/*.tar.gz
    echo
}

# Run main function
main "$@"
