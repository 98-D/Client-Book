export {};

declare global {
    interface Window {
        clientbook: Readonly<{
            clients: Readonly<{
                list(search?: string): Promise<any[]>;
                get(id: string): Promise<any | null>;
                upsert(input: unknown): Promise<{ id: string }>;
                delete(id: string): Promise<{ ok: true }>;
            }>;
            profiles: Readonly<{
                list(): Promise<any[]>;
                get(id: string): Promise<any | null>;
                upsert(input: unknown): Promise<{ id: string }>;
                delete(id: string): Promise<{ ok: true }>;
            }>;
            links: Readonly<{
                listForClient(clientId: string): Promise<any[]>;
                link(clientId: string, profileId: string): Promise<{ ok: true }>;
                unlink(clientId: string, profileId: string): Promise<{ ok: true }>;
                setDefault(clientId: string, profileId: string): Promise<{ ok: true }>;
            }>;
            runs: Readonly<{
                create(input: unknown): Promise<{ runId: string; jarId: string; jarPath: string }>;
                cancel(runId: string): Promise<{ ok: true }>;
                listRecent(limit?: number): Promise<any[]>;
                getEvents(runId: string, afterSeq?: number, limit?: number): Promise<any[]>;
                onEvent(cb: (ev: unknown) => void): () => void;
            }>;
            worker: Readonly<{
                status(): Promise<{ configured: boolean; entryPath: string | null; running?: boolean; pid?: number | null }>;
            }>;
        }>;
    }
}