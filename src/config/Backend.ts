// Set the production URL to the new Voroa HTTPS URL before building a release AAB.
const PRODUCTION_BACKEND_URL = '';

// Android emulator/USB device: run `adb reverse tcp:3000 tcp:3000` first.
// iOS Simulator can reach this localhost address directly.
export const BACKEND_BASE_URL = __DEV__
  ? 'http://127.0.0.1:3000'
  : PRODUCTION_BACKEND_URL;

export function backendUrl(path: string): string {
  const isLocalDevelopment = __DEV__ && /^http:\/\/(127\.0\.0\.1|localhost|10\.0\.2\.2):\d+$/.test(BACKEND_BASE_URL);
  if (!BACKEND_BASE_URL.startsWith('https://') && !isLocalDevelopment) {
    throw new Error('Set PRODUCTION_BACKEND_URL to the deployed Voroa HTTPS URL');
  }
  return `${BACKEND_BASE_URL.replace(/\/$/, '')}${path}`;
}
