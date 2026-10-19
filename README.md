# Lost & Found

A digital lost-and-found for schools and teams. It replaces the cardboard box in the front office with a searchable list.

Staff photograph and log items as they're handed in. Students browse what's been found, or report what they lost and get matched to likely items. To claim an item, the owner describes a detail only they would know, so staff can check before handing it back.

**Private by design.** Each school runs its own copy on one of its own computers. There are no cloud accounts, no monthly fees, and no data leaves the building. Installing takes one download and a double-click.

Built with **Expo (React Native)** for the app and **[PocketBase](https://pocketbase.io)** (a single-file server with a built-in database) for the back end.

## How it works
```
Staff log a found item  ──►  Item appears in Browse for everyone at the school
                                          │
Student reports a lost item ──► Matching ─┤
                                          ▼
                     Student taps "This is mine" and describes a private detail
                                          │
                                          ▼
                     Staff approve the claim and hand the item back
```
One computer at the school runs the server. Everyone else opens it in a web browser on the school network, on phones, Chromebooks or PCs. Nothing needs to be installed on their devices.

## Features
- **Private:** each school's data is stored only on its own server computer
- **Easy joining:** anyone with a school email address (e.g. `@myschool.org`) can sign up as a student. Everyone else, and all staff, join with an invite code
- **Roles:** students, staff and admins, each seeing only the screens they need
- **Log item** (staff): photo, category, color, description and where it was found
- **Valuables:** staff can mark an item as valuable. Students then see only "Valuable item" and its category, not the photo or description, so only the real owner can describe it
- **Browse:** every unclaimed item, newest first, filterable by category
- **I lost something:** report a loss and see matching items. Matches update as new items are logged
- **Claims:** the owner describes a private detail; staff approve or reject it from the **Claims** tab
- **School settings** (admin): invite codes, email domain and user roles, all in the app

## Install for your school

### What you need
- **A computer that stays on during the school day.** Windows 10/11, macOS, Linux or a Raspberry Pi all work. An old office PC is fine.
- **The computer must be on the school network** that students' and staff devices use.
- About 50 MB of disk space, plus space for photos (roughly 200 KB each).

### Steps
1. **Download** `lostfound-server.zip` from this project's [Releases](../../releases) page and unzip it anywhere, e.g. `Documents\lostfound`.
2. **Start it:**
   - **Windows:** double-click `start.bat`. If Windows Firewall asks, allow access on **private networks**.
   - **Mac / Linux / Raspberry Pi:** open a terminal in the folder and run `./start.sh`.

   The first start downloads PocketBase (about 15 MB) and opens the setup page in your browser. If it doesn't open, go to `http://localhost:8090` **on that same computer**.
3. **Set up your school:** enter the school name and, optionally, the school's email domain, then create your admin account. Setup only works from the server computer itself, so nobody else on the network can take over a new install.
4. **Invite people:** open the **School** tab. It shows:
   - **the address to share**, e.g. `http://192.168.1.20:8090`
   - **a student code**
   - **a staff code** (give it only to staff)

   Put the address and student code on a poster or in a class announcement.

Keep the window open: closing it stops the server. To start Lost & Found automatically, add `start.bat` to Windows **Startup** (press Win+R, type `shell:startup`, and put a shortcut there), or add `start.sh` to your Mac's **Login Items**. Also turn off sleep on that computer.

### On phones
Open the shared address in the phone's browser while on the school Wi-Fi, then use **Share → Add to Home Screen** (iPhone) or **⋮ → Add to Home screen** (Android). It then opens like an app.

## Using the app

### Students
1. **Create an account:** open the school's address, tap **Create account**, and use your school email. No school email? Enter the student code your school gave you.
2. **Browse:** scroll the found items, or tap a category (Clothing, Water bottle, Electronics…) to filter. Pull down to refresh. Items with a 🔒 are valuables, so their details are hidden.
3. **I lost something:** pick a category, add a color and description if you can, choose **when** you lost it, and tap **Report & find matches**. Your report stays on this tab and its matches refresh every time you open it. Tap **Got it back** to close the report.
4. **Claim an item:** tap **This is mine** and describe something only the owner would know (a sticker, a name inside, the lock screen). Staff check it before handing the item over.

### Staff
Sign up with the **staff code**, or ask an admin to make you staff. You get two extra tabs:
- **Log item:** tap **📷** to take a photo, pick a category (required), and add a color, description and where it was found. Turn on **Valuable** for phones, wallets, jewelry and similar items. Tap **Save item**.
- **Claims:** each pending claim shows the item, who claimed it, and their answer. **Approve & hand over** marks the item returned, removes it from Browse and rejects any other claims on it. **Reject** turns down that one claim.

### Admins
Admins see everything staff see, plus the **School** tab:
- **Invite codes:** tap **New code** if a code leaks. The old code stops working, but existing accounts keep working.
- **School name and email domain:** leave the domain blank to require codes for everyone.
- **People:** switch anyone between student, staff and admin.

The admin's email and password also open PocketBase's built-in dashboard at `/_/` (e.g. `http://localhost:8090/_/`). Use it for backups and for editing data directly.

## How matching works
A report matches unclaimed items that:
- are in the **same category**
- have a **matching color**: "blue" matches "Blue" and "dark blue". Items with no color recorded always match on color
- were logged **on or after** the day the item was lost ("Today", "Yesterday", "This week" or "Earlier", which looks back 30 days)

Matches are recalculated every time the student opens **I lost something**, so items logged later still show up.

## Privacy and security
- **Data stays on the server computer,** in the `pb_data` folder: accounts, items, photos, reports and claims. Nothing is sent to any outside service.
- **Only the school network can reach it.** Off-site devices can't connect unless you deliberately open it up (see below).
- **Passwords** are stored hashed (bcrypt). Every screen requires signing in, and each role can only see and change what it should. Students can't see other students' reports or claims.
- **Email domain sign-up isn't verified.** There's no email confirmation, so anyone on the school network could type a made-up `@myschool.org` address and join as a student. If that matters to you, leave the domain blank and use codes only.
- **Photo links:** anyone on the network who has a photo's exact link can view it. Links are random and photos of valuables are never shown to students, but don't log sensitive documents as photos.
- **Use from home (optional):** the safest option is [Tailscale](https://tailscale.com), a free private network between your devices. Avoid exposing the server to the public internet. If you must, run `bin/pocketbase serve yourdomain.com` with the same `--dir/--hooksDir/--migrationsDir/--publicDir` flags as the start script to get automatic HTTPS.

## Backups and updates
- **Back up:** stop the server and copy the `pb_data` folder somewhere safe. You can also use the dashboard (`/_/` → Settings → Backups) without stopping it.
- **Update:** stop the server, download the new release, and replace everything **except `pb_data`**. Changes to the database are applied automatically on the next start.
- **Move to another computer:** copy the whole folder, including `pb_data`.

## Troubleshooting
| Symptom | Fix |
|---|---|
| Phones can't open the address | Check they're on the same Wi-Fi as the server, the server window is still open, and Windows Firewall allows PocketBase on private networks. Some school networks block devices from talking to each other, so ask IT to allow port 8090 to the server computer |
| The address changed after a restart | The computer got a new IP address. Ask IT for a fixed (reserved) IP for it |
| "Finish setup on the server computer itself" | Do setup in a browser on the server computer at `http://localhost:8090` |
| "That invite code isn't right" | Check it on the School tab. Codes aren't case-sensitive, but a code stops working once an admin makes a new one |
| "Use your @… email address, or enter an invite code" | The email isn't on the school domain. Use the student code |
| Someone signed up as a student but should be staff | Admin → **School** → People → **staff**. They see the new tabs next time they open the app |
| Forgot the admin password | On the server, stop it and run `bin/pocketbase superuser upsert you@school.org NEWPASSWORD --dir pb_data`, then sign in to `/_/` and reset the user's password in the **users** collection |
| "pb_public has no web app" warning | You're running from a git checkout. Use the release zip, or build it with `scripts/package.sh` |

## Development

### Project structure
```
lostfound/
├── app/                       Expo app (web, iOS, Android)
│   ├── App.tsx                All screens
│   └── lib/pb.ts              Server connection, types, helpers
├── server/                    What schools run
│   ├── start.sh / start.bat   Downloads PocketBase on first run and starts it
│   ├── pb_migrations/         Database tables and access rules
│   ├── pb_hooks/              Setup, sign-up rules, browse/match API, claim approval
│   └── pb_public/             Built web app (generated, not committed)
└── scripts/package.sh         Builds the release zip
```

### Run locally
```bash
./server/start.sh                       # server on http://localhost:8090
cd app && npm install
EXPO_PUBLIC_SERVER_URL=http://localhost:8090 npx expo start --web
```
You can also put `EXPO_PUBLIC_SERVER_URL` in `app/.env`. For the phone apps, run `npx expo start` and scan the QR code with Expo Go. On first launch the app asks for the school's server address.

Server files in `pb_hooks/` reload automatically when you save them. To change the database, add a new file to `pb_migrations/` instead of editing the existing one, so schools that already have data upgrade cleanly.

### Make a release
```bash
./scripts/package.sh                    # → dist/lostfound-server.zip
```
Attach `dist/lostfound-server.zip` to a new GitHub Release. That zip is the only file a school needs.

## Roadmap
- [ ] Auto-expiry: mark items `donated` after a retention period
- [ ] QR code on the School tab for the join address
- [ ] Notifications when a new item matches an open report
- [ ] AI photo auto-tagging + image-similarity matching
- [ ] QR owner tags for valuables
- [ ] Impact stats: items returned, items donated

## Author
Aryan Mitra ([@RoboticsIndustries](https://github.com/RoboticsIndustries))
