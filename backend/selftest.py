"""后端冒烟测试。

用法:
  python selftest.py mock   # 不调用真实模型, 校验提示词/流程/合规模块(不花钱)
  python selftest.py real   # 用 .env 配置的真实模型跑一次最短调用(花极少额度)

校验点: 四个文本模块能正常构建消息并流式产出; 立项依据流程(mock)走通;
合规模块返回标注与清单。
"""
from __future__ import annotations

import asyncio
import os
import sys


async def _drain(agen) -> str:
    buf = ""
    async for piece in agen:
        buf += piece
    return buf


async def main(mode: str) -> None:
    if mode == "mock":
        os.environ["MOCK_LLM"] = "true"
    # 延迟导入, 保证 MOCK_LLM 在 config 读取前已设置
    from app.compliance import compliance_info
    from app.llm import stream_chat
    from app.prompts import build_messages
    from app.rationale import deep_research_rationale

    print(f"== 模式: {mode} ==")

    for module, inputs in [
        ("critique", {"title": "肠道菌群与帕金森病的因果关系研究", "field": "神经科学"}),
        ("scheme", {"idea": "用类器官模型研究某通路", "field": "细胞生物学"}),
        ("review", {"title": "示例", "text": "本项目拟研究 X 对 Y 的调控机制。"}),
        ("polish", {"text": "这个研究很重要因为它能解决一个问题。"}),
    ]:
        msgs = build_messages(module, inputs)
        out = await _drain(stream_chat(msgs, max_tokens=64))
        assert out.strip(), f"模块 {module} 无输出"
        print(f"[OK] /run {module}: {out[:50].strip()}…")

    # 立项依据流程
    events = []
    async for ev, data in deep_research_rationale({"field": "tumor immunotherapy"}):
        events.append(ev)
    assert "done" in events, "立项依据流程未正常结束"
    print(f"[OK] /rationale 事件序列: {events}")

    info = compliance_info()
    assert info["annotation"] and info["checklist"], "合规模块返回为空"
    print(f"[OK] /compliance: 标注 + {len(info['checklist'])} 条自查清单")

    print("\n全部通过 [OK]")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "mock"
    asyncio.run(main(mode))
