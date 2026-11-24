import { readFile, writeFile, mkdir } from "node:fs/promises";
const css = await readFile("src/style.css", "utf8");
const tokens = (body) =>
  Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*(#[\da-f]{3,6}\b)/gi)].map((m) => [
      m[1],
      m[2],
    ]),
  );
const dark = tokens(css.match(/:root\s*\{([\s\S]*?)\}/)[1]),
  light = {
    ...dark,
    ...tokens(css.match(/:root\[data-theme="light"\]\s*\{([\s\S]*?)\}/)[1]),
  };
const luminance = (hex) => {
  if (hex.length === 4)
    hex = "#" + [...hex.slice(1)].map((c) => c + c).join("");
  const values = hex
    .slice(1)
    .match(/../g)
    .map((n) => parseInt(n, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
};
const pairs = [];
for (const bg of [
  "bg",
  "surface",
  "raised",
  "field",
  "accent-bg",
  "positive-bg",
  "warning-bg",
  "danger-bg",
])
  pairs.push(["text", bg, 4.5]);
for (const bg of ["bg", "surface", "raised", "field", "accent-bg"])
  pairs.push(["muted", bg, 4.5]);
for (const bg of ["bg", "surface", "raised", "accent-bg"])
  pairs.push(["blue", bg, 4.5]);
for (const bg of ["bg", "surface", "positive-bg"])
  pairs.push(["green", bg, 4.5]);
pairs.push(
  ["warning", "warning-bg", 4.5],
  ["danger", "danger-bg", 4.5],
  ["on-accent", "blue", 4.5],
);
for (const bg of ["field", "raised", "surface"])
  pairs.push(["control-border", bg, 3]);
for (const bg of ["bg", "surface", "raised"]) pairs.push(["focus", bg, 3]);
for (let i = 1; i <= 6; i++)
  for (const bg of ["surface", "raised"]) pairs.push(["chart-" + i, bg, 3]);
const results = [];
for (const [theme, t] of Object.entries({ dark, light }))
  for (const [foreground, background, minimum] of pairs) {
    const a = luminance(t[foreground]),
      b = luminance(t[background]),
      ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    results.push({
      theme,
      foreground,
      background,
      foregroundHex: t[foreground],
      backgroundHex: t[background],
      ratio: Number(ratio.toFixed(2)),
      minimum,
      passed: ratio >= minimum,
    });
  }
await mkdir("docs/assets/ui-ux", { recursive: true });
await writeFile(
  "docs/assets/ui-ux/contrastes.json",
  JSON.stringify(results, null, 2),
);
const failed = results.filter((r) => !r.passed);
console.log(JSON.stringify({ pairs: results.length, failed }));
if (failed.length) process.exitCode = 1;
