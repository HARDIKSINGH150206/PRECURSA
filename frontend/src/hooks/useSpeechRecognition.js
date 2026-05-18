import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_TIMEOUT_MS = 8000

export default function useSpeechRecognition({
  language = 'en-US',
  continuous = false,
  interimResults = true,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onInterimTranscript,
  onFinalTranscript,
} = {}) {
  const recognitionRef = useRef(null)
  const timeoutRef = useRef(null)
  const interimCallbackRef = useRef(onInterimTranscript)
  const finalCallbackRef = useRef(onFinalTranscript)
  const transcriptRef = useRef('')
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    interimCallbackRef.current = onInterimTranscript
  }, [onInterimTranscript])

  useEffect(() => {
    finalCallbackRef.current = onFinalTranscript
  }, [onFinalTranscript])

  const supported = typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = continuous
    recognition.interimResults = interimResults
    recognition.lang = language
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      let finalText = ''
      let interimText = ''

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const chunk = result[0]?.transcript || ''
        if (result.isFinal) {
          finalText += chunk
        } else {
          interimText += chunk
        }
      }

      const nextTranscript = `${finalText}${interimText}`.trim()
      transcriptRef.current = nextTranscript
      setTranscript(nextTranscript)
      interimCallbackRef.current?.(nextTranscript)
    }

    recognition.onerror = (event) => {
      const message = event?.error === 'not-allowed' || event?.error === 'service-not-allowed'
        ? 'Microphone permission denied'
        : 'Voice recognition failed'
      setError(message)
      setIsListening(false)
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    recognition.onend = () => {
      setIsListening(false)
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
      const finalText = transcriptRef.current.trim()
      if (finalText) {
        finalCallbackRef.current?.(finalText)
      }
    }

    recognitionRef.current = recognition

    return () => {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
      try {
        recognition.stop()
      } catch {
        // Ignore teardown races.
      }
      recognitionRef.current = null
    }
  }, [continuous, interimResults, language])

  const startListening = useCallback(() => {
    if (!supported) {
      setError('Voice input not supported')
      return
    }

    const recognition = recognitionRef.current
    if (!recognition || isListening) return

    setError('')
    transcriptRef.current = ''
    setTranscript('')
    setIsListening(true)

    try {
      recognition.start()
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = window.setTimeout(() => {
        try {
          recognition.stop()
        } catch {
          // Ignore stop races when the browser already ended the session.
        }
      }, timeoutMs)
    } catch (startError) {
      const message = startError?.message || 'Unable to start voice input'
      setError(message)
      setIsListening(false)
    }
  }, [isListening, supported, timeoutMs])

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition) return

    try {
      recognition.stop()
    } catch {
      // Ignore stop races.
    }
    window.clearTimeout(timeoutRef.current)
    timeoutRef.current = null
    setIsListening(false)
  }, [])

  const clearTranscript = useCallback(() => {
    transcriptRef.current = ''
    setTranscript('')
  }, [])

  const clearError = useCallback(() => {
    setError('')
  }, [])

  return {
    isSupported: supported,
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    clearTranscript,
    clearError,
  }
}
