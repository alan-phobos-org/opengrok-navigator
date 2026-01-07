package main

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Annotation represents a single annotation on a line
type Annotation struct {
	Line      int      `json:"line"`
	Author    string   `json:"author"`
	Timestamp string   `json:"timestamp"`
	Text      string   `json:"text"`
	Context   []string `json:"context,omitempty"`
	FilePath  string   `json:"filePath,omitempty"` // Used when listing all annotated files
}

// EditEntry represents someone currently editing
type EditEntry struct {
	User      string `json:"user"`
	FilePath  string `json:"filePath"`
	Line      int    `json:"line"`
	Timestamp string `json:"timestamp"`
}

// encodeFilename converts project/path to filename format
// Uses __ as path separator, ___ to escape actual __ in names
func encodeFilename(project, filePath string) string {
	// First escape any existing __ as ___
	project = strings.ReplaceAll(project, "__", "___")
	filePath = strings.ReplaceAll(filePath, "__", "___")

	// Replace path separators with __
	filePath = strings.ReplaceAll(filePath, "/", "__")

	return project + "__" + filePath + ".md"
}

// decodeFilename converts filename back to project/path
func decodeFilename(filename string) (project, filePath string, ok bool) {
	// Remove .md suffix
	if !strings.HasSuffix(filename, ".md") {
		return "", "", false
	}
	filename = strings.TrimSuffix(filename, ".md")

	// Split into parts by __ (but not ___)
	// We need to handle ___ (escaped __) vs __ (separator)
	// Strategy: replace ___ with a placeholder, split by __, then restore

	placeholder := "\x00"
	temp := strings.ReplaceAll(filename, "___", placeholder)
	parts := strings.Split(temp, "__")

	if len(parts) < 2 {
		return "", "", false
	}

	// First part is project
	project = strings.ReplaceAll(parts[0], placeholder, "__")

	// Rest is the file path
	pathParts := parts[1:]
	for i := range pathParts {
		pathParts[i] = strings.ReplaceAll(pathParts[i], placeholder, "__")
	}
	filePath = strings.Join(pathParts, "/")

	return project, filePath, true
}

// ReadAnnotations reads all annotations for a file
func ReadAnnotations(storagePath, project, filePath string) ([]Annotation, error) {
	filename := encodeFilename(project, filePath)
	fullPath := filepath.Join(storagePath, filename)

	file, err := os.Open(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			return []Annotation{}, nil
		}
		return nil, fmt.Errorf("failed to open annotation file: %w", err)
	}
	defer file.Close()

	return parseAnnotationFile(file)
}

// parseAnnotationFile parses the markdown annotation format
func parseAnnotationFile(file *os.File) ([]Annotation, error) {
	scanner := bufio.NewScanner(file)
	var annotations []Annotation
	var current *Annotation
	var inContext, inAnnotation, inCodeFence bool
	var contextLines []string
	var annotationLines []string

	// Regex to match annotation header: ## Line N - author - timestamp
	headerRe := regexp.MustCompile(`^## Line (\d+) - (.+) - (\S+)$`)

	for scanner.Scan() {
		line := scanner.Text()

		// Check for annotation header
		if matches := headerRe.FindStringSubmatch(line); matches != nil {
			// Save previous annotation
			if current != nil {
				current.Context = contextLines
				current.Text = strings.TrimSpace(strings.Join(annotationLines, "\n"))
				annotations = append(annotations, *current)
			}

			lineNum, _ := strconv.Atoi(matches[1])
			current = &Annotation{
				Line:      lineNum,
				Author:    matches[2],
				Timestamp: matches[3],
			}
			contextLines = nil
			annotationLines = nil
			inContext = false
			inAnnotation = false
			inCodeFence = false
			continue
		}

		if current == nil {
			continue
		}

		// Check for section markers
		if line == "### Context" {
			inContext = true
			inAnnotation = false
			inCodeFence = false
			continue
		}
		if line == "### Annotation" {
			inContext = false
			inAnnotation = true
			inCodeFence = false
			continue
		}
		if line == "---" {
			// Save current annotation
			current.Context = contextLines
			current.Text = strings.TrimSpace(strings.Join(annotationLines, "\n"))
			annotations = append(annotations, *current)
			current = nil
			contextLines = nil
			annotationLines = nil
			inContext = false
			inAnnotation = false
			inCodeFence = false
			continue
		}

		// Track code fence state in context section
		if inContext && (line == "```" || strings.HasPrefix(line, "```")) {
			inCodeFence = !inCodeFence
			continue
		}

		// Collect content only when inside code fence (for context) or in annotation section
		if inContext && inCodeFence {
			contextLines = append(contextLines, line)
		} else if inAnnotation {
			annotationLines = append(annotationLines, line)
		}
	}

	// Don't forget last annotation if file doesn't end with ---
	if current != nil {
		current.Context = contextLines
		current.Text = strings.TrimSpace(strings.Join(annotationLines, "\n"))
		annotations = append(annotations, *current)
	}

	return annotations, scanner.Err()
}

// SaveAnnotation saves or updates an annotation
func SaveAnnotation(storagePath, project, filePath string, line int, author, text string, context []string) error {
	// Ensure storage directory exists
	if err := os.MkdirAll(storagePath, 0755); err != nil {
		return fmt.Errorf("failed to create storage directory: %w", err)
	}

	filename := encodeFilename(project, filePath)
	fullPath := filepath.Join(storagePath, filename)

	// Read existing annotations
	var annotations []Annotation
	if file, err := os.Open(fullPath); err == nil {
		annotations, _ = parseAnnotationFile(file)
		file.Close()
	}

	// Find and update existing or append new
	found := false
	timestamp := time.Now().UTC().Format(time.RFC3339)
	for i := range annotations {
		if annotations[i].Line == line {
			annotations[i].Author = author
			annotations[i].Timestamp = timestamp
			annotations[i].Text = text
			annotations[i].Context = context
			found = true
			break
		}
	}

	if !found {
		annotations = append(annotations, Annotation{
			Line:      line,
			Author:    author,
			Timestamp: timestamp,
			Text:      text,
			Context:   context,
		})
	}

	// Sort by line number
	for i := 0; i < len(annotations)-1; i++ {
		for j := i + 1; j < len(annotations); j++ {
			if annotations[i].Line > annotations[j].Line {
				annotations[i], annotations[j] = annotations[j], annotations[i]
			}
		}
	}

	// Write file
	return writeAnnotationFile(fullPath, project, filePath, annotations)
}

func writeAnnotationFile(fullPath, project, filePath string, annotations []Annotation) error {
	file, err := os.Create(fullPath)
	if err != nil {
		return fmt.Errorf("failed to create annotation file: %w", err)
	}
	defer file.Close()

	// Write header
	fmt.Fprintf(file, "# %s/%s\n\n", project, filePath)

	// Write each annotation
	for _, ann := range annotations {
		fmt.Fprintf(file, "## Line %d - %s - %s\n\n", ann.Line, ann.Author, ann.Timestamp)

		// Write context if available
		if len(ann.Context) > 0 {
			fmt.Fprintln(file, "### Context")
			fmt.Fprintln(file, "```")
			for _, ctxLine := range ann.Context {
				fmt.Fprintln(file, ctxLine)
			}
			fmt.Fprintln(file, "```")
			fmt.Fprintln(file)
		}

		fmt.Fprintln(file, "### Annotation")
		fmt.Fprintln(file, ann.Text)
		fmt.Fprintln(file)
		fmt.Fprintln(file, "---")
		fmt.Fprintln(file)
	}

	return nil
}

// DeleteAnnotation removes an annotation for a specific line
func DeleteAnnotation(storagePath, project, filePath string, line int) error {
	filename := encodeFilename(project, filePath)
	fullPath := filepath.Join(storagePath, filename)

	// Read existing annotations
	file, err := os.Open(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // Nothing to delete
		}
		return fmt.Errorf("failed to open annotation file: %w", err)
	}

	annotations, err := parseAnnotationFile(file)
	file.Close()
	if err != nil {
		return err
	}

	// Filter out the annotation
	var filtered []Annotation
	for _, ann := range annotations {
		if ann.Line != line {
			filtered = append(filtered, ann)
		}
	}

	// If no annotations left, delete the file
	if len(filtered) == 0 {
		return os.Remove(fullPath)
	}

	// Write remaining annotations
	return writeAnnotationFile(fullPath, project, filePath, filtered)
}

// StartEditing marks a user as editing a file/line
func StartEditing(storagePath, user, filePath string, line int) error {
	if err := os.MkdirAll(storagePath, 0755); err != nil {
		return err
	}

	editPath := filepath.Join(storagePath, ".editing.md")

	// Read existing entries
	entries, _ := GetEditing(storagePath)

	// Remove any existing entry for this user
	var filtered []EditEntry
	for _, e := range entries {
		if e.User != user {
			filtered = append(filtered, e)
		}
	}

	// Add new entry
	filtered = append(filtered, EditEntry{
		User:      user,
		FilePath:  filePath,
		Line:      line,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})

	return writeEditingFile(editPath, filtered)
}

// StopEditing removes a user's editing marker
func StopEditing(storagePath, user string) error {
	editPath := filepath.Join(storagePath, ".editing.md")

	entries, err := GetEditing(storagePath)
	if err != nil {
		return nil // No editing file is fine
	}

	var filtered []EditEntry
	for _, e := range entries {
		if e.User != user {
			filtered = append(filtered, e)
		}
	}

	if len(filtered) == 0 {
		return os.Remove(editPath)
	}

	return writeEditingFile(editPath, filtered)
}

// GetEditing returns all current editing entries
func GetEditing(storagePath string) ([]EditEntry, error) {
	editPath := filepath.Join(storagePath, ".editing.md")

	file, err := os.Open(editPath)
	if err != nil {
		if os.IsNotExist(err) {
			return []EditEntry{}, nil
		}
		return nil, err
	}
	defer file.Close()

	var entries []EditEntry
	scanner := bufio.NewScanner(file)
	// Format: user: filePath:line @ timestamp
	entryRe := regexp.MustCompile(`^(.+?): (.+?):(\d+) @ (\S+)$`)

	staleThreshold := time.Now().Add(-5 * time.Minute) // 5 minute timeout

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" || line == "# Currently Being Edited" {
			continue
		}

		matches := entryRe.FindStringSubmatch(line)
		if matches == nil {
			continue
		}

		timestamp, err := time.Parse(time.RFC3339, matches[4])
		if err != nil {
			continue
		}

		// Skip stale entries
		if timestamp.Before(staleThreshold) {
			continue
		}

		lineNum, _ := strconv.Atoi(matches[3])
		entries = append(entries, EditEntry{
			User:      matches[1],
			FilePath:  matches[2],
			Line:      lineNum,
			Timestamp: matches[4],
		})
	}

	return entries, scanner.Err()
}

func writeEditingFile(path string, entries []EditEntry) error {
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()

	fmt.Fprintln(file, "# Currently Being Edited")
	fmt.Fprintln(file)
	for _, e := range entries {
		fmt.Fprintf(file, "%s: %s:%d @ %s\n", e.User, e.FilePath, e.Line, e.Timestamp)
	}
	return nil
}

// ListAnnotatedFiles returns all files with annotations for a project
func ListAnnotatedFiles(storagePath, project string) ([]Annotation, error) {
	entries, err := os.ReadDir(storagePath)
	if err != nil {
		if os.IsNotExist(err) {
			return []Annotation{}, nil
		}
		return nil, err
	}

	prefix := project + "__"
	var results []Annotation

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}
		if entry.Name() == ".editing.md" {
			continue
		}

		fileProject, filePath, ok := decodeFilename(entry.Name())
		if !ok || fileProject != project {
			continue
		}

		// Read annotations from this file
		annotations, err := ReadAnnotations(storagePath, project, filePath)
		if err != nil {
			continue
		}

		// Add file path to each annotation
		for _, ann := range annotations {
			ann.FilePath = filePath
			results = append(results, ann)
		}
	}

	// Unused variable fix
	_ = prefix

	return results, nil
}
