package main

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// TraceOptions configures the call graph exploration
type TraceOptions struct {
	Symbol    string // The function/symbol to trace
	Depth     int    // Maximum traversal depth (default: 2)
	Direction string // "callers" only in v1 (callees would require source parsing)
	MaxTotal  int    // Max total nodes to explore (prevents runaway)
	Projects  string // Projects to search in (comma-separated)
	Type      string // File type filter
}

// CallNode represents a node in the call graph
type CallNode struct {
	Symbol   string      // Function/symbol name
	FilePath string      // Full file path where this call occurs
	LineNo   string      // Line number
	Relation string      // "caller" or "callee"
	Children []*CallNode // Child nodes (further callers/callees)
}

// TraceResult contains the trace output and metadata
type TraceResult struct {
	Root       *CallNode // Root of the call tree
	TotalNodes int       // Total nodes explored
	MaxReached bool      // True if MaxTotal was reached
}

// Trace performs call graph exploration starting from the given symbol
func Trace(client *Client, opts TraceOptions) (*TraceResult, error) {
	if opts.Depth <= 0 {
		opts.Depth = 2 // Default depth
	}
	if opts.MaxTotal <= 0 {
		opts.MaxTotal = 100 // Conservative default
	}
	if opts.Direction == "" {
		opts.Direction = "callers" // Only callers supported in v1
	}

	if opts.Direction != "callers" {
		return nil, fmt.Errorf("only --direction=callers is supported in this version (callees requires source parsing)")
	}

	root := &CallNode{
		Symbol:   opts.Symbol,
		Relation: "root",
	}

	result := &TraceResult{
		Root:       root,
		TotalNodes: 0, // Don't count root node against the limit
	}

	// Track visited symbols to prevent cycles
	visited := make(map[string]bool)
	visited[opts.Symbol] = true

	// BFS queue: (node, remaining depth)
	type queueItem struct {
		node  *CallNode
		depth int
	}
	queue := []queueItem{{root, opts.Depth}}

	for len(queue) > 0 {
		item := queue[0]
		queue = queue[1:]

		if item.depth == 0 {
			continue
		}

		if result.TotalNodes >= opts.MaxTotal {
			result.MaxReached = true
			break
		}

		// Skip if the node has no symbol to search for
		if item.node.Symbol == "" {
			continue
		}

		// Find callers of the current symbol using symbol search
		searchOpts := SearchOptions{
			Symbol:     item.node.Symbol,
			Projects:   opts.Projects,
			Type:       opts.Type,
			MaxResults: 50, // Reasonable batch size
		}

		resp, err := client.Search(searchOpts)
		if err != nil {
			// Log error but continue with other branches
			continue
		}

		// Group results by file and extract unique caller locations
		// Use xref API to extract function names when depth allows deeper traversal
		useXref := opts.Depth > 1
		callers := extractCallers(client, resp, item.node.Symbol, useXref)

		// Sort callers for deterministic output (numerically by line number)
		sort.Slice(callers, func(i, j int) bool {
			if callers[i].FilePath != callers[j].FilePath {
				return callers[i].FilePath < callers[j].FilePath
			}
			// Parse line numbers as integers for proper numerical sorting
			lineI, _ := strconv.Atoi(callers[i].LineNo)
			lineJ, _ := strconv.Atoi(callers[j].LineNo)
			return lineI < lineJ
		})

		for _, caller := range callers {
			if result.TotalNodes >= opts.MaxTotal {
				result.MaxReached = true
				break
			}

			// Use file:line as unique identifier to prevent duplicate locations
			locationKey := caller.FilePath + ":" + caller.LineNo
			if visited[locationKey] {
				continue
			}
			visited[locationKey] = true

			// Also track by symbol name to prevent cycles in the call graph
			if caller.Symbol != "" && visited[caller.Symbol] {
				continue
			}
			if caller.Symbol != "" {
				visited[caller.Symbol] = true
			}

			child := &CallNode{
				Symbol:   caller.Symbol,
				FilePath: caller.FilePath,
				LineNo:   caller.LineNo,
				Relation: "caller",
			}
			item.node.Children = append(item.node.Children, child)
			result.TotalNodes++

			// Only queue for further exploration if we have a symbol name
			if caller.Symbol != "" {
				queue = append(queue, queueItem{child, item.depth - 1})
			}
		}
	}

	return result, nil
}

// callerInfo holds extracted caller information
type callerInfo struct {
	Symbol   string
	FilePath string
	LineNo   string
}

// extractCallers extracts caller information from search results
// If useXref is true, fetches surrounding context to determine enclosing function names
// This enables depth > 1 traversal but is slower due to additional API calls
func extractCallers(client *Client, resp *SearchResponse, searchedSymbol string, useXref bool) []callerInfo {
	var callers []callerInfo
	seen := make(map[string]bool)

	// Cache file contents to avoid refetching the same file for multiple line numbers
	fileCache := make(map[string][]string)

	for filePath, results := range resp.Results {
		for _, r := range results {
			lineNo := string(r.LineNo)
			if lineNo == "" || lineNo == "0" {
				continue
			}

			// Create a unique key for this location
			key := filePath + ":" + lineNo
			if seen[key] {
				continue
			}
			seen[key] = true

			var symbol string
			if useXref {
				// Fetch surrounding context to find enclosing function
				// This is slower but enables multi-level traversal
				lineNoInt := 0
				fmt.Sscanf(lineNo, "%d", &lineNoInt)
				if lineNoInt > 0 {
					symbol = extractFunctionNameFromContextCached(client, filePath, lineNoInt, fileCache)
				}
			}

			// Fallback to simple line-based extraction if xref didn't work
			if symbol == "" {
				symbol = extractSymbolFromLine(r.Line, searchedSymbol)
			}

			callers = append(callers, callerInfo{
				Symbol:   symbol,
				FilePath: filePath,
				LineNo:   lineNo,
			})
		}
	}

	return callers
}

// extractSymbolFromLine attempts to extract a caller function name from a source line
// This is a heuristic approach - we look for patterns that suggest function calls
// Returns empty string if no caller can be identified
//
// LIMITATION: The basic OpenGrok search API only returns the line where a symbol
// is referenced, not the enclosing function name. To find the enclosing function,
// we would need to:
//  1. Fetch surrounding lines using OpenGrok's xref API
//  2. Parse backwards to find the function signature
//  3. Handle complex cases (nested functions, macros, etc.)
//
// For now, this returns empty string, which means --depth > 1 will not traverse
// beyond direct callers. Future enhancement: use xref API for context.
func extractSymbolFromLine(line, searchedSymbol string) string {
	// Strip HTML tags that OpenGrok adds for highlighting
	cleaned := stripHTMLTags(line)
	cleaned = strings.TrimSpace(cleaned)

	// Skip obvious non-caller patterns
	lowerLine := strings.ToLower(cleaned)
	if strings.HasPrefix(lowerLine, "//") || strings.HasPrefix(lowerLine, "/*") ||
		strings.HasPrefix(lowerLine, "*") || strings.HasPrefix(lowerLine, "#") {
		return "" // Comment or preprocessor
	}

	// TODO: Implement function name extraction using OpenGrok xref API
	// For now, return empty - the file:line location is still useful
	return ""
}

// extractFunctionNameFromContextCached fetches surrounding source lines and parses
// backwards to find the enclosing function name.
// Uses a cache to avoid refetching the same file multiple times.
func extractFunctionNameFromContextCached(client *Client, filePath string, lineNo int, cache map[string][]string) string {
	// Fetch lines around the target line (look back up to 100 lines)
	startLine := lineNo - 100
	if startLine < 1 {
		startLine = 1
	}

	// Check cache first - we cache the entire file to help with multiple lookups
	cacheKey := filePath
	lines, found := cache[cacheKey]

	if !found {
		// Fetch the entire file and cache it (more efficient than many small requests)
		var err error
		lines, err = client.GetFileLines(filePath, 1, 999999) // Fetch whole file
		if err != nil {
			// If we can't fetch context, return empty
			return ""
		}
		cache[cacheKey] = lines
	}

	// Extract the range we need from the cached full file
	// Lines are 1-indexed, array is 0-indexed
	var contextLines []string
	for i := startLine - 1; i < lineNo && i < len(lines); i++ {
		if i >= 0 {
			contextLines = append(contextLines, lines[i])
		}
	}

	// Parse backwards to find function definition
	funcName := parseFunctionName(contextLines)
	return funcName
}

// parseFunctionName parses source lines backwards to find the enclosing function
// Handles C/C++ function definitions with patterns like:
//
//	return_type function_name(params) {
//	type* function_name(params) {
//	static inline type function_name(params) {
func parseFunctionName(lines []string) string {
	// Work backwards from the last line
	for i := len(lines) - 1; i >= 0; i-- {
		line := lines[i] // Keep original indentation for analysis
		trimmed := strings.TrimSpace(line)

		// Skip empty lines, comments, and preprocessor
		if trimmed == "" || strings.HasPrefix(trimmed, "//") ||
			strings.HasPrefix(trimmed, "/*") || strings.HasPrefix(trimmed, "*") ||
			strings.HasPrefix(trimmed, "#") {
			continue
		}

		// Function definitions start at column 0 or with minimal indentation
		// Skip lines that are clearly inside a function body (indented)
		leadingSpaces := len(line) - len(strings.TrimLeft(line, " \t"))
		if leadingSpaces > 1 {
			continue // Too indented to be a function definition
		}

		// Skip lines that look like function calls or statements, not definitions:
		// - Lines starting with "if", "for", "while", "return", etc.
		// - Lines containing "=" before "(" (assignments)
		// - Lines containing ";" (statements)
		if strings.Contains(trimmed, ";") {
			continue
		}
		if strings.Contains(trimmed, "=") && strings.Index(trimmed, "=") < strings.Index(trimmed, "(") {
			continue
		}

		// Look for function definition pattern: identifier followed by (
		idx := strings.Index(trimmed, "(")
		if idx == -1 {
			continue
		}

		// Extract tokens before the (
		before := trimmed[:idx]
		tokens := strings.Fields(before)

		if len(tokens) == 0 {
			continue
		}

		// The last token before ( is likely the function name
		funcName := tokens[len(tokens)-1]

		// Clean up any pointer/reference markers (from either side)
		funcName = strings.Trim(funcName, "*&")

		// Skip common keywords that aren't function names
		if isCommonKeyword(funcName) {
			continue
		}

		// Skip if it looks like a macro or type cast
		if strings.ToUpper(funcName) == funcName && len(funcName) > 2 {
			continue // ALL_CAPS likely a macro
		}

		// For a function definition, the opening brace should be on this line
		// or within the next few lines (for multi-line parameter lists)
		if strings.Contains(trimmed, "{") {
			return funcName
		}

		// Look ahead a few lines for opening brace (multi-line params)
		for j := i + 1; j < len(lines) && j < i+10; j++ {
			nextLine := strings.TrimSpace(lines[j])
			// If we hit another function-like pattern, stop looking
			if strings.Contains(nextLine, ";") && !strings.Contains(nextLine, "{") {
				break
			}
			if strings.HasPrefix(nextLine, "{") || strings.Contains(nextLine, ")") && strings.Contains(nextLine, "{") {
				return funcName
			}
		}
	}

	return ""
}

// isCommonKeyword returns true if s is a common C/C++ keyword or construct
func isCommonKeyword(s string) bool {
	keywords := map[string]bool{
		"if": true, "for": true, "while": true, "switch": true,
		"return": true, "sizeof": true, "typeof": true, "struct": true,
		"union": true, "enum": true, "case": true, "do": true,
	}
	return keywords[s]
}

// FormatTree formats the call graph as an ASCII tree
func FormatTree(result *TraceResult, useColor bool, webLinks bool, serverURL string) string {
	var sb strings.Builder

	// Root node
	if useColor {
		sb.WriteString(colorBold + result.Root.Symbol + colorReset + "\n")
	} else {
		sb.WriteString(result.Root.Symbol + "\n")
	}

	// Format children
	formatTreeNode(&sb, result.Root.Children, "", useColor, webLinks, serverURL)

	// Add footer if max was reached
	if result.MaxReached {
		sb.WriteString(fmt.Sprintf("\n... (stopped at %d nodes, use --max-total to increase)\n", result.TotalNodes))
	}

	return sb.String()
}

// formatTreeNode recursively formats tree nodes
func formatTreeNode(sb *strings.Builder, children []*CallNode, prefix string, useColor bool, webLinks bool, serverURL string) {
	for i, child := range children {
		isLast := i == len(children)-1

		// Choose connector
		var connector, childPrefix string
		if isLast {
			connector = "└── "
			childPrefix = prefix + "    "
		} else {
			connector = "├── "
			childPrefix = prefix + "│   "
		}

		// Format the node
		sb.WriteString(prefix)
		sb.WriteString(connector)

		// Format relation and location
		location := formatLocation(child.FilePath, child.LineNo, webLinks, serverURL)
		if useColor {
			sb.WriteString(fmt.Sprintf("[%s%s%s] ", colorCyan, child.Relation, colorReset))
			if child.Symbol != "" {
				sb.WriteString(colorBold + child.Symbol + colorReset + " ")
			}
			sb.WriteString(colorMagenta + location + colorReset)
		} else {
			sb.WriteString(fmt.Sprintf("[%s] ", child.Relation))
			if child.Symbol != "" {
				sb.WriteString(child.Symbol + " ")
			}
			sb.WriteString(location)
		}
		sb.WriteString("\n")

		// Recurse for children
		if len(child.Children) > 0 {
			formatTreeNode(sb, child.Children, childPrefix, useColor, webLinks, serverURL)
		}
	}
}

// formatLocation formats a file path and line number for display
// If webLinks is true, wraps the location in a clickable hyperlink
func formatLocation(filePath, lineNo string, webLinks bool, serverURL string) string {
	var location string
	if lineNo != "" {
		location = fmt.Sprintf("(%s:%s)", filePath, lineNo)
	} else {
		location = fmt.Sprintf("(%s)", filePath)
	}

	if webLinks && serverURL != "" {
		// Construct OpenGrok xref URL
		webURL := fmt.Sprintf("%s/xref%s", serverURL, filePath)
		if lineNo != "" {
			webURL += "#" + lineNo
		}
		// Wrap in OSC 8 hyperlink escape sequence
		return fmt.Sprintf("\033]8;;%s\033\\%s\033]8;;\033\\", webURL, location)
	}

	return location
}
