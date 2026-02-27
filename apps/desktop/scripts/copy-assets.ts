import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve("src/assets");
const DST = path.resolve("dist/assets");

fs.mkdirSync(DST, { recursive: true });

for (const name of fs.readdirSync(SRC)) {
    const from = path.join(SRC, name);
    const to = path.join(DST, name);
    fs.copyFileSync(from, to);
}

console.log("[copy-assets] copied src/assets -> dist/assets");