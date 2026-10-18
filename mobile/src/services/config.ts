import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const STORAGE_KEY_SERVER_URL = '@abgc_server_url';
const DEFAULT_PORT = 3001;

export const PRODUCTION_SERVER_URL =
  'https://anythingbutamotioncontroller.onrender.com';

/**
 * Extracts the LAN IP from the Expo development server host URI.
 * In Expo Go or development clients, hostUri is formatted as "192.168.x.x:8081".
 */
export function detectLanHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as unknown as { manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } } })
      ?.manifest2?.extra?.expoGo?.debuggerHost;

  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return host;
    }
  }
  return null;
}

export function getDefaultServerUrl(): string {
  // 1. Environment variable if provided
  const envUrl =
    process.env.EXPO_PUBLIC_SERVER_URL ||
    process.env.EXPO_PUBLIC_BACKEND_URL ||
    (Constants.expoConfig?.extra?.serverUrl as string);
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  // 2. Default to deployed production Render backend
  return PRODUCTION_SERVER_URL;
}

export async function getStoredServerUrl(): Promise<string> {
  // Explicit environment variable or expoConfig extra takes precedence over stale cached values in storage
  const envUrl =
    process.env.EXPO_PUBLIC_SERVER_URL ||
    process.env.EXPO_PUBLIC_BACKEND_URL ||
    (Constants.expoConfig?.extra?.serverUrl as string);
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY_SERVER_URL);
    if (saved && saved.trim()) {
      const clean = saved.trim().replace(/\/+$/, '');
      // On real devices, a saved localhost URL is never reachable; fallback to default
      if (!isLocalhostAddress(clean)) {
        return clean;
      }
    }
  } catch (err) {
    console.warn('Failed to load server URL from AsyncStorage:', err);
  }
  return getDefaultServerUrl();
}

export async function saveServerUrl(url: string): Promise<string> {
  let formatted = url.trim();
  if (!formatted.startsWith('http://') && !formatted.startsWith('https://')) {
    const isDomain =
      !isLocalhostAddress(formatted) &&
      !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(formatted);
    formatted = isDomain ? `https://${formatted}` : `http://${formatted}`;
  }
  // Strip trailing slash
  formatted = formatted.replace(/\/+$/, '');

  try {
    await AsyncStorage.setItem(STORAGE_KEY_SERVER_URL, formatted);
  } catch (err) {
    console.warn('Failed to save server URL to AsyncStorage:', err);
  }
  return formatted;
}

export async function resetServerUrl(): Promise<string> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY_SERVER_URL);
  } catch (err) {
    console.warn('Failed to reset server URL in AsyncStorage:', err);
  }
  return getDefaultServerUrl();
}

export function isLocalhostAddress(url: string): boolean {
  try {
    return (
      url.includes('localhost') ||
      url.includes('127.0.0.1') ||
      url.includes('::1')
    );
  } catch {
    return false;
  }
}
