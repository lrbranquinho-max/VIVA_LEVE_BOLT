import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.vivalevedf.app',
  appName: 'Viva Leve',
  webDir: 'public',
  server: {
    url: 'https://vivalevedf.com.br',
    cleartext: false,
    allowNavigation: ['vivalevedf.com.br', 'www.vivalevedf.com.br'],
  },
};

export default config;
