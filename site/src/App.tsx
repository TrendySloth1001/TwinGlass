import { MotionConfig } from 'motion/react'
import { useEffect } from 'react'
import { SiteHeader } from './components/chrome'
import { DownloadProvider } from './components/download'
import { Changelog } from './pages/Changelog'
import { Privacy } from './pages/Privacy'
import { Releases } from './pages/Releases'
import { Tools } from './pages/Tools'
import { Agents, Capabilities, Connect, DownloadSection, Faq, Features, Footer, Hero, MadeWith, PhoneApp, PrivacyBlock, Steps, Story, Strip, WhatsNew } from './sections'

export function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  const page = path === '/privacy' ? 'privacy' : path === '/changelog' ? 'changelog' : path === '/releases' ? 'releases' : path === '/tools' ? 'tools' : 'home'
  useEffect(() => {
    document.title = {
      privacy: 'Privacy Policy · Twinglass',
      changelog: 'Changelog · Twinglass',
      releases: 'Releases · Twinglass',
      tools: 'Agent tools · Twinglass',
      home: 'Twinglass · Your Android phone, on your Mac',
    }[page]
  }, [page])
  return (
    // "user": animations follow the visitor's reduced-motion setting.
    <MotionConfig reducedMotion="user">
      <DownloadProvider>
        <SiteHeader />
        {page === 'privacy' ? (
          <Privacy />
        ) : page === 'changelog' ? (
          <Changelog />
        ) : page === 'releases' ? (
          <Releases />
        ) : page === 'tools' ? (
          <Tools />
        ) : (
          <main>
            <Hero />
            <Strip />
            <Steps />
            <Features />
            <Connect />
            <PhoneApp />
            <Agents />
            <Story />
            <Capabilities />
            <PrivacyBlock />
            <WhatsNew />
            <Faq />
            <DownloadSection />
          </main>
        )}
        <MadeWith />
        <Footer />
      </DownloadProvider>
    </MotionConfig>
  )
}
