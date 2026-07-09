import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "./" : "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "pwa-192.png", "pwa-512.png"],
      manifest: {
        name: "ロシア語ミニ復習ツール",
        short_name: "Russian Review",
        description:
          "ロシア語の単語・会話復習、音声読み上げ、SRS、学習履歴を備えたミニ学習ツール",
        theme_color: "#315f72",
        background_color: "#f6f4ed",
        display: "standalone",
        start_url: ".",
        icons: [
          {
            src: "pwa-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
      },
    }),
  ],
}));
