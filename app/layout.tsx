import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import AppShell from '../components/AppShell';

const inter = Inter({ subsets: ['latin'] });
const iconVersion = '20260715-2';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.vivalevedf.com.br'),
  title: 'Viva Leve',
  description: 'Comida saudavel e rastreamento de dieta.',
  manifest: '/manifest.webmanifest',
  themeColor: '#6B21A8',
  verification: {
    google: 'bybpclfenbOY0RJ2fypIiJObOjMNBNXEor4fMbFgKSk',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Viva Leve',
  },
  icons: {
    icon: [
      { url: `/favicon.ico?v=${iconVersion}`, sizes: 'any' },
      { url: `/icon-192x192.png?v=${iconVersion}`, sizes: '192x192', type: 'image/png' },
      { url: `/icon-512x512.png?v=${iconVersion}`, sizes: '512x512', type: 'image/png' },
    ],
    shortcut: [`/favicon.ico?v=${iconVersion}`],
    apple: [
      { url: `/apple-touch-icon.png?v=${iconVersion}`, sizes: '180x180', type: 'image/png' },
      { url: `/icon-192x192.png?v=${iconVersion}`, sizes: '192x192', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'Viva Leve',
    description: 'Comida saudavel e rastreamento de dieta.',
    images: [
      {
        url: `/icon-512x512.png?v=${iconVersion}`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Viva Leve',
    description: 'Comida saudavel e rastreamento de dieta.',
    images: [
      {
        url: `/icon-512x512.png?v=${iconVersion}`,
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.className} min-h-screen overflow-hidden bg-[#f1f5f2] text-gray-900`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
