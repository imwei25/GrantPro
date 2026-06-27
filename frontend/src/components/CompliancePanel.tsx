import { useEffect, useState } from "react";
import { apiUrl } from "../lib/api";
import { copyText } from "../lib/clipboard";

interface ComplianceInfo {
  annotation: string;
  checklist: string[];
  notice: string;
}

// 提交前合规自查: 把后端 /api/compliance 的自查清单与 AI 使用标注模板呈现给用户。
// 这是本应用"合规第一"定位的落地——清单逐条对照基金委红线, 标注模板可一键复制后据实修改。
export default function CompliancePanel() {
  const [info, setInfo] = useState<ComplianceInfo | null>(null);
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl("/api/compliance"))
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setInfo(d);
      })
      .catch(() => {
        /* 后端未就绪时静默, 不影响首页其余部分 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!info) return null;

  const copyAnnotation = async () => {
    const ok = await copyText(info.annotation);
    setCopied(ok ? "ok" : "fail");
    setTimeout(() => setCopied("idle"), 1500);
  };

  return (
    <details className="compliance-panel" data-testid="compliance-panel">
      <summary>
        <span className="cp-tag">自查</span>
        提交前合规自查清单（对照基金委红线，逐条确认后再提交）
      </summary>

      <ul className="cp-checklist" data-testid="compliance-checklist">
        {info.checklist.map((item, i) => (
          <li key={i}>
            <span className="cp-box" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>

      <div className="cp-annotation">
        <div className="cp-annotation-head">
          <span className="cp-annotation-title">AI 使用标注模板（据实修改后附于材料）</span>
          <button className="btn-ghost" onClick={copyAnnotation} data-testid="copy-annotation-btn">
            {copied === "ok" ? "已复制" : copied === "fail" ? "复制失败" : "复制模板"}
          </button>
        </div>
        <p className="cp-annotation-text">{info.annotation}</p>
      </div>
    </details>
  );
}
