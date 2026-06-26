import { useEffect, useState } from "react";
import { apiUrl } from "./lib/api";
import { writePersisted } from "./lib/usePersistentState";
import CritiqueModule from "./modules/CritiqueModule";
import RationaleModule from "./modules/RationaleModule";
import SchemeModule from "./modules/SchemeModule";
import ReviewModule from "./modules/ReviewModule";
import PolishModule from "./modules/PolishModule";

export type ModuleId = "home" | "critique" | "rationale" | "scheme" | "review" | "polish";
// 跨模块传递: 把数据写入目标模块的持久化字段, 再切换过去。
export type Goto = (target: ModuleId, patch?: Record<string, unknown>) => void;

const NAV: { id: ModuleId; icon: string; title: string; desc: string }[] = [
  { id: "critique", icon: "💡", title: "选题诊断", desc: "评审视角挑硬伤、定属性" },
  { id: "rationale", icon: "📚", title: "立项依据", desc: "检索真实文献、接地撰写" },
  { id: "scheme", icon: "🗺️", title: "研究方案", desc: "目标·内容·关键问题·路线" },
  { id: "review", icon: "🧐", title: "评审模拟", desc: "三位评审打分挑刺" },
  { id: "polish", icon: "✍️", title: "润色合规", desc: "润色 + AI 使用标注" },
];

interface Health {
  status: string;
  provider: string;
  model: string;
  mock: boolean;
  configured?: boolean;
}

export default function App() {
  const [active, setActive] = useState<ModuleId>("home");
  const [health, setHealth] = useState<Health | null>(null);
  const [healthErr, setHealthErr] = useState(false);

  const goto: Goto = (target, patch) => {
    if (patch) {
      for (const [key, value] of Object.entries(patch)) writePersisted(key, value);
    }
    setActive(target);
  };

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const probe = async () => {
      try {
        const r = await fetch(apiUrl("/api/health"));
        const data = await r.json();
        if (cancelled) return;
        setHealth(data);
        setHealthErr(false);
      } catch {
        if (cancelled) return;
        setHealthErr(true);
        timer = setTimeout(probe, 2000);
      }
    };
    probe();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand" onClick={() => setActive("home")} data-testid="brand">
          <span className="brand-logo">🧪</span>
          <span className="brand-name">国自然基金申请助手</span>
        </div>
        <nav className="nav">
          {NAV.map((m) => (
            <button
              key={m.id}
              className={`nav-item ${active === m.id ? "active" : ""}`}
              onClick={() => setActive(m.id)}
              data-testid={`nav-${m.id}`}
            >
              <span className="nav-icon">{m.icon}</span>
              <span className="nav-text">
                <span className="nav-title">{m.title}</span>
                <span className="nav-desc">{m.desc}</span>
              </span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          {health ? (
            <span className="status-ok" data-testid="status">
              ● 已就绪 · {health.mock ? "演示模式" : health.model}
            </span>
          ) : healthErr ? (
            <span className="status-wait" data-testid="status">
              ○ 正在连接本地服务…请稍候
            </span>
          ) : (
            <span className="status-wait" data-testid="status">
              ○ 连接中…
            </span>
          )}
          {health && !health.mock && health.configured === false && (
            <span className="status-warn" data-testid="status-warn">
              ⚠ 未配置密钥，请在 backend/.env 填写
            </span>
          )}
        </div>
      </aside>

      <main className="content">
        {active === "home" && <Home onPick={setActive} />}
        {active === "critique" && <CritiqueModule goto={goto} />}
        {active === "rationale" && <RationaleModule goto={goto} />}
        {active === "scheme" && <SchemeModule goto={goto} />}
        {active === "review" && <ReviewModule />}
        {active === "polish" && <PolishModule />}
      </main>
    </div>
  );
}

function Home({ onPick }: { onPick: (m: ModuleId) => void }) {
  return (
    <div className="home">
      <h1>国自然基金申请助手</h1>
      <p className="home-sub">
        从选题诊断到立项依据、研究方案、评审模拟、润色合规，五步陪你打磨一份国自然申请书草稿。
      </p>
      <div className="compliance-banner" data-testid="compliance-banner">
        <strong>⚠ 合规提示：</strong>
        按基金委规定，<strong>不得直接使用 AI 生成的申请书</strong>。AI 仅可用于检索文献、整理资料、
        语言润色等辅助环节，且<strong>必须由本人核实所有内容与参考文献的真实性</strong>，并如实标注 AI 使用情况。
        本工具的所有产出均为草稿与建议，请务必本人改写、核对后再使用。
      </div>
      <div className="home-grid">
        {NAV.map((m) => (
          <button key={m.id} className="home-card" onClick={() => onPick(m.id)} data-testid={`card-${m.id}`}>
            <span className="home-card-icon">{m.icon}</span>
            <span className="home-card-title">{m.title}</span>
            <span className="home-card-desc">{m.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
