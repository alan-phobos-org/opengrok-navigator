# og - OpenGrok CLI

A command-line tool for searching OpenGrok instances via their REST API.

## Building

```bash
cd og
go build -o og
```

## Usage

```bash
# Initialize with server URL (saves to config)
./og init http://opengrok.example.com/source

# Initialize with web-links enabled by default
./og init http://opengrok.example.com/source --web-links

# Show current server URL configuration
./og status

# Basic full-text search
./og full "search term"

# Search for function/method definitions
./og def "functionName"

# Search for symbol references
./og symbol "symbolName"

# Search by file path
./og path "*.go"

# Search version control history
./og hist "commit message"

# Search within specific projects
./og full "TODO" --projects "project1,project2"

# List available projects
./og projects

# Limit results
./og full "error" --max 50

# Specify server URL directly (without init)
./og full "TODO" --server http://opengrok.example.com/source

# Open results in browser
./og full "TODO" --web

# Display clickable web links in terminal output
./og full "TODO" --web-links
./og full "TODO" -w

# Trace call graph with clickable links
./og trace malloc --projects myproject -w
```

## Commands

| Command | Description |
|---------|-------------|
| `init <url>` | Initialize with server URL (saves to config). Use `--web-links` to enable clickable links by default |
| `status` | Show current server URL configuration |
| `projects` | List available projects on the server |
| `full <query>` | Full text search |
| `def <query>` | Definition search (find where symbols are defined) |
| `symbol <query>` | Symbol search (find symbol references) |
| `path <pattern>` | Path search (search file paths) |
| `hist <query>` | History search (search version control history) |
| `trace <symbol>` | Trace call graph (find callers of a symbol) |

## Search Options

| Option | Description |
|--------|-------------|
| `--server <url>` | OpenGrok server URL (overrides config) |
| `--projects <list>` | Comma-separated list of projects to search |
| `--type <ext>` | File type filter |
| `--max <n>` | Maximum number of results (default: 25) |
| `--web` | Open results in system web browser |
| `--web-links`, `-w` | Display clickable OpenGrok URLs for file references |
| `--quiet` | Suppress progress output (spinners) |

## Trace Options

| Option | Description |
|--------|-------------|
| `--depth <n>` | Maximum traversal depth (default: 2) |
| `--max-total <n>` | Maximum total nodes to explore (default: 100) |
| `--web-links`, `-w` | Display clickable OpenGrok URLs for file references |

## Testing

Run unit tests:
```bash
go test -v
```

Run integration tests (requires network access to https://src.illumos.org):
```bash
go test -tags=integration -v -timeout 60s
```

## API Compatibility

This tool uses the OpenGrok REST API v1 (`/api/v1/search` and `/api/v1/projects` endpoints).

## Configuring the LLM CLI Tool

If you're using Simon Willison's [llm](https://github.com/simonw/llm) command line tool alongside `og`, here's how to configure it:

### Installing llm

```bash
pip install llm
```

### Setting the Default Model

View the current default model:
```bash
llm models default
```

Set a new default model:
```bash
llm models default gpt-4o
```

### Setting API Keys

For OpenAI:
```bash
llm keys set openai
# Paste your API key when prompted
```

For other providers, use the appropriate key name:
```bash
llm keys set anthropic
llm keys set openrouter
```

Alternatively, set the API key via environment variable:
```bash
export OPENAI_API_KEY="sk-your-key-here"
```

### Configuring an OpenAI-Compatible Proxy

To use a custom OpenAI-compatible proxy server (e.g., a local proxy or alternative endpoint), create or edit the `extra-openai-models.yaml` file:

```bash
# Find the configuration directory
llm logs path
# The extra-openai-models.yaml file goes in the same directory
```

Add your proxy configuration to `extra-openai-models.yaml`:

```yaml
- model_id: my-proxy-model
  model_name: gpt-4o
  api_base: "http://localhost:8080/v1"
  api_key_name: my-proxy-key
```

Configuration options:
- `model_id`: The name you'll use to reference this model in llm
- `model_name`: The model identifier to pass to the API
- `api_base`: The proxy server URL (host and port)
- `api_key_name`: Name of the stored API key to use (set with `llm keys set my-proxy-key`)

Set the API key for your proxy:
```bash
llm keys set my-proxy-key
# Paste your proxy API key when prompted
```

Use the proxied model:
```bash
llm -m my-proxy-model "your prompt here"
```

Or set it as the default:
```bash
llm models default my-proxy-model
```

Verify your configuration:
```bash
llm models --options -m my-proxy-model
```

For more details, see the [llm documentation](https://llm.datasette.io/en/stable/other-models.html#openai-compatible-models).
