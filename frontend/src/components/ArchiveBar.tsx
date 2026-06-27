import { useRef, useState } from "react";
import { exportArchive, importArchive, hasArchive } from "../lib/archive";
import { tsName } from "../lib/download";

// 本地存档条: 始终显示在首页(即使工作台为空也能导入), 提供导出/导入 .json。
export default function ArchiveBar() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");

  const onExport = () => {
    const ok = exportArchive(tsName("GrantPro存档", "json"));
    setMsg(ok ? "已导出当前全部内容" : "暂无可导出的内容");
    setTimeout(() => setMsg(""), 2500);
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    try {
      const n = await importArchive(f);
      setMsg(`已导入 ${n} 项，正在刷新…`);
      setTimeout(() => location.reload(), 700);
    } catch (e) {
      setMsg(`导入失败：${(e as Error).message}`);
      setTimeout(() => setMsg(""), 3000);
    }
  };

  return (
    <section className="archive-bar" data-testid="archive-bar">
      <span className="archive-label">本地存档</span>
      <button className="btn-ghost" onClick={onExport} disabled={!hasArchive()} data-testid="export-archive-btn">
        导出存档（.json）
      </button>
      <button className="btn-ghost" onClick={() => fileRef.current?.click()} data-testid="import-archive-btn">
        导入存档
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        data-testid="import-archive-input"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      {msg ? (
        <span className="archive-msg" data-testid="archive-msg">{msg}</span>
      ) : (
        <span className="archive-hint">所有内容仅存于本机浏览器，建议定期导出备份</span>
      )}
    </section>
  );
}
