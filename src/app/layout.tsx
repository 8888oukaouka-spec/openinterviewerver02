import type { Metadata, Viewport } from 'next'
// Self-hosted fonts (src/fonts). fonts.css must precede latin.ts: see its header.
import '@/fonts/fonts.css'
import '@/fonts/latin'
import './globals.css'
import PreviewBanner from '@/components/PreviewBanner'

export const metadata: Metadata = {
  title: 'OpenInterviewer',
  description: 'AI-assisted qualitative research interviews with evidence-linked synthesis',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-paper-0 font-sans text-ink-700 antialiased">
        <PreviewBanner />
        {children}
      </body>
    </html>
  )
}
