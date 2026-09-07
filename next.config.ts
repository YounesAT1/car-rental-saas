import type { NextConfig } from "next";
import { readPublicEnvironment } from "./src/lib/env";

readPublicEnvironment();

if (
  !/^sk_(test|live)_[A-Za-z0-9_-]+$/.test(process.env.CLERK_SECRET_KEY ?? "")
) {
  throw new Error(
    "Missing or invalid CLERK_SECRET_KEY. Configure the server key in .env.local.",
  );
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
