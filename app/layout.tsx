import type { Metadata, Viewport } from 'next';
import {
  IBM_Plex_Sans,
  IBM_Plex_Mono,
  IBM_Plex_Serif,
  Noto_Sans_Devanagari,
  Cormorant_Garamond,
} from 'next/font/google';
import './globals.css';

// Fonts are self-hosted by next/font at build time — no runtime CDN calls.
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});
const plexSerif = IBM_Plex_Serif({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-serif',
  display: 'swap',
});
const notoDeva = Noto_Sans_Devanagari({
  subsets: ['devanagari'],
  weight: ['400', '500', '600'],
  variable: '--font-noto-deva',
  display: 'swap',
});
// Couture display serif for hero + section headings on the public surfaces.
// Self-hosted at build time by next/font — no runtime CDN call.
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'VERIBUS — School Transport Integrity Platform',
  description:
    'VERIBUS — Every trip, verified. A concept pilot for RTO Kashmir / J&K Transport Department that turns GPS telemetry into tamper-evident, explainable evidence. Tracking is the input; evidence is the product.',
  applicationName: 'VERIBUS',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
  openGraph: {
    title: 'VERIBUS — School Transport Integrity Platform',
    description: 'Every trip, verified. Tracking is the input. Evidence is the product.',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'VERIBUS — School Transport Integrity Platform. Tracking is the input; evidence is the product.',
      },
    ],
  },
  twitter: { card: 'summary_large_image' },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#0a0e12',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable} ${plexSerif.variable} ${notoDeva.variable} ${cormorant.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
