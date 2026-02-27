// apps/renderer/src/ui/TitleBar.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Search, UserRound } from "lucide-react";
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
    onProfileClick?: (anchor: DOMRect) => void;
};

function fallbackRect(): DOMRect {
    return new DOMRect(12, 34, 0, 0);
}

function anchorRect(el: HTMLElement | null): DOMRect {
    return el?.getBoundingClientRect() ?? fallbackRect();
}

function isInNoDrag(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return Boolean(el.closest(".noDrag") || el.closest('[data-nodrag="1"]'));
}

function splitWordmark(s: string): { a: string; b?: string } {
    const t = s.trim();
    if (!t) return { a: "" };

    // split on first lower->upper transition: "ClientBook" => "Client" + "Book"
    for (let i = 1; i < t.length; i++) {
        const prev = t[i - 1]!;
        const cur = t[i]!;
        if (
            prev.toLowerCase() === prev &&
            cur.toUpperCase() === cur &&
            cur.toLowerCase() !== cur
        ) {
            return { a: t.slice(0, i), b: t.slice(i) };
        }
    }
    return { a: t };
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
                                     onProfileClick,
                                 }: Props) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const newBtnRef = useRef<HTMLButtonElement | null>(null);
    const profileBtnRef = useRef<HTMLButtonElement | null>(null);
    const searchGroupRef = useRef<HTMLDivElement | null>(null);
    const searchBtnRef = useRef<HTMLButtonElement | null>(null);

    // lock API once
    const winRef = useRef<WinApi | null>(null);
    if (winRef.current === null) winRef.current = getWinApi();

    const [maximized, setMaximized] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);

    const wm = useMemo(() => splitWordmark(title), [title]);

    const openSearch = useCallback(() => setSearchOpen(true), []);
    const closeSearch = useCallback(() => setSearchOpen(false), []);
    const focusSearch = useCallback(() => {
        openSearch();
    }, [openSearch]);

    const fireNew = useCallback(() => {
        onNew(anchorRect(newBtnRef.current));
    }, [onNew]);

    const fireProfile = useCallback(() => {
        if (!onProfileClick) return;
        onProfileClick(anchorRect(profileBtnRef.current));
    }, [onProfileClick]);

    // focus input when opening
    useEffect(() => {
        if (!searchOpen) return;
        const id = requestAnimationFrame(() => inputRef.current?.focus());
        return () => cancelAnimationFrame(id);
    }, [searchOpen]);

    // click-outside closes search (group contains both icon + popover)
    useEffect(() => {
        if (!searchOpen) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node | null;
            if (!t) return;
            const group = searchGroupRef.current;
            if (group && group.contains(t)) return;
            closeSearch();
        };
        document.addEventListener("mousedown", onDown, true);
        return () => document.removeEventListener("mousedown", onDown, true);
    }, [searchOpen, closeSearch]);

    // Esc closes search even if focus isn't in input
    useEffect(() => {
        if (!searchOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                closeSearch();
                searchBtnRef.current?.focus();
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [searchOpen, closeSearch]);

    const handleGlobalHotkeys = useCallback(
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
        window.addEventListener("keydown", handleGlobalHotkeys);
        return () => window.removeEventListener("keydown", handleGlobalHotkeys);
    }, [handleGlobalHotkeys]);

    useEffect(() => {
        const win = winRef.current;
        if (!win) return;

        let alive = true;
        (async () => {
            try {
                const res = await win.isMaximized();
                if (!alive) return;
                setMaximized(!!res?.maximized);
            } catch {
                // ignore
            }
        })();

        return () => {
            alive = false;
        };
    }, []);

    const onMinimize = useCallback(async () => {
        try {
            await winRef.current?.minimize();
        } catch {
            // ignore
        }
    }, []);

    const onToggleMaximize = useCallback(async () => {
        try {
            const res = await winRef.current?.toggleMaximize();
            if (typeof res?.maximized === "boolean") setMaximized(res.maximized);
        } catch {
            // ignore
        }
    }, []);

    const onClose = useCallback(async () => {
        try {
            await winRef.current?.close();
        } catch {
            // ignore
        }
    }, []);

    const themeTitle = theme === "dark" ? "Light mode" : "Dark mode";
    const maxTitle = maximized ? "Restore" : "Maximize";
    const hasWinControls = !!winRef.current;

    return (
        <header className={styles.root}>
            <div
                className={`${styles.dragArea} drag`}
                onDoubleClick={(e) => {
                    if (isInNoDrag(e.target)) return;
                    void onToggleMaximize();
                }}
            >
                {/* LEFT */}
                <div className={`${styles.left} noDrag`} data-nodrag="1" aria-label="Controls">
                    <button
                        className={styles.iconBtn}
                        data-nodrag="1"
                        onClick={onToggleTheme}
                        title={themeTitle}
                        type="button"
                        aria-label={themeTitle}
                    >
                        <span className={styles.themeGlyph} aria-hidden="true" />
                    </button>

                    <button
                        ref={profileBtnRef}
                        className={styles.avatarBtn}
                        data-nodrag="1"
                        onClick={fireProfile}
                        type="button"
                        aria-label="Profile"
                        title="Profile"
                    >
                        <UserRound className={styles.lucide} aria-hidden="true" />
                    </button>

                    <span className={styles.sep} aria-hidden="true" />

                    <button
                        ref={newBtnRef}
                        className={styles.newBtn}
                        data-nodrag="1"
                        onClick={fireNew}
                        title="Create client (Ctrl/Cmd+N)"
                        type="button"
                    >
                        Create
                    </button>

                    <button
                        className={styles.iconBtn}
                        data-nodrag="1"
                        onClick={onRefresh}
                        title="Refresh (Ctrl/Cmd+R)"
                        type="button"
                        aria-label="Refresh"
                    >
                        <RefreshCw className={styles.lucide} aria-hidden="true" />
                    </button>
                </div>

                {/* CENTER (true center, never pushed by right-side expansion) */}
                <div className={styles.center} aria-label="App title">
                    <div className={styles.titleLine} title={subtitle ? `${title} — ${subtitle}` : title}>
            <span className={styles.titleText}>
              <span className={styles.titlePrimary}>{wm.a}</span>
                {wm.b ? <span className={styles.titleAccent}>{wm.b}</span> : null}
            </span>
                        {subtitle ? <span className={styles.subText}>{subtitle}</span> : null}
                    </div>
                </div>

                {/* RIGHT */}
                <div className={`${styles.right} noDrag`} data-nodrag="1" aria-label="Search and window controls">
                    {/* Search group: icon always visible; popover overlays left of the icon (doesn't change layout width) */}
                    <div ref={searchGroupRef} className={styles.searchGroup} data-nodrag="1">
                        <button
                            ref={searchBtnRef}
                            className={`${styles.iconBtn} ${searchOpen ? styles.searchToggleActive : ""}`}
                            data-nodrag="1"
                            onClick={() => setSearchOpen((v) => !v)}
                            type="button"
                            aria-label={searchOpen ? "Close search" : "Open search"}
                            aria-expanded={searchOpen}
                            title={searchOpen ? "Close search (Esc)" : "Search (Ctrl/Cmd+K)"}
                        >
                            <Search className={`${styles.lucide} ${styles.searchToggleIcon}`} aria-hidden="true" />
                        </button>

                        <div
                            className={`${styles.searchPopover} ${searchOpen ? styles.searchPopoverOpen : ""}`}
                            aria-hidden={!searchOpen}
                        >
                            <div className={styles.searchShell}>
                                <input
                                    ref={inputRef}
                                    className={styles.searchInput}
                                    value={search}
                                    onChange={(e) => onSearchChange(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") onSearchCommit();
                                        if (e.key === "Escape") {
                                            e.preventDefault();
                                            closeSearch();
                                            (e.currentTarget as HTMLInputElement).blur();
                                        }
                                    }}
                                    placeholder="Search…"
                                    spellCheck={false}
                                />
                            </div>
                        </div>
                    </div>

                    {hasWinControls ? (
                        <div className={styles.winControls} aria-label="Window controls">
                            <div className={styles.traffic} aria-label="Window">
                                <button
                                    className={`${styles.trafficBtn} ${styles.trafficMinimize}`}
                                    onClick={onMinimize}
                                    type="button"
                                    aria-label="Minimize"
                                    title="Minimize"
                                />
                                <button
                                    className={`${styles.trafficBtn} ${styles.trafficMaximize} ${maximized ? styles.trafficMaximized : ""}`}
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