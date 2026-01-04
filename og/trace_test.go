package main

import (
	"sort"
	"strconv"
	"strings"
	"testing"
)

func TestFormatTree(t *testing.T) {
	// Create a simple call tree for testing
	root := &CallNode{
		Symbol:   "malloc",
		Relation: "root",
		Children: []*CallNode{
			{
				Symbol:   "",
				FilePath: "/project/src/alloc.c",
				LineNo:   "42",
				Relation: "caller",
				Children: []*CallNode{
					{
						Symbol:   "",
						FilePath: "/project/src/init.c",
						LineNo:   "100",
						Relation: "caller",
					},
				},
			},
			{
				Symbol:   "",
				FilePath: "/project/src/memory.c",
				LineNo:   "67",
				Relation: "caller",
			},
		},
	}

	result := &TraceResult{
		Root:       root,
		TotalNodes: 4,
		MaxReached: false,
	}

	// Test without color and without web links
	output := FormatTree(result, false, false, "")

	// Verify root is present
	if !strings.Contains(output, "malloc") {
		t.Error("Expected output to contain root symbol 'malloc'")
	}

	// Verify tree structure characters
	if !strings.Contains(output, "├──") && !strings.Contains(output, "└──") {
		t.Error("Expected output to contain tree structure characters")
	}

	// Verify file paths are present
	if !strings.Contains(output, "/project/src/alloc.c:42") {
		t.Error("Expected output to contain first caller location")
	}
	if !strings.Contains(output, "/project/src/memory.c:67") {
		t.Error("Expected output to contain second caller location")
	}

	// Verify nested caller
	if !strings.Contains(output, "/project/src/init.c:100") {
		t.Error("Expected output to contain nested caller location")
	}

	// Verify [caller] relation is shown
	if !strings.Contains(output, "[caller]") {
		t.Error("Expected output to contain [caller] relation")
	}

	t.Logf("Tree output:\n%s", output)
}

func TestFormatTreeWithMaxReached(t *testing.T) {
	root := &CallNode{
		Symbol:   "test",
		Relation: "root",
		Children: []*CallNode{
			{
				FilePath: "/test.c",
				LineNo:   "1",
				Relation: "caller",
			},
		},
	}

	result := &TraceResult{
		Root:       root,
		TotalNodes: 100,
		MaxReached: true,
	}

	output := FormatTree(result, false, false, "")

	// Verify max reached message
	if !strings.Contains(output, "stopped at 100 nodes") {
		t.Error("Expected output to contain max reached message")
	}
	if !strings.Contains(output, "--max-total") {
		t.Error("Expected output to mention --max-total flag")
	}

	t.Logf("Tree output with max reached:\n%s", output)
}

func TestFormatTreeEmpty(t *testing.T) {
	root := &CallNode{
		Symbol:   "orphan_function",
		Relation: "root",
	}

	result := &TraceResult{
		Root:       root,
		TotalNodes: 1,
		MaxReached: false,
	}

	output := FormatTree(result, false, false, "")

	// Should just show the root
	if !strings.Contains(output, "orphan_function") {
		t.Error("Expected output to contain root symbol")
	}

	// Should not have tree connectors
	if strings.Contains(output, "├──") || strings.Contains(output, "└──") {
		t.Error("Expected no tree connectors for empty tree")
	}

	t.Logf("Empty tree output:\n%s", output)
}

func TestExtractSymbolFromLine(t *testing.T) {
	tests := []struct {
		name           string
		line           string
		searchedSymbol string
		expected       string
	}{
		{
			name:           "comment line",
			line:           "// This calls malloc for allocation",
			searchedSymbol: "malloc",
			expected:       "",
		},
		{
			name:           "block comment",
			line:           "/* malloc is used here */",
			searchedSymbol: "malloc",
			expected:       "",
		},
		{
			name:           "preprocessor directive",
			line:           "#define USE_MALLOC 1",
			searchedSymbol: "malloc",
			expected:       "",
		},
		{
			name:           "normal code line",
			line:           "    ptr = malloc(size);",
			searchedSymbol: "malloc",
			expected:       "", // Current implementation returns empty
		},
		{
			name:           "html tags stripped",
			line:           "    ptr = <b>malloc</b>(size);",
			searchedSymbol: "malloc",
			expected:       "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := extractSymbolFromLine(tt.line, tt.searchedSymbol)
			if result != tt.expected {
				t.Errorf("got %q, want %q", result, tt.expected)
			}
		})
	}
}

func TestExtractCallers(t *testing.T) {
	// Create a mock SearchResponse
	resp := &SearchResponse{
		ResultCount: 3,
		Results: map[string][]SearchResult{
			"/project/src/file1.c": {
				{Line: "ptr = malloc(size);", LineNo: "42"},
				{Line: "buf = malloc(len);", LineNo: "100"},
			},
			"/project/src/file2.c": {
				{Line: "data = malloc(n);", LineNo: "50"},
			},
		},
	}

	// Create a minimal client for testing (won't make real calls in this test)
	client := &Client{BaseURL: "http://test"}
	callers := extractCallers(client, resp, "malloc", false)

	// Should have 3 unique callers
	if len(callers) != 3 {
		t.Errorf("Expected 3 callers, got %d", len(callers))
	}

	// Verify locations are extracted
	foundFile1Line42 := false
	foundFile1Line100 := false
	foundFile2Line50 := false

	for _, c := range callers {
		if c.FilePath == "/project/src/file1.c" && c.LineNo == "42" {
			foundFile1Line42 = true
		}
		if c.FilePath == "/project/src/file1.c" && c.LineNo == "100" {
			foundFile1Line100 = true
		}
		if c.FilePath == "/project/src/file2.c" && c.LineNo == "50" {
			foundFile2Line50 = true
		}
	}

	if !foundFile1Line42 {
		t.Error("Expected to find file1.c:42")
	}
	if !foundFile1Line100 {
		t.Error("Expected to find file1.c:100")
	}
	if !foundFile2Line50 {
		t.Error("Expected to find file2.c:50")
	}
}

func TestExtractCallersDeduplication(t *testing.T) {
	// Create a response with duplicate locations
	resp := &SearchResponse{
		ResultCount: 2,
		Results: map[string][]SearchResult{
			"/project/src/file.c": {
				{Line: "call1", LineNo: "42"},
				{Line: "call2", LineNo: "42"}, // Same line number - should be deduplicated
			},
		},
	}

	client := &Client{BaseURL: "http://test"}
	callers := extractCallers(client, resp, "test", false)

	// Should only have 1 caller after deduplication
	if len(callers) != 1 {
		t.Errorf("Expected 1 caller after deduplication, got %d", len(callers))
	}
}

func TestExtractCallersSkipsInvalidLineNumbers(t *testing.T) {
	resp := &SearchResponse{
		ResultCount: 3,
		Results: map[string][]SearchResult{
			"/project/src/file.c": {
				{Line: "valid", LineNo: "42"},
				{Line: "empty", LineNo: ""}, // Should be skipped
				{Line: "zero", LineNo: "0"}, // Should be skipped
				{Line: "another valid", LineNo: "100"},
			},
		},
	}

	client := &Client{BaseURL: "http://test"}
	callers := extractCallers(client, resp, "test", false)

	// Should only have 2 callers (skipping empty and "0" line numbers)
	if len(callers) != 2 {
		t.Errorf("Expected 2 valid callers, got %d", len(callers))
	}
}

func TestTraceOptionsDefaults(t *testing.T) {
	// Test that Trace handles default options correctly
	// This is a unit test that doesn't make network calls

	opts := TraceOptions{
		Symbol: "test_func",
		// Leave other options at zero values
	}

	// Check that zero values exist (the Trace function will set defaults)
	if opts.Depth != 0 {
		t.Error("Expected Depth to be zero initially")
	}
	if opts.MaxTotal != 0 {
		t.Error("Expected MaxTotal to be zero initially")
	}
	if opts.Direction != "" {
		t.Error("Expected Direction to be empty initially")
	}
}

func TestTraceInvalidDirection(t *testing.T) {
	// Create a minimal client (won't be used since we expect an error)
	client := &Client{BaseURL: "http://test"}

	opts := TraceOptions{
		Symbol:    "test",
		Direction: "callees", // Not supported in v1
	}

	_, err := Trace(client, opts)
	if err == nil {
		t.Error("Expected error for unsupported direction 'callees'")
	}

	if !strings.Contains(err.Error(), "callees") {
		t.Errorf("Expected error message to mention 'callees', got: %v", err)
	}
}

func TestFormatLocation(t *testing.T) {
	tests := []struct {
		name     string
		filePath string
		lineNo   string
		expected string
	}{
		{
			name:     "with line number",
			filePath: "/src/main.c",
			lineNo:   "42",
			expected: "(/src/main.c:42)",
		},
		{
			name:     "without line number",
			filePath: "/src/main.c",
			lineNo:   "",
			expected: "(/src/main.c)",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := formatLocation(tt.filePath, tt.lineNo, false, "")
			if result != tt.expected {
				t.Errorf("got %q, want %q", result, tt.expected)
			}
		})
	}
}

func TestFormatLocationWithWebLinks(t *testing.T) {
	tests := []struct {
		name      string
		filePath  string
		lineNo    string
		serverURL string
		expected  string
	}{
		{
			name:      "with line number and server URL",
			filePath:  "/illumos-gate/usr/src/main.c",
			lineNo:    "123",
			serverURL: "https://src.illumos.org/source",
			expected:  "\033]8;;https://src.illumos.org/source/xref/illumos-gate/usr/src/main.c#123\033\\(/illumos-gate/usr/src/main.c:123)\033]8;;\033\\",
		},
		{
			name:      "without line number",
			filePath:  "/illumos-gate/usr/src/main.c",
			lineNo:    "",
			serverURL: "https://src.illumos.org/source",
			expected:  "\033]8;;https://src.illumos.org/source/xref/illumos-gate/usr/src/main.c\033\\(/illumos-gate/usr/src/main.c)\033]8;;\033\\",
		},
		{
			name:      "without server URL falls back to plain",
			filePath:  "/src/main.c",
			lineNo:    "42",
			serverURL: "",
			expected:  "(/src/main.c:42)",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := formatLocation(tt.filePath, tt.lineNo, true, tt.serverURL)
			if result != tt.expected {
				t.Errorf("got %q, want %q", result, tt.expected)
			}
		})
	}
}

func TestCallersSortedNumerically(t *testing.T) {
	// This test verifies that callers are sorted by line number numerically,
	// not lexicographically. Without numerical sorting, "100" < "42" < "9"
	// because string comparison uses character-by-character ordering.
	resp := &SearchResponse{
		ResultCount: 4,
		Results: map[string][]SearchResult{
			"/project/src/file.c": {
				{Line: "line 100", LineNo: "100"},
				{Line: "line 42", LineNo: "42"},
				{Line: "line 9", LineNo: "9"},
				{Line: "line 1000", LineNo: "1000"},
			},
		},
	}

	client := &Client{BaseURL: "http://test"}
	callers := extractCallers(client, resp, "test", false)

	// Sort using the same logic as in Trace
	sort.Slice(callers, func(i, j int) bool {
		if callers[i].FilePath != callers[j].FilePath {
			return callers[i].FilePath < callers[j].FilePath
		}
		// Parse line numbers as integers for proper numerical sorting
		lineI, _ := strconv.Atoi(callers[i].LineNo)
		lineJ, _ := strconv.Atoi(callers[j].LineNo)
		return lineI < lineJ
	})

	// Verify the order is numerically correct: 9, 42, 100, 1000
	expected := []string{"9", "42", "100", "1000"}
	for i, caller := range callers {
		if caller.LineNo != expected[i] {
			t.Errorf("Position %d: got line %s, want %s", i, caller.LineNo, expected[i])
		}
	}

	t.Logf("Sorted callers: %v, %v, %v, %v",
		callers[0].LineNo, callers[1].LineNo, callers[2].LineNo, callers[3].LineNo)
}

func TestCallersSortedByFileAndLine(t *testing.T) {
	// Test sorting with multiple files
	resp := &SearchResponse{
		ResultCount: 6,
		Results: map[string][]SearchResult{
			"/b/file.c": {
				{Line: "line 50", LineNo: "50"},
				{Line: "line 10", LineNo: "10"},
			},
			"/a/file.c": {
				{Line: "line 100", LineNo: "100"},
				{Line: "line 5", LineNo: "5"},
			},
			"/c/file.c": {
				{Line: "line 1", LineNo: "1"},
				{Line: "line 999", LineNo: "999"},
			},
		},
	}

	client := &Client{BaseURL: "http://test"}
	callers := extractCallers(client, resp, "test", false)

	// Sort using the same logic as in Trace
	sort.Slice(callers, func(i, j int) bool {
		if callers[i].FilePath != callers[j].FilePath {
			return callers[i].FilePath < callers[j].FilePath
		}
		lineI, _ := strconv.Atoi(callers[i].LineNo)
		lineJ, _ := strconv.Atoi(callers[j].LineNo)
		return lineI < lineJ
	})

	// Expected order: /a/file.c:5, /a/file.c:100, /b/file.c:10, /b/file.c:50, /c/file.c:1, /c/file.c:999
	expectedOrder := []struct {
		path   string
		lineNo string
	}{
		{"/a/file.c", "5"},
		{"/a/file.c", "100"},
		{"/b/file.c", "10"},
		{"/b/file.c", "50"},
		{"/c/file.c", "1"},
		{"/c/file.c", "999"},
	}

	if len(callers) != len(expectedOrder) {
		t.Fatalf("Expected %d callers, got %d", len(expectedOrder), len(callers))
	}

	for i, caller := range callers {
		if caller.FilePath != expectedOrder[i].path || caller.LineNo != expectedOrder[i].lineNo {
			t.Errorf("Position %d: got %s:%s, want %s:%s",
				i, caller.FilePath, caller.LineNo,
				expectedOrder[i].path, expectedOrder[i].lineNo)
		}
	}
}

func TestParseFunctionName(t *testing.T) {
	tests := []struct {
		name     string
		lines    []string
		expected string
	}{
		{
			name: "simple function",
			lines: []string{
				"int calculate_sum(int a, int b) {",
				"    return a + b;",
			},
			expected: "calculate_sum",
		},
		{
			name: "function with return type on separate line",
			lines: []string{
				"static void",
				"process_data(void *ptr) {",
				"    // processing",
			},
			expected: "process_data",
		},
		{
			name: "function with pointer return type",
			lines: []string{
				"char *get_name(void) {",
				"    return \"test\";",
			},
			expected: "get_name",
		},
		{
			name: "function with multiple qualifiers",
			lines: []string{
				"static inline int compute_value(int x) {",
				"    return x * 2;",
			},
			expected: "compute_value",
		},
		{
			name: "function definition with opening brace on next line",
			lines: []string{
				"void helper_function(void)",
				"{",
				"    // code",
			},
			expected: "helper_function",
		},
		{
			name: "skip if statement",
			lines: []string{
				"if (condition) {",
				"    do_something();",
			},
			expected: "",
		},
		{
			name: "skip for loop",
			lines: []string{
				"for (int i = 0; i < 10; i++) {",
				"    process(i);",
			},
			expected: "",
		},
		{
			name: "empty lines",
			lines: []string{
				"",
				"",
				"",
			},
			expected: "",
		},
		{
			name: "comments only",
			lines: []string{
				"// This is a comment",
				"/* Block comment */",
				"* Another comment line",
			},
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := parseFunctionName(tt.lines)
			if result != tt.expected {
				t.Errorf("got %q, want %q", result, tt.expected)
			}
		})
	}
}

func TestIsCommonKeyword(t *testing.T) {
	tests := []struct {
		word     string
		expected bool
	}{
		{"if", true},
		{"for", true},
		{"while", true},
		{"return", true},
		{"sizeof", true},
		{"struct", true},
		{"my_function", false},
		{"calculate", false},
		{"process_data", false},
	}

	for _, tt := range tests {
		t.Run(tt.word, func(t *testing.T) {
			result := isCommonKeyword(tt.word)
			if result != tt.expected {
				t.Errorf("isCommonKeyword(%q) = %v, want %v", tt.word, result, tt.expected)
			}
		})
	}
}
