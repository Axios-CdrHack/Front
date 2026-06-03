"use client";

import { getStoryClient } from "./storyClient";
import type { PrivyWalletConnection } from "./privy";
import type { StoryIpMetadata } from "../types";

export type RegisterFieldDerivativeIpInput = {
  /** Platform SPG NFT collection the field NFT is minted into (public minting). */
  spgNftContract: `0x${string}`;
  /** Platform parent IP every field derives from. */
  parentIpId: `0x${string}`;
  /** The parent's commercial-remix license terms id (carries the 10% rev share). */
  parentLicenseTermsId: string;
  /** Field label, only used for logging/metadata. */
  fieldLabel: string;
  /** Metadata JSON URI/hash for the newly minted field IP and NFT. */
  ipMetadata?: StoryIpMetadata;
};

/**
 * Auto-register a field as a derivative ("remix") of the platform parent IP.
 *
 * One wallet call mints an SPG NFT, registers it as an IP Asset owned by
 * the caller or explicit recipient, and links it as a derivative of the parent under the
 * parent's 10% commercial-remix terms — so the platform automatically earns its
 * 10% royalty on that field's future sales. Replaces the old manual "Story IP ID".
 *
 * Returns the new child IP id, which
 * becomes the field's `cdrLicenseIpId`.
 */
export async function registerFieldDerivativeIp(
  wallet: PrivyWalletConnection,
  input: RegisterFieldDerivativeIpInput,
): Promise<{ ipId: `0x${string}`; txHash?: string }> {
  if (!input.spgNftContract || !input.parentIpId || !input.parentLicenseTermsId) {
    throw new Error("story_parent_not_provisioned");
  }
  const client = await getStoryClient(wallet);
  const response = await client.ipAsset.mintAndRegisterIpAndMakeDerivative({
    spgNftContract: input.spgNftContract,
    derivData: {
      parentIpIds: [input.parentIpId],
      licenseTermsIds: [BigInt(input.parentLicenseTermsId)],
    },
    ...(input.ipMetadata ? { ipMetadata: input.ipMetadata } : {}),
    // Owner of the field NFT + IP. Defaults to the client wallet anyway, but be explicit.
    recipient: wallet.account,
  });
  if (!response.ipId) throw new Error("field_ip_registration_failed");
  return { ipId: response.ipId as `0x${string}`, txHash: response.txHash };
}
