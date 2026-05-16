import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn('prose prose-neutral dark:prose-invert max-w-none break-words', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children, ...props }) {
            return (
              <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm" {...props}>
                {children}
              </pre>
            );
          },
          code({ children, className: codeClassName, ...props }) {
            const isInline = !codeClassName;
            if (isInline) {
              return (
                <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className={cn('font-mono text-sm', codeClassName)} {...props}>
                {children}
              </code>
            );
          },
          a({ children, href, ...props }) {
            if (href && /^(javascript|data|vbscript):/i.test(href)) {
              return <span>{children}</span>;
            }
            const isInternal = href && (href.startsWith('/') || href.startsWith('#'));
            return (
              <a
                href={href}
                className="text-primary underline hover:no-underline"
                {...(!isInternal && { target: '_blank', rel: 'noopener noreferrer' })}
                {...props}
              >
                {children}
              </a>
            );
          },
          table({ children, ...props }) {
            return (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" {...props}>
                  {children}
                </table>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
