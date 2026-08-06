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

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.*", "localhost"],
  images: {
    qualities: [75, 100],
  },
  webpack: (config) => {
    config.module.rules.push(svgrRule);
    config.module.rules.push(markdownRule);
    return config;
  },
  turbopack: {
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
