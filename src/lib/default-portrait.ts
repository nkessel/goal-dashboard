/** The same 8 built-in portraits seeded into avatar_library (migration
 * 0009) — kept here too as a zero-network fallback so a profile always has
 * *some* avatar to show, even one that's never picked or generated one yet.
 * Deterministic by profile id, matching the pattern used for board tiles
 * (see creaturePortraitFor in BoardGrid.tsx) so a given user always lands
 * on the same default rather than a different one on every render. */
const PRESET_PORTRAITS = [
  "icon-dragon.jpg",
  "icon-goblin.jpg",
  "icon-sorcerer.jpg",
  "icon-boar.jpg",
  "icon-golem.jpg",
  "icon-venomroot.jpg",
  "icon-bat.jpg",
  "avatar-ranger.jpg",
];

export function defaultPortraitFor(profileId: string) {
  let hash = 0;
  for (let i = 0; i < profileId.length; i++) hash = (hash * 31 + profileId.charCodeAt(i)) >>> 0;
  return `/design/${PRESET_PORTRAITS[hash % PRESET_PORTRAITS.length]}`;
}
