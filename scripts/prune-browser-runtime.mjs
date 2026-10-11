import { existsSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

// Browser workers are served from client assets. Vite also emits identical
// copies during SSR compilation; omit those duplicates from deployment output.
const serverAssets = "dist/server/ssr/_next/static";
const clientAssets = "dist/client/_next/static";
if (existsSync(serverAssets)) {
  for (const name of readdirSync(serverAssets)) {
    if (!/^(?:ort-wasm-.*\.wasm|theme-model\.worker-.*\.js)$/.test(name)) continue;
    const source = join(serverAssets, name);
    const client = join(clientAssets, name);
    if (existsSync(client) && readFileSync(source).equals(readFileSync(client))) unlinkSync(source);
  }
}
