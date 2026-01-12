package main

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

const maxScanToken = 1024 * 1024

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

// V2FileHeader contains metadata for v2 annotation files
type V2FileHeader struct {
	Source   string // project/path
	Hash     string // SHA-256 prefix (12 chars)
	Captured string // ISO 8601 timestamp
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

// computeSourceHash computes SHA-256 hash prefix of source content
func computeSourceHash(content string) string {
	hash := sha256.Sum256([]byte(content))
	return hex.EncodeToString(hash[:])[:12]
}

// formatLineNumber formats a line number with right-aligned padding
func formatLineNumber(lineNum, maxLineNum int) string {
	width := len(strconv.Itoa(maxLineNum))
	return fmt.Sprintf("%*d|", width, lineNum)
}

// parseV2File parses a v2 format annotation file
func parseV2File(path string) (header V2FileHeader, annotations []Annotation, sourceLines []string, err error) {
	file, err := os.Open(path)
	if err != nil {
		return header, nil, nil, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 64*1024), maxScanToken)

	// Parse frontmatter
	inFrontmatter := false
	frontmatterDone := false

	// Regex patterns
	sourceLineRe := regexp.MustCompile(`^\s*(\d+)\|(.*)$`)
	lineMarkerRe := regexp.MustCompile(`^## Line (\d+)$`)
	annotationHeaderRe := regexp.MustCompile(`^> \*\*@([^*]+)\*\* \(([^)]+)\):$`)

	var currentAnnotation *Annotation
	var annotationLines []string
	lastSourceLine := 0

	for scanner.Scan() {
		line := scanner.Text()

		// Handle frontmatter
		if line == "---" {
			if !inFrontmatter && !frontmatterDone {
				inFrontmatter = true
				continue
			} else if inFrontmatter {
				inFrontmatter = false
				frontmatterDone = true
				continue
			}
		}

		if inFrontmatter {
			if strings.HasPrefix(line, "source:") {
				header.Source = strings.TrimSpace(strings.TrimPrefix(line, "source:"))
			} else if strings.HasPrefix(line, "hash:") {
				header.Hash = strings.TrimSpace(strings.TrimPrefix(line, "hash:"))
			} else if strings.HasPrefix(line, "captured:") {
				header.Captured = strings.TrimSpace(strings.TrimPrefix(line, "captured:"))
			}
			continue
		}

		// Check if this is a source line
		if matches := sourceLineRe.FindStringSubmatch(line); matches != nil {
			// Save any pending annotation
			if currentAnnotation != nil {
				currentAnnotation.Text = strings.TrimSpace(strings.Join(annotationLines, "\n"))
				annotations = append(annotations, *currentAnnotation)
				currentAnnotation = nil
				annotationLines = nil
			}

			lineNum, _ := strconv.Atoi(matches[1])
			lastSourceLine = lineNum
			// Remove leading space after the | separator
			content := matches[2]
			if len(content) > 0 && content[0] == ' ' {
				content = content[1:]
			}
			sourceLines = append(sourceLines, content)
			continue
		}

		// Check if this is a line marker (used when no source content)
		if matches := lineMarkerRe.FindStringSubmatch(line); matches != nil {
			// Save any pending annotation
			if currentAnnotation != nil {
				currentAnnotation.Text = strings.TrimSpace(strings.Join(annotationLines, "\n"))
				annotations = append(annotations, *currentAnnotation)
				currentAnnotation = nil
				annotationLines = nil
			}

			lineNum, _ := strconv.Atoi(matches[1])
			lastSourceLine = lineNum
			continue
		}

		// Check if this is an annotation header
		if matches := annotationHeaderRe.FindStringSubmatch(line); matches != nil {
			// Save any pending annotation first
			if currentAnnotation != nil {
				currentAnnotation.Text = strings.TrimSpace(strings.Join(annotationLines, "\n"))
				annotations = append(annotations, *currentAnnotation)
				annotationLines = nil
			}

			currentAnnotation = &Annotation{
				Line:      lastSourceLine,
				Author:    matches[1],
				Timestamp: matches[2],
			}
			continue
		}

		// Check if this is annotation content (blockquote)
		if strings.HasPrefix(line, "> ") && currentAnnotation != nil {
			annotationLines = append(annotationLines, strings.TrimPrefix(line, "> "))
			continue
		}

		// Empty line might end an annotation
		if line == "" && currentAnnotation != nil && len(annotationLines) > 0 {
			currentAnnotation.Text = strings.TrimSpace(strings.Join(annotationLines, "\n"))
			annotations = append(annotations, *currentAnnotation)
			currentAnnotation = nil
			annotationLines = nil
		}
	}

	// Save final annotation if any
	if currentAnnotation != nil {
		currentAnnotation.Text = strings.TrimSpace(strings.Join(annotationLines, "\n"))
		annotations = append(annotations, *currentAnnotation)
	}

	return header, annotations, sourceLines, scanner.Err()
}

// writeV2File writes a v2 format annotation file
func writeV2File(path string, header V2FileHeader, sourceLines []string, annotations []Annotation) error {
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()

	// Write frontmatter
	fmt.Fprintln(file, "---")
	fmt.Fprintf(file, "source: %s\n", header.Source)
	fmt.Fprintf(file, "hash: %s\n", header.Hash)
	fmt.Fprintf(file, "captured: %s\n", header.Captured)
	fmt.Fprintln(file, "---")
	fmt.Fprintln(file)

	// Build annotation map by line
	annotationMap := make(map[int][]Annotation)
	for _, ann := range annotations {
		annotationMap[ann.Line] = append(annotationMap[ann.Line], ann)
	}

	maxLineNum := len(sourceLines)

	// If we have source lines, write them with inline annotations
	if len(sourceLines) > 0 {
		for i, sourceLine := range sourceLines {
			lineNum := i + 1
			fmt.Fprintf(file, "%s %s\n", formatLineNumber(lineNum, maxLineNum), sourceLine)

			// Write any annotations for this line
			if anns, ok := annotationMap[lineNum]; ok {
				for _, ann := range anns {
					fmt.Fprintln(file)
					// Format date from timestamp (extract date part)
					dateStr := ann.Timestamp
					if len(dateStr) >= 10 {
						dateStr = dateStr[:10] // YYYY-MM-DD
					}
					fmt.Fprintf(file, "> **@%s** (%s):\n", ann.Author, dateStr)
					for _, textLine := range strings.Split(ann.Text, "\n") {
						fmt.Fprintf(file, "> %s\n", textLine)
					}
					fmt.Fprintln(file)
				}
			}
		}
	} else {
		// No source lines - write annotations with explicit line markers
		// Sort annotations by line for consistent output
		sortedLines := make([]int, 0, len(annotationMap))
		for line := range annotationMap {
			sortedLines = append(sortedLines, line)
		}
		sort.Ints(sortedLines)

		for _, lineNum := range sortedLines {
			// Write line marker
			fmt.Fprintf(file, "## Line %d\n", lineNum)

			for _, ann := range annotationMap[lineNum] {
				fmt.Fprintln(file)
				dateStr := ann.Timestamp
				if len(dateStr) >= 10 {
					dateStr = dateStr[:10]
				}
				fmt.Fprintf(file, "> **@%s** (%s):\n", ann.Author, dateStr)
				for _, textLine := range strings.Split(ann.Text, "\n") {
					fmt.Fprintf(file, "> %s\n", textLine)
				}
				fmt.Fprintln(file)
			}
		}
	}

	return nil
}

// ReadAnnotationsV2 reads annotations from a v2 format file
func ReadAnnotationsV2(storagePath, project, filePath string) ([]Annotation, error) {
	filename := encodeFilename(project, filePath)
	fullPath := filepath.Join(storagePath, filename)

	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		return []Annotation{}, nil
	}

	_, annotations, _, err := parseV2File(fullPath)
	return annotations, err
}

// SaveAnnotationV2 saves an annotation in v2 format
// If sourceContent is provided and file doesn't exist, creates new v2 file
// If file exists, adds/updates annotation in place
func SaveAnnotationV2(storagePath, project, filePath string, line int, author, text string, sourceContent, sourceHash string) error {
	if err := os.MkdirAll(storagePath, 0755); err != nil {
		return fmt.Errorf("failed to create storage directory: %w", err)
	}

	filename := encodeFilename(project, filePath)
	fullPath := filepath.Join(storagePath, filename)

	timestamp := time.Now().UTC().Format(time.RFC3339)
	newAnn := Annotation{
		Line:      line,
		Author:    author,
		Timestamp: timestamp,
		Text:      text,
	}

	// Check if file exists
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		// Create new v2 file
		var sourceLines []string
		if sourceContent != "" {
			if sourceHash == "" {
				sourceHash = computeSourceHash(sourceContent)
			}
			sourceLines = strings.Split(sourceContent, "\n")
			// Remove trailing empty line if present
			if len(sourceLines) > 0 && sourceLines[len(sourceLines)-1] == "" {
				sourceLines = sourceLines[:len(sourceLines)-1]
			}
		}
		// If no source content, sourceLines stays empty and hash stays empty
		// Drift detection won't work but annotation is still saved

		header := V2FileHeader{
			Source:   fmt.Sprintf("%s/%s", project, filePath),
			Hash:     sourceHash,
			Captured: timestamp,
		}

		return writeV2File(fullPath, header, sourceLines, []Annotation{newAnn})
	}

	// Read existing file
	header, annotations, sourceLines, err := parseV2File(fullPath)
	if err != nil {
		return err
	}

	// Find and update or append
	found := false
	for i := range annotations {
		if annotations[i].Line == line {
			annotations[i] = newAnn
			found = true
			break
		}
	}
	if !found {
		annotations = append(annotations, newAnn)
	}

	// Sort by line number
	sort.Slice(annotations, func(i, j int) bool {
		return annotations[i].Line < annotations[j].Line
	})

	return writeV2File(fullPath, header, sourceLines, annotations)
}

// DeleteAnnotationV2 removes an annotation from a v2 format file
func DeleteAnnotationV2(storagePath, project, filePath string, line int) error {
	filename := encodeFilename(project, filePath)
	fullPath := filepath.Join(storagePath, filename)

	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		return nil // Nothing to delete
	}

	header, annotations, sourceLines, err := parseV2File(fullPath)
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

	return writeV2File(fullPath, header, sourceLines, filtered)
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
		if err := os.Remove(editPath); err != nil && !os.IsNotExist(err) {
			return err
		}
		return nil
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
	scanner.Buffer(make([]byte, 0, 64*1024), maxScanToken)
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
		annotations, err := ReadAnnotationsV2(storagePath, project, filePath)
		if err != nil {
			continue
		}

		// Add file path to each annotation
		for _, ann := range annotations {
			ann.FilePath = filePath
			results = append(results, ann)
		}
	}

	return results, nil
}

// Wrapper functions for backward compatibility with main.go

// ReadAnnotations wraps ReadAnnotationsV2 for backward compatibility
func ReadAnnotations(storagePath, project, filePath string) ([]Annotation, error) {
	return ReadAnnotationsV2(storagePath, project, filePath)
}

// SaveAnnotation wraps SaveAnnotationV2 for backward compatibility
// The context parameter is ignored in v2 format
func SaveAnnotation(storagePath, project, filePath string, line int, author, text string, context []string) error {
	return SaveAnnotationV2(storagePath, project, filePath, line, author, text, "", "")
}

// DeleteAnnotation wraps DeleteAnnotationV2 for backward compatibility
func DeleteAnnotation(storagePath, project, filePath string, line int) error {
	return DeleteAnnotationV2(storagePath, project, filePath, line)
}
