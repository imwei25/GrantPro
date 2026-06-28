"""“立项依据”深度调研流程(文献接地 + 引用核验)。

立项依据是国自然申请书最易出现“编造文献”风险的部分。本流程:
  1) 用 LLM 把研究方向转成 PubMed 英文检索式;
  2) 实际检索 PubMed, 抓取真实文献(标题/作者/年份/摘要/链接);
  3) 让 LLM 严格基于这些真实文献撰写立项依据草稿(国内外研究现状→问题与不足→
     本项目切入点与拟解决的科学问题), 引用必须用可点击的 Markdown 链接;
  4) 正文生成后回查所有 PubMed 链接, 标出未出现在检索结果中的“疑似编造”引用。

对外是一个异步生成器, 逐步 yield (event, data):
  ("status", {"message": ...})      进度提示
  ("references", {"items": [...]})  检索到的真实文献列表
  ("delta", {"text": ...})          立项依据正文流式片段
  ("verify", {...})                 引用核验结果
  ("error", {"message": ...})
"""
from __future__ import annotations

import json
import re
from typing import AsyncIterator

from .config import settings
from .literature import search_literature
from .llm import stream_chat


async def _complete(messages: list[dict], max_tokens: int = 300) -> str:
    buf = ""
    async for piece in stream_chat(messages, max_tokens=max_tokens):
        buf += piece
    return buf


# 检索式生成的 system 提示词: 学科中立(不绑定 PubMed/MeSH), 同时服务 PubMed 与 Crossref。
QUERY_SYSTEM = (
    "你是跨学科科技文献检索专家。把用户的研究主题转化为 3 个英文检索式，"
    "需同时适用于 PubMed 与 Crossref 等通用学术数据库（即不要绑定 PubMed 专有语法），"
    "可使用布尔逻辑(AND/OR)，按学科酌情使用规范的领域术语或同义词，覆盖该主题的不同侧面。"
    "只输出一个 JSON 字符串数组，不要任何解释。例如：[\"...\", \"...\", \"...\"]"
)


async def _gen_queries(field: str, keywords: str, background: str) -> list[str]:
    bg = background[:500]
    topic = field + (f"；关键词：{keywords}" if keywords else "") + (f"；背景：{bg}" if bg else "")
    system = QUERY_SYSTEM
    try:
        raw = await _complete(
            [{"role": "system", "content": system}, {"role": "user", "content": topic}],
            max_tokens=300,
        )
        start, end = raw.find("["), raw.rfind("]")
        if start != -1 and end != -1:
            arr = json.loads(raw[start : end + 1])
            qs = [str(q).strip() for q in arr if str(q).strip()]
            if qs:
                return qs[:3]
    except Exception:  # noqa: BLE001
        pass
    base = field
    if keywords:
        base += " AND (" + " OR ".join(k.strip() for k in keywords.split(",") if k.strip()) + ")"
    return [base]


def _build_context(papers: list[dict]) -> str:
    lines = []
    for i, p in enumerate(papers, 1):
        abstract = (p["abstract"] or "")[:1200]
        lines.append(
            f"[{i}] {p['first_author']} ({p['year']}). {p['title']} "
            f"{p['journal']}. URL: {p['url']}\n摘要: {abstract or '（无摘要）'}"
        )
    return "\n\n".join(lines)


def _synthesis_messages(field: str, problem: str, papers: list[dict]) -> list[dict]:
    system = (
        "你是国家自然科学基金申请书写作专家。下面提供的是从 PubMed / Crossref 检索到的【真实文献】。"
        "请严格基于这些文献，为申请人撰写一份“立项依据”草稿，结构如下：\n"
        "## 一、研究背景与意义\n说明该方向的科学意义与应用价值。\n"
        "## 二、国内外研究现状\n综述代表性工作。每次引用文献时，必须使用 Markdown 超链接，"
        "格式为 [第一作者 et al., 年份](文献URL)，URL 用文献给出的真实 URL。\n"
        "## 三、存在的问题与不足\n基于现状指出尚未解决的问题、争议或方法学局限——这是本项目的切入口。\n"
        "## 四、本项目的切入点与拟解决的科学问题\n说明本项目如何针对上述不足，凝练出拟解决的关键科学问题。\n\n"
        "铁律：只能引用下面列出的文献及其真实 URL，严禁编造任何文献、作者或链接；"
        "若现有文献不足以支撑某结论，请明确写明“现有检索结果有限，需申请人补充检索”。"
        "本草稿仅供申请人修改完善，所有引用须由申请人再次核实。"
    )
    context = _build_context(papers)
    user = (
        f"研究方向：{field}\n"
        + (f"拟解决的科学问题：{problem}\n" if problem else "")
        + f"\n【检索到的真实文献】\n{context}"
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def verify_citations(full: str, papers: list[dict]) -> dict:
    """引用回查: 正文引用的每个 PMID / DOI, 必须来自本次检索到的文献。
    返回 {total, verified, unverified}; unverified 即疑似编造的标识(PMID 或 DOI)。"""
    valid = {p["pmid"] for p in papers if p.get("pmid")} | {
        p["doi"].lower() for p in papers if p.get("doi")
    }
    cited_pmids = set(re.findall(r"pubmed\.ncbi\.nlm\.nih\.gov/(\d+)", full))
    cited_dois = {
        d.lower().rstrip(".,);]") for d in re.findall(r"doi\.org/(10\.[^\s)\]]+)", full)
    }
    cited = cited_pmids | cited_dois
    unverified = sorted(cited - valid)
    return {"total": len(cited), "verified": len(cited & valid), "unverified": unverified}


async def _mock_flow(field: str) -> AsyncIterator[tuple[str, dict]]:
    yield ("status", {"message": "正在生成 PubMed 检索式…"})
    yield ("status", {"message": "正在检索 PubMed…"})
    items = [
        {
            "pmid": "00000001",
            "doi": "",
            "title": f"[MOCK] A study related to {field}",
            "first_author": "Smith J",
            "journal": "Mock Journal",
            "year": "2023",
            "url": "https://pubmed.ncbi.nlm.nih.gov/00000001/",
            "source": "pubmed",
        },
        {
            "pmid": "",
            "doi": "10.0000/mock.2023",
            "title": f"[MOCK] Cross-disciplinary work on {field}",
            "first_author": "Doe A",
            "journal": "Mock Crossref Journal",
            "year": "2024",
            "url": "https://doi.org/10.0000/mock.2023",
            "source": "crossref",
        },
    ]
    yield ("references", {"items": items})
    yield ("status", {"message": "正在撰写立项依据草稿…"})
    text = (
        "## 一、研究背景与意义\n[MOCK] 该方向具有重要科学意义。\n"
        "## 二、国内外研究现状\n已有工作见 [Smith et al., 2023](https://pubmed.ncbi.nlm.nih.gov/00000001/)。\n"
        "## 三、存在的问题与不足\n[MOCK] 仍缺乏机制层面的研究。\n"
        "## 四、本项目的切入点与拟解决的科学问题\n[MOCK] 本项目拟回答一个关键科学问题。"
    )
    for ch in text:
        yield ("delta", {"text": ch})


async def deep_research_rationale(inputs: dict) -> AsyncIterator[tuple[str, dict]]:
    field = (inputs.get("field") or "").strip()
    keywords = (inputs.get("keywords") or "").strip()
    problem = (inputs.get("problem") or "").strip()
    background = (inputs.get("background") or "").strip()

    if not field:
        yield ("error", {"message": "请填写研究方向。"})
        return

    if settings.mock:
        async for ev in _mock_flow(field):
            yield ev
        yield ("verify", {"total": 1, "verified": 1, "unverified": []})
        yield ("done", {})
        return

    try:
        yield ("status", {"message": "正在生成文献检索式…"})
        queries = await _gen_queries(field, keywords, background)

        yield ("status", {"message": f"正在检索文献（PubMed / Crossref，{len(queries)} 个检索式）…"})
        papers = await search_literature(queries, per_query=6, cap=18)

        if not papers:
            yield ("error", {"message": "未能检索到相关文献，请尝试更换或细化关键词（建议用英文）。"})
            return

        yield ("references", {"items": [
            {k: p.get(k, "") for k in ("pmid", "doi", "title", "first_author", "journal", "year", "url", "source")}
            for p in papers
        ]})
        yield ("status", {"message": f"已找到 {len(papers)} 篇真实文献，正在撰写立项依据草稿…"})

        full = ""
        async for piece in stream_chat(_synthesis_messages(field, problem, papers)):
            full += piece
            yield ("delta", {"text": piece})

        # 引用自动核验: 正文引用的每个 PMID / DOI 链接, 必须来自本次检索到的文献。
        yield ("verify", verify_citations(full, papers))
        yield ("done", {})
    except Exception as e:  # noqa: BLE001
        yield ("error", {"message": f"调研过程出错：{e}"})
