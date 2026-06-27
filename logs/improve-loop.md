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
- 提交：见下方 commit。
