import { useState } from 'react'

import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function Layout({
  activePage,
  hasError,
  lastUpdated,
  theme,
  title,
  subtitle,
  searchValue,
  onSearch,
  onSearchValueChange,
  onVoiceSubmit,
  onToggleTheme,
  onNavigate,
  children
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleNavigate = (page) => {
    onNavigate(page)
    setSidebarOpen(false)
  }

  return (
    <div className="app-shell min-h-screen text-white md:flex">
      <Sidebar
        activePage={activePage}
        hasError={hasError}
        lastUpdated={lastUpdated}
        theme={theme}
        isOpen={sidebarOpen}
        onNavigate={handleNavigate}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="hidden w-64 shrink-0 md:block" aria-hidden="true" />

      <main className="min-h-screen min-w-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 lg:px-8">
        <Topbar
          title={title}
          subtitle={subtitle}
          theme={theme}
          searchValue={searchValue}
          onSearch={onSearch}
          onSearchValueChange={onSearchValueChange}
          onVoiceSubmit={onVoiceSubmit}
          onToggleTheme={onToggleTheme}
          onMenuClick={() => setSidebarOpen(true)}
        />

        <div className="space-y-6 pb-8">
          {children}
        </div>
      </main>

      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-black/55 backdrop-blur-[2px] md:hidden"
        />
      )}
    </div>
  )
}