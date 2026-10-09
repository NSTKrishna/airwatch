// Charts. One y-axis each; series colours follow the entity everywhere:
// background = series-1, site = series-2, difference = violet, barrier = dashed ink.
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { fmtDateTime, fmtNumber, fmtTime } from '../lib/format.js';

export const SERIES = {
  background: '#2a78d6',
  site: '#eb6834',
  difference: '#4a3aa7',
  barrier: '#44504d',
  flag: '#b3261e',
};
// Fixed locality order so a locality keeps its colour regardless of filters.
export const LOCALITY_COLORS = { 'MUM-AND': '#2a78d6', 'MUM-BAN': '#eb6834', 'MUM-KUR': '#1baf7a', 'MUM-POW': '#eda100' };

const AXIS = { stroke: '#c4c0b3', tick: { fill: '#5f6a67', fontSize: 11 }, tickLine: false };
const GRID = { stroke: '#e8e5dc', vertical: false };
const LEGEND = { iconType: 'plainline', verticalAlign: 'bottom', height: 28, wrapperStyle: { fontSize: 12, color: '#44504d', paddingTop: 6 } };

function ChartTooltip({ active, payload, label, unit = 'µg/m³', labelFormatter = fmtDateTime, footer }) {
  if (!active || !payload?.length) return null;
  const extra = footer?.(payload[0]?.payload);
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[0.75rem] shadow-(--shadow-pop)">
      <p className="mb-1 font-medium text-ink">{labelFormatter(label)}</p>
      {payload.filter((p) => p.value != null).map((p) => (
        <p key={p.dataKey} className="flex items-center justify-between gap-4 text-ink-2">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 rounded" style={{ background: p.color }} />{p.name}
          </span>
          <span className="num font-medium text-ink">{fmtNumber(p.value)} {unit}</span>
        </p>
      ))}
      {extra ? <p className="mt-1 font-medium text-flag">{extra}</p> : null}
    </div>
  );
}

const timeAxis = (points) => ({
  dataKey: 'ts',
  type: 'number',
  scale: 'time',
  domain: ['dataMin', 'dataMax'],
  tickFormatter: (v) => fmtTime(v),
  minTickGap: 48,
  ...AXIS,
  hide: points.length === 0,
});

const withTs = (points) => points.map((p) => ({ ...p, ts: new Date(p.t).getTime() }));

function AnomalyDot({ cx, cy, payload }) {
  if (!payload?.anomalies || cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={4.5} fill={SERIES.flag} stroke="#fff" strokeWidth={2} />;
}

export function DifferenceChart({ points, labels, height = 220 }) {
  const data = withTs(points);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid {...GRID} />
        <XAxis {...timeAxis(data)} />
        <YAxis {...AXIS} axisLine={false} width={44} />
        <Tooltip content={<ChartTooltip footer={(p) => (p?.anomalies ? labels.flagged : null)} />} />
        <Legend {...LEGEND} />
        <Line name={labels.barrier} dataKey="barrier" stroke={SERIES.barrier} strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls={false} isAnimationActive={false} />
        <Line name={labels.difference} dataKey="difference" stroke={SERIES.difference} strokeWidth={2} dot={<AnomalyDot />} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function LevelsChart({ points, labels, height = 220 }) {
  const data = withTs(points);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid {...GRID} />
        <XAxis {...timeAxis(data)} />
        <YAxis {...AXIS} axisLine={false} width={44} />
        <Tooltip content={<ChartTooltip />} />
        <Legend {...LEGEND} />
        <Line name={labels.background} dataKey="background" stroke={SERIES.background} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        <Line name={labels.site} dataKey="site" stroke={SERIES.site} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Average site PM10 per locality over time. `series` rows: {t, locality, site}. */
export function LocalityTrendChart({ series, localities, height = 260 }) {
  const byTime = new Map();
  for (const row of series) {
    const ts = new Date(row.t).getTime();
    if (!byTime.has(ts)) byTime.set(ts, { ts });
    byTime.get(ts)[row.locality] = row.site;
  }
  const data = [...byTime.values()].sort((a, b) => a.ts - b.ts);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid {...GRID} />
        <XAxis {...timeAxis(data)} />
        <YAxis {...AXIS} axisLine={false} width={44} />
        <Tooltip content={<ChartTooltip />} />
        <Legend {...LEGEND} />
        {localities.map((l) => (
          <Line key={l.code} name={l.name} dataKey={l.code} stroke={LOCALITY_COLORS[l.code]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function LocalityBarChart({ localities, height = 240 }) {
  const data = localities.map((l) => ({ name: l.name, background: l.avgBackground, site: l.avgSite }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }} barGap={2} barCategoryGap="28%">
        <CartesianGrid {...GRID} />
        <XAxis dataKey="name" {...AXIS} />
        <YAxis {...AXIS} axisLine={false} width={44} />
        <Tooltip cursor={{ fill: '#16201e0a' }} content={<ChartTooltip labelFormatter={(v) => v} />} />
        <Legend {...LEGEND} iconType="square" />
        <Bar name="Background PM10" dataKey="background" fill={SERIES.background} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        <Bar name="Site PM10" dataKey="site" fill={SERIES.site} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Plain horizontal bars for small categorical counts; values are printed, so no axis. */
export function CountBars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label} className="grid grid-cols-[9.5rem_1fr_2.5rem] items-center gap-3 text-[0.8125rem]">
          <span className="truncate text-ink-2">{row.label}</span>
          <span className="h-2.5 rounded-r bg-mute-soft">
            <span className="block h-full rounded-r bg-accent" style={{ width: `${(row.value / max) * 100}%`, minWidth: row.value ? 3 : 0 }} />
          </span>
          <span className="num text-right font-medium text-ink">{row.value}</span>
        </li>
      ))}
    </ul>
  );
}
