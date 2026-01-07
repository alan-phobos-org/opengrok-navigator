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

OpenGrok can index multiple projects simultaneously. Each top-level directory under your source root becomes a separate "project" in the OpenGrok UI, allowing you to search within a single project or across all projects.

**Source Directory Structure:**
```
/data/sources/                    # Source root (passed to install script)
├── linux-kernel/                 # Project 1
│   ├── arch/
│   ├── drivers/
│   ├── kernel/
│   └── ...
├── my-application/               # Project 2
│   ├── src/
│   ├── tests/
│   └── pom.xml
├── third-party-lib/              # Project 3
│   ├── include/
│   └── src/
└── scripts/                      # Project 4
    └── *.sh
```

**Important:** Each immediate subdirectory of the source root is treated as a separate project. Don't put source files directly in the root - always organize into project subdirectories.

**Setting Up Multiple Projects:**
```bash
# Create source directory structure
mkdir -p /data/sources
cd /data/sources

# Clone or copy each project as a subdirectory
git clone https://github.com/org/project-a.git
git clone https://github.com/org/project-b.git
cp -r /path/to/legacy-code ./legacy-project

# Install OpenGrok pointing to the source root
sudo ./install-opengrok.sh ./opengrok-dependencies /data/sources
```

OpenGrok will detect and index all projects automatically. In the web UI, you can:
- Select specific projects to search within
- Browse each project's directory tree separately
- View cross-references across all projects

**Adding New Projects Later:**
```bash
# Add new project to source directory
cd /var/opengrok/src
git clone https://github.com/org/new-project.git

# Re-index to include the new project
sudo /opt/java/bin/java \
  -jar /opt/opengrok/lib/opengrok.jar \
  -c /usr/local/bin/ctags \
  -s /var/opengrok/src \
  -d /var/opengrok/data \
  -H -P -S -G \
  -W /var/opengrok/etc/configuration.xml
```

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

## Logs and Debugging

### Log Locations

**Tomcat/OpenGrok Logs:**
- Main log: `/opt/tomcat/logs/catalina.out` (or `${INSTALL_BASE}/tomcat/logs/catalina.out`)
- Application logs: `/opt/tomcat/logs/localhost.*.log`
- Access logs: `/opt/tomcat/logs/localhost_access_log.*.txt`

**View logs:**
```bash
# Tail main Tomcat log
tail -f /opt/tomcat/logs/catalina.out

# View last 50 lines
tail -50 /opt/tomcat/logs/catalina.out

# Search for errors
grep -i error /opt/tomcat/logs/catalina.out
grep -i exception /opt/tomcat/logs/catalina.out
```

**Systemd Service Logs** (if using systemd):
```bash
# View recent logs
sudo journalctl -u tomcat -n 100

# Follow logs in real-time
sudo journalctl -u tomcat -f

# View logs since last boot
sudo journalctl -u tomcat -b

# View logs with timestamps
sudo journalctl -u tomcat -o short-precise
```

**OpenGrok Indexer Logs:**

The indexer runs as a one-time command and outputs to stdout/stderr. When run via the install script, output appears in the terminal. For scheduled reindexing via cron, redirect to a log file:

```bash
# Example cron job with logging
0 2 * * * /opt/java/bin/java -jar /opt/opengrok/lib/opengrok.jar \
  -c /usr/local/bin/ctags \
  -s /var/opengrok/src \
  -d /var/opengrok/data \
  -H -P -S -G \
  -W /var/opengrok/etc/configuration.xml \
  >> /var/log/opengrok-reindex.log 2>&1
```

### Common Issues and Solutions

**Tomcat starts then immediately stops:**

This usually indicates a configuration or permission issue.

**Check systemd status:**
```bash
sudo systemctl status tomcat
```

**Check recent logs:**
```bash
sudo journalctl -u tomcat -n 50
tail -50 /opt/tomcat/logs/catalina.out
```

**Common causes:**
1. **Port conflict** - Check if ports 8080 or 8005 are in use
2. **Permission issue** - Ensure tomcat user owns all files:
   ```bash
   sudo chown -R tomcat:tomcat /opt/tomcat
   sudo chown -R tomcat:tomcat /var/opengrok
   ```
3. **Missing JAVA_HOME** - Verify environment:
   ```bash
   sudo -u tomcat env | grep JAVA
   ```
4. **PID file issue** - Remove stale PID file:
   ```bash
   sudo rm -f /opt/tomcat/temp/tomcat.pid
   sudo systemctl restart tomcat
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

**Problem:** Shutdown port 8005 already in use

Error message: `failed to create server shutdown socket on address ... port [8005]`

This happens when another Tomcat instance (or other Java application) is using port 8005.

**Solution:** Stop the existing Tomcat first:
```bash
# Check what's using port 8005
sudo lsof -i :8005
# or
sudo ss -tlnp | grep 8005

# If it's an existing Tomcat, stop it
sudo systemctl stop tomcat
# or
sudo /opt/tomcat/bin/shutdown.sh

# If needed, force kill
sudo pkill -f catalina
```

The install script will now automatically detect this condition and offer to stop existing instances.

### ChronicleMap errors (InaccessibleObjectException)

**Problem:** Errors related to ChronicleMap or InaccessibleObjectException in logs

Error messages like:
```
java.lang.reflect.InaccessibleObjectException: Unable to make field ... accessible
ChronicleMap creation failed
```

This happens because OpenGrok's suggester feature uses ChronicleMap, which requires access to internal JDK modules that are restricted by default in JDK 9+.

**Solution:** The install script automatically creates `/opt/tomcat/bin/setenv.sh` with required JVM flags. If you need to add them manually:

```bash
# Edit or create /opt/tomcat/bin/setenv.sh
sudo tee /opt/tomcat/bin/setenv.sh > /dev/null << 'EOF'
#!/bin/sh
# JDK 9+ module access for ChronicleMap
export CATALINA_OPTS="$CATALINA_OPTS --add-exports=java.base/jdk.internal.ref=ALL-UNNAMED"
export CATALINA_OPTS="$CATALINA_OPTS --add-exports=java.base/sun.nio.ch=ALL-UNNAMED"
export CATALINA_OPTS="$CATALINA_OPTS --add-exports=jdk.unsupported/sun.misc=ALL-UNNAMED"
export CATALINA_OPTS="$CATALINA_OPTS --add-exports=jdk.compiler/com.sun.tools.javac.file=ALL-UNNAMED"
export CATALINA_OPTS="$CATALINA_OPTS --add-opens=jdk.compiler/com.sun.tools.javac=ALL-UNNAMED"
export CATALINA_OPTS="$CATALINA_OPTS --add-opens=java.base/java.lang=ALL-UNNAMED"
export CATALINA_OPTS="$CATALINA_OPTS --add-opens=java.base/java.lang.reflect=ALL-UNNAMED"
export CATALINA_OPTS="$CATALINA_OPTS --add-opens=java.base/java.io=ALL-UNNAMED"
export CATALINA_OPTS="$CATALINA_OPTS --add-opens=java.base/java.util=ALL-UNNAMED"
export CATALINA_OPTS="$CATALINA_OPTS --add-opens=java.base/java.nio=ALL-UNNAMED"
export CATALINA_OPTS="$CATALINA_OPTS --add-opens=java.base/java.net=ALL-UNNAMED"
export CATALINA_OPTS="$CATALINA_OPTS --add-opens=java.base/sun.nio.ch=ALL-UNNAMED"
EOF

sudo chmod +x /opt/tomcat/bin/setenv.sh
sudo chown tomcat:tomcat /opt/tomcat/bin/setenv.sh
sudo systemctl restart tomcat
```

**Note:** Do NOT use `--illegal-access=permit` as it was removed in JDK 17. Use `--add-opens` flags instead.

**References:**
- [OpenGrok Suggester Wiki](https://github.com/oracle/opengrok/wiki/Suggester)
- [OpenGrok Discussion #4371](https://github.com/oracle/opengrok/discussions/4371)
- [JDK 17 and illegal reflective access](https://bilalkaun.com/2024/01/14/jdk-17-and-illegal-reflective-access/)

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

The install script automatically creates `/opt/tomcat/bin/setenv.sh` with memory settings. To adjust:

```bash
# Edit setenv.sh to change memory allocation
sudo nano /opt/tomcat/bin/setenv.sh

# Modify these lines:
export CATALINA_OPTS="$CATALINA_OPTS -Xms512M"    # Initial heap
export CATALINA_OPTS="$CATALINA_OPTS -Xmx4096M"   # Maximum heap

# Restart Tomcat
sudo systemctl restart tomcat
```

**Note:** The setenv.sh file already includes JDK 9+ compatibility flags for ChronicleMap. Don't remove the `--add-exports` and `--add-opens` lines.

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
