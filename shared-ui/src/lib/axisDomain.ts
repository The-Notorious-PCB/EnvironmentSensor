export interface AxisFit {
  domain: [number, number];
  ticks: number[];
}

/** A y-axis that fits the data instead of a sensor's whole display range,
 * so small changes are visible: the data's min..max plus a 10% margin, never
 * narrower than `minSpan` (so sensor noise isn't blown up into apparent
 * swings), rounded out to 1/2/5-style steps so the tick labels are round
 * numbers. With no finite values, returns `fallback` with no forced ticks.
 */
export function fitAxis(values: number[], minSpan: number, fallback: [number, number]): AxisFit {
  let lo = Infinity;
  let hi = -Infinity;
  // A loop, not Math.min(...values): a long raw session can be hundreds of
  // thousands of points, past the spread-argument limit.
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (lo > hi) return { domain: fallback, ticks: [] };

  const span = hi - lo;
  if (span < minSpan) {
    const mid = (lo + hi) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  } else {
    lo -= span * 0.1;
    hi += span * 0.1;
  }

  // ~5 intervals. Fewer, coarser steps round the ends out so far (up to 2x)
  // that the data only fills part of the chart again.
  const step = niceStep((hi - lo) / 5);
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const round = (x: number) => Number(x.toFixed(decimals));
  const start = round(Math.floor(lo / step) * step);
  const end = round(Math.ceil(hi / step) * step);

  const ticks: number[] = [];
  for (let i = 0; ; i++) {
    const t = round(start + i * step);
    if (t > end) break;
    ticks.push(t);
  }
  return { domain: [start, end], ticks };
}

/** Smallest 1, 2 or 5 x 10^n that is >= raw. */
function niceStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / magnitude;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * magnitude;
}
