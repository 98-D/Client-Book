// apps/renderer/src/App.tsx
import { useEffect, useMemo, useState } from "react";

import { ClientsPage } from "./ui/clients/ClientsPage";
import type { ClientDraft, ClientRow } from "./ui/clients/types";
import TitleBar from "./ui/TitleBar";
import { applyTheme, getInitialTheme, type ThemeMode } from "./ui/theme";

type AnchorRect = Readonly<{
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
}>;

function toAnchor(r: DOMRect): AnchorRect {
    return {
        top: r.top,
        left: r.left,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
    };
}

function getApi() {
    const api = window.clientbook;
    if (!api) throw new Error("IPC bridge not available (preload missing): window.clientbook is undefined");
    return api;
}

function newDraft(): ClientDraft {
    return {
        company_name: "",
        bn: "",
        year_end_date: null,
        can: null,
        notes: null,
        tags: [],
    };
}

export function App() {
    const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());

    const [search, setSearch] = useState("");
    const [rows, setRows] = useState<ClientRow[]>([]);
    const [draft, setDraft] = useState<ClientDraft | null>(null);
    const [newAnchor, setNewAnchor] = useState<AnchorRect | null>(null);

    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        applyTheme(theme);
    }, [theme]);

    async function refresh(nextSearch?: string) {
        const q = (nextSearch ?? search).trim();
        try {
            setLoading(true);
            setErr(null);

            const api = getApi();
            const list = await api.clients.list(q.length ? q : undefined);
            setRows(list as ClientRow[]);
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Failed to load clients");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void refresh("");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const subtitle = useMemo(() => {
        if (loading) return "Loading…";
        if (err) return err;
        return `${rows.length} client${rows.length === 1 ? "" : "s"}`;
    }, [loading, err, rows.length]);

    return (
        <div className="appRoot">
            <TitleBar
                title="ClientBook"
                subtitle={subtitle}
                search={search}
                onSearchChange={setSearch}
                onSearchCommit={() => void refresh(search)}
                onNew={(rect) => {
                    setNewAnchor(toAnchor(rect));
                    setDraft(newDraft());
                }}
                onRefresh={() => void refresh(search)}
                theme={theme}
                onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            />

            <main className="appMain">
                <ClientsPage
                    rows={rows}
                    loading={loading}
                    error={err}
                    onChangeRows={setRows}
                    onRefresh={() => void refresh(search)}
                    draft={draft}
                    onDraftChange={(d) => {
                        setDraft(d);
                        if (d == null) setNewAnchor(null);
                    }}
                    newAnchor={newAnchor}
                />
            </main>
        </div>
    );
}