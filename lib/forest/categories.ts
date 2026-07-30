/**
 * THE TEN MEMORY CATEGORIES
 * -------------------------
 * The tree is mature from the very first day — its form never changes. What
 * grows is the memories held in its lanterns. Every account carries the same
 * ten category lanterns from the start (one per category below), and every
 * memory a person records lives inside one of them. A family member added to
 * the forest also gets their own lantern, but those are people, not categories.
 *
 * These titles are the single source of truth: they match the branch names the
 * interview script writes to, so a recorded answer lands in the right lantern,
 * and they carry a color in ForestCanvas's CATEGORY_COLORS map.
 */
export interface MemoryCategory {
  /** Branch node title — must match the interview script's `branch` values. */
  title: string;
  /** A gentle one-liner shown in the category's drawer. */
  blurb: string;
}

export const CATEGORIES: MemoryCategory[] = [
  {
    title: "Roots & Heritage",
    blurb: "Where you come from — family, homeland, and the generations before you.",
  },
  {
    title: "Childhood Memories",
    blurb: "The early years — home, play, and the world when you were small.",
  },
  {
    title: "Favorite Stories",
    blurb: "The tales you love to tell again and again.",
  },
  {
    title: "Milestones",
    blurb: "The turning points and the big moments of your life.",
  },
  {
    title: "Family Traditions",
    blurb: "The rituals, holidays, and customs that mean home.",
  },
  {
    title: "Biggest Wins",
    blurb: "What you built, achieved, and are proud of.",
  },
  {
    title: "Biggest Mistakes",
    blurb: "The hard lessons and what they taught you.",
  },
  {
    title: "Life Advice",
    blurb: "The wisdom you most want to pass on.",
  },
  {
    title: "Messages for Future Generations",
    blurb: "Words for the ones who come after you.",
  },
  {
    title: "Moments & Memories",
    blurb: "Anything at all — a moment, a thought, a memory to keep.",
  },
];

/** Just the titles, in order — handy for seeding and matching. */
export const CATEGORY_TITLES: string[] = CATEGORIES.map((c) => c.title);
