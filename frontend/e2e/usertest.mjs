// 端到端"真实用户"冒烟测试: 用 Playwright 驱动 Chromium 走通 GrantPro 五大模块。
//
// 前置: 后端需以 MOCK_LLM=true 在 BASE_URL(默认 http://127.0.0.1:8766) 运行,
//       并已 `npm run build` 生成 dist(由后端单进程托管)。
// 运行: node frontend/e2e/usertest.mjs   (或用 scripts/usertest.ps1 一键起停)
//
// 退出码 0 = 全通过; 非 0 = 有失败项(详见输出)。
import pw from "playwright";
import fs from "node:fs";
const { chromium } = pw;

const BASE = process.env.BASE_URL || "http://127.0.0.1:8766";
const results = [];
const consoleErrors = [];
const pageErrors = [];

function ok(name, cond, detail = "") {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? "PASS" : "FAIL"} | ${name}${detail ? " :: " + detail : ""}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));

try {
  // ---- 首页 ----
  await page.goto(BASE, { waitUntil: "networkidle" });
  ok("首页标题加载", await page.locator(".hero-title").isVisible());
  ok("合规横幅可见", await page.getByTestId("compliance-banner").isVisible());
  ok("流水线6张卡片", (await page.getByTestId("pipeline").locator(".stage").count()) === 6);
  await page.waitForTimeout(500);
  const statusText = await page.getByTestId("status").innerText().catch(() => "");
  ok("状态显示演示模式(MOCK)", /演示模式|MOCK/.test(statusText), statusText.replace(/\s+/g, " "));

  // 合规自查面板: 拉取 /api/compliance 并展示清单(展开后)
  ok("合规自查面板存在", await page.getByTestId("compliance-panel").isVisible().catch(() => false));
  await page.getByTestId("compliance-panel").locator("summary").click().catch(() => {});
  const checkCount = await page.getByTestId("compliance-checklist").locator("li").count().catch(() => 0);
  ok("自查清单有条目", checkCount >= 5, `共 ${checkCount} 条`);
  const annoText = await page.getByTestId("compliance-panel").innerText().catch(() => "");
  ok("标注自动预填模型名与年份", /deepseek|claude|gpt|模型/i.test(annoText) && /20\d\d年/.test(annoText));
  await page.getByTestId("copy-annotation-btn").click().catch(() => {});
  await page.waitForTimeout(150);
  const annoLabel = await page.getByTestId("copy-annotation-btn").innerText().catch(() => "");
  ok("标注模板可复制(有反馈)", /已复制|复制失败/.test(annoLabel), annoLabel);

  // ---- 文本类模块: critique / scheme / review / polish ----
  // 各模块必填字段的 data-testid 不同, 显式指定避免误填可选项。
  const textModules = [
    { id: "critique", fill: { "input-title": "肠道菌群-脑轴对帕金森病早期干预的机制研究" } },
    { id: "scheme", fill: { "input-idea": "用类器官模型研究某信号通路在肿瘤转移中的作用" } },
    { id: "review", fill: { "input-text": "本项目拟研究 X 蛋白对 Y 通路的调控机制及其在疾病中的意义。" } },
    { id: "polish", fill: { "input-text": "这个研究很重要因为它能解决一个问题，我们打算做很多实验。" } },
  ];

  for (const mod of textModules) {
    await page.getByTestId(`nav-${mod.id}`).click();
    await page.waitForTimeout(150);
    for (const [tid, val] of Object.entries(mod.fill)) {
      await page.getByTestId(tid).fill(val);
    }
    const runBtn = page.getByTestId("run-btn");
    ok(`[${mod.id}] 运行按钮可点击`, await runBtn.isEnabled());
    await runBtn.click();
    try {
      await page.getByTestId("result-text").filter({ hasText: "[MOCK]" }).waitFor({ timeout: 15000 });
      const txt = await page.getByTestId("result-text").innerText();
      ok(`[${mod.id}] 流式输出到达`, txt.includes("[MOCK]"), txt.slice(0, 50).replace(/\s+/g, " "));
    } catch (e) {
      ok(`[${mod.id}] 流式输出到达`, false, "超时未见 [MOCK]: " + String(e).slice(0, 80));
    }
    await page.waitForTimeout(300);
    ok(`[${mod.id}] 完成后有导出Word按钮`, await page.getByTestId("export-docx-btn").isVisible().catch(() => false));

    // 研究方案: 演示模式输出含 ```mermaid``` 代码块, 应渲染成 SVG 流程图
    if (mod.id === "scheme") {
      let rendered = false;
      try {
        await page.getByTestId("mermaid").locator("svg").first().waitFor({ timeout: 15000 });
        rendered = true;
      } catch { /* 渲染失败会回退原始代码 */ }
      ok("[scheme] Mermaid 流程图渲染为 SVG", rendered);
    }
    // 评审模拟: 演示模式输出"评分汇总"GFM 表格, remark-gfm 应渲染为 <table>
    if (mod.id === "review") {
      const hasTable = (await page.getByTestId("result-text").locator("table").count()) > 0;
      ok("[review] 评分汇总渲染为 <table>", hasTable);
      const txt = await page.getByTestId("result-text").innerText();
      ok("[review] 含五维度评分", /科学问题凝练/.test(txt) && /共识弱点/.test(txt));
      // 评分汇总表应被解析成 SVG 雷达图
      const radarOk = await page.getByTestId("review-radar").locator("svg polygon.radar-data").first().isVisible().catch(() => false);
      ok("[review] 评分雷达图渲染", radarOk);
      // 据评审生成修订建议(闭环): 第二个结果面板出现并产出
      await page.getByTestId("gen-revision-btn").click();
      let revOk = false;
      try {
        await page.getByTestId("revision-result-text").filter({ hasText: "[MOCK]" }).waitFor({ timeout: 15000 });
        revOk = true;
      } catch { /* 超时 */ }
      ok("[review] 据评审生成修订建议", revOk);
    }
  }

  // ---- 复制按钮: 点击后应给出"已复制/复制失败"反馈, 不抛异常(局域网回退路径) ----
  await page.getByTestId("copy-btn").click().catch(() => {});
  await page.waitForTimeout(200);
  const copyLabel = await page.getByTestId("copy-btn").innerText().catch(() => "");
  ok("复制按钮有结果反馈", /已复制|复制失败/.test(copyLabel), copyLabel);

  // ---- 项目摘要 abstract: 填入示例 -> 运行 -> 出摘要 ----
  await page.getByTestId("nav-abstract").click();
  await page.waitForTimeout(150);
  await page.getByTestId("example-btn").click();
  await page.waitForTimeout(100);
  ok("[abstract] 示例填好必填项", (await page.getByTestId("input-source").inputValue().catch(() => "")).length > 0);
  await page.getByTestId("run-btn").click();
  try {
    await page.getByTestId("result-text").filter({ hasText: "[MOCK]" }).waitFor({ timeout: 15000 });
    ok("[abstract] 流式输出到达", true);
  } catch { ok("[abstract] 流式输出到达", false); }

  // ---- 立项依据 rationale (多阶段 SSE: status→references→delta→verify) ----
  await page.getByTestId("nav-rationale").click();
  await page.waitForTimeout(150);
  await page.getByTestId("input-field").fill("肠道菌群与阿尔茨海默病");
  await page.getByTestId("run-btn").click();
  try {
    await page.getByTestId("result-text").filter({ hasText: "[MOCK]" }).waitFor({ timeout: 20000 });
    ok("[rationale] 草稿输出到达", true);
  } catch (e) {
    ok("[rationale] 草稿输出到达", false, "超时: " + String(e).slice(0, 80));
  }
  await page.waitForTimeout(500);
  ok("[rationale] 出现引用核验区", await page.getByTestId("verify").isVisible().catch(() => false));
  ok("[rationale] 完成后有导出Word按钮", await page.getByTestId("export-docx-btn").isVisible().catch(() => false));
  const refsText = await page.getByTestId("refs").innerText().catch(() => "");
  ok("[rationale] 参考文献含 Crossref 源", /Crossref/.test(refsText));

  // ---- 填入示例: 一键填充示例输入, 必填项被填好且可直接运行 ----
  await page.getByTestId("nav-critique").click();
  await page.waitForTimeout(120);
  await page.getByTestId("reset-btn").click();
  await page.waitForTimeout(80);
  await page.getByTestId("example-btn").click();
  await page.waitForTimeout(120);
  const exTitle = await page.getByTestId("input-title").inputValue().catch(() => "");
  ok("填入示例填好必填项", exTitle.length > 0, exTitle.slice(0, 30));
  ok("填入示例后运行按钮可用", await page.getByTestId("run-btn").isEnabled().catch(() => false));
  // 运行一次, 既验证示例可直接用, 也恢复该节结果供后续"工作台汇总"断言
  await page.getByTestId("run-btn").click();
  await page.getByTestId("result-text").filter({ hasText: "[MOCK]" }).waitFor({ timeout: 15000 }).catch(() => {});

  // ---- 结果就地编辑: 编辑 -> 追加文本 -> 完成 -> 渲染结果反映改动 ----
  await page.getByTestId("edit-btn").click();
  await page.getByTestId("result-edit").waitFor({ timeout: 5000 }).catch(() => {});
  const MARK = "【我的手动补充】";
  await page.getByTestId("result-edit").focus();
  await page.keyboard.press("End");
  await page.keyboard.type(MARK);
  await page.getByTestId("edit-btn").click(); // 完成编辑
  await page.waitForTimeout(150);
  const editedTxt = await page.getByTestId("result-text").innerText().catch(() => "");
  ok("结果就地编辑生效", editedTxt.includes(MARK), editedTxt.slice(-30).replace(/\s+/g, " "));

  // ---- AI 写作痕迹自检: 含套话的草稿应被标记, 干净文本显示通过 ----
  await page.getByTestId("nav-polish").click();
  await page.waitForTimeout(150);
  await page.getByTestId("reset-btn").click();
  await page.getByTestId("input-text").fill("综上所述，本研究具有重要的理论意义和现实意义，毋庸置疑，由此可见其价值。");
  await page.waitForTimeout(150);
  const tellsTxt = await page.getByTestId("ai-tells").innerText().catch(() => "");
  ok("AI 痕迹自检标记套话", /发现 \d+ 处/.test(tellsTxt) && /综上所述|理论意义/.test(tellsTxt), tellsTxt.slice(0, 40).replace(/\s+/g, " "));
  await page.getByTestId("input-text").fill("本项目用类器官模型测量代谢物对神经元的作用，并以小鼠验证早期干预效果。");
  await page.waitForTimeout(150);
  const tellsOk = await page.getByTestId("ai-tells").innerText().catch(() => "");
  ok("AI 痕迹自检干净文本通过", /未发现明显/.test(tellsOk));

  // ---- 键盘提交: Ctrl+Enter 也能触发运行 ----
  await page.getByTestId("nav-polish").click();
  await page.waitForTimeout(150);
  await page.getByTestId("input-text").fill("用 Ctrl+Enter 提交的测试文本。");
  await page.getByTestId("input-text").press("Control+Enter");
  let kbOk = false;
  try {
    await page.getByTestId("result-text").filter({ hasText: "[MOCK]" }).waitFor({ timeout: 15000 });
    kbOk = true;
  } catch { /* 未触发 */ }
  ok("Ctrl+Enter 触发运行", kbOk);

  // ---- 工作台汇总: 回首页, 已完成各节应可一键汇总导出 ----
  await page.getByTestId("brand").click().catch(() => {});
  await page.waitForTimeout(300);
  ok("工作台汇总出现", await page.getByTestId("workspace").isVisible().catch(() => false));
  const wsCount = await page.getByTestId("workspace-list").locator("li").count().catch(() => 0);
  ok("汇总含已完成各节", wsCount >= 5, `共 ${wsCount} 节`);
  let dlOk = false;
  try {
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 8000 }),
      page.getByTestId("export-all-docx-btn").click(),
    ]);
    dlOk = /汇总.*\.docx$/.test(dl.suggestedFilename());
  } catch { /* 下载未触发 */ }
  ok("汇总导出 Word 触发下载", dlOk);
  ok("汇总导出无错误提示", !(await page.getByTestId("workspace-error").isVisible().catch(() => false)));

  // 汇总导出 Markdown: 读取下载文件, 应含各节标题与自动附的 AI 使用标注
  let mdContent = "";
  try {
    const [mdDl] = await Promise.all([
      page.waitForEvent("download", { timeout: 8000 }),
      page.getByTestId("export-all-md-btn").click(),
    ]);
    mdContent = fs.readFileSync(await mdDl.path(), "utf-8");
  } catch { /* 下载失败 */ }
  ok("汇总 MD 含模块标题", /# 选题诊断/.test(mdContent) && /# 立项依据/.test(mdContent));
  ok("汇总 MD 末尾附 AI 使用标注", /# 生成式 AI 使用标注/.test(mdContent) && /【生成式人工智能使用说明】/.test(mdContent));

  // 本地存档: 导出 .json 应含各模块持久化键(供下方往返验证)
  let archivePath = "";
  try {
    const [arDl] = await Promise.all([
      page.waitForEvent("download", { timeout: 8000 }),
      page.getByTestId("export-archive-btn").click(),
    ]);
    archivePath = await arDl.path();
    const arJson = JSON.parse(fs.readFileSync(archivePath, "utf-8"));
    ok("存档导出含模块数据", typeof arJson["nsfc:critique:result"] === "string");
  } catch (e) {
    ok("存档导出含模块数据", false, String(e).slice(0, 60));
  }

  // 送全文去评审模拟: 应跳到评审模块且输入框被装配好的内容预填
  await page.getByTestId("send-all-review-btn").click();
  await page.waitForTimeout(200);
  const reviewInput = await page.getByTestId("input-text").inputValue().catch(() => "");
  ok("送全文跳到评审且预填内容", reviewInput.includes("立项依据") || reviewInput.includes("研究方案"), `${reviewInput.length} 字`);

  // 回首页继续清空全部测试
  await page.getByTestId("brand").click();
  await page.waitForTimeout(250);

  // 清空全部: 需二次确认; 确认后工作台消失
  await page.getByTestId("clear-all-btn").click();
  const confirmLabel = await page.getByTestId("clear-all-btn").innerText().catch(() => "");
  ok("清空全部需二次确认", /确认清空/.test(confirmLabel), confirmLabel);
  await page.getByTestId("clear-all-btn").click();
  await page.waitForTimeout(200);
  ok("确认后工作台清空消失", !(await page.getByTestId("workspace").isVisible().catch(() => false)));

  // 本地存档往返: 导入刚才导出的 .json, 清空后的内容应恢复
  if (archivePath) {
    await page.getByTestId("import-archive-input").setInputFiles(archivePath);
    await page.waitForTimeout(1500); // 等待导入 + location.reload()
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(400);
    ok("导入存档后内容恢复", await page.getByTestId("workspace").isVisible().catch(() => false));
  } else {
    ok("导入存档后内容恢复", false, "无存档文件");
  }

  // ---- 全局: 无 JS 报错 ----
  ok("无 pageerror", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));
  ok("无 console.error", consoleErrors.length === 0, consoleErrors.join(" | ").slice(0, 200));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n==== 汇总: ${results.length - failed.length}/${results.length} 通过 ====`);
if (failed.length) {
  console.log("FAILED:");
  for (const f of failed) console.log(" - " + f.name + (f.detail ? " :: " + f.detail : ""));
  process.exit(1);
}
