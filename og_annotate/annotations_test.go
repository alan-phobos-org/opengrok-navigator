package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEncodeDecodeFilename(t *testing.T) {
	tests := []struct {
		project  string
		filePath string
	}{
		{"myproject", "src/main/App.java"},
		{"myproject", "src/util.js"},
		{"my__project", "src/file.go"},                 // Project with __
		{"project", "src/my__file.js"},                 // File with __
		{"proj", "deeply/nested/path/to/file.tsx"},     // Deep path
		{"proj", "file.go"},                            // Root file
		{"project-name", "path-with-dashes/file.ts"},   // Dashes
		{"project_name", "path_with_underscores/f.js"}, // Single underscores
	}

	for _, tc := range tests {
		encoded := encodeFilename(tc.project, tc.filePath)

		// Verify it's a valid filename (no path separators)
		if strings.Contains(encoded, "/") || strings.Contains(encoded, "\\") {
			t.Errorf("encodeFilename(%q, %q) = %q contains path separator", tc.project, tc.filePath, encoded)
		}

		// Decode and verify roundtrip
		gotProject, gotPath, ok := decodeFilename(encoded)
		if !ok {
			t.Errorf("decodeFilename(%q) failed", encoded)
			continue
		}
		if gotProject != tc.project {
			t.Errorf("roundtrip project: got %q, want %q", gotProject, tc.project)
		}
		if gotPath != tc.filePath {
			t.Errorf("roundtrip filePath: got %q, want %q", gotPath, tc.filePath)
		}
	}
}

func TestDecodeFilenameInvalid(t *testing.T) {
	tests := []string{
		"not-an-annotation", // No .md suffix
		"single.md",         // No separator
		".editing.md",       // Special file
	}

	for _, filename := range tests {
		_, _, ok := decodeFilename(filename)
		if ok {
			t.Errorf("decodeFilename(%q) should have failed", filename)
		}
	}
}

func TestReadAnnotationsNonexistent(t *testing.T) {
	tmpDir := t.TempDir()

	annotations, err := ReadAnnotations(tmpDir, "project", "nonexistent.go")
	if err != nil {
		t.Errorf("ReadAnnotations for nonexistent file should not error: %v", err)
	}
	if len(annotations) != 0 {
		t.Errorf("expected 0 annotations, got %d", len(annotations))
	}
}

// Helper to create mock source content for tests
func mockSourceContent(numLines int) string {
	var lines []string
	for i := 1; i <= numLines; i++ {
		lines = append(lines, fmt.Sprintf("// line %d of source code", i))
	}
	return strings.Join(lines, "\n")
}

func TestSaveAndReadAnnotation(t *testing.T) {
	tmpDir := t.TempDir()

	// Save an annotation with source content (required for v2 format)
	sourceContent := mockSourceContent(50)
	err := SaveAnnotationV2(tmpDir, "myproject", "src/App.java", 42, "alice", "TODO: refactor this", sourceContent, "")
	if err != nil {
		t.Fatalf("SaveAnnotation failed: %v", err)
	}

	// Read it back
	annotations, err := ReadAnnotations(tmpDir, "myproject", "src/App.java")
	if err != nil {
		t.Fatalf("ReadAnnotations failed: %v", err)
	}

	if len(annotations) != 1 {
		t.Fatalf("expected 1 annotation, got %d", len(annotations))
	}

	ann := annotations[0]
	if ann.Line != 42 {
		t.Errorf("line: got %d, want 42", ann.Line)
	}
	if ann.Author != "alice" {
		t.Errorf("author: got %q, want %q", ann.Author, "alice")
	}
	if ann.Text != "TODO: refactor this" {
		t.Errorf("text: got %q, want %q", ann.Text, "TODO: refactor this")
	}
	// Note: v2 format stores source inline, context is not returned in annotations
}

func TestSaveMultipleAnnotations(t *testing.T) {
	tmpDir := t.TempDir()
	sourceContent := mockSourceContent(30)

	// Save first annotation (with source content)
	err := SaveAnnotationV2(tmpDir, "proj", "file.go", 10, "alice", "First note", sourceContent, "")
	if err != nil {
		t.Fatalf("SaveAnnotation 1 failed: %v", err)
	}

	// Save second annotation (file exists, no source needed)
	err = SaveAnnotationV2(tmpDir, "proj", "file.go", 20, "bob", "Second note", "", "")
	if err != nil {
		t.Fatalf("SaveAnnotation 2 failed: %v", err)
	}

	// Save third annotation (between the two)
	err = SaveAnnotationV2(tmpDir, "proj", "file.go", 15, "carol", "Middle note", "", "")
	if err != nil {
		t.Fatalf("SaveAnnotation 3 failed: %v", err)
	}

	// Read all
	annotations, err := ReadAnnotations(tmpDir, "proj", "file.go")
	if err != nil {
		t.Fatalf("ReadAnnotations failed: %v", err)
	}

	if len(annotations) != 3 {
		t.Fatalf("expected 3 annotations, got %d", len(annotations))
	}

	// Verify sorted order
	if annotations[0].Line != 10 {
		t.Errorf("first annotation line: got %d, want 10", annotations[0].Line)
	}
	if annotations[1].Line != 15 {
		t.Errorf("second annotation line: got %d, want 15", annotations[1].Line)
	}
	if annotations[2].Line != 20 {
		t.Errorf("third annotation line: got %d, want 20", annotations[2].Line)
	}
}

func TestUpdateExistingAnnotation(t *testing.T) {
	tmpDir := t.TempDir()
	sourceContent := mockSourceContent(50)

	// Save initial (with source content)
	err := SaveAnnotationV2(tmpDir, "proj", "file.go", 42, "alice", "Original text", sourceContent, "")
	if err != nil {
		t.Fatalf("SaveAnnotation failed: %v", err)
	}

	// Update same line (file exists, no source needed)
	err = SaveAnnotationV2(tmpDir, "proj", "file.go", 42, "bob", "Updated text", "", "")
	if err != nil {
		t.Fatalf("SaveAnnotation update failed: %v", err)
	}

	// Read back
	annotations, err := ReadAnnotations(tmpDir, "proj", "file.go")
	if err != nil {
		t.Fatalf("ReadAnnotations failed: %v", err)
	}

	if len(annotations) != 1 {
		t.Fatalf("expected 1 annotation after update, got %d", len(annotations))
	}

	if annotations[0].Author != "bob" {
		t.Errorf("author after update: got %q, want %q", annotations[0].Author, "bob")
	}
	if annotations[0].Text != "Updated text" {
		t.Errorf("text after update: got %q, want %q", annotations[0].Text, "Updated text")
	}
}

func TestDeleteAnnotation(t *testing.T) {
	tmpDir := t.TempDir()
	sourceContent := mockSourceContent(30)

	// Save two annotations
	SaveAnnotationV2(tmpDir, "proj", "file.go", 10, "alice", "First", sourceContent, "")
	SaveAnnotationV2(tmpDir, "proj", "file.go", 20, "bob", "Second", "", "")

	// Delete first
	err := DeleteAnnotation(tmpDir, "proj", "file.go", 10)
	if err != nil {
		t.Fatalf("DeleteAnnotation failed: %v", err)
	}

	// Read back
	annotations, err := ReadAnnotations(tmpDir, "proj", "file.go")
	if err != nil {
		t.Fatalf("ReadAnnotations failed: %v", err)
	}

	if len(annotations) != 1 {
		t.Fatalf("expected 1 annotation after delete, got %d", len(annotations))
	}

	if annotations[0].Line != 20 {
		t.Errorf("remaining annotation line: got %d, want 20", annotations[0].Line)
	}
}

func TestDeleteLastAnnotationRemovesFile(t *testing.T) {
	tmpDir := t.TempDir()
	sourceContent := mockSourceContent(20)

	// Save one annotation
	SaveAnnotationV2(tmpDir, "proj", "file.go", 10, "alice", "Only one", sourceContent, "")

	// Delete it
	err := DeleteAnnotation(tmpDir, "proj", "file.go", 10)
	if err != nil {
		t.Fatalf("DeleteAnnotation failed: %v", err)
	}

	// Check file is removed
	filename := encodeFilename("proj", "file.go")
	fullPath := filepath.Join(tmpDir, filename)
	if _, err := os.Stat(fullPath); !os.IsNotExist(err) {
		t.Errorf("annotation file should be deleted when empty")
	}
}

func TestDeleteNonexistent(t *testing.T) {
	tmpDir := t.TempDir()

	// Delete from nonexistent file should not error
	err := DeleteAnnotation(tmpDir, "proj", "nonexistent.go", 10)
	if err != nil {
		t.Errorf("DeleteAnnotation for nonexistent file should not error: %v", err)
	}
}

func TestEditTracking(t *testing.T) {
	tmpDir := t.TempDir()

	// Start editing
	err := StartEditing(tmpDir, "alice", "/src/App.java", 42)
	if err != nil {
		t.Fatalf("StartEditing failed: %v", err)
	}

	// Get editing
	entries, err := GetEditing(tmpDir)
	if err != nil {
		t.Fatalf("GetEditing failed: %v", err)
	}

	if len(entries) != 1 {
		t.Fatalf("expected 1 edit entry, got %d", len(entries))
	}

	if entries[0].User != "alice" {
		t.Errorf("user: got %q, want %q", entries[0].User, "alice")
	}
	if entries[0].Line != 42 {
		t.Errorf("line: got %d, want 42", entries[0].Line)
	}

	// Stop editing
	err = StopEditing(tmpDir, "alice")
	if err != nil {
		t.Fatalf("StopEditing failed: %v", err)
	}

	// Verify removed
	entries, _ = GetEditing(tmpDir)
	if len(entries) != 0 {
		t.Errorf("expected 0 entries after stop, got %d", len(entries))
	}
}

func TestEditTrackingMultipleUsers(t *testing.T) {
	tmpDir := t.TempDir()

	StartEditing(tmpDir, "alice", "/file1.go", 10)
	StartEditing(tmpDir, "bob", "/file2.go", 20)

	entries, _ := GetEditing(tmpDir)
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}

	// Updating alice's edit should replace, not duplicate
	StartEditing(tmpDir, "alice", "/file3.go", 30)

	entries, _ = GetEditing(tmpDir)
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries after update, got %d", len(entries))
	}

	// Find alice's entry
	var aliceEntry *EditEntry
	for i := range entries {
		if entries[i].User == "alice" {
			aliceEntry = &entries[i]
			break
		}
	}

	if aliceEntry == nil {
		t.Fatal("alice entry not found")
	}
	if aliceEntry.FilePath != "/file3.go" {
		t.Errorf("alice filePath: got %q, want %q", aliceEntry.FilePath, "/file3.go")
	}
}

func TestListAnnotatedFiles(t *testing.T) {
	tmpDir := t.TempDir()
	sourceContent := mockSourceContent(30)

	// Save annotations in different files
	SaveAnnotationV2(tmpDir, "proj", "src/App.java", 10, "alice", "Note 1", sourceContent, "")
	SaveAnnotationV2(tmpDir, "proj", "src/App.java", 20, "bob", "Note 2", "", "")
	SaveAnnotationV2(tmpDir, "proj", "src/Util.java", 5, "carol", "Note 3", sourceContent, "")
	SaveAnnotationV2(tmpDir, "other", "file.go", 1, "dave", "Different project", sourceContent, "")

	// List all for proj
	results, err := ListAnnotatedFiles(tmpDir, "proj")
	if err != nil {
		t.Fatalf("ListAnnotatedFiles failed: %v", err)
	}

	if len(results) != 3 {
		t.Fatalf("expected 3 results, got %d", len(results))
	}

	// Verify file paths are set
	for _, r := range results {
		if r.FilePath == "" {
			t.Error("FilePath should be set in results")
		}
	}
}

func TestMultilineAnnotationText(t *testing.T) {
	tmpDir := t.TempDir()
	sourceContent := mockSourceContent(50)

	multilineText := `This is line 1.
This is line 2.

This is line 4 after blank.

- List item 1
- List item 2`

	err := SaveAnnotationV2(tmpDir, "proj", "file.go", 42, "alice", multilineText, sourceContent, "")
	if err != nil {
		t.Fatalf("SaveAnnotation failed: %v", err)
	}

	annotations, err := ReadAnnotations(tmpDir, "proj", "file.go")
	if err != nil {
		t.Fatalf("ReadAnnotations failed: %v", err)
	}

	if len(annotations) != 1 {
		t.Fatalf("expected 1 annotation, got %d", len(annotations))
	}

	if annotations[0].Text != multilineText {
		t.Errorf("multiline text mismatch:\ngot:\n%s\n\nwant:\n%s", annotations[0].Text, multilineText)
	}
}

func TestReadAnnotationsWithLongLine(t *testing.T) {
	tmpDir := t.TempDir()
	longLine := strings.Repeat("a", 200000)
	sourceContent := longLine + "\nshort line"

	err := SaveAnnotationV2(tmpDir, "proj", "file.go", 1, "alice", "Note", sourceContent, "")
	if err != nil {
		t.Fatalf("SaveAnnotation failed: %v", err)
	}

	annotations, err := ReadAnnotations(tmpDir, "proj", "file.go")
	if err != nil {
		t.Fatalf("ReadAnnotations failed: %v", err)
	}

	if len(annotations) != 1 {
		t.Fatalf("expected 1 annotation, got %d", len(annotations))
	}
}

func TestStoragePathCreation(t *testing.T) {
	tmpDir := t.TempDir()
	nestedPath := filepath.Join(tmpDir, "a", "b", "c")
	sourceContent := mockSourceContent(10)

	// Save should create nested directories
	err := SaveAnnotationV2(nestedPath, "proj", "file.go", 1, "alice", "Note", sourceContent, "")
	if err != nil {
		t.Fatalf("SaveAnnotation with nested path failed: %v", err)
	}

	// Verify directory was created
	if _, err := os.Stat(nestedPath); os.IsNotExist(err) {
		t.Error("nested storage path should have been created")
	}
}

func TestHandleRequestPing(t *testing.T) {
	resp := handleRequest(Request{Action: "ping"})
	if !resp.Success {
		t.Error("ping should succeed")
	}
}

func TestHandleRequestMissingFields(t *testing.T) {
	tests := []struct {
		name    string
		request Request
	}{
		{
			name:    "read missing storagePath",
			request: Request{Action: "read", Project: "p", FilePath: "f"},
		},
		{
			name:    "read missing project",
			request: Request{Action: "read", StoragePath: "/tmp", FilePath: "f"},
		},
		{
			name:    "save missing line",
			request: Request{Action: "save", StoragePath: "/tmp", Project: "p", FilePath: "f", Author: "a", Text: "t", Source: "src"},
		},
		{
			name:    "save missing source",
			request: Request{Action: "save", StoragePath: "/tmp", Project: "p", FilePath: "f", Line: 1, Author: "a", Text: "t"},
		},
		{
			name:    "delete missing line",
			request: Request{Action: "delete", StoragePath: "/tmp", Project: "p", FilePath: "f"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			resp := handleRequest(tc.request)
			if resp.Success {
				t.Error("should fail with missing required fields")
			}
			if resp.Error == "" {
				t.Error("should have error message")
			}
		})
	}
}

func TestHandleRequestUnknownAction(t *testing.T) {
	resp := handleRequest(Request{Action: "unknown"})
	if resp.Success {
		t.Error("unknown action should fail")
	}
	if !strings.Contains(resp.Error, "Unknown action") {
		t.Errorf("error should mention unknown action: %s", resp.Error)
	}
}

// TestSaveAnnotationWrapperFirstAnnotation tests the SaveAnnotation wrapper
// that main.go uses. This is the actual code path from Chrome extension.
// The wrapper must work for the first annotation even without sourceContent.
func TestSaveAnnotationWrapperFirstAnnotation(t *testing.T) {
	tmpDir := t.TempDir()

	// Use SaveAnnotation (the wrapper) not SaveAnnotationV2
	// This is what handleRequest calls for "save" action
	context := []string{"line before", "annotated line", "line after"}
	err := SaveAnnotation(tmpDir, "proj", "file.go", 10, "alice", "First note", context)
	if err != nil {
		t.Fatalf("SaveAnnotation wrapper failed for first annotation: %v", err)
	}

	// Verify annotation was saved
	annotations, err := ReadAnnotations(tmpDir, "proj", "file.go")
	if err != nil {
		t.Fatalf("ReadAnnotations failed: %v", err)
	}

	if len(annotations) != 1 {
		t.Fatalf("expected 1 annotation, got %d", len(annotations))
	}

	if annotations[0].Text != "First note" {
		t.Errorf("text: got %q, want %q", annotations[0].Text, "First note")
	}
}

// TestHandleRequestSaveFirstAnnotation tests the full request handling path
// for saving the first annotation - the actual code path from Chrome.
func TestHandleRequestSaveFirstAnnotation(t *testing.T) {
	tmpDir := t.TempDir()

	req := Request{
		Action:      "save",
		StoragePath: tmpDir,
		Project:     "myproject",
		FilePath:    "src/App.java",
		Line:        3,
		Author:      "alice",
		Text:        "TODO: fix this",
		Context:     []string{"before", "current", "after"},
		Source:      "package main;\n\npublic class App {\n    // lots of code here\n}",
	}

	resp := handleRequest(req)
	if !resp.Success {
		t.Fatalf("handleRequest save failed: %s", resp.Error)
	}

	// Verify via read
	readResp := handleRequest(Request{
		Action:      "read",
		StoragePath: tmpDir,
		Project:     "myproject",
		FilePath:    "src/App.java",
	})

	if !readResp.Success {
		t.Fatalf("handleRequest read failed: %s", readResp.Error)
	}

	if len(readResp.Annotations) != 1 {
		t.Fatalf("expected 1 annotation, got %d", len(readResp.Annotations))
	}
}
