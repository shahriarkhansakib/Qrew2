/** @type {import('next').NextConfig} */ // Tells your IDE to provide autocomplete for Next.js configs

// Suppress the AWS SDK v3 "NodeVersionSupportWarning" that fires once per
// Next.js worker process. This is a non-breaking upstream notice about their
// planned Node >=22 requirement in 2027 — safe to silence until we upgrade.
process.on("warning", (w) => {
  if (w.name === "NodeVersionSupportWarning") return;
  // Re-emit all other warnings normally.
  const orig = console.warn;
  orig.call(console, w.toString());
});

const nextConfig = {
  transpilePackages: ["@starter/api", "@starter/db"],
  serverExternalPackages: ["pino", "pino-pretty"],
  logging: {
    incomingRequests: false,
  },
  // 2. Strict Security Headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://lh3.googleusercontent.com https://*.r2.dev; connect-src 'self' http://localhost:3000 ${process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL : ""} https://*.cloudflarestorage.com;`,
          },
          {
            // Prevents "MIME-sniffing".
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            // Clickjacking Defense. This tells the browser: "Do not let ANY other website embed my app inside an <iframe>."
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            // A legacy security header for older browsers (like Internet Explorer). It tells the browser to block the page from loading if it detects a reflected XSS attack. Modern browsers use CSP instead, but this is a good safety net.
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
