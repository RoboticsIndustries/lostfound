// Shared helpers for main.pb.js. PocketBase runs each hook in its own isolated
// context, so handlers load this file with require() instead of sharing globals.

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I

module.exports = {
  settings(app) {
    return app.findFirstRecordByFilter("lf_settings", "id != ''");
  },

  role(auth) {
    return auth && auth.collection().name === "users" ? auth.getString("role") : "";
  },

  isStaff(auth) {
    const r = module.exports.role(auth);
    return r === "staff" || r === "admin";
  },

  newCode() {
    return $security.randomStringWithAlphabet(8, CODE_ALPHABET);
  },

  // Requests from the server computer itself (used to guard first-time setup).
  isLocal(e) {
    const ip = e.remoteIP();
    return ip === "127.0.0.1" || ip === "::1";
  },

  // What the app shows for an item. Students don't see photos or descriptions of valuables.
  publicItem(r, staff) {
    const hidden = r.getBool("is_valuable") && !staff;
    return {
      id: r.id,
      collectionId: r.collection().id,
      category: r.getString("category"),
      color: r.getString("color"),
      description: hidden ? "" : r.getString("description"),
      photo: hidden ? "" : r.getString("photo"),
      location_found: r.getString("location_found"),
      is_valuable: r.getBool("is_valuable"),
      status: r.getString("status"),
      created: r.getString("created"),
    };
  },
};
