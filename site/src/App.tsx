import { MotionConfig } from 'motion/react'
import { useEffect } from 'react'
import { SiteHeader } from './components/chrome'
import { DownloadProvider } from './components/download'
import { Privacy } from './pages/Privacy'
import { Agents, Capabilities, Connect, DownloadSection, Faq, Features, Footer, Hero, PhoneApp, PrivacyBlock, Steps, Strip, WhatsNew } from './sections'

export function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  const privacy = path === '/privacy'
  useEffect(() => {
    document.title = privacy ? 'Privacy Policy · Twinglass' : 'Twinglass · Your Android phone, on your Mac'
  }, [privacy])
  return (
    // "user": animations follow the visitor's reduced-motion setting.
    <MotionConfig reducedMotion="user">
      <DownloadProvider>
        <SiteHeader />
        {privacy ? (
          <Privacy />
        ) : (
          <main>
            <Hero />
            <Strip />
            <Steps />
            <Features />
            <Connect />
            <PhoneApp />
            <Agents />
            <Capabilities />
            <PrivacyBlock />
            <WhatsNew />
            <Faq />
            <DownloadSection />
          </main>
        )}
        <Footer />
      </DownloadProvider>
    </MotionConfig>
  )
}
