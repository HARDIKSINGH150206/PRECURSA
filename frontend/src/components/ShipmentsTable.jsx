import { useState } from 'react'
import { motion } from 'framer-motion'

import Card from './Card'
import RerouteModal from './RerouteModal'
import { riskColor, riskLevelFromDRI } from '../utils/risk'

function deriveEta(id) {
  const day = (id || '0').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 20
  return `${day + 2} May 2026`
}

export default function ShipmentsTable({ shipments, onExplain, onSelect, explainingId, onViewAll }) {
  const rows = [...shipments].slice(0, 7)
  const [rerouteModalOpen, setRerouteModalOpen] = useState(false)
  const [rerouteShipment, setRerouteShipment] = useState(null)

  const handleOpenRerouteModal = (shipment) => {
    setRerouteShipment(shipment)
    setRerouteModalOpen(true)
  }

  const handleCloseRerouteModal = () => {
    setRerouteModalOpen(false)
    setRerouteShipment(null)
  }

  return (
    <>
      <Card
        as={motion.div}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h3 className="text-lg font-medium text-white">High Risk Shipments</h3>
          <button
            type="button"
            onClick={onViewAll}
            className="text-sm text-gray-400 transition hover:text-white"
          >
            View All
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Shipment ID</th>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3">DRI Score</th>
                <th className="px-4 py-3">Risk Level</th>
                <th className="px-4 py-3">Risk Factors</th>
                <th className="px-4 py-3">ETA</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const level = riskLevelFromDRI(row.dri)
                return (
                  <tr key={row.id} className="border-t border-white/5 text-gray-300 hover:bg-white/5">
                    <td className="px-4 py-3">{row.id}</td>
                    <td className="px-4 py-3 text-gray-400">{row.origin} → {row.destination}</td>
                    <td className="px-4 py-3 font-medium text-white">{row.dri}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-1 text-xs ${riskColor(level)}`}>{level}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {(row.factors || []).slice(0, 2).map((f) => f.name).join(', ') || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{deriveEta(row.id)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onSelect(row)
                            onExplain(row)
                          }}
                          disabled={explainingId === row.id}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white transition hover:border-white/20 hover:bg-white/10 disabled:opacity-60"
                        >
                          {explainingId === row.id ? 'Explaining...' : 'Explain'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenRerouteModal(row)}
                          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300 transition hover:border-amber-500/50 hover:bg-amber-500/20"
                        >
                          Reroute
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td className="px-4 py-7 text-center text-gray-500" colSpan={7}>
                    No shipment data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <RerouteModal
        shipment={rerouteShipment}
        isOpen={rerouteModalOpen}
        onClose={handleCloseRerouteModal}
        onExecute={() => {
          // Trigger refresh of shipments
          onViewAll?.()
        }}
      />
    </>
  )
}
