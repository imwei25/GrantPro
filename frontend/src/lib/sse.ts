// 与本地 sidecar 通信的流式辅助函数。
// 后端用 SSE(text/event-stream) 推送 event: delta|done|error 等。

import { apiUrl } from "./api";

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
}

interface ParsedEvent {
  event: string;
  data: string;
}

function parseChunk(buffer: string): { events: ParsedEvent[]; rest: string } {
  const events: ParsedEvent[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const block of parts) {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    events.push({ event, data: dataLines.join("\n") });
  }
  return { events, rest };
}

// 通用: 向某个 SSE 端点 POST 一个 JSON 体, 流式接收文本。
export async function streamPost(
  url: string,
  body: unknown,
  handlers: StreamHandlers,
): Promise<void> {
  const { onDelta, onDone, onError, signal } = handlers;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    onError?.(`无法连接本地服务: ${(e as Error).message}`);
    return;
  }
  if (!resp.ok || !resp.body) {
    onError?.(`服务返回错误: ${resp.status}`);
    return;
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseChunk(buffer);
      buffer = rest;
      for (const ev of events) {
        if (ev.event === "delta") {
          try {
            onDelta(JSON.parse(ev.data).text ?? "");
          } catch {
            /* ignore malformed */
          }
        } else if (ev.event === "error") {
          let msg = ev.data;
          try {
            msg = JSON.parse(ev.data).message ?? ev.data;
          } catch {
            /* keep raw */
          }
          onError?.(msg);
        } else if (ev.event === "done") {
          onDone?.();
        }
      }
    }
  } catch (e) {
    if ((e as Error).name !== "AbortError") {
      onError?.(`读取流出错: ${(e as Error).message}`);
    }
  }
}

export interface Reference {
  pmid: string;
  doi?: string;
  title: string;
  first_author: string;
  journal: string;
  year: string;
  url: string;
  source?: string;
}

export interface Verification {
  total: number;
  verified: number;
  unverified: string[];
}

export interface RationaleHandlers {
  onStatus?: (message: string) => void;
  onReferences?: (items: Reference[]) => void;
  onDelta: (text: string) => void;
  onVerify?: (v: Verification) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
}

// 立项依据深度调研: 处理 status / references / delta / verify / done / error 事件。
export async function streamRationale(
  inputs: Record<string, string>,
  h: RationaleHandlers,
): Promise<void> {
  let resp: Response;
  try {
    resp = await fetch(apiUrl("/api/rationale"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: "rationale", inputs }),
      signal: h.signal,
    });
  } catch (e) {
    h.onError?.(`无法连接本地服务: ${(e as Error).message}`);
    return;
  }
  if (!resp.ok || !resp.body) {
    h.onError?.(`服务返回错误: ${resp.status}`);
    return;
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseChunk(buffer);
      buffer = rest;
      for (const ev of events) {
        let data: any = {};
        try {
          data = JSON.parse(ev.data);
        } catch {
          /* ignore */
        }
        if (ev.event === "status") h.onStatus?.(data.message ?? "");
        else if (ev.event === "references") h.onReferences?.(data.items ?? []);
        else if (ev.event === "delta") h.onDelta(data.text ?? "");
        else if (ev.event === "verify") h.onVerify?.(data as Verification);
        else if (ev.event === "error") h.onError?.(data.message ?? ev.data);
        else if (ev.event === "done") h.onDone?.();
      }
    }
  } catch (e) {
    if ((e as Error).name !== "AbortError") {
      h.onError?.(`读取流出错: ${(e as Error).message}`);
    }
  }
}

// 运行一个文本类模块(选题诊断 / 研究方案 / 评审模拟 / 润色合规)。
export function runModule(
  module: string,
  inputs: Record<string, string>,
  handlers: StreamHandlers,
): Promise<void> {
  return streamPost(apiUrl("/api/run"), { module, inputs }, handlers);
}
