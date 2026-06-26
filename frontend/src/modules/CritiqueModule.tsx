import { useStream } from "../lib/useStream";
import { usePersistentState } from "../lib/usePersistentState";
import ResultPanel from "../components/ResultPanel";
import Dropzone from "../components/Dropzone";
import type { Goto } from "../App";

export default function CritiqueModule({ goto }: { goto: Goto }) {
  const [title, setTitle] = usePersistentState("critique:title", "");
  const [field, setField] = usePersistentState("critique:field", "");
  const [problem, setProblem] = usePersistentState("critique:problem", "");
  const [innovation, setInnovation] = usePersistentState("critique:innovation", "");
  const [background, setBackground] = usePersistentState("critique:background", "");
  const { text, running, error, start, stop, setText } = useStream("critique:result");

  const submit = () => {
    if (!title.trim() || running) return;
    start("critique", { title, field, problem, innovation, background });
  };

  const reset = () => {
    if (running) stop();
    setTitle("");
    setField("");
    setProblem("");
    setInnovation("");
    setBackground("");
    setText("");
  };

  return (
    <div className="module">
      <header className="module-head">
        <span className="eyebrow">01 · DIAGNOSE</span>
        <h1>选题诊断</h1>
        <p>以国自然评审专家的视角，评估你选题的创新性、科学问题属性归类，并挑出最可能被毙的硬伤。</p>
      </header>

      <div className="form">
        <label className="field">
          <span className="field-label">拟申报项目名称 / 选题 <em>必填</em></span>
          <input
            data-testid="input-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：基于肠道菌群-脑轴的帕金森病早期干预机制研究"
          />
        </label>
        <label className="field">
          <span className="field-label">研究领域 / 学科（可选）</span>
          <input
            data-testid="input-field"
            value={field}
            onChange={(e) => setField(e.target.value)}
            placeholder="例如：神经科学、材料化学、生态学"
          />
        </label>
        <label className="field">
          <span className="field-label">拟解决的科学问题（可选）</span>
          <textarea
            data-testid="input-problem"
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            placeholder="一句话讲清你想回答的科学问题"
            rows={2}
          />
        </label>
        <label className="field">
          <span className="field-label">你自认为的创新点（可选）</span>
          <textarea
            data-testid="input-innovation"
            value={innovation}
            onChange={(e) => setInnovation(e.target.value)}
            placeholder="与现有工作相比，新在哪里"
            rows={2}
          />
        </label>
        <label className="field">
          <span className="field-label">已有研究基础 / 条件（可选）</span>
          <textarea
            data-testid="input-background"
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            placeholder="例如：前期已建立动物模型、可获取临床样本"
            rows={2}
          />
        </label>
        <Dropzone
          testId="upload-doc"
          accept=".docx,.pdf,.txt,.md"
          label="附加文档（可选：已有草案/想法）"
          hint="支持 Word/PDF/txt，内容会作为研究基础补充"
          onText={(t, name) =>
            setBackground((prev) => (prev ? prev + "\n\n" : "") + `[附加文档：${name}]\n` + t)
          }
        />
        <div className="form-actions">
          <button className="btn-primary" onClick={submit} disabled={!title.trim() || running} data-testid="run-btn">
            {running ? "诊断中…" : "开始选题诊断"}
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
        exportName="选题诊断"
        placeholder="创新性评估、科学问题属性、致命硬伤会显示在这里。"
        nextLabel="用此选题写立项依据 →"
        onNext={() => goto("rationale", { "rationale:field": title })}
      />
    </div>
  );
}
