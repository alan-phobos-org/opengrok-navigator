# Testing OpenGrok Setup Scripts

Test strategy for validating installation scripts on Linux VMs from macOS using Multipass.

## Quick Start

```bash
# Install Multipass
brew install --cask multipass

# Automated test (validates scripts work correctly)
multipass launch --name test --memory 4G --disk 20G --cpus 2 22.04
multipass exec test -- mkdir -p /home/ubuntu/scripts
multipass transfer ./scripts/*.sh test:/home/ubuntu/scripts/
multipass transfer ./scripts/test-install.sh test:/home/ubuntu/
multipass exec test -- bash /home/ubuntu/test-install.sh

# Manual test (spin up OpenGrok instance for hands-on testing)
./scripts/manage-opengrok-test.sh start my-test ~/code/my-project
./scripts/manage-opengrok-test.sh open my-test
```

## Automated Testing - test-install.sh

Validates installation scripts work correctly. Tests:
1. Dependencies download ([download-dependencies.sh](../scripts/download-dependencies.sh))
2. File verification (all tarballs present)
3. Test source code creation
4. Full installation ([install-opengrok.sh](../scripts/install-opengrok.sh))
5. Component verification (Java, ctags, Tomcat, OpenGrok)
6. Service availability check
7. Search functionality test

**Full test workflow:**
```bash
multipass delete test --purge  # Clean slate
multipass launch --name test --memory 4G --disk 20G 22.04
multipass exec test -- mkdir -p /home/ubuntu/scripts
multipass transfer ./scripts/download-dependencies.sh test:/home/ubuntu/scripts/
multipass transfer ./scripts/install-opengrok.sh test:/home/ubuntu/scripts/
multipass transfer ./scripts/test-install.sh test:/home/ubuntu/
multipass exec test -- bash /home/ubuntu/test-install.sh

# Access if needed
VM_IP=$(multipass info test | grep IPv4 | awk '{print $2}')
open "http://${VM_IP}:8080/source"

# Cleanup
multipass delete test --purge
```

## Manual Testing - manage-opengrok-test.sh

Streamlined workflow for spinning up/down OpenGrok instances with custom codebases for extension testing.

**Features:**
- Quick start/stop/restart of test instances
- Multiple named environments
- Support for local paths, git repos, or demo code
- Dependency caching for faster setup
- Persistent VM state for iterative testing

### Common Usage Patterns

**Local codebase:**
```bash
./scripts/manage-opengrok-test.sh start my-project ~/code/my-app
./scripts/manage-opengrok-test.sh open my-project
# Configure VS Code baseUrl to http://<vm-ip>:8080/source
./scripts/manage-opengrok-test.sh stop my-project  # Keep VM for quick restart
./scripts/manage-opengrok-test.sh start my-project  # Fast resume
```

**Git repository:**
```bash
./scripts/manage-opengrok-test.sh start linux-test \
    https://github.com/torvalds/linux --depth 1
./scripts/manage-opengrok-test.sh open linux-test
```

**Quick demo:**
```bash
./scripts/manage-opengrok-test.sh start demo  # Auto-generates sample code
```

**Multiple environments:**
```bash
./scripts/manage-opengrok-test.sh start small ~/small-project
./scripts/manage-opengrok-test.sh start large ~/linux-kernel --port 8081
./scripts/manage-opengrok-test.sh list
# NAME                 STATUS     PORT   IP              CODEBASE
# small                running    8080   192.168.64.10   ~/small-project
# large                running    8081   192.168.64.11   ~/linux-kernel
```

**Iterative development:**
```bash
./scripts/manage-opengrok-test.sh start dev-test ~/test-code
# Edit extension, reload (F5), test
# Update test code
./scripts/manage-opengrok-test.sh reindex dev-test  # Fast reindex
```

### Commands

```bash
start <name> [codebase] [opts]  # Create/start instance
stop <name>                      # Stop (keeps VM)
destroy <name>                   # Remove completely
status <name>                    # Quick status
info <name>                      # Detailed info
open <name>                      # Open in browser
list                             # List all instances
reindex <name>                   # Reindex codebase
shell <name>                     # Shell into VM
logs <name> [--follow]           # View logs
help                             # Show help

Options:
  --memory 4G       VM memory (default: 4G)
  --disk 20G        VM disk (default: 20G)
  --cpus 2          CPU cores (default: 2)
  --port 8080       OpenGrok port (default: 8080)
  --no-cache        Force fresh dependency download
  --ubuntu 24.04    Ubuntu version (default: 22.04)
  --depth 1         Git clone depth
  --branch main     Git branch
```

### Implementation Details

**State Management:**
- Metadata in `~/.opengrok-test-instances/<name>/config.json`
- Tracks: codebase, VM name, port, resources, timestamps

**Dependency Caching:**
- Downloads once to `~/.opengrok-test-cache/`
- Reused across all instances
- Option to force fresh download

**Codebase Handling:**
- Local: transfers or mounts directory
- Git: clones inside VM
- Demo: generates multi-language sample code with cross-references

**Demo Code Structure:**
```
demo-project/
├── src/
│   ├── main.c, utils.c      # C with cross-file calls
│   ├── server.py, client.py # Python with imports
│   └── app.js, helpers.js   # JavaScript with modules
├── include/utils.h          # C headers
└── tests/                   # Test files
```

## Multipass Basics

```bash
# VM lifecycle
multipass launch <image>              # Create
multipass stop <name>                 # Stop
multipass delete <name> --purge       # Remove
multipass list                        # List all

# Access
multipass shell <name>                # Interactive shell
multipass exec <name> -- <cmd>        # Run command
multipass transfer <src> <name>:<dst> # Copy files
multipass mount <local> <name>:<vm>   # Mount directory

# Info
multipass info <name>                 # Details (IP, status, etc)
multipass find                        # Available images
```

## Troubleshooting

**Multipass issues:**
```bash
multipass list  # Check status
sudo launchctl unload /Library/LaunchDaemons/com.canonical.multipassd.plist
sudo launchctl load /Library/LaunchDaemons/com.canonical.multipassd.plist
```

**OpenGrok not accessible:**
```bash
./scripts/manage-opengrok-test.sh shell <name>
sudo systemctl status tomcat
sudo journalctl -u tomcat -n 50
```

**Network issues:**
```bash
multipass exec <name> -- ping -c 3 8.8.8.8
multipass exec <name> -- sudo systemctl restart systemd-networkd
```

**Port conflicts:**
```bash
./scripts/manage-opengrok-test.sh list  # Check active ports
# Use --port to specify different port
```

## Testing Scenarios

**Minimal installation:**
```bash
sudo ./install-opengrok.sh -y ./deps ./src
```

**Custom paths:**
```bash
sudo ./install-opengrok.sh -y \
    --install-dir /usr/local \
    --data-dir /srv/opengrok \
    --port 9090 \
    ./deps ./src
```

**No systemd:**
```bash
sudo ./install-opengrok.sh -y --no-systemd ./deps ./src
```

**Low memory:**
```bash
multipass launch --name lowmem --memory 1G --disk 10G 22.04
sudo ./install-opengrok.sh -y --indexer-memory 512 ./deps ./src
```

**Large codebase:**
```bash
git clone --depth=1 https://github.com/torvalds/linux /tmp/linux-source
sudo ./install-opengrok.sh -y ./deps /tmp/linux-source
```

## Validation Checklist

After installation:
- [ ] Java installed (`java -version`)
- [ ] Ctags installed (`ctags --version`)
- [ ] Tomcat running (`systemctl status tomcat`)
- [ ] Web UI accessible (`curl http://localhost:8080/source`)
- [ ] Search returns results
- [ ] File viewing works
- [ ] Cross-references clickable
- [ ] History view works (git repos)
- [ ] Config exists (`/var/opengrok/etc/configuration.xml`)
- [ ] No errors in logs (`journalctl -u tomcat`)
