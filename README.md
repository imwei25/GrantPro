# 国自然基金申请助手

面向科研人员的 AI 辅助**国家自然科学基金（NSFC）申请书**写作桌面应用。
六大能力，覆盖从选题到成稿的关键环节：

| 模块 | 作用 |
|---|---|
| 💡 选题诊断 | 以评审专家视角评估创新性、归类研究属性（自由探索类 / 目标导向类）、挑出最可能被毙的硬伤 |
| 📚 立项依据 | **实际检索 PubMed + Crossref 真实文献**（覆盖全学科），据此撰写立项依据草稿，引用可点击并**自动核验有无编造文献** |
| 🗺️ 研究方案 | 把构想组织成「研究目标—研究内容—关键科学问题—技术路线（含 Mermaid 图）—可行性」 |
| 🧐 评审模拟 | 三位不同背景评审（同行 / 交叉 / 挑刺型）独立打分、挑刺，汇总致命问题 |
| ✍️ 润色合规 | 润色为规范基金书面语，并生成符合基金委要求的**「生成式 AI 使用标注」** |
| 📝 项目摘要 | 从已完成的各节内容**反向凝练**出项目摘要 + 关键词（中英），NSFC 必填项 |

> 首页提供**工作台汇总**：把已完成的各节一键汇总导出为完整 Word/Markdown；并内置**提交前合规自查清单**与 AI 使用标注模板。各模块支持 **Ctrl/⌘+Enter** 提交。

> ⚠️ **合规第一**：按基金委规定，**不得直接使用 AI 生成的申请书**。AI 仅可用于检索文献、整理资料、
> 语言润色等辅助环节，且**必须由本人核实所有内容与参考文献的真实性**，并如实标注 AI 使用情况。
> 本工具的所有产出均为**草稿与建议**，请务必本人改写、核对后再使用。

## 技术架构

```
浏览器 / Tauri 桌面外壳  ──加载──▶  前端 (Vite + React + TS)
                                      │ HTTP /api (SSE 流式)
                                      ▼
                         本地 sidecar (Python FastAPI)
                          · LLM 适配层 (OpenAI/Anthropic 格式 + mock + 自动降级)
                          · 立项依据: PubMed + Crossref 检索 + 文献接地 + 引用核验
                          · 合规模块: AI 使用标注模板 + 提交前自查清单
```

设计原则（沿用「科研助手」的成熟做法）：
- **双格式兼容**：通过 `LLM_PROVIDER` 在 OpenAI 兼容格式（DeepSeek / 硅基流动 / OpenAI）与 Anthropic 格式间切换，改 `backend/.env` 一处即可。
- **自动降级**：主供应商余额不足/配额超限时，自动切到 `FALLBACK_*` 备用供应商继续。
- **文献接地、反幻觉**：立项依据基于真实 PubMed + Crossref 文献（覆盖全学科）撰写，正文生成后回查每个 PMID/DOI 引用，标出疑似编造，直击国自然“禁止编造文献”红线。
- **合规内建**：每个模块的提示词都强调“辅助而非代写”，并内置 AI 使用标注与自查清单。
- **本地优先**：所有处理在本机 sidecar 完成，仅模型调用走你自己的 API。

## 目录结构

```
backend/        Python sidecar
  app/
    config.py       读取 .env 配置
    llm.py          LLM 适配层(OpenAI/Anthropic/mock + 自动降级)
    prompts.py      四个文本模块的提示词(选题诊断/研究方案/评审模拟/润色合规)
    rationale.py    立项依据: PubMed 接地 + 引用核验
    literature.py   文献检索客户端(PubMed + Crossref)
    compliance.py   AI 使用标注模板 + 提交前自查清单
    extract.py      上传文档(Word/PDF/Excel/CSV/txt)抽取纯文本
    formatting.py   导出 Word(.docx, 支持 Markdown 链接/加粗)
    main.py         FastAPI 入口(也托管已构建的前端)
  selftest.py       后端冒烟测试(mock 不花钱)
  test_formatting.py  docx 导出离线校验(链接/加粗/中文字体)
  test_literature.py  PubMed 客户端离线校验(限速/重试/api_key)
  requirements.txt
  .env.example
frontend/       Vite + React 前端
  src/
    App.tsx         导航 + 合规横幅
    modules/        六个模块界面
    lib/            SSE 流式 + 运行 hook + 持久化 + 剪贴板/下载
    components/     Markdown(GFM+Mermaid) / Dropzone / ResultPanel / Mermaid
  e2e/            Playwright 端到端"真实用户"测试
scripts/        安装与启动脚本(setup / dev / serve-lan / usertest)
启动基金助手.bat
```

## 快速开始（开发）

一次性安装：

```powershell
# 在仓库根目录
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
```

配置模型 key：复制 `backend/.env.example` 为 `backend/.env`，填入你的 DeepSeek（或硅基流动 / OpenAI / Anthropic）key。

开发模式（前后端分别热更新）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1
```

单进程模式（先构建前端，由后端一并托管，最接近最终体验）：

```powershell
cd frontend; npm run build; cd ..
# 双击 "启动基金助手.bat"，随后浏览器打开 http://127.0.0.1:8766
```

> 端口用 8766，与「科研助手」(8756) 错开，两者可同时运行。

## 局域网部署（可选）

默认只在本机可用（`HOST=127.0.0.1`，最安全）。若想让**同一局域网**内的其他电脑/手机也能用同一台机器上的服务：

```powershell
# 一键: 自动构建前端、开放防火墙端口、打印可访问的局域网地址，并以 0.0.0.0 监听
powershell -ExecutionPolicy Bypass -File scripts/serve-lan.ps1
# 或双击 "局域网部署.bat"
```

脚本会输出形如 `http://192.168.1.6:8766` 的地址，局域网内其他设备在浏览器打开即可使用（前端走相对路径，自动连同源后端，无需额外配置）。

手动方式：在 `backend/.env` 把 `HOST=127.0.0.1` 改成 `HOST=0.0.0.0`，再正常启动。

> ⚠️ **安全提示**：绑定 `0.0.0.0` 后，局域网内**任何人**都能使用本机的服务，也会**消耗你的模型 API 额度**。请仅在可信网络（如自家/实验室内网）使用；用完切回 `127.0.0.1`。
> 若其他设备连不上，多半是 Windows 防火墙拦截了入站端口——用管理员身份运行上面的脚本即可自动放行，或手动执行 `netsh advfirewall firewall add rule name="GrantPro 8766" dir=in action=allow protocol=TCP localport=8766`。

## 测试

后端冒烟测试（mock 不花钱；real 花极少额度）：

```powershell
cd backend
.venv/Scripts/python.exe selftest.py mock
.venv/Scripts/python.exe selftest.py real
```

后端离线单元测试（不触网、不花钱）：

```powershell
cd backend
.venv/Scripts/python.exe test_formatting.py    # docx 导出: 链接/加粗/中文字体
.venv/Scripts/python.exe test_literature.py    # PubMed: 限速/429 重试/api_key
```

端到端「真实用户」测试（Playwright 驱动真实 Chromium 走通六大模块，MOCK 模式不花钱）：

```powershell
# 一键: 构建前端 → 以 MOCK 起后端 → 跑 Playwright → 收尾停服务
powershell -ExecutionPolicy Bypass -File scripts/usertest.ps1

# 或在已运行(MOCK)后端时, 仅跑 e2e:
cd frontend; npm run test:e2e
```
