/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      // The application parser enforces a 5 MiB file limit. Leave multipart overhead
      // below this framework-level ceiling instead of accepting arbitrarily large bodies.
      bodySizeLimit: "6mb",
    },
    proxyClientMaxBodySize: "6mb",
  },
  webpack(config) {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    config.module.parser = {
      ...config.module.parser,
      javascript: {
        ...config.module.parser?.javascript,
        url: false,
      },
    };
    return config;
  },
};

export default nextConfig;
