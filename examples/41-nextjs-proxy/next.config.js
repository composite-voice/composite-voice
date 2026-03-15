/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile the workspace SDK so Next.js can resolve it
  transpilePackages: ['@lukeocodes/composite-voice'],
};

export default nextConfig;
