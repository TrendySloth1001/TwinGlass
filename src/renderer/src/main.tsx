import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app'
import { ErrorBoundary } from '@/components/error-boundary'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { initTheme } from '@/hooks/use-theme'
import '@fontsource-variable/fraunces' // display serif for the home screen (bundled: works offline)
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
