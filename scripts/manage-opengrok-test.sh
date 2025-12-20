#!/usr/bin/env bash
set -euo pipefail

# Global configuration
readonly CACHE_DIR="$HOME/.opengrok-test-cache"
readonly STATE_DIR="$HOME/.opengrok-test-instances"
readonly DEFAULT_MEMORY="4G"
readonly DEFAULT_DISK="20G"
readonly DEFAULT_CPUS="2"
readonly DEFAULT_PORT="8080"
readonly DEFAULT_UBUNTU="22.04"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Error handling
die() { echo "ERROR: $*" >&2; exit 1; }
warn() { echo "WARNING: $*" >&2; }
info() { echo "$*"; }

# Prerequisite checks
check_multipass() {
    command -v multipass &>/dev/null || die "Multipass not installed. Run: brew install --cask multipass"
}

check_instance_exists() {
    local name="$1"
    [ -d "$STATE_DIR/$name" ] || die "Instance '$name' not found. Run: $0 list"
}

# Helper functions
get_vm_name() {
    echo "opengrok-test-$1"
}

get_vm_ip() {
    local vm_name="$1"
    local ip
    ip=$(multipass info "$vm_name" 2>/dev/null | awk '/IPv4:/ {print $2}' | head -1)
    echo "$ip"
}

wait_for_opengrok() {
    local url="$1"
    local max_attempts=60
    local attempt=0
    info "Waiting for OpenGrok to start..."
    while [ $attempt -lt $max_attempts ]; do
        if curl -sf "$url" >/dev/null 2>&1; then
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 2
    done
    return 1
}

ensure_cache() {
    local force_download="${1:-no}"

    if [ "$force_download" = "yes" ] || [ ! -d "$CACHE_DIR" ] || [ ! -f "$CACHE_DIR/MANIFEST.txt" ]; then
        info "Downloading dependencies to cache..."
        mkdir -p "$CACHE_DIR"
        bash "$SCRIPT_DIR/download-dependencies.sh" -y -p "$CACHE_DIR"
    else
        info "Using cached dependencies from $CACHE_DIR"
    fi
}

check_port_available() {
    local port="$1"
    local name="$2"

    if [ ! -d "$STATE_DIR" ]; then
        return 0
    fi

    for state_file in "$STATE_DIR"/*/config.json; do
        [ -f "$state_file" ] || continue
        local instance_port instance_name instance_status
        instance_port=$(jq -r '.port' "$state_file" 2>/dev/null || echo "")
        instance_name=$(jq -r '.name' "$state_file" 2>/dev/null || echo "")

        if [ "$instance_port" = "$port" ] && [ "$instance_name" != "$name" ]; then
            local vm_name
            vm_name=$(get_vm_name "$instance_name")
            if multipass info "$vm_name" 2>/dev/null | grep -q "Running"; then
                die "Port $port already used by running instance '$instance_name'. Use --port to specify different port."
            fi
        fi
    done
}

save_instance_state() {
    local name="$1"
    local codebase_type="$2"
    local codebase_path="$3"
    local port="$4"
    local memory="$5"
    local disk="$6"
    local cpus="$7"
    local ubuntu="$8"
    local git_depth="${9:-}"
    local git_branch="${10:-}"

    mkdir -p "$STATE_DIR/$name"

    local vm_name created
    vm_name=$(get_vm_name "$name")
    created=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    cat > "$STATE_DIR/$name/config.json" <<EOF
{
  "name": "$name",
  "vm_name": "$vm_name",
  "codebase_type": "$codebase_type",
  "codebase_path": "$codebase_path",
  "port": $port,
  "memory": "$memory",
  "disk": "$disk",
  "cpus": $cpus,
  "ubuntu_version": "$ubuntu",
  "created": "$created",
  "git_depth": "$git_depth",
  "git_branch": "$git_branch"
}
EOF
}

load_instance_state() {
    local name="$1"
    local config_file="$STATE_DIR/$name/config.json"
    [ -f "$config_file" ] || die "State file not found for '$name'"
    cat "$config_file"
}

create_demo_codebase() {
    local demo_dir
    demo_dir=$(mktemp -d)

    mkdir -p "$demo_dir/src"
    mkdir -p "$demo_dir/include"
    mkdir -p "$demo_dir/tests"

    # C header
    cat > "$demo_dir/include/utils.h" <<'EOF'
#ifndef UTILS_H
#define UTILS_H

int string_length(const char* str);
void print_message(const char* msg);

#endif
EOF

    # C implementation
    cat > "$demo_dir/src/utils.c" <<'EOF'
#include <stdio.h>
#include <string.h>
#include "../include/utils.h"

int string_length(const char* str) {
    return strlen(str);
}

void print_message(const char* msg) {
    printf("%s\n", msg);
}
EOF

    # C main
    cat > "$demo_dir/src/main.c" <<'EOF'
#include <stdio.h>
#include "../include/utils.h"

int main() {
    const char* message = "Hello, OpenGrok!";
    print_message(message);
    printf("Message length: %d\n", string_length(message));
    return 0;
}
EOF

    # Python server
    cat > "$demo_dir/src/server.py" <<'EOF'
from client import Client

class Server:
    def __init__(self, port):
        self.port = port
        self.clients = []

    def add_client(self, client):
        self.clients.append(client)

    def broadcast(self, message):
        for client in self.clients:
            client.send(message)

    def start(self):
        print(f"Server started on port {self.port}")
EOF

    # Python client
    cat > "$demo_dir/src/client.py" <<'EOF'
class Client:
    def __init__(self, name):
        self.name = name

    def send(self, message):
        print(f"{self.name} received: {message}")

    def connect(self, server):
        server.add_client(self)
EOF

    # JavaScript helpers
    cat > "$demo_dir/src/helpers.js" <<'EOF'
export function formatMessage(msg) {
    return `[INFO] ${msg}`;
}

export function getCurrentTimestamp() {
    return new Date().toISOString();
}
EOF

    # JavaScript app
    cat > "$demo_dir/src/app.js" <<'EOF'
import { formatMessage, getCurrentTimestamp } from './helpers.js';

class Application {
    constructor(name) {
        this.name = name;
        this.startTime = getCurrentTimestamp();
    }

    log(message) {
        console.log(formatMessage(message));
    }

    run() {
        this.log(`Application ${this.name} started at ${this.startTime}`);
    }
}

const app = new Application('DemoApp');
app.run();
EOF

    # C test
    cat > "$demo_dir/tests/test_utils.c" <<'EOF'
#include <assert.h>
#include <string.h>
#include "../include/utils.h"

void test_string_length() {
    assert(string_length("hello") == 5);
    assert(string_length("") == 0);
}

int main() {
    test_string_length();
    return 0;
}
EOF

    # Python test
    cat > "$demo_dir/tests/test_server.py" <<'EOF'
import sys
sys.path.insert(0, '../src')

from server import Server
from client import Client

def test_server():
    server = Server(8080)
    client = Client("TestClient")
    client.connect(server)
    assert len(server.clients) == 1
    print("Tests passed")

if __name__ == "__main__":
    test_server()
EOF

    echo "$demo_dir"
}

# Commands
command_help() {
    cat <<'EOF'
Usage: manage-opengrok-test.sh <command> [options]

Commands:
  start <name> [codebase]   Start or create an instance
  stop <name>               Stop instance (keeps VM)
  destroy <name>            Remove instance completely
  status <name>             Quick status check
  info <name>               Detailed instance info
  open <name>               Open in browser
  list                      List all instances
  reindex <name>            Reindex codebase
  shell <name>              Shell into VM
  logs <name> [--follow]    View logs
  help                      Show this help

Start options:
  --memory 4G       VM memory (default: 4G)
  --disk 20G        VM disk size (default: 20G)
  --cpus 2          CPU cores (default: 2)
  --port 8080       OpenGrok port (default: 8080)
  --no-cache        Force fresh dependency download
  --ubuntu 24.04    Ubuntu version (default: 22.04)
  --depth 1         Git clone depth (for git repos)
  --branch main     Git branch (for git repos)

Examples:
  manage-opengrok-test.sh start my-test ~/code/project
  manage-opengrok-test.sh start demo
  manage-opengrok-test.sh start linux-test https://github.com/torvalds/linux --depth 1
  manage-opengrok-test.sh open my-test
  manage-opengrok-test.sh stop my-test
  manage-opengrok-test.sh destroy my-test
EOF
}

command_start() {
    local name="${1:-}"
    [ -n "$name" ] || die "Usage: $0 start <name> [codebase] [options]"
    shift

    local codebase="${1:-}"
    if [ -n "$codebase" ] && [ "${codebase:0:2}" != "--" ]; then
        shift
    else
        codebase=""
    fi

    # Parse options
    local memory="$DEFAULT_MEMORY"
    local disk="$DEFAULT_DISK"
    local cpus="$DEFAULT_CPUS"
    local port="$DEFAULT_PORT"
    local ubuntu="$DEFAULT_UBUNTU"
    local no_cache="no"
    local git_depth=""
    local git_branch=""

    while [ $# -gt 0 ]; do
        case "$1" in
            --memory) memory="$2"; shift 2 ;;
            --disk) disk="$2"; shift 2 ;;
            --cpus) cpus="$2"; shift 2 ;;
            --port) port="$2"; shift 2 ;;
            --ubuntu) ubuntu="$2"; shift 2 ;;
            --no-cache) no_cache="yes"; shift ;;
            --depth) git_depth="$2"; shift 2 ;;
            --branch) git_branch="$2"; shift 2 ;;
            *) die "Unknown option: $1" ;;
        esac
    done

    local vm_name
    vm_name=$(get_vm_name "$name")

    # Check if instance already exists
    if [ -d "$STATE_DIR/$name" ]; then
        info "Instance '$name' already exists. Checking status..."
        if multipass info "$vm_name" 2>/dev/null | grep -q "Running"; then
            info "Instance is already running."
            local ip=$(get_vm_ip "$vm_name")
            info "OpenGrok URL: http://$ip:$port/source"
            return 0
        elif multipass info "$vm_name" &>/dev/null; then
            info "Restarting existing instance..."
            multipass start "$vm_name"
            local ip=$(get_vm_ip "$vm_name")
            info "Instance restarted. OpenGrok URL: http://$ip:$port/source"
            return 0
        fi
    fi

    # Check port availability
    check_port_available "$port" "$name"

    # Determine codebase type
    local codebase_type=""
    local source_path=""

    if [ -z "$codebase" ]; then
        info "No codebase specified, creating demo code..."
        codebase_type="demo"
        source_path=$(create_demo_codebase)
        codebase="$source_path"
    elif [ -d "$codebase" ]; then
        codebase_type="local"
        source_path="$(cd "$codebase" && pwd)"
    elif [[ "$codebase" =~ ^(https?://|git@|ssh://) ]]; then
        codebase_type="git"
        source_path="$codebase"
    else
        die "Codebase not found: $codebase"
    fi

    # Ensure dependencies cached
    ensure_cache "$no_cache"

    # Create VM
    info "Creating VM '$vm_name'..."
    multipass launch --name "$vm_name" --memory "$memory" --disk "$disk" --cpus "$cpus" "$ubuntu"

    # Create scripts directory in VM
    multipass exec "$vm_name" -- mkdir -p /home/ubuntu/scripts

    # Transfer scripts
    info "Transferring installation scripts..."
    multipass transfer "$SCRIPT_DIR/download-dependencies.sh" "$vm_name:/home/ubuntu/scripts/"
    multipass transfer "$SCRIPT_DIR/install-opengrok.sh" "$vm_name:/home/ubuntu/scripts/"

    # Transfer cached dependencies
    info "Transferring cached dependencies..."
    multipass exec "$vm_name" -- mkdir -p /tmp/opengrok-deps
    for file in "$CACHE_DIR"/*; do
        [ -f "$file" ] && multipass transfer "$file" "$vm_name:/tmp/opengrok-deps/"
    done

    # Handle codebase
    if [ "$codebase_type" = "local" ] || [ "$codebase_type" = "demo" ]; then
        info "Transferring source code..."
        multipass exec "$vm_name" -- mkdir -p /tmp/source-code
        multipass transfer -r "$source_path"/* "$vm_name:/tmp/source-code/" 2>/dev/null || {
            # Fallback: mount instead
            multipass mount "$source_path" "$vm_name:/mnt/source"
            multipass exec "$vm_name" -- sh -c 'cp -r /mnt/source/* /tmp/source-code/ 2>/dev/null || cp -r /mnt/source/. /tmp/source-code/'
        }
    elif [ "$codebase_type" = "git" ]; then
        info "Cloning git repository..."
        local git_cmd="git clone"
        [ -n "$git_depth" ] && git_cmd="$git_cmd --depth $git_depth"
        [ -n "$git_branch" ] && git_cmd="$git_cmd --branch $git_branch"
        git_cmd="$git_cmd $source_path /tmp/source-code"
        multipass exec "$vm_name" -- bash -c "$git_cmd"
    fi

    # Run installation
    info "Installing OpenGrok..."
    multipass exec "$vm_name" -- sudo bash /home/ubuntu/scripts/install-opengrok.sh \
        -y \
        --indexer-memory 2048 \
        --port "$port" \
        /tmp/opengrok-deps \
        /tmp/source-code

    # Save instance state
    save_instance_state "$name" "$codebase_type" "$source_path" "$port" "$memory" "$disk" "$cpus" "$ubuntu" "$git_depth" "$git_branch"

    # Wait for OpenGrok
    local ip=$(get_vm_ip "$vm_name")
    local url="http://$ip:$port/source"

    if wait_for_opengrok "$url"; then
        info ""
        info "=== Instance '$name' Ready ==="
        info "OpenGrok URL: $url"
        info "VM IP: $ip"
        info ""
    else
        warn "OpenGrok may not be ready yet. Check logs with: $0 logs $name"
    fi

    # Cleanup demo directory if created
    [ "$codebase_type" = "demo" ] && rm -rf "$source_path"
}

command_stop() {
    local name="${1:-}"
    [ -n "$name" ] || die "Usage: $0 stop <name>"

    check_instance_exists "$name"
    local vm_name
    vm_name=$(get_vm_name "$name")

    info "Stopping instance '$name'..."
    multipass stop "$vm_name" 2>/dev/null || die "Failed to stop VM"
    info "Instance stopped (VM preserved for quick restart)"
}

command_destroy() {
    local name="${1:-}"
    [ -n "$name" ] || die "Usage: $0 destroy <name>"

    check_instance_exists "$name"
    local vm_name
    vm_name=$(get_vm_name "$name")

    info "Destroying instance '$name'..."
    multipass delete "$vm_name" --purge 2>/dev/null || warn "VM may not exist"
    rm -rf "$STATE_DIR/$name"
    info "Instance destroyed"
}

command_status() {
    local name="${1:-}"
    [ -n "$name" ] || die "Usage: $0 status <name>"

    if [ ! -d "$STATE_DIR/$name" ]; then
        echo "not found"
        return 1
    fi

    local vm_name
    vm_name=$(get_vm_name "$name")
    if multipass info "$vm_name" 2>/dev/null | grep -q "Running"; then
        echo "running"
    elif multipass info "$vm_name" 2>/dev/null | grep -q "Stopped"; then
        echo "stopped"
    else
        echo "unknown"
    fi
}

command_info() {
    local name="${1:-}"
    [ -n "$name" ] || die "Usage: $0 info <name>"

    check_instance_exists "$name"
    local config=$(load_instance_state "$name")
    local vm_name
    vm_name=$(get_vm_name "$name")

    local port=$(echo "$config" | jq -r '.port')
    local codebase=$(echo "$config" | jq -r '.codebase_path')
    local created=$(echo "$config" | jq -r '.created')
    local memory=$(echo "$config" | jq -r '.memory')
    local cpus=$(echo "$config" | jq -r '.cpus')

    local status=$(command_status "$name")
    local ip=$(get_vm_ip "$vm_name" 2>/dev/null || echo "N/A")
    local url="http://$ip:$port/source"

    echo "Instance: $name"
    echo "Status: $status"
    echo "VM Name: $vm_name"
    echo "URL: $url"
    echo "IP: $ip"
    echo "Port: $port"
    echo "Codebase: $codebase"
    echo "Resources: $memory RAM, $cpus CPUs"
    echo "Created: $created"
}

command_open() {
    local name="${1:-}"
    [ -n "$name" ] || die "Usage: $0 open <name>"

    check_instance_exists "$name"
    local vm_name
    vm_name=$(get_vm_name "$name")
    local config=$(load_instance_state "$name")
    local port=$(echo "$config" | jq -r '.port')

    local status=$(command_status "$name")
    [ "$status" = "running" ] || die "Instance '$name' is not running. Start it with: $0 start $name"

    local ip=$(get_vm_ip "$vm_name")
    local url="http://$ip:$port/source"

    info "Opening $url in browser..."
    if command -v open &>/dev/null; then
        open "$url"
    elif command -v xdg-open &>/dev/null; then
        xdg-open "$url"
    else
        info "Please open this URL manually: $url"
    fi
}

command_list() {
    printf "%-20s %-10s %-6s %-15s %s\n" "NAME" "STATUS" "PORT" "IP" "CODEBASE"
    printf "%-20s %-10s %-6s %-15s %s\n" "----" "------" "----" "--" "--------"

    if [ ! -d "$STATE_DIR" ]; then
        return 0
    fi

    for config_file in "$STATE_DIR"/*/config.json; do
        [ -f "$config_file" ] || continue

        local name=$(jq -r '.name' "$config_file")
        local port=$(jq -r '.port' "$config_file")
        local codebase=$(jq -r '.codebase_path' "$config_file")
        local vm_name
    vm_name=$(get_vm_name "$name")

        local status="unknown"
        local ip="N/A"

        if multipass info "$vm_name" 2>/dev/null | grep -q "Running"; then
            status="running"
            ip=$(get_vm_ip "$vm_name")
        elif multipass info "$vm_name" 2>/dev/null | grep -q "Stopped"; then
            status="stopped"
        fi

        printf "%-20s %-10s %-6s %-15s %s\n" "$name" "$status" "$port" "$ip" "$codebase"
    done
}

command_reindex() {
    local name="${1:-}"
    [ -n "$name" ] || die "Usage: $0 reindex <name>"

    check_instance_exists "$name"
    local vm_name
    vm_name=$(get_vm_name "$name")
    local status=$(command_status "$name")

    [ "$status" = "running" ] || die "Instance '$name' is not running"

    info "Reindexing codebase..."
    multipass exec "$vm_name" -- sudo java -Xmx2048m \
        -jar /opt/opengrok/lib/opengrok.jar \
        -c /usr/local/bin/ctags \
        -s /var/opengrok/src \
        -d /var/opengrok/data \
        -H -P -S -G \
        -W /var/opengrok/etc/configuration.xml

    info "Reindexing complete"
}

command_shell() {
    local name="${1:-}"
    [ -n "$name" ] || die "Usage: $0 shell <name>"

    check_instance_exists "$name"
    local vm_name
    vm_name=$(get_vm_name "$name")

    multipass shell "$vm_name"
}

command_logs() {
    local name="${1:-}"
    [ -n "$name" ] || die "Usage: $0 logs <name> [--follow]"

    check_instance_exists "$name"
    local vm_name
    vm_name=$(get_vm_name "$name")
    shift || true

    local follow_flag=""
    if [ "${1:-}" = "--follow" ] || [ "${1:-}" = "-f" ]; then
        follow_flag="-f"
    fi

    multipass exec "$vm_name" -- sudo journalctl -u tomcat -n 100 $follow_flag
}

# Main dispatch
main() {
    check_multipass

    local cmd="${1:-help}"
    shift || true

    case "$cmd" in
        start|stop|destroy|status|info|open|list|reindex|shell|logs)
            "command_$cmd" "$@"
            ;;
        help|--help|-h)
            command_help
            ;;
        *)
            die "Unknown command: $cmd. Run: $0 help"
            ;;
    esac
}

main "$@"
