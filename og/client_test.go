package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func TestFlexibleStringUnmarshal(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "string value",
			input:    `"123"`,
			expected: "123",
		},
		{
			name:     "integer value",
			input:    `456`,
			expected: "456",
		},
		{
			name:     "zero integer",
			input:    `0`,
			expected: "0",
		},
		{
			name:     "empty string",
			input:    `""`,
			expected: "",
		},
		{
			name:     "large number",
			input:    `12345678`,
			expected: "12345678",
		},
		{
			name:     "null value",
			input:    `null`,
			expected: "",
		},
		{
			name:     "float value",
			input:    `3.14`,
			expected: "3.14",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var f FlexibleString
			err := json.Unmarshal([]byte(tt.input), &f)
			if err != nil {
				t.Fatalf("Unmarshal failed: %v", err)
			}
			if string(f) != tt.expected {
				t.Errorf("got %q, want %q", string(f), tt.expected)
			}
		})
	}
}

func TestSearchResultUnmarshal(t *testing.T) {
	// Test that SearchResult correctly unmarshals line numbers as integers
	// This is a regression test for issue #32
	jsonData := `{
		"line": "some code here",
		"lineNo": 42,
		"path": "/usr/src/foo.c",
		"filename": "foo.c",
		"directory": "/usr/src"
	}`

	var result SearchResult
	err := json.Unmarshal([]byte(jsonData), &result)
	if err != nil {
		t.Fatalf("Unmarshal failed: %v", err)
	}

	if string(result.LineNo) != "42" {
		t.Errorf("LineNo: got %q, want %q", string(result.LineNo), "42")
	}
}

func TestSearchResultUnmarshalStringLineNo(t *testing.T) {
	// Test that SearchResult correctly handles string line numbers too
	jsonData := `{
		"line": "some code here",
		"lineNo": "100",
		"path": "/usr/src/foo.c",
		"filename": "foo.c",
		"directory": "/usr/src"
	}`

	var result SearchResult
	err := json.Unmarshal([]byte(jsonData), &result)
	if err != nil {
		t.Fatalf("Unmarshal failed: %v", err)
	}

	if string(result.LineNo) != "100" {
		t.Errorf("LineNo: got %q, want %q", string(result.LineNo), "100")
	}
}

// TestSearchResponseUnmarshalFullStructure tests the complete response structure
// with integer line numbers in nested results map
func TestSearchResponseUnmarshalFullStructure(t *testing.T) {
	// This mimics the actual API response structure more closely
	jsonData := `{
		"time": 123,
		"resultCount": 2,
		"startDocument": 0,
		"endDocument": 1,
		"results": {
			"illumos-gate": [
				{
					"line": "first match",
					"lineNo": 42,
					"path": "/usr/src/uts/common/io/foo.c",
					"filename": "foo.c",
					"directory": "/usr/src/uts/common/io"
				},
				{
					"line": "second match",
					"lineNo": 100,
					"path": "/usr/src/lib/bar.c",
					"filename": "bar.c",
					"directory": "/usr/src/lib"
				}
			]
		}
	}`

	var resp SearchResponse
	err := json.Unmarshal([]byte(jsonData), &resp)
	if err != nil {
		t.Fatalf("Unmarshal failed: %v", err)
	}

	results := resp.Results["illumos-gate"]
	if len(results) != 2 {
		t.Fatalf("Expected 2 results, got %d", len(results))
	}

	// Verify first result line number
	if string(results[0].LineNo) != "42" {
		t.Errorf("First result LineNo: got %q, want %q", string(results[0].LineNo), "42")
	}

	// Verify second result line number
	if string(results[1].LineNo) != "100" {
		t.Errorf("Second result LineNo: got %q, want %q", string(results[1].LineNo), "100")
	}
}

// TestSearchResponseUnmarshalWithLowerCaseLineno tests that we handle the "lineno"
// field (lowercase) which is what the OpenGrok API actually returns for full text search.
// This is a regression test for issue #40.
func TestSearchResponseUnmarshalWithLowerCaseLineno(t *testing.T) {
	// The OpenGrok API returns "lineno" (lowercase) for full text search results,
	// not "lineNo" (camelCase). This test verifies we handle both field names.
	jsonData := `{
		"time": 123,
		"resultCount": 2,
		"startDocument": 0,
		"endDocument": 1,
		"results": {
			"illumos-gate": [
				{
					"line": "first match",
					"lineno": "42",
					"path": "/usr/src/uts/common/io/foo.c",
					"filename": "foo.c",
					"directory": "/usr/src/uts/common/io"
				},
				{
					"line": "second match",
					"lineno": "100",
					"path": "/usr/src/lib/bar.c",
					"filename": "bar.c",
					"directory": "/usr/src/lib"
				}
			]
		}
	}`

	var resp SearchResponse
	err := json.Unmarshal([]byte(jsonData), &resp)
	if err != nil {
		t.Fatalf("Unmarshal failed: %v", err)
	}

	results := resp.Results["illumos-gate"]
	if len(results) != 2 {
		t.Fatalf("Expected 2 results, got %d", len(results))
	}

	t.Logf("First result LineNo value: %q", string(results[0].LineNo))
	t.Logf("Second result LineNo value: %q", string(results[1].LineNo))

	if string(results[0].LineNo) != "42" {
		t.Errorf("First result LineNo: got %q, want %q (API returns 'lineno' lowercase)", string(results[0].LineNo), "42")
	}

	if string(results[1].LineNo) != "100" {
		t.Errorf("Second result LineNo: got %q, want %q (API returns 'lineno' lowercase)", string(results[1].LineNo), "100")
	}
}

// TestSearchResponseUnmarshalWithLowerCaseLinenoAsNumber tests that we handle the "lineno"
// field when it's returned as an integer (which is what OpenGrok API actually does).
// This is a regression test for issue #40.
func TestSearchResponseUnmarshalWithLowerCaseLinenoAsNumber(t *testing.T) {
	// The OpenGrok API returns "lineno" as an integer for full text search
	jsonData := `{
		"time": 123,
		"resultCount": 2,
		"startDocument": 0,
		"endDocument": 1,
		"results": {
			"illumos-gate": [
				{
					"line": "first match",
					"lineno": 42,
					"path": "/usr/src/uts/common/io/foo.c",
					"filename": "foo.c",
					"directory": "/usr/src/uts/common/io"
				},
				{
					"line": "second match",
					"lineno": 100,
					"path": "/usr/src/lib/bar.c",
					"filename": "bar.c",
					"directory": "/usr/src/lib"
				}
			]
		}
	}`

	var resp SearchResponse
	err := json.Unmarshal([]byte(jsonData), &resp)
	if err != nil {
		t.Fatalf("Unmarshal failed: %v", err)
	}

	results := resp.Results["illumos-gate"]
	if len(results) != 2 {
		t.Fatalf("Expected 2 results, got %d", len(results))
	}

	t.Logf("First result LineNo value: %q", string(results[0].LineNo))
	t.Logf("Second result LineNo value: %q", string(results[1].LineNo))

	if string(results[0].LineNo) != "42" {
		t.Errorf("First result LineNo: got %q, want %q (API returns 'lineno' as integer)", string(results[0].LineNo), "42")
	}

	if string(results[1].LineNo) != "100" {
		t.Errorf("Second result LineNo: got %q, want %q (API returns 'lineno' as integer)", string(results[1].LineNo), "100")
	}
}

// TestSearchResultUnmarshalBothFormats tests that all field name variants
// (lineNo, lineno, lineNumber) are handled correctly.
func TestSearchResultUnmarshalBothFormats(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "camelCase lineNo as string",
			input:    `{"line": "test", "lineNo": "123", "path": "/test.c", "filename": "test.c", "directory": "/"}`,
			expected: "123",
		},
		{
			name:     "camelCase lineNo as integer",
			input:    `{"line": "test", "lineNo": 456, "path": "/test.c", "filename": "test.c", "directory": "/"}`,
			expected: "456",
		},
		{
			name:     "lowercase lineno as string",
			input:    `{"line": "test", "lineno": "789", "path": "/test.c", "filename": "test.c", "directory": "/"}`,
			expected: "789",
		},
		{
			name:     "lowercase lineno as integer",
			input:    `{"line": "test", "lineno": 1000, "path": "/test.c", "filename": "test.c", "directory": "/"}`,
			expected: "1000",
		},
		{
			name:     "full word lineNumber as string",
			input:    `{"line": "test", "lineNumber": "265", "path": "/test.c", "filename": "test.c", "directory": "/"}`,
			expected: "265",
		},
		{
			name:     "full word lineNumber as integer",
			input:    `{"line": "test", "lineNumber": 1027, "path": "/test.c", "filename": "test.c", "directory": "/"}`,
			expected: "1027",
		},
		{
			name:     "missing line number field",
			input:    `{"line": "test", "path": "/test.c", "filename": "test.c", "directory": "/"}`,
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var result SearchResult
			err := json.Unmarshal([]byte(tt.input), &result)
			if err != nil {
				t.Fatalf("Unmarshal failed: %v", err)
			}
			t.Logf("LineNo value: %q", string(result.LineNo))
			if string(result.LineNo) != tt.expected {
				t.Errorf("got %q, want %q", string(result.LineNo), tt.expected)
			}
		})
	}
}

func TestHasAuth(t *testing.T) {
	tests := []struct {
		name     string
		client   Client
		expected bool
	}{
		{
			name:     "no auth configured",
			client:   Client{BaseURL: "http://example.com"},
			expected: false,
		},
		{
			name:     "bearer token configured",
			client:   Client{BaseURL: "http://example.com", BearerToken: "token123"},
			expected: true,
		},
		{
			name:     "api key configured",
			client:   Client{BaseURL: "http://example.com", APIKey: "key123"},
			expected: true,
		},
		{
			name:     "username configured",
			client:   Client{BaseURL: "http://example.com", Username: "user"},
			expected: true,
		},
		{
			name:     "username and password configured",
			client:   Client{BaseURL: "http://example.com", Username: "user", Password: "pass"},
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.client.hasAuth(); got != tt.expected {
				t.Errorf("hasAuth() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestFormatHTTPError(t *testing.T) {
	tests := []struct {
		name           string
		client         Client
		statusCode     int
		body           []byte
		expectContains []string
	}{
		{
			name:       "401 without auth configured",
			client:     Client{BaseURL: "http://example.com"},
			statusCode: http.StatusUnauthorized,
			body:       []byte("<!doctype html><html>...</html>"),
			expectContains: []string{
				"authentication required",
				"401 Unauthorized",
				"og init",
			},
		},
		{
			name:       "401 with auth configured",
			client:     Client{BaseURL: "http://example.com", Username: "user", Password: "pass"},
			statusCode: http.StatusUnauthorized,
			body:       []byte("<!doctype html><html>...</html>"),
			expectContains: []string{
				"authentication failed",
				"401 Unauthorized",
				"credentials were rejected",
			},
		},
		{
			name:       "403 forbidden",
			client:     Client{BaseURL: "http://example.com"},
			statusCode: http.StatusForbidden,
			body:       []byte("Access denied"),
			expectContains: []string{
				"access denied",
				"403 Forbidden",
			},
		},
		{
			name:       "404 not found",
			client:     Client{BaseURL: "http://example.com"},
			statusCode: http.StatusNotFound,
			body:       []byte("Not found"),
			expectContains: []string{
				"not found",
				"404",
			},
		},
		{
			name:       "500 server error includes truncated body",
			client:     Client{BaseURL: "http://example.com"},
			statusCode: http.StatusInternalServerError,
			body:       []byte("Internal server error occurred"),
			expectContains: []string{
				"500",
				"Internal server error",
			},
		},
		{
			name:       "long body gets truncated",
			client:     Client{BaseURL: "http://example.com"},
			statusCode: http.StatusInternalServerError,
			body:       []byte(strings.Repeat("a", 300)),
			expectContains: []string{
				"...",
			},
		},
		{
			name:       "empty body",
			client:     Client{BaseURL: "http://example.com"},
			statusCode: http.StatusInternalServerError,
			body:       []byte{},
			expectContains: []string{
				"500",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.client.formatHTTPError(tt.statusCode, tt.body)
			if err == nil {
				t.Fatal("expected an error, got nil")
			}
			errStr := err.Error()
			for _, expected := range tt.expectContains {
				if !strings.Contains(errStr, expected) {
					t.Errorf("error message %q should contain %q", errStr, expected)
				}
			}
		})
	}
}
