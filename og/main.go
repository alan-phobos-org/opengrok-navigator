package main

import (
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/briandowns/spinner"
	flag "github.com/spf13/pflag"
)

// ANSI color codes for terminal output
const (
	colorReset   = "\033[0m"
	colorBold    = "\033[1m"
	colorMagenta = "\033[35m"
	colorRed     = "\033[31m"
	colorCyan    = "\033[36m"
)

// htmlTagRegex is pre-compiled for stripping HTML tags from output
var htmlTagRegex = regexp.MustCompile(`<[^>]+>`)

func main() {
	// Check for subcommands first
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "init":
			handleInit()
			return
		case "status":
			handleStatus()
			return
		case "projects":
			handleProjects()
			return
		case "full", "def", "symbol", "path", "hist":
			handleSearch(os.Args[1])
			return
		case "trace":
			handleTrace()
			return
		case "-h", "--help", "help":
			printUsage(os.Stdout)
			return
		}
	}

	// No valid command provided
	printUsage(os.Stderr)
	os.Exit(1)
}

func printUsage(w *os.File) {
	fmt.Fprintf(w, "og - Search OpenGrok instances from the command line\n\n")
	fmt.Fprintf(w, "Usage: %s <command> [options]\n\n", os.Args[0])
	fmt.Fprintf(w, "Commands:\n")
	fmt.Fprintf(w, "  init <server-url>    Initialize with server URL (saves to config)\n")
	fmt.Fprintf(w, "  status               Show current server URL configuration\n")
	fmt.Fprintf(w, "  projects             List available projects\n")
	fmt.Fprintf(w, "  full <query>         Full text search\n")
	fmt.Fprintf(w, "  def <query>          Definition search (find where symbols are defined)\n")
	fmt.Fprintf(w, "  symbol <query>       Symbol search (find symbol references)\n")
	fmt.Fprintf(w, "  path <pattern>       Path search (search file paths)\n")
	fmt.Fprintf(w, "  hist <query>         History search (search version control history)\n")
	fmt.Fprintf(w, "  trace <symbol>       Trace call graph (find callers of a symbol)\n")
	fmt.Fprintf(w, "\nSearch Options:\n")
	fmt.Fprintf(w, "  -s, --server <url>       OpenGrok server URL (overrides config)\n")
	fmt.Fprintf(w, "  -p, --projects <list>    Comma-separated list of projects to search\n")
	fmt.Fprintf(w, "  -t, --type <ext>         File type filter\n")
	fmt.Fprintf(w, "  -m, --max <n>            Maximum number of results (default: 25)\n")
	fmt.Fprintf(w, "      --web                Open results in system web browser\n")
	fmt.Fprintf(w, "  -w, --web-links          Display clickable OpenGrok URLs for file references\n")
	fmt.Fprintf(w, "  -q, --quiet              Suppress progress output (spinners)\n")
	fmt.Fprintf(w, "\nAuthentication Options:\n")
	fmt.Fprintf(w, "      --username <user>    Username for basic authentication\n")
	fmt.Fprintf(w, "      --password <pass>    Password for basic authentication\n")
	fmt.Fprintf(w, "      --api-key <key>      API key for authentication\n")
	fmt.Fprintf(w, "      --bearer-token <tok> Bearer token for authentication\n")
	fmt.Fprintf(w, "\nTrace Options:\n")
	fmt.Fprintf(w, "  -d, --depth <n>          Maximum traversal depth (default: 2)\n")
	fmt.Fprintf(w, "      --max-total <n>      Maximum total nodes to explore (default: 100)\n")
	fmt.Fprintf(w, "\nExamples:\n")
	fmt.Fprintf(w, "  %s init http://opengrok.example.com/source\n", os.Args[0])
	fmt.Fprintf(w, "  %s status\n", os.Args[0])
	fmt.Fprintf(w, "  %s full \"TODO\"\n", os.Args[0])
	fmt.Fprintf(w, "  %s def \"main\" --projects myproject\n", os.Args[0])
	fmt.Fprintf(w, "  %s projects\n", os.Args[0])
	fmt.Fprintf(w, "  %s full \"TODO\" --web\n", os.Args[0])
	fmt.Fprintf(w, "  %s trace malloc --depth 3 --projects myproject\n", os.Args[0])
}

func handleStatus() {
	config, err := LoadConfig()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: failed to load config: %v\n", err)
		os.Exit(1)
	}
	if config == nil || config.ServerURL == "" {
		fmt.Println("No server URL configured.")
		fmt.Printf("Run '%s init <server-url>' to configure.\n", os.Args[0])
		os.Exit(0)
	}
	fmt.Printf("Server URL: %s\n", config.ServerURL)

	// Show authentication status
	if config.BearerToken != "" {
		fmt.Println("Authentication: Bearer token configured")
	} else if config.APIKey != "" {
		fmt.Println("Authentication: API key configured")
	} else if config.Username != "" {
		fmt.Printf("Authentication: Basic auth (user: %s)\n", config.Username)
	} else {
		fmt.Println("Authentication: None")
	}

	// Show web-links setting
	if config.WebLinks {
		fmt.Println("Web links: Enabled by default")
	}
}

// AuthOptions holds authentication options parsed from flags
type AuthOptions struct {
	Username    string
	Password    string
	APIKey      string
	BearerToken string
}

// configureClientAuth applies authentication settings to a client
// Priority: flags > config file
func configureClientAuth(client *Client, opts AuthOptions) {
	// Load config for defaults
	config, _ := LoadConfig()

	// Apply flags first (highest priority)
	if opts.BearerToken != "" {
		client.BearerToken = opts.BearerToken
	} else if opts.APIKey != "" {
		client.APIKey = opts.APIKey
	} else if opts.Username != "" {
		client.Username = opts.Username
		client.Password = opts.Password
	} else if config != nil {
		// Fall back to config file
		if config.BearerToken != "" {
			client.BearerToken = config.BearerToken
		} else if config.APIKey != "" {
			client.APIKey = config.APIKey
		} else if config.Username != "" {
			client.Username = config.Username
			client.Password = config.Password
		}
	}
}

func handleProjects() {
	// Parse flags for projects command
	fs := flag.NewFlagSet("projects", flag.ExitOnError)
	serverURL := fs.StringP("server", "s", "", "OpenGrok server URL (overrides config)")
	quietMode := fs.BoolP("quiet", "q", false, "Suppress progress output (spinners)")
	username := fs.String("username", "", "Username for basic authentication")
	password := fs.String("password", "", "Password for basic authentication")
	apiKey := fs.String("api-key", "", "API key for authentication")
	bearerToken := fs.String("bearer-token", "", "Bearer token for authentication")
	fs.Parse(os.Args[2:])

	// Get server URL
	url := getServerURL(*serverURL)

	// Create client
	client, err := NewClient(url)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	// Configure authentication
	configureClientAuth(client, AuthOptions{
		Username:    *username,
		Password:    *password,
		APIKey:      *apiKey,
		BearerToken: *bearerToken,
	})

	s := newSpinner("Fetching projects...")
	if !*quietMode && isTerminal(os.Stderr) {
		s.Start()
	}
	projectsList, err := client.GetProjects()
	s.Stop()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error listing projects: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Available projects:")
	for _, project := range projectsList {
		fmt.Printf("  - %s\n", project)
	}
}

func handleSearch(searchType string) {
	// Parse flags for search command
	fs := flag.NewFlagSet(searchType, flag.ExitOnError)
	serverURL := fs.StringP("server", "s", "", "OpenGrok server URL (overrides config)")
	typeFilter := fs.StringP("type", "t", "", "File type filter")
	projects := fs.StringP("projects", "p", "", "Projects to search (comma-separated)")
	maxResults := fs.IntP("max", "m", 25, "Maximum number of results")
	webMode := fs.Bool("web", false, "Open results in system web browser")
	webLinks := fs.BoolP("web-links", "w", false, "Display clickable OpenGrok URLs for file references")
	quietMode := fs.BoolP("quiet", "q", false, "Suppress progress output (spinners)")
	username := fs.String("username", "", "Username for basic authentication")
	password := fs.String("password", "", "Password for basic authentication")
	apiKey := fs.String("api-key", "", "API key for authentication")
	bearerToken := fs.String("bearer-token", "", "Bearer token for authentication")

	fs.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: %s %s <query> [options]\n\n", os.Args[0], searchType)
		fmt.Fprintf(os.Stderr, "Options:\n")
		fs.PrintDefaults()
	}

	// We need at least one argument (the query)
	if len(os.Args) < 3 {
		fs.Usage()
		os.Exit(1)
	}

	// The query is the first argument after the command
	query := os.Args[2]

	// Check if query looks like a flag
	if strings.HasPrefix(query, "-") {
		fmt.Fprintf(os.Stderr, "Error: query is required before options\n\n")
		fs.Usage()
		os.Exit(1)
	}

	// Parse remaining flags (after query)
	fs.Parse(os.Args[3:])

	// Get server URL
	url := getServerURL(*serverURL)

	// Create client
	client, err := NewClient(url)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	// Configure authentication
	configureClientAuth(client, AuthOptions{
		Username:    *username,
		Password:    *password,
		APIKey:      *apiKey,
		BearerToken: *bearerToken,
	})

	// Build search options based on search type
	opts := SearchOptions{
		Type:       *typeFilter,
		Projects:   *projects,
		MaxResults: *maxResults,
	}

	switch searchType {
	case "full":
		opts.Full = query
	case "def":
		opts.Def = query
	case "symbol":
		opts.Symbol = query
	case "path":
		opts.Path = query
	case "hist":
		opts.Hist = query
	}

	// Perform search with spinner
	s := newSpinner("Searching...")
	if !*quietMode && isTerminal(os.Stderr) {
		s.Start()
	}
	result, err := client.Search(opts)
	s.Stop()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error performing search: %v\n", err)
		os.Exit(1)
	}

	// Handle web mode or display results
	if *webMode {
		openSearchResults(url, result)
	} else {
		useColor := isTerminal(os.Stdout)
		// Use config's WebLinks setting as default if flag wasn't explicitly set
		enableWebLinks := *webLinks
		if !*webLinks {
			if cfg, _ := LoadConfig(); cfg != nil {
				enableWebLinks = cfg.WebLinks
			}
		}
		printResults(result, useColor, enableWebLinks, url)
	}
}

// getServerURL returns the server URL from the flag or config
func getServerURL(flagURL string) string {
	if flagURL != "" {
		return strings.TrimSuffix(flagURL, "/")
	}

	config, err := LoadConfig()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Warning: failed to load config: %v\n", err)
	} else if config != nil && config.ServerURL != "" {
		return config.ServerURL
	}

	fmt.Fprintf(os.Stderr, "Error: no server URL configured\n")
	fmt.Fprintf(os.Stderr, "Run '%s init <server-url>' or use --server flag\n", os.Args[0])
	os.Exit(1)
	return ""
}

func printResults(resp *SearchResponse, useColor bool, webLinks bool, serverURL string) {
	if resp.ResultCount == 0 {
		fmt.Println("No results found.")
		return
	}

	for project, results := range resp.Results {
		for _, r := range results {
			path := r.Path
			if path == "" {
				path = r.Directory
				if path != "" && !strings.HasSuffix(path, "/") {
					path += "/"
				}
				path += r.Filename
			}

			line := strings.TrimSpace(r.Line)
			lineNo := string(r.LineNo)

			// Construct web URL if --web-links is enabled
			var webURL string
			if webLinks {
				webURL = fmt.Sprintf("%s/xref/%s%s", serverURL, project, path)
				if lineNo != "" {
					webURL += "#" + lineNo
				}
			}

			if useColor {
				// Format: project/path:line:content (with colors like ripgrep)
				if lineNo != "" {
					if webLinks {
						// Add clickable link using OSC 8 hyperlink escape sequence
						fmt.Printf("\033]8;;%s\033\\%s%s%s\033]8;;\033\\:%s%s%s:%s\n",
							webURL,
							colorMagenta, project+path, colorReset,
							colorCyan, lineNo, colorReset,
							highlightMatch(line))
					} else {
						fmt.Printf("%s%s%s:%s%s%s:%s\n",
							colorMagenta, project+path, colorReset,
							colorCyan, lineNo, colorReset,
							highlightMatch(line))
					}
				} else {
					// No line number available for this result
					if webLinks {
						fmt.Printf("\033]8;;%s\033\\%s%s%s\033]8;;\033\\:%s\n",
							webURL,
							colorMagenta, project+path, colorReset,
							highlightMatch(line))
					} else {
						fmt.Printf("%s%s%s:%s\n",
							colorMagenta, project+path, colorReset,
							highlightMatch(line))
					}
				}
			} else {
				if lineNo != "" {
					if webLinks {
						// Plain mode with web link - only path is clickable
						fmt.Printf("\033]8;;%s\033\\%s\033]8;;\033\\:%s:%s\n",
							webURL, project+path, lineNo, stripHTMLTags(line))
					} else {
						fmt.Printf("%s:%s:%s\n", project+path, lineNo, stripHTMLTags(line))
					}
				} else {
					// No line number available for this result
					if webLinks {
						fmt.Printf("\033]8;;%s\033\\%s\033]8;;\033\\:%s\n",
							webURL, project+path, stripHTMLTags(line))
					} else {
						fmt.Printf("%s:%s\n", project+path, stripHTMLTags(line))
					}
				}
			}
		}
	}
}

// highlightMatch adds bold formatting to <b> tags in the line
// OpenGrok returns matches wrapped in <b> tags
func highlightMatch(line string) string {
	// Replace <b> with bold+red, </b> with reset
	result := strings.ReplaceAll(line, "<b>", colorBold+colorRed)
	result = strings.ReplaceAll(result, "</b>", colorReset)
	// Strip any other HTML tags that might be in the response
	result = stripHTMLTags(result)
	return result
}

// stripHTMLTags removes HTML tags from the string
func stripHTMLTags(s string) string {
	return htmlTagRegex.ReplaceAllString(s, "")
}

func openSearchResults(serverURL string, resp *SearchResponse) {
	if resp.ResultCount == 0 {
		fmt.Println("No results found.")
		return
	}

	// Count total results and capture single result if there's exactly one
	totalResults := 0
	var singleProject string
	var singleResult SearchResult
	for project, results := range resp.Results {
		for _, r := range results {
			totalResults++
			if totalResults == 1 {
				singleProject = project
				singleResult = r
			}
		}
	}

	var webURL string
	if totalResults == 1 {
		// Open the specific file at the line number
		path := singleResult.Path
		if path == "" {
			path = singleResult.Directory
			if path != "" && !strings.HasSuffix(path, "/") {
				path += "/"
			}
			path += singleResult.Filename
		}
		webURL = fmt.Sprintf("%s/xref/%s%s", serverURL, singleProject, path)
		if singleResult.LineNo != "" {
			webURL += "#" + string(singleResult.LineNo)
		}
		fmt.Printf("Opening file: %s%s\n", singleProject, path)
	} else {
		// Open the search results page in the web interface
		// OpenGrok web interface uses the same base URL with /search path
		webURL = serverURL + "/search"
		fmt.Printf("Opening search results (%d results) in browser...\n", resp.ResultCount)
	}

	if err := openBrowser(webURL); err != nil {
		fmt.Fprintf(os.Stderr, "Error opening browser: %v\n", err)
		fmt.Fprintf(os.Stderr, "URL: %s\n", webURL)
		os.Exit(1)
	}
}

func handleInit() {
	// Parse flags for init command
	fs := flag.NewFlagSet("init", flag.ExitOnError)
	username := fs.String("username", "", "Username for basic authentication")
	password := fs.String("password", "", "Password for basic authentication")
	apiKey := fs.String("api-key", "", "API key for authentication")
	bearerToken := fs.String("bearer-token", "", "Bearer token for authentication")
	webLinks := fs.BoolP("web-links", "w", false, "Enable web links by default in output")

	fs.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: %s init <server-url> [options]\n", os.Args[0])
		fmt.Fprintf(os.Stderr, "Example: %s init http://opengrok.example.com/source\n", os.Args[0])
		fmt.Fprintf(os.Stderr, "         %s init http://opengrok.example.com/source --username user --password pass\n", os.Args[0])
		fmt.Fprintf(os.Stderr, "\nOptions:\n")
		fs.PrintDefaults()
	}

	if len(os.Args) < 3 {
		fs.Usage()
		os.Exit(1)
	}

	// The server URL is the first argument after "init"
	serverURL := os.Args[2]

	// Check if serverURL looks like a flag
	if strings.HasPrefix(serverURL, "-") {
		fmt.Fprintf(os.Stderr, "Error: server URL is required before options\n\n")
		fs.Usage()
		os.Exit(1)
	}

	serverURL = strings.TrimSuffix(serverURL, "/")

	// Parse remaining flags (after server URL)
	fs.Parse(os.Args[3:])

	// Validate the URL by trying to create a client
	_, err := NewClient(serverURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: invalid server URL: %v\n", err)
		os.Exit(1)
	}

	config := &Config{
		ServerURL:   serverURL,
		Username:    *username,
		Password:    *password,
		APIKey:      *apiKey,
		BearerToken: *bearerToken,
		WebLinks:    *webLinks,
	}

	if err := SaveConfig(config); err != nil {
		fmt.Fprintf(os.Stderr, "Error: failed to save config: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Server URL saved: %s\n", serverURL)
	if *bearerToken != "" {
		fmt.Println("Authentication: Bearer token configured")
	} else if *apiKey != "" {
		fmt.Println("Authentication: API key configured")
	} else if *username != "" {
		fmt.Println("Authentication: Basic auth configured")
	}
	if *webLinks {
		fmt.Println("Web links: Enabled by default")
	}
	fmt.Println("You can now run searches without the --server flag.")
}

// newSpinner creates a new spinner with the given message.
// Uses the same spinner style as the gh CLI (CharSet 11 - dots).
// Returns a no-op spinner if stderr is not a terminal.
func newSpinner(message string) *spinner.Spinner {
	s := spinner.New(spinner.CharSets[11], 120*time.Millisecond, spinner.WithWriter(os.Stderr))
	s.Suffix = " " + message
	s.FinalMSG = ""
	return s
}

// isTerminal returns true if the file is a terminal.
func isTerminal(f *os.File) bool {
	stat, err := f.Stat()
	if err != nil {
		return false
	}
	return (stat.Mode() & os.ModeCharDevice) != 0
}

func handleTrace() {
	// Parse flags for trace command
	fs := flag.NewFlagSet("trace", flag.ExitOnError)
	serverURL := fs.StringP("server", "s", "", "OpenGrok server URL (overrides config)")
	projects := fs.StringP("projects", "p", "", "Projects to search (comma-separated)")
	typeFilter := fs.StringP("type", "t", "", "File type filter")
	depth := fs.IntP("depth", "d", 2, "Maximum traversal depth")
	maxTotal := fs.Int("max-total", 100, "Maximum total nodes to explore")
	webLinks := fs.BoolP("web-links", "w", false, "Display clickable OpenGrok URLs for file references")
	quietMode := fs.BoolP("quiet", "q", false, "Suppress progress output (spinners)")
	username := fs.String("username", "", "Username for basic authentication")
	password := fs.String("password", "", "Password for basic authentication")
	apiKey := fs.String("api-key", "", "API key for authentication")
	bearerToken := fs.String("bearer-token", "", "Bearer token for authentication")

	fs.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: %s trace <symbol> [options]\n\n", os.Args[0])
		fmt.Fprintf(os.Stderr, "Trace the call graph by finding callers of a symbol.\n\n")
		fmt.Fprintf(os.Stderr, "Options:\n")
		fs.PrintDefaults()
	}

	// We need at least one argument (the symbol)
	if len(os.Args) < 3 {
		fs.Usage()
		os.Exit(1)
	}

	// The symbol is the first argument after the command
	symbol := os.Args[2]

	// Check if symbol looks like a flag
	if strings.HasPrefix(symbol, "-") {
		fmt.Fprintf(os.Stderr, "Error: symbol is required before options\n\n")
		fs.Usage()
		os.Exit(1)
	}

	// Parse remaining flags (after symbol)
	fs.Parse(os.Args[3:])

	// Get server URL
	url := getServerURL(*serverURL)

	// Create client
	client, err := NewClient(url)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	// Configure authentication
	configureClientAuth(client, AuthOptions{
		Username:    *username,
		Password:    *password,
		APIKey:      *apiKey,
		BearerToken: *bearerToken,
	})

	// Build trace options
	opts := TraceOptions{
		Symbol:    symbol,
		Depth:     *depth,
		Direction: "callers", // Only callers supported in v1
		MaxTotal:  *maxTotal,
		Projects:  *projects,
		Type:      *typeFilter,
	}

	// Perform trace with spinner
	s := newSpinner("Tracing call graph...")
	if !*quietMode && isTerminal(os.Stderr) {
		s.Start()
	}
	result, err := Trace(client, opts)
	s.Stop()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error tracing call graph: %v\n", err)
		os.Exit(1)
	}

	// Display results
	useColor := isTerminal(os.Stdout)
	// Use config's WebLinks setting as default if flag wasn't explicitly set
	enableWebLinks := *webLinks
	if !*webLinks {
		if cfg, _ := LoadConfig(); cfg != nil {
			enableWebLinks = cfg.WebLinks
		}
	}
	output := FormatTree(result, useColor, enableWebLinks, url)
	fmt.Print(output)

	// Show summary
	if result.TotalNodes > 0 {
		fmt.Printf("\nFound %d call locations.\n", result.TotalNodes)
	} else {
		fmt.Println("\nNo callers found.")
	}
}
