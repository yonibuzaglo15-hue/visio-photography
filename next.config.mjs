/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    formats: ["image/webp"],
    deviceSizes: [480, 640, 828, 1080, 1280, 1600, 1920],
    minimumCacheTTL: 31536000,
  },
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
