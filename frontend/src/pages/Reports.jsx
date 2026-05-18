import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import {
  FiBarChart2,
  FiCloud,
  FiDownload,
  FiFileText,
  FiPieChart,
  FiRefreshCw,
  FiShield,
  FiTrendingUp,
  FiTruck,
  FiZap
} from 'react-icons/fi'
import { motion } from 'framer-motion'

import Card from '../components/Card'
import ChartCard from '../components/analytics/ChartCard'
import InsightCard from '../components/analytics/InsightCard'

const reportTypes = [
  {
    key: 'risk-summary',
    title: 'Risk Summary Report',
    description: 'Executive view of current disruption exposure, hot lanes, and escalation pressure.',
    icon: FiShield,
  },
  {
    key: 'route-performance',
    title: 'Route Performance Report',
    description: 'Route-level risk distribution, congestion signals, and recurring corridor pressure.',
    icon: FiTrendingUp,
  },
  {
    key: 'weather-impact',
    title: 'Weather Impact Report',
    description: 'Live weather contribution, severity bands, and route exposure by maritime zone.',
    icon: FiCloud,
  },
  {
    key: 'operational-efficiency',
    title: 'Operational Efficiency Report',
    description: 'Fleet density, rerouting pressure, and throughput efficiency across the live network.',
    icon: FiTruck,
  }
]

const rangeOptions = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'custom', label: 'Custom' }
]

const factorPalette = {
  Weather: '#60a5fa',
  Congestion: '#f97316',
  Tariff: '#facc15',
  Carrier: '#94a3b8',
  Others: '#64748b'
}

function formatDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function safeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0
}

function riskLevelFromValue(value) {
  if (value >= 80) return 'Critical'
  if (value >= 65) return 'High'
  if (value >= 45) return 'Medium'
  return 'Low'
}

function groupRoutes(shipments) {
  const grouped = new Map()

  shipments.forEach((shipment) => {
    const key = `${shipment.origin || 'Unknown'} → ${shipment.destination || 'Unknown'}`
    const existing = grouped.get(key) || { route: key, score: 0, count: 0, driTotal: 0 }
    const dri = safeNumber(shipment.dri)
    existing.score += dri
    existing.count += 1
    existing.driTotal += dri
    grouped.set(key, existing)
  })

  return [...grouped.values()]
    .map((entry) => ({
      ...entry,
      averageRisk: entry.count ? Math.round(entry.driTotal / entry.count) : 0
    }))
    .sort((left, right) => right.averageRisk - left.averageRisk)
    .slice(0, 5)
}

function buildTrendSeries(shipments, overview, reportHistory) {
  if (reportHistory.length > 1) {
    return reportHistory.slice(-6)
  }

  const baseRisk = safeNumber(overview?.average_risk ?? (shipments.length ? shipments.reduce((sum, shipment) => sum + safeNumber(shipment.dri), 0) / shipments.length : 0))
  const weather = safeNumber(overview?.risk_breakdown?.find((item) => String(item.name || '').toLowerCase() === 'weather')?.value)
  const congestion = safeNumber(overview?.risk_breakdown?.find((item) => String(item.name || '').toLowerCase() === 'congestion')?.value)
  const carrier = safeNumber(overview?.risk_breakdown?.find((item) => String(item.name || '').toLowerCase() === 'carrier')?.value)

  return [
    { label: 'T-2', averageRisk: Math.max(0, Math.round(baseRisk - 5)), weather: Math.max(0, weather - 2), congestion: Math.max(0, congestion - 3), carrier: Math.max(0, carrier - 1) },
    { label: 'T-1', averageRisk: Math.max(0, Math.round(baseRisk - 2)), weather, congestion, carrier },
    { label: 'Now', averageRisk: Math.round(baseRisk), weather, congestion, carrier }
  ]
}

function buildInsights({ shipments, vessels, overview, currentWeather, weatherZones, routes }) {
  const insights = []
  const currentRisk = safeNumber(overview?.average_risk ?? 0)
  const highRiskCount = safeNumber(overview?.high_risk_shipments ?? shipments.filter((shipment) => safeNumber(shipment.dri) >= 65).length)
  const weatherBreakdown = overview?.risk_breakdown?.find((item) => String(item.name || '').toLowerCase() === 'weather')
  const congestionBreakdown = overview?.risk_breakdown?.find((item) => String(item.name || '').toLowerCase() === 'congestion')
  const dominantZone = [...weatherZones].sort((left, right) => safeNumber(right.severity) - safeNumber(left.severity))[0]
  const hottestRoute = routes[0]
  const activeVessels = vessels.length
  const weatherSeverity = safeNumber(currentWeather?.weather_severity ?? currentWeather?.risk ?? 0)

  if (dominantZone && safeNumber(dominantZone.severity) >= 65) {
    insights.push(`High congestion detected in ${dominantZone.name}.`)
  }

  if (weatherBreakdown) {
    insights.push(`Weather contributing ${Math.round(safeNumber(weatherBreakdown.value))}% to disruptions.`)
  }

  if (congestionBreakdown && safeNumber(congestionBreakdown.value) >= 25) {
    insights.push(`Congestion pressure remains elevated at ${Math.round(safeNumber(congestionBreakdown.value))}% of the active risk mix.`)
  }

  if (hottestRoute) {
    insights.push(`Route ${hottestRoute.route} is the highest-risk corridor with an average DRI of ${hottestRoute.averageRisk}.`)
  }

  if (activeVessels > 0) {
    const ratio = shipments.length ? Math.round((shipments.length / activeVessels) * 100) : 0
    insights.push(`Fleet density is currently ${ratio}% shipment-to-vessel coverage.`)
  }

  if (weatherSeverity >= 70) {
    insights.push(`Current weather severity is ${weatherSeverity}, which is influencing delay probability across active lanes.`)
  }

  if (currentRisk >= 65 || highRiskCount >= 5) {
    insights.push('Escalation threshold should remain active for the current operating window.')
  }

  return insights.slice(0, 5)
}

function buildReport({ type, range, shipments, vessels, overview, currentWeather, weatherZones, reportHistory }) {
  const routes = groupRoutes(shipments)
  const trendSeries = buildTrendSeries(shipments, overview, reportHistory)
  const factorBreakdown = Array.isArray(overview?.risk_breakdown) && overview.risk_breakdown.length > 0
    ? overview.risk_breakdown.map((item) => ({ name: item.name, value: safeNumber(item.value) }))
    : [
        { name: 'Weather', value: 0 },
        { name: 'Congestion', value: 0 },
        { name: 'Tariff', value: 0 },
        { name: 'Carrier', value: 0 },
        { name: 'Others', value: 0 }
      ]

  const totalShipments = overview?.total_shipments ?? shipments.length
  const highRiskShipments = overview?.high_risk_shipments ?? shipments.filter((shipment) => safeNumber(shipment.dri) >= 65).length
  const activeVessels = overview?.active_vessels ?? vessels.length
  const averageRisk = safeNumber(overview?.average_risk ?? (shipments.length ? shipments.reduce((sum, shipment) => sum + safeNumber(shipment.dri), 0) / shipments.length : 0))
  const weatherSeverity = safeNumber(currentWeather?.weather_severity ?? currentWeather?.risk ?? 0)
  const weatherZone = currentWeather?.zone_name || weatherZones[0]?.name || 'Singapore Strait'
  const hotRoute = routes[0]
  const riskLevel = riskLevelFromValue(averageRisk)
  const weatherContribution = factorBreakdown.find((item) => String(item.name).toLowerCase() === 'weather')?.value || 0
  const congestionContribution = factorBreakdown.find((item) => String(item.name).toLowerCase() === 'congestion')?.value || 0

  const typeSummary = {
    'risk-summary': `A ${riskLevel.toLowerCase()} risk posture is visible across ${totalShipments} shipments, with ${highRiskShipments} lanes above the escalation threshold.`,
    'route-performance': hotRoute
      ? `The most exposed route is ${hotRoute.route}, carrying an average DRI of ${hotRoute.averageRisk}.`
      : 'Route performance data will populate when shipment corridors are available.',
    'weather-impact': `Weather is contributing ${Math.round(weatherContribution)}% of the active disruption mix around ${weatherZone}.`,
    'operational-efficiency': activeVessels > 0
      ? `Fleet coverage is currently ${Math.round((totalShipments / activeVessels) * 100)}% shipment-to-vessel density, with rerouting pressure still manageable.`
      : 'No active vessel data is currently available for efficiency assessment.'
  }

  const insightSeed = buildInsights({ shipments, vessels, overview, currentWeather, weatherZones, routes })

  const metrics = [
    { label: 'Total shipments', value: totalShipments, accent: 'text-white' },
    { label: 'High-risk lanes', value: highRiskShipments, accent: 'text-orange-200' },
    { label: 'Active vessels', value: activeVessels, accent: 'text-cyan-200' },
    { label: 'Average DRI', value: averageRisk, accent: 'text-emerald-200' }
  ]

  return {
    type,
    typeLabel: reportTypes.find((item) => item.key === type)?.title || 'Risk Summary Report',
    range,
    timestamp: new Date().toISOString(),
    title: `${reportTypes.find((item) => item.key === type)?.title || 'Logistics Report'} • ${range === 'custom' ? 'Custom window' : range.toUpperCase()}`,
    summary: typeSummary[type] || typeSummary['risk-summary'],
    metrics,
    insights: insightSeed,
    trendSeries,
    routes,
    factors: factorBreakdown,
    averageRisk,
    weatherSeverity,
    weatherZone,
    weatherContribution,
    congestionContribution,
    hotRoute,
    riskLevel,
    generatedAt: formatDateTime(),
    reportId: `REP-${Date.now()}`
  }
}

function MetricTile({ label, value, tone = 'text-white' }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-3 text-3xl font-semibold ${tone}`}>{value}</p>
    </div>
  )
}

function TimeRangeButton({ active, children, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-xl border px-3 py-2 text-xs font-medium uppercase tracking-[0.16em] transition ${active ? 'border-cyan-400/40 bg-cyan-400/15 text-cyan-100' : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:bg-white/10 hover:text-white'}`}
    >
      {children}
    </button>
  )
}

function ReportTypeCard({ item, active, onGenerate, loading, highlight }) {
  const Icon = item.icon

  return (
    <Card className={`p-4 transition ${active ? 'border-cyan-400/30 bg-cyan-400/10' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-2 text-cyan-200">
              <Icon className="h-4 w-4" />
            </div>
            <p className="text-sm font-semibold text-white">{item.title}</p>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-400">{item.description}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">
          {highlight}
        </span>
        <button
          type="button"
          onClick={() => onGenerate(item.key)}
          disabled={loading}
          className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100 transition hover:border-cyan-400/40 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Generate Report
        </button>
      </div>
    </Card>
  )
}

function Reports({ shipments = [], vessels = [], overview = null, currentWeather = null, weatherZones = [], loading = false, lastUpdated = '--' }) {
  const [selectedType, setSelectedType] = useState('risk-summary')
  const [timeRange, setTimeRange] = useState('7d')
  const [customRange, setCustomRange] = useState({ start: '', end: '' })
  const [report, setReport] = useState(null)
  const [reportHistory, setReportHistory] = useState([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')

  const routes = useMemo(() => groupRoutes(shipments), [shipments])
  const trendSeries = useMemo(() => buildTrendSeries(shipments, overview, reportHistory), [overview, reportHistory, shipments])
  const reportInsights = useMemo(() => buildInsights({ shipments, vessels, overview, currentWeather, weatherZones, routes }), [currentWeather, overview, routes, shipments, vessels, weatherZones])

  const reportSnapshot = useMemo(() => buildReport({
    type: selectedType,
    range: timeRange,
    shipments,
    vessels,
    overview,
    currentWeather,
    weatherZones,
    reportHistory
  }), [currentWeather, overview, reportHistory, selectedType, shipments, timeRange, vessels, weatherZones])

  useEffect(() => {
    if (!report) {
      setReport(reportSnapshot)
      setReportHistory([reportSnapshot])
    }
  }, [report, reportSnapshot])

  const generateReport = (type = selectedType) => {
    setSelectedType(type)
    setIsGenerating(true)
    setStatusMessage('Generating report...')

    window.setTimeout(() => {
      const next = buildReport({
        type,
        range: timeRange,
        shipments,
        vessels,
        overview,
        currentWeather,
        weatherZones,
        reportHistory
      })

      setReport(next)
      setReportHistory((current) => [...current.slice(-5), next])
      setIsGenerating(false)
      setStatusMessage(`Report generated at ${next.generatedAt}`)
    }, 900)
  }

  const downloadBlob = (content, filename, type = 'text/plain;charset=utf-8') => {
    const blob = new Blob([content], { type })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    window.URL.revokeObjectURL(url)
  }

  const exportCsv = () => {
    const current = report || reportSnapshot
    const rows = [
      ['report_id', current.reportId],
      ['title', current.title],
      ['timestamp', current.generatedAt],
      ['time_range', current.range],
      ['average_dri', current.averageRisk],
      ['high_risk_lanes', overview?.high_risk_shipments ?? 0],
      ['active_vessels', overview?.active_vessels ?? vessels.length],
      ['weather_zone', current.weatherZone],
      ['weather_contribution', current.weatherContribution],
      ['congestion_contribution', current.congestionContribution]
    ]

    const csv = ['field,value', ...rows.map(([field, value]) => `${field},${String(value).replaceAll(',', ' ')}`)].join('\n')
    downloadBlob(csv, `${current.reportId}.csv`, 'text/csv;charset=utf-8')
    setStatusMessage('CSV export downloaded')
  }

  const downloadReport = () => {
    const current = report || reportSnapshot
    const content = [
      current.title,
      `Generated: ${current.generatedAt}`,
      `Range: ${current.range}`,
      '',
      'Summary',
      current.summary,
      '',
      'Metrics',
      ...current.metrics.map((metric) => `- ${metric.label}: ${metric.value}`),
      '',
      'Insights',
      ...current.insights.map((insight) => `- ${insight}`)
    ].join('\n')

    downloadBlob(content, `${current.reportId}.txt`)
    setStatusMessage('Report download started')
  }

  const simulatePdfExport = () => {
    const current = report || reportSnapshot
    setStatusMessage(`PDF export simulated for ${current.reportId}`)
  }

  const current = report || reportSnapshot
  const routeBars = current.routes.length > 0
    ? current.routes
    : routes

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card overflow-hidden border border-cyan-400/10 bg-gradient-to-br from-cyan-400/10 via-white/5 to-transparent p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-3">
            <span className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
              Reporting Console
            </span>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white">Reports</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Build executive-ready logistics reports from live shipment, vessel, and weather data, then export the current view for operations or leadership review.
              </p>
            </div>
          </div>

          <div className="grid min-w-[280px] grid-cols-2 gap-3 rounded-3xl border border-white/10 bg-slate-950/50 p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Live sync</p>
              <p className="mt-2 text-sm font-medium text-white">{lastUpdated}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Report status</p>
              <p className="mt-2 text-sm font-medium text-cyan-100">{statusMessage || 'Ready to generate'}</p>
            </div>
            <div className="col-span-2 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Time range</p>
                <p className="text-sm font-semibold text-white">{timeRange === 'custom' ? 'Custom window' : `${timeRange} window`}</p>
              </div>
              <FiFileText className="h-5 w-5 text-cyan-300" />
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
        {reportTypes.map((item) => (
          <ReportTypeCard
            key={item.key}
            item={item}
            active={selectedType === item.key}
            loading={isGenerating}
            onGenerate={generateReport}
            highlight={item.key === 'risk-summary' ? `Avg DRI ${Math.round(safeNumber(overview?.average_risk ?? 0))}` : item.key === 'route-performance' ? `${routes.length} corridors` : item.key === 'weather-impact' ? `${safeNumber(currentWeather?.weather_severity ?? currentWeather?.risk ?? 0)} severity` : `${vessels.length} active vessels`}
          />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <ChartCard
          title="Report Preview"
          description="Structured executive report generated from live operational data."
        >
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{current.reportId}</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">{current.title}</h2>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Generated</p>
                <p className="mt-1 text-sm font-medium text-white">{current.generatedAt}</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {current.metrics.map((metric) => (
                <MetricTile key={metric.label} label={metric.label} value={metric.value} tone={metric.accent} />
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
              <Card className="p-4">
                <p className="text-sm font-medium text-white">Summary</p>
                <p className="mt-3 text-sm leading-6 text-slate-300">{current.summary}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">{current.riskLevel} risk</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">{current.weatherZone}</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">{current.range}</span>
                </div>
              </Card>

              <Card className="p-4">
                <p className="text-sm font-medium text-white">Key Insights</p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
                  {(current.insights.length > 0 ? current.insights : reportInsights).slice(0, 5).map((insight) => (
                    <li key={insight} className="flex items-start gap-3">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-cyan-300" />
                      <span>{insight}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>

            {isGenerating && (
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
                <div className="flex items-center gap-3">
                  <FiRefreshCw className="h-4 w-4 animate-spin text-cyan-200" />
                  <div>
                    <p className="text-sm font-medium text-cyan-100">Generating report...</p>
                    <p className="text-xs text-cyan-100/70">Compiling metrics, insights, and charts from live dashboard data.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ChartCard>

        <ChartCard
          title="Filters & Export"
          description="Control the report window and export format before sending it to stakeholders."
        >
          <div className="space-y-5">
            <div>
              <p className="text-sm font-medium text-white">Time range</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {rangeOptions.map((option) => (
                  <TimeRangeButton
                    key={option.value}
                    active={timeRange === option.value}
                    onClick={() => setTimeRange(option.value)}
                  >
                    {option.label}
                  </TimeRangeButton>
                ))}
              </div>
            </div>

            {timeRange === 'custom' && (
              <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Start</span>
                  <input
                    type="date"
                    value={customRange.start}
                    onChange={(event) => setCustomRange((current) => ({ ...current, start: event.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
                  />
                </label>
                <label className="space-y-2">
                  <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">End</span>
                  <input
                    type="date"
                    value={customRange.end}
                    onChange={(event) => setCustomRange((current) => ({ ...current, end: event.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
                  />
                </label>
              </div>
            )}

            <div className="grid gap-3">
              <button
                type="button"
                onClick={simulatePdfExport}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/10"
              >
                <span className="flex items-center gap-2"><FiDownload className="text-cyan-300" /> Export PDF</span>
                <span className="text-xs text-slate-500">Simulated</span>
              </button>

              <button
                type="button"
                onClick={exportCsv}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/10"
              >
                <span className="flex items-center gap-2"><FiBarChart2 className="text-cyan-300" /> Export CSV</span>
                <span className="text-xs text-slate-500">Structured data</span>
              </button>

              <button
                type="button"
                onClick={downloadReport}
                className="flex items-center justify-between rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-left text-sm text-cyan-100 transition hover:border-cyan-400/40 hover:bg-cyan-400/20"
              >
                <span className="flex items-center gap-2"><FiFileText className="text-cyan-200" /> Download report</span>
                <span className="text-xs text-cyan-100/70">TXT export</span>
              </button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-300">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Current focus</p>
              <p className="mt-2 font-medium text-white">{reportTypes.find((item) => item.key === selectedType)?.title}</p>
              <p className="mt-2 text-xs leading-6 text-slate-400">
                {timeRange === 'custom'
                  ? `Custom range ${customRange.start || 'start'} to ${customRange.end || 'end'} is applied to the next report generation.`
                  : `The next export will use the ${timeRange} operating window.`}
              </p>
            </div>
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <ChartCard title="Risk Trend" description="Rolling report snapshots showing how average disruption risk is moving across report generations.">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={current.trendSeries}>
                <defs>
                  <linearGradient id="reportTrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'rgba(7, 11, 18, 0.96)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '16px', color: '#e2e8f0' }} />
                <Area type="monotone" dataKey="averageRisk" stroke="#22d3ee" fill="url(#reportTrendFill)" strokeWidth={2} name="Average DRI" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Risk Factors" description="Factor contribution to current disruption exposure.">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={current.factors} dataKey="value" nameKey="name" innerRadius={62} outerRadius={100} paddingAngle={2} stroke="rgba(255,255,255,0.12)">
                  {current.factors.map((entry) => (
                    <Cell key={entry.name} fill={factorPalette[entry.name] || '#64748b'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: 'rgba(7, 11, 18, 0.96)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '16px', color: '#e2e8f0' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <ChartCard title="Top Risky Routes" description="Highest exposure corridors based on the current shipment portfolio.">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={routeBars} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="route" type="category" width={160} tick={{ fill: '#cbd5e1', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'rgba(7, 11, 18, 0.96)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '16px', color: '#e2e8f0' }} />
                <Bar dataKey="averageRisk" radius={[0, 12, 12, 0]}>
                  {routeBars.map((entry, index) => (
                    <Cell key={entry.route} fill={index === 0 ? '#f97316' : index === 1 ? '#22d3ee' : '#64748b'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Insights Panel" description="Rule-based findings generated from live operational data.">
          <div className="space-y-3">
            {reportInsights.map((insight) => (
              <InsightCard key={insight} title="Operational insight" label="Rule-based" tone="sky">
                {insight}
              </InsightCard>
            ))}
            {reportInsights.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-slate-400">
                Insights will populate once the live data feed resolves.
              </div>
            )}
          </div>
        </ChartCard>
      </div>
    </div>
  )
}

export default Reports
