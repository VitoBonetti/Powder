import { useMemo } from 'react';
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
  { tag: t.heading5, fontSize: "1.0em", fontWeight: "bold", color: "#e2e8f0" },
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


// --- LIGHT MODE HIGHLIGHTING (The Fix!) ---
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
  { tag: t.content, color: "#334155" },   // Normal Text (Force dark slate)
  { tag: t.keyword, color: "#d946ef" },
  { tag: t.string, color: "#16a34a" },
]);

const editorThemeLight = EditorView.theme({
  "&": { color: "#334155 !important", backgroundColor: "transparent" },
  ".cm-content": { color: "#334155 !important", caretColor: "#0ea5e9" },
  ".cm-line": { color: "#334155" },
  ".cm-activeLine": { backgroundColor: "rgba(0, 0, 0, 0.04)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "rgba(14, 165, 233, 0.25) !important" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#0ea5e9" },
}, { dark: false });


export default function Editor({ content, onChange, onLinkClick, onTagClick, onOpenTemplate, theme = 'dark' }) {

  const uploadImage = (file, view, pos) => {
    const placeholder = `\n![Uploading ${file.name}...]()\n`;
    view.dispatch({ changes: { from: pos, insert: placeholder } });
    const formData = new FormData();
    formData.append('file', file);
    fetch(getApiUrl('/upload-asset'), {
      method: 'POST',
      body: formData,
      credentials: 'include'
    })
    .then(res => res.json())
    .then(data => {
      const currentDoc = view.state.doc.toString();
      const placeholderIndex = currentDoc.indexOf(placeholder);
      if (placeholderIndex !== -1) {
        view.dispatch({ from: placeholderIndex, to: placeholderIndex + placeholder.length, insert: `\n![${file.name}](${data.path})\n` });
      }
    }).catch(err => console.error("Image upload failed:", err));
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
      // Force our exact base theme overrides depending on the mode
      theme === 'dark' ? editorThemeDark : editorThemeLight,
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      // Inject the exact syntax colors
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
            if (item.type.startsWith("image/")) { event.preventDefault(); uploadImage(item.getAsFile(), view, view.state.selection.main.head); return true; }
          }
          return false;
        },
        drop(event, view) {
          const items = event.dataTransfer?.files;
          if (items && items.length > 0) {
            for (const file of items) {
              if (file.type.startsWith("image/")) {
                event.preventDefault();
                const pos = view.posAtCoords({x: event.clientX, y: event.clientY});
                uploadImage(file, view, pos ? pos : view.state.selection.main.head);
                return true;
              }
            }
          }
          return false;
        }
      })
    ];
  }, [onLinkClick, onTagClick, onOpenTemplate, theme]);

  return (
    <CodeMirror
      value={content}
      // Set to 'none' in light mode so CodeMirror stops trying to overwrite our styling!
      theme={theme === 'dark' ? vscodeDark : 'none'}
      extensions={editorExtensions}
      onChange={onChange}
      className="text-lg powder-editor pb-20 transition-colors"
      basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
    />
  );
}