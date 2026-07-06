import sharp from "sharp";
import { readFileSync } from "node:fs";

const svg = readFileSync(new URL("../src/app/icon.svg", import.meta.url));
const targets = [
  { size: 180, path: "src/app/apple-icon.png" },
  { size: 192, path: "public/icon-192.png" },
  { size: 512, path: "public/icon-512.png" },
];
for (const { size, path } of targets) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(path);
  console.log("wrote", path, `${size}x${size}`);
}
