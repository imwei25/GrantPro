import { useStream } from "../lib/useStream";
import { usePersistentState } from "../lib/usePersistentState";
import { useCtrlEnterSubmit } from "../lib/useCtrlEnterSubmit";
import ResultPanel from "../components/ResultPanel";
import Dropzone from "../components/Dropzone";

export default function ReviewModule() {
  const [title, setTitle] = usePersistentState("review:title", "");
  const [text, setText] = usePersistentState("review:text", "");
  const { text: result, running, error, start, stop, setText: setResult } = useStream("review:result");

  const submit = () => {
    if (!text.trim() || running) return;
    start("review", { title, text });
  };
  useCtrlEnterSubmit(submit);

  const reset = () => {
    if (running) stop();
    setTitle("");
    setText("");
    setResult("");
  };

  return (
    <div className="module">
      <header className="module-head">
        <span className="eyebrow">04 · REVIEW</span>
        <h1>评审模拟</h1>
        <p>三位不同背景的评审（同行专家 / 交叉学科 / 挑刺型）对你的申请书内容独立打分、挑刺，并汇总致命问题。</p>
      </header>

      <div className="form">
        <label className="field">
          <span className="field-label">项目名称（可选）</span>
          <input
            data-testid="input-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="便于评审定位你的研究"
          />
        </label>
        <label className="field">
          <span className="field-label">申请书内容 / 核心摘要 <em>必填</em></span>
          <textarea
            data-testid="input-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="粘贴立项依据 + 研究方案，或申请书摘要（越完整，评审越准）"
            rows={10}
          />
        </label>
        <Dropzone
          testId="upload-doc"
          accept=".docx,.pdf,.txt,.md"
          label="或直接拖入申请书草稿"
          hint="支持 Word/PDF/txt，会自动填入上方内容框"
          onText={(t) => setText((prev) => (prev ? prev + "\n\n" : "") + t)}
        />
        <div className="form-actions">
          <button className="btn-primary" onClick={submit} disabled={!text.trim() || running} data-testid="run-btn" title="Ctrl / ⌘ + Enter 提交">
            {running ? "评审中…" : "开始模拟评审"}
          </button>
          <button className="btn-ghost" onClick={reset} data-testid="reset-btn">
            清空
          </button>
        </div>
      </div>

      <ResultPanel
        text={result}
        running={running}
        error={error}
        onStop={stop}
        exportName="评审意见"
        placeholder="三位评审的意见、评级与致命问题汇总会显示在这里。"
      />
    </div>
  );
}
