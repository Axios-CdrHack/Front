// One-time provisioning of the platform's Story parent IP for the remix model.
//
// Creates (1) parent IP metadata in object storage, (2) a public-minting SPG NFT
// collection, (3) the platform parent IP, and (4) a commercial-remix PIL term
// with a 10% rev share (mintingFee 0) attached to the parent. Every field IP is
// later registered as a derivative of this parent (see front/lib/web3/ipAsset.ts),
// routing 10% of each field's revenue to the platform.
//
// Run once, from the `front/` directory, with the platform key available:
//   1. Put `STORY_PLATFORM_PRIVATE_KEY=0x...` in front/.env, or export it.
//   2. `node scripts/provision_story_parent.mjs /path/to/IPA.png`
//   3. Copy the three printed NEXT_PUBLIC_STORY_* values into front/.env, then restart `next dev`.
//
// Needs the platform wallet funded with Aeneid test IP for gas.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { StoryClient } from "@story-protocol/core-sdk";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const STORY_AENEID_RPC_URL = "https://aeneid.storyrpc.io";
const WIP_TOKEN_ADDRESS = "0x1514000000000000000000000000000000000000";
const ROYALTY_POLICY_LAP_ADDRESS = "0xBe54FB168b3c982b7AaE60dB6CF75Bd8447b390E";
const REV_SHARE_PERCENT = 10;
const DEFAULT_IMAGE_PATH = "/Users/admin/Desktop/hospibird/IPA.png";

// Minimal .env loader (no dotenv dep), mirroring django manage.py's loader.
function loadEnv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const envFiles = [
    join(here, "..", ".env"),
    join(here, "..", "..", "django_server", ".env"),
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
      // file may not exist — fine
    }
  }
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_missing`);
  return value;
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmacBytes(key, value) {
  return createHmac("sha256", key).update(value).digest();
}

function signingKey(secret, dateStamp, region) {
  const dateKey = hmacBytes(`AWS4${secret}`, dateStamp);
  const regionKey = hmacBytes(dateKey, region);
  const serviceKey = hmacBytes(regionKey, "s3");
  return hmacBytes(serviceKey, "aws4_request");
}

function s3Config() {
  const endpoint = requiredEnv("HETZNER_OBJECT_STORAGE_ENDPOINT").replace(/\/+$/, "");
  const endpointWithoutScheme = endpoint.split("://", 2).at(-1);
  const scheme = endpoint.includes("://") ? endpoint.split("://", 1)[0] : "https";
  const bucket = requiredEnv("HETZNER_OBJECT_STORAGE_BUCKET");
  const host = `${bucket}.${endpointWithoutScheme}`;
  return {
    bucket,
    region: requiredEnv("HETZNER_OBJECT_STORAGE_REGION"),
    accessKey: requiredEnv("HETZNER_OBJECT_STORAGE_ACCESS_KEY_ID"),
    secretKey: requiredEnv("HETZNER_OBJECT_STORAGE_SECRET_ACCESS_KEY"),
    publicBase: (process.env.HETZNER_OBJECT_STORAGE_PUBLIC_BASE_URL || `${scheme}://${host}`).replace(/\/+$/, ""),
    scheme,
    host,
  };
}

async function uploadObject(key, body, contentType) {
  const config = s3Config();
  const encodedPath = key.split("/").map((part) => encodeURIComponent(part)).join("/");
  const url = `${config.scheme}://${config.host}/${encodedPath}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const canonicalHeaders = [
    `content-type:${contentType}`,
    `host:${config.host}`,
    "x-amz-acl:public-read",
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    "",
  ].join("\n");
  const signedHeaders = "content-type;host;x-amz-acl;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = ["PUT", `/${encodedPath}`, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(config.secretKey, dateStamp, config.region)).update(stringToSign).digest("hex");

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "Content-Type": contentType,
      "x-amz-acl": "public-read",
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    },
    body,
  });
  if (response.status >= 400) {
    throw new Error(`object_storage_upload_failed:${response.status}:${await response.text()}`);
  }
  return `${config.publicBase}/${encodedPath}`;
}

async function uploadParentMetadata(imagePath) {
  const imageBuffer = readFileSync(imagePath);
  const runId = `${new Date().toISOString().slice(0, 10)}-${randomUUID()}`;
  const imageKey = `story-parent/${runId}/IPA.png`;
  const imageUrl = await uploadObject(imageKey, imageBuffer, "image/png");
  const metadata = {
    name: "AXIOS Data Fields Parent IP",
    description: "Platform parent IP for AXIOS data-field remix licensing.",
    image: imageUrl,
    properties: {
      model: "platform-parent-remix",
      commercialRevSharePercent: REV_SHARE_PERCENT,
    },
  };
  const metadataBuffer = Buffer.from(JSON.stringify(metadata, null, 2));
  const metadataKey = `story-parent/${runId}/metadata.json`;
  const metadataUrl = await uploadObject(metadataKey, metadataBuffer, "application/json");
  return {
    imageUrl,
    metadataUrl,
    metadataHash: `0x${sha256Hex(metadataBuffer)}`,
  };
}

async function main() {
  loadEnv();
  const pk = process.env.STORY_PLATFORM_PRIVATE_KEY;
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error("Set STORY_PLATFORM_PRIVATE_KEY (0x + 64 hex) in front/.env or the environment.");
  }
  const imagePath = process.argv[2] || DEFAULT_IMAGE_PATH;
  const rpc = process.env.STORY_AENEID_RPC_URL || STORY_AENEID_RPC_URL;
  const account = privateKeyToAccount(pk);
  const client = StoryClient.newClient({ account, transport: http(rpc), chainId: "aeneid" });
  console.log(`Platform wallet: ${account.address}`);

  console.log("1/4 Uploading parent IP image + metadata JSON...");
  const parentMetadata = await uploadParentMetadata(imagePath);
  const ipMetadata = {
    ipMetadataURI: parentMetadata.metadataUrl,
    ipMetadataHash: parentMetadata.metadataHash,
    nftMetadataURI: parentMetadata.metadataUrl,
    nftMetadataHash: parentMetadata.metadataHash,
  };
  console.log(`   Image URL: ${parentMetadata.imageUrl}`);
  console.log(`   Metadata URL: ${parentMetadata.metadataUrl}`);

  console.log("2/4 Creating SPG NFT collection (public minting)...");
  const collection = await client.nftClient.createNFTCollection({
    name: "AXIOS Data Fields",
    symbol: "AXIOSDF",
    isPublicMinting: true,
    mintOpen: true,
    mintFeeRecipient: account.address,
    contractURI: parentMetadata.metadataUrl,
  });
  const spgNftContract = collection.spgNftContract;
  console.log(`   SPG NFT collection: ${spgNftContract}  (tx ${collection.txHash})`);

  console.log("3/4 Registering platform parent IP...");
  const parent = await client.ipAsset.mintAndRegisterIp({ spgNftContract, ipMetadata });
  console.log(`   Parent IP: ${parent.ipId}  (tx ${parent.txHash})`);

  console.log(`4/4 Registering + attaching ${REV_SHARE_PERCENT}% commercial-remix terms...`);
  const terms = await client.license.registerCommercialRemixPIL({
    defaultMintingFee: 0n,
    commercialRevShare: REV_SHARE_PERCENT,
    currency: WIP_TOKEN_ADDRESS,
    royaltyPolicyAddress: ROYALTY_POLICY_LAP_ADDRESS,
  });
  await client.license.attachLicenseTerms({ ipId: parent.ipId, licenseTermsId: terms.licenseTermsId });
  console.log(`   Parent license terms id: ${terms.licenseTermsId}`);

  console.log("\n✅ Done. Add these to front/.env (then restart `next dev`):\n");
  console.log(`NEXT_PUBLIC_STORY_SPG_NFT_CONTRACT=${spgNftContract}`);
  console.log(`NEXT_PUBLIC_STORY_PARENT_IP_ID=${parent.ipId}`);
  console.log(`NEXT_PUBLIC_STORY_PARENT_LICENSE_TERMS_ID=${terms.licenseTermsId}`);
}

main().catch((error) => {
  console.error("Provisioning failed:", error);
  process.exit(1);
});
