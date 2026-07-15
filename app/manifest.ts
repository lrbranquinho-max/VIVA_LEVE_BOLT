import type { MetadataRoute } from 'next';

const iconVersion = '20260715-2';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Viva Leve',
    short_name: 'Viva Leve',
    description: 'Comida saudavel e rastreamento de dieta.',
    start_url: '/',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: '#6B21A8',
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
