/** @type {import('next').NextConfig} */
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/kdhdtdwayqdbkxbbpawm\.supabase\.co\/storage\/v1\/(?:object\/public|render\/image\/public)\//i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'viva-leve-supabase-images-v2',
          cacheableResponse: { statuses: [0, 200] },
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 365 * 24 * 60 * 60,
            purgeOnQuotaError: true,
          },
        },
      },
    ],
  },
});

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'kdhdtdwayqdbkxbbpawm.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },
};

module.exports = withPWA(nextConfig);
