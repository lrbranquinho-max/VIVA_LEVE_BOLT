import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Viva Leve',
  description: 'Comida saudavel e rastreamento de dieta.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Viva Leve',
  },
  icons: {
    icon: [
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' }],
  },
  openGraph: {
    title: 'Viva Leve',
    description: 'Comida saudavel e rastreamento de dieta.',
    images: [
      {
        url: '/icon-512x512.png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Viva Leve',
    description: 'Comida saudavel e rastreamento de dieta.',
    images: [
      {
        url: '/icon-512x512.png',
      },
    ],
  },
};

export const viewport = {
  themeColor: '#6B21A8',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
