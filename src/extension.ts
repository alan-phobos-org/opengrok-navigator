import * as vscode from 'vscode';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

// Search result line item
class SearchResultLine {
    constructor(
        public readonly lineNumber: number,
        public readonly url: string,
        public readonly context: string,
        public readonly searchTerm: string,
        public readonly filePath?: string
    ) {}
}

// Search result file group
class SearchResultFile extends vscode.TreeItem {
    constructor(
        public readonly filename: string,
        public readonly directory: string,
        public readonly lines: SearchResultLine[],
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(filename, collapsibleState);
        this.description = directory;
        this.tooltip = `${directory}${filename}`;
        this.contextValue = 'searchResultFile';
    }

    iconPath = new vscode.ThemeIcon('file-code');
}

// Search result line item for TreeView
class SearchResultLineItem extends vscode.TreeItem {
    constructor(
        public readonly line: SearchResultLine,
        public readonly filename: string
    ) {
        super(line.context, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'searchResultLine';
        this.tooltip = `Line ${line.lineNumber}: ${line.context}`;
        this.description = `${line.lineNumber}`;

        // Add highlighting for the search term
        const searchTerm = line.searchTerm.toLowerCase();
        const context = line.context;
        const contextLower = context.toLowerCase();
        const highlights: [number, number][] = [];

        // Find all occurrences of the search term in the context
        let startIndex = 0;
        while (startIndex < contextLower.length) {
            const index = contextLower.indexOf(searchTerm, startIndex);
            if (index === -1) break;
            highlights.push([index, index + searchTerm.length]);
            startIndex = index + searchTerm.length;
        }

        // Set label with highlights
        if (highlights.length > 0) {
            this.label = {
                label: context,
                highlights: highlights
            };
        }

        // If we have a local file path, open in editor; otherwise open in browser
        if (line.filePath) {
            this.command = {
                command: 'opengrok-navigator.openFileInEditor',
                title: 'Open File',
                arguments: [line.filePath, line.lineNumber]
            };
        } else {
            this.command = {
                command: 'vscode.open',
                title: 'Open in Browser',
                arguments: [vscode.Uri.parse(line.url)]
            };
        }
    }

    iconPath = new vscode.ThemeIcon('symbol-numeric');
}

// TreeView data provider for search results
class SearchResultsProvider implements vscode.TreeDataProvider<SearchResultFile | SearchResultLineItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<SearchResultFile | SearchResultLineItem | undefined | null | void> = new vscode.EventEmitter<SearchResultFile | SearchResultLineItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<SearchResultFile | SearchResultLineItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private searchResults: SearchResultFile[] = [];

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    clear(): void {
        this.searchResults = [];
        this.refresh();
    }

    setResults(results: SearchResultFile[]): void {
        this.searchResults = results;
        this.refresh();
    }

    getTreeItem(element: SearchResultFile | SearchResultLineItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: SearchResultFile | SearchResultLineItem): Thenable<(SearchResultFile | SearchResultLineItem)[]> {
        if (!element) {
            // Return top-level file groups
            return Promise.resolve(this.searchResults);
        } else if (element instanceof SearchResultFile) {
            // Return line items for this file
            return Promise.resolve(
                element.lines.map(line => new SearchResultLineItem(line, element.filename))
            );
        }
        return Promise.resolve([]);
    }
}

// OpenGrok API response types
interface OpenGrokSearchResult {
    path: string;
    lineno: string;
    line: string;
}

interface OpenGrokAPIResponse {
    results?: OpenGrokSearchResult[];
    resultCount?: number;
}

// Function to perform OpenGrok API search
async function searchOpenGrokAPI(baseUrl: string, searchText: string, projectName: string, outputChannel?: vscode.OutputChannel): Promise<any> {
    return new Promise((resolve, reject) => {
        const quotedSearchText = `"${searchText}"`;
        const encodedSearchText = encodeURIComponent(quotedSearchText);

        // Try REST API first (v1)
        let searchUrl = `${baseUrl}/api/v1/search?full=${encodedSearchText}`;
        if (projectName) {
            searchUrl += `&projects=${encodeURIComponent(projectName)}`;
        }

        const urlObj = new URL(searchUrl);
        const protocol = urlObj.protocol === 'https:' ? https : http;

        const req = protocol.get(searchUrl, (res) => {
            const statusCode = res.statusCode || 0;

            // If we get 404, the REST API doesn't exist - fall back to HTML
            if (statusCode === 404) {
                // Fall back to HTML search
                const htmlSearchUrl = `${baseUrl}/search?full=${encodedSearchText}${projectName ? '&project=' + encodeURIComponent(projectName) : ''}`;
                const htmlReq = protocol.get(htmlSearchUrl, (htmlRes) => {
                    let htmlData = '';
                    htmlRes.on('data', (chunk) => { htmlData += chunk; });
                    htmlRes.on('end', () => {
                        resolve({ html: htmlData, url: htmlSearchUrl, type: 'html' });
                    });
                });
                htmlReq.on('error', (error) => reject(error));
                htmlReq.end();
                return;
            }

            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    // Check if response is JSON (REST API)
                    const contentType = res.headers['content-type'] || '';
                    if (contentType.includes('application/json')) {
                        const jsonData = JSON.parse(data);
                        resolve({ json: jsonData, url: searchUrl, type: 'json' });
                    } else {
                        // Fallback to HTML parsing if REST API not available
                        resolve({ html: data, url: searchUrl, type: 'html' });
                    }
                } catch (error) {
                    // If JSON parsing fails, treat as HTML
                    resolve({ html: data, url: searchUrl, type: 'html' });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.end();
    });
}

// Parse OpenGrok JSON API search results
function parseOpenGrokJSON(data: any, baseUrl: string, projectName: string, useTopLevelFolder: boolean, searchTerm: string): SearchResultFile[] {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const seen = new Set<string>(); // Track unique file+line combinations
    const fileMap = new Map<string, { directory: string, lines: SearchResultLine[], fullPath: string }>();

    // OpenGrok REST API returns results as an object keyed by file path
    // Structure: { "results": { "/path/to/file": [ { "line": "...", "lineNumber": "123" } ] } }
    let resultsObject: any = null;

    if (data.results && typeof data.results === 'object' && !Array.isArray(data.results)) {
        resultsObject = data.results;
    } else if (data.hits && typeof data.hits === 'object' && !Array.isArray(data.hits)) {
        resultsObject = data.hits;
    } else {
        return [];
    }

    // Iterate through each file and its results
    for (const fullFilePath in resultsObject) {
        const fileResults = resultsObject[fullFilePath];

        if (!Array.isArray(fileResults)) {
            continue;
        }

        for (const result of fileResults) {
            // Extract file path - remove leading project path if present
            // Full path might be: "/project-name/path/to/file.c"
            let filePath = fullFilePath;
            if (filePath.startsWith('/')) {
                filePath = filePath.substring(1); // Remove leading slash
            }
            // If path starts with project name, remove it
            if (projectName && filePath.startsWith(projectName + '/')) {
                filePath = filePath.substring(projectName.length + 1);
            }

            // Get line number and context from the result object
            const lineNumberStr = result.lineNumber || result.lineno || result.line_number || result.lnum;
            const lineNumber = parseInt(lineNumberStr, 10);

            // Clean up HTML in the line content
            let context = result.line || result.text || result.content || '(click to view)';
            context = context
                .replace(/<[^>]+>/g, '') // Remove HTML tags
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&nbsp;/g, ' ')
                .replace(/\s+/g, ' ') // Normalize whitespace
                .trim();

            // Limit context length
            if (context.length > 150) {
                context = context.substring(0, 147) + '...';
            }

            // Skip if line number is invalid
            if (isNaN(lineNumber) || lineNumber <= 0) {
                continue;
            }

            // Create unique key for this result
            const uniqueKey = `${filePath}:${lineNumber}`;
            if (seen.has(uniqueKey)) {
                continue; // Skip duplicates
            }
            seen.add(uniqueKey);

            // Construct OpenGrok URL for this result
            const openGrokPath = `/xref/${projectName}/${filePath}#${lineNumber}`;
            const fullUrl = `${baseUrl}${openGrokPath}`;

            // Extract filename from path
            const pathParts = filePath.split('/');
            const filename = pathParts[pathParts.length - 1];

            // Skip if filename is empty or looks like a directory
            if (!filename || filename.length === 0) {
                continue;
            }

            // Get parent directory for context
            const parentDir = pathParts.length > 2 ? pathParts[pathParts.length - 2] : '';
            const directory = parentDir ? `${parentDir}` : '';

            // Try to convert OpenGrok path to local file path
            let localFilePath: string | undefined;
            if (workspaceFolders && workspaceFolders.length > 0) {
                if (useTopLevelFolder) {
                    // Path includes project name as top-level folder
                    localFilePath = path.join(workspaceFolders[0].uri.fsPath, projectName, filePath);
                } else {
                    // Path is relative to workspace root
                    localFilePath = path.join(workspaceFolders[0].uri.fsPath, filePath);
                }
            }

            // Group by file path
            const fileKey = filePath;
            if (!fileMap.has(fileKey)) {
                fileMap.set(fileKey, { directory, lines: [], fullPath: localFilePath || '' });
            }

            fileMap.get(fileKey)!.lines.push(new SearchResultLine(lineNumber, fullUrl, context, searchTerm, localFilePath));
        }
    }

    // Convert map to array of SearchResultFile objects
    const searchResults: SearchResultFile[] = [];
    for (const [filePath, fileData] of fileMap) {
        const pathParts = filePath.split('/');
        const filename = pathParts[pathParts.length - 1];

        // Sort lines by line number
        fileData.lines.sort((a, b) => a.lineNumber - b.lineNumber);

        searchResults.push(new SearchResultFile(
            filename,
            fileData.directory,
            fileData.lines,
            vscode.TreeItemCollapsibleState.Collapsed
        ));
    }

    // Sort results by filename
    searchResults.sort((a, b) => a.filename.localeCompare(b.filename));

    return searchResults;
}

// Parse OpenGrok HTML search results
function parseOpenGrokResults(html: string, baseUrl: string, projectName: string, useTopLevelFolder: boolean, searchTerm: string, outputChannel?: vscode.OutputChannel): SearchResultFile[] {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const seen = new Set<string>(); // Track unique file+line combinations
    const fileMap = new Map<string, { directory: string, lines: SearchResultLine[], fullPath: string }>();

    // OpenGrok search results have links with line numbers in a specific format
    // Pattern: href="/xref/project/path/file.ext#123"
    const resultRegex = /<a[^>]+href="([^"]*\/xref\/[^"#]+#\d+)"[^>]*>/g;
    const matches = html.matchAll(resultRegex);

    let matchCount = 0;
    for (const match of matches) {
        const href = match[1];
        const matchIndex = match.index || 0;

        // Try to extract context from the surrounding HTML
        // OpenGrok typically formats results as: <a href="...">line number</a> followed by code
        let context = '';

        // Look ahead from the link for the code content
        const lookAheadStart = matchIndex;
        const lookAheadEnd = Math.min(html.length, matchIndex + 800);
        const lookAheadHtml = html.substring(lookAheadStart, lookAheadEnd);

        // DEBUG: Log first few samples to understand HTML structure
        if (matchCount < 3 && outputChannel) {
            outputChannel.appendLine(`\n=== Match ${matchCount + 1} HTML Sample ===`);
            outputChannel.appendLine('First 500 chars:');
            outputChannel.appendLine(lookAheadHtml.substring(0, 500));
            outputChannel.appendLine('========================\n');
        }
        matchCount++;

        // OpenGrok puts the code content inside the <a> tag itself
        // Pattern: <a ...><span class="l">123</span> CODE CONTENT HERE</a>
        // We want to extract everything after the </span> tag and before the </a> tag
        const insideLinkMatch = lookAheadHtml.match(/<a[^>]*>.*?<\/span>\s*(.+?)<\/a>/s);
        if (insideLinkMatch && insideLinkMatch[1]) {
            context = insideLinkMatch[1];
            if (matchCount <= 3 && outputChannel) {
                outputChannel.appendLine('Extracted context from inside <a> tag: ' + context.substring(0, 100));
            }
        }

        // DEBUG: Log if no pattern matched
        if (!context && matchCount <= 3 && outputChannel) {
            outputChannel.appendLine('No pattern matched for this result');
            outputChannel.appendLine('Looking for: <a...><span class="l">NUM</span> CONTENT</a>');
        }

        // Clean up HTML entities and tags from context
        context = context
            .replace(/<[^>]+>/g, '') // Remove HTML tags
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();

        // Limit context length
        if (context.length > 150) {
            context = context.substring(0, 147) + '...';
        }

        // If we couldn't extract context, use a placeholder
        if (!context || context.length < 3) {
            context = '(click to view)';
        }

        // Extract line number from anchor (e.g., "/xref/project/file.ts#42")
        const anchorIndex = href.indexOf('#');
        if (anchorIndex === -1) {
            continue; // Skip if no line number
        }

        const lineStr = href.substring(anchorIndex + 1);
        const lineNumber = parseInt(lineStr, 10);
        const pathWithoutAnchor = href.substring(0, anchorIndex);

        // Skip if line number is invalid
        if (isNaN(lineNumber) || lineNumber <= 0) {
            continue;
        }

        // Create unique key for this result
        const uniqueKey = `${pathWithoutAnchor}:${lineNumber}`;
        if (seen.has(uniqueKey)) {
            continue; // Skip duplicates
        }
        seen.add(uniqueKey);

        const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;

        // Extract filename from path
        const pathParts = pathWithoutAnchor.split('/');
        const filename = pathParts[pathParts.length - 1];

        // Skip if filename is empty or looks like a directory
        if (!filename || filename.length === 0) {
            continue;
        }

        // Get parent directory for context (remove trailing slash)
        const parentDir = pathParts.length > 2 ? pathParts[pathParts.length - 2] : '';
        const directory = parentDir ? `${parentDir}` : '';

        // Try to convert OpenGrok path to local file path
        let localFilePath: string | undefined;
        if (workspaceFolders && workspaceFolders.length > 0) {
            // Extract the path after /xref/{projectName}/
            const xrefIndex = pathWithoutAnchor.indexOf('/xref/');
            if (xrefIndex !== -1) {
                const afterXref = pathWithoutAnchor.substring(xrefIndex + 6); // Skip '/xref/'
                const pathAfterProject = afterXref.substring(afterXref.indexOf('/') + 1);

                if (useTopLevelFolder) {
                    // Path includes project name as top-level folder
                    localFilePath = path.join(workspaceFolders[0].uri.fsPath, projectName, pathAfterProject);
                } else {
                    // Path is relative to workspace root
                    localFilePath = path.join(workspaceFolders[0].uri.fsPath, pathAfterProject);
                }
            }
        }

        // Group by file path
        const fileKey = pathWithoutAnchor;
        if (!fileMap.has(fileKey)) {
            fileMap.set(fileKey, { directory, lines: [], fullPath: localFilePath || '' });
        }

        fileMap.get(fileKey)!.lines.push(new SearchResultLine(lineNumber, fullUrl, context, searchTerm, localFilePath));
    }

    // Convert map to array of SearchResultFile objects
    const results: SearchResultFile[] = [];
    for (const [filePath, fileData] of fileMap) {
        const pathParts = filePath.split('/');
        const filename = pathParts[pathParts.length - 1];

        // Sort lines by line number
        fileData.lines.sort((a, b) => a.lineNumber - b.lineNumber);

        results.push(new SearchResultFile(
            filename,
            fileData.directory,
            fileData.lines,
            vscode.TreeItemCollapsibleState.Collapsed
        ));
    }

    // Sort results by filename
    results.sort((a, b) => a.filename.localeCompare(b.filename));

    return results;
}

function buildOpenGrokUrl(): string | null {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return null;
    }

    const document = editor.document;
    const selection = editor.selection;
    const lineNumber = selection.active.line + 1; // VS Code lines are 0-indexed, OpenGrok is 1-indexed

    // Get configuration
    const config = vscode.workspace.getConfiguration('opengrok-navigator');
    const baseUrl = config.get<string>('baseUrl');
    const projectRoot = config.get<string>('projectRoot');
    const useTopLevelFolder = config.get<boolean>('useTopLevelFolder', false);

    if (!baseUrl) {
        vscode.window.showErrorMessage('OpenGrok base URL is not configured. Please set it in settings.');
        return null;
    }

    // Get the file path relative to workspace
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('No workspace folder found');
        return null;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const filePath = document.uri.fsPath;

    // Calculate relative path
    let relativePath = path.relative(workspaceRoot, filePath);

    // Determine the project name for OpenGrok URL
    let projectName: string;

    if (useTopLevelFolder) {
        // Use the top-level folder name (first component of relative path)
        const pathComponents = relativePath.split(path.sep);
        if (pathComponents.length > 0) {
            projectName = pathComponents[0];
            // Remove the top-level folder from the relative path
            relativePath = pathComponents.slice(1).join('/');
        } else {
            vscode.window.showErrorMessage('Unable to determine top-level folder');
            return null;
        }
    } else {
        // Use the workspace name
        projectName = vscode.workspace.workspaceFolders?.[0]?.name || 'unknown';
    }

    // If projectRoot is specified, prepend it
    if (projectRoot) {
        relativePath = path.join(projectRoot, relativePath);
    }

    // Normalize path for URL (replace backslashes with forward slashes)
    relativePath = relativePath.replace(/\\/g, '/');

    // Construct OpenGrok URL
    // OpenGrok URL format: {baseUrl}/xref/{projectName}/{path}#{line}
    return `${baseUrl}/xref/${projectName}/${relativePath}#${lineNumber}`;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('OpenGrok Navigator extension is now active');

    // Create output channel for debug logging
    const outputChannel = vscode.window.createOutputChannel('OpenGrok Navigator');
    context.subscriptions.push(outputChannel);

    // Create search results provider and register TreeView
    const searchResultsProvider = new SearchResultsProvider();
    const treeView = vscode.window.createTreeView('opengrokSearchResults', {
        treeDataProvider: searchResultsProvider
    });
    context.subscriptions.push(treeView);

    // Command: Open in OpenGrok
    let openDisposable = vscode.commands.registerCommand('opengrok-navigator.openInOpenGrok', async () => {
        const openGrokUrl = buildOpenGrokUrl();
        if (!openGrokUrl) {
            return;
        }

        const config = vscode.workspace.getConfiguration('opengrok-navigator');
        const useIntegratedBrowser = config.get<boolean>('useIntegratedBrowser', false);

        // Open in browser (integrated or external based on setting)
        if (useIntegratedBrowser) {
            // Open in VS Code's built-in Simple Browser
            try {
                await vscode.commands.executeCommand('simpleBrowser.show', openGrokUrl);
            } catch (error) {
                // Handle any errors with Simple Browser
                vscode.window.showErrorMessage(
                    `Failed to open in Simple Browser: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    'Open Settings',
                    'Use External Browser'
                ).then(selection => {
                    if (selection === 'Open Settings') {
                        vscode.commands.executeCommand('workbench.action.openSettings', 'opengrok-navigator.useIntegratedBrowser');
                    } else if (selection === 'Use External Browser') {
                        vscode.env.openExternal(vscode.Uri.parse(openGrokUrl));
                    }
                });
                return;
            }
        } else {
            // Open in external system browser
            vscode.env.openExternal(vscode.Uri.parse(openGrokUrl));
        }
    });

    // Command: Copy OpenGrok URL
    let copyDisposable = vscode.commands.registerCommand('opengrok-navigator.copyOpenGrokUrl', async () => {
        const openGrokUrl = buildOpenGrokUrl();
        if (!openGrokUrl) {
            return;
        }

        // Copy URL to clipboard
        await vscode.env.clipboard.writeText(openGrokUrl);
        vscode.window.showInformationMessage('OpenGrok URL copied to clipboard');
    });

    // Command: Search in OpenGrok
    let searchDisposable = vscode.commands.registerCommand('opengrok-navigator.searchInOpenGrok', async () => {
        const editor = vscode.window.activeTextEditor;
        const config = vscode.workspace.getConfiguration('opengrok-navigator');
        const baseUrl = config.get<string>('baseUrl');
        const useTopLevelFolder = config.get<boolean>('useTopLevelFolder', false);

        if (!baseUrl) {
            vscode.window.showErrorMessage('OpenGrok base URL is not configured. Please set it in settings.');
            return;
        }

        // Determine the project name
        let projectName: string = '';

        if (editor) {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders) {
                const workspaceRoot = workspaceFolders[0].uri.fsPath;
                const filePath = editor.document.uri.fsPath;
                const relativePath = path.relative(workspaceRoot, filePath);

                if (useTopLevelFolder) {
                    // Use the top-level folder name
                    const pathComponents = relativePath.split(path.sep);
                    if (pathComponents.length > 0) {
                        projectName = pathComponents[0];
                    }
                } else {
                    // Use the workspace name
                    projectName = workspaceFolders[0].name;
                }
            }
        }

        // Get selected text or prompt for search term
        let searchText = '';
        if (editor && !editor.selection.isEmpty) {
            searchText = editor.document.getText(editor.selection);
        }

        // If no selection, prompt for search term
        if (!searchText) {
            const input = await vscode.window.showInputBox({
                prompt: 'Enter text to search in OpenGrok',
                placeHolder: 'Search term'
            });

            if (!input) {
                return; // User cancelled
            }
            searchText = input;
        }

        // URL encode and quote the search text for exact match
        const quotedSearchText = `"${searchText}"`;
        const encodedSearchText = encodeURIComponent(quotedSearchText);

        // Construct OpenGrok search URL with project parameter
        // OpenGrok search format: {baseUrl}/search?full={searchText}&project={projectName}
        let searchUrl = `${baseUrl}/search?full=${encodedSearchText}`;
        if (projectName) {
            searchUrl += `&project=${encodeURIComponent(projectName)}`;
        }

        const useIntegratedBrowser = config.get<boolean>('useIntegratedBrowser', false);

        // Open search results in browser (integrated or external based on setting)
        if (useIntegratedBrowser) {
            try {
                await vscode.commands.executeCommand('simpleBrowser.show', searchUrl);
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to open in Simple Browser: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    'Open Settings',
                    'Use External Browser'
                ).then(selection => {
                    if (selection === 'Open Settings') {
                        vscode.commands.executeCommand('workbench.action.openSettings', 'opengrok-navigator.useIntegratedBrowser');
                    } else if (selection === 'Use External Browser') {
                        vscode.env.openExternal(vscode.Uri.parse(searchUrl));
                    }
                });
                return;
            }
        } else {
            vscode.env.openExternal(vscode.Uri.parse(searchUrl));
        }
    });

    // Command: Search in View (using API)
    let searchInViewDisposable = vscode.commands.registerCommand('opengrok-navigator.searchInView', async () => {
        const editor = vscode.window.activeTextEditor;
        const config = vscode.workspace.getConfiguration('opengrok-navigator');
        const baseUrl = config.get<string>('baseUrl');
        const useTopLevelFolder = config.get<boolean>('useTopLevelFolder', false);

        if (!baseUrl) {
            vscode.window.showErrorMessage('OpenGrok base URL is not configured. Please set it in settings.');
            return;
        }

        // Determine the project name
        let projectName: string = '';

        if (editor) {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders) {
                const workspaceRoot = workspaceFolders[0].uri.fsPath;
                const filePath = editor.document.uri.fsPath;
                const relativePath = path.relative(workspaceRoot, filePath);

                if (useTopLevelFolder) {
                    const pathComponents = relativePath.split(path.sep);
                    if (pathComponents.length > 0) {
                        projectName = pathComponents[0];
                    }
                } else {
                    projectName = workspaceFolders[0].name;
                }
            }
        }

        // Get selected text or prompt for search term
        let searchText = '';
        if (editor && !editor.selection.isEmpty) {
            searchText = editor.document.getText(editor.selection);
        }

        if (!searchText) {
            const input = await vscode.window.showInputBox({
                prompt: 'Enter text to search in OpenGrok',
                placeHolder: 'Search term'
            });

            if (!input) {
                return;
            }
            searchText = input;
        }

        // Show progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Searching OpenGrok for "${searchText}"...`,
            cancellable: false
        }, async () => {
            try {
                const result = await searchOpenGrokAPI(baseUrl, searchText, projectName, outputChannel);

                let parsedResults: SearchResultFile[];
                if (result.type === 'json') {
                    // Use REST API JSON response
                    parsedResults = parseOpenGrokJSON(result.json, baseUrl, projectName, useTopLevelFolder, searchText);
                } else {
                    // Fallback to HTML parsing
                    parsedResults = parseOpenGrokResults(result.html, baseUrl, projectName, useTopLevelFolder, searchText, outputChannel);
                }

                searchResultsProvider.setResults(parsedResults);

                // Reveal the TreeView
                if (parsedResults.length > 0) {
                    await vscode.commands.executeCommand('opengrokSearchResults.focus');
                }

                vscode.window.showInformationMessage(`Found ${parsedResults.length} result(s) for "${searchText}"`);
            } catch (error) {
                vscode.window.showErrorMessage(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });
    });

    // Command: Clear search results
    let clearResultsDisposable = vscode.commands.registerCommand('opengrok-navigator.clearSearchResults', () => {
        searchResultsProvider.clear();
    });

    // Command: Open file in editor
    let openFileDisposable = vscode.commands.registerCommand('opengrok-navigator.openFileInEditor', async (filePath: string, lineNumber?: number) => {
        try {
            const uri = vscode.Uri.file(filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document);

            // If line number is provided, navigate to that line
            if (lineNumber !== undefined && lineNumber > 0) {
                const position = new vscode.Position(lineNumber - 1, 0); // VS Code lines are 0-indexed
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    context.subscriptions.push(
        openDisposable,
        copyDisposable,
        searchDisposable,
        searchInViewDisposable,
        clearResultsDisposable,
        openFileDisposable
    );
}

export function deactivate() {}
