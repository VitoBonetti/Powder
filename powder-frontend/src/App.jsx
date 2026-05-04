import { useState, useEffect, useRef } from 'react';
import Sidebar from './Sidebar';
import CodeMirror from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import ReactMarkdown from 'react-markdown';
import { Eye, Edit3, CheckCircle2, Loader2 } from 'lucide-react';
import mermaid from 'mermaid'; // <-- New Import

const customMarkdownStyle = HighlightStyle.define([
  { tag: t.heading1, fontSize: "2.5em", fontWeight: "bold", color: "#60a5fa" },
  { tag: t.heading2, fontSize: "2em", fontWeight: "bold", color: "#93c5fd" },
  { tag: t.heading3, fontSize: "1.5em", fontWeight: "bold", color: "#e2e8f0" },
  { tag: t.heading4, fontSize: "1.2em", fontWeight: "bold", color: "#e2e8f0" },
  { tag: t.strong, fontWeight: "bold", color: "#ffffff" },
  { tag: t.emphasis, fontStyle: "italic", color: "#cbd5e1" },
  { tag: t.strikethrough, textDecoration: "line-through" },
]);

// --- NEW HELPER: Renders Mermaid Charts ---
const MermaidDiagram = ({ chart }) => {
  const ref = useRef(null);
  useEffect(() => {
    mermaid.initialize({ startOnLoad: false, theme: 'dark' });
    if (ref.current && chart) {
      // Create a unique ID for the diagram
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
  const [activeFile, setActiveFile] = useState(null);
  const [saveStatus, setSaveStatus] = useState("idle");

  useEffect(() => {
    if (!activeFile) return;
    fetch(`http://127.0.0.1:8000/api/notes/${activeFile}`)
      .then(res => res.json())
      .then(data => {
        setContent(data.content);
        setSaveStatus("saved");
      })
      .catch(err => console.error("Error loading note:", err));
  }, [activeFile]);

  useEffect(() => {
    if (!activeFile || saveStatus === "idle") return;
    setSaveStatus("saving");
    const delayDebounceFn = setTimeout(() => {
      fetch(`http://127.0.0.1:8000/api/notes/${activeFile}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content })
      })
      .then(() => setSaveStatus("saved"))
      .catch(err => console.error("Error saving note:", err));
    }, 1000);
    return () => clearTimeout(delayDebounceFn);
  }, [content, activeFile]);

  return (
    <div className="flex h-screen bg-[#0d1117] text-white overflow-hidden">

      <Sidebar onFileSelect={setActiveFile} />

      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="h-14 border-b border-gray-800 flex items-center justify-between px-6 bg-[#0d1117] z-10">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-300">
              {activeFile ? activeFile : "No file selected"}
            </span>
            {saveStatus === "saving" && <span className="flex items-center text-xs text-blue-400"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Saving...</span>}
            {saveStatus === "saved" && <span className="flex items-center text-xs text-green-500"><CheckCircle2 className="w-3 h-3 mr-1" /> Saved</span>}
          </div>

          <button
            onClick={() => setIsPreview(!isPreview)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
          >
            {isPreview ? <><Edit3 className="w-4 h-4" /> Edit Mode</> : <><Eye className="w-4 h-4" /> Reading Mode</>}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-10">
          <div className="w-full max-w-6xl mx-auto h-full">

            {!activeFile ? (
              <div className="h-full flex items-center justify-center text-gray-500">
                Select a note from the sidebar to start writing.
              </div>
            ) : isPreview ? (
              <div className="prose prose-invert prose-lg max-w-none pb-20">
                <ReactMarkdown
                  // --- NEW: Intercept code blocks for Mermaid ---
                  components={{
                    code({node, inline, className, children, ...props}) {
                      const match = /language-(\w+)/.exec(className || '')
                      const isMermaid = match && match[1] === 'mermaid';

                      if (!inline && isMermaid) {
                        return <MermaidDiagram chart={String(children).replace(/\n$/, '')} />
                      }

                      return <code className={className} {...props}>{children}</code>
                    }
                  }}
                >
                  {content}
                </ReactMarkdown>
              </div>
            ) : (
              <CodeMirror
                value={content}
                theme={vscodeDark}
                extensions={[
                  markdown({ base: markdownLanguage, codeLanguages: languages }),
                  syntaxHighlighting(customMarkdownStyle)
                ]}
                onChange={(value) => setContent(value)}
                className="text-lg powder-editor pb-20"
                basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
              />
            )}

          </div>
        </div>
      </main>
    </div>
  )
}

export default App