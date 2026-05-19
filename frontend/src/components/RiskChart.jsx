import { motion } from 'framer-motion'
import Card from './Card'

export default function RiskChart({ averageRisk, breakdown = [], compact = false }) {
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
      className={compact ? 'p-3' : 'p-4'}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">Disruption Risk Index</p>
          <p className="text-xs text-slate-400">Live portfolio pressure</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300">
          {label}
        </span>
      </div>
      <div className={`mt-3 flex items-center gap-4 ${compact ? 'flex-nowrap' : ''}`}>
        <div className={`relative rounded-full ${compact ? 'h-20 w-20 p-1.5' : 'h-24 w-24 p-2'}`} style={ringStyle}>
          <div className="flex h-full w-full items-center justify-center rounded-full bg-[#0b0f14]">
            <div className="text-center">
              <p className={`${compact ? 'text-xl' : 'text-2xl'} font-semibold text-white`}>{value}</p>
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-1 text-xs text-gray-400">
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
