# OpenGrok Navigator - Project Plan

## Vision

Seamless bidirectional navigation between OpenGrok and VS Code, enabling developers to browse code in the web interface and instantly jump to their local editor, with rich annotation support for collaborative code review.

## Current Stage: v1.5.0 (Production Ready)

The project has reached production stability with all core features implemented:

- **VS Code Extension**: Full search integration, URL generation, multi-project support
- **Chrome Extension**: Ctrl+Click navigation, Quick File Finder, Dark Mode, Live Sync
- **og CLI Tool**: Command-line search with call graph tracing
- **Annotations**: Inline source code annotations via native messaging host
- **Build System**: Unified cross-platform build and install scripts
- **Testing**: E2E tests for Chrome extension, Go unit tests

## Completed Milestones

| Version | Features |
|---------|----------|
| v1.0.0 | Build system, Quick File Finder (server-side search) |
| v1.1.0 | Code quality improvements, EditorConfig, ESLint |
| v1.2.0 | Dark mode FOUC fix, search result click-through |
| v1.3.0 | og CLI tool with trace command |
| v1.4.0 | Inline annotations feature |
| v1.5.0 | CI/CD, unified installers, annotation storage v2 |

## Backlog

### High Priority

None currently - the project is feature-complete for its core use cases.

### Future Enhancements

From [FEATURE_SUGGESTIONS.md](FEATURE_SUGGESTIONS.md):

1. **Symbol Navigation Panel** (Medium-High Value)
   - Collapsible side panel showing functions, classes, symbols
   - Language-aware parsing
   - Click to jump + VS Code sync

2. **Breadcrumb Navigation with History** (Medium Value)
   - Sticky navigation bar with back/forward
   - Recent files dropdown
   - Copy path functionality

3. **Code Snippet Clipboard Manager** (Lower Priority)
   - Capture code snippets with metadata
   - Persistent clipboard history
   - "Copy with citation" feature

4. **Diff Comparison View** (Advanced)
   - Compare file revisions side-by-side
   - Inline or unified diff display
   - Open in VS Code split view

### Annotation Enhancements (Deferred)

- "Start Here" view for onboarding
- Tagging/categorization (`#security`, `#technical-debt`)
- Full-text annotation search
- Offline mode with local caching

## Non-Goals

- Replacing OpenGrok's native functionality
- Supporting non-Chromium browsers (Firefox extension would be separate project)
- Real-time collaborative editing (last-write-wins is acceptable for annotations)

## Related Documentation

- [DESIGN.md](DESIGN.md) - Architecture and component design
- [FEATURE_SUGGESTIONS.md](FEATURE_SUGGESTIONS.md) - Detailed feature proposals
- [BUILD.md](BUILD.md) - Build instructions
