// Content Security Policy. Kept functional for a Next.js + React Three Fiber app:
// 'unsafe-inline'/'unsafe-eval' are needed for Next's inline bootstrap scripts
// and some bundled code. A future tightening step can move scripts to nonces.
// The Higgsfield CloudFront distribution where our authored brand stills and the
// cinematic opening video live (see lib/brand.ts). Allowed for images + media so
// the landing hero art and opening descent load in the browser. Flip brand.ts's
// SELF_HOSTED to true (and drop the files into /public) to remove this dependency.
const BRAND_CDN = "https://d8j0ntlcm91z4.cloudfront.net";

// Meta Pixel domains. fbevents.js is served from connect.facebook.net (a script),
// and the pixel reports events/PageViews to www.facebook.com/tr (fetched as both
// an image beacon and a connect/beacon request). All three CSP directives below
// must name these hosts or the Pixel silently fails to fire.
const META_PIXEL_SCRIPT = "https://connect.facebook.net";
const META_PIXEL_REPORT = "https://www.facebook.com";

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `img-src 'self' data: blob: ${BRAND_CDN} ${META_PIXEL_REPORT}`,
  `media-src 'self' blob: ${BRAND_CDN}`, // streamed recordings from /api + the opening video from the CDN
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${META_PIXEL_SCRIPT}`,
  // three.js/GLTFLoader decodes textures embedded in .glb models by turning them
  // into blob: URLs and fetching them via ImageBitmapLoader. fetch() is governed
  // by connect-src (NOT img-src), so blob: must be allowed here or EVERY model's
  // textures silently fail ("Couldn't load texture blob") — which made the hero
  // tree render as a blown-out white silhouette with no color.
  `connect-src 'self' blob: ${META_PIXEL_SCRIPT} ${META_PIXEL_REPORT}`,
  "form-action 'self'",
].join("; ");

// Applied to every response. HSTS assumes HTTPS (Railway serves HTTPS).
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The voice interview needs the microphone; everything else is denied.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), browsing-topics=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["three"],
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: ["bcryptjs"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
