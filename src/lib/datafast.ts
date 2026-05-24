import { initDataFast } from 'datafast'

let datafastInstance: any = null
let initializationPromise: Promise<any> | null = null

export function getDataFast(): Promise<any> | null {
  if (typeof window === 'undefined') return null

  if (datafastInstance) {
    return Promise.resolve(datafastInstance)
  }

  if (!initializationPromise) {
    initializationPromise = initDataFast({
      websiteId: 'dfid_zGpVSpltiOZyqFJveeMiX',
      autoCapturePageviews: true,
    })
      .then((instance) => {
        datafastInstance = instance
        return instance
      })
      .catch((err) => {
        console.error('[DataFast] Failed to initialize:', err)
        initializationPromise = null
        throw err
      })
  }

  return initializationPromise
}
