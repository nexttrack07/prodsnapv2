import { forwardRef } from 'react'
import { Button } from '@mantine/core'

export const SaveButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ children, ...props }, ref) => {
  return (
    <Button
      ref={ref}
      tabIndex={0}
      size="sm"
      color="blue"
      {...props}
    >
      {children}
    </Button>
  )
})
