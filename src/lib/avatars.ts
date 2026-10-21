/** Immagini predefinite per chi non carica una fotografia (stessi valori del vincolo SQL). */
export const AVATARS = {
  gift: { emoji: "🎁", label: "Regalo", background: "from-red-700 to-red-900" },
  tree: { emoji: "🎄", label: "Albero", background: "from-emerald-700 to-emerald-950" },
  snowman: { emoji: "⛄", label: "Pupazzo di neve", background: "from-sky-600 to-sky-900" },
  reindeer: { emoji: "🦌", label: "Renna", background: "from-amber-700 to-amber-950" },
  star: { emoji: "⭐", label: "Stella", background: "from-yellow-600 to-amber-800" },
  elf: { emoji: "🧝", label: "Elfo", background: "from-green-700 to-green-950" },
  bell: { emoji: "🔔", label: "Campanella", background: "from-orange-600 to-red-800" },
  cookie: { emoji: "🍪", label: "Biscotto", background: "from-stone-600 to-stone-900" },
} as const;

export type AvatarKey = keyof typeof AVATARS;

export const AVATAR_KEYS = Object.keys(AVATARS) as [AvatarKey, ...AvatarKey[]];

export function isAvatarKey(value: string): value is AvatarKey {
  return Object.hasOwn(AVATARS, value);
}
