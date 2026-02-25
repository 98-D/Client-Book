import { z } from "zod";
import {
    ClientRowZ,
    ProfileRowZ,
    ClientProfileLinkRowZ,
    RunRowZ,
    RunEventRowZ,
    RunPushEventZ,
    type ClientRow,
    type ProfileRow,
    type ClientProfileLinkRow,
    type RunRow,
    type RunEventRow,
    type RunPushEvent,
} from "./schemas";

function api() {
    if (!window.clientbook) throw new Error("window.clientbook missing (preload not loaded)");
    return window.clientbook;
}

export const clientbook = {
    workerStatus: () => api().worker.status(),

    clients: {
        list: async (search?: string): Promise<ClientRow[]> => z.array(ClientRowZ).parse(await api().clients.list(search)),
        upsert: async (input: any): Promise<string> => z.object({ id: z.string() }).parse(await api().clients.upsert(input)).id,
        remove: async (id: string) => { await api().clients.delete(id); },
    },

    profiles: {
        list: async (): Promise<ProfileRow[]> => z.array(ProfileRowZ).parse(await api().profiles.list()),
        upsert: async (input: any): Promise<string> => z.object({ id: z.string() }).parse(await api().profiles.upsert(input)).id,
        remove: async (id: string) => { await api().profiles.delete(id); },
    },

    links: {
        listForClient: async (clientId: string): Promise<ClientProfileLinkRow[]> =>
            z.array(ClientProfileLinkRowZ).parse(await api().links.listForClient(clientId)),
        link: async (clientId: string, profileId: string) => { await api().links.link(clientId, profileId); },
        unlink: async (clientId: string, profileId: string) => { await api().links.unlink(clientId, profileId); },
        setDefault: async (clientId: string, profileId: string) => { await api().links.setDefault(clientId, profileId); },
    },

    runs: {
        create: (input: any) => api().runs.create(input),
        cancel: async (runId: string) => { await api().runs.cancel(runId); },
        listRecent: async (limit = 60): Promise<RunRow[]> => z.array(RunRowZ).parse(await api().runs.listRecent(limit)),
        getEvents: async (runId: string, afterSeq = 0, limit = 250): Promise<RunEventRow[]> =>
            z.array(RunEventRowZ).parse(await api().runs.getEvents(runId, afterSeq, limit)),
        onEvent: (cb: (ev: RunPushEvent) => void) =>
            api().runs.onEvent((raw) => {
                const parsed = RunPushEventZ.safeParse(raw);
                if (parsed.success) cb(parsed.data);
            }),
    },
};