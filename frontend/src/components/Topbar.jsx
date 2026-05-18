import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useUser } from '@clerk/clerk-react'
import { FiBell, FiMic, FiMicOff, FiMenu, FiMoon, FiSearch, FiSun } from 'react-icons/fi'

import useSpeechRecognition from '../hooks/useSpeechRecognition'
import { fetchSystemOwnership } from '../services/api'

export default function Topbar({ title, subtitle, theme, onToggleTheme, onSearch, searchValue, onSearchValueChange, onMenuClick, onVoiceSubmit }) {
  const { user } = useUser()
  const [ownership, setOwnership] = useState(null)
  const {
    isSupported,
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    clearTranscript,
    clearError,
  } = useSpeechRecognition({
    timeoutMs: 8000,
    onFinalTranscript: (finalText) => {
      const text = String(finalText || '').trim()
      if (!text) return
      onSearchValueChange(text)
      onVoiceSubmit?.(text)
    }
  })

  useEffect(() => {
    if (isListening) {
      onSearchValueChange(transcript)
    }
  }, [isListening, onSearchValueChange, transcript])

  useEffect(() => {
    let active = true

    const loadOwnership = async () => {
      try {
        const snapshot = await fetchSystemOwnership()
        if (active) setOwnership(snapshot || null)
      } catch {
        if (active) setOwnership(null)
      }
    }

    void loadOwnership()

    return () => {
      active = false
    }
  }, [])

  const handleMicClick = () => {
    if (!isSupported) {
      clearTranscript()
      return
    }

    if (isListening) {
      stopListening()
      return
    }

    clearError()
    clearTranscript()
    startListening()
  }

  const displayName = user?.fullName?.trim()
    || [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
    || user?.username?.trim()
    || user?.primaryEmailAddress?.emailAddress?.trim()
    || 'Your account'

  const userEmail = user?.primaryEmailAddress?.emailAddress?.trim().toLowerCase() || ''
  const userId = user?.id?.trim() || ''
  const isOwner = Boolean(
    ownership?.owner_configured && (
      (ownership?.owner_email && ownership.owner_email.toLowerCase() === userEmail) ||
      (ownership?.owner_clerk_user_id && ownership.owner_clerk_user_id === userId)
    )
  )
  const isAdmin = Boolean(
    !isOwner && (
      (ownership?.admin_emails || []).some((email) => String(email).toLowerCase() === userEmail) ||
      (ownership?.admin_clerk_user_ids || []).some((id) => String(id) === userId)
    )
  )
  const userRole = isOwner ? 'Owner' : isAdmin ? 'Admin' : user ? 'Member' : 'Guest'
  const avatarText = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U'

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="topbar-shell sticky top-0 z-10 mb-6 flex flex-wrap items-center justify-between gap-4 px-4 py-4"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-gray-300 transition hover:bg-white/10 hover:text-white md:hidden"
          aria-label="Open sidebar"
        >
          <FiMenu size={16} />
        </button>

        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gray-500">{subtitle || 'Live Operations'}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">{title || 'Maritime Logistics Command Center'}</h1>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 text-sm text-gray-300">
        <button
          type="button"
          onClick={onToggleTheme}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gray-300 transition hover:bg-white/10 hover:text-white"
          aria-label="Toggle color theme"
        >
          {theme === 'dark' ? <FiSun size={14} /> : <FiMoon size={14} />}
        </button>

        <div className="relative min-w-[19rem] max-w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] transition focus-within:border-cyan-400/30 focus-within:bg-white/5 md:min-w-[22rem]">
          <FiSearch size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={searchValue}
            onChange={(e) => onSearchValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSearch(e.currentTarget.value)
            }}
            placeholder="Speak or search shipments..."
            className="w-full bg-transparent pl-7 pr-14 text-xs text-white placeholder:text-gray-500 outline-none"
          />
          <button
            type="button"
            onClick={handleMicClick}
            className={`absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl border transition ${isListening ? 'border-cyan-400/40 bg-cyan-400/15 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.28)] animate-pulse' : 'border-white/10 bg-white/5 text-gray-300 hover:border-white/20 hover:bg-white/10 hover:text-white'}`}
            aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
            title={isListening ? 'Listening…' : isSupported ? 'Use voice input' : 'Voice input not supported'}
          >
            {isListening ? <FiMicOff size={14} /> : <FiMic size={14} />}
          </button>
          {isListening && (
            <span className="absolute -bottom-5 right-2 text-[10px] uppercase tracking-[0.24em] text-cyan-200">
              Listening...
            </span>
          )}
        </div>

        <button
          type="button"
          className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-gray-300 transition hover:bg-white/10 hover:text-white"
          aria-label="Notifications"
        >
          <FiBell size={15} />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-orange-400" />
        </button>

        <button type="button" className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:bg-white/10">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/10 text-xs font-semibold text-white">
            {avatarText}
          </span>
          <span className="hidden md:block">
            <span className="block text-xs text-white">{displayName}</span>
            <span className="block text-[11px] text-gray-500">{userRole}</span>
          </span>
        </button>

        {error && (
          <div className="w-full text-right text-[11px] text-orange-200 md:-mt-2 md:pr-1">
            {error}
          </div>
        )}
      </div>
    </motion.div>
  )
}
