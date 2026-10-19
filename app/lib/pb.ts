import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PocketBase, { AsyncAuthStore, ClientResponseError, RecordModel } from 'pocketbase';

const SERVER_KEY = 'lf_server';
const AUTH_KEY = 'lf_auth';

export let pb: PocketBase;

// Where the school's server is. In order: dev override in app/.env, the site the web app
// was loaded from (the server hosts it), or the address saved on this phone.
export async function initServer(): Promise<boolean> {
  const url = process.env.EXPO_PUBLIC_SERVER_URL
    || (Platform.OS === 'web' ? window.location.origin : await AsyncStorage.getItem(SERVER_KEY));
  if (!url) return false;
  pb = new PocketBase(url, new AsyncAuthStore({
    save: (s) => AsyncStorage.setItem(AUTH_KEY, s),
    clear: () => AsyncStorage.removeItem(AUTH_KEY),
    initial: (await AsyncStorage.getItem(AUTH_KEY)) ?? undefined,
  }));
  pb.autoCancellation(false); // several screens load in parallel
  return true;
}

// Phones: save a school server address after checking it answers. Accepts "10.0.0.5" or a full URL.
export async function saveServer(input: string) {
  let url = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(url)) url = `http://${url}`;
  if (!/:\d+$/.test(url) && url.startsWith('http://')) url += ':8090';
  const res = await fetch(`${url}/api/lf/info`).catch(() => null);
  if (!res?.ok) throw new Error(`Couldn't reach a Lost & Found server at ${url}. Check the address and that you're on the school Wi-Fi.`);
  await AsyncStorage.multiRemove([AUTH_KEY]);
  await AsyncStorage.setItem(SERVER_KEY, url);
}

export async function forgetServer() {
  await AsyncStorage.multiRemove([SERVER_KEY, AUTH_KEY]);
}

export function errMsg(e: unknown): string {
  if (e instanceof ClientResponseError) {
    if (e.status === 0) return "Can't reach the school server. Check you're on the school network.";
    const fields = Object.entries(e.response?.data ?? {}) as [string, { message?: string }][];
    if (fields.length) return fields.map(([k, v]) => `${k}: ${v.message}`).join('\n');
    return e.response?.message || e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

export const CATEGORIES = ['Clothing', 'Water bottle', 'Electronics', 'Calculator', 'Book', 'Bag', 'Keys', 'Jewelry', 'Sports gear', 'Other'];

export type Role = 'member' | 'staff' | 'admin';

export type SchoolInfo = { schoolName: string; emailDomain: string; needsSetup: boolean; address: string };

export type Item = {
  id: string; collectionId: string; photo: string; category: string; color: string; description: string;
  location_found: string; is_valuable: boolean; status: string; created: string;
};

export type Report = RecordModel & { category: string; color: string; description: string; date_lost: string; status: string };

export type Claim = RecordModel & {
  verification_answer: string; status: string; created: string;
  expand?: { item?: Item; user?: { email: string } };
};

export const photoUrl = (i: Item, thumb = '200x200') => (i.photo ? pb.files.getURL(i, i.photo, { thumb }) : null);
