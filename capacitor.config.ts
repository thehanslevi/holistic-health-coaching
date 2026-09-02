import type { CapacitorConfig } from "@capacitor/cli";

// Volt's iOS shell. The web app is NOT bundled — the shell loads the deployed
// Next app from Vercel, so every deploy is instantly the native app's UI and
// the API routes keep working. What the shell adds is what a PWA can't have:
// HealthKit (background delivery of sleep/HRV/RHR/steps and Watch workouts)
// and native push. See docs/native-shell.md.
const config: CapacitorConfig = {
  appId: "com.hrl.volt",
  appName: "Volt",
  // Required by the CLI even in remote mode; holds a one-line offline fallback.
  webDir: "native/www",
  server: {
    url: "https://holistic-health-coaching.vercel.app",
    cleartext: false,
  },
  ios: {
    contentInset: "automatic",
    backgroundColor: "#0a0a0a",
    scheme: "Volt",
  },
};

export default config;
