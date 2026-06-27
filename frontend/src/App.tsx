import { useEffect, useState } from "react";
import { apiUrl } from "./lib/api";
import { writePersisted } from "./lib/usePersistentState";
import CritiqueModule from "./modules/CritiqueModule";
import RationaleModule from "./modules/RationaleModule";
import SchemeModule from "./modules/SchemeModule";
import ReviewModule from "./modules/ReviewModule";
import PolishModule from "./modules/PolishModule";
import CompliancePanel from "./components/CompliancePanel";

export type ModuleId = "home" | "critique" | "rationale" | "scheme" | "review" | "polish";
// 跨模块传递: 把数据写入目标模块的持久化字段, 再切换过去。
export type Goto = (target: ModuleId, patch?: Record<string, unknown>) => void;

interface NavItem {
  id: ModuleId;
  n: string;
  kicker: string;
  title: string;
  desc: string;
  icon: keyof typeof ICONS;
}

// 五个模块是一条真实的工作流水线(选题→依据→方案→评审→润色),
// 编号 01–05 编码的是顺序本身, 而非装饰。
const NAV: NavItem[] = [
  { id: "critique", n: "01", kicker: "DIAGNOSE", title: "选题诊断", desc: "评审视角挑硬伤、定科学问题属性", icon: "target" },
  { id: "rationale", n: "02", kicker: "GROUND", title: "立项依据", desc: "检索真实文献、接地撰写、核验引用", icon: "layers" },
  { id: "scheme", n: "03", kicker: "DESIGN", title: "研究方案", desc: "目标·内容·关键问题·技术路线", icon: "flow" },
  { id: "review", n: "04", kicker: "REVIEW", title: "评审模拟", desc: "三位评审独立打分挑刺", icon: "scope" },
  { id: "polish", n: "05", kicker: "REFINE", title: "润色合规", desc: "润色为基金书面语 + AI 使用标注", icon: "spark" },
];

const ICONS = {
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v3M12 20v3M1 12h3M20 12h3" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
    </>
  ),
  flow: (
    <>
      <circle cx="5" cy="6" r="2.4" />
      <circle cx="19" cy="6" r="2.4" />
      <circle cx="12" cy="18" r="2.4" />
      <path d="M7 7l3.5 9M17 7l-3.5 9" />
    </>
  ),
  scope: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
      <path d="M11 8v6M8 11h6" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3z" />
    </>
  ),
} as const;

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

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
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <defs>
                <linearGradient id="bm" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#35E0D0" />
                  <stop offset="0.5" stopColor="#6E8BFF" />
                  <stop offset="1" stopColor="#A06BF6" />
                </linearGradient>
              </defs>
              <circle cx="16" cy="16" r="13" stroke="url(#bm)" strokeWidth="1.5" opacity="0.5" />
              <path d="M5 19c4-9 18-9 22 0" stroke="url(#bm)" strokeWidth="2" strokeLinecap="round" />
              <circle cx="16" cy="12" r="2.6" fill="url(#bm)" />
            </svg>
          </span>
          <span className="brand-text">
            <span className="brand-name">GrantPro</span>
            <span className="brand-sub">国自然申请工作台</span>
          </span>
        </div>

        <nav className="rail" aria-label="工作流水线">
          <span className="rail-line" aria-hidden="true" />
          {NAV.map((m) => (
            <button
              key={m.id}
              className={`nav-item ${active === m.id ? "active" : ""}`}
              onClick={() => setActive(m.id)}
              data-testid={`nav-${m.id}`}
            >
              <span className="nav-node">
                <span className="nav-num">{m.n}</span>
                <span className="nav-ico"><Icon name={m.icon} /></span>
              </span>
              <span className="nav-text">
                <span className="nav-kicker">{m.kicker}</span>
                <span className="nav-title">{m.title}</span>
                <span className="nav-desc">{m.desc}</span>
              </span>
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          {health ? (
            <span className={`status-pill ${health.mock ? "demo" : "live"}`} data-testid="status">
              <span className="dot" /> {health.mock ? "演示模式" : "在线"}
              <span className="status-model">{health.mock ? "MOCK" : health.model}</span>
            </span>
          ) : healthErr ? (
            <span className="status-pill wait" data-testid="status">
              <span className="dot" /> 正在连接本地服务…
            </span>
          ) : (
            <span className="status-pill wait" data-testid="status">
              <span className="dot" /> 连接中…
            </span>
          )}
          {health && !health.mock && health.configured === false && (
            <span className="status-warn" data-testid="status-warn">
              未配置密钥 · 请在 backend/.env 填写
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
      <div className="hero">
        <span className="eyebrow">NSFC · 国家自然科学基金 · 申请书工作台</span>
        <h1 className="hero-title">
          把一个想法，
          <br />
          打磨成<span className="grad">经得起评审</span>的申请书
        </h1>
        <p className="hero-sub">
          五道工序，一条流水线：从选题诊断到立项依据、研究方案、评审模拟，再到润色与合规标注。
          文献真实接地、引用自动核验，每一步都站在评审专家的对面替你挑刺。
        </p>
        <span className="beam" aria-hidden="true" />
      </div>

      <div className="compliance-banner" data-testid="compliance-banner">
        <span className="cb-tag">合规</span>
        <span>
          按基金委规定，<b>不得直接使用 AI 生成的申请书</b>。本工具仅用于检索文献、整理资料、语言润色等辅助环节，
          所有内容与参考文献<b>须由本人核实真实性</b>并如实标注 AI 使用。一切产出均为草稿与建议。
        </span>
      </div>

      <div className="pipeline" data-testid="pipeline">
        {NAV.map((m) => (
          <button key={m.id} className="stage" onClick={() => onPick(m.id)} data-testid={`card-${m.id}`}>
            <span className="stage-top">
              <span className="stage-num">{m.n}</span>
              <span className="stage-ico"><Icon name={m.icon} /></span>
            </span>
            <span className="stage-kicker">{m.kicker}</span>
            <span className="stage-title">{m.title}</span>
            <span className="stage-desc">{m.desc}</span>
            <span className="stage-go">进入 →</span>
          </button>
        ))}
      </div>

      <CompliancePanel />
    </div>
  );
}
