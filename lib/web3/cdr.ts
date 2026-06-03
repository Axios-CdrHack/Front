"use client";

import {
  CDR_LICENSE_READ_CONDITION_ADDRESS,
  CDR_OWNER_WRITE_CONDITION_ADDRESS,
  STORY_AENEID_CHAIN,
  STORY_AENEID_LICENSE_TOKEN_ADDRESS,
  STORY_AENEID_RPC_URL,
} from "./network";
import { API_BASE_URL } from "../api";
import type { ExportPlan } from "../types";
import type { PrivyWalletConnection } from "./privy";

export type CdrDeployStage =
  | "connect_wallet"
  | "allocate"
  | "encrypt"
  | "write"
  | "complete";

export type CdrDeployStageUpdate = {
  key: CdrDeployStage;
  message: string;
};

export type DeployInlineCdrVaultOptions = {
  onStageChange?(stage: CdrDeployStageUpdate): void;
};

let wasmReady: Promise<void> | null = null;

async function ensureWasm(initWasm: () => Promise<void>) {
  wasmReady ??= initWasm();
  await wasmReady;
}

async function importAtRuntime<T>(specifier: string): Promise<T> {
  return new Function("modulePath", "return import(modulePath)")(specifier) as Promise<T>;
}

function emitStage(options: DeployInlineCdrVaultOptions | undefined, key: CdrDeployStage, message: string) {
  options?.onStageChange?.({ key, message });
}

function buildVaultPayload(input: { label: string; value: string }) {
  return new TextEncoder().encode(JSON.stringify({ label: input.label, value: input.value }));
}

function decodeVaultPayload(dataKey: Uint8Array) {
  const payload = JSON.parse(new TextDecoder().decode(dataKey)) as { value?: unknown };
  if (typeof payload.value !== "string") throw new Error("invalid_cdr_payload");
  return payload.value;
}

function normalizeCdrUuid(uuid: string | number) {
  const parsed = Number(uuid);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error("invalid_cdr_vault_uuid");
  return parsed;
}

export async function deployInlineCdrVaultBatch(
  wallet: PrivyWalletConnection,
  input: { label: string; value: string; licenseIpId: `0x${string}` },
  options?: DeployInlineCdrVaultOptions,
) {
  if (typeof window === "undefined") throw new Error("browser_required");

  const apiUrl = `${API_BASE_URL.replace(/\/+$/, "")}/cdr-api`;
  const { account, walletClient } = wallet;
  if (!account) throw new Error("wallet_account_not_found");
  emitStage(options, "connect_wallet", "Preparing wallet");

  const [{ Observer }, { Uploader }, { conditions }, { uuidToLabel }, { initWasm }, viem] = await Promise.all([
    importAtRuntime<typeof import("@piplabs/cdr-sdk/dist/observer.js")>("@piplabs/cdr-sdk/dist/observer.js"),
    importAtRuntime<typeof import("@piplabs/cdr-sdk/dist/uploader.js")>("@piplabs/cdr-sdk/dist/uploader.js"),
    importAtRuntime<typeof import("@piplabs/cdr-sdk/dist/conditions.js")>("@piplabs/cdr-sdk/dist/conditions.js"),
    importAtRuntime<typeof import("@piplabs/cdr-sdk/dist/label.js")>("@piplabs/cdr-sdk/dist/label.js"),
    importAtRuntime<typeof import("@piplabs/cdr-crypto")>("@piplabs/cdr-crypto"),
    import("viem"),
  ]);
  await ensureWasm(initWasm);

  const publicClient = viem.createPublicClient({
    chain: STORY_AENEID_CHAIN,
    transport: viem.http(STORY_AENEID_RPC_URL),
  });
  const observer = new Observer({
    network: "testnet",
    publicClient,
    apiUrl,
  });
  const uploader = new Uploader({
    network: "testnet",
    publicClient,
    walletClient,
    observer,
  });

  const writeCondition = conditions.ownerOnly({
    address: CDR_OWNER_WRITE_CONDITION_ADDRESS,
    owner: account,
  });
  const readCondition = conditions.custom({
    address: CDR_LICENSE_READ_CONDITION_ADDRESS,
    conditionData: viem.encodeAbiParameters(
      [{ type: "address" }, { type: "address" }],
      [STORY_AENEID_LICENSE_TOKEN_ADDRESS, input.licenseIpId],
    ),
  });

  // CDR deployment uses two on-chain steps: allocate first, then write.
  emitStage(options, "allocate", "Step 1/2: allocate vault");
  const { uuid, txHash: allocateTxHash } = await uploader.allocate({
    updatable: false,
    writeConditionAddr: writeCondition.address,
    readConditionAddr: readCondition.address,
    writeConditionData: writeCondition.conditionData,
    readConditionData: readCondition.conditionData,
  });

  emitStage(options, "encrypt", "Encrypting vault payload");
  const ciphertext = await uploader.encryptDataKey({
    dataKey: buildVaultPayload(input),
    label: uuidToLabel(uuid),
  });

  emitStage(options, "write", "Step 2/2: write encrypted vault");
  const { txHash: writeTxHash } = await uploader.write({
    uuid,
    accessAuxData: "0x",
    encryptedData: viem.toHex(ciphertext.raw),
  });

  emitStage(options, "complete", "CDR on");
  return {
    cdrVaultUuid: String(uuid),
    deployTxHash: writeTxHash,
    allocateTxHash,
  };
}

export const deployInlineCdrVault = deployInlineCdrVaultBatch;

export async function readInlineCdrVault(wallet: PrivyWalletConnection, item: ExportPlan["items"][number]) {
  if (typeof window === "undefined") throw new Error("browser_required");
  if (!item.cdrVaultUuid) throw new Error("cdr_vault_uuid_missing");
  if (!item.licenseTokenIds?.length) throw new Error("cdr_license_token_ids_missing");
  if (!item.accessAuxData || item.accessAuxData === "0x") throw new Error("cdr_access_aux_data_missing");

  const apiUrl = `${API_BASE_URL.replace(/\/+$/, "")}/cdr-api`;
  const { walletClient } = wallet;
  const [{ Observer }, { Consumer }, { initWasm }, viem] = await Promise.all([
    importAtRuntime<typeof import("@piplabs/cdr-sdk/dist/observer.js")>("@piplabs/cdr-sdk/dist/observer.js"),
    importAtRuntime<typeof import("@piplabs/cdr-sdk/dist/consumer.js")>("@piplabs/cdr-sdk/dist/consumer.js"),
    importAtRuntime<typeof import("@piplabs/cdr-crypto")>("@piplabs/cdr-crypto"),
    import("viem"),
  ]);
  await ensureWasm(initWasm);

  const publicClient = viem.createPublicClient({
    chain: STORY_AENEID_CHAIN,
    transport: viem.http(STORY_AENEID_RPC_URL),
  });
  const observer = new Observer({
    network: "testnet",
    publicClient,
    apiUrl,
  });
  const consumer = new Consumer({
    network: "testnet",
    publicClient,
    walletClient,
    observer,
    apiUrl,
  });

  const { dataKey } = await consumer.accessCDR({
    uuid: normalizeCdrUuid(item.cdrVaultUuid),
    accessAuxData: item.accessAuxData as `0x${string}`,
    timeoutMs: 120_000,
  });

  return decodeVaultPayload(dataKey);
}
