import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
})

export const metadata: Metadata = {
  title: 'Nativos Cut — Corte Inteligente de Modelos 3D',
  description: 'Software profissional de corte inteligente para modelos 3D com tecnologia SmartCut.',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#000000',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className="bg-background">
      <body className={`${inter.variable} ${jetbrainsMono.variable} antialiased font-sans`}>
        {children}
      </body>
    </html>
  )
}
