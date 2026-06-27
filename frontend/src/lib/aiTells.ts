// "AI 写作痕迹"启发式自检: 纯本地、无 LLM、无联网。
// 只做提示、不强改(阈值偏保守, 避免误杀正常学术表达)。
// 检测三类: 空泛套话、连接词偶用、过长句子。

// 精选的空泛/模板化表达(尽量只收 AI 味重、信息量低的, 减少误报)。
const STOCK_PHRASES = [
  "综上所述",
  "众所周知",
  "不言而喻",
  "毋庸置疑",
  "总而言之",
  "由此可见",
  "总的来说",
  "在当今社会",
  "随着科技的不断发展",
  "随着科学技术的发展",
  "具有重要的理论意义和现实意义",
  "具有重要的理论和现实意义",
  "具有重要的科学意义和应用价值",
  "起着至关重要的作用",
  "发挥着重要作用",
  "是一个值得深入研究的课题",
];

// 易被滥用的连接词(单个出现过多 => 行文单调)。
const CONNECTIVES = ["此外", "然而", "因此", "同时", "并且", "而且", "总之", "另外"];

const CONNECTIVE_LIMIT = 4; // 单个连接词出现达到此次数才提示
const LONG_SENTENCE_LEN = 80; // 单句字数超过此值视为过长

export interface AiTellsReport {
  stock: { phrase: string; count: number }[];
  connectives: { word: string; count: number }[];
  longSentences: number;
  total: number;
}

function countOccurrences(text: string, sub: string): number {
  if (!sub) return 0;
  let n = 0;
  let i = text.indexOf(sub);
  while (i !== -1) {
    n++;
    i = text.indexOf(sub, i + sub.length);
  }
  return n;
}

export function analyzeAiTells(text: string): AiTellsReport {
  const t = text || "";
  const stock = STOCK_PHRASES.map((phrase) => ({ phrase, count: countOccurrences(t, phrase) })).filter(
    (x) => x.count > 0,
  );
  const connectives = CONNECTIVES.map((word) => ({ word, count: countOccurrences(t, word) })).filter(
    (x) => x.count >= CONNECTIVE_LIMIT,
  );
  const longSentences = t
    .split(/[。！？!?\n]/)
    .filter((s) => s.trim().length > LONG_SENTENCE_LEN).length;
  const total =
    stock.reduce((a, b) => a + b.count, 0) +
    connectives.reduce((a, b) => a + b.count, 0) +
    longSentences;
  return { stock, connectives, longSentences, total };
}
