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
        super(`Line ${line.lineNumber}: ${line.context}`, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'searchResultLine';
        this.tooltip = line.context;

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

// Function to perform OpenGrok API search
async function searchOpenGrokAPI(baseUrl: string, searchText: string, projectName: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const quotedSearchText = `"${searchText}"`;
        const encodedSearchText = encodeURIComponent(quotedSearchText);

        let searchUrl = `${baseUrl}/search?full=${encodedSearchText}`;
        if (projectName) {
            searchUrl += `&project=${encodeURIComponent(projectName)}`;
        }

        const urlObj = new URL(searchUrl);
        const protocol = urlObj.protocol === 'https:' ? https : http;

        const req = protocol.get(searchUrl, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    // OpenGrok returns HTML, we'll parse it to extract results
                    resolve({ html: data, url: searchUrl });
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.end();
    });
}

// Parse OpenGrok HTML search results
function parseOpenGrokResults(html: string, baseUrl: string, projectName: string, useTopLevelFolder: boolean): SearchResultFile[] {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const seen = new Set<string>(); // Track unique file+line combinations
    const fileMap = new Map<string, { directory: string, lines: SearchResultLine[], fullPath: string }>();

    // OpenGrok search results have links with line numbers in a specific format
    // Pattern: href="/xref/project/path/file.ext#123"
    const resultRegex = /<a[^>]+href="([^"]*\/xref\/[^"#]+#\d+)"[^>]*>/g;
    const matches = html.matchAll(resultRegex);

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

        // Try multiple patterns to find the code content
        // Pattern 1: Content in <tt> tags (most common)
        let ttMatch = lookAheadHtml.match(/<tt[^>]*>(.*?)<\/tt>/s);
        if (ttMatch && ttMatch[1]) {
            context = ttMatch[1];
        }

        // Pattern 2: Content in <code> tags
        if (!context) {
            const codeMatch = lookAheadHtml.match(/<code[^>]*>(.*?)<\/code>/s);
            if (codeMatch && codeMatch[1]) {
                context = codeMatch[1];
            }
        }

        // Pattern 3: Look for text after the closing </a> tag
        if (!context) {
            const afterLinkMatch = lookAheadHtml.match(/<\/a>\s*(.{10,200}?)(?:<br|<\/)/s);
            if (afterLinkMatch && afterLinkMatch[1]) {
                context = afterLinkMatch[1];
            }
        }

        // Pattern 4: Try to find any line-like content with class="l" or similar
        if (!context) {
            const lineMatch = lookAheadHtml.match(/class="[^"]*l[^"]*"[^>]*>([^<]{10,200})/);
            if (lineMatch && lineMatch[1]) {
                context = lineMatch[1];
            }
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

        fileMap.get(fileKey)!.lines.push(new SearchResultLine(lineNumber, fullUrl, context, localFilePath));
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
                const result = await searchOpenGrokAPI(baseUrl, searchText, projectName);
                const parsedResults = parseOpenGrokResults(result.html, baseUrl, projectName, useTopLevelFolder);
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
