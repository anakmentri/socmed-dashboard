/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Rewrite Supabase REST API path → internal PG proxy.
  // Memungkinkan Supabase JS client (yang call /rest/v1/<table>) bekerja
  // tanpa Supabase platform — pakai schema 'twitterdood' via direct PG connection.
  async rewrites() {
    return [
      {
        source: "/rest/v1/:table",
        destination: "/api/pgrest/:table",
      },
    ];
  },
};
module.exports = nextConfig;
