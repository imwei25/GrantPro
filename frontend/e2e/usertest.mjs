// 端到端"真实用户"冒烟测试: 用 Playwright 驱动 Chromium 走通 GrantPro 五大模块。
//
// 前置: 后端需以 MOCK_LLM=true 在 BASE_URL(默认 http://127.0.0.1:8766) 运行,
//       并已 `npm run build` 生成 dist(由后端单进程托管)。
// 运行: node frontend/e2e/usertest.mjs   (或用 scripts/usertest.ps1 一键起停)
//
// 退出码 0 = 全通过; 非 0 = 有失败项(详见输出)。
import pw from "playwright";
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
  ok("流水线5张卡片", (await page.getByTestId("pipeline").locator(".stage").count()) === 5);
  await page.waitForTimeout(500);
  const statusText = await page.getByTestId("status").innerText().catch(() => "");
  ok("状态显示演示模式(MOCK)", /演示模式|MOCK/.test(statusText), statusText.replace(/\s+/g, " "));

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
    // 评审模拟: 演示模式输出含 GFM 表格, remark-gfm 应渲染为 <table>
    if (mod.id === "review") {
      const hasTable = (await page.getByTestId("result-text").locator("table").count()) > 0;
      ok("[review] GFM 表格渲染为 <table>", hasTable);
    }
  }

  // ---- 复制按钮: 点击后应给出"已复制/复制失败"反馈, 不抛异常(局域网回退路径) ----
  await page.getByTestId("copy-btn").click().catch(() => {});
  await page.waitForTimeout(200);
  const copyLabel = await page.getByTestId("copy-btn").innerText().catch(() => "");
  ok("复制按钮有结果反馈", /已复制|复制失败/.test(copyLabel), copyLabel);

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
