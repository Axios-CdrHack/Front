import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  http,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const STORY_AENEID_RPC_URL = "https://aeneid.storyrpc.io";
const STORY_AENEID_CHAIN_ID = 1315;
const STORY_AENEID_LICENSE_TOKEN_ADDRESS = "0xFe3838BFb30B34170F00030B52eA4893d8aAC6bC";
const STORY_AENEID_LICENSING_MODULE_ADDRESS = "0x04fbd8a2e56dd85CFD5500A4A4DfA955B9f1dE6f";
const STORY_AENEID_PILICENSE_TEMPLATE_ADDRESS = "0x2E896b0b2Fdb7457499B56AAaA4AE55BCB4Cd316";
const STORY_AENEID_WIP_TOKEN_ADDRESS = "0x1514000000000000000000000000000000000000";
const STORY_AENEID_ROYALTY_MODULE_ADDRESS = "0xD2f60c40fEbccf6311f8B47c4f2Ec6b040400086";
const MAX_REVENUE_SHARE = 100_000_000;

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

const licensingModuleAbi = [
  {
    type: "function",
    name: "mintLicenseTokens",
    stateMutability: "nonpayable",
    inputs: [
      { name: "licensorIpId", type: "address" },
      { name: "licenseTemplate", type: "address" },
      { name: "licenseTermsId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "royaltyContext", type: "bytes" },
      { name: "maxMintingFee", type: "uint256" },
      { name: "maxRevenueShare", type: "uint32" },
    ],
    outputs: [{ name: "startLicenseTokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "predictMintingLicenseFee",
    stateMutability: "view",
    inputs: [
      { name: "licensorIpId", type: "address" },
      { name: "licenseTemplate", type: "address" },
      { name: "licenseTermsId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "royaltyContext", type: "bytes" },
    ],
    outputs: [
      { name: "currencyToken", type: "address" },
      { name: "tokenAmount", type: "uint256" },
    ],
  },
];

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "allowance", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "ok", type: "bool" }],
  },
];

const wipTokenAbi = [
  ...erc20Abi,
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
];

const licenseTokenAbi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "owner", type: "address" }],
  },
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
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
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

function assertUintString(value, key) {
  const text = String(value ?? "");
  if (!/^\d+$/.test(text)) throw new Error(`${key}_invalid`);
  return text;
}

function serializeBigints(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serializeBigints);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeBigints(item)]));
  }
  return value;
}

function logStatus(status, payload = {}) {
  process.stderr.write(`[server-license-mint] ${status} ${JSON.stringify(serializeBigints(payload))}\n`);
}

function sumFeesByCurrency(predictions) {
  const fees = new Map();
  for (const prediction of predictions) {
    if (prediction.tokenAmount <= 0n) continue;
    if (prediction.currencyToken.toLowerCase() === zeroAddress) throw new Error("license_fee_currency_missing");
    const key = prediction.currencyToken.toLowerCase();
    const current = fees.get(key);
    fees.set(key, {
      currencyToken: current?.currencyToken ?? prediction.currencyToken,
      tokenAmount: (current?.tokenAmount ?? 0n) + prediction.tokenAmount,
    });
  }
  return Array.from(fees.values());
}

async function readErc20Balance(publicClient, currencyToken, owner) {
  return publicClient.readContract({
    address: currencyToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });
}

async function readErc20Allowance(publicClient, currencyToken, owner, spender) {
  return publicClient.readContract({
    address: currencyToken,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
}

async function ensureFeePrepared({ account, chain, publicClient, walletClient, currencyToken, tokenAmount }) {
  const normalizedCurrency = currencyToken.toLowerCase();
  const normalizedWip = STORY_AENEID_WIP_TOKEN_ADDRESS.toLowerCase();
  let balance = await readErc20Balance(publicClient, currencyToken, account.address);
  logStatus("fee_balance", { currencyToken, tokenAmount, balance });

  if (balance < tokenAmount) {
    if (normalizedCurrency !== normalizedWip) throw new Error("license_fee_balance_insufficient");
    const shortfall = tokenAmount - balance;
    const nativeBalance = await publicClient.getBalance({ address: account.address });
    logStatus("wip_wrap_required", { shortfall, nativeBalance });
    if (nativeBalance < shortfall) throw new Error("license_native_ip_balance_insufficient");
    const wrapTxHash = await walletClient.writeContract({
      account,
      chain,
      address: STORY_AENEID_WIP_TOKEN_ADDRESS,
      abi: wipTokenAbi,
      functionName: "deposit",
      args: [],
      value: shortfall,
    });
    const wrapReceipt = await publicClient.waitForTransactionReceipt({ hash: wrapTxHash });
    logStatus("wip_wrap_receipt", { wrapTxHash, status: wrapReceipt.status });
    if (wrapReceipt.status !== "success") throw new Error("license_wip_wrap_failed");
    balance = await readErc20Balance(publicClient, currencyToken, account.address);
    if (balance < tokenAmount) throw new Error("license_fee_balance_insufficient");
  }

  const allowance = await readErc20Allowance(publicClient, currencyToken, account.address, STORY_AENEID_ROYALTY_MODULE_ADDRESS);
  logStatus("fee_allowance", { currencyToken, tokenAmount, allowance, spender: STORY_AENEID_ROYALTY_MODULE_ADDRESS });
  if (allowance >= tokenAmount) return;

  const approveTxHash = await walletClient.writeContract({
    account,
    chain,
    address: currencyToken,
    abi: erc20Abi,
    functionName: "approve",
    args: [STORY_AENEID_ROYALTY_MODULE_ADDRESS, tokenAmount],
  });
  const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveTxHash });
  logStatus("approve_receipt", { approveTxHash, status: approveReceipt.status });
  if (approveReceipt.status !== "success") throw new Error("license_fee_approval_failed");
}

function mintedTokenIdsFromReceipt(receipt, receiver) {
  const tokenIds = [];
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== STORY_AENEID_LICENSE_TOKEN_ADDRESS.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: licenseTokenAbi,
        eventName: "Transfer",
        data: log.data,
        topics: log.topics,
      });
      if (decoded.args.from.toLowerCase() === zeroAddress && decoded.args.to.toLowerCase() === receiver.toLowerCase()) {
        tokenIds.push(decoded.args.tokenId.toString());
      }
    } catch {
      // Ignore other logs from the same contract.
    }
  }
  return tokenIds;
}

async function verifyOwners(publicClient, buyerWallet, grants) {
  await Promise.all(
    grants.map(async (grant) => {
      const owner = await publicClient.readContract({
        address: STORY_AENEID_LICENSE_TOKEN_ADDRESS,
        abi: licenseTokenAbi,
        functionName: "ownerOf",
        args: [BigInt(grant.licenseTokenId)],
      });
      if (owner.toLowerCase() !== buyerWallet.toLowerCase()) {
        throw new Error(`license_token_not_owned_by_buyer:${grant.licenseTokenId}`);
      }
    }),
  );
}

async function main() {
  loadEnv();
  const input = await readStdinJson();
  const privateKey = assertPrivateKey(requiredEnv("STORY_PLATFORM_PRIVATE_KEY"));
  const buyerWallet = assertAddress(input.buyerWallet, "buyerWallet");
  const fields = Array.isArray(input.fields) ? input.fields : [];
  if (!fields.length) throw new Error("license_batch_empty");

  const mintFields = fields.map((field, index) => ({
    index,
    fieldId: String(field.fieldId || "").trim(),
    licensorIpId: assertAddress(field.licensorIpId, `fields.${index}.licensorIpId`),
    licenseTermsId: assertUintString(field.licenseTermsId, `fields.${index}.licenseTermsId`),
  }));
  if (mintFields.some((field) => !field.fieldId)) throw new Error("fieldId_required");

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
  const amount = 1n;
  const royaltyContext = "0x";
  const mintReceiver = input.transferFromServer === false ? buyerWallet : account.address;

  logStatus("start", { serverWallet: account.address, buyerWallet, fieldCount: mintFields.length, transferFromServer: input.transferFromServer !== false });

  const predictions = await Promise.all(
    mintFields.map(async (field) => {
      const [currencyToken, tokenAmount] = await publicClient.readContract({
        address: STORY_AENEID_LICENSING_MODULE_ADDRESS,
        abi: licensingModuleAbi,
        functionName: "predictMintingLicenseFee",
        args: [
          field.licensorIpId,
          STORY_AENEID_PILICENSE_TEMPLATE_ADDRESS,
          BigInt(field.licenseTermsId),
          amount,
          mintReceiver,
          royaltyContext,
        ],
      });
      return { fieldId: field.fieldId, currencyToken, tokenAmount };
    }),
  );
  const fees = sumFeesByCurrency(predictions);
  logStatus("fee_summary", { fees });
  for (const fee of fees) {
    await ensureFeePrepared({ account, chain, publicClient, walletClient, currencyToken: fee.currencyToken, tokenAmount: fee.tokenAmount });
  }

  const mintNonceBase = await publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
  const mintTxHashes = await Promise.all(
    mintFields.map((field, index) => {
      const prediction = predictions[index];
      return walletClient.writeContract({
        account,
        chain,
        address: STORY_AENEID_LICENSING_MODULE_ADDRESS,
        abi: licensingModuleAbi,
        functionName: "mintLicenseTokens",
        args: [
          field.licensorIpId,
          STORY_AENEID_PILICENSE_TEMPLATE_ADDRESS,
          BigInt(field.licenseTermsId),
          amount,
          mintReceiver,
          royaltyContext,
          prediction?.tokenAmount ?? 0n,
          MAX_REVENUE_SHARE,
        ],
        nonce: mintNonceBase + index,
      });
    }),
  );
  logStatus("mint_submitted", { mintTxHashes });

  const mintReceipts = await Promise.all(mintTxHashes.map((hash) => publicClient.waitForTransactionReceipt({ hash })));
  const grants = mintReceipts.map((receipt, index) => {
    const field = mintFields[index];
    if (receipt.status !== "success") throw new Error(`license_token_mint_failed:${field.fieldId}`);
    const tokenIds = mintedTokenIdsFromReceipt(receipt, mintReceiver);
    if (tokenIds.length !== 1) throw new Error(`license_token_mint_event_missing:${field.fieldId}`);
    return {
      fieldId: field.fieldId,
      licenseTokenId: tokenIds[0],
      mintTxHash: mintTxHashes[index],
    };
  });

  const transferTxHashes = [];
  if (input.transferFromServer !== false) {
    const transferNonceBase = await publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
    const submitted = await Promise.all(
      grants.map((grant, index) =>
        walletClient.writeContract({
          account,
          chain,
          address: STORY_AENEID_LICENSE_TOKEN_ADDRESS,
          abi: licenseTokenAbi,
          functionName: "safeTransferFrom",
          args: [account.address, buyerWallet, BigInt(grant.licenseTokenId)],
          nonce: transferNonceBase + index,
        }),
      ),
    );
    const transferReceipts = await Promise.all(submitted.map((hash) => publicClient.waitForTransactionReceipt({ hash })));
    transferReceipts.forEach((receipt, index) => {
      if (receipt.status !== "success") throw new Error(`license_token_transfer_failed:${grants[index].fieldId}`);
      transferTxHashes.push(submitted[index]);
    });
    logStatus("transfer_done", { transferTxHashes });
  }

  await verifyOwners(publicClient, buyerWallet, grants);
  logStatus("owner_verified", { tokenIds: grants.map((grant) => grant.licenseTokenId), buyerWallet });

  process.stdout.write(
    JSON.stringify({
      serverWallet: account.address,
      buyerWallet,
      transferFromServer: input.transferFromServer !== false,
      transferTxHashes,
      grants,
      fees: fees.map((fee) => ({ currencyToken: fee.currencyToken, tokenAmount: fee.tokenAmount.toString() })),
    }),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
