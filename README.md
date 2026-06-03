# AXIOS Frontend

AXIOS is a paid digital identity card and data-access marketplace. Users create a public profile card for discovery, then choose which contact or sensitive fields should stay locked behind CDR-gated paid access. Buyers can search anonymous public profile signals, request batch access to selected fields, pay in IP, receive Story license tokens, and export only the fields they purchased.

## Demo Video

[Watch the AXIOS demo on YouTube](https://youtu.be/fsAmlU_D3cg)

## Service Overview

- Public profile cards expose discovery fields such as name, age, country, locale, occupation, education, and career history.
- Paid fields such as email, mobile, Telegram, insurance, and other private data are deployed to CDR before they appear in paid search.
- Search returns anonymous candidate cards before purchase, so buyers can estimate reach and cost without seeing paid values.
- Checkout creates an order for selected cards and fields, then uses Story license tokens as the access proof for CDR reads.
- Buyers can view purchased CDR data in the app or export it as CSV/XLSX.
- Sellers can toggle CDR search visibility and track sales from the app.

## App Routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page and Privy entry point |
| `/app` | Main AXIOS app: search, profile data, request history, sales |
| `/c/[slug]` | Public card page |
| `/privacy` | Privacy policy |
| `/terms` | Terms of use |

## Frontend Stack

- Next.js 14 App Router
- React 18
- Privy auth and wallet connection
- Story Protocol SDK and viem for on-chain flows
- CDR SDK for encrypted data access
- Sass modules for app styling

## Environment

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Required public values:

```bash
NEXT_PUBLIC_PRIVY_APP_ID=
NEXT_PUBLIC_STORY_SPG_NFT_CONTRACT=
NEXT_PUBLIC_STORY_PARENT_IP_ID=
NEXT_PUBLIC_STORY_PARENT_LICENSE_TERMS_ID=
```

Server-wallet scripts also read:

```bash
STORY_PLATFORM_PRIVATE_KEY=
STORY_AENEID_RPC_URL=
```

Use `.env` for deployment configuration. Do not introduce `.env.production` for Ubuntu deployment.

## Local Development

```bash
npm install
npm run dev
```

The Django API server is expected at `http://localhost:8001` during local development.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Server-Wallet Scripts

These scripts are invoked by the Django server and should not be exposed as public frontend routes:

- `scripts/server_deploy_field_cdr.mjs`: mints/registers field IP, sets licensing config, allocates/writes the CDR vault, and transfers the IPA NFT to the user.
- `scripts/server_mint_license_tokens.mjs`: mints Story license tokens for purchased fields and transfers them to the buyer wallet.
- `scripts/provision_story_parent.mjs`: one-time setup for the platform parent IP and license terms.

Server-wallet writes must stay serialized on the backend to avoid nonce conflicts.
