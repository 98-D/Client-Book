// apps/renderer/src/ui/clients/ClientsPage.tsx
import { useState } from "react";
import type { ClientDraft, ClientId, ClientRow, IsoDate } from "./types";
import { ClientRowView } from "./ClientRowView";
import { NewClientOverlay } from "./NewClientOverlay";
import { ToastHost, useToasts } from "../toast/ToastHost";
import styles from "./ClientsPage.module.css";

type AnchorRect = Readonly<{
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}>;

function getApi() {
  const api = window.clientbook;
  if (!api) throw new Error("IPC bridge not available (preload missing): window.clientbook is undefined");
  return api;
}

function normalize(s: string) {
  return s.trim();
}

function isValidBn(bn: string): boolean {
  return /^\d{9}$/.test(bn.trim());
}

function isValidYmd(s: string): boolean {
  const t = s.trim();
  if (t.length === 0) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const dt = new Date(`${t}T00:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === t;
}

async function saveClient(draft: ClientDraft): Promise<void> {
  const api = getApi();
  await api.clients.upsert(draft);
}

async function deleteClient(id: ClientId): Promise<void> {
  const api = getApi();
  await api.clients.delete(id);
}

export function ClientsPage(props: {
  rows: ClientRow[];
  loading: boolean;
  error: string | null;
  onChangeRows: (rows: ClientRow[]) => void;
  onRefresh: () => void;

  draft: ClientDraft | null;
  onDraftChange: (d: ClientDraft | null) => void;

  // ✅ new: where to anchor the popover
  newAnchor: AnchorRect | null;
}) {
  const toast = useToasts();
  const [busyRowId, setBusyRowId] = useState<string | null>(null);

  async function saveNewClient(d: ClientDraft): Promise<void> {
    const company = normalize(d.company_name);
    const bn = normalize(d.bn);
    const yeStr = normalize(String(d.year_end_date ?? ""));
    const canStr = normalize(String(d.can ?? ""));
    const notesStr = normalize(String(d.notes ?? ""));

    if (!company.length) throw new Error("Company name required");
    if (!bn.length) throw new Error("BN required");
    if (!isValidBn(bn)) throw new Error("BN must be 9 digits");
    if (yeStr.length && !isValidYmd(yeStr)) throw new Error("Year-end must be YYYY-MM-DD");

    const year_end_date = yeStr.length ? (yeStr as IsoDate) : null;
    const can = canStr.length ? canStr : null;
    const notes = notesStr.length ? notesStr : null;
    const tags = (d.tags ?? []).map((t) => t.trim()).filter(Boolean);

    await saveClient({
      ...d,
      company_name: company,
      bn,
      year_end_date,
      can,
      notes,
      tags,
    });

    toast.ok("Client created ✓");
    props.onRefresh();
  }

  return (
      <div className={styles.root}>
        <ToastHost {...toast.bindings} />

        <NewClientOverlay
            open={props.draft != null}
            anchor={props.newAnchor}
            initial={props.draft ?? undefined}
            onClose={() => props.onDraftChange(null)}
            onSave={saveNewClient}
        />

        <div className={styles.listWrap}>
          <div className={styles.panel}>
            <div className={styles.header}>
              <div className={styles.th}>Company</div>
              <div className={styles.th}>BN</div>
              <div className={styles.th}>YE</div>
              <div className={styles.th}>CAN</div>
              <div className={styles.th} style={{ textAlign: "right" }}>
                Actions
              </div>
            </div>

            <div className={styles.body}>
              {props.rows.length === 0 ? <div className={styles.empty}>No clients yet.</div> : null}

              {props.rows.map((r) => (
                  <ClientRowView
                      key={r.id}
                      row={r}
                      busy={busyRowId === (r.id as unknown as string)}
                      onSave={async (draft) => {
                        try {
                          setBusyRowId(r.id as unknown as string);
                          await saveClient(draft);
                          toast.ok("Saved ✓");
                          props.onRefresh();
                        } catch (e) {
                          toast.err(e instanceof Error ? e.message : "Failed to save");
                        } finally {
                          setBusyRowId(null);
                        }
                      }}
                      onDelete={async (id) => {
                        try {
                          setBusyRowId(r.id as unknown as string);
                          await deleteClient(id as ClientId);
                          toast.ok("Deleted");
                          props.onRefresh();
                        } catch (e) {
                          toast.err(e instanceof Error ? e.message : "Failed to delete");
                        } finally {
                          setBusyRowId(null);
                        }
                      }}
                  />
              ))}
            </div>
          </div>

          {props.loading ? <div className={styles.note}>Loading…</div> : null}
          {props.error ? <div className={`${styles.note} ${styles.noteErr}`}>{props.error}</div> : null}
        </div>
      </div>
  );
}