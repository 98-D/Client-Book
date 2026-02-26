// apps/renderer/src/ui/TitleBar.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./TitleBar.module.css";
import type { ThemeMode } from "./theme";

type WindowResultOk = Readonly<{ ok: true }>;
type WindowResultMax = Readonly<{ maximized: boolean }>;

type WinApi = {
    minimize: () => Promise<WindowResultOk>;
    toggleMaximize: () => Promise<WindowResultMax>;
    isMaximized: () => Promise<WindowResultMax>;
    close: () => Promise<WindowResultOk>;
};

function getWinApi(): WinApi | null {
    return (window.clientbook?.window as WinApi | undefined) ?? null;
}

type Props = {
    title: string;
    subtitle?: string;

    search: string;
    onSearchChange: (v: string) => void;
    onSearchCommit: () => void;

    onNew: (anchor: DOMRect) => void;
    onRefresh: () => void;

    theme: ThemeMode;
    onToggleTheme: () => void;
};

function fallbackRect(): DOMRect {
    // fallback for hotkey open before button ref exists
    return new DOMRect(12, 34, 0, 0);
}

export default function TitleBar({
                                     title,
                                     subtitle,
                                     search,
                                     onSearchChange,
                                     onSearchCommit,
                                     onNew,
                                     onRefresh,
                                     theme,
                                     onToggleTheme,
                                 }: Props) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const newBtnRef = useRef<HTMLButtonElement | null>(null);

    const win = useMemo(() => getWinApi(), []);
    const hasWinControls = !!win;

    const [maximized, setMaximized] = useState(false);

    const focusSearch = useCallback(() => inputRef.current?.focus(), []);

    const fireNew = useCallback(() => {
        const r = newBtnRef.current?.getBoundingClientRect() ?? fallbackRect();
        onNew(r);
    }, [onNew]);

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            const mod = e.ctrlKey || e.metaKey;
            if (!mod) return;

            if (key === "k") {
                e.preventDefault();
                focusSearch();
                return;
            }
            if (key === "r") {
                e.preventDefault();
                onRefresh();
                return;
            }
            if (key === "n") {
                e.preventDefault();
                fireNew();
            }
        },
        [focusSearch, onRefresh, fireNew]
    );

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);

    // initial maximize state
    useEffect(() => {
        if (!hasWinControls) return;
        let alive = true;
        (async () => {
            try {
                const res = await win?.isMaximized();
                if (!alive) return;
                setMaximized(!!res?.maximized);
            } catch {
                // ignore
            }
        })();
        return () => {
            alive = false;
        };
    }, [hasWinControls, win]);

    const onMinimize = useCallback(async () => {
        try {
            await win?.minimize();
        } catch {
            // ignore
        }
    }, [win]);

    const onToggleMaximize = useCallback(async () => {
        try {
            const res = await win?.toggleMaximize();
            if (typeof res?.maximized === "boolean") setMaximized(res.maximized);
        } catch {
            // ignore
        }
    }, [win]);

    const onClose = useCallback(async () => {
        try {
            await win?.close();
        } catch {
            // ignore
        }
    }, [win]);

    const themeTitle = theme === "dark" ? "Light mode" : "Dark mode";
    const maxTitle = maximized ? "Restore" : "Maximize";

    return (
        <header className={styles.root}>
            {/* Drag region: everything inside dragArea is draggable EXCEPT .noDrag children */}
            <div className={`${styles.dragArea} drag`} onDoubleClick={() => void onToggleMaximize()}>
                {/* LEFT: theme toggle first (far left), then brand (no pill) */}
                <div className={styles.left}>
                    <button
                        className={`${styles.iconBtn} noDrag`}
                        onClick={onToggleTheme}
                        title={themeTitle}
                        type="button"
                        aria-label={themeTitle}
                    >
                        <span className={styles.themeGlyph} aria-hidden="true" />
                    </button>

                    <div className={styles.brand}>
                        <div className={styles.brandDot} aria-hidden="true" />
                        <div className={styles.brandText}>
                            <div className={styles.brandTitle}>{title}</div>
                            {subtitle ? <div className={styles.brandSub}>{subtitle}</div> : null}
                        </div>
                    </div>
                </div>

                {/* CENTER: search only (no refresh/theme inside) */}
                <div className={styles.center}>
                    <div className={`${styles.searchPill} noDrag`}>
                        <span className={styles.searchIcon} aria-hidden="true">
                            ⌕
                        </span>
                        <input
                            ref={inputRef}
                            className={styles.searchInput}
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") onSearchCommit();
                                if (e.key === "Escape") (e.currentTarget as HTMLInputElement).blur();
                            }}
                            placeholder="Search (Company / BN / CAN)…"
                            spellCheck={false}
                        />
                        <button
                            className={styles.searchBtn}
                            onClick={onSearchCommit}
                            title="Search (Enter)"
                            type="button"
                            aria-label="Search"
                        >
                            ↵
                        </button>
                    </div>

                    <button
                        className={`${styles.iconBtn} noDrag`}
                        onClick={onRefresh}
                        title="Refresh (Ctrl/Cmd+R)"
                        type="button"
                        aria-label="Refresh"
                    >
                        ⟳
                    </button>
                </div>

                {/* RIGHT: actions + window controls (close is furthest right) */}
                <div className={`${styles.right} noDrag`}>
                    <div className={styles.actions}>
                        <button
                            ref={newBtnRef}
                            className={styles.primaryBtn}
                            onClick={fireNew}
                            title="New client (Ctrl/Cmd+N)"
                            type="button"
                        >
                            New
                        </button>

                        <button className={styles.ghostBtn} onClick={() => {}} title="More" type="button" aria-label="More">
                            ⋯
                        </button>
                    </div>

                    {hasWinControls ? (
                        <div className={styles.winControls} aria-label="Window controls">
                            <div className={styles.traffic} aria-label="Window">
                                {/* order: minimize, maximize (green), close (furthest right) */}
                                <button
                                    className={`${styles.trafficBtn} ${styles.trafficMinimize}`}
                                    onClick={onMinimize}
                                    type="button"
                                    aria-label="Minimize"
                                    title="Minimize"
                                />
                                <button
                                    className={`${styles.trafficBtn} ${styles.trafficMaximize} ${
                                        maximized ? styles.trafficMaximized : ""
                                    }`}
                                    onClick={() => void onToggleMaximize()}
                                    type="button"
                                    aria-label={maxTitle}
                                    title={maxTitle}
                                />
                                <button
                                    className={`${styles.trafficBtn} ${styles.trafficClose}`}
                                    onClick={onClose}
                                    type="button"
                                    aria-label="Close"
                                    title="Close"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className={styles.winControls} aria-hidden="true" />
                    )}
                </div>
            </div>
        </header>
    );
}