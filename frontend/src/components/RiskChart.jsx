import { motion } from 'framer-motion'
import Card from './Card'

export default function RiskChart({ averageRisk, breakdown = [] }) {
  const value = Math.max(0, Math.min(100, Number(averageRisk || 0)))
  const label = value >= 80 ? 'Critical' : value >= 65 ? 'High' : value >= 45 ? 'Medium' : 'Low'
  const ringStyle = {
    background: `conic-gradient(#f97316 ${value * 3.6}deg, rgba(148, 163, 184, 0.22) 0deg)`
  }

  return (
    <Card
      as={motion.div}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className="p-4"
    >
      <p className="text-sm font-medium text-white">Disruption Risk Index</p>
      <div className="mt-4 flex items-center gap-4">
        <div className="relative h-24 w-24 rounded-full p-2" style={ringStyle}>
          <div className="flex h-full w-full items-center justify-center rounded-full bg-[#0b0f14]">
            <div className="text-center">
              <p className="text-2xl font-semibold text-white">{value}</p>
              <p className="text-xs text-amber-300">{label}</p>
            </div>
          </div>
        </div>

        <div className="space-y-1 text-xs text-gray-400">
          {(breakdown.length ? breakdown : []).map((item) => (
            <p key={item.name} className="flex items-center justify-between gap-8">
              <span>{item.name}</span>
              <span>{item.value}%</span>
            </p>
          ))}
          {!breakdown.length && (
            <p className="text-gray-500">No breakdown data available.</p>
          )}
        </div>
      </div>
    </Card>
  )
}
