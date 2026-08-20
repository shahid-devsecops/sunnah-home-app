import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sunnahhome.app',
  appName: 'Sunnah Home',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
