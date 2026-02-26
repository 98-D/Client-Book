// apps/renderer/src/ui/TitleBar.tsx
import { useCallback, useEffect, useMemo, useRef, useState, type SVGProps } from "react";
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

    // future: profile popover hook (anchor provided)
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
        if (prev.toLowerCase() === prev && cur.toUpperCase() === cur && cur.toLowerCase() !== cur) {
            return { a: t.slice(0, i), b: t.slice(i) };
        }
    }
    return { a: t };
}

/* ---------- icons ---------- */

function IconSearch(props: SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true" {...props}>
            <path
                d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
                stroke="currentColor"
                strokeWidth="1.8"
            />
            <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

function IconEnter(props: SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true" {...props}>
            <path d="M10 7h7a3 3 0 0 1 3 3v7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M10 17l-4-4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M6 13h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

function IconRefresh(props: SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true" {...props}>
            <path
                d="M20 12a8 8 0 1 1-2.34-5.66"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
            />
            <path d="M20 4v6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function IconMore(props: SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true" {...props}>
            <circle cx="6" cy="12" r="1.7" />
            <circle cx="12" cy="12" r="1.7" />
            <circle cx="18" cy="12" r="1.7" />
        </svg>
    );
}

function IconUser(props: SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true" {...props}>
            <path
                d="M12 12.2c2.1 0 3.8-1.7 3.8-3.8S14.1 4.6 12 4.6 8.2 6.3 8.2 8.4 9.9 12.2 12 12.2Z"
                stroke="currentColor"
                strokeWidth="1.8"
            />
            <path
                d="M5.6 19.4c1.3-3 3.6-4.4 6.4-4.4s5.1 1.4 6.4 4.4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
            />
        </svg>
    );
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

    // lock API once
    const winRef = useRef<WinApi | null>(null);
    if (winRef.current === null) winRef.current = getWinApi();

    const [maximized, setMaximized] = useState(false);

    const focusSearch = useCallback(() => inputRef.current?.focus(), []);

    const fireNew = useCallback(() => {
        onNew(anchorRect(newBtnRef.current));
    }, [onNew]);

    const fireProfile = useCallback(() => {
        if (!onProfileClick) return;
        onProfileClick(anchorRect(profileBtnRef.current));
    }, [onProfileClick]);

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

    const wm = useMemo(() => splitWordmark(title), [title]);

    return (
        <header className={styles.root}>
            <div
                className={`${styles.dragArea} drag`}
                onDoubleClick={(e) => {
                    if (isInNoDrag(e.target)) return;
                    void onToggleMaximize();
                }}
            >
                {/* LEFT: controls */}
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
                        <IconUser />
                    </button>

                    <span className={styles.sep} aria-hidden="true" />

                    <button
                        ref={newBtnRef}
                        className={styles.newBtn}
                        data-nodrag="1"
                        onClick={fireNew}
                        title="New client (Ctrl/Cmd+N)"
                        type="button"
                    >
                        New
                    </button>

                    <button
                        className={styles.iconBtn}
                        data-nodrag="1"
                        onClick={onRefresh}
                        title="Refresh (Ctrl/Cmd+R)"
                        type="button"
                        aria-label="Refresh"
                    >
                        <IconRefresh />
                    </button>

                    <button className={styles.iconBtn} data-nodrag="1" onClick={() => {}} title="More" type="button" aria-label="More">
                        <IconMore />
                    </button>
                </div>

                {/* CENTER: premium wordmark (centered within available space between left+right, not absolute window center) */}
                <div className={styles.center} aria-label="App title">
                    <div className={styles.titleLine} title={subtitle ? `${title} · ${subtitle}` : title}>
            <span className={styles.titleText}>
              <span className={styles.titlePrimary}>{wm.a}</span>
                {wm.b ? <span className={styles.titleAccent}>{wm.b}</span> : null}
            </span>

                        {subtitle ? (
                            <>
                <span className={styles.titleDot} aria-hidden="true">
                  ·
                </span>
                                <span className={styles.subText}>{subtitle}</span>
                            </>
                        ) : null}
                    </div>
                </div>

                {/* RIGHT: tighter search + window controls */}
                <div className={`${styles.right} noDrag`} data-nodrag="1" aria-label="Search and window controls">
                    <div className={styles.searchShell} data-nodrag="1">
            <span className={styles.searchIcon} aria-hidden="true">
              <IconSearch />
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
                            placeholder="Search…"
                            spellCheck={false}
                        />

                        <button
                            className={styles.searchAction}
                            data-nodrag="1"
                            onClick={onSearchCommit}
                            title="Search (Enter)"
                            type="button"
                            aria-label="Search"
                        >
                            <IconEnter />
                        </button>
                    </div>

                    {hasWinControls ? (
                        <div className={styles.winControls} aria-label="Window controls">
                            <div className={styles.traffic} aria-label="Window">
                                {/* order: minimize, maximize, close (close furthest right) */}
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