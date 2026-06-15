/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "thedeepdive.ca", pathname: "/wp-content/uploads/**" },
    ],
  },
};
export default nextConfig;
