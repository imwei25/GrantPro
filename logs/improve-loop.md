# improve-loop 自我精进日志

> 自主迭代精进循环的运行记录。每个"改进方向"完成后追加一条，并随即 commit+push。

## 任务地图（项目拆解）

国自然基金申请助手 = 前端 Vite/React + 后端 FastAPI（端口 8766，单进程托管 dist）。

| 编号 | 子任务/模块 | 关键文件 | 职责 |
|---|---|---|---|
| T1 | 选题诊断 critique | `prompts.py:build_critique` `modules/CritiqueModule.tsx` | 评审视角挑硬伤、定科学问题属性 |
| T2 | 立项依据 rationale | `rationale.py` `literature.py` `modules/RationaleModule.tsx` | PubMed 检索→接地撰写→引用核验（SSE 多阶段）|
| T3 | 研究方案 scheme | `prompts.py:build_scheme` `modules/SchemeModule.tsx` | 目标·内容·关键问题·技术路线+Mermaid |
| T4 | 评审模拟 review | `prompts.py:build_review` `modules/ReviewModule.tsx` | 三位评审独立挑刺 |
| T5 | 润色合规 polish | `prompts.py:build_polish` `compliance.py` `modules/PolishModule.tsx` | 润色为基金书面语 + AI 标注 |
| T6 | LLM 适配层 | `llm.py` | openai/anthropic 双格式、mock、配额自动降级 |
| T7 | 文档抽取/导出 | `extract.py` `formatting.py` `lib/extract.ts` `lib/download.ts` | 上传文档抽取纯文本、导出 docx |
| T8 | 前端交互/壳 | `App.tsx` `lib/sse.ts` `lib/useStream.ts` `lib/api.ts` `styles.css` | 导航、健康检查、SSE 流、持久化、下载 |
| T9 | 配置/部署/脚本 | `config.py` `main.py` `scripts/*.ps1` `*.bat` | 启动、局域网、环境配置、CORS |
| T10 | 错误处理/健壮性 | 跨层 | 超时、空输入、上游错误、并发中止 |

## 验证基线

（下方按时间顺序追加每个方向的日志）

- 后端 mock 自测：✅ 全 [OK]（critique/scheme/review/polish/rationale/compliance）
- 前端 `npm run build`：✅
- Playwright 真实浏览器用户测试：✅ 20/20（首页+5模块+无 JS 报错）

---

### [轮次 1 · T8/T10] 新增 Playwright 端到端"真实用户"测试
- 现状/问题：项目只有后端 mock 冒烟（selftest.py），没有任何浏览器端到端测试；"像真实用户那样测试"无法复现。
- 改进：新增 `frontend/e2e/usertest.mjs`（驱动 Chromium 走通首页+5模块、断言流式输出/导出按钮/引用核验/无 JS 报错），`scripts/usertest.ps1` 一键"构建→MOCK 起后端→跑 e2e→停服务"，并把 `playwright` 写入 package.json devDependencies + `npm run test:e2e`。
- 验证：mock=✅ build=✅ 真实测试=✅ 20/20 通过（首页/critique/scheme/review/polish/rationale 全绿，无 pageerror/console.error）。
- 提交：`81eeca6`

### [轮次 1 · T7] docx 导出修复 Markdown 链接/加粗与中文字体
- 现状/问题：导出 Word 时 `[作者, 年份](URL)` 与 `**加粗**` 原样变成字面字符（立项依据全是 Markdown 链接，受害最深）；`宋体` 未设 `w:eastAsia`，中文未必真用宋体。
- 改进：`formatting.py` 新增内联解析——`[文字](URL)` 转为真实可点击超链接（蓝色下划线、关系写入 rels），`**加粗**` 转为 bold run；标题用 `_plain()` 压平；Normal 样式补 `w:eastAsia=宋体`。新增 `backend/test_formatting.py` 离线校验。
- 验证：mock=✅（无回归）单测=✅ 9/9 真实测试=✅ 重启服务后 `POST /api/docx` 返回有效 docx，解包确认 w:hyperlink/URL 入 rels/无字面 `](`/w:b 加粗/eastAsia 宋体 全部命中。
- 提交：`4d727e4`

### [轮次 1 · T8] 修复复制按钮在局域网(非安全上下文)下静默失败
- 现状/问题：项目主打局域网部署（`局域网部署.bat`），但经 `http://192.168.x.x` 访问时非安全上下文，`navigator.clipboard` 为 undefined，`ResultPanel.copy()` 无降级无 try/catch，点"复制"抛未捕获异常且无任何反馈。
- 改进：新增 `lib/clipboard.ts` 的 `copyText()`——安全上下文用 Clipboard API，否则回退隐藏 textarea + `execCommand("copy")`，始终返回成功与否；`ResultPanel` 改用它并展示"已复制/复制失败"。e2e 加复制反馈断言。
- 验证：build=✅ 真实测试=✅ 21/21（新增"复制按钮有结果反馈"显示"已复制"，无 pageerror）。
- 提交：`950f6b7`

### [轮次 1 · T2] PubMed 检索健壮性：限速 + 429 退避重试 + api_key + UA
- 现状/问题：`literature.py` 无限速、无重试、无 api_key、无 User-Agent；一次立项依据连发 3×esearch+1×efetch，易触发 NCBI 3 次/秒限速返回 429，被 `search_literature` 静默吞成"未检索到文献"。
- 改进：新增 `_throttled_get()`——进程级最小请求间隔（无 key 0.4s/有 key 0.12s）+ 锁串行化 + 对 429/5xx/网络抖动指数退避重试（0.6/1.2/2.4s）+ 设 User-Agent；esearch/efetch 全部走它。config 增 `NCBI_API_KEY`（10 次/秒），`.env.example` 补文档。新增 `backend/test_literature.py` 离线校验。
- 验证：mock=✅（无回归）单测=✅ 6/6（api_key 注入、429 重试成功、持续 429 抛出、带 UA）。
- 提交：`d77df13`

### [轮次 1 · T2/T7] 立项依据增加"导出 Word"
- 现状/问题：立项依据是引用最密集的旗舰输出，却只能导出 Markdown，没有 Word；而方向 B 刚把 docx 超链接支持修好正是为它服务，能力闲置。
- 改进：`lib/download.ts` 抽出公共 `downloadDocx()`（含错误返回）；`ResultPanel` 改用它（去掉重复 fetch）；`RationaleModule` 抽 `composeMarkdown()`（正文+参考文献链接）供 MD/Word 共用，新增"导出 Word"按钮，失败走模块 error 提示。e2e 加该按钮断言。
- 验证：build=✅ 真实测试=✅ 22/22（新增"[rationale] 完成后有导出Word按钮"，无 pageerror）；docx 端到端有效性已在方向 B 验证。
- 提交：`7c397dd`

### [轮次 1 · T10] 后端端点健壮性：上传大小上限 + docx 友好错误
- 现状/问题：`/api/extract` 用 `await file.read()` 无上限，配合局域网部署有 OOM 风险；`/api/docx` 若 build_docx 抛错返回裸 500 无可读信息。
- 改进：`/api/extract` 改为分块读取，累计超 20MB 即中止并返回友好提示，避免整体读入内存；`/api/docx` 包 try/except，失败返回 400 + JSON 错误信息。
- 验证：mock=✅（无回归）真实测试=✅ 22/22；curl 实测：正常 docx→200 PK 有效文件、小 txt 抽取 ok、22MB 文件→`{"ok":false,"error":"文件过大…"}`。
- 提交：`5c79ca5`

---

## 轮次 1 小结（收敛验证）

全套测试绿：后端 mock 自测 `[OK]`、test_formatting 9/9、test_literature 6/6、Playwright e2e 22/22。

已落地 6 个方向：
1. T8/T10 端到端用户测试框架（`81eeca6`）
2. T7 docx 导出修复 Markdown 链接/加粗 + 中文字体（`4d727e4`）
3. T8 复制按钮局域网静默失败修复（`950f6b7`）
4. T2 PubMed 限速/429 重试/api_key（`d77df13`）
5. T2/T7 立项依据导出 Word（`7c397dd`）
6. T10 后端上传上限 + docx 友好错误（`5c79ca5`）

**已知遗留 bug：0。** 剩余可提方向均属"功能增强"而非缺陷修复，已记入下方候选，待确认是否继续：
- T3/T8 Mermaid 流程图渲染：研究方案提示词产出 ```mermaid``` 代码块，前端目前显示原始代码（提示词原意是"便于绘图"，用户自行取用，未必算 bug）。渲染需引入 mermaid 依赖（约 +500KB 打包体积）。
- T8 remark-gfm：渲染 GFM 表格/删除线/自动链接。但现有提示词产出以标题+分点为主、引用用显式 Markdown 链接，实际收益有限。

---

## 轮次 2（用户确认继续自主多轮）

### [轮次 2 · T3/T8] Mermaid 流程图渲染
- 现状/问题：研究方案提示词产出 ```mermaid``` 代码块，前端只显示原始代码，用户看不到流程图。
- 改进：新增 `components/Mermaid.tsx`——动态 `import("mermaid")` 懒加载（独立 chunk，不拖累首屏）、`parse(suppressErrors)` 先校验（流式半成品/非法时回退原始代码，无控制台噪声）、`securityLevel: strict`、暗色主题；`Markdown.tsx` 接管 `code` 渲染 mermaid；`styles.css` 加流程图/加载/回退样式。演示模式 mock 在研究方案场景附带示例流程图（无密钥也能看到效果、可被 e2e 验证）。
- 验证：build=✅（mermaid 代码分割为 634KB+ 懒加载 chunk，首屏 JS 不变）mock=✅ 单测=✅ 9/9+6/6 真实测试=✅ 23/23（新增"[scheme] Mermaid 流程图渲染为 SVG"，无 pageerror/console.error）。
- 提交：`c7caa2c`

### [轮次 2 · T8] remark-gfm：表格 / 删除线 / 自动链接
- 现状/问题：react-markdown 默认不支持 GFM，模型若产出 Markdown 表格会渲染成一行纯文本（错乱），裸 URL 也不可点击。
- 改进：`Markdown.tsx` 接入 `remark-gfm`；`styles.css` 加表格样式；演示模式 mock 在评审模拟场景附带一个 GFM 表格（展示渲染、可被 e2e 验证）。
- 验证：build=✅ mock=✅ 真实测试=✅ 24/24（新增"[review] GFM 表格渲染为 <table>"，无 pageerror/console.error）。
- 提交：`ed692ef`

### [轮次 2 · T9] 补齐 README 测试文档与目录结构（文档漂移）
- 现状/问题：本轮新增的 Playwright e2e、后端离线单测、`scripts/usertest.ps1`、`npm run test:e2e`、Mermaid/GFM 等均未反映在 README，「测试」小节只剩 selftest，文档与现状不一致。
- 改进：README 目录结构补 `test_formatting.py`/`test_literature.py`/`e2e/`/`Mermaid` 等；「测试」小节新增后端离线单测与一键 e2e（`scripts/usertest.ps1` / `npm run test:e2e`）的用法。
- 验证：真实测试=✅ 实跑文档承诺的 `scripts/usertest.ps1` 一键流程，构建→MOCK 起后端→Playwright 24/24→停服务→`E2E PASSED`，路径属实。
- 提交：`4514e77`

### [轮次 2 · T5/T8] 接通合规自查清单 + AI 标注模板到首页
- 现状/问题：后端 `/api/compliance` 提供 6 条"提交前自查清单"与可复制的 AI 使用标注模板，但前端从不调用，这份与"合规第一"定位直接相关的内容用户完全看不到（半成品/死端点）。
- 改进：新增 `components/CompliancePanel.tsx`——拉取 `/api/compliance`，以可折叠面板展示自查清单（逐条对照红线）与标注模板（复用 `copyText` 一键复制、有反馈）；接入首页流水线下方；`styles.css` 配套样式。e2e 加面板/清单/复制断言。
- 验证：build=✅ 真实测试=✅ 27/27（新增"合规自查面板存在/自查清单6条/标注模板可复制"，无 pageerror/console.error）。
- 提交：`bad5a0d`

---

## ✅ 已收敛（轮次 2 结束）

收敛验证全绿：后端 mock `[OK]`、test_formatting 9/9、test_literature 6/6、Playwright e2e **27/27**。

两轮共落地 **10 个方向**（每个均：调研→改进→真实浏览器测试→日志→commit+push）：
1. `81eeca6` 端到端"真实用户"测试框架（Playwright + 一键 usertest.ps1）
2. `4d727e4` docx 导出修复 Markdown 链接/加粗 + 中文东亚字体
3. `950f6b7` 复制按钮局域网（非安全上下文）静默失败修复
4. `d77df13` PubMed 限速 / 429 退避重试 / api_key / UA
5. `7c397dd` 立项依据增加"导出 Word"
6. `5c79ca5` 后端上传 20MB 上限 + docx 友好错误
7. `c7caa2c` 研究方案 Mermaid 流程图渲染（懒加载/失败回退）
8. `ed692ef` Markdown 支持 GFM 表格/删除线/自动链接
9. `4514e77` README 测试文档与目录结构补齐
10. `bad5a0d` 首页接通合规自查清单 + AI 标注模板

**已知遗留 bug：0。** 测试覆盖从"仅后端 mock 冒烟"扩展到"后端单测 + 真实浏览器端到端 27 项"。

### 刻意不做（低价值打磨，避免过度工程）
- 无障碍细节（nav `aria-current`、清单可勾选交互）：纯锦上添花，无功能缺陷。
- 健康检查断连后重探活：当前桌面/局域网场景下后端常驻，收益极低。
- 提示词措辞微调（T1–T5）：主观且难以客观验证，易引入回退，不在无密钥 mock 下可测。

收敛理由：剩余可提项均为上述低价值打磨或主观调整，无客观可验证收益且有引入回退的风险；功能性缺陷与文档漂移已清零。如需深入某一具体方向（如真正接入 LLM 的提示词 A/B、桌面 Tauri 打包），可另行发起。

---

## 轮次 3（用户要求再调研后开启）

再调研发现：移动端实测无横向溢出、可正常使用（不构成方向）；但**「流水线」缺一键汇总成稿**——5 个模块各自持久化结果却无法拼成完整材料导出，而 `formatting.py` 自述就是"汇总导出"，UI 从未实现。

### [轮次 3 · T7/T8] 首页「工作台汇总」一键汇总导出
- 现状/问题：应用是「选题→依据→方案→评审→润色」五道工序流水线，每节结果存于 `<module>:result`，但没有把已完成各节拼成一份完整 Word/Markdown 的能力，用户需手动复制五次。
- 改进：新增 `components/WorkspaceSummary.tsx`——读取各模块持久化结果，展示「已完成 N/5 节」与逐节字数（点击可回到该模块），一键「汇总导出 Word / Markdown」（按 `# 节标题` 分节、立项依据自动附参考文献、复用 `downloadDocx/downloadText`）；新增 `readPersisted()` helper；接入首页；配套样式。e2e 加汇总出现/节数/导出触发下载/无错误断言。
- 验证：build=✅ 真实测试=✅ 31/31（新增"工作台汇总出现/含5节/导出Word触发下载/无错误"，无 pageerror/console.error）；桌面截图视觉确认。
- 提交：`9f99b64`

### [轮次 3 · T8] 模块内 Ctrl/⌘+Enter 提交
- 现状/问题：填完表单只能用鼠标点按钮运行，长文本场景下手不顺。
- 改进：新增 `lib/useCtrlEnterSubmit.ts`（window 级监听，转发到各模块已带守卫的 submit），接入全部 5 个模块；运行按钮加 `title="Ctrl / ⌘ + Enter 提交"` 提示。
- 验证：build=✅ 真实测试=✅ 32/32（新增"Ctrl+Enter 触发运行"，无 pageerror/console.error）。
- 提交：`a44ed25`

### [轮次 3 · T8] 工作台「清空全部 / 新建申请」（二次确认）
- 现状/问题：做完一份申请要开始下一份时，5 个模块的旧输入/结果残留，会污染上面新增的「汇总导出」，却无一键清空。
- 改进：`WorkspaceSummary` 加「清空全部 / 新建申请」按钮——首次点击变「确认清空？（不可恢复）」（3s 内二次点击才执行，避免误删），清掉所有 `nsfc:` 持久化键并隐藏工作台。配套 danger 态样式。e2e 加二次确认/清空消失断言。
- 验证：build=✅ 真实测试=✅ 34/34（新增"清空全部需二次确认/确认后工作台消失"，无 pageerror/console.error）。
- 提交：`36e45ea`

---

## ✅ 轮次 3 收敛

收敛验证全绿：后端 mock `[OK]`、test_formatting 9/9、test_literature 6/6、Playwright e2e **34/34**。

本轮新增 3 个方向（K 工作台汇总导出、L Ctrl/⌘+Enter 提交、M 清空全部），共同把「五道工序流水线 → 汇总成稿」的闭环补齐。README 同步反映新功能。

三轮累计 **13 个方向**，e2e 从 20 项扩展到 34 项，**已知遗留 bug 仍为 0**。剩余仅余主观性提示词调优与需真实 LLM/真机的方向，不在自动化可验证范围内。

---

## 轮次 4（用户要求派 agent 调研同类项目后开启）

调研（general-purpose agent + 自行 web 核实）发现一个**真实业务正确性 bug**，以及若干可借鉴点。本轮先落地已核实、低成本、高价值的修正。

### [轮次 4 · T1] 修正科学问题属性为 2024 年起的「两类」（业务正确性 bug）
- 现状/问题：选题诊断仍按已废止的 **A/B/C/D 四类**（鼓励探索/独辟蹊径/需求牵引/共性导向）归类科学问题属性。经核实（NSFC 官网及多所高校科研处一致），基金委自 **2024 年起已改为两类研究属性**：自由探索类基础研究 / 目标导向类基础研究。旧分类会**误导用户**。
- 改进：`prompts.py:build_critique` 第二节改写为两类及各自定义与评判标准（自由探索类以"原创性/前沿性"、目标导向类以"国家需求/社会需要"）；README 与 使用说明.md 同步；新增 `backend/test_prompts.py` 守卫不退回四类。
- 验证：mock=✅（无回归）单测=✅ `test_prompts` 7/7（含"自由探索类/目标导向类/不含鼓励探索/不含 A 鼓励"）。
- 来源：NSFC「研究属性」页 nsfc.gov.cn/p1/2961/2962/4089/yjsx.html 等多源一致。
- 提交：`93c084b`

### [轮次 4 · T5] 丰富 AI 使用标注模板（披露名称/版本/使用时间）
- 现状/问题：科技部《负责任研究行为规范指引》要求披露所用 AI 的**名称、版本、使用时间**；原标注模板只有工具名、缺版本与时间，也未显式声明"未直接使用 AI 生成的整段材料"。
- 改进：`compliance.py` 标注模板补「名称及版本 + 使用时间」占位与"未直接使用生成式 AI 生成的整段申请材料"声明（保留起止【…】标识）；`build_annotation` 增 `when` 参数；`build_polish` 提示同步要求据实填名称/版本/时间/环节；`test_prompts.py` 加 4 条标注守卫。
- 验证：mock=✅ 单测=✅ test_prompts 11/11；`/api/compliance` 实测返回丰富后的标注；e2e=✅ 34/34 无回归。
- 提交：`08fbb6b`

### [轮次 4 · T4] 评审模拟加「评分汇总表 + 共识弱点排序」
- 现状/问题：评审模拟只有三段文字意见，缺结构化打分与跨评审共识。调研里被最多竞品验证的功能正是"逐要点打分 + 共识弱点"（Granted AI / CriteriaI / 开源 dhiaselmi 均有）。
- 改进：`build_review` 在三段意见后新增两节——「## 评分汇总」（五个固定 NSFC 维度 × 三位评审的 GFM 表格，复用已上线的表格渲染）与「## 共识弱点（按严重度排序）」；评审 mock 改为输出评分汇总表 + 共识弱点（演示模式即可见、可测）。雷达图需可靠结构化打分（易碎的流式数字解析），留作后续 JSON 化方向。
- 验证：mock=✅ 单测=✅ test_prompts 14/14（评分汇总/共识弱点/五维度）真实测试=✅ 35/35（"[review] 评分汇总渲染为 <table>"+"含五维度评分"）。
- 提交：`971202a`

---

## ✅ 轮次 4 收敛

收敛验证全绿：mock `[OK]`、test_prompts 14/14、test_formatting 9/9、test_literature 6/6、e2e **35/35**。

本轮由「派 agent 调研同类项目 + 自行 web 核实」驱动，落地 3 个方向：N 修正科学问题属性两类（业务正确性 bug）、O 丰富 AI 标注（名称/版本/时间）、P 评审评分汇总表+共识弱点（竞品最常见功能）。

四轮累计 **16 个方向**；后端测试增至 4 个文件、e2e 35 项；**已知遗留 bug 仍为 0**。

### 调研得出但本轮未做（成本/数据门槛较高，建议下一轮按需选做）
- 引用核验强化：PMID/DOI 强制回查 Crossref + 论点支持度标注（中成本，复用现有 PubMed 基建，可 mock 验证）。
- 多文献源：立项依据增 Crossref / Semantic Scholar（覆盖非医学学科，S2 Graph API 免费）。
- 相似已立项项目查重提示（受 NSFC 立项数据可得性限制，中高成本）。
- 指南条目解析 + 完成度追踪清单（复用现有文档抽取 + 自查清单）。
- 待核实后再做：2026 正文是否重构为「立项依据/研究内容/研究基础」三大板块——若属实可调整汇总导出模板（需先逐字核对官方指南 PDF）。

---

## 轮次 5（用户要求继续）

落地调研里"中成本、高价值、可 mock 验证"的首选：多文献源。

### [轮次 5 · T2] 立项依据多文献源：新增 Crossref（覆盖非医学全学科）
- 现状/问题：立项依据只检索 PubMed（生物医学为主）；国自然占多数的非医学学科（材料/物理/化学/工程/生态）几乎检索不到文献，文献接地形同虚设。
- 改进：`literature.py` 新增 `crossref_search()`（全学科、免费、无需 key，礼貌池带 mailto），与 PubMed 同构 schema（用 DOI 作标识）；`search_literature` 重构为多源检索 + 按标题归一跨源去重（PubMed 优先）；PubMed 记录补 DOI 提取。`rationale.py` 文案/引用核验改为同时支持 PMID+DOI，并把核验逻辑抽成可测的 `verify_citations()`；references 负载带 `doi`、`source`。前端 `Reference` 加 `doi`、参考文献标注来源（PubMed/Crossref）、未核验项按 DOI/PMID 智能链接。
- 验证：mock=✅ 单测=✅ `test_literature` 16/16（Crossref 解析/去 JATS/空年份防 None/跨源去重）+ 新增 `test_rationale` 8/8（PMID/DOI 大小写、真假混合核验）真实测试=✅ 36/36（"参考文献含 Crossref 源"）。**真实 Crossref API 实测**：以"perovskite solar cell""graphene oxide membrane"等非医学查询返回真实带 DOI 论文（PubMed 搜不到），证明覆盖面扩展生效。
- 提交：`2dd3c25`（含 README/使用说明 同步多文献源）

---

## ✅ 轮次 5 收敛

收敛验证全绿：mock `[OK]`、test_prompts 14/14、test_formatting 9/9、test_literature 16/16、test_rationale 8/8、e2e **36/36**；真实 Crossref API 实测通过。

五轮累计 **17 个方向**；后端测试 5 个文件、e2e 36 项；**已知遗留 bug 仍为 0**。本轮去掉了"立项依据只对生物医学有效"的硬限制。

剩余候选（同前，成本/数据门槛较高）：相似已立项项目查重、指南条目解析完成度清单、Semantic Scholar 第三源、评审打分 JSON 化 + 雷达图、待核实的 2026 三板块导出模板。

---

## 轮次 6（用户要求补 Semantic Scholar）

先核实：Semantic Scholar Graph API 检索**不强制 key**，但**无 key 的共享池实测 5 次重试全 429、基本不可用**（真实 API 验证）。无条件常开会让每次立项依据白白重试 429、拖慢体验。故采用「可选第三源 + 免费 key 门控」。

### [轮次 6 · T2] Semantic Scholar 作可选第三文献源（key 门控）
- 现状/问题：上一轮已加 Crossref；可再补 Semantic Scholar 扩大覆盖，但其 keyless 共享池基本不可用。
- 改进：`literature.py` 新增 `semantic_scholar_search()`（标识优先级 DOI>PMID>paperId，带 `x-api-key`），`_throttled_get` 支持自定义 headers；`_default_sources()` 仅在配置 `S2_API_KEY` 时才纳入该源（默认无 key 即跳过，零影响、不刷 429）；config 增 `S2_API_KEY`，`.env.example` 注明 keyless 不可用。references 负载补 `source`，前端按真实来源显示标签（PubMed/Crossref/Semantic Scholar，修正了 S2 带 DOI 被误标 Crossref 的问题）。
- 验证：mock=✅ 单测=✅ `test_literature` 24/24（S2 解析三类标识/跳过无标题/带 x-api-key/有无 key 的源门控）+ test_rationale 8/8 真实测试=✅ 36/36。S2 实时路径需免费 key（环境无 key）；端点实测返回 429（说明 URL/参数有效、仅限流），默认门控关闭故对用户零风险。
- 提交：`871909c`

---

## 轮次 7（用户设定每 30 分钟自动跑；本轮为立即执行）

### [轮次 7 · T4] 评审评分雷达图（纯前端 SVG，无依赖）
- 现状/问题：上一轮加了"评分汇总"表，但只是表格；竞品（Granted AI 等）用可视化更直观。
- 改进：新增 `components/ReviewRadar.tsx`——从评审输出的"评分汇总"表解析五维度评级（优=4/良=3/中=2/差=1，三评审取均分），用纯 SVG 画雷达图（网格+轴+标签+数据多边形）；解析不到≥3 维度则优雅隐藏（兼容真实 LLM 不规范输出）；接入 `ReviewModule`（结果完成后显示）；配套样式。
- 验证：build=✅ 真实测试=✅ 37/37（新增"[review] 评分雷达图渲染"，断言 `polygon.radar-data` 可见）；桌面截图确认五边形雷达视觉效果。
- 提交：`5cc0284`

### [轮次 8 · T5/T7] 工作台汇总导出自动附「AI 使用标注」
- 现状/问题：基金委要求材料附生成式 AI 使用标识，但「工作台汇总」导出的完整稿没带标注，用户易漏。
- 改进：`WorkspaceSummary` 拉取 `/api/compliance` 的标注模板，`compose()` 在汇总稿末尾追加「# 生成式 AI 使用标注」一节（Word/Markdown 同享）；取不到模板时优雅不附；文案提示"末尾自动附 AI 使用标注"。
- 验证：build=✅ 真实测试=✅ 39/39（新增：实读导出的 Markdown 文件，断言含各节标题 + `# 生成式 AI 使用标注` + `【生成式人工智能使用说明】`）。
- 提交：`b15c04b`

### [轮次 9 · T8] 五个模块加「填入示例」一键示例输入
- 现状/问题：目标用户是非专家科研人员，首次面对空白表单不知该填什么（提示词设计目标本就是"降低普通用户使用门槛"）。
- 改进：新增 `lib/examples.ts`（五个模块的真实虚构示例：肠道菌群-帕金森选题等）；选题/立项/方案/评审/润色各加「填入示例」按钮（置于"清空"旁），一键填好必填项，可直接运行看效果。
- 验证：build=✅ 真实测试=✅ 41/41（新增"填入示例填好必填项/运行按钮可用"，并在示例后运行恢复该节供工作台汇总断言）。
- 提交：`a5c93a1`

### [轮次 10 · T8] 结果就地编辑
- 现状/问题：AI 产出是只读 Markdown，但写作工具里用户几乎总要在导出/串到下一步前微调草稿，之前只能复制到外部编辑器改。
- 改进：`ResultPanel` 增可选 `onTextChange`，提供时显示「编辑/完成编辑」切换——编辑态把渲染 Markdown 换成 `textarea` 绑定持久化文本；四个用 ResultPanel 的模块（选题/方案/评审/润色）传入各自持久化 setter，故编辑直接写回 localStorage，导出 MD/Word 与"送下一步"自动用改后版本。配套样式。
- 验证：build=✅ 真实测试=✅ 42/42（新增"结果就地编辑生效"：编辑追加标记→完成→渲染结果含该标记）。
- 提交：`a675b49`

### [轮次 11 · T8/T4] 工作台「送全文去评审模拟」（闭合流水线）
- 现状/问题：评审模拟只能手动粘贴；用户写完五节后最想把**整份装配材料**作为整体评审，而非逐段。
- 改进：`WorkspaceSummary` 加「送全文去评审模拟」按钮——把申请书实质内容各节（排除"评审模拟"这一元节点，避免把评审输出回灌）汇成整体，`writePersisted("review:text")` 后 `onPick("review")` 跳转，复用既有跨模块预填机制。闭合"流水线→汇总→整体评审"。
- 验证：build=✅ 真实测试=✅ 43/43（新增"送全文跳到评审且预填内容"：跳转后评审输入框含立项依据/研究方案内容，780 字）。
- 提交：`dc92238`

### [轮次 12 · T8] 本地存档：导出/导入 .json + 清空前自动备份（数据安全底座）
- 来源：派 agent 从用户视角审视，**首选第 1 条**。现状最高严重度风险——所有内容只存在浏览器 localStorage 单槽，换机/清缓存/隐私模式/手滑"清空全部"（仅一次 3 秒确认）即全没，几周心血无任何找回手段。
- 改进：新增 `lib/archive.ts`（收集全部 `nsfc:` 键打包 JSON 导出；导入仅接受 `nsfc:` 前缀字符串值后回填）；新增 `ArchiveBar.tsx` 常驻首页（即使工作台为空也能导入），含导出/导入按钮 + "内容仅存本机，建议定期导出"提示；`WorkspaceSummary.clearAll` 在清空前自动下载一份快照。纯前端、无后端、契合单机无云端约束。
- 验证：build=✅ 真实测试=✅ 45/45（新增"存档导出含模块数据"+**往返验证**"导入存档后内容恢复"：导出→清空全部→导入同一文件→reload→工作台内容恢复）。
- 提交：`21846ac`

### [轮次 13 · 新模块] 新增「项目摘要」工序（06，从全文凝练）
- 来源：派 agent 的首选第 2 条。NSFC 必填项、流水线肉眼可见的缺口；摘要最该由全文反向凝练（信息都在工作台）。
- 改进：后端 `prompts.py` 加 `build_abstract`（中文摘要~400字 + 关键词 + 英文 Abstract/Keywords，铁律：只压缩提炼、不新增、不编造）并注册进 `_BUILDERS`；新增 `lib/workspace.ts`（`WORKSPACE_SECTIONS` + `assembleBody()` 复用装配逻辑）；新增 `AbstractModule.tsx`（含「拉取工作台全文」一键带入各节、填入示例、可编辑结果、导出），走既有 `/api/run` 流式通道零新端点；`App.tsx` 加 06 导航卡 + `doc` 图标 + 渲染。
- 验证：mock=✅ 单测=✅ `test_prompts` 17/17（中文摘要/英文/关键词/不编造）真实测试=✅ 47/47（"流水线6张卡片"+"[abstract] 示例填好/流式输出到达"）；首页截图确认六卡片布局无破版。
- 提交：`0e09281`（+ 文档同步 `d70a937`）

### [轮次 14 · T5] AI 使用标注自动预填（消除手填摩擦）
- 来源：派 agent 的第 3 条（S 级）。标注模板的工具名/时间/环节占位符，系统其实已知道（配置的模型、当前日期、用过哪些模块），却让用户手填。
- 改进：后端 `compliance_info(tool, when, scenes)` 默认用 `settings.model` 作工具名、当前年月作使用时间；`/api/compliance` 加可选 query 参数；前端 `lib/workspace.ts` 加 `usedScenes()`（按已有结果的模块推断"文献检索/思路梳理/语言润色"），`CompliancePanel` 与 `WorkspaceSummary` 取标注时带上 `?scenes=`。
- 验证：mock=✅ 单测=✅ `test_prompts` 20/20（自动填模型名/当前年份/显式参数可覆盖）真实测试=✅ 48/48（"标注自动预填模型名与年份"）；curl 实测 `/api/compliance?scenes=文献检索` 返回「名称及版本：deepseek-chat；使用时间：2026年6月…文献检索」。
- 提交：`2d587a7`

### [轮次 15 · T5/T8] AI 写作痕迹自检（去 AI 味，纯本地启发式）
- 来源：派 agent 第 5 条，最贴合"合规第一"定位、直击用户"怕被判 AI 代写"的核心担忧。
- 改进：新增 `lib/aiTells.ts`（纯本地、无 LLM/无联网，检测三类：精选空泛套话词库、单个连接词偶用≥4、过长句>80字）；`AiTellsCheck.tsx` 只提示不强改（命中 0 显示"未发现明显痕迹，仍建议人工通读"）；接入润色模块，自检"待润色草稿"。阈值偏保守、词库精选以避免误杀。
- 验证：build=✅ 真实测试=✅ 50/50（"AI 痕迹自检标记套话"：含套话草稿命中 4 处；"干净文本通过"：正常文本显示未发现）——纯 TS 逻辑经浏览器双分支验证。
- 提交：`afbe31f`

### [轮次 16 · T4] 评审→修订闭环（据评审生成修订建议）
- 来源：派 agent 第 6 条。评审给了"共识弱点排序"却是断头路——没有据此把弱点定位回草稿、给出针对性改写的下一步。
- 改进：后端 `build_revise`（输入草稿+评审意见，逐条：复述问题→定位草稿相关部分→给可执行改法，末附"## 修改优先级"，不替申编造）并注册；`ResultPanel` 加 `idPrefix` 让同页可放第二个结果面板（testid 加前缀，默认不变、不影响既有 e2e）；`ReviewModule` 评审完成后显示"据评审生成修订建议"按钮，跑第二个 `review:revise` 流，结果在 `idPrefix="revision"` 的 ResultPanel 展示（可编辑/导出）。就地集成，不新增模块。
- 验证：mock=✅ 单测=✅ `test_prompts` 22/22（含修改优先级/注入草稿与评审）真实测试=✅ 51/51（"[review] 据评审生成修订建议"：第二面板产出）。
- 提交：`396cdaa`

### [轮次 17 · T8] 篇幅仪表（字数 + 建议区间 + 超纲提示）
- 来源：派 agent 第 4 条（队列最后一项）。`ResultPanel` 此前不显示字数，用户反复去 Word 数字数、不知道写多长。
- 改进：`ResultPanel` 增字数显示（始终）+ 可选 `targetRange` 篇幅仪表（"X 字 · 建议 A–B 字"，偏短/偏长变色 + "以当年指南为准"）；项目摘要应用 `[300, 450]`（NSFC 摘要约 400 字，最明确的长度约束）。
- 验证：build=✅ 真实测试=✅ 52/52（"[abstract] 显示篇幅仪表"：mock 摘要 113 字→"建议 300–450 字（偏短）"）。
- 提交：`0b9a950`

### [轮次 18 · T3] 研究方案补「年度研究计划 + 预期研究结果」（正文必填章节补全）
- 来源：第二次派 agent，其判断"总体 C 偏 B、基本可收"，但指出**唯一结构性缺口**——`build_scheme` 停在"可行性+自检"，缺 NSFC 正文必填的年度计划与预期成果（非质量打磨、低幻觉风险）。
- 决策：采用比 agent「新增第 7 模块」更高 ROI 的实现——直接扩展研究方案提示词（年度计划本属研究方案，扩展避免导航膨胀与手动再喂）。
- 改进：`build_scheme` 在可行性后新增"## 六、年度研究计划"（按执行期分年表格）与"## 七、预期研究结果"（可考核成果、务实不夸大），自检顺延为八；SchemeModule 头部描述、README/使用说明同步。
- 验证：mock=✅ 单测=✅ `test_prompts` 24/24（含年度研究计划/预期研究结果）真实测试=✅ 52/52 无回归。
- 提交：见下方 commit。

> ⚠ Agent 同时明确：做完此项正文骨架即完整，**之后就是 B、该停了**。下一轮我将据此做收敛判断。

---

## ⏹ 已停止 loop（满足规则 5：调研下来无值得改的方向）

**停止时间**：第 18 轮后。**已取消定时任务** `e11eca35`（不再每 30 分钟触发）。

**停止理由**：
- 连续两次独立调研（我自己的逐轮 ideation + 两次派 general-purpose agent 从真实用户视角审视）均收敛到同一结论：质量/诊断/合规/工作流各轴已被现有功能覆盖；最近一次 agent 明确判定 **总体 C 偏 B、基本可收**，其指出的**唯一**值得做的结构性缺口（研究方案缺"年度计划+预期成果"）已在第 18 轮实现。
- 剩余可设想项均被判为低 ROI 或不满足硬约束：引用语义级核验（mock 下无法可信验证、易成花架子）、经费预算模块（强政策时效性、AI 答错=合规风险）、研究基础（纯事实、润色模块已覆盖）、撞题库自查/多申请管理（触碰不可爬数据或 archive 已覆盖）。
- 继续每 30 分钟空转只会反复确认"无值得改"，按规则 (4)(5) 应停。

**最终状态**：18 轮共 **30 个改进方向**，每个均"调研→实现→真实浏览器 e2e + 后端离线单测→日志→commit+push"。测试：后端 mock 自测 `[OK]`、`test_prompts` 24/24、`test_formatting` 9/9、`test_literature` 24/24、`test_rationale` 8/8、Playwright e2e **52 项**。**已知遗留 bug：0。**

**若后续想重启**：可再发 `/loop 30m <同样的指令>`；或当 NSFC 出新政策/指南时，针对性地起一轮（如核对正文板块结构、合规要求更新）。

---

## 轮次 19（用户重启 loop · 派 agent 调研 + web 核实 2026 改版）

重启后派 general-purpose agent 从挑剔评审视角再调研，并自行 web 核实：**2026 年面上/青年(C 类)申请书已正式改版**（NSFC 官网通告、香港中文大学(深圳)官方申请手册、科技日报等多源一致）：① 正文调整为「立项依据 / 研究内容 / 研究基础」三部分，取消固定的「研究方案/技术路线/研究方法」细分条目，研究内容不预设提纲、自主撰写；② 正文篇幅原则上不超过 **30 页**。此即 logs 第 4/18 轮显式挂起的「待核实」缺口，现已被新证据证实——属真实业务正确性缺口，loop 重新开启。

### [轮次 19 · T3/T5] 落实 2026 申请书改版（30 页上限 + 三板块自主撰写）到提示词与合规清单
- 现状/问题：`build_scheme` 仍按固定八节模板引导，未提 30 页上限与「研究内容自主组织」；合规自查清单第 6 条只泛说「格式与字数要求」，未点明 2026 新的 30 页硬上限与三板块结构。仍按改版前结构引导用户会被评审一眼看出「基于过时模板」。
- 改进：`build_scheme` 末尾新增 2026 改版说明（正文三板块、正文≤30 页、研究内容不预设提纲鼓励自主组织、以当年指南为准、避免凑篇幅）；`compliance.py` CHECKLIST 第 6 条具体化为「正文原则上≤30 页 + 立项依据/研究内容/研究基础三部分」；`test_prompts.py` 加 3 条守卫（scheme 含 30 页 / 含研究基础 / 清单含 30 页）。
- 验证：mock=✅（无回归，/compliance 6 条自查清单）单测=✅ `test_prompts` 27/27。
- 来源：nsfc.gov.cn 2026 改版通告、CUHK(SZ) 2026 NSFC 申请手册、科技日报「瘦身提质」报道、知乎/CSDN 多源一致。
- 提交：`63dd165`

### [轮次 19 · T7/T8] 工作台汇总加「正文篇幅红线」（30 页上限可视化）
- 现状/问题：轮次 17 的篇幅仪表只对项目摘要应用 `[300,450]` 字；用户真正会超标的是正文，而「工作台汇总」把各节拼成完整稿导出，对 2026 新的 30 页正文上限零提示。
- 改进：`WorkspaceSummary` 新增正文页数估算——**仅统计构成正文的实质章节（立项依据/研究方案/润色），排除选题诊断、评审模拟这两类不随申请书提交的辅助产出**（避免误算），按 NSFC 模板单页约 1000 中文字符粗估页数；显示「正文约 N 页 · 上限 30 页（2026 新规）」，超 30 页变红警示。配套 `.ws-pagemeter` 样式。e2e 加「显示页数估算 + 标注 30 页上限」断言。
- 验证：build=✅ 真实测试=✅ Playwright **54/54**（新增「工作台显示正文篇幅页数估算」「篇幅仪表标注 30 页上限」，无 pageerror/console.error）；mock 数据下显示「正文约 0.4 页…上限 30 页」。
- 提交：`b88936e`

### [轮次 19 · T2] 立项依据检索式去「医学专属」（与多学科目标对齐）
- 现状/问题：轮次 5 已加 Crossref 号称「覆盖全学科」，但 `rationale.py:_gen_queries` 的 system 提示词仍写死「你是医学/生物医学文献检索专家…适合在 PubMed 检索…使用 MeSH 术语」。非医学课题（钙钛矿/石墨烯等）被要求以医学框架产出 PubMed 式检索式再喂 Crossref——检索式与学科错配，多学科目标在检索式生成层并未真正落地。另：`RationaleModule` 头部文案仍只写「实际检索 PubMed」，未提 Crossref（doc drift）。
- 改进：把检索式提示词抽为模块级 `QUERY_SYSTEM` 常量并改为学科中立的「跨学科科技文献检索专家」（去 PubMed 专有语法/MeSH 硬绑，强调同时适用 PubMed 与 Crossref、按学科酌情用领域术语）；`RationaleModule` 头部改为「实际检索 PubMed 与 Crossref（覆盖医学及材料/物理/化学/工程等全学科）」；`test_rationale.py` 加 3 条守卫（跨学科 / 含 Crossref / 不含医学·MeSH）。
- 验证：mock=✅（无回归）单测=✅ `test_rationale` 11/11 build=✅。
- 提交：`f27a47d`

### [轮次 19 · T5/T9] 文档与自查清单同步 2026 代表作 + 正文结构（doc drift）
- 现状/问题：README/使用说明 全无 2026 改版痕迹；自查清单也没提 2026 新增的「代表作（不超过 5 项）+ 本人贡献说明」（替代传统论文论著目录）这一真实提交要求。用户照旧准备材料会漏项。
- 改进：`compliance.py` CHECKLIST 增第 7 条代表作提醒；README 与 使用说明.md 各加一段「2026 申请书改版提示」（三板块 + 30 页 + 代表作，均注「以当年指南为准」）；`test_prompts.py` 加「自查清单含代表作提醒」守卫。
- 验证：mock=✅ 单测=✅ `test_prompts` 28/28（清单 7 条）真实测试=✅ Playwright **54/54**（"自查清单有条目 共 7 条"，无 pageerror/console.error）。
- 来源：同方向 A（2026 代表作"能力证明"新规多源一致）。
- 提交：`b97d017`

### [轮次 20 · 新模块] 新增「研究基础」工序（04，2026 正文第三板块）
- 来源：再派 general-purpose agent 做收敛再确认，发现**唯一新的、有据可依的缺口**——轮次 19 让工具开始「宣称」正文是立项依据/研究内容/研究基础三板块（提示词/清单/README/篇幅仪表都这么说），但工作流只产出前两块，**篇幅仪表甚至用「润色」顶替缺失的「研究基础」**。即我自己在轮次 19 引入了「宣称三块、只交付两块」的不一致。该缺口此前以「纯事实、润色已覆盖」否决，但研究基础如今是 2026 官方独立正文块，旧理由失效。
- 决策：补一个**「组织器」而非「生成器」**——只在申请人提供的真实前期事实上做归类与润色，绝不新增/编造任何成果、数据、设备、合作；缺失处标注「【需申请人补充】」。沿用轮次 13 摘要模块的成熟范式（`/api/run` 流式，零新端点）。
- 改进：后端 `prompts.py` 加 `build_foundation`（五节结构：工作积累与成果/已有结果与数据/已具备条件/尚缺条件与途径/与本项目衔接 + 自检；铁律严禁编造）并注册进 `_BUILDERS`；新增 `FoundationModule.tsx`（必填前期材料 + 填入示例 + 可编辑结果 + 导出）；`App.tsx` 把它插入为 **04**（研究基础属正文，置于研究方案后），评审/润色/摘要顺延为 05/06/07，新增 `base` 图标；`workspace.ts`/`WorkspaceSummary` 把研究基础纳入工作台汇总与正文页数估算（`BODY_SECTIONS` 加 foundation，仪表文案改为「立项依据/研究方案/研究基础/润色」）；`examples.ts` 加研究基础示例；首页 hero 文案去掉过时的「五道工序」。README/使用说明同步七大能力。
- 验证：mock=✅（无回归）单测=✅ `test_prompts` 31/31（研究基础结构齐全 + 严禁编造 + 注入材料）build=✅ 真实测试=✅ Playwright **56/56**（"流水线7张卡片"+"[foundation] 示例填好/流式输出到达"，正文仪表含研究基础，无 pageerror/console.error）。
- 提交：`fa86520`

---

## ✅ 已收敛（重启后轮次 19–20 结束）

收敛验证全绿：后端 mock `[OK]`、`test_prompts` 31/31、`test_formatting` 9/9、`test_literature` 24/24、`test_rationale` 11/11、Playwright e2e **56/56**。

**重启动因**：用户重新发起 `/improve-loop`。派 agent + 自行 web 多源核实，发现此前「已停止」时挂起的「待核实」项已成事实——**2026 申请书改版**（正文三板块「立项依据/研究内容/研究基础」+ 正文≤30 页 + 代表作≤5 项替代论文目录），属真实业务正确性缺口，故重启。

本次共落地 **5 个方向**（每个均：调研→实现→真实浏览器 e2e + 后端离线单测→日志→commit+push）：
1. `63dd165` 2026 改版落实到研究方案提示词与合规清单（30 页 + 三板块）
2. `b88936e` 工作台汇总加正文 30 页篇幅红线（仅计正文章节）
3. `f27a47d` 立项依据检索式去医学专属、学科中立（服务 PubMed+Crossref 全学科）
4. `b97d017` 文档与自查清单同步 2026 代表作 + 正文结构
5. `fa86520` 新增「研究基础」模块（2026 正文第三板块，组织而非生成、严禁编造）——闭合方向 1 引入的「宣称三板块、只交付两块」不一致

**收敛判断**：两次独立调研（首轮 agent 找到 2026 改版 A + 检索式 B；再确认 agent 仅找到研究基础这一新缺口）均已落地；再确认 agent 明确「此外无高价值工作，其余皆项目早已正当拒绝的低价值打磨」。**已知遗留 bug：0。**

### 刻意不做（低价值，避免过度工程）
- 汇总导出范围 vs 篇幅仪表口径的措辞差异（导出含诊断/评审作工作包，仪表只算正文）：在「申请材料汇总=工作包」框架下可自洽，纯措辞、低 ROI。
- `_mock_flow` 状态串仍只写 "PubMed"：仅演示模式文案，非真实链路。
- 研究方案固定八节 vs「研究内容自主组织」：已在提示词内说明「以当年指南为准、可自主组织」，进一步重构属主观提示词调优。
- 代表作做成完整上传/署名表单：超出「写作助手」职责边界，已用合规清单提醒覆盖。

累计（含历史）：项目测试覆盖后端 4 个离线单测文件 + Playwright e2e 56 项；模块从 6 个增至 7 个（补齐 2026 正文三板块）。如 NSFC 再出新政策/指南，可针对性再起一轮。

---

## 轮次 21（用户再次重启 loop · 派 agent 深度复审，发现 3 个真实正确性 bug）

重启后派 general-purpose agent 以「挑剔产品评审 + 新手用户」视角深读全栈代码，避开 logs 已做/已否决项，找出 6 条有代码证据的方向（其中 3 条高价值正确性 bug、3 条低优先）。逐条核对代码属实，按价值排序逐个落地。

### [轮次 21 · T8] 项目摘要篇幅仪表系统性误报「偏长」修复（旗舰必填模块的坏功能）
- 现状/问题：`AbstractModule` 给 `ResultPanel` 传 `targetRange=[300,450]`，但 `ResultPanel` 用**整块文本**长度判定；而 `build_abstract` 产出 = 中文摘要(~400字)+关键词+英文 Abstract(~250词≈1500字符)+英文关键词。一份**长度完全正确**的摘要整块必然>450，仪表几乎永远显示「偏长」标红——轮次 17 的篇幅仪表在它唯一的落地模块上是坏的。
- 改进：`ResultPanel` 新增 `measureLen?` prop（用于区间判定/计数显示的「有效字数」，默认整块）；`AbstractModule` 提取「## 中文摘要」段长度传入（取不到则回退整块，保证演示/流式中计数仍可见）。e2e 加守卫：编辑面板灌入「~420字中文摘要 + 长英文 Abstract」真实结构，断言判为合适（无 偏短/偏长）。
- 验证：build=✅ 真实测试=✅ Playwright **57/57**（新增「仪表只测中文摘要段(长英文不误报偏长) :: 420 字·建议 300–450 字」，且 mock 整块 113 字仍「偏短」无回归，无 pageerror/console.error）。
- 来源：本轮 agent 第 1 条（最高价值）。**不在** logs 已做/已否决清单（轮次 17 仅验证过 mock 113 字，未验证真实多段产出）。
- 提交：`2df52a5`

### [轮次 21 · T8] 选题诊断(辅助产出)不再喂给摘要凝练/全文评审（修内部口径矛盾）
- 现状/问题：`AbstractModule.pullAll` 调 `assembleBody(["review"])` 只排除评审，**保留 `critique`**；`WorkspaceSummary.reviewable` 也只 `f.id!=="review"`，**保留 `critique`**。而 `critique:result` 是「3 个最可能被毙的硬伤 / 一句话结论(建议更换)」的吐槽文本，不是申请书正文。后果：①「拉取工作台全文」生成摘要时模型会去凝练这段吐槽；②「送全文去评审」时三位评审去评审一份已含自我批判的诊断文本。更矛盾的是同一个 `WorkspaceSummary` 的 30 页 `BODY_SECTIONS` **明确把 critique 排除在正文外**，喂 LLM 时却当正文——口径自相矛盾。
- 改进：`workspace.ts` 新增 `AUXILIARY_IDS = ["critique","review"]`（辅助产出，非正文，不喂 LLM 也不计页数，与 BODY_SECTIONS 口径对齐）；`AbstractModule` 改 `assembleBody([...AUXILIARY_IDS])`；`WorkspaceSummary.reviewable` 改为排除 AUXILIARY_IDS。e2e 加守卫「送评审不含选题诊断辅助产出」。
- 验证：build=✅ 真实测试=✅ Playwright **58/58**（送评审内容由 904→772 字、断言「已排除」选题诊断，无 pageerror/console.error）。
- 来源：本轮 agent 第 2 条。**部分相关但不同**：已否决项是「**导出**含诊断/评审作工作包（纯措辞）」可自洽；而把诊断文本作为 **LLM 输入**去生成摘要/评审是质量缺陷，未被覆盖。
- 提交：见下方 commit。
