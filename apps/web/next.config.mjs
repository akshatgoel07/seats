/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Tree-shake large barrel packages so importing a handful of icons/utils
    // doesn't pull the whole module graph into the route chunk (and slow dev
    // cold-compile / HMR). lucide-react is a 1.4k+ icon barrel imported across
    // ~12 files; sonner is the toast lib used only on a couple of surfaces.
    optimizePackageImports: ["lucide-react", "sonner"],
  },
};

export default nextConfig;
