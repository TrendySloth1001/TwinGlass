import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app'
import { ErrorBoundary } from '@/components/error-boundary'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { initTheme } from '@/hooks/use-theme'
import '@fontsource-variable/space-grotesk'
import '@fontsource/space-mono/400.css'
import '@fontsource/space-mono/700.css'
import '@fontsource-variable/doto'
import '@/styles/globals.css'

initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider delayDuration={400}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
      <Toaster position="bottom-right" closeButton />
    </TooltipProvider>
  </StrictMode>,
)
