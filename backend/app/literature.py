"""PubMed 文献检索客户端(NCBI E-utilities)。

用于“立项依据”的文献接地: 实际检索真实文献, 供 LLM 梳理国内外研究现状与不足,
并生成可点击的 PubMed 链接。E-utilities 免费, 无需 key(限速 3 次/秒)。

注意: 国自然申请书要求“必须人工核实生成式 AI 生成的信息与参考文献的真实性”。
本模块抓取的是真实存在的 PubMed 文献, 并在正文生成后做引用回查, 把“编造文献”的
风险降到最低; 但最终仍需申请人本人核对后使用。
"""
from __future__ import annotations

import asyncio
import time
import xml.etree.ElementTree as ET

import httpx

from .config import settings

_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
_TOOL = "nsfc-grant-assistant"
_UA = "nsfc-grant-assistant/0.1 (PubMed literature grounding; +https://github.com/imwei25/GrantPro)"

# NCBI 限速: 无 api_key 时 3 次/秒, 有 key 时 10 次/秒。留余量取 2.5 / 8 次每秒。
# 用一个进程级最小间隔 + 锁来串行化, 避免一次立项依据连发多请求被 429。
_rate_lock = asyncio.Lock()
_last_request_ts = 0.0


def pubmed_url(pmid: str) -> str:
    return f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"


def _common_params() -> dict:
    p = {"tool": _TOOL}
    email = getattr(settings, "ncbi_email", "") or ""
    if email:
        p["email"] = email
    api_key = getattr(settings, "ncbi_api_key", "") or ""
    if api_key:
        p["api_key"] = api_key
    return p


def _min_interval() -> float:
    return 0.12 if (getattr(settings, "ncbi_api_key", "") or "") else 0.4


async def _throttled_get(client: httpx.AsyncClient, url: str, params: dict, retries: int = 3) -> httpx.Response:
    """带限速间隔与退避重试的 GET。遇 429/5xx/网络抖动重试, 否则抛出。"""
    global _last_request_ts
    last_exc: Exception | None = None
    for attempt in range(retries):
        # 限速: 与上一次请求至少间隔 _min_interval 秒。
        async with _rate_lock:
            wait = _min_interval() - (time.monotonic() - _last_request_ts)
            if wait > 0:
                await asyncio.sleep(wait)
            _last_request_ts = time.monotonic()
        try:
            r = await client.get(url, params=params, headers={"User-Agent": _UA})
            if r.status_code == 429 or r.status_code >= 500:
                last_exc = httpx.HTTPStatusError(
                    f"NCBI 返回 {r.status_code}", request=r.request, response=r
                )
                await asyncio.sleep(0.6 * (2 ** attempt))  # 退避: 0.6s, 1.2s, 2.4s
                continue
            r.raise_for_status()
            return r
        except (httpx.TransportError, httpx.HTTPStatusError) as e:
            last_exc = e
            await asyncio.sleep(0.6 * (2 ** attempt))
    assert last_exc is not None
    raise last_exc


async def esearch(client: httpx.AsyncClient, query: str, retmax: int = 8) -> list[str]:
    params = {
        "db": "pubmed",
        "term": query,
        "retmax": str(retmax),
        "retmode": "json",
        "sort": "relevance",
        **_common_params(),
    }
    r = await _throttled_get(client, f"{_BASE}/esearch.fcgi", params)
    data = r.json()
    return data.get("esearchresult", {}).get("idlist", [])


def _text(el) -> str:
    return "".join(el.itertext()).strip() if el is not None else ""


async def efetch(client: httpx.AsyncClient, pmids: list[str]) -> list[dict]:
    if not pmids:
        return []
    params = {
        "db": "pubmed",
        "id": ",".join(pmids),
        "retmode": "xml",
        "rettype": "abstract",
        **_common_params(),
    }
    r = await _throttled_get(client, f"{_BASE}/efetch.fcgi", params)
    root = ET.fromstring(r.text)
    papers: list[dict] = []
    for art in root.findall(".//PubmedArticle"):
        pmid = _text(art.find(".//PMID"))
        title = _text(art.find(".//Article/ArticleTitle"))
        # 摘要可能分多段(带 Label)
        abstract_parts = []
        for ab in art.findall(".//Abstract/AbstractText"):
            label = ab.get("Label")
            txt = _text(ab)
            abstract_parts.append(f"{label}: {txt}" if label else txt)
        abstract = " ".join(abstract_parts)
        # 第一作者
        first_author = ""
        author = art.find(".//AuthorList/Author")
        if author is not None:
            last = _text(author.find("LastName"))
            initials = _text(author.find("Initials"))
            first_author = f"{last} {initials}".strip()
        journal = _text(art.find(".//Journal/Title"))
        year = _text(art.find(".//JournalIssue/PubDate/Year")) or _text(
            art.find(".//JournalIssue/PubDate/MedlineDate")
        )
        if not pmid or not title:
            continue
        papers.append(
            {
                "pmid": pmid,
                "title": title,
                "abstract": abstract,
                "first_author": first_author,
                "journal": journal,
                "year": year,
                "url": pubmed_url(pmid),
            }
        )
    return papers


async def search_literature(queries: list[str], per_query: int = 6, cap: int = 18) -> list[dict]:
    """对多个检索式检索并合并去重, 返回带摘要的论文列表。"""
    seen: set[str] = set()
    collected: list[str] = []
    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
        for q in queries:
            try:
                ids = await esearch(client, q, retmax=per_query)
            except Exception:  # noqa: BLE001
                continue
            for pid in ids:
                if pid not in seen:
                    seen.add(pid)
                    collected.append(pid)
            if len(collected) >= cap:
                break
        collected = collected[:cap]
        try:
            return await efetch(client, collected)
        except Exception:  # noqa: BLE001
            return []
