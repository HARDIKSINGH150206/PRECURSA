import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip
} from 'recharts'
import {
  FiClock,
  FiGlobe,
  FiRefreshCw,
  FiShield,
  FiZap
} from 'react-icons/fi'
import { motion } from 'framer-motion'

import Card from '../components/Card'
import ChartCard from '../components/analytics/ChartCard'
import InsightCard from '../components/analytics/InsightCard'
import { fetchGlobalRiskIntelligence } from '../services/api'

const MotionDiv = motion.div

const windows = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' }
]

const levelPalette = {
  high: '#ef4444',
  medium: '#f97316',
  low: '#64748b'
}

function levelTone(level) {
  if (level === 'high') return 'border-red-400/25 bg-red-500/10 text-red-100'
  if (level === 'medium') return 'border-orange-400/25 bg-orange-500/10 text-orange-100'
  return 'border-slate-400/20 bg-slate-500/10 text-slate-100'
}

function EventCard({ event }) {
  const level = String(event.risk_level || 'low').toLowerCase()
  const accentClass = level === 'high'
    ? 'border-red-400/30 bg-red-500/10'
    : level === 'medium'
      ? 'border-orange-400/25 bg-orange-500/10'
      : 'border-white/10 bg-white/5'

  return (
    <Card className={`p-4 transition ${accentClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${levelTone(level)}`}>
              {event.risk_level}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">
              {event.region}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">
              {event.source}
            </span>
          </div>
          <h3 className="text-lg font-semibold leading-7 text-white">{event.headline}</h3>
          <p className="text-sm leading-6 text-slate-300">{event.reasoning}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-right text-xs text-slate-400">
          <div className="flex items-center justify-end gap-2 text-slate-300">
            <FiClock className="h-4 w-4 text-cyan-300" />
            {event.timestamp}
          </div>
          <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">Published</p>
          <p className="mt-1 text-sm font-medium text-white">{event.published_at}</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Impact Summary</p>
        <p className="mt-2 text-sm leading-6 text-slate-200">{event.impact_summary}</p>
      </div>
    </Card>
  )
}

function GlobalRiskIntelligence() {
  const [windowRange, setWindowRange] = useState('24h')
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastFetch, setLastFetch] = useState('--')

  const fetchFeed = useCallback(async (nextWindow = windowRange) => {
    setRefreshing(Boolean(payload))
    setLoading(!payload)
    try {
      const response = await fetchGlobalRiskIntelligence(nextWindow)
      setPayload(response)
      setError('')
      setLastFetch(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    } catch (fetchError) {
      setError(fetchError?.response?.data?.detail || fetchError?.message || 'Unable to fetch global risk intelligence.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [payload, windowRange])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchFeed(windowRange)
    }, 0)
    const interval = window.setInterval(() => {
      void fetchFeed(windowRange)
    }, 180000)
    return () => {
      window.clearTimeout(timer)
      window.clearInterval(interval)
    }
  }, [fetchFeed, windowRange])

  const events = useMemo(() => (Array.isArray(payload?.events) ? payload.events : []), [payload])
  const summary = useMemo(() => payload?.summary || {}, [payload])

  const riskMix = useMemo(() => ([
    { name: 'High', value: summary.high_risk_articles || events.filter((item) => item.risk_level === 'high').length },
    { name: 'Medium', value: summary.medium_risk_articles || events.filter((item) => item.risk_level === 'medium').length },
    { name: 'Low', value: summary.low_risk_articles || events.filter((item) => item.risk_level === 'low').length }
  ]), [events, summary.high_risk_articles, summary.low_risk_articles, summary.medium_risk_articles])

  const regionMix = useMemo(() => {
    const grouped = new Map()
    events.forEach((event) => {
      const key = event.region || 'Global Logistics'
      const current = grouped.get(key) || { region: key, count: 0, high: 0, medium: 0 }
      current.count += 1
      if (event.risk_level === 'high') current.high += 1
      if (event.risk_level === 'medium') current.medium += 1
      grouped.set(key, current)
    })

    return [...grouped.values()].sort((left, right) => right.count - left.count).slice(0, 5)
  }, [events])

  const topEvents = useMemo(() => [...events].sort((left, right) => {
    const weight = { high: 3, medium: 2, low: 1 }
    return (weight[right.risk_level] || 1) - (weight[left.risk_level] || 1)
  }), [events])

  const insightText = useMemo(() => {
    if (!events.length) {
      return 'No geopolitical risk articles are currently available from the live news sources.'
    }

    const dominantRegion = summary.dominant_region || regionMix[0]?.region || 'Global Logistics'
    const topSignal = summary.top_signal || 'A watchlist-level geopolitical pattern is active.'
    return `${topSignal} The current dominant region is ${dominantRegion}.`
  }, [events.length, regionMix, summary.dominant_region, summary.top_signal])

  const totalEvents = summary.total_articles ?? events.length
  const highRiskEvents = summary.high_risk_articles ?? events.filter((event) => event.risk_level === 'high').length

  return (
    <div className="space-y-6">
      <MotionDiv
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card overflow-hidden border border-cyan-400/10 bg-gradient-to-br from-cyan-400/10 via-white/5 to-transparent p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-3">
            <span className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
              AI Global Risk Intelligence
            </span>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white">Global Risk Intelligence</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Real-time geopolitical monitoring built from live news coverage and Gemini-structured risk assessments for maritime logistics.
              </p>
            </div>
          </div>

          <div className="grid min-w-[280px] grid-cols-2 gap-3 rounded-3xl border border-white/10 bg-slate-950/50 p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Last fetch</p>
              <p className="mt-2 text-sm font-medium text-white">{lastFetch}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Status</p>
              <p className={`mt-2 text-sm font-medium ${error ? 'text-orange-200' : 'text-cyan-100'}`}>
                {error ? 'Degraded' : payload?.status === 'ok' ? 'Live' : 'Loading'}
              </p>
            </div>
            <div className="col-span-2 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Data source</p>
                <p className="text-sm font-semibold text-white">{payload?.source || 'Fetching live articles'}</p>
              </div>
              <FiGlobe className="h-5 w-5 text-cyan-300" />
            </div>
          </div>
        </div>
      </MotionDiv>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Total articles</p>
          <p className="mt-3 text-3xl font-semibold text-white">{loading && !payload ? '—' : totalEvents}</p>
          <p className="mt-2 text-sm text-slate-400">Recent geopolitically relevant headlines</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">High risk events</p>
          <p className="mt-3 text-3xl font-semibold text-red-200">{loading && !payload ? '—' : highRiskEvents}</p>
          <p className="mt-2 text-sm text-slate-400">Events flagged as high operational exposure</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Dominant region</p>
          <p className="mt-3 text-xl font-semibold text-white">{summary.dominant_region || '—'}</p>
          <p className="mt-2 text-sm text-slate-400">Most mentioned affected geography</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Window</p>
          <p className="mt-3 text-xl font-semibold text-white">{windowRange}</p>
          <p className="mt-2 text-sm text-slate-400">Rolling article window</p>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <ChartCard
          title="Filter & Signal"
          description="Switch the live monitoring window and inspect the current signal mix."
        >
          <div className="flex flex-wrap items-center gap-2">
            {windows.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setWindowRange(option.value)}
                className={`rounded-xl border px-3 py-2 text-xs font-medium uppercase tracking-[0.16em] transition ${windowRange === option.value ? 'border-cyan-400/40 bg-cyan-400/15 text-cyan-100' : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:bg-white/10 hover:text-white'}`}
              >
                {option.label}
              </button>
            ))}

            <button
              type="button"
              onClick={() => fetchFeed(windowRange)}
              className="ml-auto inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
            >
              <FiRefreshCw className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">Risk mix</p>
                  <p className="text-xs text-slate-400">Distribution across generated events</p>
                </div>
                <FiZap className="text-cyan-300" />
              </div>
              <div className="mt-4 h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={riskMix} dataKey="value" nameKey="name" innerRadius={56} outerRadius={88} paddingAngle={3} stroke="rgba(255,255,255,0.12)">
                      {riskMix.map((entry) => (
                        <Cell key={entry.name} fill={levelPalette[String(entry.name).toLowerCase()] || '#64748b'} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'rgba(7, 11, 18, 0.96)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '16px', color: '#e2e8f0' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">Regional exposure</p>
                  <p className="text-xs text-slate-400">Top affected regions from live intelligence</p>
                </div>
                <FiShield className="text-cyan-300" />
              </div>

              <div className="mt-4 space-y-3">
                {regionMix.length > 0 ? regionMix.map((region) => (
                  <div key={region.region} className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{region.region}</p>
                        <p className="text-xs text-slate-400">{region.count} article{region.count === 1 ? '' : 's'}</p>
                      </div>
                      <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{region.high} high</span>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-white/5">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-cyan-400 via-orange-400 to-red-500"
                        style={{ width: `${Math.min(100, Math.round((region.count / Math.max(1, events.length)) * 100))}%` }}
                      />
                    </div>
                  </div>
                )) : (
                  <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-400">
                    Region exposure will populate when live articles are available.
                  </div>
                )}
              </div>
            </div>
          </div>
        </ChartCard>

        <ChartCard title="AI Signal" description="Rule-based wrap-up of the current geopolitical risk picture.">
          <div className="space-y-3">
            <InsightCard title="Current signal" label="Summary" tone="sky">
              {insightText}
            </InsightCard>
            <InsightCard title="Model source" label="Pipeline" tone="emerald">
              {payload?.source === 'newsapi'
                ? 'NewsAPI headlines are being passed through Gemini for structured risk extraction.'
                : payload?.source === 'gdelt'
                  ? 'GDELT is supplying recent articles and Gemini is converting them into structured risk records.'
                  : 'Waiting on live news source data.'}
            </InsightCard>
            <InsightCard title="Fallback posture" label="Reliability" tone="orange">
              {error ? `Backend warning: ${error}` : payload?.status === 'ok' ? 'Live feed healthy.' : 'System is waiting for the news provider.'}
            </InsightCard>
          </div>
        </ChartCard>
      </div>

      <ChartCard title="AI Global Risk Intelligence" description="Live geopolitical articles structured for logistics operations teams.">
        {loading && !payload ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-8 text-sm text-slate-400">
            Fetching and analyzing live geopolitical headlines...
          </div>
        ) : error && events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-8 text-sm text-slate-400">
            {error}
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-8 text-sm text-slate-400">
            No recent global risk articles matched the maritime and shipping filters.
          </div>
        ) : (
          <div className="space-y-4">
            {topEvents.map((event) => (
              <EventCard key={`${event.headline}-${event.timestamp}`} event={event} />
            ))}
          </div>
        )}
      </ChartCard>
    </div>
  )
}

export default GlobalRiskIntelligence
