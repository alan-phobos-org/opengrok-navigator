# Annotation Storage v2 - Full File Copy Design

## Overview

Redesign annotation storage to embed annotations inline within a complete copy of the source file, rather than storing annotations separately with context snippets.

## Motivation

The current v1 format stores annotations as separate entries with 3-line context windows. This has limitations:
- Context can become stale if source changes
- No visibility into surrounding code structure
- Difficult to understand annotation placement without the original file
- Multiple context windows may overlap or fragment understanding

The v2 format addresses these by storing the **complete source file** with annotations inline, making the annotation file a self-contained, human-readable document.

## Format Specification

### File Structure

```markdown
---
source: myproject/src/services/DataProcessor.java
hash: a1b2c3d4e5f6
captured: 2024-01-15T10:30:00Z
---

   1| package com.example.services;
   2|
   3| import java.util.*;
   4| import org.slf4j.Logger;
   5|
   6| public class DataProcessor {
   7|     private Logger logger = LoggerFactory.getLogger(this.getClass());
   8|
   9|     public void processData(DataStream input) {

> **@alan** (2024-01-15):
> This function needs refactoring - it's doing too much.
> Consider splitting into validate() and transform().

  10|         if (input == null) {
  11|             throw new IllegalArgumentException("Input cannot be null");
  12|         }
  13|
  14|         List<Record> records = input.readAll();
  15|         for (Record r : records) {
  16|             validate(r);
  17|             transform(r);
  18|         }
  19|
  20|         Result result = new Result();
  21|         result.setTimestamp(now);
  22|         result.setStatus(Status.COMPLETE);
  23|         return result.build();

> **@bob** (2024-01-14):
> Potential NPE here if result is null.

  24|     }
  25| }
```

### Header (YAML Frontmatter)

Every annotation file begins with YAML frontmatter between `---` delimiters:

| Field | Description |
|-------|-------------|
| `source` | Original OpenGrok path (project/file path) |
| `hash` | SHA-256 prefix (12 chars) of source content at capture time |
| `captured` | ISO 8601 timestamp when source was copied |

### Line Numbering

Source lines use right-aligned numbers with `|` separator:
- Width adapts to file size (e.g., 3 digits for files up to 999 lines)
- Format: `{spaces}{lineNum}| {content}`

### Annotation Format (Blockquote)

Annotations use markdown blockquotes inserted after the annotated line:

```markdown
> **@{author}** ({date}):
> {annotation text line 1}
> {annotation text line 2}
> ...
```

- **Author**: Prefixed with `@` for visibility
- **Date**: ISO 8601 date (YYYY-MM-DD)
- **Text**: Multi-line supported, each line starts with `> `
- **Blank line** before and after the blockquote for readability

### Parsing Rules

1. Lines matching `^\s*\d+\|` are source lines - extract line number and content
2. Lines starting with `> ` are annotation content
3. First annotation line matching `> \*\*@(\S+)\*\* \(([^)]+)\):` is the header
4. Subsequent `> ` lines until a non-blockquote line are the annotation body

## Triggering File Copy

When the first annotation is added to a file:

1. Chrome extension fetches complete source from OpenGrok: `GET {baseUrl}/raw/{project}/{path}`
2. Compute SHA-256 hash (first 12 chars)
3. Pass source content to native host with save request
4. Native host creates file with frontmatter + numbered source + annotation

Subsequent annotations modify the existing file in place (insert new blockquote after target line).

## Implementation

### Chrome Extension Changes

**New fields in save request:**
```javascript
{
  action: 'annotation:save',
  storagePath: '/path/to/annotations',
  project: 'myproject',
  filePath: 'src/file.java',
  line: 42,
  author: 'alan',
  text: 'Annotation text...',
  sourceContent: '...',  // Full source (only for first annotation)
  sourceHash: 'a1b2c3d4e5f6'  // Hash (only for first annotation)
}
```

**Source fetching:**
```javascript
async function fetchSource(project, filePath) {
  const baseUrl = await getOpenGrokBaseUrl();
  const response = await fetch(`${baseUrl}/raw/${project}/${filePath}`);
  if (!response.ok) throw new Error('Failed to fetch source');
  return response.text();
}
```

### Native Host Changes

**New Request fields:**
```go
type Request struct {
    // ... existing fields ...
    SourceContent string `json:"sourceContent,omitempty"`
    SourceHash    string `json:"sourceHash,omitempty"`
}
```

**File format v2 detection:**
- Check for `---` on first line (YAML frontmatter)
- v1 files start with `# project/path`

### Parsing Annotations (Go)

```go
var frontmatterRe = regexp.MustCompile(`^---$`)
var sourceLineRe = regexp.MustCompile(`^\s*(\d+)\|`)
var annotationHeaderRe = regexp.MustCompile(`^> \*\*@(\S+)\*\* \(([^)]+)\):$`)

func parseV2File(content string) (header FileHeader, annotations []Annotation, sourceLines []string) {
    // Parse frontmatter between first two ---
    // Parse source lines (matching sourceLineRe)
    // Parse annotations (> lines after source lines)
}
```

### Writing Annotations

```go
func writeV2File(path string, header FileHeader, sourceLines []string, annotations []Annotation) {
    // Write frontmatter
    // For each source line:
    //   Write numbered line
    //   If annotation exists for this line, write blockquote after it
}
```

## Migration Path

1. **Detection**: Check first line for `---` (v2) vs `# ` (v1)
2. **Read v1**: Keep existing parser for reading legacy files
3. **Write v2**: All new writes use v2 format
4. **Migration**: On first edit of v1 file, convert to v2 (requires source fetch)

## Format Benefits

- **Standard markdown**: Renders beautifully in GitHub, VS Code, any markdown viewer
- **Human-readable**: Clear visual separation between code and annotations
- **Self-contained**: Full source context preserved
- **Minimal syntax**: Just blockquotes, no custom markers
- **Diff-friendly**: Git diffs show annotation changes clearly

## Open Questions

1. **Stale detection**: Compare stored hash with current source hash
2. **Large files**: Consider size limit (e.g., 100KB) or lazy loading
3. **Binary files**: Skip annotation support entirely
