/// <reference path="../pb_data/types.d.ts" />

// Lost & Found database: one school per server.
const STAFF = "(@request.auth.role = 'staff' || @request.auth.role = 'admin')";

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new SelectField({ name: "role", values: ["member", "staff", "admin"], maxSelect: 1 }));
  // Sign-up is gated by email domain / invite code in pb_hooks/main.pb.js
  users.createRule = "";
  users.listRule = `id = @request.auth.id || ${STAFF}`;
  users.viewRule = `id = @request.auth.id || ${STAFF}`;
  users.updateRule = "@request.auth.role = 'admin' || (id = @request.auth.id && @request.body.role:isset = false)";
  users.deleteRule = "@request.auth.role = 'admin'";
  app.save(users);

  // Single-row school settings. No API rules: only reachable through the /api/lf/* routes.
  const settings = new Collection({
    type: "base",
    name: "lf_settings",
    fields: [
      { name: "school_name", type: "text", max: 100 },
      { name: "email_domain", type: "text", max: 100 },
      { name: "join_code", type: "text", max: 20 },
      { name: "staff_code", type: "text", max: 20 },
      { name: "setup_complete", type: "bool" },
    ],
  });
  app.save(settings);
  app.save(new Record(settings));

  const items = new Collection({
    type: "base",
    name: "items",
    // Students browse through GET /api/lf/items, which hides details of valuables.
    listRule: STAFF,
    viewRule: STAFF,
    createRule: STAFF,
    updateRule: STAFF,
    deleteRule: STAFF,
    fields: [
      { name: "photo", type: "file", maxSelect: 1, maxSize: 10485760, mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"], thumbs: ["200x200", "800x0"] },
      { name: "category", type: "text", required: true, max: 50 },
      { name: "color", type: "text", max: 50 },
      { name: "description", type: "text", max: 500 },
      { name: "location_found", type: "text", max: 100 },
      { name: "is_valuable", type: "bool" },
      { name: "status", type: "select", values: ["found", "claimed", "donated"], maxSelect: 1 },
      { name: "logged_by", type: "relation", collectionId: users.id, maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_items_status_category ON items (status, category)"],
  });
  app.save(items);

  app.save(new Collection({
    type: "base",
    name: "reports",
    listRule: `user = @request.auth.id || ${STAFF}`,
    viewRule: `user = @request.auth.id || ${STAFF}`,
    createRule: "@request.auth.id != ''",
    updateRule: `user = @request.auth.id || ${STAFF}`,
    deleteRule: "user = @request.auth.id",
    fields: [
      { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { name: "category", type: "text", required: true, max: 50 },
      { name: "color", type: "text", max: 50 },
      { name: "description", type: "text", max: 500 },
      { name: "date_lost", type: "date" },
      { name: "status", type: "select", values: ["open", "closed"], maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true },
    ],
  }));

  app.save(new Collection({
    type: "base",
    name: "claims",
    listRule: `user = @request.auth.id || ${STAFF}`,
    viewRule: `user = @request.auth.id || ${STAFF}`,
    createRule: "@request.auth.id != ''",
    updateRule: STAFF,
    deleteRule: STAFF,
    fields: [
      { name: "item", type: "relation", collectionId: items.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { name: "verification_answer", type: "text", required: true, max: 500 },
      { name: "status", type: "select", values: ["pending", "approved", "rejected"], maxSelect: 1 },
      { name: "reviewed_by", type: "relation", collectionId: users.id, maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true },
    ],
  }));

  // Placeholder superuser so PocketBase doesn't prompt for one on first start.
  // /api/lf/setup gives it the school admin's email and password.
  const su = new Record(app.findCollectionByNameOrId("_superusers"));
  su.set("email", "setup@lostfound.invalid");
  su.set("password", $security.randomString(40));
  app.save(su);
}, (app) => {
  for (const name of ["claims", "reports", "items", "lf_settings"]) {
    app.delete(app.findCollectionByNameOrId(name));
  }
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("role");
  app.save(users);
});
