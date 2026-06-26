"""国自然基金申请助手本地 sidecar —— FastAPI 服务。

前端(浏览器/Tauri webview)通过 http://127.0.0.1:<PORT> 访问。
端点:
  GET  /api/health        健康检查
  GET  /api/compliance    AI 使用合规标注模板 + 提交前自查清单
  POST /api/run           文本类模块流式输出(选题诊断/研究方案/评审模拟/润色合规)
  POST /api/rationale     立项依据: 检索 PubMed + 文献接地撰写 + 引用核验(SSE)
  POST /api/extract       抽取上传文档纯文本
  POST /api/docx          把汇总文本生成 Word 文件下载
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .compliance import compliance_info
from .config import settings
from .extract import extract_text
from .formatting import build_docx
from .llm import LLMError, stream_chat
from .prompts import build_messages
from .rationale import deep_research_rationale

app = FastAPI(title="国自然基金申请助手 sidecar", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class RunRequest(BaseModel):
    module: str
    inputs: dict


class DocxRequest(BaseModel):
    text: str
    title: str = ""


@app.get("/api/health")
async def health() -> dict:
    return {
        "status": "ok",
        "provider": settings.provider,
        "model": settings.model,
        "mock": settings.mock,
        "configured": settings.mock or bool(settings.api_key),
    }


@app.get("/api/compliance")
async def compliance() -> dict:
    return compliance_info()


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/api/run")
async def run(req: RunRequest) -> StreamingResponse:
    try:
        messages = build_messages(req.module, req.inputs)
    except ValueError as e:
        async def err_gen():
            yield _sse("error", {"message": str(e)})
        return StreamingResponse(err_gen(), media_type="text/event-stream")

    async def gen():
        try:
            async for piece in stream_chat(messages):
                yield _sse("delta", {"text": piece})
        except LLMError as e:
            yield _sse("error", {"message": str(e)})
        except Exception as e:  # noqa: BLE001
            yield _sse("error", {"message": f"内部错误: {e}"})
        else:
            yield _sse("done", {})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/rationale")
async def rationale(req: RunRequest) -> StreamingResponse:
    """立项依据: 检索 PubMed 真实文献 → 文献接地撰写草稿 → 引用核验。"""
    async def gen():
        async for event, data in deep_research_rationale(req.inputs):
            yield _sse(event, data)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# 上传文件大小上限(字节): 防止超大文件撑爆内存; 局域网部署时尤为重要。
_MAX_UPLOAD = 20 * 1024 * 1024  # 20 MB


@app.post("/api/extract")
async def extract(file: UploadFile = File(...)) -> dict:
    """抽取上传文档(Word/PDF/Excel/CSV/txt)的纯文本, 供分析或润色。"""
    # 分块读取并在超限时尽早中止, 避免把任意大的文件整体读入内存。
    chunks: list[bytes] = []
    size = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        size += len(chunk)
        if size > _MAX_UPLOAD:
            return {"ok": False, "error": "文件过大（上限 20MB），请压缩或截取后再上传。"}
        chunks.append(chunk)
    return extract_text(file.filename or "file", b"".join(chunks))


@app.post("/api/docx")
async def docx(req: DocxRequest) -> Response:
    try:
        data = build_docx(req.text, req.title)
    except Exception as e:  # noqa: BLE001
        return Response(
            content=json.dumps({"error": f"生成 Word 失败：{e}"}, ensure_ascii=False),
            media_type="application/json",
            status_code=400,
        )
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": "attachment; filename=nsfc-draft.docx"},
    )


# 若前端已构建(frontend/dist 存在), 由本服务直接托管, 实现“单进程”部署:
# 用户只需启动本服务并打开浏览器即可, 无需单独的前端服务器。
_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(_DIST), html=True), name="static")


def run_server():
    import uvicorn

    uvicorn.run(app, host=settings.host, port=settings.port)


if __name__ == "__main__":
    run_server()
