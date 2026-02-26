// apps/renderer/src/ui/clients/types.ts

/**
 * Branded IDs keep accidental mixups from spreading.
 * (No runtime cost; purely TS.)
 */
type Brand<T, B extends string> = T & { readonly __brand: B };

export type ClientId = Brand<string, "ClientId">;
export type IsoDate = Brand<string, "IsoDate">; // "YYYY-MM-DD"
export type IsoDateTime = Brand<string, "IsoDateTime">; // ISO8601 timestamp

export type ClientRow = Readonly<{
    id: ClientId;
    company_name: string;
    bn: string; // 9 digits; validate in UI when editing
    year_end_date: IsoDate | null;
    can: string | null;
    notes: string | null;

    // Normalize: always present, never null (easier for UI)
    tags: readonly string[];

    created_at: IsoDateTime;
    updated_at: IsoDateTime;
}>;

export type ClientDraft = Readonly<{
    id?: ClientId;

    company_name: string;
    bn: string;

    year_end_date?: IsoDate | null;
    can?: string | null;
    notes?: string | null;

    // Draft allows undefined (not set) but never null
    tags?: readonly string[];
}>;

export type ClientPatch = Readonly<{
    id: ClientId;
    company_name?: string;
    bn?: string;
    year_end_date?: IsoDate | null;
    can?: string | null;
    notes?: string | null;
    tags?: readonly string[];
}>;

// Helpful UI helpers (pure typing; you can implement runtime elsewhere)
export type ClientSortKey = "company_name" | "bn" | "year_end_date" | "updated_at";
export type ClientFilter = Readonly<{
    q?: string;
    tag?: string;
}>;