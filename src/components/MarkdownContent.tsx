import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  text: string;
}

export function MarkdownContent({ text }: Props) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="text-lg font-bold text-kubernaut-teal-700 mb-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-semibold text-kubernaut-teal-700 mb-1.5">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold text-kubernaut-teal-700 mb-1">{children}</h3>,
        p: ({ children }) => <p className="text-sm text-gray-700 mb-2 last:mb-0 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 text-sm text-gray-700">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 text-sm text-gray-700">{children}</ol>,
        li: ({ children }) => <li className="mb-0.5">{children}</li>,
        code: ({ className, children }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <pre className="bg-gray-800 text-gray-200 rounded-md px-3 py-2 my-2 overflow-x-auto text-xs">
                <code>{children}</code>
              </pre>
            );
          }
          return (
            <code className="bg-gray-100 text-gray-800 rounded px-1 py-0.5 text-xs">
              {children}
            </code>
          );
        },
        strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-kubernaut-teal-600 pl-3 my-2 text-gray-600 italic text-sm">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full text-xs border-collapse">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-gray-300 bg-gray-100 px-2 py-1 text-left font-semibold text-sm">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-gray-300 px-2 py-1 text-sm">{children}</td>
        ),
      }}
    >
      {text}
    </Markdown>
  );
}
