import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the LAN IP to access Next.js dev resources (HMR, fonts, etc.)
  // when testing from a mobile device on the same Wi-Fi network.
  allowedDevOrigins: ["192.168.100.6"],

  // Next's rewrite proxy defaults to a 30s timeout (proxy-request.js).
  // /auth/login can take longer than that under slow Gmail SMTP conditions
  // (see email_service.py's 10s SMTP timeout + connection/TLS overhead),
  // so give the proxy enough headroom to not kill the connection early.
  experimental: {
    proxyTimeout: 45000,
  },

  // Proxy all /api/v1/* calls through Next.js so that the FastAPI
  // Set-Cookie response lands on the Next.js origin (port 3000).
  // Without this the cookie is scoped to port 8000 and the Next.js
  // middleware (running on port 3000) never sees it, causing an infinite
  // redirect loop back to /login.
  async rewrites() {
    const backend =
      process.env.SERVER_SIDE_API_URL ?? "http://localhost:8000";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backend}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
