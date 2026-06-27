"""提示词正确性离线校验。

运行: backend/.venv/Scripts/python.exe test_prompts.py

重点守卫: 选题诊断的"科学问题属性"必须采用 2024 年起的两类研究属性
(自由探索类 / 目标导向类), 不得退回已废止的 A/B/C/D 四类。
"""
from __future__ import annotations

import sys

from app.compliance import build_annotation, compliance_info
from app.config import settings
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
        ("review 含评分汇总", "评分汇总" in _system("review", {"text": "x"})),
        ("review 含共识弱点", "共识弱点" in _system("review", {"text": "x"})),
        ("review 含五维度", all(
            d in _system("review", {"text": "x"})
            for d in ("科学问题凝练", "创新性", "研究基础", "方案可行性", "写作规范")
        )),
        ("polish 含标注", "标注" in _system("polish", {"text": "x"})),
        ("abstract 含中文摘要结构", "## 中文摘要" in _system("abstract", {"text": "x"})),
        ("abstract 含英文摘要与关键词", all(s in _system("abstract", {"text": "x"}) for s in ("Abstract", "关键词", "Keywords"))),
        ("abstract 强调不编造", "不编造" in _system("abstract", {"text": "x"})),
        # AI 使用标注: 披露名称/版本/使用时间, 含起止标识, 声明未直接生成整段材料
        ("标注含使用时间", "使用时间" in build_annotation()),
        ("标注含名称及版本", "名称及版本" in build_annotation()),
        ("标注有起止标识", build_annotation().startswith("【生成式人工智能使用说明】")
         and build_annotation().endswith("【说明结束】")),
        ("标注声明未直接生成整段材料", "未直接使用生成式人工智能生成的整段" in build_annotation()),
    ]

    # 合规信息自动预填: 默认用配置模型作工具名、当前年份作使用时间
    import datetime
    settings.model = "deepseek-chat"
    info = compliance_info()
    checks.append(("标注自动填模型名", "deepseek-chat" in info["annotation"]))
    checks.append(("标注自动填当前年份", f"{datetime.date.today().year}年" in info["annotation"]))
    info2 = compliance_info(tool="Claude Opus", when="2026年6月", scenes="文献检索")
    checks.append(("标注可被显式参数覆盖", "Claude Opus" in info2["annotation"] and "2026年6月" in info2["annotation"] and "文献检索" in info2["annotation"]))

    failed = [n for n, ok in checks if not ok]
    for n, ok in checks:
        print(f"{'PASS' if ok else 'FAIL'} | {n}")
    print(f"\n==== {len(checks) - len(failed)}/{len(checks)} 通过 ====")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
