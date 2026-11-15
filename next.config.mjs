/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@photo-sphere-viewer/core",
    "@photo-sphere-viewer/virtual-tour-plugin",
    "@photo-sphere-viewer/map-plugin",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "16mb",
    },
  },
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/favicon.svg" }];
  },
  async redirects() {
    const folders = [
      ["agnon-21", "agnon"],
      ["atzmaut-21", "atzmaut"],
      ["balfour-7", "balfour"],
      ["bialik-46", "bialik"],
      ["chasida-17", "chasida"],
      ["cheshvan-7", "cheshvan"],
      ["eshkolit-3", "eshkolit"],
      ["haeshkol-8", "haeshkol"],
      ["hamashot-8", "hamashot"],
      ["harav-kook-19", "harav-kook"],
      ["kalanit-7a", "kalanit"],
      ["micha-hanavi-13", "micha-hanavi"],
      ["milman-2", "milman"],
      ["nahal-lachish-45", "nahal-lachish"],
      ["nahal-snir-21", "nahal-snir-boutique"],
      ["nahal-snir-9", "nahal-snir"],
      ["petah-tikva-9", "petah-tikva"],
      ["rothschild-23", "rothschild"],
      ["shevet-levi-11", "shevet-levi"],
      ["shevet-levi-4", "shevet-levi-b"],
      ["tzionut-55", "tzionut"],
      ["ussishkin-21", "ussishkin"],
      ["yehoyachin-11", "yehoyachin"],
    ];
    return [
      ...folders.map(([from, to]) => ({
        source: `/portfolio/${from}/:path*`,
        destination: `/portfolio/${to}/:path*`,
        permanent: true,
      })),
      { source: "/tours/chasida-17", destination: "/tours/chasida", permanent: true },
      { source: "/tours/yehoyakin-11", destination: "/tours/yehoyakin", permanent: true },
      { source: "/tours/shevet-levi-11", destination: "/tours/ashdod-apartment", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/tours/:slug/pano/:file*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
