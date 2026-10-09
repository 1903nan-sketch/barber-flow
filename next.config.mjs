/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      // A página do produto mudou de nome junto com a marca.
      { source: "/produtos/barber-flow", destination: "/produtos/rupcontrol", permanent: true },
      // O BeautyTix saiu do site da Ruptix.
      { source: "/produtos/beautytix", destination: "/produtos/rupcontrol", permanent: false },
    ];
  },
};

export default nextConfig;
