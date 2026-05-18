import { SignIn } from '@clerk/clerk-react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

const MotionSection = motion.section

export default function Login() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#05070a_0%,#0b0f14_100%)] px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(56,189,248,0.14)_0%,rgba(5,7,10,0)_58%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:32px_32px] opacity-[0.16]" />

      <MotionSection
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative z-10 flex w-full max-w-[380px] flex-col items-center"
      >
        <p className="text-center text-[11px] font-medium uppercase tracking-[0.32em] text-sky-200/80">PRECURSA</p>
        <h1 className="mt-3 text-center text-[27px] font-semibold tracking-tight text-white">Logistics Intelligence Platform</h1>
        <p className="mt-2 text-center text-sm text-slate-300">Real-time maritime risk visibility</p>

        <div className="mt-6 w-full rounded-[20px] border border-white/10 bg-[rgba(255,255,255,0.05)] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.6),0_0_44px_rgba(14,165,233,0.14)] backdrop-blur-xl">
          <SignIn
            routing="path"
            path="/sign-in"
            signUpUrl="/sign-up"
            afterSignInUrl="/"
            appearance={{
              elements: {
                rootBox: 'mx-auto w-full max-w-[348px]',
                cardBox: 'mx-auto flex w-full justify-center',
                card: 'bg-transparent shadow-none border-0 p-0',
                headerTitle: 'text-white text-xl font-semibold',
                headerSubtitle: 'text-slate-400',
                socialButtonsBlockButton:
                  'bg-white/5 border border-white/15 text-slate-100 hover:bg-white/10 transition-colors',
                socialButtonsBlockButtonText: 'text-slate-100',
                dividerLine: 'bg-white/10',
                dividerText: 'text-slate-400',
                formFieldLabel: 'text-slate-300',
                formFieldInput:
                  'bg-black/30 border border-white/15 text-white placeholder:text-slate-500 focus:border-sky-400/60 focus:ring-1 focus:ring-sky-400/45',
                formButtonPrimary:
                  'bg-gradient-to-r from-sky-500 to-cyan-400 text-slate-950 font-medium shadow-[0_0_24px_rgba(34,211,238,0.45)] hover:from-sky-400 hover:to-cyan-300 transition-all duration-200',
                footerActionText: 'text-slate-400',
                footerActionLink: 'text-sky-300 hover:text-sky-200',
                identityPreviewText: 'text-slate-300',
                formResendCodeLink: 'text-sky-300 hover:text-sky-200',
              },
            }}
          />
        </div>

        <p className="mt-4 text-center text-sm text-slate-300">
          New here?{' '}
          <Link to="/sign-up" className="font-medium text-sky-300 transition-colors hover:text-sky-200">
            Create an account
          </Link>
        </p>
      </MotionSection>
    </main>
  )
}
