import { useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import { Info, Lightbulb, AlertTriangle, AlertCircle, CheckCircle, Flame, Pencil, Bug, Bandage, Braces, NotepadText, Speech, ChevronsLeftRightEllipsis, NotebookText, BookOpenCheck, BookmarkCheck } from 'lucide-react';
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
          const match = textNode.value.match(/^\[!(\w+)\]([^\n]*)/i);
          if (match) {
            const type = match[1].toLowerCase();
            const title = match[2].trim() || type.charAt(0).toUpperCase() + type.slice(1);
            textNode.value = textNode.value.replace(/^\[!\w+\][^\n]*\n?/i, '');
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
const MermaidDiagram = ({ chart, theme }) => {
  const ref = useRef(null);
  useEffect(() => {
    mermaid.initialize({ startOnLoad: false, theme: theme === 'dark' ? 'dark' : 'default' });
    if (ref.current && chart) {
      const id = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
      mermaid.render(id, chart).then(({ svg }) => {
        if (ref.current) ref.current.innerHTML = svg;
      }).catch(err => console.error("Mermaid error:", err));
    }
  }, [chart, theme]);
  return <div ref={ref} className="my-6 flex justify-center" />;
};

export default function Preview({ content, onLinkClick, onTagClick, theme = 'dark' }) {
  return (
    // dark:prose-invert handles standard markdown colors beautifully
    <div className="prose dark:prose-invert prose-lg max-w-none pb-20 transition-colors">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkObsidianCallouts]}
        components={{
          div({ node, className, children, ...props }) {
            if (className && className.includes('callout')) {
              const type = props['data-callout-type'] || node?.properties?.['data-callout-type'] || 'info';
              const title = props['data-callout-title'] || node?.properties?.['data-callout-title'] || 'Info';

              let Icon = Info;
              let colors = "border-blue-400 text-blue-700 bg-blue-50 dark:border-blue-500 dark:text-blue-400 dark:bg-blue-900/10"; // Default

              if (['note'].includes(type)) { Icon = Pencil; colors = "border-slate-400 text-slate-700 bg-slate-50 dark:border-slate-500 dark:text-slate-400 dark:bg-slate-900/10"; }
              else if (['vuln', 'bug', 'bugs'].includes(type)) { Icon = Bug; colors = "border-red-400 text-red-700 bg-red-50 dark:border-red-500 dark:text-red-300 dark:bg-red-500/10"; }
              else if (['rem', 'remediation', 'bugoff'].includes(type)) { Icon = Bandage; colors = "border-sky-400 text-sky-700 bg-sky-50 dark:border-sky-500 dark:text-sky-400 dark:bg-sky-900/10"; }
              else if (['tip', 'hint'].includes(type)) { Icon = Lightbulb; colors = "border-emerald-400 text-emerald-700 bg-emerald-50 dark:border-emerald-500 dark:text-emerald-400 dark:bg-emerald-900/10"; }
              else if (['important', 'abstract'].includes(type)) { Icon = AlertCircle; colors = "border-purple-400 text-purple-700 bg-purple-50 dark:border-purple-500 dark:text-purple-400 dark:bg-purple-900/10"; }
              else if (['warning', 'caution', 'attention'].includes(type)) { Icon = AlertTriangle; colors = "border-amber-400 text-amber-700 bg-amber-50 dark:border-amber-500 dark:text-amber-400 dark:bg-amber-900/10"; }
              else if (['danger', 'error'].includes(type)) { Icon = Flame; colors = "border-orange-400 text-orange-700 bg-orange-50 dark:border-orange-500 dark:text-orange-300 dark:bg-orange-500/10"; }
              else if (['success', 'check', 'done'].includes(type)) { Icon = CheckCircle; colors = "border-green-400 text-green-700 bg-green-50 dark:border-green-500 dark:text-green-400 dark:bg-green-900/10"; }

              // Templates
              else if (['metadata'].includes(type)) { Icon = Braces; colors = "border-fuchsia-400 text-fuchsia-700 bg-fuchsia-50 dark:border-fuchsia-500 dark:text-fuchsia-400 dark:bg-fuchsia-900/10"; }
              else if (['description'].includes(type)) { Icon = NotepadText; colors = "border-slate-400 text-slate-700 bg-slate-50 dark:border-slate-500 dark:text-slate-400 dark:bg-slate-900/10"; }
              else if (['usage'].includes(type)) { Icon = Speech; colors = "border-lime-400 text-lime-700 bg-lime-50 dark:border-lime-500 dark:text-lime-400 dark:bg-lime-900/10"; }
              else if (['code'].includes(type)) { Icon = ChevronsLeftRightEllipsis; colors = "border-gray-400 text-gray-700 bg-gray-50 dark:border-gray-500 dark:text-gray-400 dark:bg-gray-900/10"; }
              else if (['examples'].includes(type)) { Icon = BookOpenCheck; colors = "border-indigo-400 text-indigo-700 bg-indigo-50 dark:border-indigo-500 dark:text-indigo-400 dark:bg-indigo-900/10"; }
              else if (['observations'].includes(type)) { Icon = NotebookText; colors = "border-zinc-400 text-zinc-700 bg-zinc-50 dark:border-zinc-500 dark:text-zinc-400 dark:bg-zinc-900/10"; }
              else if (['references'].includes(type)) { Icon = BookmarkCheck; colors = "border-teal-400 text-teal-700 bg-teal-50 dark:border-teal-500 dark:text-teal-400 dark:bg-teal-900/10"; }

              return (
                <div className={`my-6 border-l-4 rounded-r-lg px-4 py-3 ${colors} transition-colors`}>
                  <div className="flex items-center gap-2 font-bold mb-2">
                    <Icon className="w-5 h-5" />
                    <span>{title}</span>
                  </div>
                  <div className="text-slate-700 dark:text-gray-300 prose-p:my-1 prose-p:leading-relaxed transition-colors">
                    {children}
                  </div>
                </div>
              );
            }
            return <div className={className} {...props}>{children}</div>;
          },
          blockquote({ node, children, ...props }) {
            return <blockquote className="border-l-4 border-slate-300 dark:border-gray-600 pl-4 py-1 text-slate-600 dark:text-gray-400 italic bg-slate-50 dark:bg-gray-800/30 rounded-r my-4 transition-colors" {...props}>{children}</blockquote>;
          },
          a({node, href, children, ...props}) {
            if (href?.startsWith('#wiki/')) {
              const targetName = decodeURIComponent(href.replace('#wiki/', ''));
              return (
                <a href={href} onClick={(e) => { e.preventDefault(); onLinkClick(targetName); }} className="text-purple-600 dark:text-purple-400 font-medium no-underline hover:underline cursor-pointer bg-purple-100 dark:bg-purple-900/20 px-1 rounded transition-colors">
                  {children}
                </a>
              );
            }
            if (href?.startsWith('#tag/')) {
              const targetTag = decodeURIComponent(href.replace('#tag/', ''));
              return (
                <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTagClick(`#${targetTag}`); }} className="text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/20 px-1.5 py-0.5 rounded cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-900/40 hover:underline transition-colors">
                  #{targetTag}
                </span>
              );
            }
            return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 dark:text-blue-400 hover:underline" {...props}>{children}</a>;
          },
          img({node, src, alt, ...props}) {
            let fullSrc = src;
            if (!src.startsWith('http') && !src.startsWith('data:')) {
              const cleanBase = (BACKEND_URL || '').replace(/\/+$/, '');
              const cleanSrc = src.replace(/^\/+/, '');
              fullSrc = cleanBase ? `${cleanBase}/${cleanSrc}` : `/${cleanSrc}`;
            }
            return <img src={fullSrc} alt={alt} className="rounded-lg shadow-md border border-slate-200 dark:border-gray-700 max-w-full h-auto my-6 transition-colors" {...props} />;
          },
          code({node, inline, className, children, ...props}) {
            const match = /language-(\w+)/.exec(className || '');
            const isMermaid = match && match[1] === 'mermaid';
            if (!inline && isMermaid) { return <MermaidDiagram chart={String(children).replace(/\n$/, '')} theme={theme} />; }
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