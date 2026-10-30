import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import AppShell from '../components/AppShell';
import MetaConsentBanner from '../components/MetaConsentBanner';
import { CompanySettingsProvider } from '@/components/CompanySettingsProvider';
import { companyCssVariables } from '@/lib/company';
import { getCompanySettingsServer } from '@/lib/companySettingsServer';
import type { CSSProperties } from 'react';

const inter = Inter({ subsets: ['latin'] });
const iconVersion = '20260715-2';

export async function generateMetadata(): Promise<Metadata> {
  const company = await getCompanySettingsServer();
  const title = company.seo_titulo || company.nome_fantasia;
  const description = company.seo_descricao || company.descricao_curta_loja || company.descricao_empresa || '';
  const icon = company.favicon_url || `/favicon.ico?v=${iconVersion}`;
  const ogImage = company.seo_imagem_url || company.imagem_institucional_url || company.logo_url || `/icon-512x512.png?v=${iconVersion}`;
  return {
  metadataBase: new URL(company.site || 'https://www.vivalevedf.com.br'),
  title,
  description,
  manifest: '/manifest.webmanifest',
  themeColor: company.cor_primaria || '#6B21A8',
  verification: {
    google: 'bybpclfenbOY0RJ2fypIiJObOjMNBNXEor4fMbFgKSk',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: company.nome_fantasia,
  },
  icons: {
    icon: [
      { url: icon, sizes: 'any' },
      { url: `/icon-192x192.png?v=${iconVersion}`, sizes: '192x192', type: 'image/png' },
      { url: `/icon-512x512.png?v=${iconVersion}`, sizes: '512x512', type: 'image/png' },
    ],
    shortcut: [icon],
    apple: [
      { url: `/apple-touch-icon.png?v=${iconVersion}`, sizes: '180x180', type: 'image/png' },
      { url: `/icon-192x192.png?v=${iconVersion}`, sizes: '192x192', type: 'image/png' },
    ],
  },
  openGraph: {
    title,
    description,
    images: [
      {
        url: ogImage,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [
      {
        url: ogImage,
      },
    ],
  },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const company = await getCompanySettingsServer();
  const style = companyCssVariables(company) as CSSProperties;
  return (
    <html lang="pt-BR" style={style}>
      <body className={`${inter.className} min-h-screen overflow-hidden bg-[var(--brand-background)] text-[var(--brand-text)]`}>
        <CompanySettingsProvider company={company}>
          <AppShell>{children}</AppShell>
          <MetaConsentBanner />
        </CompanySettingsProvider>
      </body>
    </html>
  );
}
