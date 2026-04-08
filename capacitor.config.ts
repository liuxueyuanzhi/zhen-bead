import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pixelbead.studio',
  appName: '珍豆你玩',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scrollEnabled: true,
  },
  server: {
    allowNavigation: [
      '*.upstash.io',
      '*.vercel.app',
      'pindou.danzaii.cn',
    ],
  },
};

export default config;
