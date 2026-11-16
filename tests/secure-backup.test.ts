// @vitest-environment node
import { randomBytes } from "node:crypto";
import {
  mkdtemp,
  readFile,
  writeFile,
  chmod,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, it, expect } from "vitest";
const { sealFile, openBackup } = await import("../scripts/secure-backup.mjs");
const folders: string[] = [];
async function fixture() {
  const folder = await mkdtemp(join(tmpdir(), "entre-nos-backup-test-"));
  folders.push(folder);
  await chmod(folder, 0o700);
  const key = join(folder, "key.bin"),
    source = join(folder, "source.dump"),
    encrypted = join(folder, "backup.enc"),
    restored = join(folder, "restored.dump");
  await writeFile(key, randomBytes(32), { mode: 0o600 });
  await writeFile(
    source,
    Buffer.concat([Buffer.from("PGDMP fictício\n"), randomBytes(4096)]),
    { mode: 0o600 },
  );
  return { folder, key, source, encrypted, restored };
}
afterEach(async () => {
  for (const p of folders.splice(0))
    await rm(p, { recursive: true, force: true });
});
it("cópia autenticada preserva bytes exatos e gera ciphertext diferente a cada execução", async () => {
  const f = await fixture();
  await sealFile(f.source, f.encrypted, f.key);
  await openBackup(f.encrypted, f.restored, f.key);
  expect(await readFile(f.restored)).toEqual(await readFile(f.source));
  expect(
    (await readFile(f.encrypted)).includes(Buffer.from("PGDMP fictício")),
  ).toBe(false);
  const second = join(f.folder, "second.enc");
  await sealFile(f.source, second, f.key);
  expect(await readFile(second)).not.toEqual(await readFile(f.encrypted));
});
it("alteração de ciphertext ou chave errada é recusada sem deixar dump restaurado", async () => {
  const f = await fixture();
  await sealFile(f.source, f.encrypted, f.key);
  const damaged = await readFile(f.encrypted);
  damaged[damaged.length - 20] ^= 1;
  await writeFile(f.encrypted, damaged);
  await expect(openBackup(f.encrypted, f.restored, f.key)).rejects.toThrow(
    /integridade/,
  );
  expect(await readdir(f.folder)).not.toContain("restored.dump");
  expect((await readdir(f.folder)).some((p) => p.endsWith(".partial"))).toBe(
    false,
  );
  await writeFile(f.key, randomBytes(32));
  await expect(openBackup(f.encrypted, f.restored, f.key)).rejects.toThrow();
});
it("arquivo de destino existente é preservado e chave com permissões amplas é negada", async () => {
  const f = await fixture();
  await writeFile(f.encrypted, "preservar");
  await expect(sealFile(f.source, f.encrypted, f.key)).rejects.toThrow(
    /já existe/,
  );
  expect(await readFile(f.encrypted, "utf8")).toBe("preservar");
  await chmod(f.key, 0o644);
  await expect(
    sealFile(f.source, join(f.folder, "new.enc"), f.key),
  ).rejects.toThrow(/privado/);
});
