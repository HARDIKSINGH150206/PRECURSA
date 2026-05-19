import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import 'leaflet/dist/leaflet.css'

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
console.log('[auth] Clerk publishable key found:', Boolean(clerkPublishableKey))

if (typeof document !== 'undefined') {
  document.documentElement.dataset.surface = 'ultra-dark'
}

if (typeof window !== 'undefined') {
  const storedSurfaceTheme = window.localStorage.getItem('precursa-surface-theme')
  if (storedSurfaceTheme !== 'ultra-dark') {
    window.localStorage.setItem('precursa-surface-theme', 'ultra-dark')
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {clerkPublishableKey ? (
      <ClerkProvider publishableKey={clerkPublishableKey} afterSignOutUrl="/sign-in">
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ClerkProvider>
    ) : (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <div className="w-full max-w-lg rounded-2xl border border-red-400/30 bg-red-500/10 p-6">
          <h1 className="text-lg font-semibold text-red-200">Missing Clerk configuration</h1>
          <p className="mt-2 text-sm text-red-100/90">
            Add VITE_CLERK_PUBLISHABLE_KEY to frontend/.env and restart the Vite dev server.
          </p>
        </div>
      </div>
    )}
  </React.StrictMode>,
)
