# OpenGrok Navigator - Agent Instructions

Bidirectional VS Code ↔ OpenGrok integration via extensions and CLI tool.

## Vision

An assistant for busy researchers navigating large codebases. Bridge web-based code browsing and local development by linking existing tools (OpenGrok, VS Code, CLI) into a seamless workflow. Capture and share institutional knowledge through lightweight annotations. Everything must be fast enough to use reflexively and reliable enough to trust without checking. Never get in the way of someone finding answers quickly.

**Current Version:** v1.5.0

## Documentation

| Document | Purpose | Read When |
|----------|---------|-----------|
| [AGENTS.md](AGENTS.md) | Development workflow, quick reference | Always |
| [docs/REFERENCE.md](docs/REFERENCE.md) | Native messaging, architecture details | Debugging integration |
| [docs/DESIGN.md](docs/DESIGN.md) | High-level architecture | Major refactoring |
| [docs/PLAN.md](docs/PLAN.md) | Roadmap, backlog | Planning work |
| [docs/BUILD.md](docs/BUILD.md) | Build instructions | Build issues |
| [CHANGELOG.md](CHANGELOG.md) | Release notes | Preparing releases |

## Quick Reference

### Build Commands

| Command | Purpose |
|---------|---------|
| `./build.sh check` | **Pre-commit** (lint + test + build) |
| `./build.sh build` | Build all components |
| `./build.sh test` | Run all Go tests |
| `./build.sh test-chrome` | Chrome E2E tests |
| `./build.sh deploy-local` | Build and install locally |

### Components

| Component | Directory | Purpose |
|-----------|-----------|---------|
| VS Code Extension | `vscode-extension/` | Open/search in OpenGrok |
| Chrome Extension | `chrome-extension/` | Click to VS Code, annotations |
| og CLI | `og/` | Command-line search |
| og_annotate | `og_annotate/` | Native host for annotations |

## Workflows

| Trigger | Action |
|---------|--------|
| Before any commit | `./build.sh check` |
| "what's next", "status" | `./build.sh status` → read `docs/PLAN.md` → summarize (10-15 lines) |
| "prepare release" | `./build.sh prepare-release` → update CHANGELOG.md → `./build.sh release X.Y.Z` → push |
| "deploy locally" | `./build.sh deploy-local` |
| "fast deploy" | `./build.sh deploy-local --skip-tests` |

---

## CRITICAL: Git Commit Messages

**NEVER include any AI/agent identifiers in commit messages.** This applies to ALL commits, especially releases.

Forbidden in commit messages:
- "Claude", "Anthropic", "AI", "LLM", "Codex", "GPT", "OpenAI", "Gemini", "Copilot"
- "generated", "automated", "assisted by", "with help from"
- Co-Authored-By headers mentioning AI
- "Generated with [tool name]" footers
- Any emoji

Write commit messages as a human developer would:
- Focus on WHAT changed and WHY
- Use conventional commit format (feat:, fix:, refactor:, etc.)
- Keep messages concise and professional

**This rule is absolute and applies to every commit including releases and version bumps.**

## Key Files

| Component | Key Files |
|-----------|-----------|
| VS Code | `vscode-extension/src/extension.ts`, `package.json` |
| Chrome | `chrome-extension/content.js`, `background.js`, `annotations.js` |
| og CLI | `og/main.go`, `client.go`, `trace.go` |
| og_annotate | `og_annotate/main.go`, `annotations.go` |

---

## Testing [READ IF: implementing features, fixing bugs]

### Test Commands

| Command | Purpose | Speed |
|---------|---------|-------|
| `./build.sh test` | Go tests | <5s |
| `./build.sh test-chrome` | Chrome E2E tests | ~30s |
| `./build.sh test-all` | All tests | ~35s |

### Chrome E2E Tests (`chrome-extension/tests/e2e/`)

| Test File | Coverage |
|-----------|----------|
| `ui-injection.spec.ts` | Toolbar, buttons, file finder |
| `navigation.spec.ts` | Ctrl+click, keyboard shortcuts |
| `annotations.spec.ts` | Toggle, create, delete |

### Test Dependencies

| File Changed | Update Tests |
|--------------|--------------|
| `content.js` | `ui-injection.spec.ts`, `navigation.spec.ts` |
| `annotations.js` | `annotations.spec.ts` |
| `content.css` | `ui-injection.spec.ts` (if class names change) |
| `manifest.json` | All tests (if content script patterns change) |

### Running Chrome Tests

```bash
cd chrome-extension
npm install                    # First time
npx playwright install chromium # First time
npm test                       # Always use headless mode
```

---

## Native Messaging [READ IF: debugging annotation integration]

**CRITICAL**: Name matching must be exact across:
- `background.js` constant: `NATIVE_HOST = 'og_annotate'`
- `manifest.json` permission: `"nativeMessaging"`
- Installer manifest: `"name": "og_annotate"`

See [docs/REFERENCE.md](docs/REFERENCE.md) for full details.

---

## Release Process [READ IF: user explicitly requests release]

```bash
# 1. Run all checks
./build.sh prepare-release

# 2. Update CHANGELOG.md (add: ## [X.Y.Z] - YYYY-MM-DD)

# 3. Review docs for completed TODOs

# 4. Create release
./build.sh release X.Y.Z

# 5. Push
git push origin main vX.Y.Z
```

---

## Installation [READ IF: debugging install issues]

**Unified Installers** (in dist archive and repo root):
- `install.sh` - macOS/Linux
- `install.ps1` - Windows PowerShell
- `install.bat` - Windows double-click wrapper

**What they install**:
1. VS Code extension via `code --install-extension`
2. Chrome extension to `~/.opengrok-navigator/chrome-extension/`
3. og_annotate native host with auto-detected extension ID

---

## Hints

- Report progress and changes concisely (no line numbers or precise files)
- All design docs go in the `docs` folder
