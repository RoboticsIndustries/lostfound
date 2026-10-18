# Lost & Found

A digital lost-and-found for schools. It replaces the cardboard box in the front office with a searchable list.

Staff photograph and log items as they're handed in. Students browse what's been found, or report what they lost and get matched to likely items. To claim an item, the owner describes a detail only they would know, so staff can check before handing it back.

It runs on iPhone, Android and the web from one codebase, built with **Expo (React Native)** + **Supabase** (Postgres, Auth, Storage).

## How it works
```
Staff log a found item  ──►  Item appears in Browse for everyone at that school
                                          │
Student reports a lost item ──► Matching ─┤
                                          ▼
                     Student taps "This is mine" and describes a private detail
                                          │
                                          ▼
                     Staff check the claim and return the item
```

## Features
- **Accounts and roles:** email sign-in. Each user is a `member` (student), `staff` or `admin`
- **One school per account:** users only see their own school's items, enforced in the database with Postgres Row Level Security
- **Log item** (staff): photo, category, color, description and where it was found
- **Valuables:** staff can mark an item as valuable, which hides its photo and description in the app so only the real owner can describe it
- **Browse:** every found item at your school, newest first, filterable by category
- **I lost something:** file a report and instantly see matching items
- **Claim:** the owner gives a detail only they would know, and staff verify it

## Using the app

### Students (`member`)
1. **Sign in** with your school email. First time? Tap **Create account**, then ask your school admin to link your account to the school. Until they do, you'll only see an empty Browse tab.
2. **Browse:** scroll the found items or tap a category chip (Clothing, Water bottle, Electronics…) to filter. Pull down to refresh. Items with a 🔒 are valuables, so their photo and details are hidden.
3. **I lost something:** pick a category, optionally enter a color and description, and tap **Report & find matches**. Matching items appear below the button (see [How matching works](#how-matching-works)).
4. **Claim an item:** tap **This is mine** on an item and describe something only the owner would know (a sticker, what's written inside, the lock screen). Staff review it before handing the item over.
   - On **iPhone** this opens a text box in the app.
   - On **Android and web** the app asks you to claim it at the front office instead.

### Staff (`staff`)
Staff see everything students see, plus a **Log item** tab.
1. Tap **📷 Tap to take photo**. If camera access is denied, the app opens the photo library instead.
2. Pick a **category** (required), then add a color, a short description and where it was found (e.g. "Gym").
3. Turn on **Valuable** for phones, wallets, jewelry and similar items. Students then see "Valuable item — describe it to claim" instead of the photo and description.
4. Tap **Save item**. It appears in Browse straight away with today's date.

Claims are stored in the `claims` table. There's no review screen in the app yet, so check them in Supabase (**Table Editor → claims**) and set `status` to `approved` or `rejected`.

### Admins (`admin`)
Admins have the same screens as staff. In-app account management doesn't exist yet, so admins link users to the school with SQL (see [Adding users](#5-adding-users)).

## How matching works
When a student files a report, the app looks for found items at their school that:
- are still unclaimed (`status = found`)
- are in the **same category**
- have the **same color** (ignoring capitals). If either side left color blank, color is ignored
- were found **on or up to 14 days after** the day the item was lost

> **Current limitation:** the app records the day the report is filed as the day the item was lost, and it only checks for matches once, at that moment. In practice this means only items logged **on the same day** are matched. If nothing matches, use the **Browse** tab instead. A "When did you lose it?" field and ongoing matching are planned.

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

### 5. Adding users
Every new user creates their own account in the app first. Then link them to the school in the SQL Editor (new, empty query), using `member` for students or `staff` for teachers and office staff:
```sql
insert into profiles (id, school_id, role)
select u.id, (select id from schools limit 1), 'member'   -- or 'staff'
from auth.users u
where u.email = 'student@example.com'
on conflict (id) do update set school_id = excluded.school_id, role = excluded.role;
```
This assumes one school in the project. With several schools, replace `(select id from schools limit 1)` with `(select id from schools where name = 'Your School Name')`. The user needs to sign out and back in for the change to take effect.

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
- [ ] "When did you lose it?" field, and re-run matching when new items are logged
- [ ] In-app claims on Android and web
- [ ] Staff screen to approve claims and mark items picked up
- [ ] Auto-expiry: mark items `donated` after the school's retention period (pg_cron)
- [ ] Signup trigger / school invite codes so new users get a profile automatically
- [ ] Push notifications when a new item matches an open report
- [ ] AI photo auto-tagging + image-similarity matching (pgvector)
- [ ] QR owner tags for valuables
- [ ] Impact stats: items returned, pounds donated

## Author
Aryan Mitra ([@RoboticsIndustries](https://github.com/RoboticsIndustries))
