"""国自然(NSFC)生成式 AI 使用合规辅助。

依据 2024 年以来基金委对生成式人工智能使用的规定要点:
  - 允许: 用 AI 跟踪研究动态、检索整理参考文献等辅助环节;
  - 强制: 必须由人工核实 AI 生成信息与参考文献的真实性、准确性;
  - 禁止: 直接使用 AI 生成的申请书 / 进展报告 / 结题报告, 不得使用未经核实的内容,
          不得隐瞒 AI 使用;
  - 标注: 按国家有关规定对相关内容进行标识(如在文本起止位置添加文字提示)。

本模块提供一段可直接附在材料中的“AI 使用说明”模板, 以及一份提交前自查清单。
模板仅为辅助, 申请人须根据实际使用情况据实修改后采用。
"""
from __future__ import annotations

import datetime

from .config import settings

# 申请人据实填写后附于相关材料的标识模板。
# 依科技部《负责任研究行为规范指引》, 披露应包含工具名称、版本与使用时间;
# 标识置于文本起止位置(【生成式人工智能使用说明】…【说明结束】)。
ANNOTATION_TEMPLATE = (
    "【生成式人工智能使用说明】本{material}在撰写过程中使用了生成式人工智能工具"
    "（名称及版本：{tool}；使用时间：{when}）辅助完成以下环节：{scenes}。"
    "所用 AI 仅作为辅助手段，其生成的文字、数据与参考文献均已由申请人逐一核实其真实性与准确性；"
    "核心科学思想、研究方案与结论由申请人独立完成并负责，"
    "本{material}未直接使用生成式人工智能生成的整段申请材料。【说明结束】"
)

DEFAULT_SCENES = "文献检索与整理、研究动态梳理、语言表达润色"
DEFAULT_WHEN = "（请据实填写，如 2026 年 6 月）"

# 提交前自查清单(对照基金委红线)。
CHECKLIST = [
    "核心创新点、科学问题与研究方案是否由本人独立提出（AI 不得代写实质内容）",
    "正文引用的每一篇参考文献是否真实存在、且与论点相符（逐条核实 DOI/PMID/题录）",
    "AI 生成的所有数字、结论是否已与原始资料核对，无编造或臆测",
    "是否已在材料适当位置据实标注生成式 AI 的使用情况，未隐瞒使用",
    "全文是否已通读，语义、逻辑、术语准确，无 AI 特有的空泛套话",
    "正文篇幅是否符合规定（自 2026 年起面上/青年 C 类申请书正文原则上不超过 30 页，"
    "结构为立项依据/研究内容/研究基础三部分），格式符合当年最新申请书模板与项目指南",
    "是否已按 2026 新规准备不超过 5 项代表性研究成果（代表作）及本人贡献说明"
    "（替代传统论文论著目录，须如实、可核查）",
]


def build_annotation(
    material: str = "申请书",
    tool: str = "大语言模型（请据实填写名称与版本）",
    scenes: str = "",
    when: str = "",
) -> str:
    return ANNOTATION_TEMPLATE.format(
        material=material.strip() or "申请书",
        tool=tool.strip() or "大语言模型（请据实填写名称与版本）",
        scenes=scenes.strip() or DEFAULT_SCENES,
        when=when.strip() or DEFAULT_WHEN,
    )


def compliance_info(tool: str = "", when: str = "", scenes: str = "") -> dict:
    # 自动预填: 工具名用配置的模型、使用时间用当前月份, 减少用户手填。
    # 留空的字段才用默认值; 前端可按"实际用过的模块"传入 scenes。
    auto_tool = tool.strip() or (settings.model or "")
    today = datetime.date.today()
    auto_when = when.strip() or f"{today.year}年{today.month}月"
    return {
        "annotation": build_annotation(tool=auto_tool, when=auto_when, scenes=scenes),
        "checklist": CHECKLIST,
        "notice": (
            "提示：基金委规定不得直接使用 AI 生成的申请书，AI 仅可用于检索、整理、润色等辅助环节，"
            "且必须人工核实真实性并如实标注。本工具的所有产出均为草稿与建议，请务必本人改写、核对后使用。"
        ),
    }
