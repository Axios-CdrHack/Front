import { defineChain } from "viem";

export const STORY_AENEID_RPC_URL = "https://aeneid.storyrpc.io";
export const STORY_AENEID_CHAIN_ID = 1315;
export const STORY_AENEID_BLOCK_EXPLORER_URL = "https://aeneid.storyscan.io";

export const STORY_AENEID_CHAIN = defineChain({
  id: STORY_AENEID_CHAIN_ID,
  name: "Story Aeneid Testnet",
  nativeCurrency: {
    name: "IP",
    symbol: "IP",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [STORY_AENEID_RPC_URL],
    },
    public: {
      http: [STORY_AENEID_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: "Storyscan",
      url: STORY_AENEID_BLOCK_EXPLORER_URL,
    },
  },
  testnet: true,
});

export const CDR_OWNER_WRITE_CONDITION_ADDRESS = "0x4C9bFC96d7092b590D497A191826C3dA2277c34B";
export const CDR_LICENSE_READ_CONDITION_ADDRESS = "0xC0640AD4CF2CaA9914C8e5C44234359a9102f7a3";
export const CDR_FIELD_PURCHASE_READ_CONDITION_ADDRESS = CDR_LICENSE_READ_CONDITION_ADDRESS;
export const STORY_AENEID_LICENSE_TOKEN_ADDRESS = "0xFe3838BFb30B34170F00030B52eA4893d8aAC6bC";
export const STORY_AENEID_LICENSING_MODULE_ADDRESS = "0x04fbd8a2e56dd85CFD5500A4A4DfA955B9f1dE6f";
export const STORY_AENEID_PILICENSE_TEMPLATE_ADDRESS = "0x2E896b0b2Fdb7457499B56AAaA4AE55BCB4Cd316";
export const STORY_AENEID_MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
export const STORY_AENEID_WIP_TOKEN_ADDRESS = "0x1514000000000000000000000000000000000000";
export const STORY_AENEID_ROYALTY_MODULE_ADDRESS = "0xD2f60c40fEbccf6311f8B47c4f2Ec6b040400086";
export const STORY_AENEID_ROYALTY_POLICY_LAP_ADDRESS = "0xBe54FB168b3c982b7AaE60dB6CF75Bd8447b390E";

// Platform remix royalty: every field IP is registered as a derivative of the
// platform parent IP under a commercial-remix license that routes this % of the
// field's revenue back to the parent (the platform's on-chain 10% cut, replacing
// the old off-chain PLATFORM_FEE_BPS).
export const PLATFORM_REMIX_REV_SHARE_PERCENT = 10;

// Provisioned once by scripts/provision_story_parent (see front/.env.example).
// Empty until provisioned — the deploy flow throws a clear error if missing.
export const STORY_SPG_NFT_CONTRACT = (process.env.NEXT_PUBLIC_STORY_SPG_NFT_CONTRACT ?? "") as `0x${string}` | "";
export const STORY_PARENT_IP_ID = (process.env.NEXT_PUBLIC_STORY_PARENT_IP_ID ?? "") as `0x${string}` | "";
export const STORY_PARENT_LICENSE_TERMS_ID = process.env.NEXT_PUBLIC_STORY_PARENT_LICENSE_TERMS_ID ?? "";
