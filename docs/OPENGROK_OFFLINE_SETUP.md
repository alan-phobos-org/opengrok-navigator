# OpenGrok Offline Setup Guide

This guide covers setting up OpenGrok on a Linux VM that may not have internet access. All prerequisites must be downloaded beforehand.

## Quick Start (Automated Scripts)

The fastest way to set up OpenGrok offline is using the automated scripts:

### 1. Download Dependencies (on Internet-Connected Machine)

```bash
# Download all dependencies
cd scripts/
./download-dependencies.sh

# For faster parallel downloads
./download-dependencies.sh -p

# Non-interactive mode
./download-dependencies.sh -y -p /path/to/output
```

### 2. Transfer and Install (on Offline Machine)

```bash
# Transfer the dependencies directory and scripts to your offline machine
# Then run the installer
sudo ./install-opengrok.sh /path/to/dependencies /path/to/source-code

# With options for non-interactive mode and custom memory
sudo ./install-opengrok.sh -y --indexer-memory 4096 ./opengrok-dependencies ./my-source-code

# Skip systemd and indexing (do later manually)
sudo ./install-opengrok.sh --no-systemd --skip-indexing ./deps ./src
```

Available options:
- `-y, --yes`: Non-interactive mode (auto-confirm all prompts)
- `-p, --parallel`: Download files in parallel (faster, download script only)
- `--install-dir DIR`: Base installation directory (default: /opt)
- `--data-dir DIR`: OpenGrok data directory (default: /var/opengrok)
- `--port PORT`: Tomcat HTTP port (default: 8080)
- `--indexer-memory SIZE`: Memory for indexer in MB (default: auto-detect)
- `--no-systemd`: Skip systemd service installation
- `--skip-indexing`: Skip initial indexing

---

## Manual Installation (Alternative)

If you prefer manual installation or need more control:

## Prerequisites to Download (on Internet-Connected Machine)

Download these files and transfer them to your VM:

### 1. OpenGrok
- Download latest release from: https://github.com/oracle/opengrok/releases
- File: `opengrok-X.Y.Z.tar.gz` (e.g., `opengrok-1.13.9.tar.gz`)

### 2. Universal Ctags
- Download from: https://github.com/universal-ctags/ctags/releases
- File: `ctags-X.Y.Z-linux-x86_64.tar.gz`
- **Alternative**: Download source tarball if you need to compile

### 3. Java Runtime (if not installed)
- OpenGrok requires Java 11 or later
- Download OpenJDK from: https://adoptium.net/temurin/releases/
- File: `OpenJDK11U-jre_x64_linux_*.tar.gz`

### 4. Tomcat (Web Application Server)
- Download from: https://tomcat.apache.org/download-90.cgi
- File: `apache-tomcat-9.0.XX.tar.gz`

### 5. Your Source Code
- Package your source code as a tarball or zip file

## Installation Steps

### Step 1: Install Java (if needed)

```bash
# Extract Java
tar -xzf OpenJDK11U-jre_x64_linux_*.tar.gz
sudo mv jdk-11* /opt/java

# Set JAVA_HOME
echo 'export JAVA_HOME=/opt/java' >> ~/.bashrc
echo 'export PATH=$JAVA_HOME/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Verify installation
java -version
```

### Step 2: Install Universal Ctags

```bash
# Extract ctags
tar -xzf ctags-*-linux-x86_64.tar.gz
sudo mv ctags /usr/local/bin/

# Verify installation
ctags --version
```

**Alternative (if building from source):**
```bash
tar -xzf ctags-*.tar.gz
cd ctags-*
./autogen.sh
./configure
make
sudo make install
```

### Step 3: Install Tomcat

```bash
# Extract Tomcat
tar -xzf apache-tomcat-9.0.*.tar.gz
sudo mv apache-tomcat-9.0.* /opt/tomcat

# Create tomcat user (optional but recommended)
sudo useradd -r -m -U -d /opt/tomcat -s /bin/false tomcat
sudo chown -R tomcat:tomcat /opt/tomcat

# Make scripts executable
sudo chmod +x /opt/tomcat/bin/*.sh
```

### Step 4: Install OpenGrok

```bash
# Extract OpenGrok
tar -xzf opengrok-*.tar.gz
sudo mkdir -p /opt/opengrok
sudo mv opengrok-*/* /opt/opengrok/

# Create necessary directories
sudo mkdir -p /var/opengrok/src
sudo mkdir -p /var/opengrok/data
sudo mkdir -p /var/opengrok/etc

# Set permissions
sudo chown -R $USER:$USER /var/opengrok
```

### Step 5: Import Source Code

```bash
# Extract your source code to the source root
cd /var/opengrok/src

# For a single project:
mkdir -p my-project
cd my-project
tar -xzf /path/to/your-source.tar.gz

# For multiple projects, create separate directories:
# /var/opengrok/src/project1/
# /var/opengrok/src/project2/
# etc.
```

**Directory Structure Example:**
```
/var/opengrok/src/
├── illumos-gate/
│   ├── usr/
│   ├── lib/
│   └── ...
└── linux-kernel/
    ├── arch/
    ├── drivers/
    └── ...
```

### Step 6: Deploy OpenGrok Web Application

```bash
# Copy the war file to Tomcat
sudo cp /opt/opengrok/lib/source.war /opt/tomcat/webapps/

# Start Tomcat to auto-deploy
/opt/tomcat/bin/startup.sh

# Wait a few seconds for deployment
sleep 10

# Stop Tomcat
/opt/tomcat/bin/shutdown.sh
```

### Step 7: Index Your Source Code

```bash
# Set OpenGrok variables
export OPENGROK_TOMCAT_BASE=/opt/tomcat
export OPENGROK_INSTANCE_BASE=/var/opengrok

# Run the indexer
java -jar /opt/opengrok/lib/opengrok.jar \
    -c /usr/local/bin/ctags \
    -s /var/opengrok/src \
    -d /var/opengrok/data \
    -H -P -S -G \
    -W /var/opengrok/etc/configuration.xml

# Alternative: Use the indexer script
/opt/opengrok/bin/OpenGrok index \
    /var/opengrok/src
```

**Indexer Options Explained:**
- `-c`: Path to ctags binary
- `-s`: Source root directory
- `-d`: Data root (index storage)
- `-H`: Generate history cache
- `-P`: Generate project metadata
- `-S`: Search for repositories (git, svn, etc.)
- `-G`: Assign tags to files
- `-W`: Write configuration to file

### Step 8: Configure Tomcat for OpenGrok

```bash
# Create context configuration
sudo tee /opt/tomcat/webapps/source/WEB-INF/web.xml.new > /dev/null << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<web-app xmlns="http://xmlns.jcp.org/xml/ns/javaee"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://xmlns.jcp.org/xml/ns/javaee
         http://xmlns.jcp.org/xml/ns/javaee/web-app_3_1.xsd"
         version="3.1">
    <context-param>
        <param-name>CONFIGURATION</param-name>
        <param-value>/var/opengrok/etc/configuration.xml</param-value>
    </context-param>
</web-app>
EOF

# Backup original and replace
sudo cp /opt/tomcat/webapps/source/WEB-INF/web.xml /opt/tomcat/webapps/source/WEB-INF/web.xml.bak
sudo mv /opt/tomcat/webapps/source/WEB-INF/web.xml.new /opt/tomcat/webapps/source/WEB-INF/web.xml
```

### Step 9: Start OpenGrok

```bash
# Start Tomcat
/opt/tomcat/bin/startup.sh

# Check logs for errors
tail -f /opt/tomcat/logs/catalina.out
```

### Step 10: Access OpenGrok

Open a web browser and navigate to:
```
http://localhost:8080/source
```

Or from another machine:
```
http://<vm-ip-address>:8080/source
```

## Re-indexing After Code Updates

When your source code changes:

```bash
# Stop Tomcat
/opt/tomcat/bin/shutdown.sh

# Update your source files in /var/opengrok/src/

# Re-run the indexer
java -jar /opt/opengrok/lib/opengrok.jar \
    -c /usr/local/bin/ctags \
    -s /var/opengrok/src \
    -d /var/opengrok/data \
    -H -P -S -G \
    -W /var/opengrok/etc/configuration.xml

# Start Tomcat
/opt/tomcat/bin/startup.sh
```

## Adding a New Project

```bash
# Stop Tomcat
/opt/tomcat/bin/shutdown.sh

# Add new source code
mkdir -p /var/opengrok/src/new-project
cd /var/opengrok/src/new-project
tar -xzf /path/to/new-source.tar.gz

# Re-index (will detect new project automatically)
java -jar /opt/opengrok/lib/opengrok.jar \
    -c /usr/local/bin/ctags \
    -s /var/opengrok/src \
    -d /var/opengrok/data \
    -H -P -S -G \
    -W /var/opengrok/etc/configuration.xml

# Start Tomcat
/opt/tomcat/bin/startup.sh
```

## Systemd Service (Optional)

To run Tomcat as a service:

```bash
sudo tee /etc/systemd/system/tomcat.service > /dev/null << 'EOF'
[Unit]
Description=Apache Tomcat Web Application Container
After=network.target

[Service]
Type=forking

Environment="JAVA_HOME=/opt/java"
Environment="CATALINA_PID=/opt/tomcat/temp/tomcat.pid"
Environment="CATALINA_HOME=/opt/tomcat"
Environment="CATALINA_BASE=/opt/tomcat"

ExecStart=/opt/tomcat/bin/startup.sh
ExecStop=/opt/tomcat/bin/shutdown.sh

User=tomcat
Group=tomcat
UMask=0007
RestartSec=10
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd
sudo systemctl daemon-reload

# Enable and start service
sudo systemctl enable tomcat
sudo systemctl start tomcat

# Check status
sudo systemctl status tomcat
```

## Troubleshooting

### Tomcat won't start
```bash
# Check if port 8080 is already in use
sudo netstat -tlnp | grep 8080

# Check Tomcat logs
tail -f /opt/tomcat/logs/catalina.out
```

### OpenGrok shows "Configuration not found"
```bash
# Verify configuration file exists
ls -l /var/opengrok/etc/configuration.xml

# Check Tomcat can read it
sudo -u tomcat cat /var/opengrok/etc/configuration.xml
```

### Search returns no results
```bash
# Check indexer ran successfully
ls -l /var/opengrok/data/

# Verify source files are present
ls -l /var/opengrok/src/
```

### Indexer fails with "ctags not found"
```bash
# Verify ctags is installed and in PATH
which ctags
ctags --version

# Specify full path in indexer command
-c /usr/local/bin/ctags
```

### Out of memory during indexing
```bash
# Increase Java heap size
java -Xmx4g -jar /opt/opengrok/lib/opengrok.jar ...
```

## Performance Tuning

### For large codebases:

```bash
# Increase Tomcat memory
# Edit /opt/tomcat/bin/setenv.sh (create if doesn't exist)
cat > /opt/tomcat/bin/setenv.sh << 'EOF'
export CATALINA_OPTS="$CATALINA_OPTS -Xms512M"
export CATALINA_OPTS="$CATALINA_OPTS -Xmx2048M"
EOF

chmod +x /opt/tomcat/bin/setenv.sh
```

### Disable history indexing (faster):
```bash
# Omit the -H flag when indexing
java -jar /opt/opengrok/lib/opengrok.jar \
    -c /usr/local/bin/ctags \
    -s /var/opengrok/src \
    -d /var/opengrok/data \
    -P -S -G \
    -W /var/opengrok/etc/configuration.xml
```

## Backup and Restore

### Backup
```bash
# Backup configuration and index
tar -czf opengrok-backup.tar.gz \
    /var/opengrok/etc/configuration.xml \
    /var/opengrok/data/
```

### Restore
```bash
# Extract backup
tar -xzf opengrok-backup.tar.gz -C /
```

## File Transfer to Offline VM

If using an offline VM, transfer files via:

**USB drive:**
```bash
# Mount USB
sudo mkdir /mnt/usb
sudo mount /dev/sdb1 /mnt/usb

# Copy files
cp /mnt/usb/*.tar.gz ~/downloads/
```

**SCP (if VM has network but no internet):**
```bash
# From your computer
scp opengrok-*.tar.gz user@vm-ip:~/downloads/
scp ctags-*.tar.gz user@vm-ip:~/downloads/
```

## Summary of Key Paths

| Purpose | Path |
|---------|------|
| OpenGrok installation | `/opt/opengrok` |
| Source code | `/var/opengrok/src` |
| Index data | `/var/opengrok/data` |
| Configuration | `/var/opengrok/etc/configuration.xml` |
| Tomcat installation | `/opt/tomcat` |
| Web application | `/opt/tomcat/webapps/source` |
| Tomcat logs | `/opt/tomcat/logs/catalina.out` |
| Java installation | `/opt/java` |
| Ctags binary | `/usr/local/bin/ctags` |

## Quick Reference Commands

```bash
# Start OpenGrok
/opt/tomcat/bin/startup.sh

# Stop OpenGrok
/opt/tomcat/bin/shutdown.sh

# Re-index source code
java -jar /opt/opengrok/lib/opengrok.jar \
    -c /usr/local/bin/ctags \
    -s /var/opengrok/src \
    -d /var/opengrok/data \
    -H -P -S -G \
    -W /var/opengrok/etc/configuration.xml

# View logs
tail -f /opt/tomcat/logs/catalina.out

# Check if running
curl http://localhost:8080/source
```
