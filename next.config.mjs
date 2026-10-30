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
    // Panoramas live in public/tours and are served by the CDN. The tour page
    // only reads tour.json / measure.json, but a dynamic path under that
    // folder would otherwise pull every JPEG into the serverless function.
    outputFileTracingIgnores: [
      "**/public/tours/**/*.jpg",
      "**/public/tours/**/*.jpeg",
      "**/public/tours/**/*.png",
      "**/public/tours/**/*.webp",
    ],
    outputFileTracingExcludes: {
      "*": [
        "./public/tours/**/*.jpg",
        "./public/tours/**/*.jpeg",
        "./public/tours/**/*.png",
        "./public/tours/**/*.webp",
      ],
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
