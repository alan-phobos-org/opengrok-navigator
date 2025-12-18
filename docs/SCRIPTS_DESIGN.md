# OpenGrok Installation Scripts - Design Document

## Overview

Two production-ready bash scripts for automated offline OpenGrok installation:

1. **download-dependencies.sh** - Downloads all dependencies (internet-connected machine)
2. **install-opengrok.sh** - Installs OpenGrok from dependencies (target machine)

## Design Principles

### 1. Error Handling
- **Fail fast**: `set -euo pipefail` catches all errors
- **Validation**: Every input is validated before use
- **Clear messages**: Color-coded output (INFO, SUCCESS, WARN, ERROR)
- **Exit codes**: Proper exit codes for scripting
- **Rollback-friendly**: Prompts before overwriting existing installations

### 2. Maintainability
- **Version centralization**: All versions defined at top of script
- **Function-based**: Each task is a self-contained function
- **Constants**: Readonly variables for configuration
- **Comments**: Clear section markers and documentation
- **DRY principle**: Reusable functions (log_*, check_*)

### 3. Safety
- **Root check**: Install script requires sudo
- **Confirmation prompts**: Asks before destructive operations
- **Backup preservation**: Creates .bak files before modifications
- **User control**: Flags to skip optional steps
- **Non-destructive defaults**: Preserves existing installations unless confirmed

### 4. Flexibility
- **Configurable paths**: All directories can be overridden
- **Optional features**: Systemd and indexing can be skipped
- **Version updates**: Easy to change versions at script top
- **Platform agnostic**: Works on any Linux with bash

## Script Architecture

### download-dependencies.sh

```
┌─────────────────────────────────────┐
│         Main Function               │
├─────────────────────────────────────┤
│ 1. Parse arguments                  │
│ 2. Check prerequisites (wget/curl)  │
│ 3. Create output directory          │
│ 4. Download each component          │
│ 5. Verify file integrity            │
│ 6. Create manifest & README         │
│ 7. Print summary                    │
└─────────────────────────────────────┘

Helper Functions:
├── log_*()            - Colored output
├── check_command()    - Verify tool availability
├── download_file()    - Download with progress
├── verify_file()      - Check gzip integrity
├── create_manifest()  - Generate checksums
└── create_readme()    - Generate docs
```

### install-opengrok.sh

```
┌──────────────────────────────────────┐
│          Main Function               │
├──────────────────────────────────────┤
│  1. Parse arguments & options        │
│  2. Validate directories             │
│  3. Install Java                     │
│  4. Install Ctags                    │
│  5. Install Tomcat                   │
│  6. Install OpenGrok                 │
│  7. Deploy webapp                    │
│  8. Setup source code                │
│  9. Run indexer (optional)           │
│ 10. Install systemd service (opt)    │
│ 11. Start OpenGrok                   │
│ 12. Print summary                    │
└──────────────────────────────────────┘

Helper Functions:
├── check_root()               - Require sudo
├── check_dependencies_dir()   - Validate deps
├── check_source_dir()         - Validate source
├── detect_project_name()      - Auto-detect project
├── extract_tarball()          - Extract with verification
├── install_java()             - Java setup + JAVA_HOME
├── install_ctags()            - Ctags binary install
├── install_tomcat()           - Tomcat + user setup
├── install_opengrok()         - OpenGrok extraction
├── deploy_webapp()            - WAR deployment + config
├── setup_source_code()        - Copy source to data dir
├── run_indexer()              - OpenGrok indexing
├── install_systemd_service()  - Service creation
├── start_opengrok()           - Systemd or manual start
└── print_summary()            - Usage instructions
```

## Error Handling Strategy

### Validation Stages

**Stage 1: Prerequisites**
```bash
# Check required commands exist
check_command "wget" || check_command "curl" || exit 1
check_command "tar" || exit 1
check_command "gunzip" || exit 1
```

**Stage 2: Directory Validation**
```bash
# Validate dependencies directory contains required files
for pattern in required_files; do
    ls $dir/$pattern &>/dev/null || error "Missing $pattern"
done
```

**Stage 3: File Integrity**
```bash
# Verify downloaded files are valid gzip
gunzip -t "$file" 2>/dev/null || error "Corrupted: $file"
```

**Stage 4: Component Installation**
```bash
# Each install function verifies success
install_component || exit 1
verify_component_works || exit 1
```

### Recovery Mechanisms

**1. Existing Installation Detection**
```bash
if [[ -d "${INSTALL_BASE}/java" ]]; then
    log_warn "Java already installed"
    read -p "Overwrite? (y/N): " -n 1 -r
    [[ $REPLY =~ ^[Yy]$ ]] || return 0  # Keep existing
fi
```

**2. Partial Installation Recovery**
```bash
# Each component is independent
# If indexing fails, installation continues
run_indexer || log_warn "Indexing failed - run manually later"
```

**3. Backup Creation**
```bash
# Backup before modifying critical files
cp "$web_xml" "${web_xml}.bak"
```

## Configuration Management

### Version Control

All versions in one place (top of download script):
```bash
readonly OPENGROK_VERSION="1.13.9"
readonly CTAGS_VERSION="6.1.0"
readonly TOMCAT_VERSION="9.0.97"
readonly JDK_VERSION="11.0.25+9"
```

### Path Configuration

Defaults with override options (install script):
```bash
# Defaults
INSTALL_BASE="/opt"
DATA_BASE="/var/opengrok"
TOMCAT_PORT="8080"

# Override via flags
--install-dir /usr/local
--data-dir /srv/opengrok
--port 9090
```

### Feature Flags

Boolean flags for optional features:
```bash
INSTALL_SYSTEMD=true   # --no-systemd to disable
RUN_INDEXING=true      # --skip-indexing to disable
```

## Output and Logging

### Color-Coded Messages

```bash
readonly RED='\033[0;31m'      # Errors
readonly GREEN='\033[0;32m'    # Success
readonly YELLOW='\033[1;33m'   # Warnings
readonly BLUE='\033[0;34m'     # Info
readonly NC='\033[0m'          # Reset

log_error()   # Red   - Critical failures
log_warn()    # Yellow - Non-critical issues
log_success() # Green  - Completed steps
log_info()    # Blue   - Progress updates
```

### Progress Tracking

```bash
# Section markers
echo "================================================================"
echo "  Installing Java..."
echo "================================================================"

# Component-level progress
log_info "Downloading opengrok-1.13.9.tar.gz..."
download_file "$url" "$output"
log_success "Downloaded (25MB)"
```

### Summary Reports

**Download script output:**
```
Output directory: opengrok-dependencies
Total size: 183MB

Files downloaded:
-rw-r--r-- 1 user user 51M opengrok-1.13.9.tar.gz
-rw-r--r-- 1 user user 8.4M ctags-6.1.0-linux-x86_64.tar.gz
-rw-r--r-- 1 user user 11M apache-tomcat-9.0.97.tar.gz
-rw-r--r-- 1 user user 45M OpenJDK11U-jre_x64_linux_hotspot_*.tar.gz
```

**Install script output:**
```
Installation paths:
  Java:      /opt/java
  Ctags:     /usr/local/bin/ctags
  Tomcat:    /opt/tomcat
  OpenGrok:  /opt/opengrok
  Data:      /var/opengrok

Access OpenGrok:
  http://localhost:8080/source

Management:
  Start:    sudo systemctl start tomcat
  Stop:     sudo systemctl stop tomcat
  Status:   sudo systemctl status tomcat
```

## Security Considerations

### 1. Privilege Separation

```bash
# Install script requires root
check_root() {
    [[ $EUID -ne 0 ]] && log_error "Must run as root" && exit 1
}

# Tomcat runs as non-root user
useradd -r -m -U -d /opt/tomcat -s /bin/false tomcat
chown -R tomcat:tomcat /opt/tomcat
```

### 2. File Permissions

```bash
# Executable scripts
chmod +x /opt/tomcat/bin/*.sh

# User-owned data
chown -R $USER:$USER /var/opengrok

# Tomcat-owned runtime
chown -R tomcat:tomcat /opt/tomcat
```

### 3. Service Hardening

```bash
[Service]
User=tomcat                    # Non-root user
Group=tomcat                   # Non-root group
UMask=0007                     # Restrictive umask
Restart=always                 # Auto-restart on crash
RestartSec=10                  # Delay between restarts
```

### 4. Network Security

- Only listens on configured port (default 8080)
- No remote management enabled
- No exposed credentials
- Web application only (no SSH, FTP, etc.)

## Testing Strategy

### Unit Testing (Manual)

Each function can be tested independently:
```bash
# Test download function
source download-dependencies.sh
download_file "https://example.com/file.tar.gz" "/tmp/test.tar.gz"

# Test validation
check_dependencies_dir "/path/to/deps"
```

### Integration Testing

**Full workflow test:**
```bash
# 1. Download dependencies
./download-dependencies.sh /tmp/test-deps

# 2. Prepare test source
mkdir /tmp/test-source
echo "test" > /tmp/test-source/test.c

# 3. Install (in VM)
sudo ./install-opengrok.sh /tmp/test-deps /tmp/test-source

# 4. Verify
curl http://localhost:8080/source
```

### Edge Cases Handled

1. **Missing dependencies** - Clear error, lists what's missing
2. **Existing installation** - Prompts before overwriting
3. **Empty source directory** - Warns but continues
4. **Download failures** - Retries not attempted (fail fast)
5. **Corrupted files** - Detected via gunzip -t
6. **Insufficient permissions** - Checked before attempting install
7. **Port conflicts** - Configurable port via --port
8. **Large codebases** - Indexing can be skipped and run later

## Maintenance Guidelines

### Updating Versions

**1. Edit version constants:**
```bash
# In download-dependencies.sh
readonly OPENGROK_VERSION="1.14.0"  # Update here
readonly CTAGS_VERSION="6.2.0"      # Update here
readonly TOMCAT_VERSION="9.0.98"    # Update here
readonly JDK_VERSION="11.0.26+9"    # Update here
```

**2. Verify URLs still valid:**
```bash
# Test download links
curl -I $OPENGROK_URL
curl -I $CTAGS_URL
curl -I $TOMCAT_URL
curl -I $JDK_URL
```

**3. Test full workflow:**
```bash
# Clean VM test
./download-dependencies.sh
sudo ./install-opengrok.sh deps/ source/
```

### Adding New Components

**1. Add to download script:**
```bash
readonly NEWCOMP_VERSION="1.0.0"
readonly NEWCOMP_URL="https://..."

download_file "$NEWCOMP_URL" "${output_dir}/newcomp-${NEWCOMP_VERSION}.tar.gz"
verify_file "${output_dir}/newcomp-${NEWCOMP_VERSION}.tar.gz"
```

**2. Add to install script:**
```bash
install_newcomp() {
    local deps_dir="$1"
    local tarball=$(ls "$deps_dir"/newcomp-*.tar.gz | head -1)

    log_info "Installing New Component..."
    extract_tarball "$tarball" "${INSTALL_BASE}/newcomp" 1
    log_success "New Component installed"
}

# Call in main()
install_newcomp "$DEPS_DIR" || exit 1
```

### Deprecation Strategy

When removing old features:
1. Add deprecation warning for one version
2. Keep old code commented for reference
3. Update documentation to reflect changes
4. Provide migration path in error messages

## Platform Compatibility

### Tested Platforms
- Ubuntu 20.04, 22.04
- CentOS 7, 8
- RHEL 7, 8, 9
- Debian 10, 11

### Known Limitations
- Linux only (uses systemd, Linux paths)
- Requires bash 4.0+
- Assumes x86_64 architecture
- Requires GNU tools (tar, gunzip, etc.)

### Platform-Specific Handling

**Package manager detection:**
```bash
if command -v apt-get &> /dev/null; then
    # Debian/Ubuntu instructions
elif command -v yum &> /dev/null; then
    # CentOS/RHEL instructions
fi
```

**Systemd availability:**
```bash
if command -v systemctl &> /dev/null; then
    # Use systemd
else
    # Fall back to manual start
fi
```

## Performance Considerations

### Download Optimization
- Uses wget --no-verbose for cleaner output
- curl fallback if wget unavailable
- Progress bars for user feedback
- Parallel downloads possible (future enhancement)

### Installation Optimization
- Extracts directly to target (no double copy)
- Minimal directory traversal
- Reuses existing installations when possible
- Indexing can be deferred for large repos

### Memory Usage
- Default indexing suitable for <100k files
- For larger repos, document memory tuning
- Tomcat memory configurable via setenv.sh

## Future Enhancements

### Potential Improvements
1. **Parallel downloads** - Download multiple files simultaneously
2. **Resume capability** - Resume interrupted downloads
3. **Update script** - In-place updates without reinstall
4. **Health check** - Verify running installation
5. **Backup script** - Automated backup/restore
6. **Multi-project wizard** - Interactive project setup
7. **Configuration templates** - Pre-configured setups (small/medium/large)
8. **Docker support** - Container-based installation

### Backward Compatibility
- Maintain same command-line interface
- Deprecate features gracefully
- Version detection for upgrade paths
- Migration scripts for breaking changes

## Documentation

### Inline Documentation
- Script headers explain purpose and usage
- Function comments describe behavior
- Complex sections have explanatory comments
- Examples in comments for non-obvious code

### External Documentation
- scripts/README.md - User guide with examples
- docs/OPENGROK_OFFLINE_SETUP.md - Manual process
- docs/SCRIPTS_DESIGN.md - This file
- CHANGELOG.md - Track changes across versions

## License

MIT License - See LICENSE file in repository root
