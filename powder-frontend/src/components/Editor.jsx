import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { EditorView, Decoration, ViewPlugin, MatchDecorator, keymap } from '@codemirror/view';
import { BACKEND_URL } from '../config';

const customMarkdownStyle = HighlightStyle.define([
  { tag: t.heading1, fontSize: "2.5em", fontWeight: "bold", color: "#60a5fa" },
  { tag: t.heading2, fontSize: "2em", fontWeight: "bold", color: "#93c5fd" },
  { tag: t.heading3, fontSize: "1.5em", fontWeight: "bold", color: "#e2e8f0" },
  { tag: t.heading4, fontSize: "1.2em", fontWeight: "bold", color: "#e2e8f0" },
  { tag: t.strong, fontWeight: "bold", color: "#ffffff" },
  { tag: t.emphasis, fontStyle: "italic", color: "#cbd5e1" },
  { tag: t.strikethrough, textDecoration: "line-through" },
]);

export default function Editor({ content, onChange, onLinkClick, onTagClick, onOpenTemplate }) {

  // Image Upload Logic
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
        class: 'cm-wiki-link text-purple-400 underline cursor-pointer hover:text-purple-300 transition-colors bg-purple-900/20 px-1 rounded',
        attributes: { 'data-target': match[1] }
      })
    });

    const tagDecorator = new MatchDecorator({
      regexp: /#([a-zA-Z0-9_-]+)/g,
      decoration: match => Decoration.mark({
        class: 'cm-tag text-blue-400 bg-blue-900/20 px-1.5 py-0.5 rounded cursor-pointer hover:bg-blue-900/40 hover:underline transition-colors',
        attributes: { 'data-tag': match[0] } // captures the full #tag
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

    const templateShortcut = keymap.of([
      {
        key: "Alt-t",
        run: (view) => {
          if (onOpenTemplate) onOpenTemplate(view);
          return true; // Tells CodeMirror we handled the keystroke
        }
      }
    ]);

    return [
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      syntaxHighlighting(customMarkdownStyle),
      wikiLinkPlugin,
      tagPlugin,
      templateShortcut,
      EditorView.lineWrapping,
      EditorView.domEventHandlers({
        click(event) {
          // Check for WikiLinks
          const linkEl = event.target.closest('.cm-wiki-link');
          if (linkEl && linkEl.hasAttribute('data-target')) {
            event.preventDefault();
            onLinkClick(linkEl.getAttribute('data-target'));
            return true;
          }
          // Check for Tags
          const tagEl = event.target.closest('.cm-tag');
          if (tagEl && tagEl.hasAttribute('data-tag')) {
            event.preventDefault();
            onTagClick(tagEl.getAttribute('data-tag'));
            return true;
          }
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
  }, [onLinkClick]);

  return (
    <CodeMirror
      value={content}
      theme={vscodeDark}
      extensions={editorExtensions}
      onChange={onChange}
      className="text-lg powder-editor pb-20"
      basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
    />
  );
}