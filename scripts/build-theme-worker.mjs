import { build } from "vite";
// Framework client transforms assume a DOM. Keep the inference worker in an
// isolated browser-target build, served unchanged in preview and production.
await build({
  configFile:false,
  publicDir:false,
  define:{"process.env.NODE_ENV":JSON.stringify("production")},
  build:{
    outDir:"public/local-ai",emptyOutDir:true,target:"es2022",
    rollupOptions:{input:"app/theme-model.worker.ts",output:{format:"es",entryFileNames:"theme-model.js",assetFileNames:"[name][extname]",inlineDynamicImports:true}},
  },
});
