import * as Sentry from '@sentry/react'

Sentry.init({
  dsn: 'https://e9579ae2bc0bf488fd2e780ed5cfdcc9@o4511445799469056.ingest.us.sentry.io/4511445800321024',
  sendDefaultPii: true,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  tracesSampleRate: 1.0,
  tracePropagationTargets: ['localhost', /^https:\/\/yourserver\.io\/api/],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  enableLogs: true,
})
