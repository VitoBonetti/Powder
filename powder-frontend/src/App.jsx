import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Sidebar from './Sidebar';
import CodeMirror from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import ReactMarkdown from 'react-markdown';
import { Eye, Edit3, CheckCircle2, Loader2, Search, FileText, X } from 'lucide-react';
import mermaid from 'mermaid';
import { EditorView, Decoration, ViewPlugin, MatchDecorator } from '@codemirror/view';

// --- 1. THE RESTORED CODEMIRROR WIKI-LINK PLUGIN ---
// We use a specific class 'cm-wiki-link' so we can accurately detect clicks in the editor
const wikiLinkDecorator = new MatchDecorator({
  regexp: /\[\[(.*?)\]\]/g,
  decoration: match => Decoration.mark({
    class: 'cm-wiki-link text-purple-400 underline cursor-pointer hover:text-purple-300 transition-colors bg-purple-900/20 px-1 rounded',
    attributes: { 'data-target': match[1] }
  })
});

const wikiLinkPlugin = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = wikiLinkDecorator.createDeco(view); }
  update(update) { this.decorations = wikiLinkDecorator.updateDeco(update, this.decorations); }
}, { decorations: v => v.decorations });

// Markdown Highlighting
const customMarkdownStyle = HighlightStyle.define([
  { tag: t.heading1, fontSize: "2.5em", fontWeight: "bold", color: "#60a5fa" },
  { tag: t.heading2, fontSize: "2em", fontWeight: "bold", color: "#93c5fd" },
  { tag: t.heading3, fontSize: "1.5em", fontWeight: "bold", color: "#e2e8f0" },
  { tag: t.heading4, fontSize: "1.2em", fontWeight: "bold", color: "#e2e8f0" },
  { tag: t.strong, fontWeight: "bold", color: "#ffffff" },
  { tag: t.emphasis, fontStyle: "italic", color: "#cbd5e1" },
  { tag: t.strikethrough, textDecoration: "line-through" },
]);

const MermaidDiagram = ({ chart }) => {
  const ref = useRef(null);
  useEffect(() => {
    mermaid.initialize({ startOnLoad: false, theme: 'dark' });
    if (ref.current && chart) {
      const id = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
      mermaid.render(id, chart).then(({ svg }) => {
        if (ref.current) ref.current.innerHTML = svg;
      }).catch(err => console.error("Mermaid error:", err));
    }
  }, [chart]);
  return <div ref={ref} className="my-6 flex justify-center" />;
};

function App() {
  const [content, setContent] = useState("");
  const [isPreview, setIsPreview] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle");

  const [activeFile, setActiveFile] = useState(null);
  const [openTabs, setOpenTabs] = useState([]);

  const isImageFile = activeFile && activeFile.match(/\.(png|jpe?g|gif|webp|svg)$/i);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const searchInputRef = useRef(null);
  const [lastSaved, setLastSaved] = useState(0);

  // --- 2. UNIFIED LINK OPENER ---
  const handleLinkClick = useCallback((target) => {
    fetch(`http://127.0.0.1:8000/api/resolve-link?target=${encodeURIComponent(target)}`)
      .then(res => res.json())
      .then(data => {
        const resolvedPath = data.path;
        if (!openTabs.includes(resolvedPath)) {
          setOpenTabs(prev => [...prev, resolvedPath]);
        }
        setActiveFile(resolvedPath);
      })
      .catch(err => console.error("Link resolution failed:", err));
  }, [openTabs]);

  const openFileInTab = (path) => {
    if (!openTabs.includes(path)) {
      setOpenTabs(prev => [...prev, path]);
    }
    setActiveFile(path);
  };

  const closeTab = (e, path) => {
    e.stopPropagation();
    const newTabs = openTabs.filter(t => t !== path);
    setOpenTabs(newTabs);
    if (activeFile === path) {
      if (newTabs.length > 0) setActiveFile(newTabs[newTabs.length - 1]);
      else setActiveFile(null);
    }
  };

  // Keyboard and Search Hooks
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setIsSearchOpen(true); }
      if (e.key === 'Escape') setIsSearchOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) searchInputRef.current.focus();
    else { setSearchQuery(""); setSearchResults([]); }
  }, [isSearchOpen]);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const delayDebounceFn = setTimeout(() => {
      fetch(`http://127.0.0.1:8000/api/search?q=${encodeURIComponent(searchQuery)}`)
        .then(res => res.json())
        .then(data => setSearchResults(data))
        .catch(err => console.error("Search failed:", err));
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  // Image Upload Logic
  const uploadImage = (file, view, pos) => {
    const placeholder = `\n![Uploading ${file.name}...]()\n`;
    view.dispatch({ changes: { from: pos, insert: placeholder } });
    const formData = new FormData();
    formData.append('file', file);
    fetch('http://127.0.0.1:8000/api/upload-asset', { method: 'POST', body: formData })
    .then(res => res.json())
    .then(data => {
      const currentDoc = view.state.doc.toString();
      const placeholderIndex = currentDoc.indexOf(placeholder);
      if (placeholderIndex !== -1) {
        view.dispatch({ from: placeholderIndex, to: placeholderIndex + placeholder.length, insert: `\n![${file.name}](${data.path})\n` });
      }
    }).catch(err => console.error("Image upload failed:", err));
  };

  // --- 3. DYNAMIC EDITOR EXTENSIONS ---
  // We wrap the extensions in useMemo so the click handler always has access to the latest tabs
  const editorExtensions = useMemo(() => [
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    syntaxHighlighting(customMarkdownStyle),
    wikiLinkPlugin, // <-- The restored editor decorator
    EditorView.domEventHandlers({
      // The robust click handler for edit mode
      click(event, view) {
        // Find the closest purple link element
        const el = event.target.closest('.cm-wiki-link');
        if (el && el.hasAttribute('data-target')) {
          event.preventDefault(); // Stop standard browser behavior
          handleLinkClick(el.getAttribute('data-target'));
          return true;
        }
        return false;
      },
      paste(event, view) {
        const items = event.clipboardData?.items;
        for (const item of items) {
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
  ], [handleLinkClick]); // Re-bind if handleLinkClick updates

  // Load and Save Effects
  useEffect(() => {
    if (!activeFile) { setContent(""); return; }
    if (isImageFile) { setSaveStatus("saved"); return; }

    setSaveStatus("saving"); // Indicate loading

    fetch(`http://127.0.0.1:8000/api/notes/${activeFile}`)
      .then(async res => {
        if (!res.ok) throw new Error("Phantom Note"); // Catch the 404 gracefully
        return res.json();
      })
      .then(data => {
        setContent(data.content);
        setSaveStatus("saved");
      })
      .catch(err => {
        // It's a new phantom note! Clear the editor so it's blank.
        setContent("");
        setSaveStatus("saved"); // Stop the loading spinner
      });
  }, [activeFile, isImageFile]);

  // --- BULLETPROOF AUTO-SAVE EFFECT ---
  useEffect(() => {
    if (!activeFile || saveStatus === "idle") return;

    setSaveStatus("saving");

    const delayDebounceFn = setTimeout(() => {
      fetch(`http://127.0.0.1:8000/api/notes/${activeFile}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The || "" ensures we NEVER send undefined to Python, preventing the 422!
        body: JSON.stringify({ content: content || "" })
      })
      .then(res => {
        if (!res.ok) throw new Error("Backend rejected save");
        setSaveStatus("saved");
        setLastSaved(Date.now()); // Trigger sidebar refresh
      })
      .catch(err => {
        console.error("Error saving note:", err);
        setSaveStatus("saved"); // Even if it fails, stop the infinite loading loop
      });
    }, 1000);

    return () => clearTimeout(delayDebounceFn);
  }, [content, activeFile]);

  return (
    <div className="flex h-screen bg-[#0d1117] text-white overflow-hidden">

      <Sidebar onFileSelect={openFileInTab} refreshTrigger={lastSaved} />

      <main className="flex-1 flex flex-col overflow-hidden relative">

        {openTabs.length > 0 && (
          <div className="flex bg-[#010409] border-b border-gray-800 overflow-x-auto flex-shrink-0 custom-scrollbar select-none">
            {openTabs.map(tab => (
              <div key={tab} onClick={() => setActiveFile(tab)} className={`group flex items-center gap-2 px-4 py-2 text-sm max-w-[200px] cursor-pointer border-r border-gray-800 transition-colors ${activeFile === tab ? 'bg-[#0d1117] text-gray-200 border-t-[3px] border-t-blue-500' : 'bg-[#010409] text-gray-500 hover:bg-[#11151b] border-t-[3px] border-t-transparent'}`}>
                <span className="truncate" title={tab}>{tab.split('/').pop()}</span>
                <button onClick={(e) => closeTab(e, tab)} className="p-0.5 rounded-md text-gray-600 hover:bg-gray-700 hover:text-white opacity-0 group-hover:opacity-100 transition-all"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}

        <div className="h-14 border-b border-gray-800 flex items-center justify-between px-6 bg-[#0d1117] z-10 flex-shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-300">{activeFile ? activeFile : "No file selected"}</span>
            {saveStatus === "saving" && <span className="flex items-center text-xs text-blue-400"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Saving...</span>}
            {saveStatus === "saved" && <span className="flex items-center text-xs text-green-500"><CheckCircle2 className="w-3 h-3 mr-1" /> Saved</span>}
          </div>

          <div className="flex items-center gap-4">
            <button onClick={() => setIsSearchOpen(true)} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-white bg-[#161b22] border border-gray-700 hover:border-gray-500 rounded-md transition-colors"><Search className="w-3.5 h-3.5" /> <span>Search...</span><kbd className="hidden sm:inline-block bg-gray-800 border border-gray-700 px-1.5 rounded text-[10px] ml-2">Ctrl K</kbd></button>
            <button onClick={() => setIsPreview(!isPreview)} className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors">{isPreview ? <><Edit3 className="w-4 h-4" /> Edit Mode</> : <><Eye className="w-4 h-4" /> Reading Mode</>}</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-10">
          <div className="w-full max-w-6xl mx-auto h-full">
            {!activeFile ? (
              <div className="h-full flex items-center justify-center text-gray-500">Select a note from the sidebar to start writing.</div>
            ) : isImageFile ? (
              <div className="h-full flex flex-col items-center justify-center pb-20">
                <div className="bg-[#161b22] p-4 rounded-xl border border-gray-800 shadow-2xl max-w-4xl w-full flex justify-center"><img src={`http://127.0.0.1:8000/${activeFile}`} alt={activeFile} className="max-w-full max-h-[70vh] object-contain rounded-md" /></div>
                <p className="mt-4 text-gray-500 text-sm font-mono">{activeFile}</p>
              </div>
            ) : isPreview ? (
              <div className="prose prose-invert prose-lg max-w-none pb-20">
                {/* --- 4. THE BULLETPROOF MARKDOWN RENDERER --- */}
                <ReactMarkdown
                  components={{
                    a({node, href, children, ...props}) {
                      // We intercept the safe #wiki/ format
                      if (href?.startsWith('#wiki/')) {
                        const targetName = decodeURIComponent(href.replace('#wiki/', ''));
                        return (
                          <a
                            href={href}
                            onClick={(e) => {
                              e.preventDefault(); // Absolutely block browser navigation
                              handleLinkClick(targetName);
                            }}
                            className="text-purple-400 font-medium no-underline hover:underline cursor-pointer bg-purple-900/20 px-1 rounded transition-colors"
                          >
                            {children}
                          </a>
                        );
                      }
                      return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline" {...props}>{children}</a>;
                    },
                    img({node, src, alt, ...props}) {
                      const fullSrc = src.startsWith('http') ? src : `http://127.0.0.1:8000/${src}`;
                      return <img src={fullSrc} alt={alt} className="rounded-lg shadow-md border border-gray-700 max-w-full h-auto my-6" {...props} />;
                    },
                    code({node, inline, className, children, ...props}) {
                      const match = /language-(\w+)/.exec(className || '');
                      const isMermaid = match && match[1] === 'mermaid';
                      if (!inline && isMermaid) { return <MermaidDiagram chart={String(children).replace(/\n$/, '')} />; }
                      return <code className={className} {...props}>{children}</code>;
                    }
                  }}
                >
                  {/* Safely encode the URL component to survive spaces! */}
                  {content.replace(/\[\[(.*?)\]\]/g, (match, noteName) => `[[${noteName}]](#wiki/${encodeURIComponent(noteName)})`)}
                </ReactMarkdown>
              </div>
            ) : (
              <CodeMirror
                value={content}
                theme={vscodeDark}
                extensions={editorExtensions} // <-- Using the dynamically bound extensions
                onChange={(value) => setContent(value)}
                className="text-lg powder-editor pb-20"
                basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
              />
            )}
          </div>
        </div>
      </main>

      {/* Global Search Modal */}
      {isSearchOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center pt-[10vh] px-4 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setIsSearchOpen(false)} />
          <div className="relative bg-[#161b22] border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden">
            <div className="flex items-center px-4 py-4 border-b border-gray-800"><Search className="w-5 h-5 text-gray-500 mr-3" /><input ref={searchInputRef} type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search your vault..." className="flex-1 bg-transparent border-none text-gray-100 text-lg placeholder-gray-500 focus:outline-none focus:ring-0" /><kbd className="hidden sm:inline-block text-gray-500 text-xs px-2 py-1 bg-gray-900 border border-gray-800 rounded">ESC to close</kbd></div>
            <div className="max-h-[60vh] overflow-y-auto">
              {searchQuery && searchResults.length === 0 && <div className="p-8 text-center text-gray-500">No results found for "{searchQuery}"</div>}
              {searchResults.map((result, idx) => (
                <div key={idx} onClick={() => { openFileInTab(result.path); setIsSearchOpen(false); }} className="group flex flex-col px-4 py-3 border-b border-gray-800/50 hover:bg-blue-900/20 cursor-pointer transition-colors"><div className="flex items-center text-sm font-medium text-blue-400 mb-1"><FileText className="w-4 h-4 mr-2" />{result.path}</div><div className="text-xs text-gray-400 pl-6 line-clamp-1 italic">{result.snippet}</div></div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App