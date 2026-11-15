import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Server-only packages that must not be bundled.
  serverExternalPackages: ['pg', 'embedded-postgres', 'qrcode'],
  devIndicators: false,
  // Separate output folders so `npm run build` never breaks a running `npm run dev`.
  // (Vercel expects the standard .next folder.)
  distDir: process.env.VERCEL ? '.next' : process.env.NODE_ENV === 'production' ? '.next-prod' : '.next',
  poweredByHeader: false,
  compress: true,
  // This app lives inside the prototype's folder; keep Next.js from using the parent as its root.
  outputFileTracingRoot: process.cwd(),
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
