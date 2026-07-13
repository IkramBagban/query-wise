import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@prisma/client", "pg"],
  transpilePackages: ["@query-wise/shared"],
};

export default nextConfig;
