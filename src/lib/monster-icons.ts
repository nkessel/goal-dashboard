// Curated "Monster Profile" set (Adventure theme, Priority #10) — fantasy
// enemies a task can be assigned so completing it reads as "defeating" it.
// Kept to a fixed, hand-picked list per the spec (15-20 icons); anything
// beyond this comes from the searchable emoji library fallback instead.
export const MONSTER_ICONS: { key: string; emoji: string; label: string }[] = [
  { key: "dragon", emoji: "🐉", label: "Dragon" },
  { key: "sorcerer", emoji: "🧙", label: "Evil Sorcerer" },
  { key: "goblin", emoji: "👺", label: "Goblin" },
  { key: "ogre", emoji: "👹", label: "Ogre" },
  { key: "ghost", emoji: "👻", label: "Spirit" },
  { key: "skull", emoji: "💀", label: "Skeleton" },
  { key: "zombie", emoji: "🧟", label: "Zombie" },
  { key: "vampire", emoji: "🧛", label: "Vampire" },
  { key: "demon", emoji: "😈", label: "Demon" },
  { key: "troll", emoji: "🧌", label: "Troll" },
  { key: "spider", emoji: "🕷️", label: "Giant Spider" },
  { key: "bat", emoji: "🦇", label: "Bat Swarm" },
  { key: "serpent", emoji: "🐍", label: "Serpent" },
  { key: "scorpion", emoji: "🦂", label: "Scorpion" },
  { key: "wolf", emoji: "🐺", label: "Dire Wolf" },
  { key: "kraken", emoji: "🐙", label: "Kraken" },
  { key: "wizard-hat", emoji: "🎩", label: "Mysterious Hat" },
  { key: "cursed-eye", emoji: "🧿", label: "Cursed Eye" },
];

export function findMonsterIcon(key: string | null | undefined) {
  return MONSTER_ICONS.find((m) => m.key === key);
}
