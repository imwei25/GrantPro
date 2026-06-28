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

// 把已完成各节(排除 excludeIds)拼成一段带小标题的全文。
export function assembleBody(excludeIds: string[] = []): string {
  return WORKSPACE_SECTIONS.filter((s) => !excludeIds.includes(s.id))
    .map((s) => ({ s, t: (readPersisted<string>(s.key, "") || "").trim() }))
    .filter((x) => x.t)
    .map((x) => `## ${x.s.title}\n\n${x.t}`)
    .join("\n\n");
}
