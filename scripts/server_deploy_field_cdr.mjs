import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { StoryClient } from "@story-protocol/core-sdk";
import { initWasm } from "@piplabs/cdr-crypto";
import { conditions } from "@piplabs/cdr-sdk/dist/conditions.js";
import { uuidToLabel } from "@piplabs/cdr-sdk/dist/label.js";
import { Observer } from "@piplabs/cdr-sdk/dist/observer.js";
import { Uploader } from "@piplabs/cdr-sdk/dist/uploader.js";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  http,
  toHex,
  zeroAddress,
  zeroHash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const STORY_AENEID_RPC_URL = "https://aeneid.storyrpc.io";
const STORY_AENEID_CHAIN_ID = 1315;
const STORY_AENEID_LICENSE_TOKEN_ADDRESS = "0xFe3838BFb30B34170F00030B52eA4893d8aAC6bC";
const CDR_OWNER_WRITE_CONDITION_ADDRESS = "0x4C9bFC96d7092b590D497A191826C3dA2277c34B";
const CDR_LICENSE_READ_CONDITION_ADDRESS = "0xC0640AD4CF2CaA9914C8e5C44234359a9102f7a3";
const PLATFORM_REMIX_REV_SHARE_PERCENT = 10;
const CDR_API_BASE_URL = "http://172.192.41.96:1317";

const STORY_AENEID_CHAIN = defineChain({
  id: STORY_AENEID_CHAIN_ID,
  name: "Story Aeneid Testnet",
  nativeCurrency: { name: "IP", symbol: "IP", decimals: 18 },
  rpcUrls: {
    default: { http: [STORY_AENEID_RPC_URL] },
    public: { http: [STORY_AENEID_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Storyscan", url: "https://aeneid.storyscan.io" },
  },
  testnet: true,
});

const erc721Abi = [
  {
    type: "function",
    name: "safeTransferFrom",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
];

function loadEnv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const envFiles = [
    join(here, "..", ".env"),
    join(here, "..", "..", "django_server", ".env"),
    join(here, "..", "..", ".env"),
  ];
  for (const filePath of envFiles) {
    try {
      for (const raw of readFileSync(filePath, "utf8").split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("#") || !line.includes("=")) continue;
        const idx = line.indexOf("=");
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
        if (!(key in process.env)) process.env[key] = value;
      }
    } catch {
      // Optional local env file.
    }
  }
}

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_missing`);
  return value;
}

function assertAddress(value, key) {
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(value)) throw new Error(`${key}_invalid`);
  return value;
}

function assertPrivateKey(value) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) throw new Error("STORY_PLATFORM_PRIVATE_KEY_invalid");
  return value;
}

function priceMinorUnitsToWei(priceMinorUnits) {
  return BigInt(priceMinorUnits) * 10_000_000_000_000_000n;
}

function buildVaultPayload(input) {
  return new TextEncoder().encode(JSON.stringify({ label: input.label, value: input.value }));
}

async function deployCdrVault({ publicClient, walletClient, owner, label, value, licenseIpId }) {
  const observer = new Observer({
    network: "testnet",
    publicClient,
    apiUrl: CDR_API_BASE_URL,
  });
  const uploader = new Uploader({
    network: "testnet",
    publicClient,
    walletClient,
    observer,
  });

  const writeCondition = conditions.ownerOnly({
    address: CDR_OWNER_WRITE_CONDITION_ADDRESS,
    owner,
  });
  const readCondition = conditions.custom({
    address: CDR_LICENSE_READ_CONDITION_ADDRESS,
    conditionData: encodeAbiParameters(
      [{ type: "address" }, { type: "address" }],
      [STORY_AENEID_LICENSE_TOKEN_ADDRESS, licenseIpId],
    ),
  });

  const { uuid, txHash: allocateTxHash } = await uploader.allocate({
    updatable: false,
    writeConditionAddr: writeCondition.address,
    readConditionAddr: readCondition.address,
    writeConditionData: writeCondition.conditionData,
    readConditionData: readCondition.conditionData,
  });
  const ciphertext = await uploader.encryptDataKey({
    dataKey: buildVaultPayload({ label, value }),
    label: uuidToLabel(uuid),
  });
  const { txHash: writeTxHash } = await uploader.write({
    uuid,
    accessAuxData: "0x",
    encryptedData: toHex(ciphertext.raw),
  });

  return {
    cdrVaultUuid: String(uuid),
    allocateTxHash,
    deployTxHash: writeTxHash,
  };
}

async function main() {
  loadEnv();
  const input = await readStdinJson();
  const privateKey = assertPrivateKey(requiredEnv("STORY_PLATFORM_PRIVATE_KEY"));
  const recipient = assertAddress(input.recipient, "recipient");
  const label = String(input.label || "").trim();
  const value = String(input.value || "");
  const priceCents = Number(input.priceCents);
  if (!label) throw new Error("label_required");
  if (!value.trim()) throw new Error("value_required");
  if (!Number.isInteger(priceCents) || priceCents < 0) throw new Error("priceCents_invalid");

  const rpcUrl = process.env.STORY_AENEID_RPC_URL?.trim() || STORY_AENEID_RPC_URL;
  const account = privateKeyToAccount(privateKey);
  const chain = {
    ...STORY_AENEID_CHAIN,
    rpcUrls: {
      default: { http: [rpcUrl] },
      public: { http: [rpcUrl] },
    },
  };
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const storyClient = StoryClient.newClient({
    account,
    chainId: "aeneid",
    transport: http(rpcUrl),
  });

  await initWasm();

  const spgNftContract = assertAddress(input.spgNftContract || requiredEnv("NEXT_PUBLIC_STORY_SPG_NFT_CONTRACT"), "spgNftContract");
  const parentIpId = assertAddress(input.parentIpId || requiredEnv("NEXT_PUBLIC_STORY_PARENT_IP_ID"), "parentIpId");
  const parentLicenseTermsId = BigInt(input.parentLicenseTermsId || requiredEnv("NEXT_PUBLIC_STORY_PARENT_LICENSE_TERMS_ID"));

  const registered = await storyClient.ipAsset.mintAndRegisterIpAndMakeDerivative({
    spgNftContract,
    derivData: {
      parentIpIds: [parentIpId],
      licenseTermsIds: [parentLicenseTermsId],
    },
    ...(input.ipMetadata ? { ipMetadata: input.ipMetadata } : {}),
    recipient: account.address,
  });
  if (!registered.ipId || registered.tokenId === undefined) throw new Error("field_ip_registration_failed");

  const licenseConfig = await storyClient.license.setLicensingConfig({
    ipId: registered.ipId,
    licenseTermsId: parentLicenseTermsId,
    licensingConfig: {
      isSet: true,
      mintingFee: priceMinorUnitsToWei(priceCents),
      licensingHook: zeroAddress,
      hookData: zeroHash,
      commercialRevShare: PLATFORM_REMIX_REV_SHARE_PERCENT,
      disabled: false,
      expectMinimumGroupRewardShare: 0,
      expectGroupRewardPool: zeroAddress,
    },
  });
  if (!licenseConfig.txHash) throw new Error("license_config_failed");

  const cdr = await deployCdrVault({
    publicClient,
    walletClient,
    owner: account.address,
    label,
    value,
    licenseIpId: registered.ipId,
  });

  const tokenId = BigInt(registered.tokenId);
  const transferTxHash = await walletClient.writeContract({
    account,
    chain,
    address: spgNftContract,
    abi: erc721Abi,
    functionName: "safeTransferFrom",
    args: [account.address, recipient, tokenId],
  });
  const transferReceipt = await publicClient.waitForTransactionReceipt({ hash: transferTxHash });
  if (transferReceipt.status !== "success") throw new Error("ipa_transfer_failed");

  process.stdout.write(
    JSON.stringify({
      platformWallet: account.address,
      recipient,
      cdrVaultUuid: cdr.cdrVaultUuid,
      deployTxHash: cdr.deployTxHash,
      allocateTxHash: cdr.allocateTxHash,
      cdrLicenseIpId: registered.ipId,
      cdrLicenseTermsId: parentLicenseTermsId.toString(),
      ipaNftContract: spgNftContract,
      ipaTokenId: tokenId.toString(),
      ipRegistrationTxHash: registered.txHash,
      licenseConfigTxHash: licenseConfig.txHash,
      licenseAttachTxHash: licenseConfig.txHash,
      ipaTransferTxHash: transferTxHash,
    }),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
