import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg"],
  transpilePackages: ["@query-wise/shared"],
};

export default nextConfig;
