import { readPersisted } from "./usePersistentState";

// 工作台各节(模块结果)的统一定义, 供"汇总/送评审/生成摘要"等跨模块复用。
export const WORKSPACE_SECTIONS = [
  { id: "critique", title: "选题诊断", key: "critique:result" },
  { id: "rationale", title: "立项依据", key: "rationale:result" },
  { id: "scheme", title: "研究方案", key: "scheme:result" },
  { id: "foundation", title: "研究基础", key: "foundation:result" },
  { id: "review", title: "评审模拟", key: "review:result" },
  { id: "polish", title: "润色合规", key: "polish:result" },
] as const;

// 根据"实际用过哪些模块"推断 AI 使用环节, 用于自动预填合规标注。无则返回空串。
export function usedScenes(): string {
  const has = (key: string) => (readPersisted<string>(key, "") || "").trim().length > 0;
  const scenes: string[] = [];
  if (has("rationale:result")) scenes.push("文献检索与整理");
  if (["critique:result", "scheme:result", "foundation:result", "review:result", "abstract:result"].some(has)) {
    scenes.push("研究思路梳理与自检");
  }
  if (has("polish:result")) scenes.push("语言表达润色");
  return scenes.join("、");
}

// 申请书"正文"= 2026 三板块(立项依据/研究方案/研究基础)。这是三处共用的唯一口径:
//   · 喂给 LLM 的"全文"(摘要凝练 assembleBody、送全文评审 WorkspaceSummary.reviewable)
//   · 正文页数估算(WorkspaceSummary.BODY_SECTIONS 直接由此派生)
// 刻意排除: 选题诊断/评审模拟(辅助产出, 不随申请书提交; 诊断是吐槽、评审是模拟意见),
// 以及润色稿(正文章节的"重写副本", 含修改说明/AI 标注等非正文噪声, 计入会与被润色原章节重复)。
export const BODY_IDS = ["rationale", "scheme", "foundation"] as const;

// 把"正文三板块"已完成的各节拼成一段带小标题的全文(摘要凝练/送评审复用)。
export function assembleBody(): string {
  return WORKSPACE_SECTIONS.filter((s) => (BODY_IDS as readonly string[]).includes(s.id))
    .map((s) => ({ s, t: (readPersisted<string>(s.key, "") || "").trim() }))
    .filter((x) => x.t)
    .map((x) => `## ${x.s.title}\n\n${x.t}`)
    .join("\n\n");
}
