import './instrument'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
import * as Sentry from '@sentry/react'
import { getDataFast } from './lib/datafast'

// Initialize DataFast analytics on startup
getDataFast()

hydrateRoot(
  document,
  <StartClient />,
  {
    onUncaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
      console.error('Uncaught error:', error, errorInfo.componentStack)
    }),
    onCaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
      console.error('Caught error:', error, errorInfo.componentStack)
    }),
    onRecoverableError: Sentry.reactErrorHandler((error, errorInfo) => {
      console.warn('Recoverable error:', error, errorInfo.componentStack)
    }),
  }
)
