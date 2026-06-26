import { useStream } from "../lib/useStream";
import { usePersistentState } from "../lib/usePersistentState";
import ResultPanel from "../components/ResultPanel";
import Dropzone from "../components/Dropzone";

export default function PolishModule() {
  const [text, setText] = usePersistentState("polish:text", "");
  const { text: result, running, error, start, stop, setText: setResult } = useStream("polish:result");

  const submit = () => {
    if (!text.trim() || running) return;
    start("polish", { text });
  };

  const reset = () => {
    if (running) stop();
    setText("");
    setResult("");
  };

  return (
    <div className="module">
      <header className="module-head">
        <span className="eyebrow">05 · REFINE</span>
        <h1>润色合规</h1>
        <p>
          把文本润色为规范的基金书面语（只改表达、不改内容、不编造），并生成一段符合基金委要求的
          <strong>「生成式 AI 使用标注」</strong>，可据实修改后附于材料。
        </p>
      </header>

      <div className="form">
        <label className="field">
          <span className="field-label">待润色文本 <em>必填</em></span>
          <textarea
            data-testid="input-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="粘贴你的立项依据、研究方案或任意段落"
            rows={10}
          />
        </label>
        <Dropzone
          testId="upload-doc"
          accept=".docx,.pdf,.txt,.md"
          label="或直接拖入文档"
          hint="支持 Word/PDF/txt，会自动填入上方内容框"
          onText={(t) => setText((prev) => (prev ? prev + "\n\n" : "") + t)}
        />
        <div className="form-actions">
          <button className="btn-primary" onClick={submit} disabled={!text.trim() || running} data-testid="run-btn">
            {running ? "润色中…" : "润色并生成合规标注"}
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
        exportName="润色稿"
        docxTitle="润色稿"
        placeholder="润色后的文本、修改说明与 AI 使用标注会显示在这里。"
      />
    </div>
  );
}
