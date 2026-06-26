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
}: Props) {
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");

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
    <div className="result-panel" data-testid="result-panel">
      <div className="result-toolbar">
        <span className="result-status">
          {running ? "生成中…" : error ? "出错了" : text ? "已完成" : "等待开始"}
        </span>
        <div className="result-actions">
          {running && onStop && (
            <button className="btn-ghost" onClick={onStop} data-testid="stop-btn">
              停止
            </button>
          )}
          {text && !running && nextLabel && onNext && (
            <button className="btn-ghost" onClick={onNext} data-testid="next-btn">
              {nextLabel}
            </button>
          )}
          {text && !running && (
            <button className="btn-ghost" onClick={copy} data-testid="copy-btn">
              {copyState === "ok" ? "已复制" : copyState === "fail" ? "复制失败" : "复制"}
            </button>
          )}
          {text && !running && (
            <button className="btn-ghost" onClick={exportMd} data-testid="export-md-btn">
              导出 Markdown
            </button>
          )}
          {text && !running && (
            <button className="btn-ghost" onClick={exportDocx} data-testid="export-docx-btn">
              导出 Word
            </button>
          )}
        </div>
      </div>
      {error ? (
        <div className="result-error" data-testid="result-error">
          {error}
        </div>
      ) : (
        <div className="result-text" data-testid="result-text">
          {text ? (
            <Markdown>{text}</Markdown>
          ) : (
            <span className="result-placeholder">{placeholder ?? "结果会显示在这里。"}</span>
          )}
          {running && <span className="cursor-blink">▍</span>}
        </div>
      )}
    </div>
  );
}
