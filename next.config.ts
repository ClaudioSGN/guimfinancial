import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  output: "export",
  experimental: {
    workerThreads: true,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
