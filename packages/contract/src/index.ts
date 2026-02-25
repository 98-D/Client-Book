// packages/contract/src/index.ts
import { z } from "zod";

export const RunState = z.enum([
    "queued",
    "running",
    "paused",
    "succeeded",
    "failed",
    "canceled",
]);
export type RunState = z.infer<typeof RunState>;

export const PauseReason = z.enum(["login", "mfa", "manual"]);
export type PauseReason = z.infer<typeof PauseReason>;