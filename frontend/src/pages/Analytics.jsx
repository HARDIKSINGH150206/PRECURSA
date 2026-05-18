import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import {
  FiAlertTriangle,
  FiPackage,
  FiTrendingUp,
  FiTruck
} from 'react-icons/fi'

import MetricCard from '../components/MetricCard'
import ChartCard from '../components/analytics/ChartCard'
import InsightCard from '../components/analytics/InsightCard'
import { riskLevelFromDRI } from '../utils/risk'

const BUCKETS = [
  { key: 'Low', min: 0, max: 44, color: '#64748b' },
  { key: 'Medium', min: 45, max: 64, color: '#facc15' },
  { key: 'High', min: 65, max: 79, color: '#fb923c' },
  { key: 'Critical', min: 80, max: 100, color: '#ef4444' }
]

const TREND_WINDOW = 12

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function safeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0
}

function formatShortTime(label) {
  if (!label || label === '--') return '--'
  return label
}

function factorValue(breakdown, key) {
  const item = breakdown.find((entry) => String(entry.name || '').toLowerCase() === key.toLowerCase())
  return safeNumber(item?.value)
}

function getPrimaryDriver(shipment) {
  const factors = Array.isArray(shipment?.factors) ? shipment.factors : []
  const sorted = [...factors].sort((left, right) => safeNumber(right.value) - safeNumber(left.value))
  return sorted[0]?.name || 'Operational pressure'
}

function buildHotspots(shipments) {
  const grouped = new Map()

  shipments.forEach((shipment) => {
    const dri = safeNumber(shipment?.dri)
    const candidates = []

    if (shipment?.current_location) {
      candidates.push({ label: shipment.current_location, weight: 1.2 })
    }

    if (shipment?.origin && shipment?.destination) {
      candidates.push({ label: `${shipment.origin} → ${shipment.destination}`, weight: 1 })
    }

    if (shipment?.origin) {
      candidates.push({ label: shipment.origin, weight: 0.72 })
    }

    if (shipment?.destination) {
      candidates.push({ label: shipment.destination, weight: 0.72 })
    }

    candidates.forEach(({ label, weight }) => {
      const key = label.trim()
      const existing = grouped.get(key) || { label: key, score: 0, count: 0, driTotal: 0, drivers: {} }
      existing.score += dri * weight
      existing.count += 1
      existing.driTotal += dri

      const driver = getPrimaryDriver(shipment)
      existing.drivers[driver] = (existing.drivers[driver] || 0) + 1

      grouped.set(key, existing)
    })
  })

  return [...grouped.values()]
    .map((entry) => {
      const dominantDriver = Object.entries(entry.drivers).sort((left, right) => right[1] - left[1])[0]?.[0] || 'Operational pressure'
      return {
        ...entry,
        averageRisk: entry.count ? Math.round(entry.driTotal / entry.count) : 0,
        dominantDriver
      }
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
}

export default function Analytics({ shipments = [], vessels = [], overview = null, loading = false, lastUpdated = '--' }) {
  const [history, setHistory] = useState([])

  const totalShipments = shipments.length
  const averageRisk = safeNumber(overview?.average_risk ?? (totalShipments ? shipments.reduce((sum, shipment) => sum + safeNumber(shipment?.dri), 0) / totalShipments : 0))
  const highRiskShipments = safeNumber(overview?.high_risk_shipments ?? shipments.filter((shipment) => safeNumber(shipment?.dri) >= 65).length)
  const activeVessels = safeNumber(overview?.active_vessels ?? vessels.length)
  const reroutedShipments = shipments.filter((shipment) => Boolean(shipment?.rerouted)).length

  const breakdown = useMemo(() => {
    const base = Array.isArray(overview?.risk_breakdown) ? overview.risk_breakdown : []
    const normalized = [
      { name: 'Weather', value: factorValue(base, 'weather') },
      { name: 'Congestion', value: factorValue(base, 'congestion') },
      { name: 'Tariff', value: factorValue(base, 'tariff') },
      { name: 'Carrier', value: factorValue(base, 'carrier') },
      { name: 'Others', value: factorValue(base, 'others') }
    ]

    const total = normalized.reduce((sum, item) => sum + item.value, 0)
    if (total > 0) {
      return normalized.map((item) => ({ ...item, value: Math.round((item.value / total) * 100) }))
    }

    return normalized
  }, [overview])

  useEffect(() => {
    if (loading || totalShipments === 0) {
      return
    }

    const signature = [
      formatShortTime(lastUpdated),
      averageRisk,
      highRiskShipments,
      activeVessels,
      reroutedShipments,
      ...breakdown.map((item) => `${item.name}:${item.value}`)
    ].join('|')

    const timer = window.setTimeout(() => {
      setHistory((previous) => {
        if (previous[previous.length - 1]?.signature === signature) {
          return previous
        }

        const next = [
          ...previous,
          {
            signature,
            label: formatShortTime(lastUpdated),
            averageRisk,
            highRiskShipments,
            activeVessels,
            reroutedShipments,
            weather: factorValue(breakdown, 'weather'),
            congestion: factorValue(breakdown, 'congestion'),
            tariff: factorValue(breakdown, 'tariff'),
            carrier: factorValue(breakdown, 'carrier')
          }
        ]

        return next.slice(-TREND_WINDOW)
      })
    }, 0)

    return () => window.clearTimeout(timer)
  }, [activeVessels, averageRisk, breakdown, highRiskShipments, lastUpdated, loading, reroutedShipments, totalShipments])

  const trendSeries = history.length > 0
    ? history
    : [{
        label: formatShortTime(lastUpdated),
        averageRisk,
        weather: factorValue(breakdown, 'weather'),
        congestion: factorValue(breakdown, 'congestion'),
        tariff: factorValue(breakdown, 'tariff'),
        carrier: factorValue(breakdown, 'carrier')
      }]

  const riskDistribution = useMemo(() => {
    return BUCKETS.map((bucket) => ({
      name: bucket.key,
      value: shipments.filter((shipment) => {
        const dri = safeNumber(shipment?.dri)
        return dri >= bucket.min && dri <= bucket.max
      }).length,
      color: bucket.color
    }))
  }, [shipments])

  const hotspots = useMemo(() => buildHotspots(shipments), [shipments])

  const topShipments = Array.isArray(overview?.top_shipments) && overview.top_shipments.length > 0
    ? overview.top_shipments
    : [...shipments].sort((left, right) => safeNumber(right?.dri) - safeNumber(left?.dri)).slice(0, 5)

  const latestDriver = breakdown.slice().sort((left, right) => right.value - left.value)[0]
  const riskLevel = riskLevelFromDRI(averageRisk)
  const riskDelta = history.length > 1
    ? averageRisk - history[Math.max(0, history.length - 4)].averageRisk
    : 0

  const forecast = useMemo(() => {
    const recent = history.slice(-4)
    const trend = recent.length > 1 ? recent[recent.length - 1].averageRisk - recent[0].averageRisk : 0
    const pressure = factorValue(breakdown, 'weather') * 0.45 + factorValue(breakdown, 'congestion') * 0.3 + factorValue(breakdown, 'carrier') * 0.15
    const vesselConstraint = activeVessels > 0 ? clamp(Math.round((totalShipments / activeVessels) * 10), 0, 12) : 12
    const predicted = clamp(Math.round(averageRisk + trend * 0.75 + pressure * 0.08 + vesselConstraint), 0, 100)
    const confidence = clamp(Math.round(58 + Math.min(history.length, 8) * 4 - Math.abs(trend) * 2), 35, 92)

    return {
      predicted,
      confidence,
      trend
    }
  }, [activeVessels, averageRisk, breakdown, history, totalShipments])

  const aiNarrative = useMemo(() => {
    const topShipment = topShipments[0]
    const topDriver = latestDriver?.name || 'Weather'
    const pressureText = topDriver === 'Weather'
      ? 'weather exposure is the dominant system-wide pressure.'
      : topDriver === 'Congestion'
        ? 'port congestion is currently driving most of the risk load.'
        : topDriver === 'Tariff'
          ? 'tariff pressure is leading the current disruption mix.'
          : 'carrier variability is the most visible operating risk.'

    return {
      summary: `The portfolio is holding at a ${riskLevel.toLowerCase()} risk posture with an average DRI of ${averageRisk}. ${pressureText}`,
      recommendation: topShipment
        ? `Prioritize ${topShipment.id} and the ${riskLevelFromDRI(safeNumber(topShipment.dri)).toLowerCase()}-risk lane into ${topShipment.destination}.`
        : 'Prioritize the highest-risk lanes as data refreshes continue.',
      watchlist: hotspots[0]
        ? `${hotspots[0].label} is the hottest exposure zone with a mean risk of ${hotspots[0].averageRisk}.`
        : 'Hotspot density is still too low to isolate a single corridor.'
    }
  }, [averageRisk, hotspots, latestDriver?.name, riskLevel, topShipments])

  if (loading && totalShipments === 0) {
    return (
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="glass-card animate-pulse p-6 text-slate-400">Loading analytics stream...</div>
        <div className="glass-card animate-pulse p-6 text-slate-400">Waiting for live shipment snapshots...</div>
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-4">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={FiPackage} title="Total Shipments" value={totalShipments} trend="Live route inventory" trendTone="neutral" />
        <MetricCard icon={FiAlertTriangle} title="High Risk Shipments" value={highRiskShipments} trend=">= 65 DRI threshold" trendTone="up" />
        <MetricCard icon={FiTruck} title="Active Vessels" value={activeVessels} trend="Streaming from AIS" trendTone="down" />
        <MetricCard icon={FiTrendingUp} title="Average Risk" value={averageRisk} trend={`${riskDelta >= 0 ? '+' : ''}${Math.round(riskDelta)} pts vs prior snapshot`} trendTone={riskDelta > 0 ? 'up' : riskDelta < 0 ? 'down' : 'neutral'} />
      </section>

      <ChartCard
        title="Risk Trend"
        description={`Rolling snapshot of average DRI and factor mix across the last ${Math.max(history.length, 1)} live refreshes.`}
      >
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendSeries}>
              <defs>
                <linearGradient id="avgRiskGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(7, 11, 18, 0.95)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '16px',
                  color: '#e2e8f0'
                }}
              />
              <Legend />
              <Area type="monotone" dataKey="averageRisk" name="Average DRI" stroke="#94a3b8" fill="url(#avgRiskGradient)" strokeWidth={2} />
              <Line type="monotone" dataKey="weather" name="Weather" stroke="#94a3b8" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="congestion" name="Congestion" stroke="#f97316" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="tariff" name="Tariff" stroke="#facc15" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="carrier" name="Carrier" stroke="#64748b" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-4">
          <ChartCard
            title="Risk Breakdown"
            description="Current factor mix powering the disruption risk score."
          >
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={breakdown}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={72}
                    outerRadius={102}
                    paddingAngle={2}
                    stroke="rgba(255,255,255,0.12)"
                  >
                    {breakdown.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={
                          entry.name === 'Weather' ? '#94a3b8'
                            : entry.name === 'Congestion' ? '#f97316'
                              : entry.name === 'Tariff' ? '#facc15'
                                : entry.name === 'Carrier' ? '#64748b'
                                  : '#64748b'
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(7, 11, 18, 0.95)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '16px',
                      color: '#e2e8f0'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 space-y-2">
              {breakdown.map((entry) => (
                <div key={entry.name} className="flex items-center justify-between rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-sm text-slate-200">
                  <span>{entry.name}</span>
                  <span className="text-slate-400">{entry.value}%</span>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>

        <div className="xl:col-span-4 space-y-4">
          <ChartCard
            title="AI Insights"
            description="Auto-generated operational commentary grounded in live shipment telemetry."
          >
            <div className="grid gap-3">
              <InsightCard title="System summary" label="Snapshot" tone="sky">
                {aiNarrative.summary}
              </InsightCard>
              <InsightCard title="Priority action" label="Recommendation" tone="orange">
                {aiNarrative.recommendation}
              </InsightCard>
              <InsightCard title="Hotspot readout" label="Watchlist" tone="emerald">
                {aiNarrative.watchlist}
              </InsightCard>
            </div>
          </ChartCard>

          <ChartCard
            title="Prediction"
            description="Short-horizon outlook inferred from the latest refresh cycle and factor pressure."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Next snapshot risk</p>
                <p className="mt-3 text-4xl font-semibold text-white">{forecast.predicted}</p>
                <p className="mt-2 text-sm text-slate-400">Projected within the next refresh window</p>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Confidence</p>
                  <p className="mt-3 text-2xl font-semibold text-white">{forecast.confidence}%</p>
                  <p className="mt-2 text-sm text-slate-400">Based on recent refresh consistency</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Trend signal</p>
                  <p className="mt-3 text-sm leading-6 text-slate-200">
                    {forecast.trend > 0
                      ? 'Momentum is drifting upward. The next snapshot is likely to stay under pressure unless weather or congestion eases.'
                      : forecast.trend < 0
                        ? 'Momentum is improving. The next snapshot should soften if the current operating mix holds.'
                        : 'Momentum is flat. The current risk regime is stable across live refreshes.'}
                  </p>
                </div>
              </div>
            </div>
          </ChartCard>
        </div>

        <div className="xl:col-span-4">
          <ChartCard
            title="Risk Distribution"
            description="How shipments are distributed across the operating risk bands."
          >
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(7, 11, 18, 0.95)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '16px',
                      color: '#e2e8f0'
                    }}
                  />
                  <Bar dataKey="value" radius={[12, 12, 0, 0]}>
                    {riskDistribution.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <ChartCard
            title="Hotspots"
            description="Highest-risk corridors and locations ranked by weighted DRI exposure."
          >
            <div className="space-y-3">
              {hotspots.length > 0 ? hotspots.map((hotspot, index) => (
                <div key={hotspot.label} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">{index + 1}</span>
                      <p className="text-sm font-medium text-white">{hotspot.label}</p>
                    </div>
                    <p className="mt-2 text-sm text-slate-400">Dominant driver: {hotspot.dominantDriver}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-sm text-slate-300 lg:min-w-[280px]">
                    <div className="rounded-xl border border-white/8 bg-black/20 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Avg DRI</p>
                      <p className="mt-2 text-lg font-semibold text-white">{hotspot.averageRisk}</p>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-black/20 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Shipments</p>
                      <p className="mt-2 text-lg font-semibold text-white">{hotspot.count}</p>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-black/20 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Score</p>
                      <p className="mt-2 text-lg font-semibold text-white">{Math.round(hotspot.score)}</p>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-8 text-sm text-slate-400">
                  Hotspot analysis will populate once live shipments are available.
                </div>
              )}
            </div>
          </ChartCard>
        </div>

        <div className="xl:col-span-5">
          <ChartCard
            title="Operational Watchlist"
            description="The highest-risk shipments currently driving the command-center view."
          >
            <div className="space-y-3">
              {topShipments.map((shipment, index) => (
                <div key={shipment.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">{shipment.id}</p>
                      <p className="mt-1 text-xs text-slate-400">{shipment.origin} → {shipment.destination}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">DRI</p>
                      <p className="mt-1 text-2xl font-semibold text-white">{safeNumber(shipment.dri)}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1">{riskLevelFromDRI(safeNumber(shipment.dri))}</span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1">{shipment.current_location}</span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1">{getPrimaryDriver(shipment)}</span>
                  </div>

                  {index === 0 ? (
                    <p className="mt-3 text-sm leading-6 text-slate-300">
                      This lane is the current priority escalation candidate because it sits at the intersection of live disruption pressure and fleet density.
                    </p>
                  ) : null}
                </div>
              ))}

              {topShipments.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-8 text-sm text-slate-400">
                  No shipment watchlist is available yet.
                </div>
              ) : null}
            </div>
          </ChartCard>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InsightCard title="Live freshness" label="System" tone="slate">
          Last synchronized at {lastUpdated}. The page refreshes from the backend every 10 seconds.
        </InsightCard>
        <InsightCard title="Risk posture" label="Assessment" tone={riskLevel === 'Critical' ? 'red' : riskLevel === 'High' ? 'orange' : 'sky'}>
          Current portfolio posture is <span className="font-semibold text-white">{riskLevel}</span> with {highRiskShipments} lanes above the escalation threshold.
        </InsightCard>
        <InsightCard title="Route concentration" label="Fleet" tone="emerald">
          {activeVessels > 0 ? `${Math.round((totalShipments / activeVessels) * 100)}% shipment-to-vessel density is currently being monitored across the AIS feed.` : 'No live vessels are available for fleet concentration analysis.'}
        </InsightCard>
        <InsightCard title="Escalation signal" label="Operations" tone="orange">
          {reroutedShipments > 0
            ? `${reroutedShipments} shipment${reroutedShipments === 1 ? '' : 's'} are already flagged for rerouting in the live dataset.`
            : 'No reroutes have been triggered yet; the analytics panel is tracking early-warning pressure only.'}
        </InsightCard>
      </div>
    </div>
  )
}
