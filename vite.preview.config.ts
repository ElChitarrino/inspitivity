import { sites } from "@openai/sites-vite-plugin";
import vinext from "vinext";
import { defineConfig } from "vite";

// Lightweight local preview for Macs that cannot run the Cloudflare worker runtime.
export default defineConfig({
  plugins: [vinext(), sites()],
  server: { watch: { useFsEvents: false, usePolling: true } },
});
