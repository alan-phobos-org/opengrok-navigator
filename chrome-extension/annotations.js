// OpenGrok Annotations - Content Script

// Initialize debug logger
const annotationLog = (typeof OGDebug !== 'undefined') ? OGDebug.createLogger('annotations') : {
  error: () => {}, warn: () => {}, info: () => {}, debug: () => {}, trace: () => {},
  isEnabled: () => false
};

class AnnotationManager {
  constructor() {
    annotationLog.info('AnnotationManager initializing');
    this.enabled = false;
    this.annotations = [];
    this.currentEditor = null;
    this.editingLine = null;
    this.pollInterval = null;
    this.config = null;
    this.lastContextMenuTarget = null;
    this.lastHoveredElement = null;

    // Parse current page info
    const parsed = this.parseOpenGrokUrl();
    if (parsed) {
      this.project = parsed.project;
      this.filePath = parsed.filePath;
      annotationLog.debug('Parsed page info', { project: this.project, filePath: this.filePath });
    } else {
      annotationLog.warn('Could not parse page URL for annotations');
    }

    // Track mouse position for 'c' keyboard shortcut
    document.addEventListener('mouseover', (e) => {
      this.lastHoveredElement = e.target;
    });

    // Track right-click target for context menu
    document.addEventListener('contextmenu', (e) => {
      this.lastContextMenuTarget = e.target;
    });
  }

  parseOpenGrokUrl() {
    const url = window.location.href;
    const urlWithoutQuery = url.split('?')[0];
    const match = urlWithoutQuery.match(/\/xref\/([^/]+)\/(.+?)(?:#(\d+))?$/);
    if (!match) return null;
    return {
      project: match[1],
      filePath: match[2].replace(/#.*$/, '')
    };
  }

  async init() {
    annotationLog.info('Initializing annotations');

    // Load config
    await this.loadConfig();

    // Add toolbar button
    this.addToolbarButton();

    // Add annotation indicators for existing annotations
    if (this.config.storagePath) {
      annotationLog.debug('Storage path configured, loading annotations');
      await this.loadAnnotations();
      this.renderIndicators();
    } else {
      annotationLog.debug('No storage path configured');
    }

    // Setup page unload handler to clear editing state
    window.addEventListener('beforeunload', () => {
      if (this.editingLine !== null && this.config.storagePath && this.config.authorName) {
        this.stopEditing();
      }
    });

    // Auto-enable annotations if configured and enabled by default
    await this.restoreEnabledState();
    annotationLog.info('Annotations initialized', { enabled: this.enabled });
  }

  async restoreEnabledState() {
    return new Promise((resolve) => {
      chrome.storage.local.get({ annotationsEnabled: true }, (result) => {
        // Only auto-enable if storage path is configured
        if (result.annotationsEnabled && this.config.storagePath && this.config.authorName) {
          this.enableAnnotations();
        }
        resolve();
      });
    });
  }

  async enableAnnotations() {
    this.enabled = true;

    const btn = document.getElementById('og-annotation-button');
    if (btn) {
      btn.classList.add('active');
    }

    document.body.classList.add('og-annotations-enabled');
    await this.loadAnnotations();
    this.renderIndicators();  // Must be before addLineHoverButtons
    this.renderAnnotations();
    this.addLineHoverButtons();
    this.startPolling();
  }

  async loadConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['annotationStoragePath'], (localResult) => {
        chrome.storage.sync.get({
          annotationAuthorName: '',
          annotationPollInterval: 10
        }, (syncResult) => {
          this.config = {
            storagePath: localResult.annotationStoragePath || '',
            authorName: syncResult.annotationAuthorName,
            pollInterval: syncResult.annotationPollInterval
          };
          resolve();
        });
      });
    });
  }

  async saveConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.set({
        annotationStoragePath: this.config.storagePath
      }, () => {
        chrome.storage.sync.set({
          annotationAuthorName: this.config.authorName,
          annotationPollInterval: this.config.pollInterval
        }, resolve);
      });
    });
  }

  addToolbarButton() {
    const toolbar = document.getElementById('vscode-button-toolbar');
    if (!toolbar) return;

    const annotationBtn = document.createElement('button');
    annotationBtn.id = 'og-annotation-button';
    annotationBtn.className = 'vscode-annotation-btn vscode-open-btn';
    annotationBtn.textContent = '💬 Annotations';
    annotationBtn.title = 'Toggle inline annotations';

    annotationBtn.addEventListener('click', () => this.toggleAnnotations());

    // Insert after the finder button
    toolbar.appendChild(annotationBtn);
  }

  async toggleAnnotations() {
    // Check if configured
    if (!this.config.storagePath || !this.config.authorName) {
      await this.showConfigDialog();
      if (!this.config.storagePath || !this.config.authorName) {
        return; // User cancelled
      }
    }

    this.enabled = !this.enabled;

    // Save enabled state to storage
    chrome.storage.local.set({ annotationsEnabled: this.enabled });

    const btn = document.getElementById('og-annotation-button');
    if (btn) {
      btn.classList.toggle('active', this.enabled);
    }

    if (this.enabled) {
      document.body.classList.add('og-annotations-enabled');
      await this.loadAnnotations();
      this.renderIndicators();  // Must be before addLineHoverButtons
      this.renderAnnotations();
      this.addLineHoverButtons();
      this.startPolling();
    } else {
      document.body.classList.remove('og-annotations-enabled');
      this.hideAllAnnotations();
      this.removeLineHoverButtons();
      this.stopPolling();
    }
  }

  async showConfigDialog() {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'og-config-modal';
      modal.innerHTML = `
        <div class="og-config-container">
          <div class="og-config-header">Configure Annotations</div>
          <div class="og-config-body">
            <div class="og-config-field">
              <label>Storage Path</label>
              <input type="text" id="og-config-path" placeholder="/path/to/annotations or Y:\\shared\\annotations" value="${this.escapeHtml(this.config.storagePath)}">
              <div class="hint">Local or network drive path where annotations are stored</div>
            </div>
            <div class="og-config-field">
              <label>Your Name</label>
              <input type="text" id="og-config-author" placeholder="Your name for attribution" value="${this.escapeHtml(this.config.authorName)}">
            </div>
          </div>
          <div class="og-config-actions">
            <button class="og-btn-discard" id="og-config-cancel">Cancel</button>
            <button class="og-btn-save" id="og-config-save">Save</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const pathInput = modal.querySelector('#og-config-path');
      const authorInput = modal.querySelector('#og-config-author');
      const saveBtn = modal.querySelector('#og-config-save');
      const cancelBtn = modal.querySelector('#og-config-cancel');

      // Stop keyboard event propagation to prevent OpenGrok shortcuts
      [pathInput, authorInput].forEach(input => {
        input.addEventListener('keydown', (e) => e.stopPropagation());
        input.addEventListener('keyup', (e) => e.stopPropagation());
        input.addEventListener('keypress', (e) => e.stopPropagation());
      });

      pathInput.focus();

      saveBtn.addEventListener('click', async () => {
        const path = pathInput.value.trim();
        const author = authorInput.value.trim();

        if (!path || !author) {
          this.showToast('Please fill in all fields', 'error');
          return;
        }

        // Test connection to native host
        const pingResult = await this.sendMessage({ action: 'annotation:ping' });
        if (!pingResult || !pingResult.success) {
          this.showToast('Native host not installed. Please install og_annotate first.', 'error');
          return;
        }

        this.config.storagePath = path;
        this.config.authorName = author;
        await this.saveConfig();

        modal.remove();
        resolve();
      });

      cancelBtn.addEventListener('click', () => {
        modal.remove();
        resolve();
      });

      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.remove();
          resolve();
        }
      });
    });
  }

  async loadAnnotations() {
    if (!this.config.storagePath || !this.project || !this.filePath) {
      annotationLog.debug('Cannot load annotations - missing config', {
        hasStoragePath: !!this.config.storagePath,
        hasProject: !!this.project,
        hasFilePath: !!this.filePath
      });
      this.annotations = [];
      return;
    }

    annotationLog.debug('Loading annotations', { project: this.project, filePath: this.filePath });

    const result = await this.sendMessage({
      action: 'annotation:read',
      storagePath: this.config.storagePath,
      project: this.project,
      filePath: this.filePath
    });

    if (result && result.success) {
      this.annotations = result.annotations || [];
      annotationLog.info('Annotations loaded', { count: this.annotations.length });
    } else {
      this.annotations = [];
      annotationLog.error('Failed to load annotations', result?.error);
      if (result && result.error) {
        this.showToast(result.error, 'error');
      }
    }
  }

  renderIndicators() {
    // Clear existing indicators
    document.querySelectorAll('.og-annotation-indicator').forEach(el => el.remove());

    // Don't show indicators when annotations are visible (they're redundant)
    if (this.enabled) return;

    // Add indicators for lines with annotations
    const lineNumbers = document.querySelectorAll('a.l, a.hl');
    const annotationMap = new Map();
    this.annotations.forEach(ann => annotationMap.set(ann.line, ann));

    lineNumbers.forEach(anchor => {
      const lineNum = parseInt(anchor.textContent.trim(), 10);
      if (annotationMap.has(lineNum)) {
        // Remove any existing + button (indicator takes precedence)
        const existingBtn = anchor.querySelector('.og-add-annotation-btn');
        if (existingBtn) existingBtn.remove();

        const indicator = document.createElement('span');
        indicator.className = 'og-annotation-indicator';
        indicator.textContent = '💬';
        indicator.title = 'Click to view/edit annotation';
        indicator.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!this.enabled) {
            // Just enable annotations - this will render the annotation in view mode
            this.toggleAnnotations();
            return;
          }
          this.showEditor(lineNum);
        });
        anchor.style.position = 'relative';
        anchor.appendChild(indicator);
      }
    });
  }

  renderAnnotations() {
    // Clear existing annotations
    document.querySelectorAll('.og-annotation-margin').forEach(el => el.remove());

    if (!this.enabled) return;

    // Render each annotation after its line
    this.annotations.forEach(ann => {
      this.renderAnnotation(ann);
    });
  }

  renderAnnotation(ann) {
    const lineAnchor = this.findLineAnchor(ann.line);
    if (!lineAnchor) return;

    const annotationEl = this.createAnnotationElement(ann);

    // Insert annotation after the line content
    // OpenGrok structure: all lines in a single <pre>, each line starts with <a class="l">
    // We need to insert before the NEXT line anchor
    const insertionPoint = this.findInsertionPoint(ann.line);
    if (insertionPoint) {
      insertionPoint.parentNode.insertBefore(annotationEl, insertionPoint);
    } else {
      // Last line - append to the pre element
      const pre = lineAnchor.closest('pre');
      if (pre) {
        pre.appendChild(annotationEl);
      }
    }
  }

  findInsertionPoint(lineNum) {
    // Find the anchor for the next line
    const nextLineAnchor = this.findLineAnchor(lineNum + 1);
    if (nextLineAnchor) {
      return nextLineAnchor;
    }
    return null;
  }

  createAnnotationElement(ann) {
    const el = document.createElement('div');
    el.dataset.line = ann.line;
    el.className = 'og-annotation-margin';

    const timeAgo = this.formatTimeAgo(ann.timestamp);
    const renderedText = this.renderMarkdown(ann.text);

    el.innerHTML = `
      <div class="og-annotation-body">${renderedText}</div>
      <div class="og-annotation-meta">
        <span class="og-annotation-author">${this.escapeHtml(ann.author)}</span>
        <span class="og-annotation-time">${timeAgo}</span>
        <span class="og-annotation-actions">
          <button class="edit" title="Edit">✏️</button>
          <button class="delete" title="Delete">🗑️</button>
        </span>
      </div>
    `;

    el.querySelector('.edit').addEventListener('click', () => this.showEditor(ann.line));
    el.querySelector('.delete').addEventListener('click', () => this.confirmDelete(ann.line));

    return el;
  }

  addLineHoverButtons() {
    // No longer using hover buttons - using context menu instead
  }

  addAnnotationAtCursor() {
    // Find the line number from: 1) mouse hover position, 2) right-click target, 3) URL hash
    let lineNum = null;

    // First, try to find from current mouse hover position
    if (this.lastHoveredElement) {
      lineNum = this.findLineFromElement(this.lastHoveredElement);
    }

    // If not found, try right-click target (for context menu)
    if (!lineNum && this.lastContextMenuTarget) {
      lineNum = this.findLineFromElement(this.lastContextMenuTarget);
      this.lastContextMenuTarget = null; // Clear after use
    }

    // Last resort: URL hash
    if (!lineNum) {
      const hash = window.location.hash.replace('#', '');
      if (hash) {
        lineNum = parseInt(hash, 10);
      }
    }

    if (lineNum) {
      // Enable annotations if not already enabled
      if (!this.enabled) {
        this.enableAnnotations().then(() => {
          this.showEditor(lineNum);
        });
      } else {
        this.showEditor(lineNum);
      }
    } else {
      this.showToast('Could not determine line number. Click on a line first.', 'error');
    }
  }

  jumpToNextAnnotation() {
    if (this.annotations.length === 0) {
      this.showToast('No annotations in this file', 'info');
      return;
    }

    // Get current line from URL hash or default to 0
    const hash = window.location.hash.replace('#', '');
    const currentLine = hash ? parseInt(hash, 10) : 0;

    // Sort annotations by line number
    const sortedAnnotations = [...this.annotations].sort((a, b) => a.line - b.line);

    // Find next annotation after current line
    let nextAnnotation = sortedAnnotations.find(ann => ann.line > currentLine);

    // If no annotation found after current line, wrap to first annotation
    if (!nextAnnotation) {
      nextAnnotation = sortedAnnotations[0];
    }

    // Scroll to the annotation line
    const lineAnchor = this.findLineAnchor(nextAnnotation.line);
    if (lineAnchor) {
      lineAnchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Update URL hash
      window.location.hash = nextAnnotation.line;
    }
  }

  findLineFromElement(element) {
    let node = element;
    while (node && node !== document.body) {
      // Check previous siblings first (works for both text nodes and elements)
      // In OpenGrok, line anchors are siblings to code content within <pre>
      let sibling = node.previousSibling;
      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE) {
          if (sibling.matches?.('a.l, a.hl')) {
            return parseInt(sibling.textContent.trim(), 10);
          }
        }
        sibling = sibling.previousSibling;
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        // Check if this element is a line anchor
        if (node.matches?.('a.l, a.hl')) {
          return parseInt(node.textContent.trim(), 10);
        }
        // Only check children if this is a small element (not a container like <pre>)
        // to avoid matching the wrong line anchor
        if (!node.matches?.('pre, div, body')) {
          const lineAnchor = node.querySelector?.('a.l, a.hl');
          if (lineAnchor) {
            return parseInt(lineAnchor.textContent.trim(), 10);
          }
        }
      }
      node = node.parentElement;
    }
    return null;
  }

  removeLineHoverButtons() {
    document.querySelectorAll('.og-add-annotation-btn').forEach(el => el.remove());
  }

  hideAllAnnotations() {
    document.querySelectorAll('.og-annotation-margin, .og-annotation-editor').forEach(el => el.remove());
  }

  async showEditor(lineNum) {
    // Close any existing editor
    this.hideEditor();

    const existingAnn = this.annotations.find(a => a.line === lineNum);
    this.editingLine = lineNum;

    // Mark as editing
    await this.startEditingMarker(lineNum);

    const lineAnchor = this.findLineAnchor(lineNum);
    if (!lineAnchor) return;

    // Hide existing annotation for this line if showing
    const existingAnnotation = document.querySelector(`.og-annotation-margin[data-line="${lineNum}"]`);
    if (existingAnnotation) {
      existingAnnotation.style.display = 'none';
    }

    const editor = document.createElement('div');
    editor.className = 'og-annotation-editor';
    editor.dataset.line = lineNum;
    editor.innerHTML = `
      <div class="og-editor-header">
        <span>✏️ ${existingAnn ? 'Editing' : 'New annotation'} as: ${this.escapeHtml(this.config.authorName)}</span>
      </div>
      <textarea class="og-editor-textarea" placeholder="Enter your annotation (Markdown supported)...">${existingAnn ? this.escapeHtml(existingAnn.text) : ''}</textarea>
      <div class="og-editor-actions">
        ${existingAnn ? '<button class="og-btn-delete">Delete</button>' : ''}
        <button class="og-btn-discard">Discard (Esc)</button>
        <button class="og-btn-save">Save (Ctrl+Enter)</button>
      </div>
    `;

    // Insert after the line content, before the next line anchor
    const insertionPoint = this.findInsertionPoint(lineNum);
    if (insertionPoint) {
      insertionPoint.parentNode.insertBefore(editor, insertionPoint);
    } else {
      // Last line - append to the pre element
      const pre = lineAnchor.closest('pre');
      if (pre) {
        pre.appendChild(editor);
      }
    }

    const textarea = editor.querySelector('.og-editor-textarea');
    textarea.focus();

    // Event handlers - stop propagation to prevent OpenGrok shortcuts from interfering
    textarea.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        this.hideEditor();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        this.saveCurrentAnnotation();
      }
    });
    textarea.addEventListener('keyup', (e) => e.stopPropagation());
    textarea.addEventListener('keypress', (e) => e.stopPropagation());

    editor.querySelector('.og-btn-save').addEventListener('click', () => this.saveCurrentAnnotation());
    editor.querySelector('.og-btn-discard').addEventListener('click', () => this.hideEditor());

    const deleteBtn = editor.querySelector('.og-btn-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => this.confirmDelete(lineNum));
    }

    this.currentEditor = editor;
  }

  async hideEditor() {
    if (this.currentEditor) {
      const lineNum = parseInt(this.currentEditor.dataset.line, 10);
      this.currentEditor.remove();
      this.currentEditor = null;

      // Show the annotation again if it exists
      const existingAnnotation = document.querySelector(`.og-annotation-margin[data-line="${lineNum}"]`);
      if (existingAnnotation) {
        existingAnnotation.style.display = '';
      }
    }

    if (this.editingLine !== null) {
      await this.stopEditing();
      this.editingLine = null;
    }
  }

  async saveCurrentAnnotation() {
    if (!this.currentEditor) return;

    const lineNum = parseInt(this.currentEditor.dataset.line, 10);
    const textarea = this.currentEditor.querySelector('.og-editor-textarea');
    const text = textarea.value.trim();

    if (!text) {
      this.showToast('Annotation cannot be empty', 'error');
      return;
    }

    // Get context (3 lines before, annotated line, 3 lines after)
    const context = this.getLineContext(lineNum);

    const result = await this.sendMessage({
      action: 'annotation:save',
      storagePath: this.config.storagePath,
      project: this.project,
      filePath: this.filePath,
      line: lineNum,
      author: this.config.authorName,
      text: text,
      context: context
    });

    if (result && result.success) {
      this.showToast('Annotation saved', 'success');
      this.hideEditor();
      await this.loadAnnotations();
      this.renderIndicators();
      this.renderAnnotations();
    } else {
      this.showToast(result?.error || 'Failed to save annotation', 'error');
    }
  }

  getLineContext(lineNum) {
    const context = [];
    const start = Math.max(1, lineNum - 3);
    const end = lineNum + 3;

    for (let i = start; i <= end; i++) {
      const anchor = this.findLineAnchor(i);
      if (anchor) {
        // OpenGrok structure: lines in a <pre>, each line starts with <a class="l">
        // Extract text from this anchor to the next anchor (or end of line)
        let code = this.extractLineContent(anchor);

        const prefix = i === lineNum ? '>>> ' : '    ';
        context.push(prefix + code);
      }
    }

    return context;
  }

  extractLineContent(anchor) {
    // Walk through siblings after the anchor until we hit a newline or another line anchor
    let code = '';
    let node = anchor.nextSibling;

    while (node) {
      // Stop at next line anchor
      if (node.nodeType === Node.ELEMENT_NODE && node.matches && node.matches('a.l, a.hl')) {
        break;
      }

      // Get text content
      const text = node.textContent || '';

      // Check if this node contains a newline
      const newlineIdx = text.indexOf('\n');
      if (newlineIdx !== -1) {
        // Only take text before the newline
        code += text.substring(0, newlineIdx);
        break;
      }

      code += text;
      node = node.nextSibling;
    }

    return code;
  }

  async confirmDelete(lineNum) {
    return new Promise((resolve) => {
      const dialog = document.createElement('div');
      dialog.className = 'og-confirm-dialog';
      dialog.innerHTML = `
        <div class="og-confirm-container">
          <div class="og-confirm-message">Are you sure you want to delete this annotation?</div>
          <div class="og-confirm-actions">
            <button class="og-btn-discard" id="og-confirm-cancel">Cancel</button>
            <button class="og-btn-delete" id="og-confirm-delete">Delete</button>
          </div>
        </div>
      `;

      document.body.appendChild(dialog);

      dialog.querySelector('#og-confirm-delete').addEventListener('click', async () => {
        dialog.remove();
        await this.deleteAnnotation(lineNum);
        resolve(true);
      });

      dialog.querySelector('#og-confirm-cancel').addEventListener('click', () => {
        dialog.remove();
        resolve(false);
      });

      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
          dialog.remove();
          resolve(false);
        }
      });
    });
  }

  async deleteAnnotation(lineNum) {
    const result = await this.sendMessage({
      action: 'annotation:delete',
      storagePath: this.config.storagePath,
      project: this.project,
      filePath: this.filePath,
      line: lineNum
    });

    if (result && result.success) {
      this.showToast('Annotation deleted', 'success');
      this.hideEditor();
      await this.loadAnnotations();
      this.renderIndicators();
      this.renderAnnotations();
      this.addLineHoverButtons();  // Re-add + button to the now-unannotated line
    } else {
      this.showToast(result?.error || 'Failed to delete annotation', 'error');
    }
  }

  async startEditingMarker(lineNum) {
    if (!this.config.storagePath || !this.config.authorName) return;

    await this.sendMessage({
      action: 'annotation:startEditing',
      storagePath: this.config.storagePath,
      user: this.config.authorName,
      filePath: `${this.project}/${this.filePath}`,
      line: lineNum
    });
  }

  async stopEditing() {
    if (!this.config.storagePath || !this.config.authorName) return;

    await this.sendMessage({
      action: 'annotation:stopEditing',
      storagePath: this.config.storagePath,
      user: this.config.authorName
    });
  }

  startPolling() {
    this.stopPolling();

    const interval = (this.config.pollInterval || 10) * 1000;
    this.pollInterval = setInterval(async () => {
      await this.loadAnnotations();
      this.renderIndicators();
      if (this.enabled && !this.currentEditor) {
        this.renderAnnotations();
        this.addLineHoverButtons();  // Re-add buttons for lines that lost annotations
      }
    }, interval);
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  findLineAnchor(lineNum) {
    // OpenGrok uses 'a.l' for regular lines and 'a.hl' for highlighted lines (every 10th)
    const anchors = document.querySelectorAll('a.l, a.hl');
    for (const anchor of anchors) {
      if (parseInt(anchor.textContent.trim(), 10) === lineNum) {
        return anchor;
      }
    }
    return null;
  }

  formatTimeAgo(timestamp) {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
    if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
    if (diffDay < 30) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;

    return date.toLocaleDateString();
  }

  renderMarkdown(text) {
    if (!text) return '';

    // Simple markdown rendering
    let html = this.escapeHtml(text);

    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Lists (simple)
    html = html.replace(/^[\s]*[-*]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    // Clean up excessive br tags around block elements
    html = html.replace(/<br>\s*<(pre|ul|ol)/g, '<$1');
    html = html.replace(/<\/(pre|ul|ol)>\s*<br>/g, '</$1>');

    return html;
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showToast(message, type = 'info') {
    // Remove existing toasts
    document.querySelectorAll('.og-toast').forEach(el => el.remove());

    const toast = document.createElement('div');
    toast.className = `og-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 4000);
  }

  sendMessage(message) {
    return new Promise((resolve) => {
      try {
        if (!chrome.runtime?.id) {
          // Extension context invalidated (extension reloaded/disabled)
          annotationLog.error('Extension context invalidated');
          resolve({ success: false, error: 'Extension was reloaded. Please refresh the page.' });
          return;
        }
        annotationLog.trace('Sending message', { action: message.action });
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            annotationLog.error('Message error', chrome.runtime.lastError.message);
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            annotationLog.trace('Message response', response);
            resolve(response);
          }
        });
      } catch (e) {
        annotationLog.error('Message exception', e);
        resolve({ success: false, error: 'Extension context invalidated. Please refresh the page.' });
      }
    });
  }
}

// Initialize when DOM is ready
function initAnnotations() {
  // Only initialize on file pages (not directory listings)
  const hasLineNumbers = document.querySelector('a.l, a.hl') !== null;
  const hasDirectoryListing = document.querySelector('table.directory, table#dirlist, .directory-list') !== null;
  const isFilePage = hasLineNumbers && !hasDirectoryListing;

  annotationLog.debug('Checking if annotations should initialize', { hasLineNumbers, hasDirectoryListing, isFilePage });

  if (isFilePage) {
    annotationLog.info('Initializing annotation manager on file page');
    window.annotationManager = new AnnotationManager();
    window.annotationManager.init();
  } else {
    annotationLog.debug('Skipping annotation manager - not a file page');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAnnotations);
} else {
  // Wait a bit for content.js to create the toolbar
  setTimeout(initAnnotations, 100);
}
