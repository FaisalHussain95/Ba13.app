import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Ba13 — Chiffrage Cloisons',
  description: 'Outil de chiffrage mobile pour cloisons sèches',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Ba13' },
  icons: { icon: '/favicon.ico', shortcut: '/favicon.ico' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#1d4ed8',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="mx-auto min-h-screen antialiased" style={{ backgroundColor: '#f7f7f5' }}>
        {children}
      </body>
    </html>
  )
}
