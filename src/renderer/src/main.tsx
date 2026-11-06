import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { followSystemTheme } from '@/hooks/use-theme'
import '@/styles/globals.css'

followSystemTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider delayDuration={400}>
      <App />
      <Toaster position="bottom-right" closeButton />
    </TooltipProvider>
  </StrictMode>,
)
