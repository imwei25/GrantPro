import { useState } from "react";
import Markdown from "./Markdown";
import { downloadText, downloadDocx, tsName } from "../lib/download";
import { copyText } from "../lib/clipboard";

interface Props {
  text: string;
  running: boolean;
  error: string | null;
  onStop?: () => void;
  placeholder?: string;
  exportName?: string;
  // 额外的“串联到下一步”按钮
  nextLabel?: string;
  onNext?: () => void;
  // 是否提供“导出 Word”按钮
  docxTitle?: string;
  // 提供则结果可就地编辑(改后写回持久化, 导出/串联自动用改后的版本)
  onTextChange?: (t: string) => void;
  // 同一页面出现多个结果面板时, 用于给 data-testid 加前缀避免冲突
  idPrefix?: string;
  // 建议字数区间 [min, max]; 提供则显示篇幅仪表与超纲/不足提示
  targetRange?: [number, number];
  // 用于篇幅区间判定与计数显示的"有效字数"; 不提供则取整块文本长度。
  // 多语种/多段产出(如摘要含中文摘要+英文 Abstract)应只对相关段计数, 否则会系统性误报。
  measureLen?: number;
}

// 统一的结果展示区: 流式文本 + 复制 + 导出(MD/Word) + 串联 + 停止 + 状态。
export default function ResultPanel({
  text,
  running,
  error,
  onStop,
  placeholder,
  exportName,
  nextLabel,
  onNext,
  docxTitle,
  onTextChange,
  idPrefix,
  targetRange,
  measureLen,
}: Props) {
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");
  const [editing, setEditing] = useState(false);
  const tid = (name: string) => (idPrefix ? `${idPrefix}-${name}` : name);

  const len = text.trim().length;
  // 用于篇幅判定/显示的有效字数: 默认整块, 摘要等多段产出由模块传入只含相关段的长度。
  const measure = measureLen ?? len;
  // 篇幅状态: 不足 / 合适 / 超纲(仅在提供 targetRange 时计算)
  const lenState = !targetRange ? "" : measure < targetRange[0] ? "short" : measure > targetRange[1] ? "long" : "ok";

  const copy = async () => {
    const ok = await copyText(text);
    setCopyState(ok ? "ok" : "fail");
    setTimeout(() => setCopyState("idle"), 1500);
  };

  const exportMd = () => downloadText(tsName(exportName ?? "结果", "md"), text);

  const exportDocx = () => {
    void downloadDocx(tsName(exportName ?? "草稿", "docx"), text, docxTitle ?? exportName ?? "");
  };

  return (
    <div className="result-panel" data-testid={tid("result-panel")}>
      <div className="result-toolbar">
        <span className="result-status">
          {running ? "生成中…" : error ? "出错了" : text ? "已完成" : "等待开始"}
          {text && (
            <span className={`result-count ${lenState}`} data-testid={tid("result-count")}>
              {measure} 字
              {targetRange && (
                <>
                  {" · 建议 "}
                  {targetRange[0]}–{targetRange[1]} 字
                  {lenState === "short" && "（偏短）"}
                  {lenState === "long" && "（偏长）"}
                  <span className="count-note">（以当年指南为准）</span>
                </>
              )}
            </span>
          )}
        </span>
        <div className="result-actions">
          {running && onStop && (
            <button className="btn-ghost" onClick={onStop} data-testid={tid("stop-btn")}>
              停止
            </button>
          )}
          {text && !running && onTextChange && (
            <button
              className={`btn-ghost ${editing ? "active" : ""}`}
              onClick={() => setEditing((v) => !v)}
              data-testid={tid("edit-btn")}
            >
              {editing ? "完成编辑" : "编辑"}
            </button>
          )}
          {text && !running && nextLabel && onNext && (
            <button className="btn-ghost" onClick={onNext} data-testid={tid("next-btn")}>
              {nextLabel}
            </button>
          )}
          {text && !running && (
            <button className="btn-ghost" onClick={copy} data-testid={tid("copy-btn")}>
              {copyState === "ok" ? "已复制" : copyState === "fail" ? "复制失败" : "复制"}
            </button>
          )}
          {text && !running && (
            <button className="btn-ghost" onClick={exportMd} data-testid={tid("export-md-btn")}>
              导出 Markdown
            </button>
          )}
          {text && !running && (
            <button className="btn-ghost" onClick={exportDocx} data-testid={tid("export-docx-btn")}>
              导出 Word
            </button>
          )}
        </div>
      </div>
      {error ? (
        <div className="result-error" data-testid={tid("result-error")}>
          {error}
        </div>
      ) : (
        editing && onTextChange ? (
          <textarea
            className="result-edit"
            data-testid={tid("result-edit")}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            spellCheck={false}
          />
        ) : (
          <div className="result-text" data-testid={tid("result-text")}>
            {text ? (
              <Markdown>{text}</Markdown>
            ) : (
              <span className="result-placeholder">{placeholder ?? "结果会显示在这里。"}</span>
            )}
            {running && <span className="cursor-blink">▍</span>}
          </div>
        )
      )}
    </div>
  );
}
