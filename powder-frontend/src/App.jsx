import { useState } from 'react';
import Sidebar from './Sidebar';
import CodeMirror from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// 1. Import our new tools
import ReactMarkdown from 'react-markdown';
import { Eye, Edit3 } from 'lucide-react';

const customMarkdownStyle = HighlightStyle.define([
  { tag: t.heading1, fontSize: "2.5em", fontWeight: "bold", color: "#60a5fa" },
  { tag: t.heading2, fontSize: "2em", fontWeight: "bold", color: "#93c5fd" },
  { tag: t.heading3, fontSize: "1.5em", fontWeight: "bold", color: "#e2e8f0" },
  { tag: t.heading4, fontSize: "1.2em", fontWeight: "bold", color: "#e2e8f0" },
  { tag: t.strong, fontWeight: "bold", color: "#ffffff" },
  { tag: t.emphasis, fontStyle: "italic", color: "#cbd5e1" },
  { tag: t.strikethrough, textDecoration: "line-through" },
]);

function App() {
  const [content, setContent] = useState("# Powder Vault\n\n## The Engine is Upgraded\n\nYou now have full width and a toggle switch. Click the Eye icon in the top right to switch to Reading Mode!");

  // 2. State to track our current mode
  const [isPreview, setIsPreview] = useState(false);

  return (
    <div className="flex h-screen bg-[#0d1117] text-white overflow-hidden">

      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden relative">

        {/* 3. The Top Bar & Toggle Button */}
        <div className="h-14 border-b border-gray-800 flex items-center justify-end px-6 bg-[#0d1117] z-10">
          <button
            onClick={() => setIsPreview(!isPreview)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
          >
            {isPreview ? (
              <><Edit3 className="w-4 h-4" /> Edit Mode</>
            ) : (
              <><Eye className="w-4 h-4" /> Reading Mode</>
            )}
          </button>
        </div>

        {/* 4. The Editor Container (Now utilizing full width!) */}
        <div className="flex-1 overflow-y-auto px-8 py-10">
          {/* We swapped max-w-3xl for w-full to use all available horizontal space */}
          <div className="w-full max-w-6xl mx-auto h-full">

            {isPreview ? (
              // THE READING VIEW
              <div className="prose prose-invert prose-lg max-w-none pb-20">
                <ReactMarkdown>{content}</ReactMarkdown>
              </div>
            ) : (
              // THE EDITING VIEW
              <CodeMirror
                value={content}
                theme={vscodeDark}
                extensions={[
                  markdown({ base: markdownLanguage, codeLanguages: languages }),
                  syntaxHighlighting(customMarkdownStyle)
                ]}
                onChange={(value) => setContent(value)}
                className="text-lg powder-editor pb-20"
                basicSetup={{
                  lineNumbers: false,
                  foldGutter: false,
                  highlightActiveLine: false,
                }}
              />
            )}

          </div>
        </div>
      </main>

    </div>
  )
}

export default App