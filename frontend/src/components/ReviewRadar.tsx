// 从评审"评分汇总"表解析五维度评分, 画一张雷达图(纯 SVG, 无依赖)。
// 评审 prompt 固定输出 | 维度 | 评审一 | 评审二 | 评审三 | 的表格, 评级为 优/良/中/差。
// 解析: 优=4 良=3 中=2 差=1, 每维度取三位评审均分。解析不到足够维度则不渲染(优雅降级)。
const DIMS = ["科学问题凝练", "创新性", "研究基础", "方案可行性", "写作规范"];
const GRADE: Record<string, number> = { 优: 4, 良: 3, 中: 2, 差: 1 };
const MAX = 4;

interface DimScore {
  name: string;
  score: number;
}

function parseScores(text: string): DimScore[] {
  const out: DimScore[] = [];
  for (const dim of DIMS) {
    // 匹配以该维度名开头的表格行, 抓取其后的若干单元格
    const re = new RegExp(`\\|\\s*${dim}\\s*\\|([^\\n]*)\\|?`);
    const m = re.exec(text);
    if (!m) continue;
    const cells = m[1].split("|").map((c) => c.trim());
    const nums = cells.map((c) => GRADE[c]).filter((n): n is number => typeof n === "number");
    if (nums.length === 0) continue;
    out.push({ name: dim, score: nums.reduce((a, b) => a + b, 0) / nums.length });
  }
  return out;
}

export default function ReviewRadar({ text }: { text: string }) {
  const dims = parseScores(text);
  if (dims.length < 3) return null; // 维度不足无法成图, 优雅隐藏

  const N = dims.length;
  const cx = 140;
  const cy = 132;
  const R = 92;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / N;
  const pt = (i: number, r: number) => [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];

  const gridLevels = [1, 2, 3, 4];
  const dataPoly = dims
    .map((d, i) => pt(i, (R * d.score) / MAX).map((n) => n.toFixed(1)).join(","))
    .join(" ");

  return (
    <div className="review-radar" data-testid="review-radar">
      <div className="radar-title">评分雷达（优 4 · 良 3 · 中 2 · 差 1）</div>
      <svg viewBox="0 0 280 250" role="img" aria-label="评审评分雷达图">
        {/* 网格 */}
        {gridLevels.map((lv) => (
          <polygon
            key={lv}
            className="radar-grid"
            points={dims.map((_, i) => pt(i, (R * lv) / MAX).map((n) => n.toFixed(1)).join(",")).join(" ")}
          />
        ))}
        {/* 轴线 + 维度标签 */}
        {dims.map((d, i) => {
          const [ax, ay] = pt(i, R);
          const [lx, ly] = pt(i, R + 16);
          const anchor = Math.abs(lx - cx) < 8 ? "middle" : lx > cx ? "start" : "end";
          return (
            <g key={d.name}>
              <line className="radar-axis" x1={cx} y1={cy} x2={ax} y2={ay} />
              <text className="radar-label" x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle">
                {d.name}
              </text>
            </g>
          );
        })}
        {/* 数据多边形 */}
        <polygon className="radar-data" points={dataPoly} />
        {dims.map((d, i) => {
          const [px, py] = pt(i, (R * d.score) / MAX);
          return <circle key={d.name} className="radar-dot" cx={px} cy={py} r={3} />;
        })}
      </svg>
    </div>
  );
}
