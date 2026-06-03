export type PublicFieldKind =
  | "name"
  | "gender"
  | "age"
  | "country"
  | "locale"
  | "occupation"
  | "education"
  | "educationStatus"
  | "educations"
  | "career"
  | "careerWorkYears"
  | "careerStartDate"
  | "careerEndDate"
  | "careerStatus"
  | "careers";

export type DataFieldKind = "email" | "mobile" | "telegram" | "discord" | "twitter" | "insurance" | "height" | "weight" | "blood_type";

export type AccessMode = "free" | "paid";

export type CdrState = "off" | "deploying" | "on";

export type VerificationStatus = "not_required" | "pending" | "verified";

export interface EducationHistoryItem {
  id: string;
  education: string;
  status: string;
}

export interface CareerHistoryItem {
  id: string;
  career: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface User {
  id: string;
  privyUserId?: string;
  email: string;
  walletAddress?: string;
  smartWalletAddress?: string;
  name: string;
  age: number;
  occupation: string;
  gender: string;
  country: string;
  residence: string;
  displayName: string;
  publicSlug: string;
  avatarUrl?: string;
  payoutAddress?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Education {
  id: string;
  userId: string;
  school: string;
  status: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Career {
  id: string;
  userId: string;
  title: string;
  startDate: string;
  endDate: string;
  status: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicProfileFields {
  name: string;
  gender: string;
  age: number;
  country: string;
  locale: string;
  occupation: string;
  education: string;
  educationStatus: string;
  educations: EducationHistoryItem[];
  career: string;
  careerWorkYears: number;
  careerStartDate: string;
  careerEndDate: string;
  careerStatus: string;
  careers: CareerHistoryItem[];
}

export interface Profile {
  id: string;
  privyUserId?: string;
  email?: string;
  publicSlug: string;
  displayName: string;
  avatarUrl?: string;
  walletAddress?: string;
  smartWalletAddress?: string;
  payoutAddress?: string;
  name: string;
  age: number;
  occupation: string;
  gender: string;
  country: string;
  residence: string;
  educations: EducationHistoryItem[];
  careers: CareerHistoryItem[];
  publicFields: PublicProfileFields;
  createdAt: string;
  updatedAt: string;
}

export interface DataField {
  id: string;
  userId: string;
  profileId?: string;
  kind: DataFieldKind;
  label: string;
  valuePreview: string;
  accessMode: AccessMode;
  priceCents: number;
  currency: "IP";
  requiresVerification: boolean;
  verificationStatus: VerificationStatus;
  cdrState: CdrState;
  cdrVaultUuid?: string;
  deployTxHash?: string;
  cdrLicenseIpId?: string;
  cdrLicenseTermsId?: string;
  platformWallet?: string;
  ipaRecipient?: string;
  ipaNftContract?: string;
  ipaTokenId?: string;
  ipRegistrationTxHash?: string;
  ipaTransferTxHash?: string;
  licenseConfigTxHash?: string;
  licenseAttachTxHash?: string;
  cdrAllocateTxHash?: string;
  sellerAddress?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoryIpMetadata {
  ipMetadataURI: string;
  ipMetadataHash: `0x${string}`;
  nftMetadataURI: string;
  nftMetadataHash: `0x${string}`;
}

export interface FieldIpMetadata {
  name: string;
  imageUrl: string;
  metadataUrl: string;
  metadataHash: `0x${string}`;
  ipMetadata: StoryIpMetadata;
}

export interface PublicCardDataField {
  kind: DataFieldKind;
  label: string;
  accessMode: AccessMode;
  priceCents: number;
  currency: "IP";
  cdrState: CdrState;
  verificationStatus: VerificationStatus;
  valuePreview?: string;
}

export interface PublicCardProfile {
  id: string;
  publicSlug: string;
  displayName: string;
  avatarUrl?: string;
  publicFields: PublicProfileFields;
  dataFields: PublicCardDataField[];
}

export interface QuoteFilters {
  minAge?: number;
  maxAge?: number;
  gender?: string;
  country?: string;
  locale?: string;
  residence?: string;
  occupation?: string;
  terms: string[];
}

export interface QuoteResponse {
  quoteId: string;
  prompt: string;
  filters: QuoteFilters;
  recommendedFields: DataFieldKind[];
  matches: {
    matchRef: string;
    signals: string[];
    fieldCosts: {
      fieldId: string;
      kind: DataFieldKind;
      label: string;
      priceCents: number;
      accessMode: AccessMode;
      cdrState: CdrState;
      cdrLicenseIpId: string;
      cdrLicenseTermsId: string;
      ipaNftContract?: string;
      ipaTokenId?: string;
      ipRegistrationTxHash?: string;
      licenseConfigTxHash?: string;
    }[];
    subtotalCents: number;
    paidFieldCount: number;
    freeFieldCount: number;
  }[];
  matchedProfileCount: number;
  paidFieldCount: number;
  freeFieldCount: number;
  subtotalCents: number;
  serviceFeeCents: number;
  totalCents: number;
  currency: "IP";
  batchSize: number;
  capped: boolean;
  maxPaidFields: number;
  prePurchaseNotice: string;
  sheetParams: SheetParams;
}

export interface SearchRequestSummary {
  id: string;
  buyerWallet: string;
  prompt: string;
  filters: QuoteFilters;
  recommendedFields: DataFieldKind[];
  wantedFields?: DataFieldKind[];
  matchedProfileCount: number;
  paidFieldCount: number;
  freeFieldCount: number;
  subtotalCents: number;
  serviceFeeCents: number;
  totalCents: number;
  currency: "IP";
  createdAt: string;
}

export interface SearchRequestExtension {
  prompt: string;
  filters: QuoteFilters;
  addedProfileIds: string[];
  createdAt: string;
}

export interface SearchRequestDetail extends SearchRequestSummary {
  profileIds: string[];
  matches: QuoteResponse["matches"];
  extensions: SearchRequestExtension[];
  batchSize: number;
  capped: boolean;
  maxPaidFields: number;
  prePurchaseNotice: string;
  sheetParams: SheetParams;
}

export interface SheetParams {
  orderId?: string;
  prompt: string;
  filters: QuoteFilters;
  fields: DataFieldKind[];
  sort: "relevance";
  generatedAt: string;
}

export interface SellerPayout {
  sellerAddress: string;
  fieldIds: string[];
  grossCents: number;
  sellerCents: number;
  serviceFeeCents: number;
}

export interface LicenseTokenGrant {
  fieldId: string;
  licenseTokenId: string;
  mintTxHash: string;
}

export interface OrderResponse {
  order: {
    id: string;
    quoteId: string;
    buyerWallet: string;
    prompt: string;
    selectedMatchRefs: string[];
    selectedFieldIds: string[];
    subtotalCents: number;
    serviceFeeCents: number;
    totalCents: number;
    currency: "IP";
    batchSize: number;
    status: "pending_payment" | "paid" | "exported";
    paymentTxHash?: string;
    licenseTokenIds: string[];
    licenseTokenGrants: LicenseTokenGrant[];
    purchaseContract: string;
    accessProof: string;
    sellerPayouts: SellerPayout[];
    sheetParams: SheetParams;
    createdAt: string;
    updatedAt: string;
  };
  payment: {
    contract: string;
    buyerPaysGas: boolean;
    platformFeeBps: number;
    sellerPayouts: SellerPayout[];
  };
}

export interface OrderSummary {
  id: string;
  quoteId: string;
  buyerWallet: string;
  prompt: string;
  selectedMatchRefs: string[];
  selectedFieldIds: string[];
  subtotalCents: number;
  serviceFeeCents: number;
  totalCents: number;
  currency: "IP";
  status: "pending_payment" | "paid" | "exported";
  paymentTxHash?: string;
  licenseTokenIds: string[];
  licenseTokenGrants: LicenseTokenGrant[];
  purchaseContract: string;
  sheetParams: SheetParams;
  createdAt: string;
  updatedAt: string;
}

export interface ExportPlan {
  orderId: string;
  buyerWallet: string;
  columns: DataFieldKind[];
  sheetParams: SheetParams;
  items: {
    profileRef: string;
    fieldId: string;
    kind: DataFieldKind;
    label: string;
    accessMode: AccessMode;
    cdrState: CdrState;
    cdrVaultUuid?: string;
    priceCents: number;
    licenseTokenIds: string[];
    accessAuxData: string;
  }[];
}

export interface SaleSummary {
  id: string;
  orderId: string;
  buyerWallet: string;
  fieldId: string;
  kind?: DataFieldKind;
  label: string;
  cdrLicenseIpId?: string;
  grossCents: number;
  sellerCents: number;
  serviceFeeCents: number;
  paymentTxHash?: string;
  source?: "server" | "onchain";
  blockNumber?: string;
  logIndex?: number;
  createdAt: string;
}

export interface WalletLinkProof {
  signerAddress: string;
  message: string;
  signature: string;
  issuedAt: string;
}

export type UserAccount = Pick<User, "id" | "email" | "walletAddress" | "createdAt" | "updatedAt">;
