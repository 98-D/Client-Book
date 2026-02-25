// apps/desktop/src/secureStore.ts
//
// ClientBook — Secure Store (Electron safeStorage)
// Production notes:
// - Uses OS-backed encryption via Electron safeStorage.
// - We store ciphertext as base64 text for SQLite.
// - Includes: explicit availability checks, input validation, and safe error messages.
// - If safeStorage is unavailable (rare, but can happen in some environments),
//   you should refuse to store secrets rather than falling back to plaintext.

import { safeStorage } from "electron";

function requireEncryptionAvailable(): void {
    if (!safeStorage.isEncryptionAvailable()) {
        // Don't fall back to plaintext. This is a hard safety boundary.
        throw new Error(
            "Secure encryption is not available on this machine (electron.safeStorage). Cannot store or decrypt passwords."
        );
    }
}

export function encryptToB64(plain: string): string {
    requireEncryptionAvailable();

    const s = String(plain ?? "");
    if (s.length === 0) throw new Error("Password is empty.");
    // Optional: keep this bounded so you don't accidentally store megabytes.
    if (s.length > 10_000) throw new Error("Password is unexpectedly large.");

    const buf = safeStorage.encryptString(s);
    return buf.toString("base64");
}

export function decryptFromB64(encB64: string): string {
    requireEncryptionAvailable();

    const b64 = String(encB64 ?? "").trim();
    if (b64.length === 0) throw new Error("Encrypted password blob is empty.");

    let buf: Buffer;
    try {
        buf = Buffer.from(b64, "base64");
    } catch {
        throw new Error("Encrypted password blob is not valid base64.");
    }

    try {
        return safeStorage.decryptString(buf);
    } catch {
        // Avoid leaking details. Treat as corrupted or different user context.
        throw new Error(
            "Failed to decrypt stored password. It may be corrupted or was created under a different OS user/profile."
        );
    }
}