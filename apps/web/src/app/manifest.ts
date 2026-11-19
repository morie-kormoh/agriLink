import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AgriLink Salone",
    short_name: "AgriLink",
    description: "Empowering Farmers Through Digital Finance.",
    start_url: "/agent",
    scope: "/",
    display: "standalone",
    background_color: "#f6f7fb",
    theme_color: "#1f2a6b",
    orientation: "portrait",
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
