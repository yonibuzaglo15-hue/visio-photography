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
      ["agnon-21", "atikot"],
      ["agnon", "atikot"],
      ["atzmaut-21", "sity-18"],
      ["atzmaut", "sity-18"],
      ["balfour-7", "ashdod-4"],
      ["balfour", "ashdod-4"],
      ["bialik-46", "rova-5"],
      ["bialik", "rova-5"],
      ["chasida-17", "rova-7"],
      ["chasida", "rova-7"],
      ["cheshvan-7", "rova-12-29"],
      ["cheshvan", "rova-12-29"],
      ["eshkolit-3", "rova-16"],
      ["eshkolit", "rova-16"],
      ["haeshkol-8", "rova-1"],
      ["haeshkol", "rova-1"],
      ["hamashot-8", "ashdod-6"],
      ["hamashot", "ashdod-6"],
      ["harav-kook-19", "rova-2"],
      ["harav-kook", "rova-2"],
      ["kalanit-7a", "rova-8"],
      ["kalanit", "rova-8"],
      ["micha-hanavi-13", "rova-10"],
      ["micha-hanavi", "rova-10"],
      ["milman-2", "rova-6"],
      ["milman", "rova-6"],
      ["nahal-lachish-45", "rova-11-12"],
      ["nahal-lachish", "rova-11-12"],
      ["nahal-snir-21", "ashdod-3"],
      ["nahal-snir-boutique", "ashdod-3"],
      ["nahal-snir-9", "rova-11-24"],
      ["nahal-snir", "rova-11-24"],
      ["petah-tikva-9", "rova-9"],
      ["petah-tikva", "rova-9"],
      ["rothschild-23", "rova-15-11"],
      ["rothschild", "rova-15-11"],
      ["shevet-levi-11", "ashdod-10"],
      ["shevet-levi-4", "rova-12-17"],
      ["shevet-levi-b", "rova-12-17"],
      ["shevet-levi", "ashdod-10"],
      ["shevet-zevulun", "rova-12-16"],
      ["tzionut-55", "sity-19"],
      ["tzionut", "sity-19"],
      ["ussishkin-21", "rova-15-21"],
      ["ussishkin", "rova-15-21"],
      ["yehoyachin-11", "rova-13"],
      ["yehoyachin", "rova-13"],
    ];
    return [
      ...folders.map(([from, to]) => ({
        source: `/portfolio/${from}/:path*`,
        destination: `/portfolio/${to}/:path*`,
        permanent: true,
      })),
      { source: "/tours/chasida-17", destination: "/tours/rova-7", permanent: true },
      { source: "/tours/chasida", destination: "/tours/rova-7", permanent: true },
      { source: "/tours/yehoyakin-11", destination: "/tours/rova-13", permanent: true },
      { source: "/tours/yehoyakin", destination: "/tours/rova-13", permanent: true },
      { source: "/tours/shevet-zevulun", destination: "/tours/rova-12", permanent: true },
      { source: "/tours/shevet-levi-11", destination: "/tours/ashdod-apartment", permanent: true },
      { source: "/tours/shevet-levi", destination: "/tours/ashdod-apartment", permanent: true },
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
