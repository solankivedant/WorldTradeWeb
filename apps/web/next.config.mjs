/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["deck.gl", "@deck.gl/react", "@deck.gl/layers", "@deck.gl/core", "@deck.gl/mapbox"],
};
export default nextConfig;
