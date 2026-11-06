import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Last line of defence for the UI: a render error shows a recoverable screen (with the error)
 * instead of a blank window. The mirror session lives in main, so reloading reconnects it.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ui] crashed:', error, info.componentStack)
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid h-full place-items-center bg-background p-6 text-center">
        <div className="flex max-w-sm flex-col items-center gap-3">
          <TriangleAlert className="size-8 text-warning" />
          <div className="font-semibold">Something went wrong in the window</div>
          <pre className="max-h-32 w-full overflow-auto rounded-md bg-muted p-2 text-left text-[11px] whitespace-pre-wrap text-muted-foreground">
            {this.state.error.message}
          </pre>
          <Button size="sm" onClick={() => location.reload()}>
            <RotateCcw /> Reload window
          </Button>
        </div>
      </div>
    )
  }
}
