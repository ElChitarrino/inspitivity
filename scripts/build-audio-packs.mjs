// Run after changing sample assets. Original source samples and credits remain packaged.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const output = "public/audio/packs";
mkdirSync(output, { recursive: true });
const banks = [
  ["acoustic", "salamander", (key) => key.endsWith("-1")],
  ["metal", "virtuosity", (key) => key.endsWith("-1")],
  ["classical", "classical-guitar", () => true],
  ["electric", "electric-guitar", (key) => key.endsWith("-1")],
];
for (const [name, directory, essential] of banks) {
  const files = readdirSync(`public/audio/${directory}`)
    .filter((file) => /\.(wav|mp3)$/.test(file))
    .sort();
  const entries = files.map((file) => {
    const path = `public/audio/${directory}/${file}`;
    const key = file.replace(/\.(wav|mp3)$/, "");
    // High bitrate stereo keeps cymbal tails; existing guitars and metal MP3s pass through.
    let data;
    if (file.endsWith(".wav")) {
      const temporary = mkdtempSync(join(tmpdir(), "inspitivity-mp3-"));
      try {
        const encoded = join(temporary, "sample.mp3");
        // A seekable output writes the gapless header, preserving drum onset timing.
        execFileSync("ffmpeg", [
          "-v",
          "error",
          "-i",
          path,
          "-c:a",
          "libmp3lame",
          "-b:a",
          "192k",
          encoded,
        ]);
        data = readFileSync(encoded);
      } finally {
        rmSync(temporary, { recursive: true, force: true });
      }
    } else data = readFileSync(path);
    return { key, data };
  });
  for (const stage of ["ready", "alternates", ...(name === "acoustic" ? ["crash"] : [])]) {
    const selected = entries.filter((entry) =>
      stage === "crash"
        ? entry.key.startsWith("crash-") && essential(entry.key)
        : essential(entry.key) === (stage === "ready"),
    );
    if (!selected.length) continue;
    let offset = 0;
    const manifest = selected.map(({ key, data }) => {
      const record = { key, offset, length: data.length };
      offset += data.length;
      return record;
    });
    const header = Buffer.from(JSON.stringify(manifest));
    const size = Buffer.alloc(4);
    size.writeUInt32LE(header.length);
    const packed = Buffer.concat([size, header, ...selected.map((entry) => entry.data)]);
    writeFileSync(join(output, `${name}-${stage}-v1.bin`), packed);
    console.log(`${name}/${stage}: ${selected.length} samples, ${packed.length} bytes`);
  }
}
