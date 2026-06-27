import { useRef, useState } from "react";
import { streamRationale, Reference, Verification } from "../lib/sse";
import Markdown from "../components/Markdown";
import Dropzone from "../components/Dropzone";
import { downloadText, downloadDocx, tsName } from "../lib/download";
import { usePersistentState } from "../lib/usePersistentState";
import { useCtrlEnterSubmit } from "../lib/useCtrlEnterSubmit";
import type { Goto } from "../App";

// 文献来源标签: 优先用后端给出的 source, 否则按 PMID/DOI 反推。
function srcLabel(r: Reference): string {
  const s = r.source || (r.pmid ? "pubmed" : r.doi ? "crossref" : "");
  return { pubmed: "PubMed", crossref: "Crossref", semanticscholar: "Semantic Scholar" }[s] || "";
}

export default function RationaleModule({ goto }: { goto: Goto }) {
  const [field, setField] = usePersistentState("rationale:field", "");
  const [keywords, setKeywords] = usePersistentState("rationale:keywords", "");
  const [problem, setProblem] = usePersistentState("rationale:problem", "");
  const [background, setBackground] = usePersistentState("rationale:background", "");

  const [status, setStatus] = useState("");
  const [refs, setRefs] = usePersistentState<Reference[]>("rationale:refs", []);
  const [text, setText] = usePersistentState("rationale:result", "");
  const [verify, setVerify] = usePersistentState<Verification | null>("rationale:verify", null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  const submit = async () => {
    if (!field.trim() || running) return;
    setStatus("");
    setRefs([]);
    setText("");
    setVerify(null);
    setError(null);
    setRunning(true);
    ctrl.current = new AbortController();
    await streamRationale(
      { field, keywords, problem, background },
      {
        signal: ctrl.current.signal,
        onStatus: setStatus,
        onReferences: setRefs,
        onDelta: (t) => setText((p) => p + t),
        onVerify: setVerify,
        onError: (m) => {
          setError(m);
          setRunning(false);
        },
        onDone: () => {
          setStatus("");
          setRunning(false);
        },
      },
    );
    setRunning(false);
  };

  useCtrlEnterSubmit(submit);

  const stop = () => {
    ctrl.current?.abort();
    setRunning(false);
  };

  // 正文 + 参考文献(Markdown 链接), 供导出 Markdown / Word 共用。
  const composeMarkdown = () => {
    const refMd = refs.length
      ? "\n\n## 参考文献\n" +
        refs.map((r) => `- [${r.first_author} (${r.year}). ${r.title}](${r.url})`).join("\n")
      : "";
    return text + refMd;
  };

  const reset = () => {
    if (running) stop();
    setField("");
    setKeywords("");
    setProblem("");
    setBackground("");
    setRefs([]);
    setText("");
    setVerify(null);
    setStatus("");
    setError(null);
  };

  return (
    <div className="module">
      <header className="module-head">
        <span className="eyebrow">02 · GROUND</span>
        <h1>立项依据 · 文献接地</h1>
        <p>
          我会实际检索 <strong>PubMed</strong> 真实文献，据此撰写立项依据草稿（研究现状→不足→切入点），
          引用均为可点击链接，并自动核验有无“编造文献”。<strong>所有引用仍需你本人复核。</strong>
        </p>
      </header>

      <div className="form">
        <label className="field">
          <span className="field-label">研究方向 <em>必填</em></span>
          <input
            data-testid="input-field"
            value={field}
            onChange={(e) => setField(e.target.value)}
            placeholder="例如：肠道菌群与阿尔茨海默病、PD-1 抑制剂耐药机制"
          />
        </label>
        <label className="field">
          <span className="field-label">关键词（可选，建议英文，利于检索）</span>
          <input
            data-testid="input-keywords"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="逗号分隔，例如：gut microbiota, neuroinflammation, biomarker"
          />
        </label>
        <label className="field">
          <span className="field-label">拟解决的科学问题（可选）</span>
          <textarea
            data-testid="input-problem"
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            placeholder="便于把立项依据导向你的科学问题"
            rows={2}
          />
        </label>
        <Dropzone
          testId="upload-doc"
          accept=".docx,.pdf,.txt,.md"
          label="附加文档（可选：已有综述/草案）"
          hint="支持 Word/PDF/txt，内容会作为背景补充"
          onText={(t, name) =>
            setBackground((prev) => (prev ? prev + "\n\n" : "") + `[附加文档：${name}]\n` + t)
          }
        />
        <div className="form-actions">
          <button className="btn-primary" onClick={submit} disabled={!field.trim() || running} data-testid="run-btn" title="Ctrl / ⌘ + Enter 提交">
            {running ? "调研中…" : "检索文献并撰写立项依据"}
          </button>
          <button className="btn-ghost" onClick={reset} data-testid="reset-btn">
            清空
          </button>
        </div>
      </div>

      {status && (
        <div className="status-line" data-testid="status-line">
          <span className="spinner" /> {status}
        </div>
      )}

      {error && (
        <div className="result-error" data-testid="result-error">
          {error}
        </div>
      )}

      {refs.length > 0 && (
        <details className="refs" open data-testid="refs">
          <summary>检索到的真实文献（{refs.length} 篇，来自 PubMed / Crossref，点击可打开原文）</summary>
          <ol className="ref-list">
            {refs.map((r) => (
              <li key={r.url}>
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.first_author} ({r.year}). {r.title}
                </a>
                {r.journal && <span className="ref-journal"> — {r.journal}</span>}
                <span className="ref-src">{srcLabel(r)}</span>
              </li>
            ))}
          </ol>
        </details>
      )}

      {(text || running) && (
        <div className="result-panel">
          <div className="result-toolbar">
            <span className="result-status">{running ? "生成中…" : "已完成"}</span>
            <div className="result-actions">
              {running && (
                <button className="btn-ghost" onClick={stop} data-testid="stop-btn">
                  停止
                </button>
              )}
              {text && !running && (
                <button
                  className="btn-ghost"
                  data-testid="send-to-scheme-btn"
                  onClick={() => goto("scheme", { "scheme:idea": text })}
                >
                  用此结果做研究方案 →
                </button>
              )}
              {text && !running && (
                <button
                  className="btn-ghost"
                  data-testid="export-md-btn"
                  onClick={() => downloadText(tsName("立项依据", "md"), composeMarkdown())}
                >
                  导出 Markdown
                </button>
              )}
              {text && !running && (
                <button
                  className="btn-ghost"
                  data-testid="export-docx-btn"
                  onClick={async () => {
                    const err = await downloadDocx(tsName("立项依据", "docx"), composeMarkdown(), "立项依据");
                    if (err) setError(err);
                  }}
                >
                  导出 Word
                </button>
              )}
            </div>
          </div>
          <div className="result-text" data-testid="result-text">
            {text ? <Markdown>{text}</Markdown> : <span className="result-placeholder">正在撰写…</span>}
            {running && <span className="cursor-blink">▍</span>}
          </div>
        </div>
      )}

      {verify && !running && (
        verify.unverified.length === 0 ? (
          <div className="verify-ok" data-testid="verify">
            ✓ 引用核验：正文 {verify.total} 处文献引用均来自本次检索到的真实文献（仍建议你逐条复核内容是否相符）。
          </div>
        ) : (
          <div className="verify-bad" data-testid="verify">
            ⚠ 引用核验：发现 {verify.unverified.length} 处引用未出现在检索结果中，可能为编造，请务必核实：
            {verify.unverified.map((id) => {
              const isDoi = id.startsWith("10.");
              const href = isDoi ? `https://doi.org/${id}` : `https://pubmed.ncbi.nlm.nih.gov/${id}/`;
              return (
                <a key={id} href={href} target="_blank" rel="noreferrer">
                  {isDoi ? `DOI ${id}` : `PMID ${id}`}
                </a>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
