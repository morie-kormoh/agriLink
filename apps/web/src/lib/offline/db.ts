import Dexie, { type EntityTable } from "dexie";
import type { RegisterFarmerInput } from "@agrilink/validation";

export type PendingStatus = "pending" | "syncing" | "synced" | "error" | "invalid";

export interface PendingFarmer {
  clientRef: string;
  payload: RegisterFarmerInput;
  /** For list display without parsing the payload */
  fullName: string;
  phone: string;
  status: PendingStatus;
  attempts: number;
  nextAttemptAt: number;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  agrilinkId?: string;
  farmerId?: string;
  duplicateOf?: string | null;
  warnings?: string[];
  photoUploaded?: boolean;
  createdAt: number;
  syncedAt?: number;
  /** Which signed-in user captured it (records are per agent on shared devices) */
  ownerUserId: string;
}

export interface PendingPhoto {
  clientRef: string;
  blob: Blob;
  type: string;
}

export interface CachedValue {
  key: string;
  value: unknown;
  updatedAt: number;
}

/**
 * Agent device storage (module 02 offline design):
 *  pendingFarmers – registrations waiting to sync
 *  pendingPhotos  – compressed photos uploaded after their record syncs
 *  cache          – reference data (districts, chiefdoms, crops) and sync metadata
 */
export class AgriLinkOfflineDB extends Dexie {
  pendingFarmers!: EntityTable<PendingFarmer, "clientRef">;
  pendingPhotos!: EntityTable<PendingPhoto, "clientRef">;
  cache!: EntityTable<CachedValue, "key">;

  constructor() {
    super("agripay-offline");
    this.version(1).stores({
      pendingFarmers: "clientRef, status, ownerUserId, createdAt, nextAttemptAt",
      pendingPhotos: "clientRef",
      cache: "key",
    });
  }
}

let instance: AgriLinkOfflineDB | null = null;

export function offlineDb(): AgriLinkOfflineDB {
  instance ??= new AgriLinkOfflineDB();
  return instance;
}
