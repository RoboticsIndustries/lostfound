/// <reference path="../pb_data/types.d.ts" />

// ---------- School info & first-time setup ----------

// Public: what the sign-in screen needs.
routerAdd("GET", "/api/lf/info", (e) => {
  const lf = require(`${__hooks}/lf.js`);
  const s = lf.settings(e.app);
  return e.json(200, {
    schoolName: s.getString("school_name"),
    emailDomain: s.getString("email_domain"),
    needsSetup: !s.getBool("setup_complete"),
    address: $os.getenv("LF_ADDRESS"), // set by start.sh / start.ps1: the address to share on the network
  });
});

// Creates the school and its first admin. Only works once, and only from the server computer.
routerAdd("POST", "/api/lf/setup", (e) => {
  const lf = require(`${__hooks}/lf.js`);
  const s = lf.settings(e.app);
  if (s.getBool("setup_complete")) throw new BadRequestError("This school is already set up.");
  if (!lf.isLocal(e)) {
    throw new ForbiddenError("Finish setup on the server computer itself: open http://localhost:8090 there.");
  }

  const b = e.requestInfo().body;
  const schoolName = String(b.schoolName || "").trim();
  const emailDomain = String(b.emailDomain || "").trim().toLowerCase().replace(/^@/, "");
  const email = String(b.email || "").trim().toLowerCase();
  const password = String(b.password || "");
  if (!schoolName) throw new BadRequestError("Enter your school or team name.");
  if (password.length < 8) throw new BadRequestError("Password must be at least 8 characters.");

  e.app.runInTransaction((txApp) => {
    const admin = new Record(txApp.findCollectionByNameOrId("users"));
    admin.set("email", email);
    admin.setPassword(password);
    admin.set("role", "admin");
    admin.set("verified", true);
    admin.set("emailVisibility", true);
    txApp.save(admin);

    // The admin's login also opens the PocketBase dashboard (backups, raw data).
    const su = txApp.findFirstRecordByFilter("_superusers", "id != ''");
    su.set("email", email);
    su.setPassword(password);
    txApp.save(su);

    const st = txApp.findRecordById("lf_settings", s.id);
    st.set("school_name", schoolName);
    st.set("email_domain", emailDomain);
    st.set("join_code", lf.newCode());
    st.set("staff_code", lf.newCode());
    st.set("setup_complete", true);
    txApp.save(st);
  });
  return e.json(200, { ok: true });
});

// Admin: view and change school settings and invite codes.
routerAdd("GET", "/api/lf/school", (e) => {
  const lf = require(`${__hooks}/lf.js`);
  if (lf.role(e.auth) !== "admin") throw new ForbiddenError("Admins only.");
  const s = lf.settings(e.app);
  return e.json(200, {
    schoolName: s.getString("school_name"),
    emailDomain: s.getString("email_domain"),
    joinCode: s.getString("join_code"),
    staffCode: s.getString("staff_code"),
  });
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/lf/school", (e) => {
  const lf = require(`${__hooks}/lf.js`);
  if (lf.role(e.auth) !== "admin") throw new ForbiddenError("Admins only.");
  const b = e.requestInfo().body;
  const s = lf.settings(e.app);
  if (b.schoolName !== undefined) s.set("school_name", String(b.schoolName).trim());
  if (b.emailDomain !== undefined) s.set("email_domain", String(b.emailDomain).trim().toLowerCase().replace(/^@/, ""));
  if (b.newJoinCode) s.set("join_code", lf.newCode());
  if (b.newStaffCode) s.set("staff_code", lf.newCode());
  e.app.save(s);
  return e.json(200, { ok: true });
}, $apis.requireAuth("users"));

// ---------- Sign-up: school email domain or invite code ----------

onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  const lf = require(`${__hooks}/lf.js`);
  const s = lf.settings(e.app);
  if (!s.getBool("setup_complete")) throw new BadRequestError("This school hasn't been set up yet.");

  const code = String(e.requestInfo().body.inviteCode || "").trim().toUpperCase();
  const domain = s.getString("email_domain");
  const email = e.record.email().toLowerCase();

  let role = "";
  if (code && code === s.getString("staff_code")) role = "staff";
  else if (code && code === s.getString("join_code")) role = "member";
  else if (!code && domain && email.endsWith("@" + domain)) role = "member";

  if (!role) {
    throw new BadRequestError(
      code ? "That invite code isn't right. Check it with your school admin."
        : domain ? `Use your @${domain} email address, or enter an invite code.`
        : "Enter the invite code from your school admin."
    );
  }
  e.record.set("role", role);
  e.record.set("emailVisibility", true); // lets staff see who made a claim
  e.next();
}, "users");

// ---------- Items ----------

// Browse and matching for everyone signed in. Hides photos/descriptions of valuables from students.
// Query: category, color, since (YYYY-MM-DD) — all optional.
routerAdd("GET", "/api/lf/items", (e) => {
  const lf = require(`${__hooks}/lf.js`);
  const q = e.requestInfo().query;
  let filter = "status = 'found'";
  const params = {};
  if (q.category) { filter += " && category = {:category}"; params.category = q.category; }
  if (q.color) { filter += " && (color = '' || color ~ {:color})"; params.color = q.color; }
  if (q.since) { filter += " && created >= {:since}"; params.since = q.since; }
  const staff = lf.isStaff(e.auth);
  const records = e.app.findRecordsByFilter("items", filter, "-created", 200, 0, params);
  return e.json(200, records.map((r) => lf.publicItem(r, staff)));
}, $apis.requireAuth("users"));

onRecordCreateRequest((e) => {
  e.record.set("logged_by", e.auth?.id || "");
  e.record.set("status", "found");
  e.next();
}, "items");

// ---------- Reports & claims ----------

onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) e.record.set("user", e.auth.id);
  e.record.set("status", "open");
  e.next();
}, "reports");

onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) e.record.set("user", e.auth.id);
  const item = e.app.findRecordById("items", e.record.getString("item"));
  if (item.getString("status") !== "found") throw new BadRequestError("This item has already been returned.");
  const existing = e.app.findRecordsByFilter(
    "claims", "item = {:item} && user = {:user} && status = 'pending'", "", 1, 0,
    { item: item.id, user: e.record.getString("user") },
  );
  if (existing.length) throw new BadRequestError("You've already claimed this item. Staff will be in touch.");
  e.record.set("status", "pending");
  e.next();
}, "claims");

onRecordUpdateRequest((e) => {
  if (e.auth) e.record.set("reviewed_by", e.auth.id);
  e.next();
}, "claims");

// Approving a claim marks the item as returned and closes the other pending claims on it.
onRecordAfterUpdateSuccess((e) => {
  if (e.record.getString("status") !== "approved") return e.next();
  const item = e.app.findRecordById("items", e.record.getString("item"));
  item.set("status", "claimed");
  e.app.save(item);
  const others = e.app.findRecordsByFilter(
    "claims", "item = {:item} && status = 'pending' && id != {:id}", "", 100, 0,
    { item: item.id, id: e.record.id },
  );
  for (const c of others) {
    c.set("status", "rejected");
    e.app.save(c);
  }
  e.next();
}, "claims");
