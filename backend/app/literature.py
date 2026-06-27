"""文献检索客户端(多源: PubMed + Crossref)。

用于“立项依据”的文献接地: 实际检索真实文献, 供 LLM 梳理国内外研究现状与不足,
并生成可点击的链接。两个数据源均免费、无需 key:
  - PubMed(NCBI E-utilities): 生物医学为主, 限速 3 次/秒(有 api_key 则 10 次/秒);
  - Crossref: 覆盖全学科(材料/物理/化学/工程/生态等), 国自然多数非医学学科靠它接地。
两源结果按标题归一去重后合并。

注意: 国自然申请书要求“必须人工核实生成式 AI 生成的信息与参考文献的真实性”。
本模块抓取的是真实存在的文献(带 PMID/DOI), 并在正文生成后做引用回查, 把“编造文献”
的风险降到最低; 但最终仍需申请人本人核对后使用。
"""
from __future__ import annotations

import asyncio
import re
import time
import xml.etree.ElementTree as ET

import httpx

from .config import settings

_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
_CROSSREF = "https://api.crossref.org/works"
_TOOL = "nsfc-grant-assistant"
_UA = "nsfc-grant-assistant/0.1 (literature grounding; +https://github.com/imwei25/GrantPro)"


def doi_url(doi: str) -> str:
    return f"https://doi.org/{doi}"


def _norm_title(title: str) -> str:
    """标题归一(小写、去非字母数字)用于跨源去重。"""
    return re.sub(r"[^a-z0-9]+", "", (title or "").lower())

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
        # DOI(若有): 用于引用回查时同时支持 PMID 与 DOI 两种链接形式。
        doi = ""
        for eid in art.findall(".//ELocationID"):
            if eid.get("EIdType") == "doi":
                doi = _text(eid)
                break
        if not doi:
            for aid in art.findall(".//ArticleId"):
                if aid.get("IdType") == "doi":
                    doi = _text(aid)
                    break
        if not pmid or not title:
            continue
        papers.append(
            {
                "pmid": pmid,
                "doi": doi,
                "title": title,
                "abstract": abstract,
                "first_author": first_author,
                "journal": journal,
                "year": year,
                "url": pubmed_url(pmid),
                "source": "pubmed",
            }
        )
    return papers


async def crossref_search(client: httpx.AsyncClient, query: str, rows: int = 6) -> list[dict]:
    """检索 Crossref(全学科), 返回与 PubMed 同构的论文记录(用 DOI 作标识)。"""
    params = {
        "query": query,
        "rows": str(rows),
        "select": "DOI,title,author,issued,container-title,abstract",
    }
    email = getattr(settings, "ncbi_email", "") or ""
    if email:
        params["mailto"] = email  # Crossref 礼貌池: 提供联系邮箱可获更稳定限速
    r = await _throttled_get(client, _CROSSREF, params)
    items = (r.json().get("message") or {}).get("items") or []
    papers: list[dict] = []
    for it in items:
        doi = (it.get("DOI") or "").strip()
        title_list = it.get("title") or []
        title = (title_list[0] if title_list else "").strip()
        if not doi or not title:
            continue
        authors = it.get("author") or []
        first_author = ""
        if authors:
            a = authors[0]
            family = (a.get("family") or "").strip()
            given = (a.get("given") or "").strip()
            initials = "".join(p[0] for p in given.split() if p)
            first_author = f"{family} {initials}".strip() or family
        parts = ((it.get("issued") or {}).get("date-parts") or [[]])
        # Crossref 偶尔返回 date-parts: [[null]], 需防 None
        year = str(parts[0][0]) if parts and parts[0] and parts[0][0] else ""
        ct = it.get("container-title") or []
        journal = ct[0] if ct else ""
        abstract = re.sub(r"<[^>]+>", " ", it.get("abstract") or "").strip()  # 去 JATS 标签
        papers.append(
            {
                "pmid": "",
                "doi": doi,
                "title": title,
                "abstract": abstract,
                "first_author": first_author,
                "journal": journal,
                "year": year,
                "url": doi_url(doi),
                "source": "crossref",
            }
        )
    return papers


async def _pubmed_collect(client: httpx.AsyncClient, queries: list[str], per_query: int, cap: int) -> list[dict]:
    seen: set[str] = set()
    collected: list[str] = []
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
    try:
        return await efetch(client, collected[:cap])
    except Exception:  # noqa: BLE001
        return []


async def _crossref_collect(client: httpx.AsyncClient, queries: list[str], per_query: int, cap: int) -> list[dict]:
    out: list[dict] = []
    for q in queries:
        try:
            out += await crossref_search(client, q, rows=per_query)
        except Exception:  # noqa: BLE001
            continue
        if len(out) >= cap:
            break
    return out[:cap]


def _merge_dedup(groups: list[list[dict]], cap: int) -> list[dict]:
    """跨源按标题归一去重合并; 先到先得(PubMed 优先), 截断到 cap。"""
    out: list[dict] = []
    seen: set[str] = set()
    for group in groups:
        for p in group:
            key = _norm_title(p.get("title", ""))
            if not key or key in seen:
                continue
            seen.add(key)
            out.append(p)
            if len(out) >= cap:
                return out
    return out


async def search_literature(
    queries: list[str],
    per_query: int = 6,
    cap: int = 18,
    sources: tuple[str, ...] = ("pubmed", "crossref"),
) -> list[dict]:
    """对多个检索式检索 PubMed + Crossref, 跨源按标题去重合并, 返回带摘要的论文列表。"""
    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
        groups: list[list[dict]] = []
        if "pubmed" in sources:
            groups.append(await _pubmed_collect(client, queries, per_query, cap))
        if "crossref" in sources:
            groups.append(await _crossref_collect(client, queries, per_query, cap))
    return _merge_dedup(groups, cap)
