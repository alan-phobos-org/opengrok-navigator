/**
 * Extension Unit Tests
 *
 * Tests core functionality of the OpenGrok Navigator extension.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { parseOpenGrokJSON, parseOpenGrokResults } from '../../extension';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('opengrok-navigator.opengrok-navigator'));
    });

    test('Extension should activate', async () => {
        const ext = vscode.extensions.getExtension('opengrok-navigator.opengrok-navigator');
        if (ext) {
            await ext.activate();
            assert.ok(ext.isActive);
        }
    });

    test('Commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);

        assert.ok(commands.includes('opengrok-navigator.openInOpenGrok'));
        assert.ok(commands.includes('opengrok-navigator.copyOpenGrokUrl'));
        assert.ok(commands.includes('opengrok-navigator.searchInOpenGrok'));
        assert.ok(commands.includes('opengrok-navigator.searchInView'));
        assert.ok(commands.includes('opengrok-navigator.searchAllProjects'));
    });
});

suite('URL Construction Tests', () => {
    test('URL format should match expected pattern', () => {
        // Test the expected URL format
        const baseUrl = 'http://opengrok.example.com/source';
        const project = 'myproject';
        const filePath = 'src/main/App.java';
        const lineNumber = 42;

        const expectedUrl = `${baseUrl}/xref/${project}/${filePath}#${lineNumber}`;

        assert.strictEqual(
            expectedUrl,
            'http://opengrok.example.com/source/xref/myproject/src/main/App.java#42'
        );
    });

    test('URL should handle paths with special characters', () => {
        const baseUrl = 'http://opengrok.example.com/source';
        const project = 'my-project';
        const filePath = 'src/utils/file_name.ts';
        const lineNumber = 1;

        const url = `${baseUrl}/xref/${project}/${filePath}#${lineNumber}`;

        assert.ok(url.includes('my-project'));
        assert.ok(url.includes('file_name.ts'));
    });

    test('URL should use forward slashes regardless of platform', () => {
        const pathWithBackslashes = 'src\\main\\App.java';
        const normalized = pathWithBackslashes.replace(/\\/g, '/');

        assert.strictEqual(normalized, 'src/main/App.java');
    });
});

suite('Configuration Tests', () => {
    test('Default configuration values should be set', () => {
        const config = vscode.workspace.getConfiguration('opengrok-navigator');

        // Check default values
        assert.strictEqual(config.get('baseUrl'), 'http://localhost:8080/source');
        assert.strictEqual(config.get('useIntegratedBrowser'), false);
        assert.strictEqual(config.get('useTopLevelFolder'), false);
        assert.strictEqual(config.get('authEnabled'), false);
    });

    test('Configuration should allow custom baseUrl', async () => {
        const config = vscode.workspace.getConfiguration('opengrok-navigator');

        // Get and restore original value
        const originalBaseUrl = config.get('baseUrl');

        // Configuration inspection should work
        const inspection = config.inspect('baseUrl');
        assert.ok(inspection);
        assert.ok(inspection.defaultValue);
    });
});

suite('Search Result Parsing Tests', () => {
    test('Empty results should be handled', () => {
        const results: any[] = [];
        assert.strictEqual(results.length, 0);
    });

    test('Search term highlighting logic', () => {
        const searchTerm = 'test';
        const context = 'This is a test string with test in it';
        const contextLower = context.toLowerCase();

        const highlights: [number, number][] = [];
        let startIndex = 0;

        while (startIndex < contextLower.length) {
            const index = contextLower.indexOf(searchTerm, startIndex);
            if (index === -1) break;
            highlights.push([index, index + searchTerm.length]);
            startIndex = index + searchTerm.length;
        }

        assert.strictEqual(highlights.length, 2);
        assert.deepStrictEqual(highlights[0], [10, 14]); // "test" at position 10
        assert.deepStrictEqual(highlights[1], [28, 32]); // "test" at position 28
    });

    test('Search term highlighting is case-insensitive', () => {
        const searchTerm = 'test';
        const context = 'TEST Test test';
        const contextLower = context.toLowerCase();

        const highlights: [number, number][] = [];
        let startIndex = 0;

        while (startIndex < contextLower.length) {
            const index = contextLower.indexOf(searchTerm, startIndex);
            if (index === -1) break;
            highlights.push([index, index + searchTerm.length]);
            startIndex = index + searchTerm.length;
        }

        assert.strictEqual(highlights.length, 3);
    });

    test('REST results should use project keys when building URLs', () => {
        const data = {
            results: {
                'my-project': [
                    {
                        line: 'const value = 1;',
                        lineNumber: '12',
                        path: '/src/main.ts'
                    }
                ]
            }
        };

        const parsed = parseOpenGrokJSON(data, 'http://opengrok.example.com/source', '', false, 'value');
        assert.strictEqual(parsed.length, 1);
        assert.strictEqual(parsed[0].lines.length, 1);
        assert.strictEqual(
            parsed[0].lines[0].url,
            'http://opengrok.example.com/source/xref/my-project/src/main.ts#12'
        );
    });

    test('REST results keyed by file path should derive project name', () => {
        const data = {
            results: {
                '/project-a/src/utils/file.ts': [
                    {
                        line: 'return answer;',
                        lineno: 7
                    }
                ]
            }
        };

        const parsed = parseOpenGrokJSON(data, 'http://opengrok.example.com/source', '', false, 'answer');
        assert.strictEqual(parsed.length, 1);
        assert.strictEqual(
            parsed[0].lines[0].url,
            'http://opengrok.example.com/source/xref/project-a/src/utils/file.ts#7'
        );
    });

    test('HTML results should derive project name from href when missing', () => {
        const html = `
            <a class="s" href="/xref/proj-a/src/main.c#42">
                <span class="l">42</span> return 0;
            </a>
        `;

        const parsed = parseOpenGrokResults(html, 'http://opengrok.example.com/source', '', false, 'return');
        assert.strictEqual(parsed.length, 1);
        assert.strictEqual(
            parsed[0].lines[0].url,
            'http://opengrok.example.com/source/xref/proj-a/src/main.c#42'
        );
    });
});

suite('Path Handling Tests', () => {
    test('Top-level folder extraction', () => {
        const relativePath = 'project-a/src/main/App.java';
        const pathComponents = relativePath.split('/');

        const topLevelFolder = pathComponents[0];
        const remainingPath = pathComponents.slice(1).join('/');

        assert.strictEqual(topLevelFolder, 'project-a');
        assert.strictEqual(remainingPath, 'src/main/App.java');
    });

    test('Single component path handling', () => {
        const relativePath = 'file.java';
        const pathComponents = relativePath.split('/');

        assert.strictEqual(pathComponents.length, 1);
        assert.strictEqual(pathComponents[0], 'file.java');
    });

    test('Deep nested path handling', () => {
        const relativePath = 'a/b/c/d/e/f/g/file.java';
        const pathComponents = relativePath.split('/');

        assert.strictEqual(pathComponents.length, 8);
        assert.strictEqual(pathComponents[0], 'a');
        assert.strictEqual(pathComponents[pathComponents.length - 1], 'file.java');
    });
});
