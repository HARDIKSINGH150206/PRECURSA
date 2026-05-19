import { useCallback, useEffect, useMemo, useState } from 'react'
import { SignedIn, SignedOut, useAuth, useUser } from '@clerk/clerk-react'
import { FiAlertTriangle, FiBox, FiNavigation, FiTrendingUp } from 'react-icons/fi'
import { Navigate, Route, Routes } from 'react-router-dom'

import Card from './components/Card'
import Layout from './components/Layout'
import MapView from './components/MapView'
import MetricCard from './components/MetricCard'
import RiskChart from './components/RiskChart'
import RiskIntelligenceModal from './components/RiskIntelligenceModal'
import ShipmentsTable from './components/ShipmentsTable'
import WeatherPanel from './components/WeatherPanel'
import useLiveWeather from './hooks/useLiveWeather'
import Reports from './pages/Reports'
import GlobalRiskIntelligence from './pages/GlobalRiskIntelligence'
import Settings from './pages/Settings'
import WeatherIntelligence from './pages/WeatherIntelligence'
import Analytics from './pages/Analytics'
import Login from './pages/Login'
import { explainShipmentRisk, fetchDashboardOverview, fetchShipments, fetchVessels, setApiAuthContext } from './services/api'
import Signup from './pages/Signup'
import { riskColor, riskLevelFromDRI } from './utils/risk'
import './App.css'

const REFRESH_MS = 10000
const DEFAULT_PAGE = 'dashboard'

function parsePageFromHash() {
  const hash = String(window.location.hash || '').replace('#', '').trim().toLowerCase()
  return hash || DEFAULT_PAGE
}

function titleFromPage(page) {
  const map = {
    dashboard: 'Maritime Logistics Command Center',
    shipments: 'Shipments Workspace',
    vessels: 'Vessel Tracking',
    routes: 'Route Planning',
    'risk-alerts': 'Risk Alerts',
    weather: 'Weather Intelligence',
    analytics: 'Analytics',
    'global-risk': 'Global Risk Intelligence',
    reports: 'Reports',
    settings: 'Settings'
  }
  return map[page] || 'Maritime Logistics Command Center'
}

function subtitleFromPage(page) {
  const map = {
    dashboard: 'Live Operations',
    shipments: 'Shipment Operations',
    vessels: 'Live Fleet',
    routes: 'Optimization',
    'risk-alerts': 'Monitoring',
    weather: 'Conditions',
    analytics: 'Insights',
    'global-risk': 'Monitoring',
    reports: 'Exports',
    settings: 'Configuration'
  }
  return map[page] || 'Live Operations'
}

function DashboardShell() {
  const { user, isLoaded } = useUser()
  const { getToken, isLoaded: authLoaded } = useAuth()
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark'
    return window.localStorage.getItem('precursa-theme') || 'dark'
  })
  const [shipments, setShipments] = useState([])
  const [vessels, setVessels] = useState([])
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [weatherOverlay, setWeatherOverlay] = useState(true)
  const [explainingId, setExplainingId] = useState('')
  const [selectedShipment, setSelectedShipment] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const [lastUpdated, setLastUpdated] = useState('--')
  const [activePage, setActivePage] = useState(parsePageFromHash)
  const [shipmentQuery, setShipmentQuery] = useState('')

  useEffect(() => {
    if (!isLoaded || !authLoaded) return

    setApiAuthContext(
      user
        ? {
            userId: user.id || null,
            email: user.primaryEmailAddress?.emailAddress || null,
            getToken
          }
        : null
    )
  }, [authLoaded, getToken, isLoaded, user])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('precursa-theme', theme)
  }, [theme])

  const loadData = useCallback(async () => {
    try {
      const [shipmentsData, vesselsData, overviewData] = await Promise.all([
        fetchShipments(),
        fetchVessels(),
        fetchDashboardOverview()
      ])

      setShipments(Array.isArray(shipmentsData) ? shipmentsData : [])
      setVessels(Array.isArray(vesselsData) ? vesselsData : [])
      setOverview(overviewData || null)
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      setError('')
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || 'Unable to connect to backend.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(loadData)
    const timer = setInterval(loadData, REFRESH_MS)
    return () => clearInterval(timer)
  }, [loadData])

  useEffect(() => {
    const onHashChange = () => setActivePage(parsePageFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigateTo = useCallback((page) => {
    const nextPage = page || DEFAULT_PAGE
    if (window.location.hash !== `#${nextPage}`) {
      window.location.hash = nextPage
    }
    setActivePage(nextPage)
  }, [])

  const handleSearch = useCallback((queryText = shipmentQuery) => {
    setShipmentQuery(String(queryText || '').trim())
    navigateTo('shipments')
  }, [navigateTo, shipmentQuery])

  const handleExplain = useCallback(async (shipment) => {
    const shipmentId = shipment?.id || ''
    if (!shipmentId) return

    setExplainingId(shipmentId)
    setSelectedShipment(shipment)
    setAnalysisOpen(true)
    setAnalysisLoading(true)
    setAnalysisError('')
    setAnalysis(null)

    const explainPayload = {
      id: shipment.id,
      origin: shipment.origin,
      destination: shipment.destination,
      route: `${shipment.origin} → ${shipment.destination}`,
      dri: Number(shipment.dri || 0),
      weather: {
        temperature: Number(shipment.weather?.temperature ?? shipment.weather?.temp_c ?? 0),
        wind_speed: Number(shipment.weather?.wind_speed ?? shipment.weather?.wind_kph ?? 0),
        rain: Number(shipment.weather?.rain ?? 0),
        visibility: Number(shipment.weather?.visibility ?? 0),
        severity: Number(shipment.weather?.weather_severity ?? shipment.weather?.risk ?? 0),
      },
      congestion: Number(
        (shipment.factors || []).find((factor) => String(factor.name || '').toLowerCase().includes('congestion'))?.value
        ?? (shipment.factors || []).find((factor) => String(factor.name || '').toLowerCase().includes('port'))?.value
        ?? 0
      ),
      risk_level: riskLevelFromDRI(Number(shipment.dri || 0)),
      lat: shipment.lat,
      lon: shipment.lon,
      route_coords: shipment.route_coords,
      cargo: shipment.cargo,
      factors: shipment.factors,
      rule_dri: shipment.rule_dri,
      ml_dri: shipment.ml_dri,
      xgb_dri: shipment.xgb_dri,
      lstm_dri: shipment.lstm_dri,
      trend: shipment.trend,
      time_aware_prediction: shipment.time_aware_prediction,
      confidence: shipment.confidence,
      prediction_engine: shipment.prediction_engine,
    }

    try {
      const response = await explainShipmentRisk(explainPayload)
      setAnalysis(response)
      setShipments((current) => current.map((item) => (
        item.id === shipmentId
          ? { ...item, explanation: response?.insight || '', explanationAnalysis: response }
          : item
      )))
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Failed to fetch risk analysis.'
      setAnalysisError(msg)
    } finally {
      setExplainingId('')
      setAnalysisLoading(false)
    }
  }, [])

  const handleVoiceSearch = useCallback(async (queryText) => {
    const transcript = String(queryText || '').trim()
    if (!transcript) return

    handleSearch(transcript)

    const explainIntent = /\b(explain|why|analyse|analyze|tell me about)\b/i.test(transcript)
    if (!explainIntent) return

    const terms = transcript.toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length > 2)
    const rankedShipments = [...shipments]
      .map((shipment) => {
        const haystack = [shipment.id, shipment.origin, shipment.destination, shipment.cargo].filter(Boolean).join(' ').toLowerCase()
        const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0)
        return { shipment, score }
      })
      .sort((left, right) => right.score - left.score)

    const bestMatch = rankedShipments[0]
    if (bestMatch?.shipment && bestMatch.score > 0) {
      await handleExplain(bestMatch.shipment)
    }
  }, [handleExplain, handleSearch, shipments])

  const metrics = useMemo(() => {
    const totalShipments = overview?.total_shipments ?? shipments.length
    const highRisk = overview?.high_risk_shipments ?? shipments.filter((s) => s.dri >= 65).length
    const activeVessels = overview?.active_vessels ?? vessels.length
    const avgRisk = overview?.average_risk ?? (shipments.length > 0
      ? Math.round(shipments.reduce((sum, s) => sum + (Number(s.dri) || 0), 0) / shipments.length)
      : 0)

    return { totalShipments, highRisk, activeVessels, avgRisk }
  }, [overview, shipments, vessels])

  const sortedShipments = useMemo(() => [...shipments].sort((a, b) => b.dri - a.dri), [shipments])
  const filteredShipments = useMemo(() => {
    const q = shipmentQuery.trim().toLowerCase()
    if (!q) return sortedShipments
    return sortedShipments.filter((shipment) => (
      [shipment.id, shipment.origin, shipment.destination, shipment.cargo]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    ))
  }, [shipmentQuery, sortedShipments])

  const highRiskOnly = useMemo(
    () => sortedShipments.filter((shipment) => Number(shipment.dri || 0) >= 65),
    [sortedShipments]
  )

  const vesselRows = useMemo(
    () => vessels.map((vessel, index) => ({
      index: index + 1,
      number: vessel.mmsi || vessel.number || vessel.id || 'Unknown',
      speed: vessel.sog ?? 0,
    })),
    [vessels]
  )

  const {
    currentWeather,
    weatherZones,
    alerts,
    routeImpact,
    weatherTimeline,
    stormTrack,
    dominantFactor,
    loading: weatherLoading,
    lastUpdated: weatherLastUpdated,
  } = useLiveWeather(selectedShipment?.route_coords || [])

  const mapCenter = useMemo(() => {
    if (currentWeather && Number.isFinite(Number(currentWeather.lat)) && Number.isFinite(Number(currentWeather.lon))) {
      return [Number(currentWeather.lat), Number(currentWeather.lon)]
    }

    const zone = weatherZones.find((item) => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)))
    if (zone) return [Number(zone.lat), Number(zone.lon)]

    const shipment = shipments.find((item) => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)))
    if (shipment) return [Number(shipment.lat), Number(shipment.lon)]

    const vessel = vessels.find((item) => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)))
    if (vessel) return [Number(vessel.lat), Number(vessel.lon)]

    return null
  }, [currentWeather, shipments, vessels, weatherZones])

  const topRiskAlerts = useMemo(
    () => highRiskOnly.slice(0, 3).map((shipment) => ({
      id: shipment.id,
      dri: Number(shipment.dri || 0),
      level: riskLevelFromDRI(Number(shipment.dri || 0)),
    })),
    [highRiskOnly]
  )

  const operationalInsight = useMemo(() => {
    if (!currentWeather) return 'Loading weather...'

    const location = currentWeather.zone_name || weatherZones[0]?.name || 'Singapore Strait'
    const wind = Number(currentWeather.wind_speed ?? currentWeather.wind_kph ?? 0)
    const rain = Number(currentWeather.rain ?? 0)
    const visibility = Number(currentWeather.visibility ?? 0)
    const congestionZones = weatherZones.filter((zone) => Number(zone.severity || 0) >= 65).length

    const signals = []
    if (wind >= 20) signals.push('high wind')
    if (rain >= 6) signals.push('rain')
    if (visibility <= 5) signals.push('low visibility')
    if (congestionZones > 0) signals.push('congestion')

    if (signals.length === 0) {
      return `Conditions are steady in ${location}. The command center is monitoring the next live refresh.`
    }

    const tail = signals[signals.length - 1]
    const head = signals.length === 1 ? signals[0] : `${signals.slice(0, -1).join(', ')} and ${tail}`
    return `${head} in ${location} may delay shipments in the next 4–6 hours.`
  }, [currentWeather, weatherZones])

  const insightRefreshLabel = useMemo(() => {
    if (!lastUpdated || lastUpdated === '--') return 'Awaiting first live refresh'
    return `Live refresh at ${lastUpdated}`
  }, [lastUpdated])

  return (
    <>
      <Layout
        activePage={activePage}
        hasError={Boolean(error)}
        lastUpdated={lastUpdated}
        theme={theme}
        title={titleFromPage(activePage)}
        subtitle={subtitleFromPage(activePage)}
        searchValue={shipmentQuery}
        onSearch={handleSearch}
        onSearchValueChange={setShipmentQuery}
        onVoiceSubmit={handleVoiceSearch}
        onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        onNavigate={navigateTo}
      >

        {activePage !== 'analytics' && activePage !== 'weather' && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={FiBox} title="Total Shipments" value={metrics.totalShipments} trend="18% vs yesterday" trendTone="up" />
            <MetricCard icon={FiAlertTriangle} title="High Risk Shipments" value={metrics.highRisk} trend="33% vs yesterday" trendTone="up" />
            <MetricCard icon={FiNavigation} title="Active Vessels" value={metrics.activeVessels} trend="Live on map" trendTone="neutral" />
            <MetricCard icon={FiTrendingUp} title="Avg. Disruption Risk" value={metrics.avgRisk} trend="Medium Risk" trendTone="down" />
          </div>
        )}

        {(activePage === 'dashboard' || activePage === 'routes') && (
          <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="xl:col-span-8">
              <MapView
                shipments={shipments}
                vessels={vessels}
                weatherOverlay={weatherOverlay}
                weatherZones={weatherZones}
                center={mapCenter}
                onToggleWeather={() => setWeatherOverlay((prev) => !prev)}
                loading={loading}
                error={error}
              />
            </div>

            <div className="space-y-6 xl:col-span-4">
              <RiskChart averageRisk={metrics.avgRisk} breakdown={overview?.risk_breakdown || []} />
              <WeatherPanel
                currentWeather={currentWeather}
                routeImpact={routeImpact}
                loading={weatherLoading}
                lastUpdated={weatherLastUpdated}
              />

              <Card className="p-4">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <div>
                    <p className="text-sm font-medium text-white">Top Risk Alerts</p>
                    <p className="text-xs text-slate-400">Top 3 shipments by disruption risk</p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300">Live</span>
                </div>

                <div className="mt-4 space-y-2">
                  {topRiskAlerts.map((shipment) => (
                    <div key={shipment.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                      <div>
                        <p className="text-sm text-white">{shipment.id}</p>
                        <p className="text-xs text-slate-400">Risk score {shipment.dri}</p>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] ${riskColor(shipment.level)}`}>
                        {shipment.level}
                      </span>
                    </div>
                  ))}

                  {topRiskAlerts.length === 0 && (
                    <div className="rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-4 text-sm text-slate-400">
                      No high-risk alerts available yet.
                    </div>
                  )}
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <div>
                    <p className="text-sm font-medium text-white">Operational Insight</p>
                    <p className="text-xs text-slate-400">Auto-generated from live weather and AIS conditions · {insightRefreshLabel}</p>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-6 text-slate-200">
                  {operationalInsight}
                </p>
              </Card>
            </div>
          </section>
        )}

        {activePage === 'weather' && (
          <WeatherIntelligence
            weatherTimeline={weatherTimeline}
            weatherZones={weatherZones}
            currentWeather={currentWeather}
            stormTrack={stormTrack}
            routeImpact={routeImpact}
            alerts={alerts}
            dominantFactor={dominantFactor}
            loading={loading || weatherLoading}
            lastUpdated={weatherLastUpdated}
          />
        )}

        {activePage === 'vessels' && (
          <div className="glass-card overflow-hidden">
            <div className="border-b border-white/10 px-5 py-4">
              <h3 className="text-lg font-medium text-white">Live Vessel List</h3>
              <p className="text-xs text-gray-400">Showing all active vessels with their numbers</p>
            </div>

            <div className="max-h-[620px] overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-[#0b0f14] text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Vessel Number</th>
                    <th className="px-4 py-3">Speed</th>
                  </tr>
                </thead>
                <tbody>
                  {vesselRows.map((vessel) => (
                    <tr key={`${vessel.number}-${vessel.index}`} className="border-t border-white/5 text-gray-300 hover:bg-white/5">
                      <td className="px-4 py-3 text-gray-500">{vessel.index}</td>
                      <td className="px-4 py-3 font-medium text-white">{vessel.number}</td>
                      <td className="px-4 py-3 text-gray-400">{vessel.speed} kn</td>
                    </tr>
                  ))}

                  {vesselRows.length === 0 && (
                    <tr>
                      <td className="px-4 py-7 text-center text-gray-500" colSpan={3}>
                        No vessel data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {(activePage === 'dashboard' || activePage === 'shipments' || activePage === 'risk-alerts') && (
          <ShipmentsTable
            shipments={activePage === 'risk-alerts' ? highRiskOnly : filteredShipments}
            onSelect={setSelectedShipment}
            onExplain={handleExplain}
            explainingId={explainingId}
            onViewAll={() => navigateTo('shipments')}
          />
        )}

        {activePage === 'analytics' && (
          <Analytics
            shipments={shipments}
            vessels={vessels}
            overview={overview}
            loading={loading}
            lastUpdated={lastUpdated}
          />
        )}

        {activePage === 'global-risk' && <GlobalRiskIntelligence />}

        {activePage === 'reports' && (
          <Reports
            shipments={shipments}
            vessels={vessels}
            overview={overview}
            currentWeather={currentWeather}
            weatherZones={weatherZones}
            loading={loading || weatherLoading}
            lastUpdated={lastUpdated}
          />
        )}

        {activePage === 'settings' && <Settings theme={theme} />}

        {activePage === 'shipments' && shipmentQuery && (
          <p className="text-xs text-gray-400">Filtering shipments by: "{shipmentQuery}" ({filteredShipments.length} matches)</p>
        )}
      </Layout>

      {error && (
        <div className="fixed bottom-4 right-4 z-40 rounded-xl border border-red-300/30 bg-red-500/10 px-3 py-2 text-xs text-red-200 backdrop-blur">
          Backend Warning: {error}
        </div>
      )}

      <RiskIntelligenceModal
        open={analysisOpen}
        loading={analysisLoading}
        analysis={analysis}
        error={analysisError}
        onClose={() => {
          setAnalysisOpen(false)
          setAnalysisError('')
        }}
      />
    </>
  )
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/sign-in/*"
        element={(
          <>
            <SignedIn>
              <Navigate to="/" replace />
            </SignedIn>
            <SignedOut>
              <Login />
            </SignedOut>
          </>
        )}
      />

      <Route
        path="/sign-up/*"
        element={(
          <>
            <SignedIn>
              <Navigate to="/" replace />
            </SignedIn>
            <SignedOut>
              <Signup />
            </SignedOut>
          </>
        )}
      />

      <Route
        path="*"
        element={(
          <>
            <SignedIn>
              <DashboardShell />
            </SignedIn>
            <SignedOut>
              <Navigate to="/sign-in" replace />
            </SignedOut>
          </>
        )}
      />
    </Routes>
  )
}
