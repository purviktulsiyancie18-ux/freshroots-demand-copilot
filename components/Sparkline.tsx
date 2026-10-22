// 16-week sales (solid) + 4-week AI forecast (dashed).
export function Sparkline({ sales, forecast, width = 360, height = 90 }: { sales: { week: string; units: number }[]; forecast: number[] | null; width?: number; height?: number }) {
  const all = [...sales.map((s) => s.units), ...(forecast ?? [])];
  if (!all.length) return <p className="text-xs text-slate-500">No sales history.</p>;
  const n = sales.length + (forecast?.length ?? 0);
  const max = Math.max(...all) * 1.1 || 1;
  const min = Math.min(0, ...all);
  const pad = 6;
  const x = (i: number) => pad + (i * (width - 2 * pad)) / Math.max(1, n - 1);
  const y = (v: number) => height - pad - ((v - min) * (height - 2 * pad)) / (max - min);
  const salesPts = sales.map((s, i) => `${x(i)},${y(s.units)}`).join(" ");
  const fc = forecast?.length && sales.length ? [sales[sales.length - 1].units, ...forecast] : [];
  const fcPts = fc.map((v, i) => `${x(sales.length - 1 + i)},${y(v)}`).join(" ");
  return (
    <figure>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-md" role="img" aria-label="Weekly sales and forecast">
        {sales.length > 0 && <line x1={x(sales.length - 1)} x2={x(sales.length - 1)} y1={pad} y2={height - pad} stroke="#e2e8f0" strokeDasharray="2 3" />}
        <polyline points={salesPts} fill="none" stroke="#047857" strokeWidth={2} strokeLinejoin="round" />
        {fcPts && <polyline points={fcPts} fill="none" stroke="#7c3aed" strokeWidth={2} strokeDasharray="5 4" />}
        {sales.map((s, i) => (
          <circle key={s.week} cx={x(i)} cy={y(s.units)} r={1.8} fill="#047857">
            <title>{`${s.week}: ${s.units}`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="mt-1 flex gap-4 text-[11px] text-slate-500">
        <span>
          <span className="mr-1 inline-block h-0.5 w-4 bg-emerald-700 align-middle" />
          Sales {sales[0]?.week} → {sales[sales.length - 1]?.week}
        </span>
        {forecast && (
          <span>
            <span className="mr-1 inline-block w-4 border-t-2 border-dashed border-violet-600 align-middle" />
            AI forecast: {forecast.join(", ")}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
