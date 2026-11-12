import * as React from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Bottom sheet: slides up from the window's bottom edge over a scrim, 28 px top corners and a
 * handle (the phone app's sheets, on the Mac). For one focused task at a time.
 */
function BottomSheet(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="bottom-sheet" {...props} />
}

function BottomSheetContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[min(92vh,760px)] w-[min(880px,100vw-24px)] flex-col overflow-hidden rounded-t-[8px] border border-b-0 bg-card text-card-foreground shadow-2xl outline-none',
          'duration-300 ease-[var(--ease-spring)] data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom',
          className,
        )}
        {...props}
      >
        <div className="mx-auto mt-3 h-1 w-9 shrink-0 rounded-full bg-border-strong" />
        {children}
        <DialogPrimitive.Close className="absolute top-4 right-4 grid size-8 place-items-center rounded-[5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

const BottomSheetTitle = DialogPrimitive.Title
const BottomSheetDescription = DialogPrimitive.Description

export { BottomSheet, BottomSheetContent, BottomSheetTitle, BottomSheetDescription }
