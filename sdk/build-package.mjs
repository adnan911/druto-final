import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import JSZip from "jszip";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sdk = path.join(root, "sdk", "druto-sdk");
const output = path.join(root, "client", "public", "downloads");
const metadata = JSON.parse(await readFile(path.join(sdk, "package.json"), "utf8"));
const archiveName = `druto-sdk-${metadata.version}.zip`;

execFileSync(process.execPath, [path.join(root, "node_modules", "typescript", "bin", "tsc"), "-p", path.join(sdk, "tsconfig.json")], { cwd: root, stdio: "inherit" });
const zip = new JSZip();
const files = ["package.json", "LICENSE", "README.md", "dist/index.js", "dist/index.d.ts", "examples/node-checkout.mjs"];
const fixedDate = new Date("2026-10-08T00:00:00.000Z");
for (const file of files) zip.file(`druto-sdk/${file}`, await readFile(path.join(sdk, file)), { date: fixedDate, createFolders: false });
const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
const sha256 = createHash("sha256").update(bytes).digest("hex");
await mkdir(output, { recursive: true });
await writeFile(path.join(output, archiveName), bytes);
await writeFile(path.join(output, `${archiveName}.sha256`), `${sha256}  ${archiveName}\n`);
console.log(JSON.stringify({ archive: path.join(output, archiveName), bytes: bytes.length, sha256 }));
