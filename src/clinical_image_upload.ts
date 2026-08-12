import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";
import { infrai } from "./infrai_storage_client.ts";

const run = promisify(execFile);
const bucket = process.env.INFRAI_IMAGE_BUCKET ?? "clinical-image-previews";
const source = process.argv[2];

if (!source) throw new Error("Pass an image path: npm run resize-upload -- ./scan.jpg");

const stem = basename(source, extname(source)).replace(/[^a-zA-Z0-9_-]/g, "-");
const preview = join("/tmp", `${stem}-preview.jpg`);
const key = `previews/${stem}-1024.jpg`;

await infrai.storage.bucket.create(bucket);
await run("sips", ["-Z", "1024", "-s", "format", "jpeg", source, "--out", preview]);

try {
  const { url } = await infrai.storage.object.presign(bucket, key, 600);
  const bytes = await readFile(preview);
  const upload = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: bytes,
  });
  if (!upload.ok) throw new Error(`Upload returned HTTP ${upload.status}.`);
  console.log(`Stored ${key} (${bytes.length} bytes).`);
} finally {
  await rm(preview, { force: true });
}
