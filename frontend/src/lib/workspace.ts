import { readPersisted } from "./usePersistentState";

// 工作台各节(模块结果)的统一定义, 供"汇总/送评审/生成摘要"等跨模块复用。
export const WORKSPACE_SECTIONS = [
  { id: "critique", title: "选题诊断", key: "critique:result" },
  { id: "rationale", title: "立项依据", key: "rationale:result" },
  { id: "scheme", title: "研究方案", key: "scheme:result" },
  { id: "review", title: "评审模拟", key: "review:result" },
  { id: "polish", title: "润色合规", key: "polish:result" },
] as const;

// 把已完成各节(排除 excludeIds)拼成一段带小标题的全文。
export function assembleBody(excludeIds: string[] = []): string {
  return WORKSPACE_SECTIONS.filter((s) => !excludeIds.includes(s.id))
    .map((s) => ({ s, t: (readPersisted<string>(s.key, "") || "").trim() }))
    .filter((x) => x.t)
    .map((x) => `## ${x.s.title}\n\n${x.t}`)
    .join("\n\n");
}
