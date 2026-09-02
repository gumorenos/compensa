/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // ExcelJS is loaded only on server-side spreadsheet paths. Externalizing it lets
  // Webpack/Next output tracing preserve its complete runtime dependency tree in
  // the standalone image instead of copying only the top-level dynamically loaded package.
  serverExternalPackages: ["@excel.js/exceljs"],
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
