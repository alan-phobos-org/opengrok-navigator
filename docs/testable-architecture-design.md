# Testable Architecture Design for OpenGrok Navigator

## Executive Summary

This document proposes a redesigned architecture for OpenGrok Navigator that prioritizes automated testing, particularly system/integration testing for the VS Code and Chrome extensions which currently have no automated tests.

## Current Architecture Analysis

### Component Structure
```
┌─────────────────────────────────────────────────────────────────────┐
│                        OpenGrok Navigator                           │
├─────────────────────┬─────────────────────┬─────────────────────────┤
│   VS Code Extension │  Chrome Extension   │      og CLI Tool        │
│   (TypeScript)      │  (JavaScript)       │      (Go)               │
├─────────────────────┼─────────────────────┼─────────────────────────┤
│ • URL building      │ • URL parsing       │ • Search API client     │
│ • REST API client   │ • VS Code protocol  │ • Call graph tracing    │
│ • HTML fallback     │ • UI enhancements   │ • Config management     │
│ • TreeView UI       │ • File finder       │ • Output formatting     │
└─────────────────────┴─────────────────────┴─────────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │  OpenGrok Server    │
                    │  (REST API v1)      │
                    └─────────────────────┘
```

### Current Testing State

| Component | Unit Tests | Integration Tests | System Tests |
|-----------|------------|-------------------|--------------|
| og CLI | ✅ Good (4 files) | ✅ External server | ❌ None |
| VS Code | ❌ None | ❌ None | ❌ Manual only |
| Chrome | ❌ None | ❌ None | ❌ Manual only |

### Key Problems

1. **Tightly Coupled to Runtime**: Extensions directly call browser/VS Code APIs
2. **No Mocking Layer**: HTTP calls embedded in business logic
3. **Hard-coded Dependencies**: Storage, settings, and UI intertwined
4. **No Protocol Contracts**: No formal interface definitions between components

---

## Proposed Architecture

### Design Principles

1. **Hexagonal Architecture**: Core logic isolated from I/O adapters
2. **Dependency Injection**: All external services injected, not instantiated
3. **Protocol-First**: Shared contracts define component interactions
4. **Mock-First Testing**: Every adapter has a mock implementation
5. **Layered Testing**: Unit → Integration → System → E2E

### New Component Structure

```
┌───────────────────────────────────────────────────────────────────────────┐
│                          Shared Core Library                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐   │
│  │ URL Contracts   │  │ Search Types    │  │ Config Contracts        │   │
│  │ • OpenGrokURL   │  │ • SearchResult  │  │ • ProjectMapping        │   │
│  │ • VSCodeURI     │  │ • SearchOpts    │  │ • Settings              │   │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
│  VS Code Ext      │   │  Chrome Extension │   │  og CLI           │
├───────────────────┤   ├───────────────────┤   ├───────────────────┤
│ ┌───────────────┐ │   │ ┌───────────────┐ │   │ ┌───────────────┐ │
│ │   Core Logic  │ │   │ │   Core Logic  │ │   │ │   Core Logic  │ │
│ │ (Pure TS)     │ │   │ │ (Pure JS)     │ │   │ │ (Pure Go)     │ │
│ └───────┬───────┘ │   │ └───────┬───────┘ │   │ └───────┬───────┘ │
│         │         │   │         │         │   │         │         │
│ ┌───────▼───────┐ │   │ ┌───────▼───────┐ │   │ ┌───────▼───────┐ │
│ │   Adapters    │ │   │ │   Adapters    │ │   │ │   Adapters    │ │
│ │ • VSCodeAPI   │ │   │ │ • ChromeAPI   │ │   │ │ • HTTP Client │ │
│ │ • HTTPClient  │ │   │ │ • DOM         │ │   │ │ • FileSystem  │ │
│ │ • SecretStore │ │   │ │ • Storage     │ │   │ │ • Stdout      │ │
│ └───────────────┘ │   │ └───────────────┘ │   │ └───────────────┘ │
└───────────────────┘   └───────────────────┘   └───────────────────┘
```

---

## Detailed Component Design

### 1. Shared Contracts Package (`@opengrok-nav/contracts`)

TypeScript/JavaScript types shared across components:

```typescript
// contracts/url.ts
export interface OpenGrokURL {
  baseUrl: string;
  project: string;
  filePath: string;
  lineNumber: number;
}

export interface VSCodeURI {
  scheme: 'vscode' | 'vscode-insiders';
  authority: 'file';
  path: string;
  line: number;
  column: number;
}

// contracts/search.ts
export interface SearchResult {
  filePath: string;
  lineNumber: number;
  lineContent: string;
  context?: string;
}

export interface SearchOptions {
  full?: string;
  def?: string;
  symbol?: string;
  path?: string;
  projects?: string[];
  maxResults?: number;
}

export interface SearchResponse {
  results: Map<string, SearchResult[]>;
  totalCount: number;
  elapsedMs: number;
}

// contracts/config.ts
export interface ProjectMapping {
  project: string;
  localPath: string;
}

export interface ExtensionSettings {
  baseUrl: string;
  projectMappings: ProjectMapping[];
  defaultWorkspaceRoot?: string;
  authEnabled: boolean;
}
```

### 2. Adapter Interfaces

Each external dependency gets an interface:

```typescript
// adapters/http.ts
export interface HttpClient {
  get(url: string, options?: RequestOptions): Promise<HttpResponse>;
  post(url: string, body: unknown, options?: RequestOptions): Promise<HttpResponse>;
}

// adapters/storage.ts
export interface StorageAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

// adapters/secrets.ts
export interface SecretStorage {
  getPassword(key: string): Promise<string | undefined>;
  setPassword(key: string, value: string): Promise<void>;
  deletePassword(key: string): Promise<void>;
}

// adapters/browser.ts
export interface BrowserAdapter {
  openUrl(url: string): Promise<void>;
  copyToClipboard(text: string): Promise<void>;
}

// adapters/editor.ts (VS Code specific)
export interface EditorAdapter {
  getActiveFile(): FileContext | undefined;
  openFile(path: string, line?: number, column?: number): Promise<void>;
  showError(message: string): void;
  showInfo(message: string): void;
  getConfiguration<T>(section: string): T;
}

// adapters/dom.ts (Chrome specific)
export interface DOMAdapter {
  querySelector(selector: string): Element | null;
  querySelectorAll(selector: string): Element[];
  createElement(tag: string): Element;
  addEventListener(type: string, handler: EventHandler): void;
  getCurrentUrl(): string;
}
```

### 3. Core Logic Modules (Pure Functions)

```typescript
// core/url-builder.ts
export function buildOpenGrokUrl(params: {
  baseUrl: string;
  project: string;
  filePath: string;
  lineNumber: number;
}): string {
  const cleanPath = params.filePath.replace(/\\/g, '/');
  return `${params.baseUrl}/xref/${params.project}/${cleanPath}#${params.lineNumber}`;
}

export function parseOpenGrokUrl(url: string): OpenGrokURL | null {
  const match = url.match(/\/xref\/([^/]+)\/(.+?)(?:#(\d+))?$/);
  if (!match) return null;
  return {
    baseUrl: url.substring(0, url.indexOf('/xref')),
    project: match[1],
    filePath: match[2],
    lineNumber: parseInt(match[3] || '1', 10)
  };
}

export function buildVSCodeUri(params: {
  localPath: string;
  lineNumber: number;
  column?: number;
}): string {
  return `vscode://file/${params.localPath}:${params.lineNumber}:${params.column || 1}`;
}

// core/search-parser.ts
export function parseSearchResponse(
  json: unknown,
  baseUrl: string,
  project: string
): SearchResponse {
  // Pure parsing logic, no I/O
}

export function parseHtmlFallback(
  html: string,
  baseUrl: string,
  project: string
): SearchResponse {
  // Pure HTML parsing, no I/O
}

// core/path-mapper.ts
export function mapOpenGrokPathToLocal(
  opengrokPath: string,
  projectMappings: ProjectMapping[],
  defaultRoot?: string
): string | null {
  // Pure path mapping logic
}
```

### 4. Service Layer (Orchestration)

```typescript
// services/search-service.ts
export class SearchService {
  constructor(
    private http: HttpClient,
    private config: ExtensionSettings
  ) {}

  async search(options: SearchOptions): Promise<SearchResponse> {
    const url = this.buildSearchUrl(options);
    const response = await this.http.get(url, this.getAuthHeaders());

    if (response.contentType.includes('json')) {
      return parseSearchResponse(response.body, this.config.baseUrl, options.projects?.[0] || '');
    }
    return parseHtmlFallback(response.body, this.config.baseUrl, options.projects?.[0] || '');
  }
}

// services/navigation-service.ts
export class NavigationService {
  constructor(
    private browser: BrowserAdapter,
    private editor: EditorAdapter,
    private config: ExtensionSettings
  ) {}

  async openInOpenGrok(): Promise<void> {
    const file = this.editor.getActiveFile();
    if (!file) {
      this.editor.showError('No active file');
      return;
    }

    const url = buildOpenGrokUrl({
      baseUrl: this.config.baseUrl,
      project: this.resolveProject(file),
      filePath: file.relativePath,
      lineNumber: file.lineNumber
    });

    await this.browser.openUrl(url);
  }
}
```

---

## Testing Strategy

### Level 1: Unit Tests (Pure Functions)

Test core logic without any mocks:

```typescript
// tests/unit/url-builder.test.ts
describe('buildOpenGrokUrl', () => {
  it('builds correct URL with line number', () => {
    const result = buildOpenGrokUrl({
      baseUrl: 'http://localhost:8080/source',
      project: 'myproject',
      filePath: 'src/main.ts',
      lineNumber: 42
    });
    expect(result).toBe('http://localhost:8080/source/xref/myproject/src/main.ts#42');
  });

  it('normalizes Windows paths', () => {
    const result = buildOpenGrokUrl({
      baseUrl: 'http://localhost:8080/source',
      project: 'myproject',
      filePath: 'src\\main.ts',
      lineNumber: 1
    });
    expect(result).toBe('http://localhost:8080/source/xref/myproject/src/main.ts#1');
  });
});

describe('parseOpenGrokUrl', () => {
  it('extracts project and path', () => {
    const result = parseOpenGrokUrl('http://localhost:8080/source/xref/kernel/src/main.c#123');
    expect(result).toEqual({
      baseUrl: 'http://localhost:8080/source',
      project: 'kernel',
      filePath: 'src/main.c',
      lineNumber: 123
    });
  });

  it('returns null for invalid URLs', () => {
    expect(parseOpenGrokUrl('http://example.com/foo')).toBeNull();
  });
});
```

### Level 2: Integration Tests (With Mocks)

Test services with mock adapters:

```typescript
// tests/integration/search-service.test.ts
describe('SearchService', () => {
  let mockHttp: MockHttpClient;
  let service: SearchService;

  beforeEach(() => {
    mockHttp = new MockHttpClient();
    service = new SearchService(mockHttp, {
      baseUrl: 'http://test/source',
      projectMappings: [],
      authEnabled: false
    });
  });

  it('parses JSON response correctly', async () => {
    mockHttp.respondWith({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        time: 100,
        resultCount: 2,
        results: {
          '/project/src/file.c': [
            { line: 'test code', lineNumber: 42, path: '/project/src/file.c' }
          ]
        }
      })
    });

    const result = await service.search({ full: 'test' });

    expect(result.totalCount).toBe(2);
    expect(result.results.get('/project/src/file.c')).toHaveLength(1);
  });

  it('falls back to HTML parsing on 404', async () => {
    mockHttp.respondWith({ status: 404 }, { forUrl: /api\/v1/ });
    mockHttp.respondWith({
      status: 200,
      contentType: 'text/html',
      body: '<a href="/xref/project/file.c#10"><span class="l">10</span> code</a>'
    }, { forUrl: /\/search\?/ });

    const result = await service.search({ full: 'test' });

    expect(mockHttp.requestCount).toBe(2);
    expect(result.results.size).toBeGreaterThan(0);
  });
});
```

### Level 3: System Tests (Mock Server)

Test entire extension with a mock OpenGrok server:

```typescript
// tests/system/vscode-extension.test.ts
describe('VS Code Extension System Tests', () => {
  let mockServer: MockOpenGrokServer;
  let extension: TestableExtension;

  beforeAll(async () => {
    mockServer = await MockOpenGrokServer.start(3333);
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  beforeEach(() => {
    extension = new TestableExtension({
      baseUrl: 'http://localhost:3333/source',
      projectMappings: [{ project: 'test', localPath: '/tmp/test' }]
    });
  });

  it('opens file in OpenGrok with correct URL', async () => {
    const openedUrls: string[] = [];
    extension.setBrowserAdapter({
      openUrl: async (url) => { openedUrls.push(url); }
    });

    await extension.commands.openInOpenGrok({
      filePath: '/tmp/test/src/main.ts',
      lineNumber: 42
    });

    expect(openedUrls).toEqual([
      'http://localhost:3333/source/xref/test/src/main.ts#42'
    ]);
  });

  it('displays search results in tree view', async () => {
    mockServer.setSearchResults({
      '/test/src/main.ts': [
        { line: 'function test()', lineNumber: 10 }
      ]
    });

    await extension.commands.searchInView('test');

    const treeItems = extension.getTreeViewItems();
    expect(treeItems).toHaveLength(1);
    expect(treeItems[0].label).toContain('main.ts');
  });
});
```

### Level 4: E2E Tests (Browser Automation)

Test Chrome extension with Puppeteer/Playwright:

```typescript
// tests/e2e/chrome-extension.test.ts
describe('Chrome Extension E2E', () => {
  let browser: Browser;
  let page: Page;
  let mockServer: MockOpenGrokServer;
  let vscodeProtocolHandler: MockProtocolHandler;

  beforeAll(async () => {
    mockServer = await MockOpenGrokServer.start(4444);
    vscodeProtocolHandler = new MockProtocolHandler('vscode://');

    browser = await chromium.launch({
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        `--register-protocol-handler=vscode,${vscodeProtocolHandler.url}%s`
      ]
    });
  });

  beforeEach(async () => {
    page = await browser.newPage();
    vscodeProtocolHandler.reset();
  });

  it('Ctrl+Click on line number opens VS Code', async () => {
    await page.goto('http://localhost:4444/source/xref/project/src/main.c');

    // Configure extension
    await configureExtension(page, {
      projectMappings: { project: '/local/project' }
    });

    // Ctrl+Click line 42
    const lineLink = await page.$('a.l[href$="#42"]');
    await lineLink.click({ modifiers: ['Control'] });

    // Verify vscode:// was invoked
    await expect(vscodeProtocolHandler.lastUri).toBe(
      'vscode://file//local/project/src/main.c:42:1'
    );
  });

  it('File finder searches and navigates', async () => {
    await page.goto('http://localhost:4444/source/xref/project/');

    mockServer.setPathSearchResults(['src/main.c', 'src/utils.c']);

    // Open file finder
    await page.keyboard.press('t');
    await page.waitForSelector('.vscode-finder-modal');

    // Type search
    await page.type('.vscode-finder-input', 'main');
    await page.waitForSelector('.vscode-finder-result');

    // Select and open
    await page.keyboard.press('Enter');

    expect(page.url()).toContain('/xref/project/src/main.c');
  });
});
```

---

## Mock Server Implementation

A critical component for system testing:

```typescript
// test-infra/mock-opengrok-server.ts
export class MockOpenGrokServer {
  private server: http.Server;
  private searchResults: Map<string, SearchResult[]> = new Map();
  private projects: string[] = ['test-project'];

  static async start(port: number): Promise<MockOpenGrokServer> {
    const server = new MockOpenGrokServer();
    await server.listen(port);
    return server;
  }

  setSearchResults(results: Record<string, SearchResult[]>): void {
    this.searchResults = new Map(Object.entries(results));
  }

  setProjects(projects: string[]): void {
    this.projects = projects;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url!, `http://localhost`);

    if (url.pathname === '/source/api/v1/projects') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.projects));
      return;
    }

    if (url.pathname === '/source/api/v1/search') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        time: 50,
        resultCount: this.searchResults.size,
        results: Object.fromEntries(this.searchResults)
      }));
      return;
    }

    if (url.pathname.startsWith('/source/xref/')) {
      // Serve mock file page
      const filePath = url.pathname.replace('/source/xref/', '');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(this.generateXrefPage(filePath));
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  }

  private generateXrefPage(filePath: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head><title>${filePath} - OpenGrok</title></head>
      <body>
        <pre id="content">
          ${this.generateLineNumbers(100)}
        </pre>
      </body>
      </html>
    `;
  }

  private generateLineNumbers(count: number): string {
    return Array.from({ length: count }, (_, i) =>
      `<a class="l" href="#${i+1}">${i+1}</a><span>  // line ${i+1}</span>`
    ).join('\n');
  }
}
```

---

## CI/CD Test Pipeline

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - uses: actions/setup-go@v4

      - name: Install dependencies
        run: |
          cd shared && npm ci
          cd ../vscode-extension && npm ci
          cd ../chrome-extension && npm ci
          cd ../og && go mod download

      - name: Run unit tests
        run: |
          cd shared && npm test
          cd ../vscode-extension && npm run test:unit
          cd ../chrome-extension && npm run test:unit
          cd ../og && go test -v ./... -short

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4

      - name: Run integration tests
        run: |
          cd vscode-extension && npm run test:integration
          cd ../chrome-extension && npm run test:integration

  system-tests:
    runs-on: ubuntu-latest
    services:
      mock-opengrok:
        image: ghcr.io/${{ github.repository }}/mock-opengrok:latest
        ports:
          - 8080:8080
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4

      - name: Run system tests
        run: |
          cd vscode-extension && npm run test:system
          cd ../chrome-extension && npm run test:system
        env:
          OPENGROK_URL: http://localhost:8080/source

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4

      - name: Install Playwright
        run: npx playwright install chromium

      - name: Build extensions
        run: make build

      - name: Run E2E tests
        run: |
          cd chrome-extension && npm run test:e2e
```

---

## File Structure (Redesigned)

```
opengrok-navigator/
├── shared/                          # Shared contracts and utilities
│   ├── src/
│   │   ├── contracts/
│   │   │   ├── url.ts
│   │   │   ├── search.ts
│   │   │   └── config.ts
│   │   ├── core/
│   │   │   ├── url-builder.ts
│   │   │   ├── url-parser.ts
│   │   │   ├── search-parser.ts
│   │   │   └── path-mapper.ts
│   │   └── index.ts
│   ├── tests/
│   │   └── unit/
│   └── package.json
│
├── vscode-extension/
│   ├── src/
│   │   ├── adapters/
│   │   │   ├── vscode-editor.ts     # VS Code API adapter
│   │   │   ├── vscode-storage.ts    # Settings adapter
│   │   │   ├── vscode-secrets.ts    # SecretStorage adapter
│   │   │   ├── node-http.ts         # HTTP adapter
│   │   │   └── index.ts
│   │   ├── services/
│   │   │   ├── search-service.ts
│   │   │   ├── navigation-service.ts
│   │   │   └── tree-view-service.ts
│   │   ├── extension.ts             # Wiring only
│   │   └── testable-extension.ts    # Test harness
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── system/
│   └── package.json
│
├── chrome-extension/
│   ├── src/
│   │   ├── adapters/
│   │   │   ├── chrome-storage.ts
│   │   │   ├── dom-adapter.ts
│   │   │   └── fetch-http.ts
│   │   ├── services/
│   │   │   ├── navigation-service.ts
│   │   │   ├── ui-enhancer-service.ts
│   │   │   └── file-finder-service.ts
│   │   ├── content.ts               # Wiring only
│   │   └── background.ts
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   ├── system/
│   │   └── e2e/
│   └── package.json
│
├── og/                              # Keep existing structure
│   ├── main.go
│   ├── client.go
│   ├── core/                        # Extract pure functions
│   │   ├── url.go
│   │   └── parser.go
│   └── *_test.go
│
├── test-infra/                      # Shared test infrastructure
│   ├── mock-opengrok-server/
│   │   ├── server.ts
│   │   ├── Dockerfile
│   │   └── fixtures/
│   ├── mock-vscode-protocol/
│   └── test-fixtures/
│
└── Makefile
```

---

## Migration Path

### Phase 1: Extract Pure Functions (1-2 days)
- Extract URL building/parsing to shared module
- Add comprehensive unit tests
- No changes to existing functionality

### Phase 2: Define Adapters (1-2 days)
- Create adapter interfaces
- Implement production adapters wrapping existing APIs
- Verify existing tests still pass

### Phase 3: Build Mock Infrastructure (2-3 days)
- Implement MockOpenGrokServer
- Create mock adapters for each component
- Write integration tests

### Phase 4: Add System Tests (2-3 days)
- Create TestableExtension harnesses
- Write system tests for VS Code extension
- Write system tests for Chrome extension

### Phase 5: E2E Tests (2-3 days)
- Set up Playwright
- Write Chrome extension E2E tests
- Configure CI pipeline

---

## Benefits of New Architecture

1. **Testability**: Every layer can be tested in isolation
2. **Reliability**: Catch regressions before release
3. **Maintainability**: Clear separation of concerns
4. **Velocity**: Confident refactoring with test coverage
5. **Documentation**: Tests serve as living documentation
6. **CI/CD Ready**: Automated quality gates

## Trade-offs

1. **Complexity**: More files and indirection
2. **Initial Investment**: 1-2 weeks to implement
3. **Learning Curve**: Team needs to understand DI pattern
4. **Build Time**: Additional compilation/bundling steps

---

## Appendix: VS Code Extension Testing Framework

VS Code provides `@vscode/test-electron` for running tests:

```typescript
// vscode-extension/tests/runTests.ts
import { runTests } from '@vscode/test-electron';
import * as path from 'path';

async function main() {
  try {
    const extensionPath = path.resolve(__dirname, '../../');
    const testPath = path.resolve(__dirname, './suite/index');

    await runTests({
      extensionDevelopmentPath: extensionPath,
      extensionTestsPath: testPath,
    });
  } catch (err) {
    console.error('Failed to run tests');
    process.exit(1);
  }
}

main();
```

## Appendix A: Industry Best Practices Research (2025)

Based on comprehensive research of current tools and practices:

### VS Code Extension Testing Options

| Tool | Type | Best For | Limitations |
|------|------|----------|-------------|
| **[@vscode/test-electron](https://code.visualstudio.com/api/working-with-extensions/testing-extension)** | Integration | API-level tests | No UI testing |
| **[vscode-extension-tester](https://github.com/redhat-developer/vscode-extension-tester)** | E2E/UI | TreeView, sidebar, UI interactions | Selenium-based, slower |
| **[WebdriverIO wdio-vscode-service](https://webdriver.io/docs/extension-testing/vscode-extensions/)** | E2E/UI | Modern all-in-one solution | Newer, less documentation |
| **Jest + Manual Mocks** | Unit | Pure logic without VS Code | Requires mock maintenance |

#### Recommended: Hybrid Approach

1. **Unit Tests**: [Jest with manual vscode mocks](https://www.richardkotze.com/coding/unit-test-mock-vs-code-extension-api-jest) for pure logic
2. **Integration Tests**: `@vscode/test-electron` for VS Code API interactions
3. **UI/E2E Tests**: **WebdriverIO** (preferred) or vscode-extension-tester for TreeView testing

#### WebdriverIO VS Code Service (Best Practice)

From [Christian Bromann's guide](https://bromann.dev/post/a-complete-guide-to-vs-code-extension-testing/):

```typescript
// wdio.conf.ts - Modern VS Code E2E setup
import path from 'path'

export const config = {
  capabilities: [{
    browserName: 'vscode',
    browserVersion: 'stable',
    'wdio:vscodeOptions': {
      extensionPath: path.join(__dirname, '..'),
      userSettings: {
        "opengrok-navigator.baseUrl": "http://localhost:8080/source"
      }
    }
  }],
  services: ['vscode'],
}

// Test example with TreeView interaction
describe('Search Results TreeView', () => {
  it('should display search results', async () => {
    const workbench = await browser.getWorkbench()

    // Execute command via VS Code API
    await browser.executeWorkbench((vscode) => {
      vscode.commands.executeCommand('opengrok-navigator.searchInView', 'test')
    })

    // Access sidebar
    const sidebar = workbench.getSideBar()
    const content = await sidebar.getContent()

    // Verify TreeView content
    const sections = await content.getSections()
    expect(sections.length).toBeGreaterThan(0)
  })
})
```

#### Jest Mock Pattern for Unit Tests

```typescript
// __mocks__/vscode.ts - Manual mock file
const window = {
  showInformationMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  createTreeView: jest.fn(() => ({
    onDidChangeVisibility: jest.fn(),
    reveal: jest.fn(),
  })),
  registerTreeDataProvider: jest.fn(),
  createOutputChannel: jest.fn(() => ({
    appendLine: jest.fn(),
    show: jest.fn(),
  })),
}

const workspace = {
  getConfiguration: jest.fn(() => ({
    get: jest.fn((key: string, defaultValue: any) => defaultValue),
  })),
  workspaceFolders: [{ uri: { fsPath: '/test/workspace' }, name: 'test' }],
}

const commands = {
  registerCommand: jest.fn(),
  executeCommand: jest.fn(),
}

module.exports = {
  window,
  workspace,
  commands,
  TreeItem: class {},
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  EventEmitter: class { fire() {} event = jest.fn() },
  Uri: { file: (f: string) => ({ fsPath: f }), parse: (s: string) => s },
  env: { clipboard: { writeText: jest.fn() }, openExternal: jest.fn() },
}
```

### Chrome Extension Testing Options

| Tool | Type | Best For | Limitations |
|------|------|----------|-------------|
| **[Playwright](https://playwright.dev/docs/chrome-extensions)** | E2E | Cross-browser, modern API, auto-wait | Requires Chromium channel |
| **Puppeteer** | E2E | Chrome-specific, mature ecosystem | Chrome-only |
| **Jest + jsdom** | Unit | DOM logic without browser | No real extension APIs |

#### Recommended: Playwright (Best Practice)

From [Playwright docs](https://playwright.dev/docs/chrome-extensions) and [community examples](https://dev.to/corrupt952/how-i-built-e2e-tests-for-chrome-extensions-using-playwright-and-cdp-11fl):

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    // Must use chromium channel for extension support
    channel: 'chromium',
  },
})

// tests/e2e/fixtures.ts - Extension fixture
import { test as base, chromium, BrowserContext } from '@playwright/test'
import path from 'path'

export const test = base.extend<{
  context: BrowserContext
  extensionId: string
}>({
  context: async ({}, use) => {
    const pathToExtension = path.join(__dirname, '../../dist')
    const context = await chromium.launchPersistentContext('', {
      headless: false, // Extensions require headed mode
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    })
    await use(context)
    await context.close()
  },
  extensionId: async ({ context }, use) => {
    // Wait for service worker to get extension ID
    let [background] = context.serviceWorkers()
    if (!background) {
      background = await context.waitForEvent('serviceworker')
    }
    const extensionId = background.url().split('/')[2]
    await use(extensionId)
  },
})

// tests/e2e/chrome-extension.spec.ts
import { test } from './fixtures'
import { expect } from '@playwright/test'

test('ctrl+click opens VS Code', async ({ context, extensionId }) => {
  // Configure extension via options page
  const optionsPage = await context.newPage()
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`)
  await optionsPage.fill('#project-input', 'test-project')
  await optionsPage.fill('#path-input', '/local/test-project')
  await optionsPage.click('#save-btn')

  // Navigate to mock OpenGrok page
  const page = await context.newPage()
  await page.goto('http://localhost:8080/source/xref/test-project/src/main.c')

  // Ctrl+Click line number
  await page.click('a.l[href$="#42"]', { modifiers: ['Control'] })

  // Verify vscode:// protocol was triggered
  // (requires mock protocol handler or checking side effects)
})

test('file finder modal works', async ({ context }) => {
  const page = await context.newPage()
  await page.goto('http://localhost:8080/source/xref/project/')

  // Press 't' to open file finder
  await page.keyboard.press('t')

  // Wait for modal
  const modal = page.locator('.vscode-finder-modal')
  await expect(modal).toBeVisible()

  // Type search
  await page.fill('.vscode-finder-input', 'main.c')

  // Verify results appear
  const results = page.locator('.vscode-finder-result')
  await expect(results.first()).toBeVisible()
})
```

#### Service Worker Testing Challenge

Manifest V3 service workers can be [flaky in tests](https://github.com/microsoft/playwright/issues/12103) because they "sleep" when inactive. Mitigation:

```typescript
// Keep service worker alive during tests
test.beforeEach(async ({ context, extensionId }) => {
  const page = await context.newPage()
  // Open extension page to wake service worker
  await page.goto(`chrome-extension://${extensionId}/options.html`)
})
```

---

## Appendix B: Improved Design Recommendations

Based on research, here are refinements to our original design:

### 1. Use WebdriverIO Instead of Custom VS Code Test Harness

**Why**: WebdriverIO's `wdio-vscode-service` provides:
- Automatic VS Code/Chromedriver version management
- Built-in page objects for VS Code UI elements
- Direct access to VS Code API via `executeWorkbench()`
- Support for testing TreeViews, sidebars, notifications

**Change**: Replace custom `TestableExtension` harness with WebdriverIO configuration.

### 2. Use Playwright over Puppeteer for Chrome Extension

**Why**:
- Auto-waiting eliminates flaky tests
- Better TypeScript support
- Active development and larger community
- Cross-browser potential for Firefox extension later

**Change**: Use Playwright with persistent context fixtures.

### 3. Add Contract Testing Between Components

**Why**: Ensure VS Code extension, Chrome extension, and og CLI all handle the same URL formats and search response structures.

```typescript
// shared/contracts/opengrok-api.contract.ts
export const searchResponseContract = {
  schema: {
    type: 'object',
    required: ['results', 'resultCount'],
    properties: {
      results: { type: 'object' },
      resultCount: { type: 'number' },
      time: { type: 'number' },
    }
  },
  examples: [
    { /* valid response */ },
    { /* edge case: empty results */ },
  ]
}

// Each component tests against the contract
describe('Search Response Parsing', () => {
  searchResponseContract.examples.forEach((example, i) => {
    it(`handles contract example ${i}`, () => {
      const result = parseSearchResponse(example)
      expect(result).toBeDefined()
    })
  })
})
```

### 4. Snapshot Testing for HTML Parsing

**Why**: The HTML fallback parser is brittle. Snapshot tests catch OpenGrok HTML changes.

```typescript
// tests/snapshots/html-parsing.test.ts
describe('HTML Parser Snapshots', () => {
  it('parses search results page', () => {
    const html = readFixture('opengrok-search-results.html')
    const result = parseOpenGrokResults(html, 'http://test/source', 'project', false, 'search')
    expect(result).toMatchSnapshot()
  })
})
```

### 5. Visual Regression Testing for Chrome Extension UI

**Why**: Chrome extension injects CSS and UI elements. Visual regression catches style breaks.

```typescript
// Using Playwright's screenshot comparison
test('floating toolbar appearance', async ({ page }) => {
  await page.goto('http://localhost:8080/source/xref/project/main.c')

  const toolbar = page.locator('.vscode-button-toolbar')
  await expect(toolbar).toHaveScreenshot('toolbar.png')
})
```

### 6. Mock vscode:// Protocol Handler

**Why**: Can't actually open VS Code in CI. Need to verify the URI is correct.

```typescript
// test-infra/mock-protocol-handler.ts
import http from 'http'

export class MockProtocolHandler {
  public lastUri: string | null = null
  private server: http.Server

  constructor(private port: number) {
    this.server = http.createServer((req, res) => {
      // Capture the URI from the request
      this.lastUri = decodeURIComponent(req.url?.slice(1) || '')
      res.writeHead(200)
      res.end('OK')
    })
  }

  async start() {
    return new Promise<void>(resolve => {
      this.server.listen(this.port, resolve)
    })
  }

  reset() {
    this.lastUri = null
  }
}

// In Chrome, intercept protocol with extension
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.pendingUrl?.startsWith('vscode://')) {
    // In test mode, send to mock handler instead
    fetch(`http://localhost:${TEST_PORT}/${encodeURIComponent(tab.pendingUrl)}`)
  }
})
```

---

## Appendix C: Revised Test Pyramid

```
                    ┌─────────────┐
                    │   E2E/UI    │  ~10 tests
                    │  (WebdriverIO │  TreeView clicks,
                    │   Playwright) │  full workflows
                    └──────┬──────┘
                           │
                ┌──────────┴──────────┐
                │    Integration      │  ~30 tests
                │  (Mock Adapters)    │  Services with
                │                     │  injected mocks
                └──────────┬──────────┘
                           │
        ┌──────────────────┴──────────────────┐
        │           Unit Tests                │  ~100+ tests
        │  (Pure Functions, Jest Mocks)       │  URL parsing,
        │                                     │  response parsing,
        │                                     │  path mapping
        └─────────────────────────────────────┘
```

**Key Insight**: Most bugs will be caught by unit tests on pure functions. E2E tests are expensive—use sparingly for critical user journeys.

---

## Appendix D: CI/CD Pipeline (Revised)

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - uses: actions/setup-go@v4
        with: { go-version: '1.21' }

      - name: Install & Test Shared
        run: cd shared && npm ci && npm test

      - name: Unit Test VS Code Extension
        run: cd vscode-extension && npm ci && npm run test:unit

      - name: Unit Test Chrome Extension
        run: cd chrome-extension && npm ci && npm run test:unit

      - name: Unit Test og CLI
        run: cd og && go test -v -short ./...

  integration-tests:
    runs-on: ubuntu-latest
    needs: unit-tests
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4

      - name: Start Mock OpenGrok Server
        run: |
          cd test-infra/mock-opengrok-server
          npm ci && npm start &
          sleep 5

      - name: Integration Tests
        run: |
          cd vscode-extension && npm run test:integration
          cd ../chrome-extension && npm run test:integration
        env:
          OPENGROK_URL: http://localhost:8080/source

  vscode-e2e:
    runs-on: ubuntu-latest
    needs: integration-tests
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4

      - name: Install dependencies
        run: cd vscode-extension && npm ci

      - name: Run WebdriverIO VS Code Tests
        run: cd vscode-extension && npx wdio run wdio.conf.ts
        env:
          DISPLAY: ':99'

  chrome-e2e:
    runs-on: ubuntu-latest
    needs: integration-tests
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4

      - name: Install Playwright
        run: npx playwright install chromium

      - name: Start Mock Server
        run: |
          cd test-infra/mock-opengrok-server
          npm ci && npm start &

      - name: Run Playwright Tests
        run: cd chrome-extension && npx playwright test
        env:
          # Playwright needs Xvfb for headed Chrome
          DISPLAY: ':99'

  og-integration:
    runs-on: ubuntu-latest
    needs: unit-tests
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v4

      - name: Integration Tests (Live Server)
        run: cd og && go test -v -tags=integration ./...
        continue-on-error: true  # External server may be unavailable
```

---

## Appendix E: Summary of Tool Recommendations

| Component | Unit Tests | Integration | E2E/UI |
|-----------|-----------|-------------|--------|
| **VS Code** | Jest + `__mocks__/vscode.ts` | `@vscode/test-electron` | **WebdriverIO** |
| **Chrome** | Jest + jsdom | Jest + mock adapters | **Playwright** |
| **og CLI** | Go `testing` (existing) | Go integration tests | N/A |
| **Shared** | Jest | N/A | N/A |

### Key Resources

- [VS Code Testing Extensions](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- [vscode-extension-tester Wiki](https://github.com/redhat-developer/vscode-extension-tester/wiki)
- [WebdriverIO VS Code Service](https://webdriver.io/docs/extension-testing/vscode-extensions/)
- [Playwright Chrome Extensions](https://playwright.dev/docs/chrome-extensions)
- [Jest Manual Mocks](https://www.richardkotze.com/coding/unit-test-mock-vs-code-extension-api-jest)
- [Complete VS Code Testing Guide](https://bromann.dev/post/a-complete-guide-to-vs-code-extension-testing/)

---

## Appendix F: Cross-Platform Compatibility (Linux CI + macOS Local Dev)

This section documents platform-specific requirements and configurations to ensure tests run correctly on both Linux (CI) and macOS (local development).

### Platform Requirements Summary

| Component | macOS (Local Dev) | Linux (CI) | Windows (Optional) |
|-----------|-------------------|------------|-------------------|
| **Unit Tests** | Native | Native | Native |
| **VS Code E2E** | Native | Requires Xvfb | Native |
| **Chrome E2E** | Native (headed) | Requires Xvfb | Native |
| **Mock Server** | Native | Native | Native |

### The Xvfb Requirement

**What is Xvfb?**
X Virtual Framebuffer (Xvfb) is a display server that performs graphical operations in memory without showing any screen output. It's required on headless Linux servers because:

1. VS Code requires a display to render its UI
2. Chrome extensions require `headless: false` mode
3. CI servers (GitHub Actions, etc.) don't have physical displays

**macOS doesn't need Xvfb** because macOS has a native window server even in CI environments.

### VS Code Extension Testing - Platform Configuration

#### GitHub Actions Workflow (Cross-Platform)

From the [official VS Code CI documentation](https://code.visualstudio.com/api/working-with-extensions/continuous-integration):

```yaml
# .github/workflows/vscode-extension.yml
name: VS Code Extension Tests

on: [push, pull_request]

jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [macos-latest, ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: cd vscode-extension && npm ci

      # Unit tests - no display needed
      - name: Run unit tests
        run: cd vscode-extension && npm run test:unit

      # Integration tests - need VS Code instance
      - name: Run integration tests (Linux)
        if: runner.os == 'Linux'
        run: cd vscode-extension && xvfb-run -a npm run test:integration

      - name: Run integration tests (macOS/Windows)
        if: runner.os != 'Linux'
        run: cd vscode-extension && npm run test:integration

      # E2E tests with WebdriverIO
      - name: Run E2E tests (Linux)
        if: runner.os == 'Linux'
        run: cd vscode-extension && xvfb-run -a npm run test:e2e

      - name: Run E2E tests (macOS/Windows)
        if: runner.os != 'Linux'
        run: cd vscode-extension && npm run test:e2e
```

#### WebdriverIO Configuration (Platform-Aware)

The [wdio-vscode-service](https://github.com/webdriverio-community/wdio-vscode-service) supports Ubuntu, macOS, and Windows natively:

```typescript
// vscode-extension/wdio.conf.ts
import path from 'path'
import os from 'os'

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./tests/e2e/**/*.spec.ts'],

  capabilities: [{
    browserName: 'vscode',
    browserVersion: 'stable',
    'wdio:vscodeOptions': {
      extensionPath: path.join(__dirname, '..'),
      userSettings: {
        'opengrok-navigator.baseUrl': process.env.OPENGROK_URL || 'http://localhost:8080/source'
      },
      // Cache VS Code downloads to speed up CI
      cachePath: path.join(os.tmpdir(), 'wdio-vscode-cache')
    }
  }],

  services: ['vscode'],

  framework: 'mocha',
  mochaOpts: {
    timeout: 60000, // Longer timeout for CI
    ui: 'bdd'
  },

  // WebdriverIO handles xvfb internally on Linux
  // No additional configuration needed
}
```

#### Local Development (macOS)

```bash
# Install dependencies
cd vscode-extension && npm install

# Run all tests locally (no xvfb needed)
npm run test:unit
npm run test:integration
npm run test:e2e

# Or run with watch mode for development
npm run test:unit -- --watch
```

### Chrome Extension Testing - Platform Configuration

#### Playwright Configuration (Platform-Aware)

[Playwright requires headed mode](https://playwright.dev/docs/chrome-extensions) for Chrome extensions, which means Xvfb on Linux:

```typescript
// chrome-extension/playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: process.env.CI ? 2 : 0, // Retry on CI for flakiness

  use: {
    // Chrome extensions only work with Chromium
    ...devices['Desktop Chrome'],

    // IMPORTANT: Extensions require headed mode
    headless: false,

    // Increase timeouts for CI
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },

  // Platform-specific settings
  projects: [
    {
      name: 'chromium',
      use: {
        channel: 'chromium', // Required for extension support
      },
    },
  ],

  // Run mock server before tests
  webServer: {
    command: 'npm run mock-server',
    port: 8080,
    reuseExistingServer: !process.env.CI,
  },
})
```

#### GitHub Actions Workflow (Chrome Extension)

```yaml
# .github/workflows/chrome-extension.yml
name: Chrome Extension Tests

on: [push, pull_request]

jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [macos-latest, ubuntu-latest]
        # Note: Windows Chrome extension testing can be flaky
    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: cd chrome-extension && npm ci

      # Install Playwright browsers with dependencies
      - name: Install Playwright Chromium
        run: cd chrome-extension && npx playwright install chromium --with-deps

      # Unit tests - no browser needed
      - name: Run unit tests
        run: cd chrome-extension && npm run test:unit

      # E2E tests - need headed browser
      - name: Run E2E tests (Linux with Xvfb)
        if: runner.os == 'Linux'
        run: cd chrome-extension && xvfb-run -a npx playwright test

      - name: Run E2E tests (macOS)
        if: runner.os == 'macOS'
        run: cd chrome-extension && npx playwright test
```

#### Local Development (macOS)

```bash
# Install dependencies and Playwright browsers
cd chrome-extension
npm install
npx playwright install chromium

# Run tests (browser window will open)
npm run test:unit
npx playwright test

# Run with UI mode for debugging
npx playwright test --ui

# Run specific test file
npx playwright test tests/e2e/file-finder.spec.ts
```

### Mock OpenGrok Server - Platform Configuration

The mock server is pure Node.js and works identically on all platforms:

```typescript
// test-infra/mock-opengrok-server/server.ts
import http from 'http'

const PORT = process.env.MOCK_SERVER_PORT || 8080

export class MockOpenGrokServer {
  private server: http.Server

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer(this.handleRequest.bind(this))
      this.server.listen(PORT, () => {
        console.log(`Mock OpenGrok server running on http://localhost:${PORT}`)
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve())
    })
  }

  // ... request handling
}

// Start server if run directly
if (require.main === module) {
  const server = new MockOpenGrokServer()
  server.start()
}
```

### Package.json Scripts (Cross-Platform)

```json
{
  "scripts": {
    "test": "npm run test:unit && npm run test:integration && npm run test:e2e",
    "test:unit": "jest --config jest.unit.config.js",
    "test:integration": "jest --config jest.integration.config.js",
    "test:e2e": "wdio run wdio.conf.ts",
    "test:e2e:headed": "wdio run wdio.conf.ts --headless=false",

    "mock-server": "ts-node ../test-infra/mock-opengrok-server/server.ts",
    "mock-server:bg": "npm run mock-server &"
  }
}
```

### Troubleshooting Platform-Specific Issues

#### Linux CI: "Cannot open display"

**Symptom**: Tests fail with `Cannot open display` or `DISPLAY not set`

**Solution**: Ensure `xvfb-run -a` prefix is used:
```yaml
- run: xvfb-run -a npm test
  if: runner.os == 'Linux'
```

#### Linux CI: "Failed to connect to the bus"

**Symptom**: D-Bus connection errors in VS Code tests

**Solution**: Add D-Bus configuration:
```yaml
- name: Setup D-Bus
  if: runner.os == 'Linux'
  run: |
    sudo apt-get install -y dbus
    sudo service dbus start
```

#### macOS: "Chrome not found"

**Symptom**: Playwright can't find Chrome

**Solution**: Install Chromium with dependencies:
```bash
npx playwright install chromium --with-deps
```

#### All Platforms: Slow Test Startup

**Symptom**: First test run is very slow (downloading VS Code/Chromium)

**Solution**: Use caching in CI:
```yaml
- name: Cache VS Code binaries
  uses: actions/cache@v4
  with:
    path: |
      ~/.cache/ms-playwright
      /tmp/wdio-vscode-cache
    key: ${{ runner.os }}-vscode-${{ hashFiles('**/package-lock.json') }}
```

### Complete CI Matrix (All Components)

```yaml
# .github/workflows/full-test-suite.yml
name: Full Test Suite

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - uses: actions/setup-go@v4
        with: { go-version: '1.21' }

      - run: cd shared && npm ci && npm test
      - run: cd vscode-extension && npm ci && npm run test:unit
      - run: cd chrome-extension && npm ci && npm run test:unit
      - run: cd og && go test -v -short ./...

  vscode-extension:
    needs: unit-tests
    strategy:
      fail-fast: false
      matrix:
        os: [macos-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }

      - name: Cache VS Code
        uses: actions/cache@v4
        with:
          path: /tmp/wdio-vscode-cache
          key: ${{ runner.os }}-vscode-cache

      - run: cd vscode-extension && npm ci

      - name: Run E2E (Linux)
        if: runner.os == 'Linux'
        run: cd vscode-extension && xvfb-run -a npm run test:e2e

      - name: Run E2E (macOS)
        if: runner.os == 'macOS'
        run: cd vscode-extension && npm run test:e2e

  chrome-extension:
    needs: unit-tests
    strategy:
      fail-fast: false
      matrix:
        os: [macos-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }

      - name: Cache Playwright
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: ${{ runner.os }}-playwright

      - run: cd chrome-extension && npm ci
      - run: cd chrome-extension && npx playwright install chromium --with-deps

      - name: Start mock server
        run: cd test-infra/mock-opengrok-server && npm ci && npm start &
        env:
          MOCK_SERVER_PORT: 8080

      - name: Run E2E (Linux)
        if: runner.os == 'Linux'
        run: cd chrome-extension && xvfb-run -a npx playwright test

      - name: Run E2E (macOS)
        if: runner.os == 'macOS'
        run: cd chrome-extension && npx playwright test

  og-cli:
    needs: unit-tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v4
        with: { go-version: '1.21' }

      - run: cd og && go test -v -tags=integration ./...
        continue-on-error: true  # External server may be unavailable
```

### Local Development Quick Start (macOS)

```bash
# Clone and setup
git clone <repo>
cd opengrok-navigator

# Install all dependencies
make install-deps  # or manually:
# cd shared && npm ci
# cd ../vscode-extension && npm ci
# cd ../chrome-extension && npm ci && npx playwright install chromium
# cd ../og && go mod download

# Run unit tests (fast, no display needed)
make test-unit

# Run full test suite (browsers will open)
make test

# Run specific component
cd vscode-extension && npm run test:e2e
cd chrome-extension && npx playwright test --ui  # with debugging UI
```

### Summary: What Works Where

| Test Type | macOS Local | Linux CI | Notes |
|-----------|-------------|----------|-------|
| Unit (Jest/Go) | ✅ `npm test` | ✅ `npm test` | No platform differences |
| VS Code Integration | ✅ `npm run test:integration` | ✅ `xvfb-run -a npm run test:integration` | Xvfb on Linux |
| VS Code E2E (WebdriverIO) | ✅ `npm run test:e2e` | ✅ `xvfb-run -a npm run test:e2e` | WebdriverIO handles most complexity |
| Chrome E2E (Playwright) | ✅ `npx playwright test` | ✅ `xvfb-run -a npx playwright test` | Must use `headless: false` |
| og CLI Integration | ✅ `go test -tags=integration` | ✅ Same | Network-dependent |
