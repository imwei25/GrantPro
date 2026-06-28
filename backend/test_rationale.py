"""立项依据引用核验(反编造)离线校验。

运行: backend/.venv/Scripts/python.exe test_rationale.py

verify_citations 是反"编造文献"的核心: 正文引用的 PMID / DOI 必须来自检索结果,
否则标为 unverified(疑似编造)。本测试覆盖 PMID 与 DOI 两类、大小写、真假混合。
"""
from __future__ import annotations

import sys

from app.rationale import QUERY_SYSTEM, verify_citations

PAPERS = [
    {"pmid": "12345678", "doi": "", "title": "PubMed one"},
    {"pmid": "", "doi": "10.1234/ABC", "title": "Crossref one"},  # DOI 存大写
    # Semantic Scholar 文献: 既无 DOI 又无 PMID, 仅有 paperId 链接(标识藏在 url)
    {"pmid": "", "doi": "", "title": "S2 one", "url": "https://www.semanticscholar.org/paper/abc123def"},
]


def main() -> int:
    full = (
        "见 [A et al., 2023](https://pubmed.ncbi.nlm.nih.gov/12345678/)，"
        "以及 [B et al., 2024](https://doi.org/10.1234/abc)。"  # 正文用小写 DOI
        "再见 [E et al., 2022](https://www.semanticscholar.org/paper/abc123def)。"  # 真实 S2 链接
        "另有可疑引用 [C](https://pubmed.ncbi.nlm.nih.gov/99999999/)、 "
        "[D](https://doi.org/10.9999/fake) 与 "
        "[F](https://www.semanticscholar.org/paper/deadbeef999)。"  # 伪造 S2 链接
    )
    v = verify_citations(full, PAPERS)

    checks = [
        ("共识别 6 处引用", v["total"] == 6),
        ("已核实 3 处", v["verified"] == 3),
        ("PMID 大小写无关命中真实文献", "12345678" not in v["unverified"]),
        ("DOI 大小写无关命中真实文献", "10.1234/abc" not in v["unverified"]),
        ("S2 paperId 命中真实文献", "abc123def" not in v["unverified"]),
        ("捕获伪造 PMID", "99999999" in v["unverified"]),
        ("捕获伪造 DOI", "10.9999/fake" in v["unverified"]),
        ("捕获伪造 S2 链接(不再逃逸核验)", "deadbeef999" in v["unverified"]),
        ("unverified 恰为 3 个", len(v["unverified"]) == 3),
    ]

    # 无引用时不应误报
    v2 = verify_citations("正文没有任何引用链接。", PAPERS)
    checks.append(("无引用时 total=0", v2["total"] == 0 and v2["unverified"] == []))

    # 检索式生成应学科中立(服务 PubMed+Crossref 全学科), 不再绑定医学/PubMed/MeSH
    checks.append(("检索式提示词跨学科", "跨学科" in QUERY_SYSTEM))
    checks.append(("检索式提示词同时面向 Crossref", "Crossref" in QUERY_SYSTEM))
    checks.append(("检索式提示词不绑定医学/MeSH", "医学" not in QUERY_SYSTEM and "MeSH" not in QUERY_SYSTEM))

    failed = [n for n, ok in checks if not ok]
    for n, ok in checks:
        print(f"{'PASS' if ok else 'FAIL'} | {n}")
    print(f"\n==== {len(checks) - len(failed)}/{len(checks)} 通过 ====")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
