import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AgriPay Salone",
    short_name: "AgriPay",
    description: "Empowering Farmers Through Digital Finance.",
    start_url: "/agent",
    scope: "/",
    display: "standalone",
    background_color: "#f8faf5",
    theme_color: "#2f7d4f",
    orientation: "portrait",
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
