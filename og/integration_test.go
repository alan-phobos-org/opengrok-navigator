//go:build integration

package main

import (
	"strconv"
	"strings"
	"testing"
)

const testServerURL = "https://src.illumos.org/source"

// skipOnServerError checks if the error indicates a server-side issue
// (authentication required, server down, etc.) and skips the test if so.
// This allows integration tests to pass when the external server is unavailable
// while still failing on actual code bugs.
func skipOnServerError(t *testing.T, err error) {
	t.Helper()
	if err == nil {
		return
	}
	errStr := err.Error()
	// Skip if server requires authentication or is unavailable
	if strings.Contains(errStr, "401") ||
		strings.Contains(errStr, "403") ||
		strings.Contains(errStr, "503") ||
		strings.Contains(errStr, "connection refused") ||
		strings.Contains(errStr, "no such host") ||
		strings.Contains(errStr, "timeout") {
		t.Skipf("Skipping test due to server unavailability: %v", err)
	}
	// For other errors, fail the test
	t.Fatalf("Failed to perform request: %v", err)
}

func resultPathForProject(project string, result SearchResult) string {
	path := result.Path
	if path == "" && (result.Directory != "" || result.Filename != "") {
		dir := strings.TrimSuffix(result.Directory, "/")
		if dir != "" && result.Filename != "" {
			path = dir + "/" + result.Filename
		} else if result.Filename != "" {
			path = result.Filename
		} else {
			path = dir
		}
	}

	path = strings.TrimPrefix(path, "/")
	if project != "" && strings.HasPrefix(path, project+"/") {
		path = strings.TrimPrefix(path, project+"/")
	}
	if project == "" {
		return path
	}
	if path == "" {
		return project
	}
	return project + "/" + path
}

// TestIntegrationGetProjects tests that we can retrieve the list of projects
// from the illumos OpenGrok server.
// NOTE: This test is skipped if the server requires authentication for the /projects endpoint.
func TestIntegrationGetProjects(t *testing.T) {
	client, err := NewClient(testServerURL)
	if err != nil {
		t.Fatalf("Failed to create client: %v", err)
	}

	projects, err := client.GetProjects()
	skipOnServerError(t, err)

	if len(projects) == 0 {
		t.Fatal("Expected at least one project, got none")
	}

	// illumos should be one of the projects
	found := false
	for _, p := range projects {
		if p == "illumos-gate" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("Expected to find 'illumos-gate' project, got projects: %v", projects)
	}
}

// TestIntegrationFullTextSearch tests full text search functionality.
func TestIntegrationFullTextSearch(t *testing.T) {
	client, err := NewClient(testServerURL)
	if err != nil {
		t.Fatalf("Failed to create client: %v", err)
	}

	opts := SearchOptions{
		Full:       "mutex_enter",
		Projects:   "illumos-gate",
		MaxResults: 10,
	}

	resp, err := client.Search(opts)
	skipOnServerError(t, err)

	if resp.ResultCount == 0 {
		t.Fatal("Expected search results for 'mutex_enter', got none")
	}

	// The response Results map has project names as keys.
	if len(resp.Results) == 0 {
		t.Fatal("Expected results map to have entries")
	}

	// Check that at least one result contains the search term or is from a source file
	foundRelevant := false
	for project, results := range resp.Results {
		if project != "illumos-gate" {
			t.Logf("Unexpected project key in results: %s", project)
		}
		for _, r := range results {
			filePath := resultPathForProject(project, r)
			if strings.Contains(strings.ToLower(r.Line), "mutex") ||
				strings.HasSuffix(filePath, ".c") ||
				strings.HasSuffix(filePath, ".h") {
				foundRelevant = true
				break
			}
		}
		if foundRelevant {
			break
		}
	}
	if !foundRelevant {
		t.Error("Expected to find relevant results containing 'mutex' or source files")
	}
}

// TestIntegrationDefinitionSearch tests symbol definition search.
func TestIntegrationDefinitionSearch(t *testing.T) {
	client, err := NewClient(testServerURL)
	if err != nil {
		t.Fatalf("Failed to create client: %v", err)
	}

	opts := SearchOptions{
		Def:        "kmem_alloc",
		Projects:   "illumos-gate",
		MaxResults: 10,
	}

	resp, err := client.Search(opts)
	skipOnServerError(t, err)

	if resp.ResultCount == 0 {
		t.Fatal("Expected search results for definition 'kmem_alloc', got none")
	}

	// The response Results map has project names as keys. Verify we have results.
	if len(resp.Results) == 0 {
		t.Fatal("Expected results map to have entries")
	}

	// Verify at least one file path contains the search term or is a .c file (likely definition)
	foundDefinition := false
	for project, results := range resp.Results {
		for _, r := range results {
			filePath := resultPathForProject(project, r)
			if strings.HasSuffix(filePath, ".c") {
				foundDefinition = true
				break
			}
		}
		if foundDefinition {
			break
		}
	}
	if !foundDefinition {
		t.Error("Expected at least one definition result in a .c file")
	}
}

// TestIntegrationPathSearch tests path-based search.
func TestIntegrationPathSearch(t *testing.T) {
	client, err := NewClient(testServerURL)
	if err != nil {
		t.Fatalf("Failed to create client: %v", err)
	}

	opts := SearchOptions{
		Path:       "kmem.c",
		Projects:   "illumos-gate",
		MaxResults: 10,
	}

	resp, err := client.Search(opts)
	skipOnServerError(t, err)

	if resp.ResultCount == 0 {
		t.Fatal("Expected search results for path 'kmem.c', got none")
	}

	// The response Results map has project names as keys. Verify we have results.
	if len(resp.Results) == 0 {
		t.Fatal("Expected results map to have entries")
	}

	// Verify at least one file path contains 'kmem'
	foundKmem := false
	for project, results := range resp.Results {
		for _, r := range results {
			filePath := resultPathForProject(project, r)
			if strings.Contains(strings.ToLower(filePath), "kmem") {
				foundKmem = true
				break
			}
		}
		if foundKmem {
			break
		}
	}
	if !foundKmem {
		t.Error("Expected to find files with 'kmem' in the path")
	}
}

// TestIntegrationSymbolSearch tests symbol reference search.
func TestIntegrationSymbolSearch(t *testing.T) {
	client, err := NewClient(testServerURL)
	if err != nil {
		t.Fatalf("Failed to create client: %v", err)
	}

	opts := SearchOptions{
		Symbol:     "ddi_prop_get_int",
		Projects:   "illumos-gate",
		MaxResults: 10,
	}

	resp, err := client.Search(opts)
	skipOnServerError(t, err)

	if resp.ResultCount == 0 {
		t.Fatal("Expected search results for symbol 'ddi_prop_get_int', got none")
	}

	// The response Results map has project names as keys. Verify we have results.
	if len(resp.Results) == 0 {
		t.Fatal("Expected results map to have entries")
	}

	// Count total results across all files
	totalResults := 0
	for _, results := range resp.Results {
		totalResults += len(results)
	}
	if totalResults == 0 {
		t.Fatal("Expected at least one symbol result")
	}
}

// TestIntegrationSearchWithMaxResults tests that max results is respected.
// Note: The OpenGrok API's maxresults parameter limits the number of FILES returned,
// not the total number of line matches. Each file can have multiple matching lines.
func TestIntegrationSearchWithMaxResults(t *testing.T) {
	client, err := NewClient(testServerURL)
	if err != nil {
		t.Fatalf("Failed to create client: %v", err)
	}

	maxResults := 5
	opts := SearchOptions{
		Full:       "return",
		Projects:   "illumos-gate",
		MaxResults: maxResults,
	}

	resp, err := client.Search(opts)
	skipOnServerError(t, err)

	// maxresults limits the number of FILES, not total line matches
	// Count the number of file entries (keys in the Results map)
	numFiles := len(resp.Results)

	if numFiles > maxResults {
		t.Errorf("Expected at most %d files, got %d", maxResults, numFiles)
	}

	// Should have results
	if numFiles == 0 {
		t.Error("Expected to get some results for common term 'return'")
	}

	// Verify we have at least some line results
	totalLines := 0
	for _, results := range resp.Results {
		totalLines += len(results)
	}
	if totalLines == 0 {
		t.Error("Expected files to contain at least one line match")
	}
}

// TestIntegrationSearchResponseFields verifies response fields are populated.
func TestIntegrationSearchResponseFields(t *testing.T) {
	client, err := NewClient(testServerURL)
	if err != nil {
		t.Fatalf("Failed to create client: %v", err)
	}

	opts := SearchOptions{
		Full:       "printf",
		Projects:   "illumos-gate",
		MaxResults: 5,
	}

	resp, err := client.Search(opts)
	skipOnServerError(t, err)

	// Verify response metadata - time should be non-negative (0 is valid for fast queries)
	if resp.Time < 0 {
		t.Error("Expected non-negative search time")
	}

	if resp.ResultCount == 0 {
		t.Fatal("Expected results for 'printf'")
	}

	// The response Results map has project names as keys.
	// Check that each result has line information.
	for project, results := range resp.Results {
		if project == "" {
			t.Error("Got empty project key in results map")
		}
		for i, r := range results {
			// Each result should have line content
			if r.Line == "" {
				filePath := resultPathForProject(project, r)
				t.Errorf("Result %d in file %s has no line content", i, filePath)
			}
		}
	}
}

// TestIntegrationSearchNoResults tests handling of queries with no results.
func TestIntegrationSearchNoResults(t *testing.T) {
	client, err := NewClient(testServerURL)
	if err != nil {
		t.Fatalf("Failed to create client: %v", err)
	}

	opts := SearchOptions{
		Full:       "xyzzy_nonexistent_term_12345_abcdef",
		Projects:   "illumos-gate",
		MaxResults: 10,
	}

	resp, err := client.Search(opts)
	if err != nil {
		t.Fatalf("Search should not error for no results: %v", err)
	}

	if resp.ResultCount != 0 {
		t.Errorf("Expected 0 results for nonexistent term, got %d", resp.ResultCount)
	}
}

// TestIntegrationSymbolSearchLineNumbers tests that symbol search returns valid line numbers.
// This is a regression test for issues #32 and #34 where symbol search returned line numbers as 0.
func TestIntegrationSymbolSearchLineNumbers(t *testing.T) {
	client, err := NewClient(testServerURL)
	if err != nil {
		t.Fatalf("Failed to create client: %v", err)
	}

	opts := SearchOptions{
		Symbol:     "gpa",
		Projects:   "illumos-gate",
		MaxResults: 5,
	}

	resp, err := client.Search(opts)
	skipOnServerError(t, err)

	if resp.ResultCount == 0 {
		t.Fatal("Expected search results for symbol 'gpa', got none")
	}

	// The response Results map has project names as keys. Verify we have results.
	if len(resp.Results) == 0 {
		t.Fatal("Expected results map to have entries")
	}

	// Check that ALL results have valid line numbers
	// This is a stricter check than before - we require every result to have
	// a proper line number, not just at least one
	invalidLineNumbers := 0
	totalResults := 0
	var firstLineNo string
	for project, results := range resp.Results {
		for i, r := range results {
			totalResults++
			lineNo := string(r.LineNo)
			if firstLineNo == "" {
				firstLineNo = lineNo
			}
			filePath := resultPathForProject(project, r)
			t.Logf("Result %d: path=%s, lineNo=%q", i, filePath, lineNo)
			if lineNo == "" || lineNo == "0" {
				invalidLineNumbers++
			}
		}
	}

	if totalResults == 0 {
		t.Fatal("Expected at least one symbol result")
	}

	if invalidLineNumbers > 0 {
		t.Errorf("Found %d/%d results with invalid line numbers (empty or 0). First result LineNo: %q",
			invalidLineNumbers, totalResults, firstLineNo)
	}
}

// TestIntegrationFullTextSearchLineNumbers tests that full text search returns valid line numbers.
// This is a regression test for issue #40 where full text search returned line numbers as 0.
func TestIntegrationFullTextSearchLineNumbers(t *testing.T) {
	client, err := NewClient(testServerURL)
	if err != nil {
		t.Fatalf("Failed to create client: %v", err)
	}

	opts := SearchOptions{
		Full:       "mutex_enter",
		Projects:   "illumos-gate",
		MaxResults: 5,
	}

	resp, err := client.Search(opts)
	skipOnServerError(t, err)

	if resp.ResultCount == 0 {
		t.Fatal("Expected search results for full text 'mutex_enter', got none")
	}

	// The response Results map has project names as keys. Verify we have results.
	if len(resp.Results) == 0 {
		t.Fatal("Expected results map to have entries")
	}

	// Check that ALL results have valid line numbers
	// For full text search, every match should have a line number
	invalidLineNumbers := 0
	totalResults := 0
	var firstLineNo string
	for project, results := range resp.Results {
		for i, r := range results {
			totalResults++
			lineNo := string(r.LineNo)
			if firstLineNo == "" {
				firstLineNo = lineNo
			}
			linePreview := r.Line
			if len(linePreview) > 50 {
				linePreview = linePreview[:50]
			}
			filePath := resultPathForProject(project, r)
			t.Logf("Full text result %d: path=%s, lineNo=%q, line=%q", i, filePath, lineNo, linePreview)
			if lineNo == "" || lineNo == "0" {
				invalidLineNumbers++
			}
		}
	}

	if totalResults == 0 {
		t.Fatal("Expected at least one full text search result")
	}

	if invalidLineNumbers > 0 {
		t.Errorf("Found %d/%d full text search results with invalid line numbers (empty or 0). First result LineNo: %q",
			invalidLineNumbers, totalResults, firstLineNo)
	}
}

// TestIntegrationTrace tests the call graph tracing functionality.
func TestIntegrationTrace(t *testing.T) {
	client, err := NewClient(testServerURL)
	if err != nil {
		t.Fatalf("Failed to create client: %v", err)
	}

	// Trace callers of a common function
	opts := TraceOptions{
		Symbol:   "kmem_alloc",
		Depth:    1, // Just one level for faster test
		MaxTotal: 20,
		Projects: "illumos-gate",
	}

	result, err := Trace(client, opts)
	skipOnServerError(t, err)

	if result == nil {
		t.Fatal("Expected a result, got nil")
	}

	// Root should be the searched symbol
	if result.Root.Symbol != "kmem_alloc" {
		t.Errorf("Expected root symbol 'kmem_alloc', got %q", result.Root.Symbol)
	}

	// Should find at least some callers (kmem_alloc is widely used)
	if len(result.Root.Children) == 0 {
		t.Log("No callers found - this may be expected if the server doesn't return symbol results")
	} else {
		t.Logf("Found %d direct callers of kmem_alloc", len(result.Root.Children))

		// Verify caller structure
		for i, child := range result.Root.Children {
			if child.FilePath == "" {
				t.Errorf("Caller %d has empty file path", i)
			}
			if child.LineNo == "" {
				t.Errorf("Caller %d has empty line number", i)
			}
			if child.Relation != "caller" {
				t.Errorf("Caller %d has wrong relation: %q", i, child.Relation)
			}
			t.Logf("  Caller %d: %s:%s", i, child.FilePath, child.LineNo)
		}
	}

	// Verify total nodes count is reasonable
	if result.TotalNodes < 1 {
		t.Error("Expected at least 1 node (the root)")
	}

	t.Logf("Total nodes explored: %d, MaxReached: %v", result.TotalNodes, result.MaxReached)
}

// TestIntegrationTraceFormatOutput tests that trace output can be formatted.
func TestIntegrationTraceFormatOutput(t *testing.T) {
	client, err := NewClient(testServerURL)
	if err != nil {
		t.Fatalf("Failed to create client: %v", err)
	}

	opts := TraceOptions{
		Symbol:   "mutex_enter",
		Depth:    1,
		MaxTotal: 10,
		Projects: "illumos-gate",
	}

	result, err := Trace(client, opts)
	skipOnServerError(t, err)

	// Format the output
	output := FormatTree(result, false, false, "")

	// Should contain the root symbol
	if !strings.Contains(output, "mutex_enter") {
		t.Error("Output should contain the root symbol 'mutex_enter'")
	}

	t.Logf("Formatted output:\n%s", output)
}

// TestIntegrationTraceNoResults tests tracing a symbol that doesn't exist.
func TestIntegrationTraceNoResults(t *testing.T) {
	client, err := NewClient(testServerURL)
	if err != nil {
		t.Fatalf("Failed to create client: %v", err)
	}

	opts := TraceOptions{
		Symbol:   "xyzzy_nonexistent_function_12345",
		Depth:    2,
		MaxTotal: 50,
		Projects: "illumos-gate",
	}

	result, err := Trace(client, opts)
	// Note: This might return an error or empty result depending on the server

	if err != nil {
		// Check if it's a server error we should skip
		skipOnServerError(t, err)
	}

	if result == nil {
		t.Fatal("Expected a result, got nil")
	}

	// Root should still be present
	if result.Root.Symbol != "xyzzy_nonexistent_function_12345" {
		t.Errorf("Expected root symbol to be the searched symbol")
	}

	// Should have no children
	if len(result.Root.Children) != 0 {
		t.Errorf("Expected no children for nonexistent symbol, got %d", len(result.Root.Children))
	}
}

// TestIntegrationTraceResultsSortedNumerically verifies that trace results
// are sorted by line number numerically, not lexicographically.
// This is a regression test for a bug where "100" sorted before "42".
func TestIntegrationTraceResultsSortedNumerically(t *testing.T) {
	client, err := NewClient(testServerURL)
	if err != nil {
		t.Fatalf("Failed to create client: %v", err)
	}

	opts := TraceOptions{
		Symbol:   "mutex_enter",
		Depth:    1,
		MaxTotal: 50,
		Projects: "illumos-gate",
	}

	result, err := Trace(client, opts)
	skipOnServerError(t, err)

	if result == nil {
		t.Fatal("Expected a result, got nil")
	}

	if len(result.Root.Children) < 2 {
		t.Skip("Need at least 2 results to verify sorting")
	}

	// Group children by file path and verify each group is sorted numerically
	byFile := make(map[string][]*CallNode)
	for _, child := range result.Root.Children {
		byFile[child.FilePath] = append(byFile[child.FilePath], child)
	}

	for filePath, children := range byFile {
		if len(children) < 2 {
			continue
		}

		// Verify line numbers are in ascending numerical order
		for i := 1; i < len(children); i++ {
			prevLine, err1 := strconv.Atoi(children[i-1].LineNo)
			currLine, err2 := strconv.Atoi(children[i].LineNo)

			if err1 != nil || err2 != nil {
				t.Logf("Could not parse line numbers at %s: %s, %s", filePath, children[i-1].LineNo, children[i].LineNo)
				continue
			}

			if prevLine > currLine {
				t.Errorf("Results not sorted numerically in %s: line %d came before %d",
					filePath, prevLine, currLine)
			}
		}

		t.Logf("File %s has %d callers, lines are numerically sorted", filePath, len(children))
	}
}

// TestIntegrationCombinedSearch tests combining multiple search parameters.
func TestIntegrationCombinedSearch(t *testing.T) {
	client, err := NewClient(testServerURL)
	if err != nil {
		t.Fatalf("Failed to create client: %v", err)
	}

	// Use definition search with path filter - this combination reliably returns results
	opts := SearchOptions{
		Def:        "kmem_alloc",
		Path:       "kmem",
		Projects:   "illumos-gate",
		MaxResults: 10,
	}

	resp, err := client.Search(opts)
	skipOnServerError(t, err)

	if resp.ResultCount == 0 {
		t.Fatal("Expected search results for definition 'kmem_alloc' in files matching 'kmem', got none")
	}

	// The response Results map has project names as keys. Verify we have results.
	if len(resp.Results) == 0 {
		t.Fatal("Expected results map to have entries")
	}

	// Verify at least one file path contains 'kmem' (matching the path filter)
	foundKmemFile := false
	totalResults := 0
	for project, results := range resp.Results {
		totalResults += len(results)
		for _, r := range results {
			filePath := resultPathForProject(project, r)
			if strings.Contains(filePath, "kmem") {
				foundKmemFile = true
				break
			}
		}
	}

	if totalResults == 0 {
		t.Fatal("Expected at least one result")
	}

	if !foundKmemFile {
		t.Error("Expected at least one result from a file containing 'kmem' in path")
	}
}
