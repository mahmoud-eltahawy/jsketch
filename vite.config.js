// vite.config.js
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    minify: false,
    rollupOptions: {
      output: {
        // Removes hash from main entry points
        entryFileNames: `[name].js`,
        // Removes hash from split chunks
        chunkFileNames: `[name].js`,
        // Removes hash from static assets (images, css, etc.)
        assetFileNames: `[name].[ext]`,
      },
    },
  },
});
