import type { Metadata } from 'next'
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
      <body className="min-h-screen bg-stone-900 font-sans antialiased">
        <PreviewBanner />
        {children}
      </body>
    </html>
  )
}
