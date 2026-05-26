import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

import { executeReroute, fetchAlternativeRoutes } from '../services/api'

const MotionDiv = motion.div
const MotionButton = motion.button

function formatSignedNumber(value, { prefix = '', suffix = '' } = {}) {
  const numericValue = Number(value || 0)
  const sign = numericValue > 0 ? '+' : numericValue < 0 ? '-' : ''
  return `${sign}${prefix}${Math.abs(numericValue)}${suffix}`
}

export default function RerouteModal({ shipment, isOpen, onClose, onExecute }) {
  const [availableRoutes, setAvailableRoutes] = useState([])
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(null)
  const [loading, setLoading] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState(null)
  const [executionNotes, setExecutionNotes] = useState('')
  const lastLoadedShipmentIdRef = useRef(null)

  useEffect(() => {
    if (!isOpen || !shipment?.id) {
      lastLoadedShipmentIdRef.current = null
      return
    }

    if (lastLoadedShipmentIdRef.current === shipment.id) return

    lastLoadedShipmentIdRef.current = shipment.id
    setLoading(true)
    setError(null)
    setAvailableRoutes([])
    setSelectedRouteIndex(null)

    let cancelled = false

    const loadRoutes = async () => {
      try {
        const data = await fetchAlternativeRoutes(shipment.id)
        if (!cancelled) {
          setAvailableRoutes(data?.alternative_routes || [])
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load alternative routes')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadRoutes()

    return () => {
      cancelled = true
    }
  }, [isOpen, shipment?.id])

  const handleClose = () => {
    onClose()
    lastLoadedShipmentIdRef.current = null
    setAvailableRoutes([])
    setSelectedRouteIndex(null)
    setLoading(false)
    setExecuting(false)
    setError(null)
    setExecutionNotes('')
  }

  const handleExecuteReroute = async () => {
    if (selectedRouteIndex === null || !shipment) return

    setExecuting(true)
    setError(null)

    try {
      await executeReroute(shipment.id, selectedRouteIndex, executionNotes)

      onExecute?.()
      handleClose()
    } catch (err) {
      setError(err.message || 'Failed to execute reroute')
    } finally {
      setExecuting(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <MotionDiv
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        >
          <MotionDiv
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-lg border border-white/10 bg-slate-950 shadow-xl"
          >
            {/* Header */}
            <div className="border-b border-white/10 px-6 py-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">Reroute Shipment</h2>
                <button
                  onClick={handleClose}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>
              <p className="mt-1 text-sm text-gray-400">
                {shipment ? `${shipment.origin} → ${shipment.destination}` : 'Loading...'}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Choose an alternative route to record as the active reroute decision for this shipment.
              </p>
            </div>

            {/* Content */}
            <div className="max-h-96 overflow-y-auto px-6 py-4">
              {error && (
                <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="text-gray-400">Loading alternative routes...</div>
                </div>
              ) : availableRoutes.length === 0 ? (
                <div className="py-8 text-center text-gray-400">
                  No alternative route options are available for this shipment.
                </div>
              ) : (
                <div className="space-y-3">
                  {availableRoutes.map((route, index) => (
                    <MotionButton
                      key={index}
                      onClick={() => setSelectedRouteIndex(index)}
                      whileHover={{ scale: 1.02 }}
                      className={`w-full rounded-lg border-2 p-4 text-left transition-all ${
                        selectedRouteIndex === index
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-white/10 bg-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-sm text-gray-300">
                            <span className="font-medium">{route.origin}</span>
                            <span>→</span>
                            <span className="font-medium">{route.intermediate_port || 'Direct'}</span>
                            <span>→</span>
                            <span className="font-medium">{route.destination}</span>
                          </div>
                          <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-gray-400">
                            <div>
                              <span className="text-gray-500">Distance</span>
                              <p className="text-white">{route.distance_km} km</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Route delta</span>
                              <p className="font-medium text-emerald-400">
                                {formatSignedNumber(route.distance_saved_percent, '%')} ({formatSignedNumber(route.distance_saved_km, ' km')})
                              </p>
                            </div>
                            <div>
                              <span className="text-gray-500">Cost Impact</span>
                              <p className="font-medium text-emerald-400">
                                {formatSignedNumber(route.estimated_cost_change, { prefix: '$' })}
                              </p>
                            </div>
                            <div>
                              <span className="text-gray-500">Time delta</span>
                              <p className="font-medium text-emerald-400">
                                {formatSignedNumber(route.estimated_days_saved, ' days')}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="ml-4 flex items-center">
                          {selectedRouteIndex === index && (
                            <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-blue-500">
                              <div className="h-3 w-3 rounded-full bg-blue-500" />
                            </div>
                          )}
                        </div>
                      </div>
                    </MotionButton>
                  ))}
                </div>
              )}

              {/* Execution Notes */}
              {selectedRouteIndex !== null && !loading && (
                <div className="mt-4 space-y-2">
                  <label className="text-sm text-gray-400">Execution notes (optional)</label>
                  <textarea
                    value={executionNotes}
                    onChange={(e) => setExecutionNotes(e.target.value)}
                    placeholder="Add context for why this route was selected..."
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-white/20 focus:outline-none"
                    rows={3}
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-white/10 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={handleClose}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteReroute}
                disabled={selectedRouteIndex === null || executing || loading}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {executing ? 'Recording...' : 'Record Route'}
              </button>
            </div>
          </MotionDiv>
        </MotionDiv>
      )}
    </AnimatePresence>
  )
}
