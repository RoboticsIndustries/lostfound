# Lost & Found — school MVP

## 1. Database (Supabase)
1. Create a free project at supabase.com.
2. SQL Editor → paste `supabase/schema.sql` → Run.
3. Add your school and make yourself staff (after signing up in the app once):
```sql
insert into schools (name) values ('Avon Grove Charter School') returning id;
insert into profiles (id, school_id, role)
  select id, '<SCHOOL_ID>', 'admin' from auth.users where email = 'you@example.com'
  on conflict (id) do update set school_id = excluded.school_id, role = excluded.role;
```
New students need a `profiles` row with the school_id (add a signup trigger or an invite code next).

## 2. App (Expo)
```bash
cd app
npx create-expo-app@latest . --template blank-typescript   # say yes to keep existing files
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill expo-image-picker
npm i base64-arraybuffer
echo "EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co" > .env
echo "EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key" >> .env
npx expo start
```
Scan the QR with Expo Go on your phone.

## What's built
- Email auth, roles (member / staff / admin), per-school data isolation via RLS
- Staff: photo → category → location → save (valuables auto-hidden publicly)
- Everyone: browse/filter found items, file a lost report, instant matching, claim with secret detail

## Next steps
- Signup trigger / school invite codes
- Staff claim-approval screen + "picked up" button
- Auto-expiry job (pg_cron) marking items `donated` after `retention_days`
- Push notifications when a new item matches an open report
- Image auto-tagging + CLIP similarity (pgvector)
- QR owner tags
