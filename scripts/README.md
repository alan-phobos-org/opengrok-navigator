# OpenGrok Installation Scripts

Two-stage automated OpenGrok setup for offline installations.

## Overview

These scripts automate the complete OpenGrok installation process:

1. **download-dependencies.sh** - Downloads all required software (run on internet-connected machine)
2. **install-opengrok.sh** - Installs OpenGrok from downloaded dependencies (run on target machine)

## Stage 1: Download Dependencies

Run this on a machine with internet access:

```bash
./download-dependencies.sh [output_directory]
```

### What it does:
- Downloads OpenGrok, Universal Ctags, Apache Tomcat, and OpenJDK
- Verifies file integrity
- Creates manifest with checksums
- Generates README for offline use

### Output:
```
opengrok-dependencies/
├── opengrok-1.13.9.tar.gz
├── ctags-6.1.0-linux-x86_64.tar.gz
├── apache-tomcat-9.0.97.tar.gz
├── OpenJDK11U-jre_x64_linux_hotspot_*.tar.gz
├── MANIFEST.txt
└── README.txt
```

### Version Configuration

Edit the script to change versions:
```bash
readonly OPENGROK_VERSION="1.13.9"
readonly CTAGS_VERSION="6.1.0"
readonly TOMCAT_VERSION="9.0.97"
readonly JDK_VERSION="11.0.25+9"
```

### Requirements:
- wget or curl
- tar, gunzip
- ~200MB free space

## Stage 2: Install OpenGrok

Run this on the target machine (requires root):

```bash
sudo ./install-opengrok.sh <dependencies_dir> <source_code_dir> [options]
```

### Basic Example:
```bash
sudo ./install-opengrok.sh ./opengrok-dependencies ./my-source-code
```

### Options:

| Option | Description | Default |
|--------|-------------|---------|
| `--install-dir DIR` | Base installation directory | `/opt` |
| `--data-dir DIR` | OpenGrok data directory | `/var/opengrok` |
| `--port PORT` | Tomcat HTTP port | `8080` |
| `--no-systemd` | Skip systemd service | (creates service) |
| `--skip-indexing` | Skip initial indexing | (runs indexing) |
| `--help` | Show help | |

### Advanced Examples:

**Custom installation paths:**
```bash
sudo ./install-opengrok.sh \
  --install-dir /usr/local \
  --data-dir /srv/opengrok \
  --port 9090 \
  ./opengrok-dependencies \
  ./source-code
```

**Skip initial indexing (index later):**
```bash
sudo ./install-opengrok.sh \
  --skip-indexing \
  ./opengrok-dependencies \
  ./source-code
```

**No systemd (manual start/stop):**
```bash
sudo ./install-opengrok.sh \
  --no-systemd \
  ./opengrok-dependencies \
  ./source-code
```

### What it does:
1. ✅ Validates dependencies and source directories
2. ✅ Installs OpenJDK to `/opt/java`
3. ✅ Installs Universal Ctags to `/usr/local/bin/ctags`
4. ✅ Installs Apache Tomcat to `/opt/tomcat`
5. ✅ Installs OpenGrok to `/opt/opengrok`
6. ✅ Creates tomcat user and systemd service
7. ✅ Deploys OpenGrok web application
8. ✅ Copies source code to `/var/opengrok/src/`
9. ✅ Runs indexer to create searchable index
10. ✅ Starts OpenGrok via systemd

### Requirements:
- Root access (sudo)
- Linux system (tested on Ubuntu, CentOS, RHEL)
- ~2GB free space
- Downloaded dependencies directory
- Source code to index

## Error Handling

Both scripts include comprehensive error checking:

### Download Script:
- ✅ Verifies commands (wget/curl, tar, gunzip)
- ✅ Checks file integrity with gunzip -t
- ✅ Creates checksums in manifest
- ✅ Prompts before overwriting existing files
- ✅ Reports download failures with helpful messages

### Install Script:
- ✅ Requires root privileges
- ✅ Validates all input directories
- ✅ Checks for existing installations (prompts before overwriting)
- ✅ Verifies each component after installation
- ✅ Provides detailed error messages
- ✅ Continues on non-critical failures (e.g., indexing)
- ✅ Prints comprehensive summary at end

## Usage Examples

### Simple Workflow

**On internet-connected machine:**
```bash
# Download dependencies
./download-dependencies.sh

# Transfer to offline machine (USB, scp, etc.)
tar -czf opengrok-deps.tar.gz opengrok-dependencies/
```

**On offline machine:**
```bash
# Extract dependencies
tar -xzf opengrok-deps.tar.gz

# Prepare source code
mkdir my-project
cd my-project
# ... copy your source files here ...

# Install
sudo ../install-opengrok.sh ../opengrok-dependencies .
```

**Access OpenGrok:**
```
http://localhost:8080/source
```

### Multi-Project Setup

```bash
# Prepare source with multiple projects
mkdir -p /data/sources
cd /data/sources
mkdir project-a project-b project-c
# ... copy source into each ...

# Install
sudo ./install-opengrok.sh ./opengrok-dependencies /data/sources
```

OpenGrok will detect and index all projects automatically.

### Re-indexing After Source Changes

```bash
# Update source code
cp new-files/* /var/opengrok/src/my-project/

# Re-index
sudo /opt/java/bin/java \
  -jar /opt/opengrok/lib/opengrok.jar \
  -c /usr/local/bin/ctags \
  -s /var/opengrok/src \
  -d /var/opengrok/data \
  -H -P -S -G \
  -W /var/opengrok/etc/configuration.xml

# Restart Tomcat
sudo systemctl restart tomcat
```

## Management Commands

### Systemd (if installed)
```bash
# Start OpenGrok
sudo systemctl start tomcat

# Stop OpenGrok
sudo systemctl stop tomcat

# Restart OpenGrok
sudo systemctl restart tomcat

# Check status
sudo systemctl status tomcat

# View logs
sudo journalctl -u tomcat -f
```

### Manual (if --no-systemd used)
```bash
# Start
sudo su - tomcat -s /bin/bash -c '/opt/tomcat/bin/startup.sh'

# Stop
sudo su - tomcat -s /bin/bash -c '/opt/tomcat/bin/shutdown.sh'

# View logs
tail -f /opt/tomcat/logs/catalina.out
```

## Troubleshooting

### Download script fails

**Problem:** `wget: command not found` or `curl: command not found`

**Solution:** Install wget or curl:
```bash
# Ubuntu/Debian
sudo apt-get install wget

# CentOS/RHEL
sudo yum install wget
```

### Install script fails with "Permission denied"

**Problem:** Not running as root

**Solution:** Use sudo:
```bash
sudo ./install-opengrok.sh ...
```

### Tomcat won't start

**Problem:** Port already in use

**Solution:** Use different port:
```bash
sudo ./install-opengrok.sh --port 9090 ...
```

**Check what's using port 8080:**
```bash
sudo netstat -tlnp | grep 8080
```

### Indexing fails

**Problem:** Large codebase, insufficient memory

**Solution:** Re-run with more memory:
```bash
sudo /opt/java/bin/java -Xmx4g \
  -jar /opt/opengrok/lib/opengrok.jar \
  -c /usr/local/bin/ctags \
  -s /var/opengrok/src \
  -d /var/opengrok/data \
  -H -P -S -G \
  -W /var/opengrok/etc/configuration.xml
```

### OpenGrok shows "Configuration not found"

**Problem:** Configuration file missing or wrong path

**Solution:** Check web.xml configuration:
```bash
cat /opt/tomcat/webapps/source/WEB-INF/web.xml | grep CONFIGURATION
```

Should show:
```xml
<param-value>/var/opengrok/etc/configuration.xml</param-value>
```

## File Locations

### Default Installation:
```
/opt/
├── java/           - OpenJDK
├── tomcat/         - Apache Tomcat
└── opengrok/       - OpenGrok application

/var/opengrok/
├── src/            - Source code
├── data/           - Index data
└── etc/
    └── configuration.xml

/usr/local/bin/
└── ctags           - Universal Ctags

/etc/systemd/system/
└── tomcat.service  - Systemd service (if enabled)

/etc/profile.d/
└── java.sh         - Java environment variables
```

## Security Notes

- Tomcat runs as non-root `tomcat` user
- Service auto-restarts on failure
- Web application only listens on configured port
- No remote management enabled by default

## Performance Tuning

For large codebases (>100k files):

**Increase Tomcat memory:**
```bash
# Create/edit setenv.sh
sudo tee /opt/tomcat/bin/setenv.sh > /dev/null << 'EOF'
export CATALINA_OPTS="$CATALINA_OPTS -Xms512M"
export CATALINA_OPTS="$CATALINA_OPTS -Xmx2048M"
EOF

sudo chmod +x /opt/tomcat/bin/setenv.sh
sudo systemctl restart tomcat
```

**Disable history indexing (faster):**
```bash
# Remove -H flag from indexer command
sudo /opt/java/bin/java \
  -jar /opt/opengrok/lib/opengrok.jar \
  -c /usr/local/bin/ctags \
  -s /var/opengrok/src \
  -d /var/opengrok/data \
  -P -S -G \
  -W /var/opengrok/etc/configuration.xml
```

## Backup and Restore

### Backup
```bash
# Stop OpenGrok
sudo systemctl stop tomcat

# Backup configuration and index
sudo tar -czf opengrok-backup.tar.gz \
  /var/opengrok/etc/configuration.xml \
  /var/opengrok/data/

# Start OpenGrok
sudo systemctl start tomcat
```

### Restore
```bash
sudo systemctl stop tomcat
sudo tar -xzf opengrok-backup.tar.gz -C /
sudo systemctl start tomcat
```

## Uninstallation

```bash
# Stop service
sudo systemctl stop tomcat
sudo systemctl disable tomcat

# Remove files
sudo rm -rf /opt/java /opt/tomcat /opt/opengrok
sudo rm -rf /var/opengrok
sudo rm /usr/local/bin/ctags
sudo rm /etc/systemd/system/tomcat.service
sudo rm /etc/profile.d/java.sh

# Remove user
sudo userdel -r tomcat

# Reload systemd
sudo systemctl daemon-reload
```

## Contributing

To modify these scripts:

1. Update version numbers at the top of each script
2. Test on clean VM before deployment
3. Update this README with any new features
4. Maintain backward compatibility when possible

## License

MIT License - See LICENSE file in repository root
