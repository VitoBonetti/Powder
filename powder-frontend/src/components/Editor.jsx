import { useMemo, useState, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { EditorView, Decoration, ViewPlugin, MatchDecorator, keymap } from '@codemirror/view';
import { autocompletion } from '@codemirror/autocomplete';
import { BACKEND_URL, getApiUrl } from '../config';

// --- DARK MODE HIGHLIGHTING ---
const customMarkdownStyleDark = HighlightStyle.define([
  { tag: t.heading1, fontSize: "2.5em", fontWeight: "bold", color: "#60a5fa" },
  { tag: t.heading2, fontSize: "2em", fontWeight: "bold", color: "#93c5fd" },
  { tag: t.heading3, fontSize: "1.5em", fontWeight: "bold", color: "#e2e8f0" },
  { tag: t.heading4, fontSize: "1.2em", fontWeight: "bold", color: "#e2e8f0" },
  { tag: t.strong, fontWeight: "bold", color: "#ffffff" },
  { tag: t.emphasis, fontStyle: "italic", color: "#cbd5e1" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.quote, color: "#94a3b8", fontStyle: "italic" },
  { tag: t.monospace, color: "#38bdf8" }, // Code blocks
  { tag: t.meta, color: "#64748b" },      // Markdown symbols (###, >, ```)
  { tag: t.link, color: "#60a5fa", textDecoration: "underline" },
  { tag: t.url, color: "#64748b" },
  { tag: t.content, color: "#c9d1d9" },   // Normal Text
  { tag: t.keyword, color: "#c084fc" },
  { tag: t.string, color: "#4ade80" },
]);

const editorThemeDark = EditorView.theme({
  "&": { color: "#c9d1d9 !important", backgroundColor: "transparent" },
  ".cm-content": { color: "#c9d1d9 !important", caretColor: "#60a5fa" },
  ".cm-line": { color: "#c9d1d9" },
  ".cm-activeLine": { backgroundColor: "rgba(255, 255, 255, 0.04)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "rgba(96, 165, 250, 0.3) !important" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#60a5fa" },
}, { dark: true });


// --- LIGHT MODE HIGHLIGHTING ---
const customMarkdownStyleLight = HighlightStyle.define([
  { tag: t.heading1, fontSize: "2.5em", fontWeight: "bold", color: "#0284c7" },
  { tag: t.heading2, fontSize: "2em", fontWeight: "bold", color: "#0369a1" },
  { tag: t.heading3, fontSize: "1.5em", fontWeight: "bold", color: "#0f172a" },
  { tag: t.heading4, fontSize: "1.2em", fontWeight: "bold", color: "#1e293b" },
  { tag: t.strong, fontWeight: "bold", color: "#000000" },
  { tag: t.emphasis, fontStyle: "italic", color: "#475569" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.quote, color: "#64748b", fontStyle: "italic" },
  { tag: t.monospace, color: "#0ea5e9" }, // Code blocks
  { tag: t.meta, color: "#94a3b8" },      // Markdown symbols (###, >, ```)
  { tag: t.link, color: "#2563eb", textDecoration: "underline" },
  { tag: t.url, color: "#94a3b8" },
  { tag: t.content, color: "#334155" },   // Normal Text
  { tag: t.keyword, color: "#d946ef" },
  { tag: t.string, color: "#16a34a" },
]);

const editorThemeLight = EditorView.theme({
  "&": { color: "#334155 !important", backgroundColor: "transparent" },
  ".cm-content": { color: "#334155 !important", caretColor: "#0ea5e9" },
  ".cm-line": { color: "#334155" },
  ".cm-activeLine": { backgroundColor: "rgba(0, 0, 0, 0.04)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "rgba(14, 165, 233, 0.25) !important" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#0ea5e9 !important", borderLeftWidth: "2px !important", borderLeftStyle: "solid !important"},
}, { dark: false });


export default function Editor({ content, onChange, onLinkClick, onTagClick, onOpenTemplate, theme = 'dark' }) {
  const [isDragging, setIsDragging] = useState(false);
  const viewRef = useRef(null); // Keep a reference to the active CodeMirror view

  const uploadImage = (file, view, pos) => {
    const placeholder = `\n![Uploading ${file.name}...]()\n`;

    // 1. Insert the "Uploading..." placeholder
    view.dispatch({ changes: { from: pos, insert: placeholder } });

    const formData = new FormData();
    formData.append('file', file);

    fetch(getApiUrl('/upload-asset'), {
      method: 'POST',
      body: formData,
      credentials: 'include'
    })
    .then(res => {
      if (!res.ok) throw new Error("Server rejected the image");
      return res.json();
    })
    .then(data => {
      // 2. Find where the placeholder is NOW (in case the user kept typing)
      const currentDoc = view.state.doc.toString();
      const placeholderIndex = currentDoc.indexOf(placeholder);

      if (placeholderIndex !== -1) {
        // 3. FIX: Properly format the CodeMirror 6 transaction inside the 'changes' object
        view.dispatch({
          changes: {
            from: placeholderIndex,
            to: placeholderIndex + placeholder.length,
            insert: `\n![${file.name}](${data.path})\n`
          }
        });
      }
    }).catch(err => {
      console.error("Image upload failed:", err);
      // Optional: Clean up the placeholder if the upload fails
      const currentDoc = view.state.doc.toString();
      const placeholderIndex = currentDoc.indexOf(placeholder);
      if (placeholderIndex !== -1) {
        view.dispatch({
          changes: {
            from: placeholderIndex,
            to: placeholderIndex + placeholder.length,
            insert: `\n![Failed to upload: ${file.name}]()\n`
          }
        });
      }
    });
  };

  const editorExtensions = useMemo(() => {
    const wikiLinkDecorator = new MatchDecorator({
      regexp: /\[\[(.*?)\]\]/g,
      decoration: match => Decoration.mark({
        class: 'cm-wiki-link text-purple-600 dark:text-purple-400 underline cursor-pointer hover:text-purple-800 dark:hover:text-purple-300 transition-colors bg-purple-100 dark:bg-purple-900/20 px-1 rounded',
        attributes: { 'data-target': match[1] }
      })
    });

    const tagDecorator = new MatchDecorator({
      regexp: /#([a-zA-Z0-9_-]+)/g,
      decoration: match => Decoration.mark({
        class: 'cm-tag text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/20 px-1.5 py-0.5 rounded cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-900/40 hover:underline transition-colors',
        attributes: { 'data-tag': match[0] }
      })
    });

    const tagPlugin = ViewPlugin.fromClass(class {
      constructor(view) { this.decorations = tagDecorator.createDeco(view); }
      update(update) { this.decorations = tagDecorator.updateDeco(update, this.decorations); }
    }, { decorations: v => v.decorations });

    const wikiLinkPlugin = ViewPlugin.fromClass(class {
      constructor(view) { this.decorations = wikiLinkDecorator.createDeco(view); }
      update(update) { this.decorations = wikiLinkDecorator.updateDeco(update, this.decorations); }
    }, { decorations: v => v.decorations });

    const templateShortcut = keymap.of([{ key: "Alt-t", run: (view) => { if (onOpenTemplate) onOpenTemplate(view); return true; } }]);

    const tagCompletionSource = async (context) => {
      const word = context.matchBefore(/#[\w-]*/);
      if (!word) return null;
      if (word.from === word.to && !context.explicit) return null;
      try {
        const res = await fetch(getApiUrl('/tags'), { credentials: 'include' });
        const data = await res.json();
        return { from: word.from + 1, options: data.map(t => ({ label: t.tag, type: "keyword", apply: t.tag + " " })), validFor: /^[\w-]*$/ };
      } catch (err) { return null; }
    };

    const wikiLinkCompletionSource = async (context) => {
      const word = context.matchBefore(/\[\[[^\]]*/);
      if (!word) return null;
      if (word.from === word.to && !context.explicit) return null;
      try {
        const res = await fetch(getApiUrl('/tree'), { credentials: 'include' });
        const tree = await res.json();
        const files = [];
        const extractFiles = (node) => {
          if (node.type === 'file' && node.name.endsWith('.md')) files.push(node.name.replace('.md', ''));
          if (node.children) node.children.forEach(extractFiles);
        };
        extractFiles(tree);
        return { from: word.from + 2, options: files.map(file => ({ label: file, type: "text", apply: file + "]] " })), validFor: /^[^\]]*$/ };
      } catch (err) { return null; }
    };

    return [
      theme === 'dark' ? editorThemeDark : editorThemeLight,
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      syntaxHighlighting(theme === 'dark' ? customMarkdownStyleDark : customMarkdownStyleLight),
      wikiLinkPlugin,
      tagPlugin,
      templateShortcut,
      autocompletion({ override: [tagCompletionSource, wikiLinkCompletionSource] }),
      EditorView.lineWrapping,
      EditorView.domEventHandlers({
        click(event) {
          const linkEl = event.target.closest('.cm-wiki-link');
          if (linkEl && linkEl.hasAttribute('data-target')) { event.preventDefault(); onLinkClick(linkEl.getAttribute('data-target')); return true; }
          const tagEl = event.target.closest('.cm-tag');
          if (tagEl && tagEl.hasAttribute('data-tag')) { event.preventDefault(); onTagClick(tagEl.getAttribute('data-tag')); return true; }
          return false;
        },
        paste(event, view) {
          const items = event.clipboardData?.items;
          for (const item of items || []) {
            if (item.type.startsWith("image/")) {
              event.preventDefault();
              uploadImage(item.getAsFile(), view, view.state.selection.main.head);
              return true;
            }
          }
          return false;
        },
        // --- NATIVE DRAG & DROP ---
        dragenter(event) {
          // Required by the browser to authorize the drop zone
          event.preventDefault();
          return true;
        },
        dragover(event) {
          // Required by the browser to authorize the drop zone
          event.preventDefault();
          return true;
        },
        drop(event, view) {
          console.log("Available payload data:", Array.from(event.dataTransfer.types).map(t => `${t} = ${event.dataTransfer.getData(t)}`));
          event.preventDefault();

          // 1. Calculate exact drop coordinates first
          let posInfo = view.posAtCoords({ x: event.clientX, y: event.clientY });
          let pos = posInfo !== null ? posInfo.pos : view.state.doc.length;

          // Failsafe bounds check
          const maxPos = view.state.doc.length;
          if (pos > maxPos) pos = maxPos;
          if (pos < 0) pos = 0;

          // 2. Try to extract PHYSICAL files
          let filesToProcess = [];
          if (event.dataTransfer?.items) {
            for (let i = 0; i < event.dataTransfer.items.length; i++) {
              if (event.dataTransfer.items[i].kind === 'file') {
                const file = event.dataTransfer.items[i].getAsFile();
                if (file) filesToProcess.push(file);
              }
            }
          } else if (event.dataTransfer?.files) {
            for (let i = 0; i < event.dataTransfer.files.length; i++) {
              filesToProcess.push(event.dataTransfer.files[i]);
            }
          }

          if (filesToProcess.length > 0) {
            // Handle physical file upload
            let handled = false;
            filesToProcess.forEach(file => {
              if (file && file.type.startsWith("image/")) {
                uploadImage(file, view, pos);
                handled = true;
              }
            });
            return handled;
          }

          // 3. Fallback: Handle dragging custom paths from the Sidebar
          // CRITICAL FIX: Explicitly look for the Sidebar's custom 'sourcepath' key
          let textData = event.dataTransfer.getData('sourcepath');

          // Fallback to standard text just in case you drag from outside the app
          if (!textData) {
            textData = event.dataTransfer.getData('text/plain') || event.dataTransfer.getData('text/uri-list');
          }

          if (textData) {
            let insertText = textData;

            // Format as an image if it looks like an image path
            if (insertText.match(/\.(png|jpe?g|gif|webp|svg)$/i)) {
              const filename = insertText.split('/').pop();

              // Depending on your markdown setup, you might need a leading slash.
              // If your log said 'assets/...', we format it perfectly:
              insertText = `\n![${filename}](${insertText})\n`;
            }
            // Format as a wiki link if you drag a markdown note
            else if (insertText.endsWith('.md')) {
              const filename = insertText.split('/').pop().replace('.md', '');
              insertText = `[[${filename}]]`;
            }

            // Insert the formatted string exactly where the mouse dropped it
            view.dispatch({
              changes: { from: pos, insert: insertText }
            });

            return true;
          }

          return false;
        }
      })
    ];
  }, [onLinkClick, onTagClick, onOpenTemplate, theme]);

  // --- HTML5 Drag and Drop Handlers ---
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e) => {
    // Just turn off the blue overlay.
    // CodeMirror handles the actual file insertion natively now!
    setIsDragging(false);
  };

  return (
    <div
      className="h-full relative group"
      onDragOverCapture={handleDragOver}
      onDragLeaveCapture={handleDragLeave}
      onDropCapture={handleDrop}
    >
      {/* Visual Overlay shown during drag */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-blue-500/10 dark:bg-blue-900/20 border-2 border-dashed border-blue-500 rounded-lg pointer-events-none transition-all duration-200">
          <div className="bg-white dark:bg-gray-800 px-6 py-3 rounded-lg shadow-xl text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-3">
            <svg className="w-6 h-6 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Drop image here to insert
          </div>
        </div>
      )}

      <CodeMirror
        value={content}
        theme={theme === 'dark' ? vscodeDark : 'light'}
        extensions={editorExtensions}
        onChange={onChange}
        onCreateEditor={(view) => { viewRef.current = view; }}
        className="text-[15px] leading-relaxed powder-editor pb-20 transition-colors h-full"
        basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
      />
    </div>
  );
}