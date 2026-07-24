/**
 * EverRoot brand imagery.
 *
 * Cinematic hero art that establishes the product's visual language (see
 * everroot_visual_style_guide.html). These are the actual images used on the
 * marketing / entry surfaces of the app (landing, login, signup, loading).
 *
 * They are currently served from the Higgsfield CDN where they were authored.
 * To self-host for production robustness, download each file, drop it into
 * `public/assets/brand/<key>.jpg`, and flip `SELF_HOSTED` to true — nothing else
 * needs to change because every surface reads through `brandImage()`.
 */

export interface BrandImage {
  /** Public CDN URL (authoring source of truth). */
  cdnUrl: string;
  /** Path once the file is dropped into /public for self-hosting. */
  localPath: string;
  /** Human description for alt text. */
  alt: string;
  /** CSS object-position / background-position focal point. */
  focus: string;
}

/** Flip to true once the files exist under public/assets/brand/. */
export const SELF_HOSTED = false;

export const BRAND: Record<string, BrandImage> = {
  reveal: {
    cdnUrl:
      "https://d8j0ntlcm91z4.cloudfront.net/user_3GCNPmBJ5PVXiIZ2LrnYgU4wRKx/hf_20260724_195449_7ba74537-e56a-4ee6-a9a0-bae3acea8630.png",
    localPath: "/assets/brand/reveal.jpg",
    alt: "The crown of a colossal ancient tree emerging through dawn cloud",
    focus: "50% 55%",
  },
  valleyHero: {
    cdnUrl:
      "https://d8j0ntlcm91z4.cloudfront.net/user_3GCNPmBJ5PVXiIZ2LrnYgU4wRKx/hf_20260724_195400_5be70f17-367a-473d-9fc8-54daf0785c3b.png",
    localPath: "/assets/brand/valley_hero.jpg",
    alt: "A single colossal ancient tree in a golden-hour valley",
    focus: "50% 50%",
  },
  canopy: {
    cdnUrl:
      "https://d8j0ntlcm91z4.cloudfront.net/user_3GCNPmBJ5PVXiIZ2LrnYgU4wRKx/hf_20260724_195428_664d58ab-5926-448b-ac58-d7dd356e5db3.png",
    localPath: "/assets/brand/canopy.jpg",
    alt: "Inside the sunlit crown of the tree, backlit translucent leaves",
    focus: "50% 50%",
  },
  trunk: {
    cdnUrl:
      "https://d8j0ntlcm91z4.cloudfront.net/user_3GCNPmBJ5PVXiIZ2LrnYgU4wRKx/hf_20260724_195415_fa859a6a-ff98-42f4-bed6-ff6ed856ee49.png",
    localPath: "/assets/brand/trunk.jpg",
    alt: "Looking up the ancient trunk with faint golden memory veins in the bark",
    focus: "50% 50%",
  },
  valleyVista: {
    cdnUrl:
      "https://d8j0ntlcm91z4.cloudfront.net/user_3GCNPmBJ5PVXiIZ2LrnYgU4wRKx/hf_20260724_200542_d6174d8d-0ce6-41a7-9a4c-d4f90eab1cbb.png",
    localPath: "/assets/brand/valley_vista.jpg",
    alt: "An epic valley vista with the sacred tree towering in the distance",
    focus: "50% 55%",
  },
  duskPath: {
    cdnUrl:
      "https://d8j0ntlcm91z4.cloudfront.net/user_3GCNPmBJ5PVXiIZ2LrnYgU4wRKx/hf_20260724_200529_ae378bb5-1853-45bd-9c4b-c0082c008f8a.png",
    localPath: "/assets/brand/dusk_path.jpg",
    alt: "A gentle forest path lit by warm lanterns at dusk",
    focus: "50% 50%",
  },
};

/** Resolve the URL to use for a brand image (self-hosted when available). */
export function brandImage(key: keyof typeof BRAND): string {
  const img = BRAND[key];
  return SELF_HOSTED ? img.localPath : img.cdnUrl;
}
