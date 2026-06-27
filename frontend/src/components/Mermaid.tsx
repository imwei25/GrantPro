import { useEffect, useRef, useState } from "react";

// 渲染 Mermaid 流程图(研究方案模块会产出 ```mermaid``` 代码块)。
// 设计:
//   - 动态 import("mermaid") 懒加载, 不拖累首屏(mermaid 体积较大);
//   - 流式输出期间代码可能尚不完整, 先用 parse(suppressErrors) 校验,
//     不合法就回退显示原始代码, 避免抛错与控制台噪声;
//   - 渲染失败同样回退原始代码, 保证"至少能看到可复制的图代码"。
let _idSeq = 0;

export default function Mermaid({ code }: { code: string }) {
  const [svg, setSvg] = useState("");
  const [failed, setFailed] = useState(false);
  const idRef = useRef(`mmd-${_idSeq++}`);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict" });
        const valid = await mermaid.parse(code, { suppressErrors: true });
        if (!valid) {
          if (!cancelled) setFailed(true);
          return;
        }
        const { svg } = await mermaid.render(idRef.current, code);
        if (!cancelled) {
          setSvg(svg);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (failed) {
    return (
      <pre className="mermaid-fallback" data-testid="mermaid-fallback">
        <code>{code}</code>
      </pre>
    );
  }
  if (!svg) {
    return <div className="mermaid-loading">正在绘制流程图…</div>;
  }
  return <div className="mermaid" data-testid="mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
}
