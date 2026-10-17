# Lost & Found

A digital lost-and-found for schools. Staff photograph and log found items, students search for what they lost, and the app matches lost reports to found items automatically. Unclaimed items can be donated instead of thrown away.

Built with **Expo (React Native)** + **Supabase** (Postgres, Auth, Storage).

## Features
- Email sign-in with roles: `member`, `staff`, `admin`
- Each school's data is isolated with Postgres Row Level Security
- **Log item** (staff): photo, category, color, location. Valuables can be marked so their photo and details are hidden publicly
- **Browse:** filter found items by category
- **I lost something:** file a report and get instant matches (same category and color, found within 14 days of the loss)
- **Claim:** the owner describes a detail only they would know, and staff verify it

## Project structure
```
lostfound/
├── app/                 Expo app
│   ├── App.tsx          All screens
│   ├── lib/supabase.ts  Supabase client + types
│   └── .env             Your keys (NOT committed)
└── supabase/
    └── schema.sql       Tables, security policies, matching function
```

## Setup

### Prerequisites
- [Node.js](https://nodejs.org) LTS
- A free [Supabase](https://supabase.com) account
- macOS: if git asks you to accept the Xcode license, run `sudo xcodebuild -license accept`

### 1. Database
1. In Supabase, create an organization (Free plan), then a new project.
2. Open **SQL Editor**. The blank tab is already a new query. Paste in all of `supabase/schema.sql` and click **Run**.
3. Go to **Authentication → Sign In / Providers → Email** and turn **off** "Confirm email" (for testing).

### 2. Keys
In `app/`, create a `.env` file:
```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```
- URL: **Project Settings → Data API**. Use only `https://xxxx.supabase.co`, **with no `/rest/v1/` on the end** (that suffix causes 404 errors on sign-up).
- Key: **Project Settings → API Keys**. Use the *publishable* key or the legacy *anon* key. **Never** use the secret or service_role key.

### 3. Run
```bash
cd app
npm install
npx expo install --fix
```
**Web (no phone needed):**
```bash
npx expo install react-dom react-native-web @expo/metro-runtime
npx expo start --web
```
**Phone:** run `npx expo start` and scan the QR code with the Expo Go app (add `--tunnel` if it hangs on school Wi-Fi).

> Changes to `.env` only load after you restart the server: `Ctrl+C`, then `npx expo start --web --clear`.

### 4. Make yourself admin
Create an account in the app first. Then, in the Supabase SQL Editor, open a **new, empty** query (don't re-run `schema.sql`), paste this with your email, and click **Run**:
```sql
insert into schools (name)
select 'Your School Name'
where not exists (select 1 from schools);

insert into profiles (id, school_id, role)
select u.id, (select id from schools limit 1), 'admin'
from auth.users u
where u.email = 'you@example.com'
on conflict (id) do update set school_id = excluded.school_id, role = excluded.role;
```
It should report **1 row affected** (0 means the email doesn't match **Authentication → Users**). This is safe to run more than once.

Check it worked:
```sql
select p.role, s.name, u.email
from profiles p
join schools s on s.id = p.school_id
join auth.users u on u.id = p.id;
```
Then sign out and back in to see the **Log item** and **I lost something** tabs.

## Troubleshooting
| Symptom | Fix |
|---|---|
| Buttons seem to do nothing on web | Errors now show as browser pop-ups. If nothing appears, open the browser console (Cmd+Option+J) |
| `404` on `/rest/v1/auth/v1/signup` | Remove `/rest/v1/` from the URL in `.env` and restart the server |
| `422` on sign-up | The account already exists (use Sign in) or the password is under 6 characters |
| Only the Browse tab appears | Your profile row is missing. Run the admin SQL above |
| "I lost something" says the account isn't linked to a school | Run the admin SQL above, then sign out and back in |
| `relation "schools" already exists` | You re-ran `schema.sql`. The tables are already there, so open a new empty query and run only the snippet you need |
| `Backend error! Retry your query` in Supabase | A temporary Supabase issue. Refresh and retry, check for a "Project paused" banner, or see status.supabase.com |

## Roadmap
- [ ] Staff screen to approve claims and mark items picked up
- [ ] Auto-expiry: mark items `donated` after the school's retention period (pg_cron)
- [ ] Signup trigger / school invite codes so new users get a profile automatically
- [ ] Push notifications when a new item matches an open report
- [ ] AI photo auto-tagging + image-similarity matching (pgvector)
- [ ] QR owner tags for valuables
- [ ] Impact stats: items returned, pounds donated

## Author
Aryan Mitra ([@RoboticsIndustries](https://github.com/RoboticsIndustries))
