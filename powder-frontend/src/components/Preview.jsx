import { useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import mermaid from 'mermaid';
import { BACKEND_URL } from '../config';

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

export default function Preview({ content, onLinkClick }) {
  return (
    <div className="prose prose-invert prose-lg max-w-none pb-20">
      <ReactMarkdown
        components={{
          a({node, href, children, ...props}) {
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
        {content.replace(/\[\[(.*?)\]\]/g, (match, noteName) => `[[${noteName}]](#wiki/${encodeURIComponent(noteName)})`)}
      </ReactMarkdown>
    </div>
  );
}