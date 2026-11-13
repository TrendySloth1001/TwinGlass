import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { FrameCorners, REPO } from '../components/base'
import { POLICY_VERSION } from '../components/download'

function S({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border pt-8">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 leading-relaxed text-muted-foreground [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-foreground">{children}</div>
    </section>
  )
}

export function Privacy() {
  const date = new Date(`${POLICY_VERSION}T12:00:00`).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <main className="mx-auto max-w-3xl px-4 pt-32 pb-10 sm:px-6">
      <a href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to Twinglass
      </a>
      <h1 className="font-soft mt-6 text-5xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-3 font-mono text-xs text-muted-foreground uppercase">Effective {date}</p>

      <div className="relative mt-10 border border-border bg-tile p-6">
        <FrameCorners />
        <p className="font-medium">The short version</p>
        <ul className="mt-3 flex flex-col gap-1.5 text-sm text-muted-foreground [&_li]:ml-5 [&_li]:list-disc">
          <li>No accounts, no analytics, no ads, no tracking. I don’t collect or sell anything about you.</li>
          <li>Your phone’s screen, input, clipboard and files only travel between your phone and your Mac.</li>
          <li>The Mac app’s only internet request is the update check against GitHub. The phone app never uses the internet.</li>
          <li>If you turn on agent access, the AI tools you connect can see your phone. That part is up to you and their policies.</li>
        </ul>
      </div>

      <div className="mt-10 flex flex-col gap-10">
        <S title="Who this covers">
          <p>
            Twinglass is an independent project by Nikhil Kumawat. This policy covers Twinglass for Mac, the Twinglass phone app for Android, and this website.
            Questions go to the <a className="underline" href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer">issue tracker on GitHub</a>.
          </p>
        </S>

        <S title="What stays on your Mac">
          <p>Twinglass for Mac works locally. It keeps these on your Mac and never sends them anywhere:</p>
          <ul>
            <li>Settings, in <code>~/Library/Application Support/mob-mirror</code>.</li>
            <li>A phone PIN, if you choose to save one. It’s encrypted with your macOS keychain and only used after you approve with Touch ID.</li>
            <li>Screenshots and recordings you take, in <code>~/Pictures/Twinglass</code> and <code>~/Movies/Twinglass</code>.</li>
            <li>Clipboard history, kept in memory only and cleared when you quit. Copies from password managers are skipped.</li>
            <li>Pairings with phones on Wi-Fi, and the token for agent access (a file only your user can read).</li>
          </ul>
        </S>

        <S title="What goes between your phone and your Mac">
          <p>
            Mirroring sends the phone’s screen (and audio, if you turn it on) to the Mac, and your mouse, keyboard, clipboard and dropped files to the phone.
            This happens over USB, over adb on your local network, or over Twinglass’s own Wi-Fi link. The Wi-Fi link is paired with a one-time code and
            encrypted end to end (AES-256-GCM). None of it passes through a server.
          </p>
          <p>
            To be found by your phone, the Mac announces itself on your local network (mDNS) using its computer name. While you add a phone, or a phone asks
            for an update, the Mac also serves the phone app on your local network for a few minutes.
          </p>
          <p>
            With the phone app linked, the Mac can read the phone’s device details, app icons and on-screen elements. Each of these can be switched off in the
            phone app under Settings → What the Mac may use.
          </p>
        </S>

        <S title="The internet">
          <p>
            <strong>Twinglass for Mac</strong> checks GitHub for new versions shortly after launch and every 6 hours, and downloads updates from GitHub when you
            choose to install them. GitHub sees your IP address and a generic app name, as with any web request, under{' '}
            <a className="underline" href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener noreferrer">
              GitHub’s privacy statement
            </a>
            . Nothing about you, your phone or your usage is sent.
          </p>
          <p>
            <strong>The phone app</strong> doesn’t use the internet. Updates come from your Mac. The QR scanner uses Google’s code scanner in Google Play services,
            which reads the code on your phone.
          </p>
        </S>

        <S title="Coding agents (MCP)">
          <p>
            Agent access is off by default. If you turn it on, AI coding tools you connect on your Mac (such as Claude Code, Cursor or VS Code) can take
            screenshots, read what’s on the phone’s screen and operate it. Those tools may send that content to their AI providers under their own terms, so only
            turn this on with tools you trust, and keep it off while sensitive apps are open. The server only accepts connections from your Mac and needs a
            secret token, and agents can’t unlock your phone without your Touch ID.
          </p>
        </S>

        <S title="This website">
          <p>
            This site is hosted by Vercel, which keeps standard server logs (such as IP address and browser type) under{' '}
            <a className="underline" href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">
              Vercel’s privacy policy
            </a>
            . The site sets no cookies and has no analytics. Your browser asks GitHub for the latest release so the download button stays current, loads my profile
            picture from GitHub, and downloads come from GitHub. If you tick the box before downloading, your browser remembers that on your device so you aren’t asked again for this version of
            the policy.
          </p>
        </S>

        <S title="Your choices">
          <ul>
            <li>Forget a phone or a Mac at any time. The other side forgets too.</li>
            <li>Switch off what the Mac may read in the phone app, and agent access in the Mac app.</li>
            <li>
              Uninstall with <code>install.sh --uninstall --purge</code> to remove the app and its settings. Uninstall the phone app as usual.
            </li>
          </ul>
        </S>

        <S title="Children">
          <p>Twinglass isn’t directed at children and doesn’t knowingly collect anything from anyone, including children.</p>
        </S>

        <S title="Changes">
          <p>
            If this policy changes, the new version will be posted here with a new effective date, and the site will ask you to agree again before your next
            download. The history is in the project’s{' '}
            <a className="underline" href={`${REPO}/commits/master/site/src/pages/Privacy.tsx`} target="_blank" rel="noopener noreferrer">
              commit log
            </a>
            .
          </p>
        </S>
      </div>
    </main>
  )
}
