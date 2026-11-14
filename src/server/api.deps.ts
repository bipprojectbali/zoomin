import type { Database } from "bun:sqlite";
import type { RoomServiceClient } from "livekit-server-sdk";
import type { Config } from "./config";

/** Dependency yang disuntikkan ke semua plugin route (bisa diganti fake di test). */
export type ApiDeps = { db: Database; config: Config; roomService: RoomServiceClient };
