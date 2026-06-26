// 健壮的复制到剪贴板。
// 背景: navigator.clipboard 仅在"安全上下文"(HTTPS 或 localhost/127.0.0.1)可用;
// 本项目支持局域网部署(http://192.168.x.x), 这种非安全上下文下 navigator.clipboard
// 为 undefined, 直接调用会抛异常且无反馈。此处优先用 Clipboard API, 不可用时
// 回退到 execCommand("copy") 的隐藏 textarea 方案, 始终返回是否成功。
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 落到下面的回退方案
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    // 移出视口, 避免页面跳动/可见
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.left = "-9999px";
    ta.setAttribute("readonly", "");
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
