import { motion } from 'framer-motion'
import { createElement } from 'react'
import Card from './Card'

export default function MetricCard({ icon: Icon, title, value, trend, trendTone = 'neutral' }) {
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
      className="p-4"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-400">{title}</p>
          <p className="mt-1 text-3xl font-semibold text-white">{value}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-2 text-gray-200">
          {Icon ? createElement(Icon, { size: 16 }) : null}
        </div>
      </div>
      <p className={`mt-3 text-xs ${toneClass}`}>{trend}</p>
    </Card>
  )
}
