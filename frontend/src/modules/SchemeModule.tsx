import { useStream } from "../lib/useStream";
import { usePersistentState } from "../lib/usePersistentState";
import ResultPanel from "../components/ResultPanel";
import Dropzone from "../components/Dropzone";
import type { Goto } from "../App";

export default function SchemeModule({ goto }: { goto: Goto }) {
  const [idea, setIdea] = usePersistentState("scheme:idea", "");
  const [field, setField] = usePersistentState("scheme:field", "");
  const [objective, setObjective] = usePersistentState("scheme:objective", "");
  const [resources, setResources] = usePersistentState("scheme:resources", "");
  const { text, running, error, start, stop, setText } = useStream("scheme:result");

  const submit = () => {
    if (!idea.trim() || running) return;
    start("scheme", { idea, field, objective, resources });
  };

  const reset = () => {
    if (running) stop();
    setIdea("");
    setField("");
    setObjective("");
    setResources("");
    setText("");
  };

  return (
    <div className="module">
      <header className="module-head">
        <h1>🗺️ 研究方案</h1>
        <p>把研究构想组织成层层对应的方案：研究目标—研究内容—关键科学问题—技术路线（含 Mermaid 流程图）—可行性。</p>
      </header>

      <div className="form">
        <label className="field">
          <span className="field-label">研究构想 / 课题 <em>必填</em></span>
          <textarea
            data-testid="input-idea"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="例如：用脑类器官模型研究某信号通路在神经退行中的作用"
            rows={4}
          />
        </label>
        <label className="field">
          <span className="field-label">研究领域 / 学科（可选）</span>
          <input
            data-testid="input-field"
            value={field}
            onChange={(e) => setField(e.target.value)}
            placeholder="例如：细胞生物学、材料化学"
          />
        </label>
        <label className="field">
          <span className="field-label">已有研究目标（可选）</span>
          <textarea
            data-testid="input-objective"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="若已有目标可填，工具会帮你校验目标-内容是否对应"
            rows={2}
          />
        </label>
        <label className="field">
          <span className="field-label">可用资源 / 研究基础（可选）</span>
          <textarea
            data-testid="input-resources"
            value={resources}
            onChange={(e) => setResources(e.target.value)}
            placeholder="经费、设备、样本、团队、时间等"
            rows={2}
          />
        </label>
        <Dropzone
          testId="upload-doc"
          accept=".docx,.pdf,.txt,.md"
          label="附加文档（可选：立项依据/预实验）"
          hint="支持 Word/PDF/txt，内容会作为补充资料"
          onText={(t, name) =>
            setResources((prev) => (prev ? prev + "\n\n" : "") + `[附加文档：${name}]\n` + t)
          }
        />
        <div className="form-actions">
          <button className="btn-primary" onClick={submit} disabled={!idea.trim() || running} data-testid="run-btn">
            {running ? "生成中…" : "生成研究方案"}
          </button>
          <button className="btn-ghost" onClick={reset} data-testid="reset-btn">
            清空
          </button>
        </div>
      </div>

      <ResultPanel
        text={text}
        running={running}
        error={error}
        onStop={stop}
        exportName="研究方案"
        docxTitle="研究方案"
        placeholder="研究目标、内容、关键科学问题、技术路线会显示在这里。"
        nextLabel="把方案送去模拟评审 →"
        onNext={() => goto("review", { "review:text": text })}
      />
    </div>
  );
}
