import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface IconButtonProps extends ComponentProps<typeof Button> {
  label: string
  shortcut?: string
  children: ReactNode
}

/** Icon-only button with an accessible label and a tooltip (optionally showing a shortcut). */
export function IconButton({ label, shortcut, children, className, ...props }: IconButtonProps): ReactNode {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          className={cn('[-webkit-app-region:no-drag]', className)}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2">
        {label}
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  )
}
