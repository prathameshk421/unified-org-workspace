import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || "";

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  output: "standalone",
  transpilePackages: ["@unified/ui", "@unified/types", "@unified/auth-client"],
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000",
    NEXT_PUBLIC_SUPPORT_HUB_URL: process.env.NEXT_PUBLIC_SUPPORT_HUB_URL || "http://localhost:3000",
    NEXT_PUBLIC_REVIEW_CONSOLE_URL:
      process.env.NEXT_PUBLIC_REVIEW_CONSOLE_URL || "http://localhost:3001",
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
