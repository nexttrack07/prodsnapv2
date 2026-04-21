import { forwardRef } from 'react'
import { Button } from '@mantine/core'

export const CancelButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ children, ...props }, ref) => {
  return (
    <Button
      ref={ref}
      type="button"
      tabIndex={0}
      variant="subtle"
      color="gray"
      size="sm"
      {...props}
    >
      {children}
    </Button>
  )
})
