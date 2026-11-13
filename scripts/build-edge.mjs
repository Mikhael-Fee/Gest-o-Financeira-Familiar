import { build } from "esbuild";
await build({
  entryPoints: ["server/identity.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: "supabase/functions/identity/handler.generated.js",
  logLevel: "warning",
});
console.log("Função identity empacotada com dependências do lockfile.");
