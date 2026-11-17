// Local-only authenticated encryption. Keys and decrypted dumps stay outside Git.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  stat,
  realpath,
  readFile,
  open,
  unlink,
  link,
} from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";

const repository = fileURLToPath(new URL("../", import.meta.url));
const magic = Buffer.from("ENTRENOSBK1"),
  headerLength = magic.length + 12;
async function outsideRepository(path) {
  const absolute = await realpath(path);
  const rel = relative(repository, absolute);
  if (!rel || (!rel.startsWith("..") && !isAbsolute(rel)))
    throw Error("Use uma área privada fora do repositório.");
  return absolute;
}
async function loadKey(path) {
  const keyPath = await outsideRepository(path),
    info = await stat(keyPath);
  if (
    !info.isFile() ||
    (info.mode & 0o077) !== 0 ||
    (process.getuid && info.uid !== process.getuid())
  )
    throw Error(
      "A chave deve pertencer ao operador, em arquivo privado (chmod 600).",
    );
  const key = await readFile(keyPath);
  if (key.length !== 32)
    throw Error("A chave deve conter exatamente 32 bytes aleatórios.");
  return key;
}
async function privateDestination(destination) {
  const absolute = resolve(destination);
  await mkdir(dirname(absolute), { recursive: true, mode: 0o700 });
  const directory = await outsideRepository(dirname(absolute));
  if (((await stat(directory)).mode & 0o077) !== 0)
    throw Error("O diretório de backup deve ser privado (chmod 700).");
  try {
    await stat(absolute);
    throw Error("O arquivo de destino já existe.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return absolute;
}
async function publish(partial, destination) {
  // link is exclusive: an existing destination is never overwritten.
  await link(partial, destination);
  await unlink(partial);
}
export async function sealStream(source, destination, keyFile) {
  const key = await loadKey(keyFile),
    target = await privateDestination(destination);
  const partial = `${target}.${randomBytes(8).toString("hex")}.partial`;
  const iv = randomBytes(12),
    header = Buffer.concat([magic, iv]);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(header);
  try {
    const file = await open(partial, "wx", 0o600);
    await file.write(header);
    await file.close();
    await pipeline(
      source,
      cipher,
      createWriteStream(partial, { flags: "a", mode: 0o600 }),
    );
    const fileEnd = await open(partial, "a");
    await fileEnd.write(cipher.getAuthTag());
    await fileEnd.sync();
    await fileEnd.close();
    await publish(partial, target);
  } catch (error) {
    await unlink(partial).catch(() => {});
    throw error;
  } finally {
    key.fill(0);
  }
}
export async function sealFile(source, destination, keyFile) {
  return sealStream(createReadStream(source), destination, keyFile);
}
export async function openBackup(source, destination, keyFile) {
  const key = await loadKey(keyFile),
    target = await privateDestination(destination);
  const partial = `${target}.${randomBytes(8).toString("hex")}.partial`;
  try {
    const file = await open(source, "r"),
      size = (await file.stat()).size;
    if (size < headerLength + 16) {
      await file.close();
      throw Error("Backup truncado.");
    }
    const header = Buffer.alloc(headerLength),
      tag = Buffer.alloc(16);
    await file.read(header, 0, headerLength, 0);
    await file.read(tag, 0, 16, size - 16);
    await file.close();
    if (!header.subarray(0, magic.length).equals(magic))
      throw Error("Formato de backup desconhecido.");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      header.subarray(magic.length),
    );
    decipher.setAAD(header);
    decipher.setAuthTag(tag);
    const input =
      size === headerLength + 16
        ? Readable.from([])
        : createReadStream(source, { start: headerLength, end: size - 17 });
    await pipeline(
      input,
      decipher,
      createWriteStream(partial, { flags: "wx", mode: 0o600 }),
    );
    await publish(partial, target);
  } catch {
    await unlink(partial).catch(() => {});
    throw Error(
      "Backup recusado: formato, chave ou integridade inválidos. Nenhum dump de destino foi publicado.",
    );
  } finally {
    key.fill(0);
  }
}
export async function createLocalBackup(destination, keyFile) {
  const environment = { ...process.env };
  for (const name of [
    "DOCKER_HOST",
    "DOCKER_CONTEXT",
    "DOCKER_TLS",
    "DOCKER_TLS_VERIFY",
    "DOCKER_CERT_PATH",
  ])
    delete environment[name];
  const child = spawn(
    "docker",
    [
      "--host=unix:///var/run/docker.sock",
      "exec",
      "supabase_db_financas-familiares",
      "pg_dump",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "--format=custom",
      "--no-owner",
      "--schema=public",
      "--schema=private",
      "--schema=auth",
    ],
    { env: environment, stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stderr.resume();
  const outcome = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(Error("pg_dump local falhou.")),
    );
  });
  // Hold output as .pending until pg_dump completed successfully as well as GCM.
  const pending = `${destination}.${randomBytes(8).toString("hex")}.pending`;
  try {
    await Promise.all([sealStream(child.stdout, pending, keyFile), outcome]);
    await publish(pending, await privateDestination(destination));
  } catch (error) {
    child.kill();
    await unlink(pending).catch(() => {});
    throw error;
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [action, source, destination, keyFile] = process.argv.slice(2);
  try {
    if (action === "seal" && source && destination && keyFile)
      await sealFile(source, destination, keyFile);
    else if (action === "open" && source && destination && keyFile)
      await openBackup(source, destination, keyFile);
    else if (action === "create" && source && destination && !keyFile)
      await createLocalBackup(source, destination);
    else
      throw Error(
        "Uso: secure-backup.mjs seal|open ORIGEM DESTINO ARQUIVO_CHAVE; ou create DESTINO ARQUIVO_CHAVE.",
      );
    process.stdout.write(
      "Operação local concluída. Preserve a chave separadamente e ensaie a restauração.\n",
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Operação recusada."}\n`,
    );
    process.exitCode = 1;
  }
}
