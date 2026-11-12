import { MotionConfig } from 'motion/react'
import { useEffect } from 'react'
import { StatusBar, TitleBar } from './components/chrome'
import { DownloadProvider } from './components/download'
import { Privacy } from './pages/Privacy'
import { Agents, DownloadSection, Faq, Features, Footer, Hero, HowItWorks, Numbers, PhoneApp, PrivacyBlock, Strip, WhatsNew } from './sections'

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
        <TitleBar />
        {privacy ? (
          <Privacy />
        ) : (
          <main>
            <Hero />
            <Strip />
            <Features />
            <Numbers />
            <HowItWorks />
            <PhoneApp />
            <Agents />
            <PrivacyBlock />
            <WhatsNew />
            <Faq />
            <DownloadSection />
          </main>
        )}
        <Footer />
        <StatusBar />
      </DownloadProvider>
    </MotionConfig>
  )
}
