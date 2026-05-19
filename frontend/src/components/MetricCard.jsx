import { motion } from 'framer-motion'
import { createElement } from 'react'
import Card from './Card'

export default function MetricCard({ icon: Icon, title, value, trend, trendTone = 'neutral', compact = false }) {
  const toneClass =
    trendTone === 'up'
      ? 'text-orange-300'
      : trendTone === 'down'
        ? 'text-slate-300'
        : 'text-slate-400'

  return (
    <Card
      as={motion.div}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.24 }}
      className={compact ? 'p-3' : 'p-4'}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{title}</p>
          <p className={`mt-1 font-semibold text-white ${compact ? 'text-2xl' : 'text-3xl'}`}>{value}</p>
        </div>
        <div className={`rounded-xl border border-white/10 bg-white/5 text-gray-200 ${compact ? 'p-1.5' : 'p-2'}`}>
          {Icon ? createElement(Icon, { size: compact ? 14 : 16 }) : null}
        </div>
      </div>
      <p className={`mt-2 text-xs ${toneClass}`}>{trend}</p>
    </Card>
  )
}
