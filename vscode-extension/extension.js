"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
function activate(context) {
    console.log('OpenGrok Navigator extension is now active');
    let disposable = vscode.commands.registerCommand('opengrok-navigator.openInOpenGrok', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }
        const document = editor.document;
        const selection = editor.selection;
        const lineNumber = selection.active.line + 1; // VS Code lines are 0-indexed, OpenGrok is 1-indexed
        // Get configuration
        const config = vscode.workspace.getConfiguration('opengrok-navigator');
        const baseUrl = config.get('baseUrl');
        const projectRoot = config.get('projectRoot');
        if (!baseUrl) {
            vscode.window.showErrorMessage('OpenGrok base URL is not configured. Please set it in settings.');
            return;
        }
        // Get the file path relative to workspace
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }
        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const filePath = document.uri.fsPath;
        // Calculate relative path
        let relativePath = path.relative(workspaceRoot, filePath);
        // If projectRoot is specified, prepend it
        if (projectRoot) {
            relativePath = path.join(projectRoot, relativePath);
        }
        // Normalize path for URL (replace backslashes with forward slashes)
        relativePath = relativePath.replace(/\\/g, '/');
        // Construct OpenGrok URL
        // OpenGrok URL format: {baseUrl}/xref/{path}#{line}
        const openGrokUrl = `${baseUrl}/xref/${relativePath}#${lineNumber}`;
        console.log(`Opening OpenGrok URL: ${openGrokUrl}`);
        // Open in browser
        vscode.env.openExternal(vscode.Uri.parse(openGrokUrl));
        vscode.window.showInformationMessage(`Opened line ${lineNumber} in OpenGrok`);
    });
    context.subscriptions.push(disposable);
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map