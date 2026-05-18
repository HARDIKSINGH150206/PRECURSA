import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ScatterChart, Scatter, ZAxis, Cell } from 'recharts'
import { FiActivity, FiArrowRight, FiBarChart2, FiCloudRain, FiNavigation, FiZap } from 'react-icons/fi'

import ChartCard from '../components/analytics/ChartCard'
import InsightCard from '../components/analytics/InsightCard'
import Card from '../components/Card'

function clamp(value, low = 0, high = 100) {
  return Math.max(low, Math.min(high, value))
}

function zoneTrend(severity) {
  if (severity >= 75) return 'up'
  if (severity <= 45) return 'down'
  return 'flat'
}

function dominantFactorLabel(zone) {
  const severity = Number(zone.severity || 0)
  if (severity >= 80) return 'Wind + rain'
  if (severity >= 65) return 'Rain'
  if (severity >= 50) return 'Visibility'
  return 'Pressure'
}

function severityTone(severity) {
  if (severity >= 80) return 'text-red-200'
  if (severity >= 65) return 'text-orange-200'
  if (severity >= 45) return 'text-amber-200'
  return 'text-sky-200'
}

export default function WeatherIntelligence({
  weatherTimeline = [],
  weatherZones = [],
  currentWeather = null,
  stormTrack = null,
  routeImpact = null,
  alerts = [],
  dominantFactor = 'Wind',
  loading = false,
  lastUpdated = '--'
}) {
  const currentSeverity = Number(currentWeather?.weather_severity ?? currentWeather?.risk ?? 0)
  const forecastWindow = weatherTimeline.filter((point) => point.type === 'forecast')
  const historyWindow = weatherTimeline.filter((point) => point.type === 'history')

  const AIInsight = currentWeather
    ? `Wind speeds in ${currentWeather.zone_name || 'the active maritime zone'} may reduce vessel speed by ${clamp(Math.round(Number(currentWeather.wind_speed || 0) * 0.6), 5, 20)}% while visibility remains at ${Number(currentWeather.visibility || 0).toFixed(1)} km.`
    : 'Waiting for the backend weather feed to populate live maritime conditions.'

  return (
    <div className="mt-4 space-y-5">
      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.95fr]">
        <ChartCard
          title="Weather Timeline"
          description="Last 6h and next 6h forecast for wind, rain, visibility and severity."
        >
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weatherTimeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'rgba(7, 11, 18, 0.96)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '16px', color: '#e2e8f0' }} />
                <Line type="monotone" dataKey="wind" stroke="#60a5fa" strokeWidth={2} dot={false} name="Wind" />
                <Line type="monotone" dataKey="rain" stroke="#f97316" strokeWidth={2} dot={false} name="Rain" />
                <Line type="monotone" dataKey="visibility" stroke="#94a3b8" strokeWidth={2} dot={false} name="Visibility" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Predictive Panel"
          description="Short-horizon weather risk forecast, congestion pressure and alert windows."
        >
          <div className="grid h-full gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <Card className="p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Next 6h risk forecast</p>
              <p className="mt-3 text-4xl font-semibold text-white">{Math.round(currentSeverity || 0)}</p>
              <p className="mt-2 text-sm text-slate-400">Live weather severity level</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Congestion prediction</p>
              <p className="mt-3 text-3xl font-semibold text-white">{routeImpact ? `${routeImpact.delayProbability}%` : 'N/A'}</p>
              <p className="mt-2 text-sm text-slate-400">Derived from live route exposure</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Dominant live factor</p>
              <p className="mt-3 text-3xl font-semibold text-white">{dominantFactor}</p>
              <p className="mt-2 text-sm text-slate-400">Resolved from backend weather data</p>
            </Card>
            <Card className="p-4 xl:col-span-1">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">High-risk time windows</p>
              <div className="mt-3 space-y-2 text-sm text-slate-300">
                {forecastWindow.slice(0, 3).map((entry) => (
                  <div key={entry.label} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <span>{entry.label}</span>
                    <span className={severityTone(entry.severity)}>{entry.severity}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <ChartCard
          title="Maritime Zones"
          description="Live severity bands with trend, dominant factor and map context."
        >
          <div className="space-y-3">
            {weatherZones.map((zone) => (
              <div key={`${zone.name}-${zone.lat}-${zone.lon}`} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4">
                <div>
                  <p className="text-sm font-medium text-white">{zone.name}</p>
                  <p className="mt-1 text-xs text-slate-400">Dominant factor: {dominantFactorLabel(zone)}</p>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-semibold ${severityTone(zone.severity)}`}>{zone.severity}</p>
                  <p className="text-xs text-slate-400 capitalize">{zoneTrend(zone.severity)}</p>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard
          title="Dynamic Storm Tracking"
          description="Animated core storm cell with direction, speed and projected path."
        >
          <div className="relative h-[320px] overflow-hidden rounded-2xl border border-white/10 bg-[#0a0f14]">
            {stormTrack ? (
              <>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.18),transparent_55%)]" />
                <div
                  className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border border-red-400/30 bg-red-500/20 weather-zone-pulse"
                  style={{ transform: 'translate(-50%, -50%)' }}
                />
                {stormTrack.path.map((point, index) => (
                  <div
                    key={`${point.lat}-${point.lon}`}
                    className="absolute h-2.5 w-2.5 rounded-full bg-red-300/80"
                    style={{
                      left: `${48 + index * 12}%`,
                      top: `${48 + (index % 2 === 0 ? index * 3 : index * 2)}%`,
                      boxShadow: '0 0 20px rgba(248,113,113,0.55)'
                    }}
                  />
                ))}
                <div className="absolute left-4 top-4 rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-xs text-slate-200">
                  <p className="text-slate-400">Direction</p>
                  <p className="mt-1 text-white">{stormTrack.direction}</p>
                </div>
                <div className="absolute right-4 top-4 rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-xs text-slate-200">
                  <p className="text-slate-400">Speed</p>
                  <p className="mt-1 text-white">{stormTrack.speed} km/h</p>
                </div>
                <div className="absolute bottom-4 left-4 rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-xs text-slate-200">
                  <p className="text-slate-400">Predicted path</p>
                  <p className="mt-1 text-white">Projected over next 6h</p>
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">Storm track will appear when a severe cell is detected.</div>
            )}
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <ChartCard
          title="Route Impact Analysis"
          description="Weather exposure across the active shipment route."
        >
          {routeImpact ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Route affected</p>
                <p className="mt-3 text-3xl font-semibold text-white">{routeImpact.affectedPercent}%</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Delay estimate</p>
                <p className="mt-3 text-3xl font-semibold text-white">{routeImpact.delayProbability}%</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Impacted zones</p>
                <p className="mt-3 text-3xl font-semibold text-white">{weatherZones.filter((zone) => Number(zone.severity || 0) >= 55).length}</p>
              </Card>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-8 text-sm text-slate-400">Select a shipment to compute route impact.</div>
          )}
        </ChartCard>

        <ChartCard
          title="AI Insights"
          description="Readable intelligence generated from the live weather system."
        >
          <div className="grid gap-3">
            <InsightCard title="Wind shift" label="Insight" tone="sky">
              {AIInsight}
            </InsightCard>
            <InsightCard title="Severity reading" label="Context" tone="orange">
              {weatherZones[0] ? `${weatherZones[0].name} is currently carrying the highest live severity at ${weatherZones[0].severity}.` : 'No live severity trend is available yet.'}
            </InsightCard>
            <InsightCard title="Alert posture" label="Watchlist" tone="emerald">
              {alerts.length > 0 ? `${alerts.length} live weather alerts are active in the current maritime area.` : 'No active weather alerts are present.'}
            </InsightCard>
          </div>
        </ChartCard>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <p className="text-sm font-medium text-white">Live Weather Event Stream</p>
            <p className="text-xs text-slate-400">Updated {lastUpdated}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <FiActivity size={14} />
            <span>{loading ? 'Refreshing weather feed' : 'Feed stable'}</span>
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {historyWindow.slice(-4).map((point) => (
            <div key={`${point.timestamp}-${point.severity}`} className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
              <p className="text-slate-500">{point.label}</p>
              <p className="mt-1 text-sm text-white">Severity {point.severity}</p>
              <p className="mt-1 text-slate-400">Wind {point.wind} km/h</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
