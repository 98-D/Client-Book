// apps/desktop/scripts/rename-preload.cjs
const fs = require("node:fs");
const path = require("node:path");

function exists(p) {
    try {
        fs.accessSync(p, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

function rmIfExists(p) {
    if (!exists(p)) return;
    try {
        fs.rmSync(p, { recursive: true, force: true });
    } catch {
        // ignore
    }
}

const DIST = path.join(__dirname, "..", "dist");

// tsc -p tsconfig.preload.json with src/preload.ts -> dist/preload.js
const builtJs = path.join(DIST, "preload.js");
const outCjs = path.join(DIST, "preload.cjs");

if (!exists(builtJs)) {
    throw new Error(
        `[rename-preload] Expected ${builtJs} but it does not exist. Did tsconfig.preload.json output to dist/?`
    );
}

// Make output deterministic
rmIfExists(outCjs);
fs.renameSync(builtJs, outCjs);

// If older layouts exist, remove so resolvePreloadPath won’t pick them first
rmIfExists(path.join(DIST, "preload")); // dist/preload/**

console.log("[rename-preload] wrote", outCjs);