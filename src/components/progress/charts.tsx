"use client";

// Hand-rolled SVG charts tuned for the dark theme. Data volumes are tiny
// (personal training logs), so no virtualization or memo games needed.

const W = 320;
const H = 130;
const PAD = { top: 10, right: 8, bottom: 20, left: 30 };

function scale(
  values: number[],
  outMin: number,
  outMax: number,
  domainMin?: number,
) {
  const min = domainMin ?? Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return (v: number) => outMin + ((v - min) / span) * (outMax - outMin);
}

function shortDate(d: string) {
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
}

export type Series = {
  label: string;
  color: string;
  points: { x: string; y: number }[];
};

export function LineChart({
  series,
  yMin,
  unit,
}: {
  series: Series[];
  yMin?: number;
  unit?: string;
}) {
  const allY = series.flatMap((s) => s.points.map((p) => p.y));
  const allX = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort();
  if (!allY.length || allX.length < 1) return null;

  const sx = (x: string) =>
    allX.length === 1
      ? (PAD.left + W - PAD.right) / 2
      : PAD.left + (allX.indexOf(x) / (allX.length - 1)) * (W - PAD.left - PAD.right);
  const syFn = scale(allY, H - PAD.bottom, PAD.top, yMin);

  const yMax = Math.max(...allY);
  const yLo = yMin ?? Math.min(...allY);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* grid */}
        {[0, 0.5, 1].map((t) => {
          const y = PAD.top + t * (H - PAD.top - PAD.bottom);
          const val = Math.round(yMax - t * (yMax - yLo));
          return (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y}
                stroke="var(--border)" strokeWidth="1" />
              <text x={PAD.left - 5} y={y + 3} textAnchor="end" fontSize="8"
                fill="var(--text-faint)" className="num">
                {val}
              </text>
            </g>
          );
        })}
        {/* x labels: first, middle, last */}
        {[0, Math.floor((allX.length - 1) / 2), allX.length - 1]
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((i) => (
            <text key={i} x={sx(allX[i])} y={H - 6} textAnchor="middle" fontSize="8"
              fill="var(--text-faint)" className="num">
              {shortDate(allX[i])}
            </text>
          ))}
        {/* series */}
        {series.map((s) => {
          const pts = s.points
            .slice()
            .sort((a, b) => a.x.localeCompare(b.x))
            .map((p) => `${sx(p.x)},${syFn(p.y)}`);
          return (
            <g key={s.label}>
              {pts.length > 1 && (
                <polyline points={pts.join(" ")} fill="none" stroke={s.color}
                  strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
              )}
              {s.points.map((p) => (
                <circle key={p.x} cx={sx(p.x)} cy={syFn(p.y)} r="2.5" fill={s.color} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="flex gap-3 flex-wrap mt-1">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5 text-[10px] text-muted">
            <span className="w-2 h-0.5 rounded" style={{ background: s.color }} />
            {s.label}
            {unit ? ` (${unit})` : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

export function BarChart({
  data,
  color = "var(--accent)",
  unit,
}: {
  data: { x: string; y: number }[];
  color?: string;
  unit?: string;
}) {
  if (!data.length) return null;
  const maxY = Math.max(...data.map((d) => d.y)) || 1;
  const innerW = W - PAD.left - PAD.right;
  const bw = Math.min(28, (innerW / data.length) * 0.7);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {[0, 0.5, 1].map((t) => {
          const y = PAD.top + t * (H - PAD.top - PAD.bottom);
          return (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y}
                stroke="var(--border)" strokeWidth="1" />
              <text x={PAD.left - 5} y={y + 3} textAnchor="end" fontSize="8"
                fill="var(--text-faint)" className="num">
                {Math.round(maxY * (1 - t))}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const cx = PAD.left + ((i + 0.5) / data.length) * innerW;
          const h = (d.y / maxY) * (H - PAD.top - PAD.bottom);
          return (
            <g key={d.x}>
              <rect x={cx - bw / 2} y={H - PAD.bottom - h} width={bw} height={h}
                fill={color} opacity="0.85" />
              <text x={cx} y={H - 6} textAnchor="middle" fontSize="8"
                fill="var(--text-faint)" className="num">
                {shortDate(d.x)}
              </text>
            </g>
          );
        })}
      </svg>
      {unit && <div className="text-[10px] text-muted mt-1">{unit}</div>}
    </div>
  );
}
