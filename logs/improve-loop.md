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
- 提交：见下方 commit。
