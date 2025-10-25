import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.estacionamento.app',
  appName: 'estacionamento',
  // The webDir is the directory of your compiled web assets.
  // This project uses in-browser transpilation, so there is no build step.
  // For GitHub Pages, you typically serve the source files directly from the repository root.
  // This config is for native Capacitor builds. 'www' is a conventional name for the web directory.
  webDir: 'www',
  server: {
    androidScheme: 'https'
  }
};

export default config;
