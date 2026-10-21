import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.littlequest.app',
  appName: '小小任务',
  webDir: 'dist',
  android: { allowMixedContent: true },
};

export default config;
