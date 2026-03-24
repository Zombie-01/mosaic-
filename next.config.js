/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true, // Since we're using Konva and custom image handling
  },
};

module.exports = nextConfig;
