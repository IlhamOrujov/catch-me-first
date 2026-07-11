// ============================================================================
//  CATCH ME FIRST — hotspots.js
//  The named places in the apartment Alice knows about and lives around.
//  Each: { id, label, pos:[x,y,z], rot, radius, actions:[...] }
//  Positions are sensible defaults for the fitted apartment; tune them live with
//  the in-game Hotspot Editor (Admin → World, or the 🧭 dev overlay).
// ============================================================================

// Positioned from the actual apartment layout (bedroom = -z/+x half, living+kitchen
// = +z half, bathroom/corridor = -x middle). Fine-tune exact spots with the 🧭 editor.
export const DEFAULT_HOTSPOTS = [
  { id: "aliceSpawn",   label: "Alice's spot",  pos: [0.0, 0, 2.4],   rot: Math.PI,      radius: 0.5, actions: ["idle", "stretch", "think"] },
  { id: "playerSpawn",  label: "Player spawn",  pos: [-2.4, 0, 1.4],  rot: 0,            radius: 0.6, actions: [] },
  { id: "bed",          label: "Bed",           pos: [1.7, 0, -2.4],  rot: -Math.PI / 2, radius: 0.9, actions: ["sleep", "nap", "relax", "read", "daydream", "lie_down"] },
  { id: "sofa",         label: "Sofa",          pos: [1.8, 0, 2.9],   rot: Math.PI,      radius: 0.9, actions: ["sit", "relax", "watch_tv", "read", "scroll_phone", "daydream"] },
  { id: "kitchen",      label: "Kitchen",       pos: [-2.8, 0, 4.2],  rot: -Math.PI / 2, radius: 0.9, actions: ["cook", "make_coffee", "make_tea", "clean", "snack", "bake"] },
  { id: "fridge",       label: "Fridge",        pos: [-3.3, 0, 4.9],  rot: -Math.PI / 2, radius: 0.6, actions: ["get_food", "get_drink", "snack", "peek_inside"] },
  { id: "desk",         label: "Desk",          pos: [0.6, 0, -4.2],  rot: 0,            radius: 0.7, actions: ["study", "work", "draw", "write", "think", "browse"] },
  { id: "wardrobe",     label: "Wardrobe",      pos: [3.1, 0, -1.2],  rot: -Math.PI / 2, radius: 0.7, actions: ["change_outfit", "tidy", "pick_clothes"] },
  { id: "bathroomDoor", label: "Bathroom",      pos: [-2.4, 0, -0.6], rot: -Math.PI / 2, radius: 0.6, actions: ["freshen_up", "brush_hair"] },
  { id: "window",       label: "Window",        pos: [0.2, 0, 5.3],   rot: Math.PI,      radius: 0.8, actions: ["gaze_outside", "daydream", "stretch", "water_plants"] },
  { id: "diningTable",  label: "Dining table",  pos: [-0.6, 0, 3.4],  rot: 0,            radius: 0.9, actions: ["eat", "have_tea", "study", "chat", "set_table"] },
  { id: "entranceDoor", label: "Front door",    pos: [-3.3, 0, 1.2],  rot: Math.PI / 2,  radius: 0.6, actions: ["leave", "check_mail", "greet"] },
  { id: "bookshelf",    label: "Bookshelf",     pos: [3.2, 0, 3.0],   rot: -Math.PI / 2, radius: 0.6, actions: ["pick_book", "read", "browse"] },
  { id: "mirror",       label: "Mirror",        pos: [3.0, 0, -3.4],  rot: -Math.PI / 2, radius: 0.6, actions: ["check_look", "pose", "fix_hair"] },
  { id: "balcony",      label: "Balcony",       pos: [2.4, 0, 5.2],   rot: Math.PI,      radius: 0.8, actions: ["fresh_air", "gaze_outside", "stretch"] },
  { id: "roomCenter",   label: "Living room",   pos: [-1.0, 0, 2.6],  rot: 0,            radius: 0.6, actions: ["dance", "stretch", "twirl", "idle", "think"] },
];

export function getHotspots(State) {
  const hs = State.settings.hotspots;
  return (hs && hs.length) ? hs : DEFAULT_HOTSPOTS;
}

export function hotspotById(State, id) {
  return getHotspots(State).find((h) => h.id === id) || null;
}

// every distinct action across all hotspots (for the LLM tool enum + docs)
export function allActions(State) {
  const set = new Set();
  getHotspots(State).forEach((h) => (h.actions || []).forEach((a) => set.add(a)));
  return [...set];
}
