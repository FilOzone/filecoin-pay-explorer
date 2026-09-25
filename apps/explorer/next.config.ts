import type { NextConfig } from "next";

const svgrRule = {
  test: /\.svg$/,
  use: ["@svgr/webpack"],
};

const markdownRule = {
  test: /\.md$/,
  loader: "frontmatter-markdown-loader",
  options: {
    mode: ["body", "attributes", "react-component"],
  },
};

const isDevelopment = process.env.NODE_ENV === "development";
// Playwright's default mode swaps Privy for a local fake; `test:e2e:privy` runs the real one.
const privyAlias =
  process.env.E2E_PRIVY === "mock" && isDevelopment ? { "@privy-io/react-auth": "./e2e/fake-privy.tsx" } : undefined;
const isVercelPreview = process.env.VERCEL_ENV === "preview";

const contentSecurityPolicy = [
  "default-src 'self'",
  // 'unsafe-inline': the Next runtime and the Plausible init snippet are inline scripts.
  `script-src 'self' 'unsafe-inline' ${isDevelopment ? "'unsafe-eval' " : ""}https://plausible.io https://challenges.cloudflare.com https://*.stripe.com${isVercelPreview ? " https://vercel.live" : ""}`,
  `style-src 'self' 'unsafe-inline'${isVercelPreview ? " https://vercel.live" : ""}`,
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "child-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org",
  `frame-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com https://*.stripe.com${isVercelPreview ? " https://vercel.live" : ""}`,
  // eth.merkle.io through 56.rpc.thirdweb.com are viem chain defaults; createChainTransport falls back to them.
  `connect-src 'self' https://auth.privy.io https://*.rpc.privy.systems https://api.moonpay.com https://*.stripe.com wss://relay.walletconnect.com wss://relay.walletconnect.org https://*.walletconnect.com https://*.walletconnect.org wss://www.walletlink.org https://api.goldsky.com https://*.glif.io https://*.publicnode.com https://*.drpc.org https://eth.merkle.io https://arb1.arbitrum.io https://mainnet.base.org https://mainnet.optimism.io https://api.avax.network https://56.rpc.thirdweb.com https://v2.api.squidrouter.com https://*.filbeam.com https://*.filoz.workers.dev https://plausible.io https://filecoin.blockscout.com https://filecoin-testnet.blockscout.com${isVercelPreview ? " https://vercel.live wss://ws-us3.pusher.com" : ""}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.*"],
  headers: async () => [{ source: "/(.*)", headers: securityHeaders }],
  images: {
    qualities: [75, 100],
  },
  webpack: (config) => {
    config.module.rules.push(svgrRule);
    config.module.rules.push(markdownRule);
    return config;
  },
  turbopack: {
    resolveAlias: privyAlias,
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
      "*.md": {
        loaders: ["frontmatter-markdown-loader"],
      },
    },
  },
};

export default nextConfig;
