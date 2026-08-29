/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "thedeepdive.ca", pathname: "/wp-content/uploads/**" },
    ],
  },
  // Ensure the invoice-PDF font files ship inside the Vercel serverless
  // function bundle. Without this, /public assets aren't traced into the
  // function's filesystem and fs.readFileSync() from src/lib/pdf.ts 404s
  // at runtime — surfacing as "unknown font format" from fontkit.
  outputFileTracingIncludes: {
    "/api/invoices/**": ["./public/fonts/**"],
    "/api/**": ["./public/fonts/**"],
  },
};
export default nextConfig;
