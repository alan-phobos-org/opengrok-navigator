# Testing Improvements Implementation Plan

## Phase 1: CI Foundation

1. **Create GitHub Actions workflow** (`.github/workflows/ci.yml`)
   - Tier 1: Go lint + unit tests (every PR)
   - Tier 2: Chrome E2E tests (every PR)
   - Tier 3: Integration tests on macOS + Linux (main branch)
   - Tier 4: Full system tests (release tags only)

2. **Update `build.sh check`**
   - Add `test-chrome` to check command
   - Add `test-system` for full integration tests
   - Add `test-coverage` for coverage reports

## Phase 2: Hermetic Fixtures

3. **Record HAR fixtures** (`chrome-extension/tests/fixtures/`)
   - Capture xref pages, search results, raw source from illumos.org
   - Use `page.routeFromHAR()` in Playwright tests
   - Keep one optional live smoke test (env-var controlled)

4. **Multi-project fixtures**
   - Add sample pages from different OpenGrok projects
   - Test project-mapping logic variations

## Phase 3: Native Host Integration

5. **Test fixture setup** (`chrome-extension/tests/setup-native-host.ts`)
   - Build og_annotate binary to temp dir
   - Generate native-messaging manifest for tests
   - Add cleanup in globalTeardown

6. **Negative path tests** (add to `annotations_test.go`)
   - Missing/invalid storagePath
   - Permission denied scenarios
   - Concurrent save handling
   - `.editing.md` lifecycle

## Phase 4: VS Code Extension Tests

7. **Add test infrastructure** (`vscode-extension/src/test/`)
   - Install `@vscode/test-electron`, `mocha`
   - Create `runTest.ts` and test suite structure

8. **Core tests**
   - URL construction (path escaping, useTopLevelFolder)
   - Search parsing (REST API JSON + legacy HTML)
   - Auth header handling

## Phase 5: Contract & Security

9. **JSON schema contracts** (`og_annotate/schema/`)
   - Define request/response schemas
   - Validate in both Go and TypeScript tests

10. **Security tests**
    - Path traversal blocking
    - XSS escaping in annotation display
    - Input validation (size limits, null bytes)

## Implementation Status

| Task | Status | Files |
|------|--------|-------|
| GitHub Actions CI | Done | `.github/workflows/ci.yml` |
| Hermetic fixtures | Done | `chrome-extension/tests/fixtures/` |
| `build.sh` update | Done | `build.sh` |
| VS Code test infra | Done | `vscode-extension/src/test/` |
| Contract schemas | Done | `og_annotate/schema/` |
| Security tests | Done | `og_annotate/annotations_test.go` |

## Out of Scope

- Windows CI (manual only)
- Performance benchmarks
- Accessibility testing
