// Content Security Policy. Kept functional for a Next.js + React Three Fiber app:
// 'unsafe-inline'/'unsafe-eval' are needed for Next's inline bootstrap scripts
// and some bundled code. A future tightening step can move scripts to nonces.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:", // streamed recordings come from our own /api
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'self'",
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
