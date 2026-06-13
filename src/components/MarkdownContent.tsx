import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

interface Props {
  text: string;
}

const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto"],
  },
};

export function MarkdownContent({ text }: Props) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
      components={{
        h1: ({ children }) => <h1 className="text-lg font-bold text-kubernaut-teal-700 mb-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-semibold text-kubernaut-teal-700 mb-1.5">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold text-kubernaut-teal-700 mb-1">{children}</h3>,
        p: ({ children }) => <p className="text-sm text-text-secondary mb-2 last:mb-0 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 text-sm text-text-secondary">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 text-sm text-text-secondary">{children}</ol>,
        li: ({ children }) => <li className="mb-0.5">{children}</li>,
        code: ({ className, children }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <pre className="bg-surface-secondary text-text-primary rounded-md px-3 py-2 my-2 overflow-x-auto text-xs">
                <code>{children}</code>
              </pre>
            );
          }
          return (
            <code className="bg-surface-secondary text-text-primary rounded px-1 py-0.5 text-xs">
              {children}
            </code>
          );
        },
        strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-kubernaut-teal-600 underline hover:text-kubernaut-teal-700"
            aria-label={typeof children === "string" ? `${children} (opens in new tab)` : undefined}
          >
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-kubernaut-teal-600 pl-3 my-2 text-text-muted italic text-sm">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full text-xs border-collapse">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-border bg-surface-secondary px-2 py-1 text-left font-semibold text-sm">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-border px-2 py-1 text-sm">{children}</td>
        ),
      }}
    >
      {text}
    </Markdown>
  );
}
