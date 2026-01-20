# OpenGrok Navigator - Architecture & Design

## System Overview

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                      User Workstation                    │
┌───────────────┐   │  ┌─────────────┐    ┌──────────────┐    ┌────────────┐  │
│   OpenGrok    │◄──┼──│   Chrome    │◄──►│  og_annotate │◄──►│ Annotation │  │
│    Server     │   │  │  Extension  │    │ (Native Host)│    │   Files    │  │
└───────┬───────┘   │  └──────┬──────┘    └──────────────┘    └────────────┘  │
        │           │         │ vscode://                                      │
        │ REST API  │         ▼                                                │
        │           │  ┌─────────────┐                                         │
        └───────────┼─►│   VS Code   │◄──── User's Local Workspace             │
                    │  │  Extension  │                                         │
                    │  └─────────────┘                                         │
                    │         ▲                                                │
                    │         │                                                │
                    │  ┌─────────────┐                                         │
                    │  │   og CLI    │ Command-line interface                  │
                    │  └─────────────┘                                         │
                    └─────────────────────────────────────────────────────────┘
```

## Components

### VS Code Extension

**Purpose**: Navigate from local code to OpenGrok, search OpenGrok from VS Code.

**Key Features**:
- Open current file/line in OpenGrok (`Ctrl+Shift+G O`)
- Copy OpenGrok URLs with line anchors
- Search OpenGrok with results displayed in sidebar TreeView
- HTTP Basic Auth with secure password storage

**Implementation**: TypeScript, uses VS Code Extension API.

**Design Docs**: [DESIGN_OPENGROK_TO_VSCODE.md](DESIGN_OPENGROK_TO_VSCODE.md) (section on VS Code side)

### Chrome Extension

**Purpose**: Navigate from OpenGrok to VS Code, enhance browsing experience.

**Key Features**:
- Ctrl+Click line numbers to open in VS Code
- Quick File Finder (`T` key) with server-side search
- Live Sync mode (VS Code follows browser navigation)
- Dark mode with FOUC prevention
- Inline source code annotations

**Implementation**: JavaScript content/background scripts, uses `vscode://` protocol handler.

**Design Docs**:
- [DESIGN_OPENGROK_TO_VSCODE.md](DESIGN_OPENGROK_TO_VSCODE.md) - Core navigation architecture
- [QUICK_FILE_FINDER_DESIGN.md](QUICK_FILE_FINDER_DESIGN.md) - File finder implementation
- [DARK_MODE_REDESIGN.md](DARK_MODE_REDESIGN.md) - FOUC-free dark mode

### og CLI Tool

**Purpose**: Command-line OpenGrok search client for terminal-based workflows.

**Key Features**:
- Full-text, definition, symbol, path, history search
- Call graph tracing (`og trace`)
- Clickable web links output
- Configuration persistence

**Implementation**: Go, HTTP client for REST API.

### og_annotate Native Host

**Purpose**: Bridge Chrome extension to local filesystem for annotation storage.

**Key Features**:
- Native messaging protocol (Chrome ↔ binary)
- Read/write markdown annotation files
- Network drive support (Windows UNC paths, Unix mounts)
- Edit tracking for multi-user awareness

**Implementation**: Go, uses Chrome Native Messaging protocol.

**Design Docs**:
- [annotation-feature-design.md](annotation-feature-design.md) - Complete annotation system design
- [annotation-storage-v2-design.md](annotation-storage-v2-design.md) - JSON protocol schema

## Key Design Decisions

### URI Handler vs HTTP Server

**Decision**: Use `vscode://` protocol handler instead of custom HTTP server.

**Rationale**:
- Works when VS Code isn't running (OS launches it)
- No port conflicts or server complexity
- Zero maintenance on VS Code side

### Server-Side File Search

**Decision**: Use OpenGrok REST API for Quick File Finder instead of client-side filtering.

**Rationale**:
- Works with repositories of any size
- No need to pre-load file lists
- Consistent with OpenGrok's native search

### Native Messaging for Annotations

**Decision**: Use Go native messaging host instead of local HTTP server.

**Rationale**:
- Chrome provides secure bridge to native code
- Cross-platform binary distribution
- No port configuration needed

### Markdown Annotation Format

**Decision**: Store annotations as human-readable markdown files.

**Rationale**:
- Version-controllable
- Readable without tools
- Network drive friendly
- Easy to grep/search

## URL Formats

**OpenGrok URL**: `{baseUrl}/xref/{project}/{path}#{line}`

**VS Code URI**: `vscode://file/{absolutePath}:{line}:{column}`

**Annotation File**: `{project}__{path}__to__file.ext.md` (double-underscore as separator)

## Future Architecture Considerations

### Symbol Navigation Panel

Would require:
- Language-aware parsing (regex or tree-sitter)
- Caching parsed symbols per file
- Integration with VS Code outline sync

### Diff Comparison View

Would require:
- Fetch multiple file versions via OpenGrok API
- Client-side diff rendering (diff-match-patch library)
- Modal overlay with syntax highlighting

## Related Documentation

- [PLAN.md](PLAN.md) - Project roadmap and backlog
- [BUILD.md](BUILD.md) - Build and development instructions
- [QUICKSTART.md](QUICKSTART.md) - Quick setup guide
- [FEATURE_SUGGESTIONS.md](FEATURE_SUGGESTIONS.md) - Future feature proposals
- [FAVOURITE_PROJECTS_DESIGN.md](FAVOURITE_PROJECTS_DESIGN.md) - Favourite projects search feature
