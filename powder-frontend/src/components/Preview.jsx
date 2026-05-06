import { useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import { Info, Lightbulb, AlertTriangle, AlertCircle, CheckCircle, Flame, Pencil, Bug, Bandage } from 'lucide-react';
import mermaid from 'mermaid';
import { BACKEND_URL } from '../config';

// --- CUSTOM PLUGIN: OBSIDIAN CALLOUTS ---
function remarkObsidianCallouts() {
  return (tree) => {
    visit(tree, 'blockquote', (node) => {
      const firstChild = node.children[0];
      if (firstChild && firstChild.type === 'paragraph') {
        const textNode = firstChild.children[0];
        if (textNode && textNode.type === 'text') {
          // Check for [!type] or [!type] Title
          const match = textNode.value.match(/^\[!(\w+)\]([^\n]*)/i);
          if (match) {
            const type = match[1].toLowerCase();
            const title = match[2].trim() || type.charAt(0).toUpperCase() + type.slice(1);

            // Strip the [!type] tag from the actual text
            textNode.value = textNode.value.replace(/^\[!\w+\][^\n]*\n?/i, '');

            // Convert the blockquote into a custom div with our data attributes
            node.data = node.data || {};
            node.data.hName = 'div';
            node.data.hProperties = {
              className: `callout callout-${type}`,
              'data-callout-type': type,
              'data-callout-title': title
            };
          }
        }
      }
    });
  };
}

// --- MERMAID DIAGRAMS ---
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

export default function Preview({ content, onLinkClick, onTagClick }) {
  return (
    <div className="prose prose-invert prose-lg max-w-none pb-20">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkObsidianCallouts]} // <-- Using our new custom plugin!
        components={{
          // --- CUSTOM CALLOUT RENDERER ---
          div({ node, className, children, ...props }) {
            if (className && className.includes('callout')) {
              const type = props['data-callout-type'] || node?.properties?.['data-callout-type'] || 'info';
              const title = props['data-callout-title'] || node?.properties?.['data-callout-title'] || 'Info';

              let Icon = Info;
              let colors = "border-blue-500 text-blue-400 bg-blue-900/10"; // Default (Info/Note)

              if (['note'].includes(type)) { Icon = Pencil; colors = "border-olive-500 text-olive-400 bg-olive-900/10"; }
              else if (['vuln', 'bug', 'bugs'].includes(type)) { Icon = Bug; colors = "border-red-500 text-red-300 bg-red-500/10"; }
              else if (['rem', 'remediation', 'bugoff' ].includes(type)) { Icon = Bandage; colors = "border-sky-500 text-sky-400 bg-sky-900/10"; }
              else if (['tip', 'hint'].includes(type)) { Icon = Lightbulb; colors = "border-emerald-500 text-emerald-400 bg-emerald-900/10"; }
              else if (['important', 'abstract'].includes(type)) { Icon = AlertCircle; colors = "border-purple-500 text-purple-400 bg-purple-900/10"; }
              else if (['warning', 'caution', 'attention'].includes(type)) { Icon = AlertTriangle; colors = "border-amber-500 text-amber-400 bg-amber-900/10"; }
              else if (['danger', 'error', 'bug'].includes(type)) { Icon = Flame; colors = "border-orange-500 text-orange-300 bg-orange-500/10"; }
              else if (['success', 'check', 'done'].includes(type)) { Icon = CheckCircle; colors = "border-green-500 text-green-400 bg-green-900/10"; }

              return (
                <div className={`my-6 border-l-4 rounded-r-lg px-4 py-3 ${colors}`}>
                  <div className="flex items-center gap-2 font-bold mb-2">
                    <Icon className="w-5 h-5" />
                    <span>{title}</span>
                  </div>
                  <div className="text-gray-300 prose-p:my-1 prose-p:leading-relaxed">
                    {children}
                  </div>
                </div>
              );
            }
            return <div className={className} {...props}>{children}</div>;
          },
          // --- NORMAL BLOCKQUOTES ---
          blockquote({ node, children, ...props }) {
            return <blockquote className="border-l-4 border-gray-600 pl-4 py-1 text-gray-400 italic bg-gray-800/30 rounded-r my-4" {...props}>{children}</blockquote>;
          },
          // --- WIKILINKS & TAGS ---
          a({node, href, children, ...props}) {
            if (href?.startsWith('#wiki/')) {
              const targetName = decodeURIComponent(href.replace('#wiki/', ''));
              return (
                <a href={href} onClick={(e) => { e.preventDefault(); onLinkClick(targetName); }} className="text-purple-400 font-medium no-underline hover:underline cursor-pointer bg-purple-900/20 px-1 rounded transition-colors">
                  {children}
                </a>
              );
            }
            if (href?.startsWith('#tag/')) {
              const targetTag = decodeURIComponent(href.replace('#tag/', ''));
              return (
                <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTagClick(`#${targetTag}`); }} className="text-blue-400 bg-blue-900/20 px-1.5 py-0.5 rounded cursor-pointer hover:bg-blue-900/40 hover:underline transition-colors">
                  #{targetTag}
                </span>
              );
            }
            return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline" {...props}>{children}</a>;
          },
          // --- IMAGES ---
          img({node, src, alt, ...props}) {
            const fullSrc = src.startsWith('http') ? src : `${BACKEND_URL}/${src}`;
            return <img src={fullSrc} alt={alt} className="rounded-lg shadow-md border border-gray-700 max-w-full h-auto my-6" {...props} />;
          },
          // --- CODE & MERMAID ---
          code({node, inline, className, children, ...props}) {
            const match = /language-(\w+)/.exec(className || '');
            const isMermaid = match && match[1] === 'mermaid';
            if (!inline && isMermaid) { return <MermaidDiagram chart={String(children).replace(/\n$/, '')} />; }
            return <code className={className} {...props}>{children}</code>;
          }
        }}
      >
        {content
          .replace(/\[\[(.*?)\]\]/g, (match, noteName) => `[[${noteName}]](#wiki/${encodeURIComponent(noteName)})`)
          .replace(/(?<![\w])#([a-zA-Z0-9_-]+)/g, (match, tag) => `[#${tag}](#tag/${tag})`)
        }
      </ReactMarkdown>
    </div>
  );
}