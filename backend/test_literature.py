"""literature.py 的离线校验: api_key 注入与 429 退避重试。

运行: backend/.venv/Scripts/python.exe test_literature.py
用假 client 模拟 NCBI 响应, 不触网。
"""
from __future__ import annotations

import asyncio
import sys

import httpx

from app import literature
from app.config import settings


class FakeResp:
    def __init__(self, status_code: int, *, json_data=None, text: str = "", url: str = "http://x"):
        self.status_code = status_code
        self._json = json_data
        self.text = text
        self.request = httpx.Request("GET", url)

    def json(self):
        return self._json

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("err", request=self.request, response=self)


class FakeClient:
    """按预设队列依次返回响应; 记录调用次数与最后一次 params。"""

    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = 0
        self.last_params = None
        self.last_headers = None

    async def get(self, url, params=None, headers=None):
        self.calls += 1
        self.last_params = params
        self.last_headers = headers
        return self._responses.pop(0)


async def run() -> int:
    checks = []

    # 让退避更快, 避免测试拖太久(不改变重试逻辑本身)
    orig_sleep = asyncio.sleep
    async def fast_sleep(_):
        await orig_sleep(0)
    literature.asyncio.sleep = fast_sleep  # type: ignore[attr-defined]

    # 1) api_key 注入到公共参数
    settings.ncbi_api_key = "TESTKEY123"
    settings.ncbi_email = "me@example.com"
    p = literature._common_params()
    checks.append(("api_key 注入公共参数", p.get("api_key") == "TESTKEY123"))
    checks.append(("email 注入公共参数", p.get("email") == "me@example.com"))

    # 2) esearch 遇 429 退避后重试成功
    client = FakeClient([
        FakeResp(429, url="http://ncbi/esearch"),
        FakeResp(200, json_data={"esearchresult": {"idlist": ["111", "222"]}}, url="http://ncbi/esearch"),
    ])
    ids = await literature.esearch(client, "gut microbiota AND parkinson", retmax=5)
    checks.append(("429 后重试成功返回 idlist", ids == ["111", "222"]))
    checks.append(("确实重试了一次(共2次请求)", client.calls == 2))
    checks.append(("请求带 User-Agent", bool((client.last_headers or {}).get("User-Agent"))))

    # 3) 持续 429 超过重试上限则抛出(由上层 search_literature 兜底为空)
    client2 = FakeClient([FakeResp(429, url="http://x") for _ in range(5)])
    raised = False
    try:
        await literature.esearch(client2, "q", retmax=3)
    except httpx.HTTPStatusError:
        raised = True
    checks.append(("持续 429 最终抛出", raised))

    # 4) Crossref 解析: 全学科记录归一为同构 schema(用 DOI 作标识)
    cr_json = {"message": {"items": [
        {
            "DOI": "10.1234/abc",
            "title": ["A Materials Science Study"],
            "author": [{"given": "Jane Q", "family": "Smith"}],
            "issued": {"date-parts": [[2024, 3]]},
            "container-title": ["Journal of Materials"],
            "abstract": "<jats:p>Some <i>abstract</i> text</jats:p>",
        },
        {"title": ["No DOI should be skipped"]},  # 无 DOI 应跳过
        {"DOI": "10.5/z", "title": ["Null year paper"], "issued": {"date-parts": [[None]]}},  # 空年份
    ]}}
    cr_client = FakeClient([FakeResp(200, json_data=cr_json, url="http://crossref")])
    papers = await literature.crossref_search(cr_client, "materials", rows=6)
    checks.append(("Crossref 解析出 2 条(跳过无DOI)", len(papers) == 2))
    checks.append(("Crossref 空年份不报 None", next((x["year"] for x in papers if x["doi"] == "10.5/z"), None) == ""))
    p = papers[0] if papers else {}
    checks.append(("Crossref DOI 与 url", p.get("doi") == "10.1234/abc" and p.get("url") == "https://doi.org/10.1234/abc"))
    checks.append(("Crossref 第一作者缩写", p.get("first_author") == "Smith JQ"))
    checks.append(("Crossref 年份", p.get("year") == "2024"))
    checks.append(("Crossref 去 JATS 标签", "<" not in (p.get("abstract") or "") and "abstract" in (p.get("abstract") or "")))
    checks.append(("Crossref source 标记", p.get("source") == "crossref"))

    # 5) 跨源按标题归一去重: 同名文献只保留先到的(PubMed 优先)
    pm = [{"pmid": "1", "doi": "", "title": "Gut Microbiota Study", "url": "u1", "source": "pubmed"}]
    cr = [
        {"pmid": "", "doi": "10.1/x", "title": "gut  microbiota  study!", "url": "u2", "source": "crossref"},
        {"pmid": "", "doi": "10.2/y", "title": "A Different Paper", "url": "u3", "source": "crossref"},
    ]
    merged = literature._merge_dedup([pm, cr], cap=18)
    checks.append(("跨源去重保留2条", len(merged) == 2))
    checks.append(("同名优先保留 PubMed", merged[0]["source"] == "pubmed"))
    checks.append(("保留不同标题的 Crossref", any(m["title"] == "A Different Paper" for m in merged)))

    literature.asyncio.sleep = orig_sleep  # 还原

    failed = [n for n, ok in checks if not ok]
    for n, ok in checks:
        print(f"{'PASS' if ok else 'FAIL'} | {n}")
    print(f"\n==== {len(checks) - len(failed)}/{len(checks)} 通过 ====")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(run()))
