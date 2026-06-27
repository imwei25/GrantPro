import ReactMarkdown from "react-markdown";
import Mermaid from "./Mermaid";

// 渲染 Markdown, 其中:
//   - 链接(文献引用)可点击, 在新标签打开;
//   - ```mermaid``` 代码块渲染为流程图(研究方案模块用到)。
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          code: ({ className, children, ...props }) => {
            const lang = /language-(\w+)/.exec(className || "")?.[1];
            if (lang === "mermaid") {
              return <Mermaid code={String(children).replace(/\n$/, "")} />;
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
