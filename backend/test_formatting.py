"""build_docx 的离线校验: Markdown 内联(链接/加粗)与中文字体是否正确落地。

运行: backend/.venv/Scripts/python.exe test_formatting.py
不依赖网络与模型。
"""
from __future__ import annotations

import io
import sys
import zipfile

from app.formatting import build_docx

SAMPLE = (
    "# 立项依据\n"
    "## 二、国内外研究现状\n"
    "已有工作见 [Smith et al., 2023](https://pubmed.ncbi.nlm.nih.gov/12345678/)。\n"
    "其中 **机制层面** 仍缺乏研究。\n"
    "- 第一条要点\n"
    "1. 第一步\n"
)


def main() -> int:
    data = build_docx(SAMPLE, title="测试标题")
    assert data[:2] == b"PK", "应为有效的 docx(zip) 文件"

    with zipfile.ZipFile(io.BytesIO(data)) as z:
        doc_xml = z.read("word/document.xml").decode("utf-8")
        rels = z.read("word/_rels/document.xml.rels").decode("utf-8")
        styles_xml = z.read("word/styles.xml").decode("utf-8")

    checks = []

    # 1) Markdown 链接转成真实超链接, 不再出现字面 "](" 与裸 URL 文本
    checks.append(("链接不残留字面 Markdown", "](" not in doc_xml))
    checks.append(("生成 w:hyperlink 元素", "w:hyperlink" in doc_xml))
    checks.append(("超链接关系指向真实 URL", "pubmed.ncbi.nlm.nih.gov/12345678" in rels))
    checks.append(("链接锚文本保留", "Smith et al., 2023" in doc_xml))

    # 2) 加粗标记转成真实 bold run, 不再出现字面 **
    checks.append(("加粗不残留字面 **", "**" not in doc_xml))
    checks.append(("生成 w:b 加粗", "<w:b/>" in doc_xml or "<w:b " in doc_xml))
    checks.append(("加粗文字保留", "机制层面" in doc_xml))

    # 3) 中文东亚字体设置(eastAsia=宋体, 落在 Normal 样式的 styles.xml)
    checks.append(("设置 eastAsia 宋体", "w:eastAsia" in styles_xml and "宋体" in styles_xml))

    # 4) 标题/列表仍在
    checks.append(("含标题样式", "Heading" in doc_xml or "标题" in doc_xml))

    failed = [name for name, ok in checks if not ok]
    for name, ok in checks:
        print(f"{'PASS' if ok else 'FAIL'} | {name}")
    print(f"\n==== {len(checks) - len(failed)}/{len(checks)} 通过 ====")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
