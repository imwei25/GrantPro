"""把各模块产出的文本汇总导出为 Word(.docx)。

把简单的 Markdown 风格文本(# / ## / ### 标题, - 列表)转换为带样式的 Word 文档,
便于申请人粘贴进官方申请书模板继续修改。仅做结构转换, 不改动内容。
"""
from __future__ import annotations

import io
import re


def build_docx(text: str, title: str = "") -> bytes:
    from docx import Document
    from docx.shared import Pt

    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "宋体"
    style.font.size = Pt(12)

    if title.strip():
        doc.add_heading(title.strip(), level=0)

    for raw in (text or "").splitlines():
        line = raw.rstrip()
        if not line.strip():
            doc.add_paragraph("")
            continue
        m = re.match(r"^(#{1,4})\s+(.*)$", line)
        if m:
            level = min(len(m.group(1)), 4)
            doc.add_heading(m.group(2).strip(), level=level)
            continue
        m = re.match(r"^[-*]\s+(.*)$", line)
        if m:
            doc.add_paragraph(m.group(1).strip(), style="List Bullet")
            continue
        m = re.match(r"^(\d+)[.、]\s+(.*)$", line)
        if m:
            doc.add_paragraph(m.group(2).strip(), style="List Number")
            continue
        doc.add_paragraph(line)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
