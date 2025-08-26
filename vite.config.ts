import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Safely import lovable-tagger - fallback to null if not available
let componentTagger: any = null;
try {
  componentTagger = require("lovable-tagger").componentTagger;
} catch (e) {
  console.warn("lovable-tagger not available, continuing without it");
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
