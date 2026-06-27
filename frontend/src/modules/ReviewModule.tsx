import { useStream } from "../lib/useStream";
import { usePersistentState } from "../lib/usePersistentState";
import { useCtrlEnterSubmit } from "../lib/useCtrlEnterSubmit";
import { EXAMPLES } from "../lib/examples";
import ResultPanel from "../components/ResultPanel";
import ReviewRadar from "../components/ReviewRadar";
import Dropzone from "../components/Dropzone";

export default function ReviewModule() {
  const [title, setTitle] = usePersistentState("review:title", "");
  const [text, setText] = usePersistentState("review:text", "");
  const { text: result, running, error, start, stop, setText: setResult } = useStream("review:result");
  // 据评审生成修订建议(闭环): 第二个结果槽。
  const rev = useStream("review:revise");

  const genRevision = () => {
    if (!result.trim() || rev.running) return;
    rev.start("revise", { text, review: result });
  };

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

  const fillExample = () => {
    setTitle(EXAMPLES.review.title);
    setText(EXAMPLES.review.text);
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
          <button className="btn-ghost" onClick={fillExample} data-testid="example-btn">
            填入示例
          </button>
          <button className="btn-ghost" onClick={reset} data-testid="reset-btn">
            清空
          </button>
        </div>
      </div>

      {!running && result && <ReviewRadar text={result} />}

      <ResultPanel
        text={result}
        running={running}
        error={error}
        onStop={stop}
        onTextChange={setResult}
        exportName="评审意见"
        placeholder="三位评审的意见、评级与致命问题汇总会显示在这里。"
      />

      {result && !running && (
        <div className="revision-cta">
          <button className="btn-primary" onClick={genRevision} disabled={rev.running} data-testid="gen-revision-btn">
            {rev.running ? "生成修订建议中…" : "据评审生成修订建议 →"}
          </button>
          <span className="revision-hint">把上面的共识弱点逐条定位回草稿、给出可执行的改法</span>
        </div>
      )}

      {(rev.text || rev.running) && (
        <ResultPanel
          text={rev.text}
          running={rev.running}
          error={rev.error}
          onStop={rev.stop}
          onTextChange={rev.setText}
          exportName="修订建议"
          docxTitle="修订建议"
          idPrefix="revision"
          placeholder="逐条弱点的定位与修改建议会显示在这里。"
        />
      )}
    </div>
  );
}
