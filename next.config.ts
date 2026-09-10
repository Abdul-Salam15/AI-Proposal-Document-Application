import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // render-pdf.ts resolves @sparticuz/chromium's bin/ directory (the
  // brotli-compressed Chromium binary) via import.meta.url at runtime, not
  // a static import — Vercel's output file tracing can't follow that, so
  // the directory is missing from the deployed function even though the
  // package itself isn't webpack-bundled (it's already on Next's default
  // serverExternalPackages list). Explicitly include it for the one route
  // that launches Chromium.
  outputFileTracingIncludes: {
    "/api/proposals/\\[id\\]/export": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
};

export default nextConfig;
