// 本地存档: 把全部 nsfc: 持久化键打包成 .json 导出/导入。
// 动机: 所有内容只存在浏览器 localStorage 单槽里, 换机/清缓存/手滑"清空"即全没;
// 提供本地文件级的备份与找回(符合单机无云端约束)。
import { downloadText } from "./download";

const PREFIX = "nsfc:";

export function collectArchive(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) {
      const v = localStorage.getItem(k);
      if (v !== null) out[k] = v;
    }
  }
  return out;
}

export function hasArchive(): boolean {
  return Object.keys(collectArchive()).length > 0;
}

// 导出当前全部内容为 json 文件; 无内容则返回 false。
export function exportArchive(filename: string): boolean {
  const data = collectArchive();
  if (Object.keys(data).length === 0) return false;
  downloadText(filename, JSON.stringify(data, null, 2), "application/json");
  return true;
}

// 从 json 文件导入(覆盖同名键), 返回导入条数; 仅接受 nsfc: 前缀的字符串值。
export async function importArchive(file: File): Promise<number> {
  const text = await file.text();
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("文件格式不对");
  }
  let n = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith(PREFIX) && typeof v === "string") {
      localStorage.setItem(k, v);
      n++;
    }
  }
  if (n === 0) throw new Error("未发现可导入的内容");
  return n;
}
