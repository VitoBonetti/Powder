import { useRef, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import {
  Info, Lightbulb, AlertTriangle, AlertCircle, CheckCircle, Flame, Pencil, Bug, Bandage,
  Braces, NotepadText, Speech, ChevronsLeftRightEllipsis, NotebookText, BookOpenCheck,
  BookmarkCheck, Copy, Check
} from 'lucide-react';
import mermaid from 'mermaid';
import toast from 'react-hot-toast';
import { BACKEND_URL, getApiUrl } from '../config';

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
    mermaid.initialize({
      startOnLoad: false,
      theme: theme === 'dark' ? 'dark' : 'neutral',
      fontFamily: 'inherit'
    });

    if (ref.current && chart) {
      const id = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
      mermaid.render(id, chart).then(({ svg }) => {
        if (ref.current) {
          ref.current.innerHTML = svg;
          // FIX: Force the rendered SVG to be responsive so it doesn't get cut off
          const svgElement = ref.current.querySelector('svg');
          if (svgElement) {
            svgElement.style.maxWidth = '100%';
            svgElement.style.height = 'auto';
          }
        }
      }).catch(err => console.error("Mermaid error:", err));
    }
  }, [chart, theme]);
  return <div ref={ref} className="my-6 flex justify-center overflow-x-auto w-full" />;
};

// --- ENHANCED CODE BLOCK WITH COPY ---
const CodeBlock = ({ children, className, theme }) => {
  const [copied, setCopied] = useState(false);
  const codeContent = String(children).replace(/\n$/, '');

  const handleCopy = () => {
    navigator.clipboard.writeText(codeContent);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-4">
      <button
        onClick={handleCopy}
        className={`absolute right-2 top-2 p-1.5 rounded-md border transition-all opacity-0 group-hover:opacity-100 z-10 ${
          theme === 'dark' 
          ? 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white' 
          : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900 shadow-sm'
        }`}
        title="Copy code"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      {/* FIX: Force smaller padding and tighter line height on the pre container */}
      <pre className="m-0 px-4 py-3 text-[13px] leading-snug overflow-x-auto rounded-lg">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
};

export default function Preview({ content, onLinkClick, onTagClick, theme = 'dark' }) {
  return (
    // FIX: Removed prose-lg for smaller base text.
    // Added prose-p modifiers for tighter line spacing.
    // Added prose-h5 modifiers to style H5 elements.
    <div className="prose dark:prose-invert max-w-none pb-20 transition-colors prose-p:leading-normal prose-p:my-3 prose-h5:text-lg prose-h5:font-semibold prose-h5:mt-6 prose-h5:mb-2 prose-h5:text-slate-800 dark:prose-h5:text-gray-200 prose-ul:my-2 prose-li:my-0.5 text-[15px]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkObsidianCallouts]}
        components={{
          div({ node, className, children, ...props }) {
            if (className && className.includes('callout')) {
              const type = props['data-callout-type'] || node?.properties?.['data-callout-type'] || 'info';
              const title = props['data-callout-title'] || node?.properties?.['data-callout-title'] || 'Info';

              let Icon = Info;
              let colors = "border-blue-400 text-blue-700 bg-blue-50 dark:border-blue-500 dark:text-blue-400 dark:bg-blue-900/10";

              if (['note'].includes(type)) { Icon = Pencil; colors = "border-slate-400 text-slate-700 bg-slate-50 dark:border-slate-500 dark:text-slate-400 dark:bg-slate-900/10"; }
              else if (['vuln', 'bug', 'bugs'].includes(type)) { Icon = Bug; colors = "border-red-400 text-red-700 bg-red-50 dark:border-red-500 dark:text-red-300 dark:bg-red-500/10"; }
              else if (['rem', 'remediation', 'bugoff'].includes(type)) { Icon = Bandage; colors = "border-sky-400 text-sky-700 bg-sky-50 dark:border-sky-500 dark:text-sky-400 dark:bg-sky-900/10"; }
              else if (['tip', 'hint'].includes(type)) { Icon = Lightbulb; colors = "border-emerald-400 text-emerald-700 bg-emerald-50 dark:border-emerald-500 dark:text-emerald-400 dark:bg-emerald-900/10"; }
              else if (['important', 'abstract'].includes(type)) { Icon = AlertCircle; colors = "border-purple-400 text-purple-700 bg-purple-50 dark:border-purple-500 dark:text-purple-400 dark:bg-purple-900/10"; }
              else if (['warning', 'caution', 'attention'].includes(type)) { Icon = AlertTriangle; colors = "border-amber-400 text-amber-700 bg-amber-50 dark:border-amber-500 dark:text-amber-400 dark:bg-amber-900/10"; }
              else if (['danger', 'error'].includes(type)) { Icon = Flame; colors = "border-orange-400 text-orange-700 bg-orange-50 dark:border-orange-500 dark:text-orange-300 dark:bg-orange-500/10"; }
              else if (['success', 'check', 'done'].includes(type)) { Icon = CheckCircle; colors = "border-green-400 text-green-700 bg-green-50 dark:border-green-500 dark:text-green-400 dark:bg-green-900/10"; }

              else if (['metadata'].includes(type)) { Icon = Braces; colors = "border-fuchsia-400 text-fuchsia-700 bg-fuchsia-50 dark:border-fuchsia-500 dark:text-fuchsia-400 dark:bg-fuchsia-900/10"; }
              else if (['description'].includes(type)) { Icon = NotepadText; colors = "border-slate-400 text-slate-700 bg-slate-50 dark:border-slate-500 dark:text-slate-400 dark:bg-slate-900/10"; }
              else if (['usage'].includes(type)) { Icon = Speech; colors = "border-lime-400 text-lime-700 bg-lime-50 dark:border-lime-500 dark:text-lime-400 dark:bg-lime-900/10"; }
              else if (['code'].includes(type)) { Icon = ChevronsLeftRightEllipsis; colors = "border-gray-400 text-gray-700 bg-gray-50 dark:border-gray-500 dark:text-gray-400 dark:bg-gray-900/10"; }
              else if (['examples'].includes(type)) { Icon = BookOpenCheck; colors = "border-indigo-400 text-indigo-700 bg-indigo-50 dark:border-indigo-500 dark:text-indigo-400 dark:bg-indigo-900/10"; }
              else if (['observations'].includes(type)) { Icon = NotebookText; colors = "border-zinc-400 text-zinc-700 bg-zinc-50 dark:border-zinc-500 dark:text-zinc-400 dark:bg-zinc-900/10"; }
              else if (['references'].includes(type)) { Icon = BookmarkCheck; colors = "border-teal-400 text-teal-700 bg-teal-50 dark:border-teal-500 dark:text-teal-400 dark:bg-teal-900/10"; }

              return (
                <div className={`my-5 border-l-4 rounded-r-lg px-4 py-3 ${colors} transition-colors`}>
                  <div className="flex items-center gap-2 font-bold mb-1.5 text-sm">
                    <Icon className="w-4 h-4" />
                    <span>{title}</span>
                  </div>
                  <div className="text-slate-700 dark:text-gray-300 prose-p:my-1 prose-p:leading-normal transition-colors text-sm">
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
            // If ReactMarkdown stripped the href (which shouldn't happen now), fail gracefully
            if (!href) return <a {...props}>{children}</a>;

            let decodedHref = href;
            try {
              decodedHref = decodeURI(href);
            } catch (e) {
              // Fallback if URI is somehow malformed
            }

            // 1. Handle Wiki Links via safe relative query paths
            if (decodedHref.startsWith('./?powder_wiki=')) {
              const targetName = decodeURIComponent(decodedHref.replace('./?powder_wiki=', ''));
              return (
                <a
                  {...props}
                  href={href}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onLinkClick(targetName); }}
                  className="text-purple-600 dark:text-purple-400 font-medium no-underline hover:underline cursor-pointer bg-purple-100 dark:bg-purple-900/20 px-1 rounded transition-colors"
                >
                  {children}
                </a>
              );
            }

            // 2. Handle Tags
            if (decodedHref.startsWith('./?powder_tag=')) {
              const targetTag = decodeURIComponent(decodedHref.replace('./?powder_tag=', ''));
              return (
                <span
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTagClick(`#${targetTag}`); }}
                  className="text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/20 px-1.5 py-0.5 rounded cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-900/40 hover:underline transition-colors text-sm"
                >
                  #{targetTag}
                </span>
              );
            }

            // 3. Handle standard internal/local files
            const isExternal = decodedHref.startsWith('http') || decodedHref.startsWith('mailto:') || decodedHref.startsWith('tel:');

            if (!isExternal) {
               return (
                  <a
                    {...props}
                    href={href}
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      try {
                        const res = await fetch(getApiUrl(`/resolve-link?target=${encodeURIComponent(decodedHref)}`), { credentials: 'include' });
                        if (res.ok) {
                           const data = await res.json();
                           onLinkClick(data.path);
                        } else {
                           onLinkClick(decodedHref);
                        }
                      } catch (err) {
                        console.error("Link resolution failed", err);
                        onLinkClick(decodedHref);
                      }
                    }}
                    className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    {children}
                  </a>
               );
            }

            // 4. Fallback for real external web links
            return <a {...props} href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 dark:text-blue-400 hover:underline">{children}</a>;
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

            const isBlock = inline === false || (inline === undefined && (match || String(children).includes('\n')));

            if (isBlock && isMermaid) {
              return <MermaidDiagram chart={String(children).replace(/\n$/, '')} theme={theme} />;
            }

            if (isBlock) {
              return <CodeBlock children={children} className={className} theme={theme} />;
            }

            return (
              <code
                className="bg-slate-100 dark:bg-gray-800/80 text-pink-600 dark:text-pink-400 px-1.5 py-0.5 rounded font-mono text-[0.85em] before:content-none after:content-none"
                {...props}
              >
                {children}
              </code>
            );
          }
        }}
      >
        {content
          // Using safe relative paths bypassing ReactMarkdown's security sanitizer
          .replace(/\[\[(.*?)\]\]/g, (match, noteName) => `[${noteName}](./?powder_wiki=${encodeURIComponent(noteName)})`)
          .replace(/(?<![\w])#([a-zA-Z0-9_-]+)/g, (match, tag) => `[${match}](./?powder_tag=${tag})`)
        }
      </ReactMarkdown>
    </div>
  );
}