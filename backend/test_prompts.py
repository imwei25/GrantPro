"""提示词正确性离线校验。

运行: backend/.venv/Scripts/python.exe test_prompts.py

重点守卫: 选题诊断的"科学问题属性"必须采用 2024 年起的两类研究属性
(自由探索类 / 目标导向类), 不得退回已废止的 A/B/C/D 四类。
"""
from __future__ import annotations

import sys

from app.prompts import build_messages


def _system(module: str, inputs: dict) -> str:
    return next(m["content"] for m in build_messages(module, inputs) if m["role"] == "system")


def main() -> int:
    critique = _system("critique", {"title": "示例选题", "field": "神经科学"})

    checks = [
        ("含 自由探索类", "自由探索类" in critique),
        ("含 目标导向类", "目标导向类" in critique),
        ("不含废止的 鼓励探索/独辟蹊径", "鼓励探索" not in critique and "独辟蹊径" not in critique),
        ("不含废止的四类标记 A 鼓励", "A 鼓励" not in critique),
        # 其余模块仍能正常构建
        ("scheme 含技术路线", "技术路线" in _system("scheme", {"idea": "x"})),
        ("review 含评审", "评审" in _system("review", {"text": "x"})),
        ("polish 含标注", "标注" in _system("polish", {"text": "x"})),
    ]

    failed = [n for n, ok in checks if not ok]
    for n, ok in checks:
        print(f"{'PASS' if ok else 'FAIL'} | {n}")
    print(f"\n==== {len(checks) - len(failed)}/{len(checks)} 通过 ====")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
