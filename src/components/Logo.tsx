import { twMerge } from 'tailwind-merge'

type Size = 'sm' | 'md' | 'lg'
type Variant = 'light' | 'dark'

const sizeClasses: Record<Size, string> = {
  sm: 'text-xs tracking-[0.18em] border p-0.5',
  md: 'text-sm tracking-[0.18em] border p-1',
  lg: 'text-base tracking-[0.2em] border-2 p-1.5',
}

const blockPadding: Record<Size, string> = {
  sm: 'px-1.5 py-1',
  md: 'px-2 py-1',
  lg: 'px-2.5 py-1.5',
}

export function Logo({
  size = 'md',
  variant = 'light',
  className,
}: {
  size?: Size
  variant?: Variant
  className?: string
}) {
  const borderClr = variant === 'light' ? 'border-slate-900' : 'border-white'
  const solidBlock =
    variant === 'light'
      ? 'bg-slate-900 text-white'
      : 'bg-white text-slate-900'
  const outlineBlock = variant === 'light' ? 'text-slate-900' : 'text-white'
  return (
    <div
      className={twMerge(
        'inline-flex items-stretch rounded-sm font-bold leading-none select-none',
        sizeClasses[size],
        borderClr,
        className,
      )}
    >
      <span className={twMerge('rounded-sm', blockPadding[size], solidBlock)}>PROD</span>
      <span className={twMerge('rounded-sm', blockPadding[size], outlineBlock)}>SNAP</span>
    </div>
  )
}
