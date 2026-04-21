import { onlineManager } from '@tanstack/react-query'
import { useEffect } from 'react'
import { notifications } from '@mantine/notifications'

export function useOfflineIndicator() {
  useEffect(() => {
    return onlineManager.subscribe(() => {
      if (onlineManager.isOnline()) {
        notifications.show({
          id: 'ReactQuery',
          title: 'Connection restored',
          message: 'You are back online',
          color: 'green',
          autoClose: 2000,
        })
      } else {
        notifications.show({
          id: 'ReactQuery',
          title: 'Connection lost',
          message: 'You are offline',
          color: 'red',
          autoClose: false,
        })
      }
    })
  }, [])
}
