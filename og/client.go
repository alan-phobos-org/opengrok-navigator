package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	// maxResponseSize limits response body to 10MB to prevent memory exhaustion
	maxResponseSize = 10 * 1024 * 1024
)

// Client represents an OpenGrok API client
type Client struct {
	BaseURL     string
	HTTPClient  *http.Client
	Username    string
	Password    string
	APIKey      string
	BearerToken string
}

// NewClient creates a new OpenGrok API client
func NewClient(baseURL string) (*Client, error) {
	// Validate URL
	parsedURL, err := url.Parse(baseURL)
	if err != nil {
		return nil, fmt.Errorf("invalid server URL: %w", err)
	}

	// Check for valid scheme
	scheme := strings.ToLower(parsedURL.Scheme)
	if scheme != "http" && scheme != "https" {
		return nil, fmt.Errorf("invalid URL scheme %q: must be http or https", parsedURL.Scheme)
	}

	// Check for host
	if parsedURL.Host == "" {
		return nil, fmt.Errorf("invalid server URL: missing host")
	}

	return &Client{
		BaseURL: baseURL,
		HTTPClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}, nil
}

// setAuthHeaders adds authentication headers to the request based on configured credentials
func (c *Client) setAuthHeaders(req *http.Request) {
	// Priority: Bearer token > API Key > Basic Auth
	if c.BearerToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.BearerToken)
	} else if c.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.APIKey)
	} else if c.Username != "" {
		req.SetBasicAuth(c.Username, c.Password)
	}
}

// hasAuth returns true if the client has any authentication configured
func (c *Client) hasAuth() bool {
	return c.BearerToken != "" || c.APIKey != "" || c.Username != ""
}

// formatHTTPError returns a user-friendly error message for HTTP error responses
func (c *Client) formatHTTPError(statusCode int, body []byte) error {
	switch statusCode {
	case http.StatusUnauthorized:
		if c.hasAuth() {
			return fmt.Errorf("authentication failed (401 Unauthorized): the provided credentials were rejected by the server")
		}
		return fmt.Errorf("authentication required (401 Unauthorized): this server requires authentication. " +
			"Configure credentials with 'og init <url> --username <user> --password <pass>' or use --bearer-token/--api-key flags")
	case http.StatusForbidden:
		return fmt.Errorf("access denied (403 Forbidden): you don't have permission to access this resource")
	case http.StatusNotFound:
		return fmt.Errorf("not found (404): the API endpoint was not found. Verify the server URL is correct")
	default:
		// For other errors, include a truncated body if it looks like HTML (common for error pages)
		bodyStr := string(body)
		if len(bodyStr) > 200 {
			bodyStr = bodyStr[:200] + "..."
		}
		return fmt.Errorf("API returned status %d: %s", statusCode, bodyStr)
	}
}

// FlexibleString is a type that can unmarshal from either a JSON string or number
type FlexibleString string

// UnmarshalJSON implements the json.Unmarshaler interface
func (f *FlexibleString) UnmarshalJSON(data []byte) error {
	// Handle null explicitly
	if string(data) == "null" {
		*f = ""
		return nil
	}

	// Try to unmarshal as a string first (handles quoted strings like "123")
	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		*f = FlexibleString(s)
		return nil
	}

	// Try to unmarshal as a float64 (handles bare numbers like 123)
	// json.Unmarshal uses float64 for all JSON numbers by default
	var num float64
	if err := json.Unmarshal(data, &num); err == nil {
		// Format as integer if it's a whole number (which line numbers should be)
		if num == float64(int64(num)) {
			*f = FlexibleString(fmt.Sprintf("%d", int64(num)))
		} else {
			*f = FlexibleString(fmt.Sprintf("%g", num))
		}
		return nil
	}

	// If both fail, set to empty string
	*f = ""
	return nil
}

// String returns the string value
func (f FlexibleString) String() string {
	return string(f)
}

// SearchResult represents a single search result from OpenGrok
type SearchResult struct {
	Line      string         `json:"line"`
	LineNo    FlexibleString `json:"lineNo"`
	Path      string         `json:"path"`
	Filename  string         `json:"filename"`
	Directory string         `json:"directory"`
}

// UnmarshalJSON implements custom unmarshaling to handle multiple field name variants
// from the OpenGrok API. Different OpenGrok versions and search types use different names:
// - "lineNo" (camelCase) - older versions for symbol/definition search
// - "lineno" (lowercase) - some versions for full text search
// - "lineNumber" (full word) - newer versions (e.g., illumos OpenGrok)
func (s *SearchResult) UnmarshalJSON(data []byte) error {
	// Use an alias to avoid infinite recursion
	type SearchResultAlias SearchResult

	// First try with the standard struct tags
	var alias SearchResultAlias
	if err := json.Unmarshal(data, &alias); err != nil {
		return err
	}

	*s = SearchResult(alias)

	// If LineNo is empty, check for alternate field names
	if s.LineNo == "" {
		// Parse as a map to check for alternate field names
		var raw map[string]json.RawMessage
		if err := json.Unmarshal(data, &raw); err != nil {
			return nil // Don't fail, just use what we have
		}

		// Check for "lineNumber" (full word) - used by newer OpenGrok versions
		if lineNumberRaw, ok := raw["lineNumber"]; ok {
			var lineNumber FlexibleString
			if err := json.Unmarshal(lineNumberRaw, &lineNumber); err == nil {
				s.LineNo = lineNumber
				return nil
			}
		}

		// Check for "lineno" (lowercase) - used by some OpenGrok versions
		if linenoRaw, ok := raw["lineno"]; ok {
			var lineno FlexibleString
			if err := json.Unmarshal(linenoRaw, &lineno); err == nil {
				s.LineNo = lineno
			}
		}
	}

	return nil
}

// SearchResponse represents the response from the OpenGrok search API
type SearchResponse struct {
	Time          int64                     `json:"time"`
	ResultCount   int                       `json:"resultCount"`
	StartDocument int                       `json:"startDocument"`
	EndDocument   int                       `json:"endDocument"`
	Results       map[string][]SearchResult `json:"results"`
}

// SearchOptions contains optional parameters for the search
type SearchOptions struct {
	// Full search (searches all text)
	Full string
	// Definition search (searches symbol definitions)
	Def string
	// Symbol search (searches symbol references)
	Symbol string
	// Path search (searches file paths)
	Path string
	// History search (searches version control history)
	Hist string
	// Type search (searches file types)
	Type string
	// Projects to search in (comma-separated)
	Projects string
	// Maximum number of results
	MaxResults int
	// Start index for pagination
	Start int
}

// Search performs a search against the OpenGrok API
func (c *Client) Search(opts SearchOptions) (*SearchResponse, error) {
	// Build query parameters
	params := url.Values{}

	if opts.Full != "" {
		params.Set("full", opts.Full)
	}
	if opts.Def != "" {
		params.Set("def", opts.Def)
	}
	if opts.Symbol != "" {
		params.Set("symbol", opts.Symbol)
	}
	if opts.Path != "" {
		params.Set("path", opts.Path)
	}
	if opts.Hist != "" {
		params.Set("hist", opts.Hist)
	}
	if opts.Type != "" {
		params.Set("type", opts.Type)
	}
	if opts.Projects != "" {
		params.Set("projects", opts.Projects)
	}
	if opts.MaxResults > 0 {
		params.Set("maxresults", fmt.Sprintf("%d", opts.MaxResults))
	}
	if opts.Start > 0 {
		params.Set("start", fmt.Sprintf("%d", opts.Start))
	}

	// Build the request URL
	searchURL := fmt.Sprintf("%s/api/v1/search?%s", c.BaseURL, params.Encode())

	// Create the request
	req, err := http.NewRequest("GET", searchURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "application/json")
	c.setAuthHeaders(req)

	// Execute the request
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	// Check for non-200 status codes
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, c.formatHTTPError(resp.StatusCode, body)
	}

	// Parse the response with size limit
	limitedReader := io.LimitReader(resp.Body, maxResponseSize)
	body, err := io.ReadAll(limitedReader)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	var searchResp SearchResponse
	if err := json.Unmarshal(body, &searchResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &searchResp, nil
}

// GetProjects retrieves the list of available projects from OpenGrok
func (c *Client) GetProjects() ([]string, error) {
	projectsURL := fmt.Sprintf("%s/api/v1/projects", c.BaseURL)

	req, err := http.NewRequest("GET", projectsURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "application/json")
	c.setAuthHeaders(req)

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, c.formatHTTPError(resp.StatusCode, body)
	}

	limitedReader := io.LimitReader(resp.Body, maxResponseSize)
	body, err := io.ReadAll(limitedReader)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	var projects []string
	if err := json.Unmarshal(body, &projects); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return projects, nil
}

// GetFileLines fetches lines from a file using the raw API
// This is used to get context around a specific line to extract function names
// Returns lines in the range [startLine, endLine] inclusive (1-indexed)
func (c *Client) GetFileLines(filePath string, startLine, endLine int) ([]string, error) {
	// OpenGrok raw endpoint: /raw/path/to/file
	// This returns plain text, much faster than parsing xref HTML
	rawURL := fmt.Sprintf("%s/raw%s", c.BaseURL, filePath)

	req, err := http.NewRequest("GET", rawURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "text/plain")
	c.setAuthHeaders(req)

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// If raw API fails, return empty - don't fail the whole trace
		return nil, fmt.Errorf("raw API returned status %d", resp.StatusCode)
	}

	// Read the response
	limitedReader := io.LimitReader(resp.Body, maxResponseSize)
	body, err := io.ReadAll(limitedReader)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	// Split into lines and extract the range we need
	allLines := strings.Split(string(body), "\n")

	var result []string
	// Lines are 1-indexed in the API, but 0-indexed in our array
	for i := startLine - 1; i < endLine && i < len(allLines); i++ {
		if i >= 0 {
			result = append(result, allLines[i])
		}
	}

	return result, nil
}
