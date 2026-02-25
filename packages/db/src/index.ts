// packages/db/src/index.ts
// Public surface for @clientbook/db (NodeNext ESM)

export { openDb, type Db } from "./openDb.js";
export { MIGRATIONS, type Migration } from "./migrations.js";

export {
    // Clients
    listClients,
    getClient,
    upsertClient,
    deleteClient,
    type UpsertClientInput,

    // Credential profiles
    listCredentialProfiles,
    getCredentialProfile,
    upsertCredentialProfile,
    deleteCredentialProfile,
    markCredentialProfileUsed,
    type UpsertCredentialProfileInput,

    // Client ↔ profile links
    linkClientToProfile,
    unlinkClientFromProfile,
    listClientProfiles,
    getDefaultProfileForClient,

    // Session jars
    getSessionJarByProfileScope,
    upsertSessionJar,
    invalidateSessionJar,
    markSessionJarSuccess,
    markSessionJarValidated,

    // Runs + events
    createRun,
    requestCancelRun,
    setRunState,
    appendRunEvent,
    type CreateRunInput,
} from "./queries.js";

export {
    ClientRowZ,
    CredentialProfileRowZ,
    ClientProfileLinkRowZ,
    SessionJarRowZ,
    RunRowZ,
    RunEventRowZ,
    RunArtifactRowZ,
    type ClientRow,
    type CredentialProfileRow,
    type ClientProfileLinkRow,
    type SessionJarRow,
    type RunRow,
    type RunEventRow,
    type RunArtifactRow,
    parseClientRow,
    parseCredentialProfileRow,
    parseSessionJarRow,
    parseRunRow,
    parseRunEventRow,
    parseRunArtifactRow,
} from "./zod.js";