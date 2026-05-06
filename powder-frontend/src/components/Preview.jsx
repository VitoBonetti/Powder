import { useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import mermaid from 'mermaid';
import { BACKEND_URL } from '../config';
import remarkGfm from 'remark-gfm';
import { remarkAlert } from 'remark-github-blockquote-alert';

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

export default function Preview({ content, onLinkClick, onTagClick }) { // <-- Added onTagClick here
  return (
    <div className="prose prose-invert prose-lg max-w-none pb-20">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkAlert]}
        components={{
          a({node, href, children, ...props}) {
            // 1. WikiLinks
            if (href?.startsWith('#wiki/')) {
              const targetName = decodeURIComponent(href.replace('#wiki/', ''));
              return (
                <a
                  href={href}
                  onClick={(e) => {
                    e.preventDefault();
                    onLinkClick(targetName);
                  }}
                  className="text-purple-400 font-medium no-underline hover:underline cursor-pointer bg-purple-900/20 px-1 rounded transition-colors"
                >
                  {children}
                </a>
              );
            }
            // 2. Tags (NEW!)
            if (href?.startsWith('#tag/')) {
              const targetTag = decodeURIComponent(href.replace('#tag/', ''));
              return (
                <span
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onTagClick(`#${targetTag}`); // Opens the Search Modal!
                  }}
                  className="text-blue-400 bg-blue-900/20 px-1.5 py-0.5 rounded cursor-pointer hover:bg-blue-900/40 hover:underline transition-colors"
                >
                  #{targetTag}
                </span>
              );
            }
            // 3. Normal Web Links
            return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline" {...props}>{children}</a>;
          },
          img({node, src, alt, ...props}) {
            const fullSrc = src.startsWith('http') ? src : `${BACKEND_URL}/${src}`;
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
        {content
          .replace(/\[\[(.*?)\]\]/g, (match, noteName) => `[[${noteName}]](#wiki/${encodeURIComponent(noteName)})`)
          .replace(/(?<![\w])#([a-zA-Z0-9_-]+)/g, (match, tag) => `[#${tag}](#tag/${tag})`)
        }
      </ReactMarkdown>
    </div>
  );
}