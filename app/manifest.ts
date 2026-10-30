import type { MetadataRoute } from 'next';
import { getCompanySettingsServer } from '@/lib/companySettingsServer';

const iconVersion = '20260715-2';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const company = await getCompanySettingsServer();
  return {
    name: company.nome_fantasia,
    short_name: company.nome_fantasia,
    description: company.seo_descricao || company.descricao_curta_loja || company.descricao_empresa || '',
    start_url: '/',
    display: 'standalone',
    background_color: company.cor_fundo || '#FFFFFF',
    theme_color: company.cor_primaria || '#6B21A8',
    icons: [
      {
        src: `/icon-192x192.png?v=${iconVersion}`,
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: `/icon-512x512.png?v=${iconVersion}`,
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
