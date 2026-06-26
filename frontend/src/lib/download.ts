import { apiUrl } from "./api";

// 把文本保存为本地文件(纯前端, 不经服务器)。
export function downloadText(filename: string, text: string, mime = "text/markdown"): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// 调用后端把(Markdown 风格)文本转成 Word 并下载。失败返回错误信息字符串, 成功返回 null。
export async function downloadDocx(filename: string, text: string, title = ""): Promise<string | null> {
  try {
    const resp = await fetch(apiUrl("/api/docx"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, title }),
    });
    if (!resp.ok) return `导出失败：服务返回 ${resp.status}`;
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return null;
  } catch (e) {
    return `导出失败：${(e as Error).message}`;
  }
}

// 生成带时间戳的文件名, 避免覆盖。形如 prefix-20260626-0655.md
export function tsName(prefix: string, ext: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  return `${prefix}-${stamp}.${ext}`;
}
