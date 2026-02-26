// apps/renderer/src/ui/theme.ts
export type ThemeMode = "dark" | "light";

const KEY = "clientbook.theme";

export function getInitialTheme(): ThemeMode {
    try {
        const saved = localStorage.getItem(KEY);
        if (saved === "dark" || saved === "light") return saved;
    } catch {
        // ignore
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

export function applyTheme(theme: ThemeMode) {
    // CSS hook
    document.documentElement.dataset.theme = theme;
    // helps form controls / scrollbars
    document.documentElement.style.colorScheme = theme;

    try {
        localStorage.setItem(KEY, theme);
    } catch {
        // ignore
    }

    // Optional IPC bridge (if you add it later)
    try {
        (window.clientbook as any)?.theme?.set?.(theme);
    } catch {
        // ignore
    }
}