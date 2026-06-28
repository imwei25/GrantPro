import { useStream } from "../lib/useStream";
import { usePersistentState } from "../lib/usePersistentState";
import { useCtrlEnterSubmit } from "../lib/useCtrlEnterSubmit";
import { assembleBody, AUXILIARY_IDS } from "../lib/workspace";
import { EXAMPLES } from "../lib/examples";
import ResultPanel from "../components/ResultPanel";

// 篇幅区间[300,450]只针对"## 中文摘要"这一段; build_abstract 同时产出英文
// Abstract 与中英关键词, 若按整块计数会系统性误报"偏长"。提取该段长度, 取不到(如
// 流式未到/演示文案)则回退整块, 保持计数始终可见。
function zhAbstractLen(text: string): number {
  const m = text.match(/##\s*中文摘要\s*\r?\n([\s\S]*?)(?:\r?\n##\s|$)/);
  return (m ? m[1] : text).trim().length;
}

// 项目摘要: NSFC 必填项, 最宜由全文反向凝练。输入可一键从工作台各节拉取。
export default function AbstractModule() {
  const [source, setSource] = usePersistentState("abstract:source", "");
  const { text: result, running, error, start, stop, setText: setResult } = useStream("abstract:result");

  const submit = () => {
    if (!source.trim() || running) return;
    start("abstract", { text: source });
  };
  useCtrlEnterSubmit(submit);

  const pullAll = () => setSource(assembleBody([...AUXILIARY_IDS])); // 排除诊断与评审两类辅助产出, 只凝练正文
  const fillExample = () =>
    setSource(`## 立项依据\n\n${EXAMPLES.review.text}\n\n## 研究方案\n\n${EXAMPLES.scheme.idea}`);

  const reset = () => {
    if (running) stop();
    setSource("");
    setResult("");
  };

  return (
    <div className="module">
      <header className="module-head">
        <span className="eyebrow">07 · ABSTRACT</span>
        <h1>项目摘要</h1>
        <p>
          从你已完成的各节内容反向凝练出符合基金委要求的<strong>项目摘要 + 关键词（中英）</strong>，
          只压缩提炼、不新增内容、不编造。建议在其他模块都成稿后再生成。
        </p>
      </header>

      <div className="form">
        <label className="field">
          <span className="field-label">申请书核心内容 <em>必填</em></span>
          <textarea
            data-testid="input-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="粘贴立项依据 + 研究方案等核心内容，或点「拉取工作台全文」一键带入"
            rows={12}
          />
        </label>
        <div className="form-actions">
          <button className="btn-primary" onClick={submit} disabled={!source.trim() || running} data-testid="run-btn" title="Ctrl / ⌘ + Enter 提交">
            {running ? "凝练中…" : "生成项目摘要"}
          </button>
          <button className="btn-ghost" onClick={pullAll} data-testid="pull-all-btn">
            拉取工作台全文
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
        exportName="项目摘要"
        docxTitle="项目摘要"
        targetRange={[300, 450]}
        measureLen={zhAbstractLen(result)}
        placeholder="中文摘要、关键词、英文摘要会显示在这里。"
      />
    </div>
  );
}
