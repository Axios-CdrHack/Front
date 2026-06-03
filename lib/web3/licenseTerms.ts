"use client";

import {
  PLATFORM_REMIX_REV_SHARE_PERCENT,
  STORY_AENEID_ROYALTY_POLICY_LAP_ADDRESS,
  STORY_AENEID_WIP_TOKEN_ADDRESS,
} from "./network";
import { getStoryClient } from "./storyClient";
import type { PrivyWalletConnection } from "./privy";

export function priceMinorUnitsToWei(priceMinorUnits: number) {
  return BigInt(priceMinorUnits) * 10_000_000_000_000_000n;
}

function isAlreadyAttachedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /already attached|alreadyattached|already has/i.test(message);
}

/**
 * Register (idempotent) a commercial-**remix** PIL term priced at the field's
 * minting fee with the platform's 10% rev share, then attach it to the field IP
 * so buyers can mint a license token from it.
 *
 * This pairs with the field being a derivative of the platform parent
 * (`ipAsset.registerFieldDerivativeIp`): the derivative link routes the 10% to
 * the platform, and this priced term is what buyers actually pay.
 */
export async function ensureCommercialRemixLicenseTermsAttached(
  wallet: PrivyWalletConnection,
  input: { licensorIpId: `0x${string}`; mintingFeeWei: bigint },
) {
  const client = await getStoryClient(wallet);
  const registered = await client.license.registerCommercialRemixPIL({
    defaultMintingFee: input.mintingFeeWei,
    commercialRevShare: PLATFORM_REMIX_REV_SHARE_PERCENT,
    currency: STORY_AENEID_WIP_TOKEN_ADDRESS,
    royaltyPolicyAddress: STORY_AENEID_ROYALTY_POLICY_LAP_ADDRESS,
  });
  const licenseTermsId = registered.licenseTermsId;
  if (licenseTermsId === undefined) throw new Error("commercial_remix_terms_register_failed");

  let attachTxHash: `0x${string}` | undefined;
  try {
    const attached = await client.license.attachLicenseTerms({
      ipId: input.licensorIpId,
      licenseTermsId,
    });
    attachTxHash = attached.txHash;
  } catch (error) {
    // Re-deploying a same-priced field: the term is already attached — not an error.
    if (!isAlreadyAttachedError(error)) throw error;
  }

  return { licenseTermsId: licenseTermsId.toString(), attachTxHash };
}
