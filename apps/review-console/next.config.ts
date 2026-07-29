import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@unified/ui", "@unified/types", "@unified/auth-client"],
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    NEXT_PUBLIC_SUPPORT_HUB_URL:
      process.env.NEXT_PUBLIC_SUPPORT_HUB_URL ?? "http://localhost:3000",
    NEXT_PUBLIC_REVIEW_CONSOLE_URL:
      process.env.NEXT_PUBLIC_REVIEW_CONSOLE_URL ?? "http://localhost:3001",
  },
};

export default nextConfig;
