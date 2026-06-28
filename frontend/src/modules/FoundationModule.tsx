import { useStream } from "../lib/useStream";
import { usePersistentState } from "../lib/usePersistentState";
import { useCtrlEnterSubmit } from "../lib/useCtrlEnterSubmit";
import { EXAMPLES } from "../lib/examples";
import ResultPanel from "../components/ResultPanel";

// 研究基础: 2026 申请书正文三板块之一(立项依据/研究内容/研究基础)。
// 内容全是申请人自身的前期事实, 本模块只"组织/润色你提供的事实", 绝不编造成果。
export default function FoundationModule() {
  const [field, setField] = usePersistentState("foundation:field", "");
  const [material, setMaterial] = usePersistentState("foundation:material", "");
  const { text: result, running, error, start, stop, setText: setResult } = useStream("foundation:result");

  const submit = () => {
    if (!material.trim() || running) return;
    start("foundation", { field, material });
  };
  useCtrlEnterSubmit(submit);

  const fillExample = () => {
    setField(EXAMPLES.foundation.field);
    setMaterial(EXAMPLES.foundation.material);
  };

  const reset = () => {
    if (running) stop();
    setField("");
    setMaterial("");
    setResult("");
  };

  return (
    <div className="module">
      <header className="module-head">
        <span className="eyebrow">04 · BASIS</span>
        <h1>研究基础</h1>
        <p>
          2026 申请书正文三板块之一。把你<strong>已有的前期积累</strong>（工作基础、已有结果、设备平台、团队合作）
          整理成规范的「研究基础」草稿——<strong>只组织与润色你提供的事实，绝不新增或编造成果</strong>，缺失处会标注需你补充。
        </p>
      </header>

      <div className="form">
        <label className="field">
          <span className="field-label">研究领域/学科</span>
          <input
            data-testid="input-field"
            value={field}
            onChange={(e) => setField(e.target.value)}
            placeholder="如：神经科学 / 材料化学"
          />
        </label>
        <label className="field">
          <span className="field-label">前期基础材料 <em>必填</em></span>
          <textarea
            data-testid="input-material"
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            placeholder="如实写下：已开展的相关工作与代表性成果、已有结果/预实验数据、实验平台与关键设备、团队与合作单位等。只填真实信息。"
            rows={12}
          />
        </label>
        <div className="form-actions">
          <button className="btn-primary" onClick={submit} disabled={!material.trim() || running} data-testid="run-btn" title="Ctrl / ⌘ + Enter 提交">
            {running ? "整理中…" : "生成研究基础"}
          </button>
          <button className="btn-ghost" onClick={fillExample} data-testid="example-btn">
            填入示例
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
        onTextChange={setResult}
        exportName="研究基础"
        docxTitle="研究基础"
        placeholder="规范化的研究基础草稿会显示在这里。"
      />
    </div>
  );
}
