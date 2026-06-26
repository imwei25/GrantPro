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
- 提交：见下方 commit。
