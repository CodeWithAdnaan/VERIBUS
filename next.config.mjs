/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Leaflet ships CommonJS; keep it external-friendly and transpiled where needed.
  transpilePackages: ['react-leaflet', '@react-leaflet/core'],
  serverExternalPackages: ['@electric-sql/pglite'],
  eslint: {
    // The engine + demo spine is what matters; lint is not a build gate for the pilot.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
