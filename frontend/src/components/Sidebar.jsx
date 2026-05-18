import { motion } from 'framer-motion'
import {
  FiAlertTriangle,
  FiBarChart2,
  FiBox,
  FiCloud,
  FiCompass,
  FiFileText,
  FiGrid,
  FiNavigation,
  FiSettings
} from 'react-icons/fi'

import precursaLogo from '../assets/precursa-logo.png'

const menuItems = [
  { key: 'dashboard', label: 'Dashboard', icon: FiGrid },
  { key: 'shipments', label: 'Shipments', icon: FiBox },
  { key: 'vessels', label: 'Vessels', icon: FiNavigation },
  { key: 'routes', label: 'Routes', icon: FiCompass },
  { key: 'risk-alerts', label: 'Risk Alerts', icon: FiAlertTriangle },
  { key: 'weather', label: 'Weather', icon: FiCloud },
  { key: 'analytics', label: 'Analytics', icon: FiBarChart2 },
  { key: 'global-risk', label: 'Global Risk', icon: FiAlertTriangle },
  { key: 'reports', label: 'Reports', icon: FiFileText },
  { key: 'settings', label: 'Settings', icon: FiSettings }
]

export default function Sidebar({ activePage, hasError, lastUpdated, isOpen, onNavigate, onClose }) {
  return (
    <aside
      className={`sidebar-shell fixed left-0 top-0 z-30 flex h-screen w-64 flex-col p-4 transition-transform duration-300 md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
    >
      <div className="mb-6 flex items-start justify-between gap-3 px-1 pt-1">
        <img
          src={precursaLogo}
          alt="Precursa logo"
          className="h-24 w-auto max-w-[190px] object-contain"
        />

        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-400 transition hover:bg-white/10 hover:text-white md:hidden"
        >
          Close
        </button>
      </div>

      <nav className="space-y-1.5">
        {menuItems.map(({ key, label, icon: Icon }) => (
          <motion.button
            key={label}
            whileHover={{ scale: 1.02 }}
            onClick={() => onNavigate(key)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
              activePage === key
                ? 'bg-white/10 text-white'
                : 'text-gray-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Icon size={15} />
            <span>{label}</span>
          </motion.button>
        ))}
      </nav>

      <div className="mt-auto space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-lg">
          <p className="mb-1 text-xs text-gray-500">System Status</p>
          <div className="flex items-center gap-2 text-sm text-white">
            <span className={`h-2.5 w-2.5 rounded-full ${hasError ? 'bg-red-400' : 'bg-sky-400'}`} />
            <span>{hasError ? 'Degraded' : 'Operational'}</span>
          </div>
          <p className="mt-2 text-xs text-gray-500">Updated {lastUpdated}</p>
        </div>
      </div>
    </aside>
  )
}
