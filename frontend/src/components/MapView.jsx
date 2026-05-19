import { motion } from 'framer-motion'
import { Circle, CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip } from 'react-leaflet'
import { FiLayers } from 'react-icons/fi'

import Card from './Card'
import { driColor } from '../utils/risk'

function weatherColor(risk) {
  if (risk >= 80) return '#ef4444'
  if (risk >= 65) return '#f97316'
  if (risk >= 45) return '#facc15'
  return '#60a5fa'
}

function vesselColor(speed) {
  const sog = Number(speed || 0)
  if (sog >= 12) return '#93c5fd'
  if (sog >= 6) return '#60a5fa'
  return '#cbd5e1'
}

function vesselTrail(vessel) {
  return Array.isArray(vessel?.trail) ? vessel.trail.filter((point) => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon))) : []
}

export default function MapView({ shipments, vessels, weatherOverlay, weatherZones = [], center, onToggleWeather, loading, error }) {
  const hasCenter = Array.isArray(center) && center.length === 2 && center.every((value) => Number.isFinite(Number(value)))

  if (!hasCenter) {
    return (
      <Card className="relative flex h-full min-h-[620px] flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2 text-gray-300">
            <FiLayers size={15} />
            <span className="text-sm">Maritime Intelligence Map</span>
          </div>

          <button
            type="button"
            onClick={onToggleWeather}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300"
          >
            <span>Weather Overlay</span>
            <span className={`h-2.5 w-2.5 rounded-full ${weatherOverlay ? 'bg-blue-400' : 'bg-slate-600'}`} />
          </button>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 text-sm text-slate-400">
          {loading ? 'Loading map data from backend...' : 'Map center not available yet.'}
        </div>
      </Card>
    )
  }

  return (
    <Card
      as={motion.div}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative flex h-full flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2 text-gray-300">
          <FiLayers size={15} />
          <span className="text-sm">Maritime Intelligence Map</span>
        </div>

        <button
          type="button"
          onClick={onToggleWeather}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300"
        >
          <span>Weather Overlay</span>
          <span className={`h-2.5 w-2.5 rounded-full ${weatherOverlay ? 'bg-blue-400' : 'bg-slate-600'}`} />
        </button>
      </div>

      <div className="relative min-h-[620px] flex-1">
        <MapContainer center={center} zoom={5} className="h-full w-full" worldCopyJump>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

          {weatherOverlay &&
            shipments.map((shipment) => (
              <Circle
                key={`w-${shipment.id}`}
                center={[shipment.lat, shipment.lon]}
                radius={30000}
                interactive={false}
                pathOptions={{
                  color: weatherColor(shipment.weather_risk),
                  fillColor: weatherColor(shipment.weather_risk),
                  fillOpacity: 0.08,
                  weight: 0.7,
                  className: shipment.weather_risk >= 70 ? 'weather-zone weather-zone-pulse' : 'weather-zone'
                }}
              />
            ))}

          {weatherOverlay && Array.isArray(weatherZones) && weatherZones.length > 0 && weatherZones.map((zone) => (
            <Circle
              key={`z-${zone.lat}-${zone.lon}`}
              center={[zone.lat, zone.lon]}
              radius={18000 + Number(zone.severity || 0) * 220}
              interactive={false}
              pathOptions={{
                color: weatherColor(zone.severity),
                fillColor: weatherColor(zone.severity),
                fillOpacity: Math.min(0.35, 0.06 + Number(zone.severity || 0) / 400),
                weight: 1,
                className: Number(zone.severity || 0) >= 70 ? 'weather-zone weather-zone-pulse' : 'weather-zone'
              }}
            />
          ))}

          {vessels.map((vessel, index) => {
            const trail = vesselTrail(vessel)
            const currentPoint = trail[trail.length - 1] || vessel

            return (
              <>
                {trail.length > 1 && (
                  <Polyline
                    key={`t-${vessel.mmsi || 'v'}-${index}`}
                    positions={trail.map((point) => [point.lat, point.lon])}
                    pathOptions={{
                      color: vesselColor(vessel.sog),
                      weight: 2.2,
                      opacity: 0.85,
                      dashArray: '8 14',
                      className: 'map-route-line'
                    }}
                  />
                )}

                <CircleMarker
                  key={`v-${vessel.mmsi || 'v'}-${index}`}
                  center={[currentPoint.lat, currentPoint.lon]}
                  radius={6}
                  pathOptions={{
                    color: vesselColor(vessel.sog),
                    fillColor: vesselColor(vessel.sog),
                    fillOpacity: 0.95,
                    weight: 1.2
                  }}
                >
                  <Tooltip direction="top" offset={[0, -2]}>
                    Vessel {vessel.mmsi || 'unknown'}
                  </Tooltip>
                  <Popup>
                    Vessel {vessel.mmsi || 'unknown'}
                    <br />
                    SOG: {vessel.sog ?? 0}
                    <br />
                    Live trail points: {trail.length}
                  </Popup>
                </CircleMarker>
              </>
            )
          })}

          {shipments.map((shipment) => (
            <CircleMarker
              key={`s-${shipment.id}`}
              center={[shipment.lat, shipment.lon]}
              radius={9}
              pathOptions={{ color: driColor(shipment.dri), fillColor: driColor(shipment.dri), fillOpacity: 0.92 }}
            >
              <Tooltip direction="top" offset={[0, -4]}>
                {shipment.id}
              </Tooltip>
              <Popup>
                <strong>{shipment.id}</strong>
                <br />
                {shipment.origin} to {shipment.destination}
                <br />
                DRI: {shipment.dri}
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>

        {(loading || error) && (
          <div className="absolute bottom-3 left-3 rounded-xl border border-white/10 bg-black/55 px-3 py-2 text-xs text-gray-300 backdrop-blur">
            {loading ? 'Loading map intelligence...' : `Connection issue: ${error}`}
          </div>
        )}
      </div>
    </Card>
  )
}