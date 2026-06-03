"use client";

import { createPublicClient, getAddress, http, isAddress } from "viem";
import { STORY_AENEID_CHAIN, STORY_AENEID_LICENSE_TOKEN_ADDRESS, STORY_AENEID_RPC_URL } from "./network";

const licenseTokenOwnerAbi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "owner", type: "address" }],
  },
] as const;

const publicClient = createPublicClient({
  chain: STORY_AENEID_CHAIN,
  transport: http(STORY_AENEID_RPC_URL),
});

export async function readLicenseTokenOwners(tokenIds: string[]) {
  const uniqueTokenIds = [...new Set(tokenIds.filter((tokenId) => /^\d+$/.test(tokenId)))];
  const entries = await Promise.all(
    uniqueTokenIds.map(async (tokenId) => {
      try {
        const owner = await publicClient.readContract({
          address: STORY_AENEID_LICENSE_TOKEN_ADDRESS,
          abi: licenseTokenOwnerAbi,
          functionName: "ownerOf",
          args: [BigInt(tokenId)],
        });
        return [tokenId, isAddress(owner) ? getAddress(owner) : ""] as const;
      } catch (error) {
        console.error("[axios-cdr] license_owner_check_failed", { tokenId, error });
        return [tokenId, ""] as const;
      }
    }),
  );

  return Object.fromEntries(entries);
}
