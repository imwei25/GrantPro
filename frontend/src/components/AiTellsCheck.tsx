import { analyzeAiTells } from "../lib/aiTells";

// AI 写作痕迹自检: 对一段文本做本地启发式扫描, 列出可能的"AI 味"线索。
// 只提示、不强改; 命中为 0 时给出"未发现明显痕迹(仍建议人工通读)"。
export default function AiTellsCheck({ text }: { text: string }) {
  if (!text || !text.trim()) return null;
  const r = analyzeAiTells(text);

  if (r.total === 0) {
    return (
      <div className="ai-tells ai-tells-ok" data-testid="ai-tells">
        ✅ AI 痕迹自检：未发现明显的空泛套话/单调连接词/超长句（仍建议人工通读核对）。
      </div>
    );
  }

  return (
    <div className="ai-tells ai-tells-warn" data-testid="ai-tells">
      <div className="ai-tells-head" data-testid="ai-tells-count">
        ⚠ AI 痕迹自检：发现 {r.total} 处可疑信号（启发式提示，非强制，可在润色模块改写）
      </div>
      <ul className="ai-tells-list">
        {r.stock.length > 0 && (
          <li>
            空泛套话：{r.stock.map((s) => `「${s.phrase}」×${s.count}`).join("、")}
          </li>
        )}
        {r.connectives.length > 0 && (
          <li>
            连接词偏多：{r.connectives.map((c) => `「${c.word}」×${c.count}`).join("、")}
          </li>
        )}
        {r.longSentences > 0 && <li>过长句子（&gt;80 字）：{r.longSentences} 句，建议拆分</li>}
      </ul>
    </div>
  );
}
