import { createElement, useEffect, useMemo, useState } from 'react'
import { FiActivity, FiAlertTriangle, FiCheckCircle, FiClock, FiCpu, FiInfo, FiRefreshCw, FiSettings, FiShield, FiSliders, FiWifi } from 'react-icons/fi'
import { motion } from 'framer-motion'

import Card from '../components/Card'
import { fetchOperatorSettings, fetchSystemHealth, saveOperatorSettings } from '../services/api'

const MotionDiv = motion.div

const refreshOptions = ['15s', '30s', '60s', '5m']
const vesselFrequencyOptions = ['10s', '20s', '60s', '5m']
const notificationOptions = ['In-app', 'Email', 'SMS', 'Slack']

const widgetLabels = [
  { key: 'map', label: 'Map view' },
  { key: 'alerts', label: 'Risk alerts' },
  { key: 'weather', label: 'Weather panel' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'table', label: 'Shipment table' }
]

const alertTypes = [
  { key: 'weather', label: 'Weather alerts' },
  { key: 'ais', label: 'AIS alerts' },
  { key: 'delay', label: 'Delay alerts' },
  { key: 'tariff', label: 'Tariff alerts' }
]

const vesselFilters = [
  { key: 'activeOnly', label: 'Active only' },
  { key: 'highSpeed', label: 'High speed' },
  { key: 'congestedRoute', label: 'Congested route' },
  { key: 'weatherExposure', label: 'Weather exposed' }
]

function Toggle({ label, description, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-cyan-400/30 hover:bg-white/10"
    >
      <span>
        <span className="block text-sm font-medium text-slate-100">{label}</span>
        {description ? <span className="block text-xs text-slate-400">{description}</span> : null}
      </span>
      <span
        className={`relative h-6 w-11 rounded-full border transition ${checked ? 'border-cyan-400/60 bg-cyan-400/25' : 'border-white/15 bg-slate-800/80'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition ${checked ? 'left-5' : 'left-0.5'}`}
        />
      </span>
    </button>
  )
}

function RangeControl({ label, value, onChange, min = 0, max = 100, step = 1, suffix = '%' }) {
  return (
    <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-100">{label}</p>
          <p className="text-xs text-slate-400">Current setting</p>
        </div>
        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200">
          {value}{suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="settings-range w-full"
      />
    </div>
  )
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4">
      <span className="block text-sm font-medium text-slate-100">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40"
      >
        {options.map((option) => (
          <option key={option} value={option} className="bg-slate-950 text-slate-100">
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

function StatusPill({ label, tone = 'neutral' }) {
  const toneClasses = {
    neutral: 'border-white/10 bg-white/5 text-slate-300',
    ok: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    warn: 'border-amber-400/20 bg-amber-400/10 text-amber-100',
    danger: 'border-rose-400/20 bg-rose-400/10 text-rose-100',
    info: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-100'
  }

  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${toneClasses[tone] || toneClasses.neutral}`}>{label}</span>
}

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-start gap-3 border-b border-white/10 pb-4">
      <div className="mt-0.5 rounded-2xl border border-cyan-400/15 bg-cyan-400/10 p-2 text-cyan-200">
        {createElement(Icon, { className: 'h-4 w-4' })}
      </div>
      <div>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="text-sm text-slate-400">{subtitle}</p>
      </div>
    </div>
  )
}

function Settings({ theme }) {
  const [health, setHealth] = useState(null)
  const [healthLoading, setHealthLoading] = useState(true)
  const [healthLatency, setHealthLatency] = useState(null)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [saveState, setSaveState] = useState('idle')
  const [settingsUpdatedAt, setSettingsUpdatedAt] = useState(null)
  const [surfaceTheme, setSurfaceTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark'
    return window.localStorage.getItem('precursa-surface-theme') || 'ultra-dark'
  })

  const [riskWeights, setRiskWeights] = useState({
    weather: 42,
    congestion: 28,
    carrier: 18,
    tariff: 12
  })
  const [autoWeighting, setAutoWeighting] = useState(true)

  const [weatherSettings, setWeatherSettings] = useState({
    wind: 45,
    rain: 55,
    visibility: 35,
    realtime: true,
    refreshInterval: '30s'
  })

  const [vesselSettings, setVesselSettings] = useState({
    enabled: true,
    refreshInterval: '20s',
    filters: {
      activeOnly: true,
      highSpeed: false,
      congestedRoute: true,
      weatherExposure: true
    }
  })

  const [alerts, setAlerts] = useState({
    weather: true,
    ais: true,
    delay: true,
    tariff: false,
    threshold: 68,
    channel: 'In-app'
  })

  const [widgetVisibility, setWidgetVisibility] = useState({
    map: true,
    alerts: true,
    weather: true,
    analytics: true,
    table: true
  })

  const [aiCopilot, setAiCopilot] = useState({
    enabled: true,
    mode: 'AI'
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    localStorage.setItem('precursa-surface-theme', surfaceTheme)
    document.documentElement.dataset.surface = surfaceTheme
  }, [surfaceTheme])

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const snapshot = await fetchOperatorSettings()
        const data = snapshot || {}

        if (data.risk_weights) setRiskWeights(data.risk_weights)
        if (typeof data.auto_weighting === 'boolean') setAutoWeighting(data.auto_weighting)
        if (data.weather_settings) setWeatherSettings(data.weather_settings)
        if (data.vessel_settings) setVesselSettings(data.vessel_settings)
        if (data.alerts) setAlerts(data.alerts)
        if (data.dashboard_preferences) {
          if (data.dashboard_preferences.widget_visibility) {
            setWidgetVisibility(data.dashboard_preferences.widget_visibility)
          }
          if (data.dashboard_preferences.surface_theme) {
            setSurfaceTheme('ultra-dark')
          } else {
            setSurfaceTheme('ultra-dark')
          }
        }
        if (data.ai_copilot) setAiCopilot(data.ai_copilot)
        if (data.updated_at) setSettingsUpdatedAt(data.updated_at)
      } finally {
        setSettingsLoaded(true)
      }
    }

    loadSettings()
  }, [])

  useEffect(() => {
    const loadHealth = async () => {
      const startedAt = performance.now()
      try {
        const snapshot = await fetchSystemHealth()
        setHealth(snapshot)
      } finally {
        setHealthLatency(Math.round(performance.now() - startedAt))
        setHealthLoading(false)
      }
    }

    loadHealth()
    const timer = window.setInterval(loadHealth, 20000)
    return () => window.clearInterval(timer)
  }, [])

  const visibleWidgets = useMemo(() => Object.values(widgetVisibility).filter(Boolean).length, [widgetVisibility])
  const enabledAlerts = useMemo(() => alertTypes.filter(({ key }) => alerts[key]).length, [alerts])
  const formattedSettingsUpdatedAt = useMemo(() => {
    if (!settingsUpdatedAt) return 'Not saved yet'

    try {
      return new Date(settingsUpdatedAt).toLocaleString([], {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    } catch {
      return settingsUpdatedAt
    }
  }, [settingsUpdatedAt])

  useEffect(() => {
    if (!settingsLoaded) return

    const timer = window.setTimeout(async () => {
      setSaveState('saving')
      try {
        const response = await saveOperatorSettings({
          risk_weights: riskWeights,
          auto_weighting: autoWeighting,
          weather_settings: weatherSettings,
          vessel_settings: vesselSettings,
          alerts,
          dashboard_preferences: {
            widget_visibility: widgetVisibility,
            surface_theme: surfaceTheme,
          },
          ai_copilot: aiCopilot,
        })
        setSettingsUpdatedAt(response?.updated_at || new Date().toISOString())
        setSaveState('saved')
      } catch {
        setSaveState('error')
      }
    }, 800)

    return () => window.clearTimeout(timer)
  }, [
    settingsLoaded,
    riskWeights,
    autoWeighting,
    weatherSettings,
    vesselSettings,
    alerts,
    widgetVisibility,
    surfaceTheme,
    aiCopilot,
  ])

  const healthCards = [
    {
      key: 'weather',
      label: 'Weather service',
      tone: health?.services?.weather?.status === 'online' ? 'ok' : 'warn',
      detail: health?.services?.weather?.source || 'unknown source',
      sync: health?.services?.weather?.last_sync
    },
    {
      key: 'ais',
      label: 'AIS Stream',
      tone: health?.services?.ais?.status === 'streaming' ? 'ok' : 'warn',
      detail: `${health?.services?.ais?.vessels ?? 0} active vessels`,
      sync: health?.services?.ais?.last_sync
    },
    {
      key: 'gemini',
      label: 'Gemini',
      tone: health?.services?.gemini?.status === 'ready' ? 'ok' : 'danger',
      detail: health?.services?.gemini?.model || 'unavailable',
      sync: health?.services?.gemini?.last_sync
    },
    {
      key: 'ownership',
      label: 'System Owner',
      tone: health?.services?.ownership?.owner_configured ? 'ok' : 'warn',
      detail: health?.services?.ownership?.owner_email || health?.services?.ownership?.owner_clerk_user_id || 'not configured',
      sync: health?.generated_at
    },
    {
      key: 'observability',
      label: 'Observability',
      tone: health?.observability?.background_refresh?.status === 'healthy' ? 'ok' : 'warn',
      detail: health?.observability?.background_refresh?.status || 'unknown',
      sync: health?.observability?.background_refresh?.last_success_at || health?.observability?.started_at
    }
  ]

  return (
    <div className="space-y-6">
      <MotionDiv
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card overflow-hidden border border-cyan-400/10 bg-gradient-to-br from-cyan-400/10 via-white/5 to-transparent p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill label="Enterprise Control Panel" tone="info" />
              <StatusPill label={theme === 'light' ? 'Light mode active' : 'Dark mode active'} tone="neutral" />
              <StatusPill label={`Surface: ${surfaceTheme}`} tone="neutral" />
              <StatusPill label={saveState === 'saving' ? 'Saving' : saveState === 'error' ? 'Save failed' : saveState === 'saved' ? 'Saved' : 'Ready'} tone={saveState === 'error' ? 'danger' : saveState === 'saving' ? 'warn' : 'ok'} />
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white">Settings</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Configure the disruption risk engine, intelligence feeds, alerting, and dashboard behavior from a single operational console.
              </p>
            </div>
          </div>

          <div className="grid min-w-[280px] grid-cols-2 gap-3 rounded-3xl border border-white/10 bg-slate-950/50 p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Command status</p>
              <p className="mt-2 text-sm font-medium text-white">Live control surface</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">System sync</p>
              <p className="mt-2 text-sm font-medium text-cyan-100">{health?.generated_at || 'Fetching...'}</p>
            </div>
            <div className="col-span-2 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Latency</p>
                <p className="text-sm font-semibold text-white">{healthLatency != null ? `${healthLatency} ms` : '—'}</p>
              </div>
              <FiClock className="h-5 w-5 text-cyan-300" />
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-xs text-slate-400">
              <div className="flex items-center justify-between gap-3">
                <span>Backend uptime</span>
                <span className="font-medium text-white">
                  {health?.observability?.uptime_seconds != null
                    ? `${Math.round(health.observability.uptime_seconds)}s`
                    : '—'}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span>Last refresh</span>
                <span className="font-medium text-white">
                  {health?.observability?.background_refresh?.last_success_at || '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
          </MotionDiv>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]">
        <div className="space-y-6">
          <Card className="p-5">
            <SectionHeader icon={FiSliders} title="Disruption Risk Engine" subtitle="Tune how the disruption risk model balances live operational signals." />

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <RangeControl label="Weather weight" value={riskWeights.weather} onChange={(value) => setRiskWeights((current) => ({ ...current, weather: value }))} />
              <RangeControl label="Congestion weight" value={riskWeights.congestion} onChange={(value) => setRiskWeights((current) => ({ ...current, congestion: value }))} />
              <RangeControl label="Carrier weight" value={riskWeights.carrier} onChange={(value) => setRiskWeights((current) => ({ ...current, carrier: value }))} />
              <RangeControl label="Tariff weight" value={riskWeights.tariff} onChange={(value) => setRiskWeights((current) => ({ ...current, tariff: value }))} />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
              <Toggle label="AI auto-weighting" description="Let the model rebalance weights using recent shipment and weather patterns." checked={autoWeighting} onChange={setAutoWeighting} />
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-100">Configuration revision</p>
                    <p className="text-xs text-slate-400">Last persisted settings snapshot</p>
                  </div>
                  <StatusPill label={formattedSettingsUpdatedAt} tone={settingsUpdatedAt ? 'info' : 'neutral'} />
                </div>
                <div className="mt-4 space-y-2 text-sm text-slate-300">
                  <div className="flex items-center justify-between">
                    <span>Auto-weight status</span>
                    <span className={autoWeighting ? 'font-medium text-emerald-300' : 'font-medium text-amber-200'}>
                      {autoWeighting ? 'Enabled' : 'Manual control'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <SectionHeader icon={FiWifi} title="Weather Intelligence Settings" subtitle="Manage live weather ingestion and the thresholds that trigger route impact." />

              <div className="mt-5 space-y-4">
                <RangeControl label="Wind threshold" value={weatherSettings.wind} suffix="km/h" onChange={(value) => setWeatherSettings((current) => ({ ...current, wind: value }))} />
                <RangeControl label="Rain threshold" value={weatherSettings.rain} suffix="mm" onChange={(value) => setWeatherSettings((current) => ({ ...current, rain: value }))} />
                <RangeControl label="Visibility threshold" value={weatherSettings.visibility} suffix="km" onChange={(value) => setWeatherSettings((current) => ({ ...current, visibility: value }))} />
                <Toggle label="Real-time updates" description="Continuously refresh weather intelligence feeds." checked={weatherSettings.realtime} onChange={(value) => setWeatherSettings((current) => ({ ...current, realtime: value }))} />
                <SelectField label="Refresh interval" value={weatherSettings.refreshInterval} onChange={(value) => setWeatherSettings((current) => ({ ...current, refreshInterval: value }))} options={refreshOptions} />
              </div>
            </Card>

            <Card className="p-5">
              <SectionHeader icon={FiActivity} title="Vessel Tracking Settings" subtitle="Control AIS stream behavior and the slice of vessel traffic shown to operators." />

              <div className="mt-5 space-y-4">
                <Toggle label="AIS stream" description="Enable live vessel tracking on the operational map." checked={vesselSettings.enabled} onChange={(value) => setVesselSettings((current) => ({ ...current, enabled: value }))} />
                <SelectField label="Refresh frequency" value={vesselSettings.refreshInterval} onChange={(value) => setVesselSettings((current) => ({ ...current, refreshInterval: value }))} options={vesselFrequencyOptions} />
                <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-medium text-slate-100">Vessel filters</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {vesselFilters.map((filter) => (
                      <Toggle
                        key={filter.key}
                        label={filter.label}
                        checked={vesselSettings.filters[filter.key]}
                        onChange={(value) => setVesselSettings((current) => ({
                          ...current,
                          filters: { ...current.filters, [filter.key]: value }
                        }))}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <SectionHeader icon={FiAlertTriangle} title="Alert System" subtitle="Configure the alert channels and the conditions that trigger escalations." />

              <div className="mt-5 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {alertTypes.map((type) => (
                    <Toggle
                      key={type.key}
                      label={type.label}
                      checked={alerts[type.key]}
                      onChange={(value) => setAlerts((current) => ({ ...current, [type.key]: value }))}
                    />
                  ))}
                </div>
                <RangeControl label="Risk threshold" value={alerts.threshold} onChange={(value) => setAlerts((current) => ({ ...current, threshold: value }))} />
                <SelectField label="Notification type" value={alerts.channel} onChange={(value) => setAlerts((current) => ({ ...current, channel: value }))} options={notificationOptions} />
              </div>
            </Card>

            <Card className="p-5">
              <SectionHeader icon={FiSettings} title="Dashboard Preferences" subtitle="Shape the command center layout and presentation style for your operations team." />

              <div className="mt-5 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {widgetLabels.map((widget) => (
                    <Toggle
                      key={widget.key}
                      label={widget.label}
                      checked={widgetVisibility[widget.key]}
                      onChange={(value) => setWidgetVisibility((current) => ({ ...current, [widget.key]: value }))}
                    />
                  ))}
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-medium text-slate-100">Theme selector</p>
                  <p className="mt-1 text-xs text-slate-400">Command center surface tone for dark-mode operations.</p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {['dark', 'ultra-dark'].map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setSurfaceTheme(option)}
                        className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${surfaceTheme === option ? 'border-cyan-400/40 bg-cyan-400/15 text-cyan-100' : 'border-white/10 bg-slate-950/50 text-slate-300 hover:bg-white/5'}`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-300">
                  <span>Visible widgets</span>
                  <span className="font-semibold text-white">{visibleWidgets} / {widgetLabels.length}</span>
                </div>
              </div>
            </Card>
          </div>

          <Card className="p-5">
            <SectionHeader icon={FiCpu} title="AI Copilot" subtitle="Control the assistant that surfaces explanations, summaries, and operator guidance." />

            <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <Toggle label="Enable AI Copilot" description="Allow the platform to generate narrative guidance and workflow support." checked={aiCopilot.enabled} onChange={(value) => setAiCopilot((current) => ({ ...current, enabled: value }))} />
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-medium text-slate-100">Mode selector</p>
                <p className="mt-1 text-xs text-slate-400">Fallback uses deterministic templates when AI is unavailable.</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {['fallback', 'AI'].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setAiCopilot((current) => ({ ...current, mode: option }))}
                      className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${aiCopilot.mode === option ? 'border-cyan-400/40 bg-cyan-400/15 text-cyan-100' : 'border-white/10 bg-slate-950/50 text-slate-300 hover:bg-white/5'}`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <SectionHeader icon={FiShield} title="System Health" subtitle="Monitor the live state of the platform services that power the control panel." />

            <div className="mt-5 space-y-4">
              {healthLoading && !health ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-6 text-sm text-slate-400">
                  Checking live service status...
                </div>
              ) : null}

              <div className="space-y-3">
                {healthCards.map((service) => (
                  <div key={service.key} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{service.label}</p>
                        <p className="text-xs text-slate-400">{service.detail}</p>
                      </div>
                      <StatusPill label={service.tone === 'ok' ? 'Online' : service.tone === 'danger' ? 'Disabled' : 'Degraded'} tone={service.tone} />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                      <span>Last sync</span>
                      <span className="font-medium text-slate-200">{service.sync || '—'}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">API status</p>
                  <p className="mt-2 text-sm font-medium text-white">{health?.services?.weather?.status === 'online' ? 'All core services healthy' : 'Investigate degraded services'}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Last sync</p>
                  <p className="mt-2 text-sm font-medium text-white">{health?.generated_at || '—'}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <p className="text-sm font-medium text-white">Control Summary</p>
                <p className="text-xs text-slate-400">Snapshot of the current configuration stance</p>
              </div>
              <FiInfo className="h-5 w-5 text-cyan-300" />
            </div>

            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span>Risk engine mode</span>
                <span className="font-medium text-white">{autoWeighting ? 'Auto-weighted' : 'Manual'}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span>Weather cadence</span>
                <span className="font-medium text-white">{weatherSettings.refreshInterval}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span>Vessel tracking</span>
                <span className="font-medium text-white">{vesselSettings.enabled ? 'Enabled' : 'Paused'}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span>Alert threshold</span>
                <span className="font-medium text-white">{alerts.threshold}%</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span>AI Copilot</span>
                <span className="font-medium text-white">{aiCopilot.enabled ? aiCopilot.mode : 'Disabled'}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
          <div className="flex items-center gap-2 text-white">
            <FiRefreshCw className="h-4 w-4 text-cyan-300" />
            Dashboard refresh
          </div>
          <p className="mt-2 text-xs text-slate-400">{weatherSettings.refreshInterval} weather cadence, {vesselSettings.refreshInterval} vessel cadence</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
          <div className="flex items-center gap-2 text-white">
            <FiWifi className="h-4 w-4 text-cyan-300" />
            Alert coverage
          </div>
          <p className="mt-2 text-xs text-slate-400">{enabledAlerts} alert channels active with a {alerts.threshold}% trigger threshold</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
          <div className="flex items-center gap-2 text-white">
            <FiCheckCircle className="h-4 w-4 text-cyan-300" />
            Widget layout
          </div>
          <p className="mt-2 text-xs text-slate-400">{visibleWidgets} widgets visible in the dashboard shell</p>
        </div>
      </div>
    </div>
  )
}

export default Settings
