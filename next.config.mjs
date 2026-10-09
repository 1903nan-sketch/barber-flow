/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      // A página do produto mudou de nome junto com a marca.
      { source: "/produtos/barber-flow", destination: "/produtos/rupcontrol", permanent: true },
    ];
  },
};

export default nextConfig;
