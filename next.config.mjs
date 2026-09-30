/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async redirects() {
    return [
      // Endereços antigos herdados do Barber Flow.
      { source: "/dashboard/barbeiros", destination: "/dashboard/profissionais", permanent: true },
      { source: "/dashboard/barbeiros/:path*", destination: "/dashboard/profissionais/:path*", permanent: true },
      { source: "/produtos/barber-flow", destination: "/produtos/beautytix", permanent: true },
    ];
  },
};

export default nextConfig;
