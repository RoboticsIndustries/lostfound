import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Put these in app/.env:  EXPO_PUBLIC_SUPABASE_URL=...  EXPO_PUBLIC_SUPABASE_ANON_KEY=...
export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } }
);

export const CATEGORIES = ['Clothing', 'Water bottle', 'Electronics', 'Calculator', 'Book', 'Bag', 'Keys', 'Jewelry', 'Sports gear', 'Other'];

export type Item = {
  id: string; school_id: string; photo_url: string | null; category: string; color: string | null;
  description: string | null; location_found: string | null; date_found: string; status: string;
};
