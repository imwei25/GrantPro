import { useEffect, useState } from "react";
import { readPersisted } from "../lib/usePersistentState";
import { downloadText, downloadDocx, tsName } from "../lib/download";
import { apiUrl } from "../lib/api";
import type { Reference } from "../lib/sse";
import type { ModuleId } from "../App";

// 五道工序各自把结果持久化到 <module>:result; 这里把"已完成"的各节
// 汇总成一份完整文档, 一键导出 Word / Markdown(落实流水线"汇总成稿"的定位)。
const SECTIONS: { id: ModuleId; n: string; title: string; key: string }[] = [
  { id: "critique", n: "01", title: "选题诊断", key: "critique:result" },
  { id: "rationale", n: "02", title: "立项依据", key: "rationale:result" },
  { id: "scheme", n: "03", title: "研究方案", key: "scheme:result" },
  { id: "review", n: "04", title: "评审模拟", key: "review:result" },
  { id: "polish", n: "05", title: "润色合规", key: "polish:result" },
];

interface Filled {
  id: ModuleId;
  n: string;
  title: string;
  chars: number;
  body: string;
}

function collect(): Filled[] {
  const out: Filled[] = [];
  for (const s of SECTIONS) {
    const t = (readPersisted<string>(s.key, "") || "").trim();
    if (!t) continue;
    let body = t;
    if (s.id === "rationale") {
      const refs = readPersisted<Reference[]>("rationale:refs", []);
      if (refs.length) {
        body +=
          "\n\n## 参考文献\n" +
          refs.map((r) => `- [${r.first_author} (${r.year}). ${r.title}](${r.url})`).join("\n");
      }
    }
    out.push({ id: s.id, n: s.n, title: s.title, chars: t.length, body });
  }
  return out;
}

export default function WorkspaceSummary({ onPick }: { onPick: (m: ModuleId) => void }) {
  // 进入首页时读取一次当前各模块结果(返回首页会重新挂载, 自动刷新)。
  const [filled, setFilled] = useState<Filled[]>(collect);
  const [err, setErr] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  // 汇总稿末尾自动附"生成式 AI 使用标注"(基金委要求材料附标识), 取自后端模板。
  const [annotation, setAnnotation] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl("/api/compliance"))
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setAnnotation(d.annotation || "");
      })
      .catch(() => {
        /* 后端未就绪时静默, 不影响导出(只是不附标注) */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (filled.length === 0) return null;

  // 清空全部工作台(各模块的输入与结果), 用于开始一份新的申请。
  // 二次确认避免误删; 清掉所有 nsfc: 前缀的持久化键。
  const clearAll = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("nsfc:")) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* 忽略 */
    }
    setFilled([]);
  };

  const compose = () => {
    const body = filled.map((f) => `# ${f.title}\n\n${f.body}`).join("\n\n---\n\n");
    // 末尾附 AI 使用标注(据实修改后采用); 取不到模板时不附。
    return annotation
      ? `${body}\n\n---\n\n# 生成式 AI 使用标注\n\n${annotation}`
      : body;
  };

  const exportMd = () => downloadText(tsName("国自然申请材料汇总", "md"), compose());
  const exportDocx = async () => {
    setErr("");
    const e = await downloadDocx(tsName("国自然申请材料汇总", "docx"), compose(), "国自然申请材料汇总");
    if (e) setErr(e);
  };

  return (
    <section className="workspace" data-testid="workspace">
      <div className="workspace-head">
        <span className="workspace-title">工作台汇总</span>
        <span className="workspace-sub">
          已完成 {filled.length} / {SECTIONS.length} 节，可汇总成一份完整材料导出（末尾自动附 AI 使用标注）
        </span>
      </div>

      <ul className="workspace-list" data-testid="workspace-list">
        {filled.map((f) => (
          <li key={f.id}>
            <button className="ws-item" onClick={() => onPick(f.id)} title="点击回到该模块">
              <span className="ws-num">{f.n}</span>
              <span className="ws-name">{f.title}</span>
              <span className="ws-chars">{f.chars} 字</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="workspace-actions">
        <button className="btn-primary" onClick={exportDocx} data-testid="export-all-docx-btn">
          汇总导出 Word
        </button>
        <button className="btn-ghost" onClick={exportMd} data-testid="export-all-md-btn">
          汇总导出 Markdown
        </button>
        <button
          className={`btn-ghost ws-clear ${confirmClear ? "danger" : ""}`}
          onClick={clearAll}
          data-testid="clear-all-btn"
        >
          {confirmClear ? "确认清空？（不可恢复）" : "清空全部 / 新建申请"}
        </button>
      </div>
      {err && <div className="result-error" data-testid="workspace-error">{err}</div>}
    </section>
  );
}
