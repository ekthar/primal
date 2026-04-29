const path = require("path");

const isCloudflarePagesBuild = process.env.PRIMAL_DEPLOY_TARGET === "cloudflare-pages";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.resolve(__dirname),
  ...(isCloudflarePagesBuild ? { output: "export" } : {}),
};

if (!isCloudflarePagesBuild) {
  nextConfig.rewrites = async function rewrites() {
    const backendOrigin =
      process.env.BACKEND_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      "http://localhost:4000";

    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${backendOrigin}/uploads/:path*`,
      },
    ];
  };
}

module.exports = nextConfig;
