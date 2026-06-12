import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "MindMatch",
        short_name: "MindMatch",
        description: "Conexión social acompañada para tu bienestar.",
        lang: "es-CO",
        theme_color: "#7BB6A1",
        background_color: "#F4F7F5",
        display: "standalone",
        start_url: "/",
        icons: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
});
