"use client";
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import "./AxiosApp.scss";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileText,
  GripVertical,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { IconAsset, type IconAssetName } from "./sys/cell/IconAsset";
import { ConfirmModal } from "./sys/org/ConfirmModal";
import { CdrDeployModal } from "./sys/org/CdrDeployModal";
import { clearAppAuthSession, exchangePrivyJwtForAppSession } from "../lib/appAuth";
import { buildRowsFromExportPlan, downloadCsv, downloadXlsx } from "../lib/export";
import { compactAddress, formatIpAmount } from "../lib/format";
import {
  confirmVerification,
  createOrder,
  deployCdrWithServerWalletEvents,
  extendSearchRequest,
  getExportPlan,
  getMyProfile,
  getQuote,
  getSearchRequest,
  listOrders,
  listSales,
  listSearchRequests,
  saveExportLog,
  startVerification,
  toggleCdr,
  uploadAvatarImage,
  upsertField,
  upsertProfile,
} from "../lib/api";
import { getPrivyWalletConnection, pickPrimaryPrivyWallet } from "../lib/web3/privy";
import type {
  CdrState,
  CareerHistoryItem,
  DataField,
  DataFieldKind,
  EducationHistoryItem,
  OrderSummary,
  Profile,
  PublicProfileFields,
  QuoteResponse,
  SaleSummary,
  SearchRequestDetail,
  SearchRequestSummary,
  VerificationStatus,
} from "../lib/types";

type NavKey = "search" | "myData" | "requests" | "sales" | "settings";
type MyDataFilterKey = "basic" | "lv1" | "lv2";

type FieldDraft = {
  id?: string;
  kind: DataFieldKind;
  label: string;
  valuePreview: string;
  accessMode: "free" | "paid";
  priceCents: number;
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
  verificationId?: string;
  code: string;
  statusMessage?: string;
};

type ProfileDraft = {
  id?: string;
  publicSlug?: string;
  displayName: string;
  avatarUrl?: string;
  walletAddress?: string;
  payoutAddress?: string;
  publicFields: PublicProfileFields;
};

type PublicProfileRow = {
  key: keyof PublicProfileFields;
  label: string;
  control?: "input" | "radio" | "select";
  type?: "text" | "number" | "month";
  min?: number;
  max?: number;
  options?: ReadonlyArray<{ value: string; label: string }>;
  required?: boolean;
  value: string;
};

type ConfirmDialogState = {
  title: string;
  body: string;
  confirmLabel: string;
  tone?: "default" | "danger";
  onConfirm(): void;
};

type QuoteMatch = QuoteResponse["matches"][number];
type QuoteFieldCost = QuoteMatch["fieldCosts"][number];
type SearchWorkflowState = {
  prompt: string;
  progress: number;
  stageIndex: number;
};
type HistorySection = "education" | "career";
type HistoryDragState = {
  section: HistorySection;
  id: string;
};

const navItems: Array<{ key: NavKey; label: string; icon: IconAssetName }> = [
  { key: "search", label: "Search", icon: "search" },
  { key: "myData", label: "My Data", icon: "profile" },
  { key: "requests", label: "Requests", icon: "collectbox" },
  { key: "sales", label: "Sales", icon: "ip" },
  { key: "settings", label: "Settings", icon: "setting" },
] as const;

const paidFieldDefs: Array<Pick<FieldDraft, "kind" | "label" | "valuePreview" | "priceCents" | "requiresVerification"> & { level: "LV1" | "LV2" }> = [
  { kind: "email", label: "E-mail", valuePreview: "", priceCents: 900, requiresVerification: false, level: "LV1" },
  { kind: "mobile", label: "Mobile", valuePreview: "", priceCents: 1400, requiresVerification: true, level: "LV1" },
  { kind: "telegram", label: "Telegram", valuePreview: "", priceCents: 450, requiresVerification: false, level: "LV1" },
  { kind: "discord", label: "Discord", valuePreview: "", priceCents: 350, requiresVerification: false, level: "LV1" },
  { kind: "twitter", label: "Twitter", valuePreview: "", priceCents: 300, requiresVerification: false, level: "LV1" },
  { kind: "insurance", label: "Insurance Data", valuePreview: "", priceCents: 2200, requiresVerification: false, level: "LV2" },
  { kind: "height", label: "Height", valuePreview: "", priceCents: 250, requiresVerification: false, level: "LV2" },
  { kind: "weight", label: "Weight", valuePreview: "", priceCents: 250, requiresVerification: false, level: "LV2" },
  { kind: "blood_type", label: "Blood Type", valuePreview: "", priceCents: 300, requiresVerification: false, level: "LV2" },
];

const socialHandleFieldKinds = new Set<DataFieldKind>(["telegram", "discord", "twitter"]);
const fieldLevelByKind = new Map<DataFieldKind, "LV1" | "LV2">(paidFieldDefs.map((field) => [field.kind, field.level]));

const freeDataTip = "무료 데이터에 정확히 적어줘야 데이터가 세일즈 될 확률이 높아요.";
const genderOptions = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "nonbinary", label: "Nonbinary" },
] as const;
const countryOptions = [
  { value: "Korea", label: "Korea" },
  { value: "United States", label: "United States" },
  { value: "Japan", label: "Japan" },
  { value: "China", label: "China" },
  { value: "Singapore", label: "Singapore" },
  { value: "United Kingdom", label: "United Kingdom" },
  { value: "Australia", label: "Australia" },
  { value: "Canada", label: "Canada" },
  { value: "France", label: "France" },
  { value: "Germany", label: "Germany" },
  { value: "Hong Kong", label: "Hong Kong" },
  { value: "India", label: "India" },
  { value: "Indonesia", label: "Indonesia" },
  { value: "Malaysia", label: "Malaysia" },
  { value: "Netherlands", label: "Netherlands" },
  { value: "New Zealand", label: "New Zealand" },
  { value: "Philippines", label: "Philippines" },
  { value: "Taiwan", label: "Taiwan" },
  { value: "Thailand", label: "Thailand" },
  { value: "Vietnam", label: "Vietnam" },
  { value: "Argentina", label: "Argentina" },
  { value: "Austria", label: "Austria" },
  { value: "Bangladesh", label: "Bangladesh" },
  { value: "Belgium", label: "Belgium" },
  { value: "Brazil", label: "Brazil" },
  { value: "Chile", label: "Chile" },
  { value: "Colombia", label: "Colombia" },
  { value: "Czech Republic", label: "Czech Republic" },
  { value: "Denmark", label: "Denmark" },
  { value: "Egypt", label: "Egypt" },
  { value: "Finland", label: "Finland" },
  { value: "Greece", label: "Greece" },
  { value: "Hungary", label: "Hungary" },
  { value: "Ireland", label: "Ireland" },
  { value: "Israel", label: "Israel" },
  { value: "Italy", label: "Italy" },
  { value: "Mexico", label: "Mexico" },
  { value: "Norway", label: "Norway" },
  { value: "Pakistan", label: "Pakistan" },
  { value: "Peru", label: "Peru" },
  { value: "Poland", label: "Poland" },
  { value: "Portugal", label: "Portugal" },
  { value: "Romania", label: "Romania" },
  { value: "Saudi Arabia", label: "Saudi Arabia" },
  { value: "South Africa", label: "South Africa" },
  { value: "Spain", label: "Spain" },
  { value: "Sweden", label: "Sweden" },
  { value: "Switzerland", label: "Switzerland" },
  { value: "Turkey", label: "Turkey" },
  { value: "United Arab Emirates", label: "United Arab Emirates" },
] as const;
const educationStatusOptions = [
  { value: "enrolled", label: "Enrolled" },
  { value: "graduated", label: "Graduated" },
  { value: "on_leave", label: "On leave" },
  { value: "dropped_out", label: "Dropped out" },
] as const;
const careerStatusOptions = [
  { value: "employed", label: "In progress" },
  { value: "left", label: "Left" },
  { value: "freelance", label: "Freelance" },
  { value: "career_break", label: "Career break" },
] as const;
const defaultCountry = "Korea";
const defaultEducationStatus = "graduated";
const defaultCareerStatus = "employed";
const phoneCountryOptions = [
  { value: "+82", label: "KR +82" },
  { value: "+1", label: "US +1" },
  { value: "+81", label: "JP +81" },
  { value: "+86", label: "CN +86" },
  { value: "+44", label: "UK +44" },
  { value: "+65", label: "SG +65" },
] as const;
const supportedAvatarMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maxAvatarImageBytes = 2 * 1024 * 1024;

function createHistoryId(prefix: "career" | "education") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEducationItem(): EducationHistoryItem {
  return { id: createHistoryId("education"), education: "", status: defaultEducationStatus };
}

function createCareerItem(): CareerHistoryItem {
  return { id: createHistoryId("career"), career: "", startDate: "", endDate: "", status: defaultCareerStatus };
}

function reorderById<T extends { id: string }>(items: T[], activeId: string, overId: string) {
  const fromIndex = items.findIndex((item) => item.id === activeId);
  const toIndex = items.findIndex((item) => item.id === overId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function normalizeEducationItem(item: EducationHistoryItem): EducationHistoryItem {
  return {
    ...item,
    status: item.status || defaultEducationStatus,
  };
}

function normalizeCareerItem(item: CareerHistoryItem): CareerHistoryItem {
  const status = item.status || (!item.endDate ? defaultCareerStatus : "left");
  return {
    ...item,
    endDate: status === defaultCareerStatus ? "" : item.endDate,
    status,
  };
}

function parseMonthValue(value: string) {
  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}

function calculateCareerWorkYears(career: Pick<CareerHistoryItem, "startDate" | "endDate" | "status">) {
  const start = parseMonthValue(career.startDate);
  if (!start) return 0;

  const now = new Date();
  const end =
    parseMonthValue(career.endDate) ??
    (career.status === "employed" ? { year: now.getFullYear(), month: now.getMonth() + 1 } : null);
  if (!end) return 0;

  const months = (end.year - start.year) * 12 + (end.month - start.month);
  return Math.max(0, Math.floor(months / 12));
}

function splitPhoneValue(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\+\d{1,4})(?:\s+)?(.*)$/);
  return {
    countryCode: match?.[1] ?? "+82",
    nationalNumber: match?.[2] ?? trimmed,
  };
}

function countryOptionsForValue(value: string): ReadonlyArray<{ value: string; label: string }> {
  const normalizedValue = value.trim() || defaultCountry;
  if (!normalizedValue || countryOptions.some((option) => option.value === normalizedValue)) return countryOptions;
  return [{ value: normalizedValue, label: normalizedValue }, ...countryOptions];
}

function legacyEducationItems(fields: PublicProfileFields): EducationHistoryItem[] {
  if (fields.educations?.length) return fields.educations.map(normalizeEducationItem);
  return [normalizeEducationItem({ id: "education-1", education: fields.education ?? "", status: fields.educationStatus ?? "" })];
}

function legacyCareerItems(fields: PublicProfileFields): CareerHistoryItem[] {
  if (fields.careers?.length) return fields.careers.map(normalizeCareerItem);
  return [
    normalizeCareerItem({
      id: "career-1",
      career: fields.career ?? "",
      startDate: fields.careerStartDate ?? "",
      endDate: fields.careerEndDate ?? "",
      status: fields.careerStatus ?? "",
    }),
  ];
}

function syncPublicHistoryFields(fields: PublicProfileFields): PublicProfileFields {
  const educations = legacyEducationItems(fields);
  const careers = legacyCareerItems(fields);
  const primaryEducation = educations.find((item) => item.education.trim() || item.status.trim()) ?? educations[0] ?? createEducationItem();
  const primaryCareer = careers.find((item) => item.career.trim() || item.startDate || item.endDate || item.status.trim()) ?? careers[0] ?? createCareerItem();

  return {
    ...fields,
    country: fields.country || defaultCountry,
    education: primaryEducation.education,
    educationStatus: primaryEducation.status,
    educations,
    career: primaryCareer.career,
    careerWorkYears: careers.reduce((total, item) => total + calculateCareerWorkYears(item), 0),
    careerStartDate: primaryCareer.startDate,
    careerEndDate: primaryCareer.endDate,
    careerStatus: primaryCareer.status,
    careers,
  };
}

const searchWorkflowStages = [
  { title: "Parsing prompt", detail: "Natural-language filters and intent are being structured." },
  { title: "Scanning public card graph", detail: "Public demographic and occupation signals are being matched." },
  { title: "Building anonymous shortlist", detail: "Only anonymous candidate cards are grouped for review." },
  { title: "Pricing access bundle", detail: "Per-field costs and batch totals are being calculated." },
] as const;

const defaultProfile: ProfileDraft = {
  displayName: "",
  publicFields: {
    name: "",
    gender: "",
    age: 0,
    country: defaultCountry,
    locale: "",
    occupation: "",
    education: "",
    educationStatus: defaultEducationStatus,
    educations: [{ id: "education-1", education: "", status: defaultEducationStatus }],
    career: "",
    careerWorkYears: 0,
    careerStartDate: "",
    careerEndDate: "",
    careerStatus: defaultCareerStatus,
    careers: [{ id: "career-1", career: "", startDate: "", endDate: "", status: defaultCareerStatus }],
  },
};

function createInitialFields(): FieldDraft[] {
  return paidFieldDefs.map((field) => ({
    ...field,
    accessMode: "paid",
    verificationStatus: field.requiresVerification ? "pending" : "not_required",
    cdrState: "off",
    code: "",
  }));
}

function mergeSavedField(field: DataField): Partial<FieldDraft> {
  const requiresVerification = field.kind === "email" ? false : field.requiresVerification;
  const verificationStatus: VerificationStatus = requiresVerification ? field.verificationStatus : "not_required";

  return {
    id: field.id,
    label: field.label,
    valuePreview: field.valuePreview,
    accessMode: field.accessMode,
    priceCents: field.priceCents,
    requiresVerification,
    verificationStatus,
    cdrState: field.cdrState,
    cdrVaultUuid: field.cdrVaultUuid,
    deployTxHash: field.deployTxHash,
    cdrLicenseIpId: field.cdrLicenseIpId,
    cdrLicenseTermsId: field.cdrLicenseTermsId,
    platformWallet: field.platformWallet,
    ipaRecipient: field.ipaRecipient,
    ipaNftContract: field.ipaNftContract,
    ipaTokenId: field.ipaTokenId,
    ipRegistrationTxHash: field.ipRegistrationTxHash,
    ipaTransferTxHash: field.ipaTransferTxHash,
    licenseConfigTxHash: field.licenseConfigTxHash,
    licenseAttachTxHash: field.licenseAttachTxHash,
    cdrAllocateTxHash: field.cdrAllocateTxHash,
  };
}

function parseApiError(error: unknown) {
  if (error instanceof Error) {
    const knownMessage = formatKnownError(error.message);
    if (knownMessage) return knownMessage;
    if (isWalletSignerError(error.message)) return "Embedded wallet signer unavailable. Reconnect Privy before wallet actions.";
    if (isWalletConnectionCancelled(error.message)) return "Wallet connection cancelled";
    try {
      const parsed = JSON.parse(error.message) as {
        error?: string;
        message?: string;
        issues?: Array<{ path?: Array<string | number>; message?: string }>;
      };
      const parsedMessage = parsed.message ?? parsed.error ?? "";
      const knownParsedMessage = formatKnownError(parsedMessage);
      if (knownParsedMessage) return knownParsedMessage;
      if (isWalletSignerError(parsedMessage)) return "Embedded wallet signer unavailable. Reconnect Privy before wallet actions.";
      if (isWalletConnectionCancelled(parsedMessage)) return "Wallet connection cancelled";
      if (parsed.error === "validation_error" && parsed.issues?.length) {
        const issue = parsed.issues[0];
        const fieldPath = issue?.path?.join(".");
        return fieldPath ? `${fieldPath}: ${issue?.message ?? "invalid value"}` : issue?.message ?? "validation_error";
      }
      return parsed.message ?? parsed.error ?? error.message;
    } catch {
      return error.message;
    }
  }
  return "unknown_error";
}

function formatKnownError(message: string) {
  if (message === "field_license_config_missing" || message === "no_purchasable_fields") {
    return "This CDR is not ready for on-chain license minting. Search again after the field deploy is complete.";
  }
  return "";
}

function isWalletSignerError(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("recovery method not supported") ||
    normalized.includes("smart_wallet_not_ready") ||
    normalized.includes("embedded wallet recovery") ||
    normalized.includes("wallet_not_ready") ||
    normalized.includes("signer unavailable")
  );
}

function isWalletConnectionCancelled(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("user exited before wallet could be connected") ||
    normalized.includes("user rejected") ||
    normalized.includes("user denied") ||
    normalized.includes("rejected the request")
  );
}

function calculateMatchSubtotal(match: QuoteMatch, selectedFieldSet: Set<DataFieldKind>) {
  return match.fieldCosts
    .filter((fieldCost) => selectedFieldSet.has(fieldCost.kind))
    .reduce((total, fieldCost) => total + fieldCost.priceCents, 0);
}

function calculateRequestMatchSubtotal(match: QuoteMatch) {
  return match.fieldCosts.reduce((total, fieldCost) => total + fieldCost.priceCents, 0);
}

function getRequestFieldCosts(request: SearchRequestDetail) {
  return request.matches.flatMap((match) => match.fieldCosts);
}

function calculateFieldCostTotal(fieldCosts: QuoteFieldCost[]) {
  return fieldCosts.reduce((total, fieldCost) => total + fieldCost.priceCents, 0);
}

function countSelectedRequestCards(request: SearchRequestDetail, selectedFieldIds: Set<string>) {
  return request.matches.filter((match) => match.fieldCosts.some((fieldCost) => selectedFieldIds.has(fieldCost.fieldId))).length;
}

function calculateFieldSubtotal(matches: QuoteMatch[], kind: DataFieldKind) {
  return matches.reduce((total, match) => {
    const fieldCost = match.fieldCosts.find((item) => item.kind === kind);
    return total + (fieldCost?.priceCents ?? 0);
  }, 0);
}

function validateRequiredProfileFields(publicFields: PublicProfileFields) {
  if (!publicFields.name.trim()) return "Name is required";
  if (!publicFields.gender.trim()) return "Gender is required";
  if (!Number.isInteger(publicFields.age) || publicFields.age < 1 || publicFields.age > 120) return "Age must be between 1 and 120";
  return undefined;
}

function isAddress(value: string | undefined): value is `0x${string}` {
  return Boolean(value?.match(/^0x[a-fA-F0-9]{40}$/));
}

function isUintString(value: string | undefined) {
  return Boolean(value?.match(/^\d+$/));
}

function isTxHash(value: string | undefined) {
  return Boolean(value?.match(/^0x[a-fA-F0-9]{64}$/));
}

function Logo() {
  return (
    <Link className="brand-mark" href="/" aria-label="Go to AXIOS landing">
      <IconAsset name="logo" size={24} />
      <span>AXIOS</span>
    </Link>
  );
}

export function AxiosApp() {
  const { authenticated, getAccessToken, login, logout, ready: privyReady, user } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const [activeTab, setActiveTab] = useState<NavKey>("search");
  const [activeMyDataFilter, setActiveMyDataFilter] = useState<MyDataFilterKey>("basic");
  const [profile, setProfile] = useState<ProfileDraft>(defaultProfile);
  const [fields, setFields] = useState<FieldDraft[]>(createInitialFields);
  const [prompt, setPrompt] = useState("29-32세에 서울에 거주하는 IT 직장인");
  const [selectedFields, setSelectedFields] = useState<DataFieldKind[]>(["email", "mobile", "telegram"]);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [selectedMatches, setSelectedMatches] = useState<string[]>([]);
  const [searchRequests, setSearchRequests] = useState<SearchRequestSummary[]>([]);
  const [searchRequestDetail, setSearchRequestDetail] = useState<SearchRequestDetail | null>(null);
  const [detailSelectedFieldIds, setDetailSelectedFieldIds] = useState<string[]>([]);
  const [detailMorePrompt, setDetailMorePrompt] = useState("");
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [sales, setSales] = useState<SaleSummary[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [appAuthReady, setAppAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authAttempt, setAuthAttempt] = useState(0);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [cdrDeployKind, setCdrDeployKind] = useState<DataFieldKind | null>(null);
  const [searchWorkflow, setSearchWorkflow] = useState<SearchWorkflowState | null>(null);
  const [draggingHistory, setDraggingHistory] = useState<HistoryDragState | null>(null);
  const [dragOverHistory, setDragOverHistory] = useState<HistoryDragState | null>(null);
  const appContentRef = useRef<HTMLElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const profileLoadedForRef = useRef("");

  const activeWallet = useMemo(() => pickPrimaryPrivyWallet(wallets), [wallets]);
  const connectedWallet: string | undefined = walletsReady ? activeWallet?.address ?? user?.wallet?.address : undefined;
  const loginEmail = user?.email?.address?.trim() ?? "";
  const privyAccountEmail =
    [
      loginEmail,
      user?.google?.email,
      user?.discord?.email,
      user?.github?.email,
      user?.apple?.email,
      user?.spotify?.email,
      (user as any)?.line?.email,
      (user as any)?.linkedin?.email,
    ]
      .find((email) => Boolean(email?.trim()))
      ?.trim() ?? "";
  const privyLoginAccount =
    privyAccountEmail ||
    user?.phone?.number ||
    user?.telegram?.username ||
    user?.twitter?.username ||
    user?.wallet?.address ||
    user?.id ||
    "";
  const profileAccountRows = authenticated
    ? [
        { label: "Privy account", value: privyLoginAccount },
        { label: "Embedded wallet", value: connectedWallet ?? user?.wallet?.address ?? "" },
      ].filter((row) => row.value)
    : [{ label: "Privy account", value: "Not signed in" }];
  const hasAppAccess = authenticated && appAuthReady;

  const selectedQuoteMatches = useMemo(
    () => quote?.matches.filter((match) => selectedMatches.includes(match.matchRef)) ?? [],
    [quote, selectedMatches],
  );
  const selectedFieldSet = useMemo(() => new Set(selectedFields), [selectedFields]);
  const selectedFieldTotals = useMemo(
    () =>
      paidFieldDefs.reduce<Record<DataFieldKind, number>>(
        (totals, field) => ({
          ...totals,
          [field.kind]: calculateFieldSubtotal(selectedQuoteMatches, field.kind),
        }),
        {} as Record<DataFieldKind, number>,
      ),
    [selectedQuoteMatches],
  );
  const selectedSubtotal = selectedFields.reduce((total, kind) => total + (selectedFieldTotals[kind] ?? 0), 0);
  // The 10% platform cut is now an on-chain commercial-remix royalty taken from the
  // seller's revenue — it is no longer added on top of what the buyer pays.
  const selectedTotal = selectedSubtotal;
  const selectedLicenseFields = useMemo(
    () =>
      selectedQuoteMatches.flatMap((match) =>
        match.fieldCosts.filter((fieldCost) => selectedFieldSet.has(fieldCost.kind) && fieldCost.cdrState === "on"),
      ),
    [selectedFieldSet, selectedQuoteMatches],
  );

  useEffect(() => {
    if (!hasAppAccess) return;
    void refreshHistory();
  }, [connectedWallet, hasAppAccess]);

  useEffect(() => {
    const profileLoadKey = `${user?.id || privyAccountEmail || ""}:${connectedWallet || ""}`;
    if (!hasAppAccess || !profileLoadKey.trim() || profileLoadedForRef.current === profileLoadKey) return;
    profileLoadedForRef.current = profileLoadKey;

    let cancelled = false;
    void getMyProfile()
      .then((response) => {
        if (cancelled || !response.profile) return;
        setProfile({
          id: response.profile.id,
          publicSlug: response.profile.publicSlug,
          displayName: response.profile.displayName,
          avatarUrl: response.profile.avatarUrl,
          walletAddress: response.profile.walletAddress,
          payoutAddress: response.profile.payoutAddress,
          publicFields: syncPublicHistoryFields(response.profile.publicFields),
        });
        setFields((current) =>
          current.map((field) => {
            const saved = response.fields.find((item) => item.kind === field.kind);
            return saved ? { ...field, ...mergeSavedField(saved), code: field.code } : field;
          }),
        );
      })
      .catch((error) => {
        if (cancelled) return;
        profileLoadedForRef.current = "";
        setNotice(parseApiError(error));
      });

    return () => {
      cancelled = true;
    };
  }, [connectedWallet, hasAppAccess, privyAccountEmail, user?.id]);

  useEffect(() => {
    if (!privyReady || !authenticated) {
      clearAppAuthSession();
      setAppAuthReady(false);
      setAuthError("");
      return;
    }

    let cancelled = false;
    setAppAuthReady(false);
    void exchangePrivyJwtForAppSession(getAccessToken)
      .then(() => {
        if (!cancelled) {
          setAppAuthReady(true);
          setAuthError("");
        }
      })
      .catch((error) => {
        clearAppAuthSession();
        if (!cancelled) {
          setAppAuthReady(false);
          const message = parseApiError(error);
          // Surface the real cause — this is what's behind "Server session not ready".
          console.error("[auth] Privy→app session exchange failed:", error);
          setAuthError(message);
          setNotice(message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authenticated, privyReady, user?.id, authAttempt, getAccessToken]);

  useEffect(() => {
    if (activeTab === "myData") {
      setNotice(freeDataTip);
    }
  }, [activeTab]);

  useEffect(() => {
    const scroller = appContentRef.current;
    if (!scroller) return;

    let frame = 0;
    const syncMyDataScroll = () => {
      frame = 0;
      const progress = activeTab === "myData" ? Math.min(scroller.scrollTop / 170, 1) : 0;
      scroller.style.setProperty("--my-data-scroll-progress", progress.toFixed(3));
      scroller.style.setProperty("--my-data-sticky-gap", `${8 - 4 * progress}px`);
      scroller.style.setProperty("--my-data-sticky-padding-top", `${16 - 4 * progress}px`);
      scroller.style.setProperty("--my-data-sticky-padding-bottom", `${12 - 4 * progress}px`);
      scroller.style.setProperty("--my-data-sticky-shift", `${-2 * progress}px`);
      scroller.style.setProperty("--my-data-avatar-shift", "0px");
      scroller.style.setProperty("--my-data-avatar-margin-bottom", `${14 - 10 * progress}px`);
      scroller.style.setProperty("--my-data-avatar-width", `${158 - 46 * progress}px`);
      scroller.style.setProperty("--my-data-avatar-height", `${118 - 34 * progress}px`);
      scroller.style.setProperty("--my-data-avatar-icon-scale", `${0.84 - 0.12 * progress}`);
      scroller.style.setProperty("--my-data-avatar-button-size", `${34 - 8 * progress}px`);
      scroller.style.setProperty("--my-data-avatar-button-inset", `${8 - 2 * progress}px`);
      scroller.style.setProperty("--my-data-avatar-button-scale", `${0.82 - 0.12 * progress}`);
      scroller.style.setProperty("--my-data-filter-padding-top", `${24 - 12 * progress}px`);
      scroller.style.setProperty("--my-data-filter-shift", `${-8 * progress}px`);
    };
    const handleScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(syncMyDataScroll);
    };

    syncMyDataScroll();
    scroller.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", handleScroll);
    };
  }, [activeTab]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!profileMenuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    if (!privyAccountEmail) return;
    setFields((current) => {
      const emailField = current.find((field) => field.kind === "email");
      if (!emailField || emailField.valuePreview === privyAccountEmail) return current;
      return current.map((field) => (field.kind === "email" ? { ...field, valuePreview: privyAccountEmail } : field));
    });
  }, [privyAccountEmail]);

  function updateProfileField<K extends keyof PublicProfileFields>(key: K, value: PublicProfileFields[K]) {
    setProfile((current) => ({
      ...current,
      publicFields: { ...current.publicFields, [key]: value },
      displayName: key === "name" && typeof value === "string" ? value : current.displayName,
    }));
  }

  function updateEducationItem(id: string, patch: Partial<EducationHistoryItem>) {
    setProfile((current) => {
      const educations = legacyEducationItems(current.publicFields).map((item) => (item.id === id ? { ...item, ...patch } : item));
      return {
        ...current,
        publicFields: syncPublicHistoryFields({ ...current.publicFields, educations }),
      };
    });
  }

  function addEducationItem() {
    setProfile((current) => {
      const educations = [...legacyEducationItems(current.publicFields), createEducationItem()];
      return {
        ...current,
        publicFields: syncPublicHistoryFields({ ...current.publicFields, educations }),
      };
    });
  }

  function removeEducationItem(id: string) {
    setProfile((current) => {
      const next = legacyEducationItems(current.publicFields).filter((item) => item.id !== id);
      const educations = next.length ? next : [createEducationItem()];
      return {
        ...current,
        publicFields: syncPublicHistoryFields({ ...current.publicFields, educations }),
      };
    });
  }

  function reorderEducationItem(activeId: string, overId: string) {
    setProfile((current) => {
      const educations = reorderById(legacyEducationItems(current.publicFields), activeId, overId);
      return {
        ...current,
        publicFields: syncPublicHistoryFields({ ...current.publicFields, educations }),
      };
    });
  }

  function updateCareerItem(id: string, patch: Partial<CareerHistoryItem>) {
    setProfile((current) => {
      const careers = legacyCareerItems(current.publicFields).map((item) => (item.id === id ? { ...item, ...patch } : item));
      return {
        ...current,
        publicFields: syncPublicHistoryFields({ ...current.publicFields, careers }),
      };
    });
  }

  function addCareerItem() {
    setProfile((current) => {
      const careers = [...legacyCareerItems(current.publicFields), createCareerItem()];
      return {
        ...current,
        publicFields: syncPublicHistoryFields({ ...current.publicFields, careers }),
      };
    });
  }

  function removeCareerItem(id: string) {
    setProfile((current) => {
      const next = legacyCareerItems(current.publicFields).filter((item) => item.id !== id);
      const careers = next.length ? next : [createCareerItem()];
      return {
        ...current,
        publicFields: syncPublicHistoryFields({ ...current.publicFields, careers }),
      };
    });
  }

  function reorderCareerItem(activeId: string, overId: string) {
    setProfile((current) => {
      const careers = reorderById(legacyCareerItems(current.publicFields), activeId, overId);
      return {
        ...current,
        publicFields: syncPublicHistoryFields({ ...current.publicFields, careers }),
      };
    });
  }

  function handleHistoryDragStart(section: HistorySection, id: string, event: ReactDragEvent<HTMLButtonElement>) {
    setDraggingHistory({ section, id });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `${section}:${id}`);
  }

  function handleHistoryDragOver(section: HistorySection, id: string, event: ReactDragEvent<HTMLDivElement>) {
    if (!draggingHistory || draggingHistory.section !== section || draggingHistory.id === id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverHistory({ section, id });
  }

  function handleHistoryDrop(section: HistorySection, id: string, event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!draggingHistory || draggingHistory.section !== section || draggingHistory.id === id) {
      setDraggingHistory(null);
      setDragOverHistory(null);
      return;
    }
    if (section === "education") reorderEducationItem(draggingHistory.id, id);
    else reorderCareerItem(draggingHistory.id, id);
    setDraggingHistory(null);
    setDragOverHistory(null);
  }

  function handleHistoryDragEnd() {
    setDraggingHistory(null);
    setDragOverHistory(null);
  }

  function updateField(kind: DataFieldKind, patch: Partial<FieldDraft>) {
    setFields((current) => current.map((field) => (field.kind === kind ? { ...field, ...patch } : field)));
  }

  function validateFieldDraftForCdr(field: FieldDraft) {
    if (!field.valuePreview.trim()) return `Enter ${field.label} before CDR`;
    if (!Number.isInteger(field.priceCents) || field.priceCents < 0) return `Set ${field.label} price before CDR`;
    // The field's Story IP is auto-registered as a remix derivative on deploy —
    // no manual IP ID needed anymore (see handleDeploy / registerFieldDerivativeIp).
    if (field.requiresVerification && field.verificationStatus !== "verified") return `Verify ${field.label} before CDR`;
    return undefined;
  }

  function requirePrivyLogin(action: string) {
    if (authenticated) return true;
    if (!privyReady) {
      setNotice("Login is loading… try again in a moment");
      return false;
    }
    login();
    setNotice(`Sign in to ${action}`);
    return false;
  }

  function requireAppSession(action: string) {
    if (!requirePrivyLogin(action)) return false;
    if (!appAuthReady) {
      setNotice(authError ? `Sign-in failed: ${authError}` : "Signing in… try again in a moment");
      return false;
    }
    return true;
  }

  function handleNavClick(key: NavKey, label: string) {
    if (key !== "search" && !requirePrivyLogin(`open ${label}`)) return;
    setActiveTab(key);
  }

  function requireWallet(action: string) {
    if (!connectedWallet) {
      if (!authenticated) {
        login();
        setNotice(`Sign in to ${action}`);
      } else {
        setNotice("Embedded wallet is still being prepared. Try again in a moment.");
      }
      return undefined;
    }
    if (!appAuthReady) {
      setNotice(authError ? `Sign-in failed: ${authError}` : "Signing in… try again in a moment");
      return undefined;
    }
    return connectedWallet;
  }

  async function handleConnectWallet() {
    if (!authenticated) {
      login();
      return;
    }
    setNotice(connectedWallet ? "Embedded wallet ready" : "Embedded wallet is still being prepared");
  }

  function requireEmbeddedWallet(action: string) {
    if (!requireAppSession(action)) return undefined;
    if (!connectedWallet || !activeWallet) {
      setNotice("Embedded wallet unavailable. Reconnect Privy before wallet actions.");
      return undefined;
    }
    return connectedWallet;
  }

  async function getEmbeddedWalletConnection() {
    if (!activeWallet) throw new Error("wallet_not_ready");
    try {
      return await getPrivyWalletConnection(activeWallet);
    } catch (error) {
      if (error instanceof Error && isWalletSignerError(error.message)) {
        throw new Error("Embedded wallet signer unavailable. Reconnect Privy before wallet actions.");
      }
      throw error;
    }
  }

  async function handleCopyWallet(value: string, label: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied`);
    } catch {
      setNotice(`Failed to copy ${label.toLowerCase()}`);
    }
  }

  async function saveProfileOnly(walletOverride?: string, profilePatch?: Partial<ProfileDraft>): Promise<Profile> {
    const nextProfile = { ...profile, ...profilePatch };
    const publicFields = syncPublicHistoryFields(nextProfile.publicFields);
    const requiredError = validateRequiredProfileFields(publicFields);
    if (requiredError) throw new Error(requiredError);
    const displayName = nextProfile.displayName.trim() || publicFields.name.trim();
    const walletAddress = walletOverride ?? nextProfile.walletAddress;
    const payoutAddress = nextProfile.payoutAddress ?? walletAddress;
    const response = await upsertProfile({
      id: nextProfile.id,
      publicSlug: nextProfile.publicSlug,
      displayName,
      avatarUrl: nextProfile.avatarUrl,
      walletAddress,
      payoutAddress,
      publicFields,
    });
    setProfile({
      id: response.profile.id,
      publicSlug: response.profile.publicSlug,
      displayName: response.profile.displayName,
      avatarUrl: response.profile.avatarUrl,
      walletAddress: response.profile.walletAddress,
      payoutAddress: response.profile.payoutAddress,
      publicFields: syncPublicHistoryFields(response.profile.publicFields),
    });
    return response.profile;
  }

  function fileToDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("image_read_failed"));
      reader.readAsDataURL(file);
    });
  }

  function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function handleAvatarClick() {
    const wallet = requireWallet("upload image");
    if (!wallet) return;
    avatarInputRef.current?.click();
  }

  async function handleAvatarSelected(file: File | undefined) {
    const wallet = requireWallet("upload image");
    if (!wallet || !file) return;
    if (!supportedAvatarMimeTypes.has(file.type)) {
      setNotice("Use JPG, PNG, WebP, or GIF for profile image");
      return;
    }
    if (file.size > maxAvatarImageBytes) {
      setNotice("Profile image must be 2MB or smaller");
      return;
    }

    setBusy("avatar");
    try {
      const dataBase64 = await fileToDataUrl(file);
      const uploaded = await uploadAvatarImage({
        ownerWallet: wallet,
        fileName: file.name,
        mimeType: file.type,
        dataBase64,
      });
      await saveProfileOnly(wallet, { avatarUrl: uploaded.url });
      setNotice("Image uploaded to Hetzner S3");
    } catch (error) {
      setNotice(parseApiError(error));
    } finally {
      setBusy(null);
    }
  }

  async function saveOneField(kind: DataFieldKind, savedProfile?: Profile, patch: Partial<FieldDraft> = {}): Promise<DataField> {
    const nextProfile = savedProfile ?? (await saveProfileOnly());
    const currentField = fields.find((item) => item.kind === kind);
    if (!currentField) throw new Error("field_not_found");
    const field = { ...currentField, ...patch };

    const response = await upsertField({
      id: field.id,
      profileId: nextProfile.id,
      kind: field.kind,
      label: field.label,
      valuePreview: field.valuePreview,
      accessMode: field.accessMode,
      priceCents: field.priceCents,
      currency: "IP",
      requiresVerification: field.requiresVerification,
      verificationStatus: field.verificationStatus,
      cdrState: field.cdrState,
      cdrVaultUuid: field.cdrVaultUuid,
      deployTxHash: field.deployTxHash,
      cdrLicenseIpId: field.cdrLicenseIpId,
      cdrLicenseTermsId: field.cdrLicenseTermsId,
      platformWallet: field.platformWallet,
      ipaRecipient: field.ipaRecipient,
      ipaNftContract: field.ipaNftContract,
      ipaTokenId: field.ipaTokenId,
      ipRegistrationTxHash: field.ipRegistrationTxHash,
      ipaTransferTxHash: field.ipaTransferTxHash,
      licenseConfigTxHash: field.licenseConfigTxHash,
      licenseAttachTxHash: field.licenseAttachTxHash,
      cdrAllocateTxHash: field.cdrAllocateTxHash,
      sellerAddress: nextProfile.payoutAddress,
    });
    updateField(kind, mergeSavedField(response.field));
    return response.field;
  }

  async function handleSaveAll() {
    if (activeTab === "myData" && !requireAppSession("register data")) return;
    const wallet = connectedWallet;

    setBusy("save");
    try {
      const savedProfile = await saveProfileOnly(wallet);
      const savedFields = await Promise.all(fields.map((field) => saveOneField(field.kind, savedProfile)));
      setFields((current) =>
        current.map((field) => {
          const saved = savedFields.find((item) => item.kind === field.kind);
          return saved ? { ...field, ...mergeSavedField(saved) } : field;
        }),
      );
      setNotice("Profile saved");
    } catch (error) {
      setNotice(parseApiError(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleSendCode(kind: "email" | "mobile") {
    setBusy(`verify-${kind}`);
    try {
      const savedProfile = await saveProfileOnly();
      const savedField = await saveOneField(kind, savedProfile);
      const verification = await startVerification({
        profileId: savedProfile.id,
        fieldId: savedField.id,
        channel: kind,
        target: fields.find((field) => field.kind === kind)?.valuePreview ?? "",
      });
      updateField(kind, {
        id: savedField.id,
        verificationId: verification.verificationId,
        verificationStatus: "pending",
        statusMessage: "Code sent",
      });
      setNotice("Verification code sent");
    } catch (error) {
      updateField(kind, { statusMessage: parseApiError(error) });
      setNotice(parseApiError(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleConfirmCode(kind: "email" | "mobile") {
    const field = fields.find((item) => item.kind === kind);
    if (!field?.verificationId || !field.id) {
      updateField(kind, { statusMessage: "Send code first" });
      return;
    }

    setBusy(`confirm-${kind}`);
    try {
      const response = await confirmVerification({
        verificationId: field.verificationId,
        fieldId: field.id,
        code: field.code,
      });
      updateField(kind, { ...mergeSavedField(response.field), code: "", statusMessage: "Verified" });
      setNotice(`${field.label} verified`);
    } catch (error) {
      updateField(kind, { statusMessage: parseApiError(error) });
      setNotice(parseApiError(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleDeploy(kind: DataFieldKind, priceCentsOverride?: number) {
    const field = fields.find((item) => item.kind === kind);
    if (!field) return;
    const nextPriceCents = priceCentsOverride ?? field.priceCents;
    const nextField = { ...field, priceCents: nextPriceCents };
    const ownerWallet = requireWallet("deploy CDR");
    if (!ownerWallet) return;
    const fieldError = validateFieldDraftForCdr(nextField);
    if (fieldError) {
      updateField(kind, { statusMessage: fieldError });
      setNotice(fieldError);
      return;
    }
    if (field.cdrVaultUuid && field.cdrLicenseIpId && field.cdrLicenseTermsId) {
      setCdrDeployKind(null);
      setNotice(`${field.label} is already issued. Use Search ON/OFF.`);
      return;
    }

    setBusy(`deploy-${kind}`);
    updateField(kind, { cdrState: "deploying", priceCents: nextPriceCents, statusMessage: "Preparing CDR" });
    try {
      const savedProfile = await saveProfileOnly(ownerWallet);
      const savedField = await saveOneField(kind, savedProfile, { cdrState: "off", priceCents: nextPriceCents });
      updateField(kind, { statusMessage: "Opening deploy stream" });
      const response = await deployCdrWithServerWalletEvents({
        fieldId: savedField.id,
        onEvent: (event) => {
          if (event.type === "status") {
            updateField(kind, { statusMessage: event.message ?? event.status });
          }
        },
      });
      updateField(kind, { ...mergeSavedField(response.field), statusMessage: "Search on" });
      setCdrDeployKind(null);
      setNotice(`${field.label} issued and listed in search`);
    } catch (error) {
      updateField(kind, { cdrState: field.cdrState, statusMessage: parseApiError(error) });
      setNotice(parseApiError(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleCdr(kind: DataFieldKind) {
    const field = fields.find((item) => item.kind === kind);
    if (!field) return;
    const hasIssuedCdr = Boolean(field.cdrVaultUuid && field.cdrLicenseIpId && field.cdrLicenseTermsId);
    if (!hasIssuedCdr) {
      setCdrDeployKind(kind);
      return;
    }
    if (!field.id) {
      setNotice("Save field before changing search visibility");
      return;
    }

    const nextCdrState: CdrState = field.cdrState === "on" ? "off" : "on";
    setBusy(`toggle-${kind}`);
    try {
      const savedField = await toggleCdr({ fieldId: field.id, cdrState: nextCdrState });
      updateField(kind, { ...mergeSavedField(savedField.field), statusMessage: nextCdrState === "on" ? "Search on" : "Search off" });
      setNotice(nextCdrState === "on" ? `${field.label} is listed in search` : `${field.label} is hidden from search`);
    } catch (error) {
      setNotice(parseApiError(error));
    } finally {
      setBusy(null);
    }
  }

  async function runSearch() {
    const buyerWallet = requireWallet("search");
    if (!buyerWallet) return;
    setBusy("search");
    setQuote(null);
    setSelectedMatches([]);
    setSearchWorkflow({ prompt, progress: 7, stageIndex: 0 });

    let workflowProgress = 7;
    let workflowStageIndex = 0;
    const workflowTimer = window.setInterval(() => {
      workflowProgress = Math.min(workflowProgress + 9, 91);
      if (workflowProgress >= 28) workflowStageIndex = 1;
      if (workflowProgress >= 52) workflowStageIndex = 2;
      if (workflowProgress >= 76) workflowStageIndex = 3;
      setSearchWorkflow({ prompt, progress: workflowProgress, stageIndex: workflowStageIndex });
    }, 340);

    try {
      const response = await getQuote({ prompt, buyerWallet });
      window.clearInterval(workflowTimer);
      setSearchWorkflow({ prompt, progress: 96, stageIndex: searchWorkflowStages.length - 1 });
      await wait(180);
      setSearchWorkflow({ prompt, progress: 100, stageIndex: searchWorkflowStages.length - 1 });
      await wait(180);
      setQuote(response);
      setSelectedFields(response.recommendedFields);
      setSelectedMatches(response.matches.map((match) => match.matchRef));
      setNotice(`${response.matchedProfileCount} anonymous cards found`);
      void refreshHistory(buyerWallet);
    } catch (error) {
      window.clearInterval(workflowTimer);
      setNotice(parseApiError(error));
    } finally {
      setSearchWorkflow(null);
      setBusy(null);
    }
  }

  async function handleCreateOrder() {
    if (!quote) return;
    const buyerWallet = requireEmbeddedWallet("create batch access");
    if (!buyerWallet) return;
    if (!selectedLicenseFields.length) {
      setNotice("No paid CDR fields selected");
      return;
    }
    setBusy("order");
    try {
      const walletConnection = await getEmbeddedWalletConnection();
      const { mintStoryLicenseToken } = await import("../lib/web3/license");
      const licenseTokenGrants = [];
      for (const field of selectedLicenseFields) {
        if (
          !isAddress(field.cdrLicenseIpId) ||
          !isUintString(field.cdrLicenseTermsId) ||
          !isAddress(field.ipaNftContract) ||
          !isUintString(field.ipaTokenId) ||
          !isTxHash(field.licenseConfigTxHash)
        ) {
          throw new Error("field_license_config_missing");
        }
        setNotice(`Minting ${field.label} license`);
        licenseTokenGrants.push(
          await mintStoryLicenseToken(walletConnection, {
            fieldId: field.fieldId,
            licensorIpId: field.cdrLicenseIpId,
            licenseTermsId: field.cdrLicenseTermsId,
            receiver: buyerWallet as `0x${string}`,
          }),
        );
      }
      const response = await createOrder({
        quoteId: quote.quoteId,
        buyerWallet,
        prompt,
        wantedFields: selectedFields,
        selectedMatchRefs: selectedMatches,
        licenseTokenGrants,
        paymentTxHash: licenseTokenGrants[0]?.mintTxHash,
      });
      setNotice(`Batch request ${response.order.id} created`);
      await refreshHistory(buyerWallet);
      setActiveTab("requests");
    } catch (error) {
      setNotice(parseApiError(error));
    } finally {
      setBusy(null);
    }
  }

  async function refreshHistory(wallet: string | undefined = connectedWallet) {
    if (!wallet) {
      setSearchRequests([]);
      setSearchRequestDetail(null);
      setDetailSelectedFieldIds([]);
      setDetailMorePrompt("");
      setOrders([]);
      setSales([]);
      return;
    }
    try {
      const [requestResponse, orderResponse, salesResponse] = await Promise.all([listSearchRequests(wallet), listOrders(wallet), listSales(wallet)]);
      setSearchRequests(requestResponse.requests);
      setOrders(orderResponse.orders);
      setSales(salesResponse.sales);
    } catch {
      setSearchRequests([]);
      setOrders([]);
      setSales([]);
    }
  }

  function requestFieldIds(request: SearchRequestDetail) {
    return getRequestFieldCosts(request).map((fieldCost) => fieldCost.fieldId);
  }

  function closeSearchRequestDetail() {
    setSearchRequestDetail(null);
    setDetailSelectedFieldIds([]);
    setDetailMorePrompt("");
  }

  function toggleDetailField(fieldId: string) {
    setDetailSelectedFieldIds((current) => (current.includes(fieldId) ? current.filter((id) => id !== fieldId) : [...current, fieldId]));
  }

  function toggleDetailMatch(match: QuoteMatch) {
    const matchFieldIds = match.fieldCosts.map((fieldCost) => fieldCost.fieldId);
    const matchFieldSet = new Set(matchFieldIds);
    setDetailSelectedFieldIds((current) => {
      const allSelected = matchFieldIds.every((fieldId) => current.includes(fieldId));
      if (allSelected) return current.filter((fieldId) => !matchFieldSet.has(fieldId));
      return Array.from(new Set([...current, ...matchFieldIds]));
    });
  }

  async function openSearchRequestDetail(request: SearchRequestSummary) {
    setBusy(`request-${request.id}`);
    try {
      const response = await getSearchRequest(request.id);
      setSearchRequestDetail(response.request);
      setDetailSelectedFieldIds(requestFieldIds(response.request));
      setDetailMorePrompt("");
    } catch (error) {
      setNotice(parseApiError(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleExtendSearchRequest() {
    if (!searchRequestDetail) return;
    const nextPrompt = detailMorePrompt.trim();
    if (!nextPrompt) {
      setNotice("Enter a search prompt");
      return;
    }
    setBusy(`request-extend-${searchRequestDetail.id}`);
    try {
      const previousFieldIds = new Set(requestFieldIds(searchRequestDetail));
      const response = await extendSearchRequest(searchRequestDetail.id, { prompt: nextPrompt });
      const nextFieldIds = requestFieldIds(response.request);
      const nextAllowed = new Set(nextFieldIds);
      const addedFieldIds = nextFieldIds.filter((fieldId) => !previousFieldIds.has(fieldId));
      setSearchRequestDetail(response.request);
      setDetailSelectedFieldIds((current) => Array.from(new Set([...current.filter((fieldId) => nextAllowed.has(fieldId)), ...addedFieldIds])));
      setDetailMorePrompt("");
      setNotice(addedFieldIds.length ? `${addedFieldIds.length} fields added` : "No new cards found");
      void refreshHistory(response.request.buyerWallet);
    } catch (error) {
      setNotice(parseApiError(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleCheckoutSearchRequestDetail() {
    if (!searchRequestDetail) return;
    const buyerWallet = requireEmbeddedWallet("checkout request");
    if (!buyerWallet) return;
    const selectedFieldIdSet = new Set(detailSelectedFieldIds);
    const selectedFieldCosts = getRequestFieldCosts(searchRequestDetail).filter((fieldCost) => selectedFieldIdSet.has(fieldCost.fieldId));
    if (!selectedFieldCosts.length) {
      setNotice("Select at least one field");
      return;
    }
    setBusy(`request-checkout-${searchRequestDetail.id}`);
    try {
      const walletConnection = await getEmbeddedWalletConnection();
      const { mintStoryLicenseToken } = await import("../lib/web3/license");
      const licenseTokenGrants = [];
      for (const field of selectedFieldCosts) {
        if (
          !isAddress(field.cdrLicenseIpId) ||
          !isUintString(field.cdrLicenseTermsId) ||
          !isAddress(field.ipaNftContract) ||
          !isUintString(field.ipaTokenId) ||
          !isTxHash(field.licenseConfigTxHash)
        ) {
          throw new Error("field_license_config_missing");
        }
        setNotice(`Minting ${field.label} license`);
        licenseTokenGrants.push(
          await mintStoryLicenseToken(walletConnection, {
            fieldId: field.fieldId,
            licensorIpId: field.cdrLicenseIpId,
            licenseTermsId: field.cdrLicenseTermsId,
            receiver: buyerWallet as `0x${string}`,
          }),
        );
      }
      const wantedFields = searchRequestDetail.wantedFields?.length ? searchRequestDetail.wantedFields : searchRequestDetail.recommendedFields;
      const response = await createOrder({
        quoteId: searchRequestDetail.id,
        buyerWallet,
        prompt: searchRequestDetail.prompt,
        wantedFields,
        selectedFieldIds: selectedFieldCosts.map((fieldCost) => fieldCost.fieldId),
        licenseTokenGrants,
        paymentTxHash: licenseTokenGrants[0]?.mintTxHash,
      });
      const detailResponse = await getSearchRequest(searchRequestDetail.id);
      setSearchRequestDetail(detailResponse.request);
      const availableFieldIds = new Set(requestFieldIds(detailResponse.request));
      setDetailSelectedFieldIds((current) => current.filter((fieldId) => availableFieldIds.has(fieldId)));
      setNotice(`Checkout ${response.order.id} created`);
      await refreshHistory(buyerWallet);
    } catch (error) {
      setNotice(parseApiError(error));
    } finally {
      setBusy(null);
    }
  }

  async function reuseSearchRequest(request: SearchRequestSummary) {
    const buyerWallet = requireWallet("reuse search");
    if (!buyerWallet) return;
    setPrompt(request.prompt);
    setSelectedFields(request.wantedFields?.length ? request.wantedFields : request.recommendedFields);
    setActiveTab("search");
    setBusy("search");
    try {
      const response = await getQuote({ prompt: request.prompt, wantedFields: request.wantedFields ?? request.recommendedFields, buyerWallet });
      setQuote(response);
      setSelectedMatches(response.matches.map((match) => match.matchRef));
      setNotice("Search request reused");
      void refreshHistory(buyerWallet);
    } catch (error) {
      setNotice(parseApiError(error));
    } finally {
      setBusy(null);
    }
  }

  async function reuseOrder(order: OrderSummary) {
    setPrompt(order.sheetParams.prompt);
    setSelectedFields(order.sheetParams.fields);
    setActiveTab("search");
    setBusy("search");
    try {
      const response = await getQuote({ prompt: order.sheetParams.prompt });
      setQuote(response);
      setSelectedMatches(response.matches.map((match) => match.matchRef));
      setNotice("Template reused");
    } catch (error) {
      setNotice(parseApiError(error));
    } finally {
      setBusy(null);
    }
  }

  async function exportOrder(order: OrderSummary, format: "csv" | "xlsx") {
    if (!requireEmbeddedWallet("export CDR")) return;
    setBusy(`export-${order.id}`);
    try {
      const plan = await getExportPlan(order.id);
      const walletConnection = await getEmbeddedWalletConnection();
      const result = await buildRowsFromExportPlan(plan, walletConnection);
      if (format === "csv") downloadCsv(`${order.id}.csv`, result.rows);
      else downloadXlsx(`${order.id}.xlsx`, result.rows);
      await saveExportLog(order.id, {
        generatedAt: new Date().toISOString(),
        successfulFieldIds: result.successfulFieldIds,
        failedFieldIds: result.failedFieldIds,
        format,
      });
      setNotice(`${format.toUpperCase()} export ready`);
    } catch (error) {
      setNotice(parseApiError(error));
    } finally {
      setBusy(null);
    }
  }

  async function claimRoyalty(sale: SaleSummary) {
    if (!isAddress(sale.cdrLicenseIpId)) {
      setNotice("Field IP is missing for royalty claim");
      return;
    }
    if (!requireEmbeddedWallet("claim royalties")) return;
    setBusy(`claim-${sale.id}`);
    try {
      const walletConnection = await getEmbeddedWalletConnection();
      const { claimFieldRoyalty } = await import("../lib/web3/royalty");
      const result = await claimFieldRoyalty(walletConnection, {
        ipId: sale.cdrLicenseIpId,
      });
      setNotice(result.txHashes.length ? `Royalty claim submitted: ${compactAddress(result.txHashes[0])}` : "No royalty claim transaction returned");
      await refreshHistory();
    } catch (error) {
      setNotice(parseApiError(error));
    } finally {
      setBusy(null);
    }
  }

  function toggleSelectedField(kind: DataFieldKind) {
    setSelectedFields((current) => (current.includes(kind) ? current.filter((field) => field !== kind) : [...current, kind]));
  }

  function toggleMatch(matchRef: string) {
    setSelectedMatches((current) => (current.includes(matchRef) ? current.filter((match) => match !== matchRef) : [...current, matchRef]));
  }

  async function openPublicCard() {
    setBusy("card");
    try {
      const savedProfile = await saveProfileOnly(connectedWallet);
      window.location.href = `/c/${savedProfile.publicSlug}`;
    } catch (error) {
      setNotice(parseApiError(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleProfileLogout() {
    setBusy("logout");
    try {
      await logout();
      clearAppAuthSession();
      setAppAuthReady(false);
      setProfileMenuOpen(false);
      setNotice("Signed out of Privy");
    } catch (error) {
      setNotice(parseApiError(error));
    } finally {
      setBusy(null);
    }
  }

  function renderWalletSummary() {
    const embeddedWallet = connectedWallet;
    const hasWallet = Boolean(embeddedWallet);

    return (
      <div className={hasWallet ? "data-wallet-lock connected" : "data-wallet-lock"}>
        <div className="data-wallet-copy">
          {hasWallet ? (
            <div className="wallet-copy-item">
              <div className="wallet-label-row">
                <span>Embedded wallet</span>
                <span className="wallet-help" aria-label="Privy embedded wallet" role="img" tabIndex={0}>
                  ?
                  <span className="wallet-tooltip">Receives the field IPA. Server wallet deploys CDR; this wallet signs buyer access and royalty claims.</span>
                </span>
              </div>
              <div className="wallet-value-row">
                <button className="wallet-copy-button" type="button" aria-label="Copy embedded wallet" onClick={() => void handleCopyWallet(embeddedWallet ?? "", "Embedded wallet")}>
                  <Copy size={14} />
                </button>
                <p className="wallet-address-text">{embeddedWallet}</p>
              </div>
            </div>
          ) : (
            <>
              <span>Embedded wallet required</span>
              <p>Basic data works now. IPA ownership, paid access, export, and royalty claims use your Privy embedded wallet.</p>
            </>
          )}
        </div>
        {!hasWallet ? (
          <button type="button" onClick={() => void handleConnectWallet()}>
            Check wallet
          </button>
        ) : null}
      </div>
    );
  }

  const cdrDeployField = cdrDeployKind ? fields.find((field) => field.kind === cdrDeployKind) ?? null : null;

  return (
    <main className="axios-app">
      <div className="mobile-shell">
        <header className="app-topbar">
          <Logo />
          <div className="topbar-actions">
            <button className="save-button" type="button" onClick={handleSaveAll} disabled={busy === "save"}>
              {busy === "save" ? (
                <>
                  <span className="button-spinner" aria-hidden="true" />
                  SAVING
                </>
              ) : (
                "SAVE"
              )}
            </button>
            <button className="card-button" type="button" aria-label="Open public card" onClick={() => void openPublicCard()} disabled={busy === "card"}>
              <IconAsset name="cardDots" size={24} />
            </button>
            <div className="profile-menu-wrap" ref={profileMenuRef}>
              <button
                className="card-button profile-button"
                type="button"
                aria-label="Show Privy account"
                aria-controls="privy-account-popover"
                aria-expanded={profileMenuOpen}
                onClick={() => setProfileMenuOpen((open) => !open)}
              >
                <IconAsset name="profile" size={18} />
              </button>
              {profileMenuOpen ? (
                <div className="profile-account-popover" id="privy-account-popover" role="status">
                  <span className="profile-account-title">Privy current login</span>
                  {profileAccountRows.map((row) => (
                    <div className="profile-account-row" key={row.label}>
                      <div className="profile-account-row-copy">
                        <span>{row.label}</span>
                        <strong title={row.value}>{row.value}</strong>
                      </div>
                      {row.label.toLowerCase().includes("wallet") ? (
                        <button
                          className="profile-account-copy-button"
                          type="button"
                          aria-label={`Copy ${row.label.toLowerCase()}`}
                          onClick={() => void handleCopyWallet(row.value, row.label)}
                        >
                          <Copy size={13} />
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {authenticated ? (
                    <button className="profile-account-logout" type="button" onClick={() => void handleProfileLogout()} disabled={busy === "logout"}>
                      {busy === "logout" ? "Logging out..." : "Log out"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <section className="app-content" aria-live="polite" ref={appContentRef}>
          {activeTab === "search" && renderSearch()}
          {activeTab === "myData" && renderMyData()}
          {activeTab === "requests" && renderRequests()}
          {activeTab === "sales" && renderSales()}
          {activeTab === "settings" && renderSettings()}
        </section>

        {authError && !appAuthReady ? (
          <div className="app-notice app-notice-error" role="alert">
            <strong>Sign-in failed</strong>
            <span>{authError}</span>
            <button type="button" onClick={() => setAuthAttempt((attempt) => attempt + 1)}>
              재시도
            </button>
          </div>
        ) : null}

        {notice ? (
          <div className="app-notice" role="status">
            <button className="app-notice-close" type="button" onClick={() => setNotice("")} aria-label="Dismiss notice">
              ×
            </button>
            {notice === freeDataTip ? <strong>TIP</strong> : null}
            <span>{notice}</span>
          </div>
        ) : null}

        <nav className="bottom-nav" aria-label="Primary">
          {navItems.map((item) => {
            return (
              <button
                className={activeTab === item.key ? "nav-button active" : "nav-button"}
                key={item.key}
                type="button"
                onClick={() => handleNavClick(item.key, item.label)}
                aria-label={item.label}
              >
                <IconAsset name={item.icon} size={24} />
              </button>
            );
          })}
        </nav>

        <ConfirmModal
          open={!!confirmDialog}
          title={confirmDialog?.title ?? ""}
          body={confirmDialog?.body ?? ""}
          confirmLabel={confirmDialog?.confirmLabel ?? "Confirm"}
          tone={confirmDialog?.tone}
          onClose={() => setConfirmDialog(null)}
          onConfirm={() => {
            confirmDialog?.onConfirm();
            setConfirmDialog(null);
          }}
        />
        <CdrDeployModal
          busy={cdrDeployKind ? busy === `deploy-${cdrDeployKind}` : false}
          field={cdrDeployField}
          open={Boolean(cdrDeployField)}
          onClose={() => setCdrDeployKind(null)}
          onConfirm={(priceCents) => {
            if (!cdrDeployKind) return;
            void handleDeploy(cdrDeployKind, priceCents);
          }}
        />
      </div>
    </main>
  );

  function renderSearch() {
    const showSearchResults = Boolean(quote);
    const showSearchWorkflow = Boolean(searchWorkflow);
    const workflowOnly = showSearchWorkflow && !showSearchResults;
    const allMatchesSelected = quote ? selectedMatches.length === quote.matches.length : false;
    const searchBox = (
      <div className="search-box">
        <Search size={20} />
        <input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="29-32세에 서울에 거주하는 IT 직장인" />
        <button type="button" onClick={runSearch} disabled={busy === "search"}>
          Search
        </button>
      </div>
    );

    return (
      <div className={showSearchResults || showSearchWorkflow ? "search-screen has-results" : "search-screen"}>
        {showSearchResults || showSearchWorkflow ? (
          <div className={workflowOnly ? "result-layout workflow-only" : "result-layout"}>
            <div className={workflowOnly ? "result-main workflow-only" : "result-main"}>
              <div className="search-results-head">
                <h1>Find paid personal data access</h1>
              </div>
              {searchBox}

              {showSearchWorkflow && searchWorkflow ? (
                <section className="search-workflow" aria-label="Search workprocess">
                  <div className="workflow-head">
                    <strong>Search workprocess</strong>
                    <span>{searchWorkflow.progress}%</span>
                  </div>
                  <div className="workflow-bar" aria-hidden="true">
                    <i style={{ width: `${searchWorkflow.progress}%` }} />
                  </div>
                  <div className="workflow-copy">
                    <p>{searchWorkflow.prompt}</p>
                  </div>
                  <div className="workflow-stages">
                    {searchWorkflowStages.map((stage, index) => (
                      <div
                        className={
                          index === searchWorkflow.stageIndex
                            ? "workflow-stage active"
                            : index < searchWorkflow.stageIndex
                              ? "workflow-stage done"
                              : "workflow-stage"
                        }
                        key={stage.title}
                      >
                        <span>{index + 1}</span>
                        <div>
                          <strong>{stage.title}</strong>
                          <small>{stage.detail}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {quote ? (
                <div className="match-list">
                  <div className="list-header">
                    <strong>{quote.matchedProfileCount} anonymous cards</strong>
                    <button
                      type="button"
                      onClick={() => setSelectedMatches(allMatchesSelected ? [] : quote.matches.map((match) => match.matchRef))}
                    >
                      {allMatchesSelected ? "Clear" : "All"}
                    </button>
                  </div>
                  {quote.matches.length ? (
                    <div className="match-table-wrap">
                      <table className="match-table">
                        <thead>
                          <tr>
                            <th>
                              <input
                                aria-label="Select all results"
                                checked={allMatchesSelected}
                                type="checkbox"
                                onChange={() => setSelectedMatches(allMatchesSelected ? [] : quote.matches.map((match) => match.matchRef))}
                              />
                            </th>
                            <th>Ref</th>
                            <th>Public fit</th>
                            <th>Free</th>
                            <th>Paid</th>
                            <th>Estimate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {quote.matches.map((match) => {
                            const isSelected = selectedMatches.includes(match.matchRef);
                            return (
                              <tr className={isSelected ? "selected" : ""} key={match.matchRef} onClick={() => toggleMatch(match.matchRef)}>
                                <td>
                                  <input
                                    aria-label={`Select ${match.matchRef}`}
                                    checked={isSelected}
                                    type="checkbox"
                                    onChange={() => toggleMatch(match.matchRef)}
                                    onClick={(event) => event.stopPropagation()}
                                  />
                                </td>
                                <td>
                                  <strong>{match.matchRef}</strong>
                                </td>
                                <td>{match.signals.join(" · ")}</td>
                                <td>{match.freeFieldCount}</td>
                                <td>{match.paidFieldCount}</td>
                                <td>{formatIpAmount(calculateMatchSubtotal(match, selectedFieldSet))}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyState icon={<Search size={24} />} title="No matching cards yet" />
                  )}
                </div>
              ) : null}
            </div>

            {quote ? (
              <aside className="checkout-rail">
                <strong>Checkout</strong>
                <small>Choose paid data parameters after the anonymous list is prepared.</small>
                <div className="checkout-field-checks" aria-label="Data parameters">
                  {paidFieldDefs.map((field) => (
                    <label key={field.kind}>
                      <input
                        checked={selectedFields.includes(field.kind)}
                        type="checkbox"
                        onChange={() => toggleSelectedField(field.kind)}
                      />
                      <span className="checkout-field-slot">{field.level}</span>
                      <span className="checkout-field-label">{field.label}</span>
                      <strong className="checkout-field-total">{formatIpAmount(selectedFieldTotals[field.kind] ?? 0)}</strong>
                    </label>
                  ))}
                </div>
                <dl>
                  <div>
                    <dt>Selected</dt>
                    <dd>{selectedMatches.length}</dd>
                  </div>
                  <div>
                    <dt>Total</dt>
                    <dd>{formatIpAmount(selectedTotal)}</dd>
                  </div>
                  <div>
                    <dt>Platform royalty</dt>
                    <dd>10% on-chain</dd>
                  </div>
                </dl>
                <button type="button" onClick={handleCreateOrder} disabled={!selectedMatches.length || !selectedFields.length || !appAuthReady || busy === "order"}>
                  <IconAsset name="ip" size={18} />
                  Batch payment
                </button>
                <p>{quote.prePurchaseNotice}</p>
              </aside>
            ) : null}
          </div>
        ) : (
          <div className="search-center">
            <h1>Find paid personal data access</h1>
            {searchBox}
          </div>
        )}
      </div>
    );
  }

  function renderMyData() {
    const canEditData = appAuthReady;
    const canVerifyData = appAuthReady;
    const canRunCdrAction = Boolean(appAuthReady && connectedWallet);
    const showBasicInfo = activeMyDataFilter === "basic";
    const showLv1Info = activeMyDataFilter === "lv1";
    const showLv2Info = activeMyDataFilter === "lv2";
    const visibleDataFields = fields.filter((field) => fieldLevelByKind.get(field.kind) === (showLv1Info ? "LV1" : "LV2"));
    const profileRows: PublicProfileRow[] = [
      { key: "name", label: "Name", required: true, value: profile.publicFields.name },
      { key: "gender", label: "Gender", control: "radio", options: genderOptions, required: true, value: profile.publicFields.gender },
      { key: "age", label: "Age", required: true, type: "number", min: 1, max: 120, value: profile.publicFields.age ? String(profile.publicFields.age) : "" },
      { key: "country", label: "Country", control: "select", options: countryOptionsForValue(profile.publicFields.country), value: profile.publicFields.country },
      { key: "locale", label: "Locale", value: profile.publicFields.locale },
    ];
    const educationItems = legacyEducationItems(profile.publicFields);
    const careerItems = legacyCareerItems(profile.publicFields);
    const renderPublicProfileRow = (row: PublicProfileRow) => (
      <DataInputRow
        key={row.key}
        disabled={!canEditData}
        control={row.control}
        label={row.label}
        min={row.min}
        max={row.max}
        options={row.options}
        required={row.required}
        type={row.type}
        value={row.value}
        onChange={(value) => {
          if (row.key === "age") {
            updateProfileField("age", Number(value));
            return;
          }
          if (row.key === "careerWorkYears") {
            updateProfileField("careerWorkYears", Number(value));
            return;
          }
          updateProfileField(row.key, value);
        }}
      />
    );

    return (
      <div className="my-data-screen">
        <section className="data-modal-frame" aria-label="My data profile and CDR fields">
          <div className="data-modal-list">
            <div className="my-data-sticky-top">
              <div className="avatar-editor">
                <div className="avatar-frame">{profile.avatarUrl ? <img alt="" src={profile.avatarUrl} /> : <IconAsset name="profile" size={72} className="avatar-placeholder-icon" />}</div>
                <button type="button" aria-label="Add avatar" onClick={handleAvatarClick} disabled={busy === "avatar"}>
                  <Plus size={24} />
                </button>
                <input
                  ref={avatarInputRef}
                  accept="image/gif,image/jpeg,image/png,image/webp"
                  type="file"
                  onChange={(event) => {
                    void handleAvatarSelected(event.currentTarget.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </div>

              <div className="data-type-filter" role="tablist" aria-label="My data categories">
                <button
                  className={showBasicInfo ? "data-type-button active" : "data-type-button"}
                  type="button"
                  role="tab"
                  aria-selected={showBasicInfo}
                  onClick={() => setActiveMyDataFilter("basic")}
                >
                  Basic Data
                </button>
                <button
                  className={showLv1Info ? "data-type-button active" : "data-type-button"}
                  type="button"
                  role="tab"
                  aria-selected={showLv1Info}
                  onClick={() => setActiveMyDataFilter("lv1")}
                >
                  LV1 Data
                </button>
                <button
                  className={showLv2Info ? "data-type-button active" : "data-type-button"}
                  type="button"
                  role="tab"
                  aria-selected={showLv2Info}
                  onClick={() => setActiveMyDataFilter("lv2")}
                >
                  LV2 Data
                </button>
              </div>
            </div>

            {showBasicInfo ? (
              <>
                {profileRows.map(renderPublicProfileRow)}
                <DataInputGroup title="Education" onAdd={addEducationItem}>
                  {educationItems.map((item, index) => (
                    <div
                      className={[
                        "data-history-card",
                        draggingHistory?.section === "education" && draggingHistory.id === item.id ? "dragging" : "",
                        dragOverHistory?.section === "education" && dragOverHistory.id === item.id ? "drag-over" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      key={item.id}
                      onDragOver={(event) => handleHistoryDragOver("education", item.id, event)}
                      onDrop={(event) => handleHistoryDrop("education", item.id, event)}
                    >
                      {educationItems.length > 1 ? (
                        <div className="data-history-card-head">
                          <button
                            className="data-history-drag-button"
                            type="button"
                            aria-label={`Reorder education ${index + 1}`}
                            draggable
                            onDragStart={(event) => handleHistoryDragStart("education", item.id, event)}
                            onDragEnd={handleHistoryDragEnd}
                          >
                            <GripVertical size={18} />
                          </button>
                          <button type="button" aria-label={`Remove education ${index + 1}`} onClick={() => removeEducationItem(item.id)}>
                            ×
                          </button>
                        </div>
                      ) : null}
                      <div className="data-input-group-grid education-grid">
                        <DataInputRow
                          disabled={!canEditData}
                          label="Education"
                          value={item.education}
                          onChange={(value) => updateEducationItem(item.id, { education: value })}
                        />
                        <DataInputRow
                          control="select"
                          disabled={!canEditData}
                          label="Education status"
                          options={educationStatusOptions}
                          value={item.status}
                          onChange={(value) => updateEducationItem(item.id, { status: value })}
                        />
                      </div>
                    </div>
                  ))}
                </DataInputGroup>
                <DataInputGroup title="Career" onAdd={addCareerItem}>
                  {careerItems.map((item, index) => (
                    <div
                      className={[
                        "data-history-card",
                        draggingHistory?.section === "career" && draggingHistory.id === item.id ? "dragging" : "",
                        dragOverHistory?.section === "career" && dragOverHistory.id === item.id ? "drag-over" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      key={item.id}
                      onDragOver={(event) => handleHistoryDragOver("career", item.id, event)}
                      onDrop={(event) => handleHistoryDrop("career", item.id, event)}
                    >
                      {careerItems.length > 1 ? (
                        <div className="data-history-card-head">
                          <button
                            className="data-history-drag-button"
                            type="button"
                            aria-label={`Reorder career ${index + 1}`}
                            draggable
                            onDragStart={(event) => handleHistoryDragStart("career", item.id, event)}
                            onDragEnd={handleHistoryDragEnd}
                          >
                            <GripVertical size={18} />
                          </button>
                          <button type="button" aria-label={`Remove career ${index + 1}`} onClick={() => removeCareerItem(item.id)}>
                            ×
                          </button>
                        </div>
                      ) : null}
                      <div className="data-input-group-grid career-grid">
                        <DataInputRow
                          disabled={!canEditData}
                          label="Career"
                          value={item.career}
                          onChange={(value) => updateCareerItem(item.id, { career: value })}
                        />
                        <DataInputRow
                          disabled={!canEditData}
                          label="Position"
                          value={profile.publicFields.occupation}
                          onChange={(value) => updateProfileField("occupation", value)}
                        />
                        <DataInputRow
                          disabled={!canEditData}
                          label="Career start"
                          type="month"
                          value={item.startDate}
                          onChange={(value) => updateCareerItem(item.id, { startDate: value })}
                        />
                        <DataInputRow
                          control="select"
                          disabled={!canEditData}
                          label="Career status"
                          options={careerStatusOptions}
                          value={item.status}
                          onChange={(value) =>
                            updateCareerItem(item.id, {
                              status: value,
                              endDate: value === "employed" ? "" : item.endDate,
                            })
                          }
                        />
                        {item.status === "employed" ? null : (
                          <DataInputRow
                            disabled={!canEditData}
                            label="Career end"
                            type="month"
                            value={item.endDate}
                            onChange={(value) => updateCareerItem(item.id, { endDate: value })}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </DataInputGroup>
              </>
            ) : null}

            {showLv1Info || showLv2Info
              ? visibleDataFields.map((field) => {
                  const needsVerification = field.requiresVerification && field.verificationStatus !== "verified";
                  const isTimer = needsVerification && Boolean(field.verificationId);
                  const issuedMark = <IssuedFieldMark ipId={field.cdrLicenseIpId} onCopy={() => setNotice("IPA copied")} onCopyError={() => setNotice("Copy failed")} />;
                  const verifiedStatus =
                    field.verificationStatus === "verified" ? (
                      <span className="verified">
                        <IconAsset name="verification" size={14} />
                        Verified
                      </span>
                    ) : (
                      <span className="needs-verification">Need Verification</span>
                    );
                  const fieldStatus = (
                    <>
                      {field.requiresVerification ? verifiedStatus : null}
                      {issuedMark}
                    </>
                  );

                  return (
                    <div className="data-field-block" key={field.kind}>
                      {field.kind === "mobile" ? (
                        <PhoneInputRow
                          disabled={!canEditData}
                          label={field.label}
                          value={field.valuePreview}
                          status={fieldStatus}
	                          onChange={(value) => updateField(field.kind, { valuePreview: value })}
	                          onEnter={() => {
	                            if (needsVerification && canVerifyData && !isTimer && busy !== `verify-${field.kind}`) {
	                              void handleSendCode(field.kind as "email" | "mobile");
	                            }
	                          }}
	                          action={
	                            needsVerification ? (
	                              <button
	                                className={isTimer ? "data-timer-button" : "data-send-button"}
	                                type="button"
	                                onClick={() => handleSendCode(field.kind as "email" | "mobile")}
	                                disabled={!canVerifyData || busy === `verify-${field.kind}` || isTimer}
	                              >
	                                {isTimer ? "60s" : "Send"}
	                              </button>
	                            ) : (
	                              <CdrAction
	                                busy={busy === `deploy-${field.kind}`}
	                                disabled={!canRunCdrAction}
	                                field={field}
	                                onClick={() => handleToggleCdr(field.kind)}
	                              />
	                            )
	                          }
	                        />
	                      ) : (
                        <DataInputRow
                          disabled={!canEditData || (field.kind === "email" && Boolean(privyAccountEmail))}
                          label={field.label}
                          value={field.valuePreview}
                          visualPrefix={socialHandleFieldKinds.has(field.kind) ? "@" : undefined}
                          status={fieldStatus}
                          onChange={(value) => updateField(field.kind, { valuePreview: value })}
                          action={
                            needsVerification ? (
                              <button
                                className={isTimer ? "data-timer-button" : "data-send-button"}
                                type="button"
                                onClick={() => handleSendCode(field.kind as "email" | "mobile")}
                                disabled={!canVerifyData || busy === `verify-${field.kind}` || isTimer}
                              >
                                {isTimer ? "60s" : "Send"}
                              </button>
                            ) : (
                              <CdrAction
                                busy={busy === `deploy-${field.kind}`}
                                disabled={!canRunCdrAction}
                                field={field}
                                onClick={() => handleToggleCdr(field.kind)}
                              />
                            )
	                          }
	                        />
	                      )}

	                      {needsVerification && field.verificationId ? (
                        <DataInputRow
                          disabled={!canEditData}
                          label="Verification code"
                          value={field.code}
                          inputMode="numeric"
                          placeholder="Code"
                          onChange={(value) => updateField(field.kind, { code: value })}
                          action={
                            <button
                              className="data-confirm-button"
                              type="button"
                              onClick={() => handleConfirmCode(field.kind as "email" | "mobile")}
                              disabled={!canVerifyData || busy === `confirm-${field.kind}`}
                            >
                              Confirm
                            </button>
                          }
                        />
                      ) : null}

                    </div>
                  );
                })
              : null}
          </div>
        </section>
      </div>
    );
  }

  function renderRequests() {
    if (searchRequestDetail) {
      const detailFields = searchRequestDetail.wantedFields ?? searchRequestDetail.recommendedFields;
      const detailFieldCosts = getRequestFieldCosts(searchRequestDetail);
      const detailFieldIds = detailFieldCosts.map((fieldCost) => fieldCost.fieldId);
      const detailSelectedFieldSet = new Set(detailSelectedFieldIds);
      const detailSelectedFieldCosts = detailFieldCosts.filter((fieldCost) => detailSelectedFieldSet.has(fieldCost.fieldId));
      const detailAllFieldsSelected = detailFieldCosts.length > 0 && detailSelectedFieldCosts.length === detailFieldCosts.length;
      const detailSelectedCards = countSelectedRequestCards(searchRequestDetail, detailSelectedFieldSet);
      const detailSelectedTotal = calculateFieldCostTotal(detailSelectedFieldCosts);
      const checkoutBusy = busy === `request-checkout-${searchRequestDetail.id}`;
      const extendBusy = busy === `request-extend-${searchRequestDetail.id}`;
      return (
        <div className="list-screen request-detail-screen">
          <div className="screen-title">
            <div className="screen-title-left">
              <button className="refresh-button" type="button" aria-label="Back to requests" onClick={closeSearchRequestDetail}>
                <ArrowLeft size={18} />
              </button>
              <h1>Request</h1>
            </div>
            <button type="button" onClick={() => void reuseSearchRequest(searchRequestDetail)} disabled={busy === "search"}>
              <RotateCcw size={15} />
              Reuse
            </button>
          </div>

          <div className="request-detail-layout">
            <div className="request-detail-main">
              <section className="request-detail-card" aria-label="Request detail">
                <strong>{searchRequestDetail.prompt}</strong>
                <div className="request-detail-meta">
                  <span>{searchRequestDetail.matchedProfileCount} cards</span>
                  <span>{detailFields.join(", ")}</span>
                  <span>{formatIpAmount(searchRequestDetail.totalCents)}</span>
                  <span>{searchRequestDetail.extensions?.length ?? 0} extensions</span>
                  <span>{searchRequestDetail.id}</span>
                </div>
              </section>

              <form
                className="request-extend-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleExtendSearchRequest();
                }}
              >
                <div>
                  <strong>Find more</strong>
                  <small>Append new matching cards to this request.</small>
                </div>
                <input
                  value={detailMorePrompt}
                  onChange={(event) => setDetailMorePrompt(event.target.value)}
                  placeholder="Add another search prompt"
                />
                <button type="submit" disabled={extendBusy || !appAuthReady}>
                  {extendBusy ? <span className="button-spinner" aria-hidden="true" /> : <Search size={16} />}
                  {extendBusy ? "Finding" : "Find more"}
                </button>
              </form>

              <section className="history-section" aria-label="Search results">
                <div className="request-section-head">
                  <h2>Search results</h2>
                  <button
                    type="button"
                    disabled={!detailFieldCosts.length}
                    onClick={() => setDetailSelectedFieldIds(detailAllFieldsSelected ? [] : detailFieldIds)}
                  >
                    {detailAllFieldsSelected ? "Clear" : "All"}
                  </button>
                </div>
                {searchRequestDetail.matches.length ? (
                  <div className="request-result-list">
                    {searchRequestDetail.matches.map((match) => {
                      const matchFieldIds = match.fieldCosts.map((fieldCost) => fieldCost.fieldId);
                      const matchAllSelected = matchFieldIds.length > 0 && matchFieldIds.every((fieldId) => detailSelectedFieldSet.has(fieldId));
                      const matchSelectedCount = matchFieldIds.filter((fieldId) => detailSelectedFieldSet.has(fieldId)).length;
                      return (
                        <article className="request-result-row" key={match.matchRef}>
                          <div className="request-result-head">
                            <label className="request-match-toggle">
                              <input
                                aria-label={`Select ${match.matchRef}`}
                                checked={matchAllSelected}
                                disabled={!match.fieldCosts.length}
                                type="checkbox"
                                onChange={() => toggleDetailMatch(match)}
                              />
                              <span>
                                <strong>{match.matchRef}</strong>
                                <small>{match.signals.length ? match.signals.join(" · ") : "Anonymous card"}</small>
                              </span>
                            </label>
                            <span className="request-result-count">
                              {matchSelectedCount}/{matchFieldIds.length}
                            </span>
                            <strong className="request-result-total">{formatIpAmount(calculateRequestMatchSubtotal(match))}</strong>
                          </div>
                          {match.fieldCosts.length ? (
                            <div className="request-field-options">
                              {match.fieldCosts.map((fieldCost) => {
                                const fieldSelected = detailSelectedFieldSet.has(fieldCost.fieldId);
                                return (
                                  <label className={fieldSelected ? "request-field-option selected" : "request-field-option"} key={fieldCost.fieldId}>
                                    <input
                                      aria-label={`Select ${fieldCost.label}`}
                                      checked={fieldSelected}
                                      type="checkbox"
                                      onChange={() => toggleDetailField(fieldCost.fieldId)}
                                    />
                                    <span className="checkout-field-slot">LV1</span>
                                    <span className="request-field-name">{fieldCost.label}</span>
                                    <strong>{formatIpAmount(fieldCost.priceCents)}</strong>
                                  </label>
                                );
                              })}
                            </div>
                          ) : (
                            <small className="request-result-empty">No requested CDR fields</small>
                          )}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState icon={<Search size={24} />} title="No saved search results" />
                )}
              </section>
            </div>

            <aside className="request-checkout-card" aria-label="Request checkout">
              <strong>Checkout</strong>
              <small>Only selected request fields will be minted and ordered.</small>
              <dl>
                <div>
                  <dt>Fields</dt>
                  <dd>{detailSelectedFieldCosts.length}</dd>
                </div>
                <div>
                  <dt>Cards</dt>
                  <dd>{detailSelectedCards}</dd>
                </div>
                <div>
                  <dt>Total</dt>
                  <dd>{formatIpAmount(detailSelectedTotal)}</dd>
                </div>
              </dl>
              <button type="button" onClick={handleCheckoutSearchRequestDetail} disabled={!detailSelectedFieldCosts.length || !appAuthReady || checkoutBusy}>
                {checkoutBusy ? <span className="button-spinner" aria-hidden="true" /> : <IconAsset name="ip" size={18} />}
                {checkoutBusy ? "Checking out" : "Checkout"}
              </button>
              <p>{searchRequestDetail.prePurchaseNotice}</p>
            </aside>
          </div>
        </div>
      );
    }

    return (
      <div className="list-screen">
        <div className="screen-title">
          <h1>Requests</h1>
          <button className="refresh-button" type="button" aria-label="Refresh requests" onClick={() => void refreshHistory()}>
            <RefreshCw size={18} />
          </button>
        </div>

        {searchRequests.length ? (
          <section className="history-section" aria-label="Search requests">
            <h2>Search requests</h2>
            {searchRequests.map((request) => (
              <article
                className="history-row history-row-clickable"
                key={request.id}
                role="button"
                tabIndex={0}
                onClick={() => void openSearchRequestDetail(request)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    void openSearchRequestDetail(request);
                  }
                }}
              >
                <div>
                  <strong>{request.prompt}</strong>
                  <small>
                    {request.matchedProfileCount} cards · {(request.wantedFields ?? request.recommendedFields).join(", ")} · {formatIpAmount(request.totalCents)}
                  </small>
                  <small>{request.id}</small>
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void reuseSearchRequest(request);
                    }}
                    disabled={busy === "search" || busy === `request-${request.id}`}
                  >
                    <RotateCcw size={15} />
                    {busy === `request-${request.id}` ? "Opening" : "Reuse"}
                  </button>
                </div>
              </article>
            ))}
          </section>
        ) : null}

        {orders.length ? (
          <section className="history-section" aria-label="Batch requests">
            <h2>Batch requests</h2>
            {orders.map((order) => (
              <article className="history-row" key={order.id}>
                <div>
                  <strong>{order.prompt}</strong>
                  <small>{order.sheetParams.fields.join(", ")} · {formatIpAmount(order.totalCents)}</small>
                  <small>{order.id}</small>
                </div>
                <div className="row-actions">
                  <button type="button" onClick={() => reuseOrder(order)}>
                    <RotateCcw size={15} />
                    Reuse
                  </button>
                  <button type="button" onClick={() => exportOrder(order, "csv")}>
                    <Download size={15} />
                    CSV
                  </button>
                  <button type="button" onClick={() => exportOrder(order, "xlsx")}>
                    <FileText size={15} />
                    XLSX
                  </button>
                </div>
              </article>
            ))}
          </section>
        ) : null}

        {!searchRequests.length && !orders.length ? (
          <EmptyState icon={<IconAsset name="collectbox" size={28} />} title="No requests yet" />
        ) : null}
      </div>
    );
  }

  function renderSales() {
    return (
      <div className="list-screen">
        <div className="screen-title">
          <h1>Sales History</h1>
          <button className="refresh-button" type="button" aria-label="Refresh sales history" onClick={() => void refreshHistory()}>
            <RefreshCw size={18} />
          </button>
        </div>
        {renderWalletSummary()}
        {sales.length ? (
          sales.map((sale) => (
            <article className="history-row" key={sale.id}>
              <div>
                <strong>{sale.label}</strong>
                <small>{sale.orderId} · buyer {compactAddress(sale.buyerWallet)}</small>
                <small>{sale.paymentTxHash ? compactAddress(sale.paymentTxHash) : "pending payment"}</small>
                <small>{sale.source === "onchain" ? `on-chain log · block ${sale.blockNumber ?? "-"}` : "server metadata"}</small>
              </div>
              <div className="history-actions">
                <em>{formatIpAmount(sale.sellerCents)}</em>
                <button
                  type="button"
                  onClick={() => void claimRoyalty(sale)}
                  disabled={!sale.cdrLicenseIpId || busy === `claim-${sale.id}`}
                >
                  {busy === `claim-${sale.id}` ? (
                    <span className="button-spinner" aria-hidden="true" />
                  ) : (
                    <Download size={15} />
                  )}
                  Claim
                </button>
              </div>
            </article>
          ))
        ) : (
          <EmptyState icon={<IconAsset name="ip" size={30} />} title="No on-chain sales logs yet" />
        )}
      </div>
    );
  }

  function renderSettings() {
    return (
      <div className="settings-screen">
        <div className="screen-title">
          <h1>Settings</h1>
        </div>
        <div className="settings-stack">
          <a className="settings-link" href="/privacy">
            <Lock size={18} />
            Privacy
          </a>
          <a className="settings-link" href="/terms">
            <FileText size={18} />
            Terms
          </a>
          <button
            type="button"
            onClick={() =>
              setConfirmDialog({
                title: "Logout",
                body: "This will clear the current email session from this device. Your public card and CDR metadata stay saved.",
                confirmLabel: "Logout",
                onConfirm: () => {
                  setNotice("Logged out locally");
                },
              })
            }
          >
            <LogOut size={18} />
            Logout
          </button>
          <button
            className="danger"
            type="button"
            onClick={() =>
              setConfirmDialog({
                title: "Delete account",
                body: "Hackathon MVP deletion is local-only for now. Production deletion needs a backend privacy workflow.",
                confirmLabel: "Delete",
                tone: "danger",
                onConfirm: () => setNotice("Delete account requested"),
              })
            }
          >
            <Trash2 size={18} />
            Delete account
          </button>
        </div>
      </div>
    );
  }
}

function IssuedFieldMark(props: { ipId?: string; onCopy?(): void; onCopyError?(): void }) {
  if (!props.ipId) return null;

  async function handleCopy(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!props.ipId) return;

    try {
      await navigator.clipboard.writeText(props.ipId);
      props.onCopy?.();
    } catch (error) {
      console.error("[IssuedFieldMark] Failed to copy IPA address", { error, ipId: props.ipId });
      props.onCopyError?.();
    }
  }

  return (
    <span className="issued-field-mark">
      <button className="issued-field-pill" type="button" aria-label={`Copy IPA ${props.ipId}`} onClick={handleCopy} onMouseDown={(event) => event.preventDefault()}>
        IP
        <Copy size={12} aria-hidden="true" />
      </button>
      <span className="issued-field-tooltip" role="tooltip">
        <span className="issued-field-tooltip-text">
          <strong>IPA</strong>
          <span>{props.ipId}</span>
        </span>
      </span>
    </span>
  );
}

function DataInputGroup(props: { title: string; children: ReactNode; onAdd?(): void }) {
  return (
    <section className="data-input-group" aria-label={props.title}>
      <div className="data-input-group-head">
        <h2>{props.title}</h2>
        {props.onAdd ? (
          <button type="button" aria-label={`Add ${props.title}`} onClick={props.onAdd}>
            <Plus size={16} />
          </button>
        ) : null}
      </div>
      <div className="data-input-group-grid">{props.children}</div>
    </section>
  );
}

function PhoneInputRow(props: {
  label: string;
  value: string;
  disabled?: boolean;
  status?: ReactNode;
  action?: ReactNode;
  onChange(value: string): void;
  onEnter?(): void;
}) {
  const { countryCode, nationalNumber } = splitPhoneValue(props.value);
  const selectedCountryCode = phoneCountryOptions.some((option) => option.value === countryCode) ? countryCode : "+82";

  function emit(nextCountryCode: string, nextNationalNumber: string) {
    props.onChange(`${nextCountryCode} ${nextNationalNumber}`.trim());
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && props.onEnter && !props.disabled) {
      event.preventDefault();
      props.onEnter();
    }
  }

  return (
    <div className={`${props.action ? "data-input-row has-action" : "data-input-row"}${props.disabled ? " disabled" : ""}`}>
      <label className="data-input-main">
        <span className="data-label-line">
          <span>{props.label}</span>
          {props.status}
        </span>
        <span className="phone-input-wrap">
          <select
            aria-label="Country code"
            disabled={props.disabled}
            value={selectedCountryCode}
            onChange={(event) => emit(event.target.value, nationalNumber)}
          >
            {phoneCountryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            disabled={props.disabled}
            inputMode="tel"
            type="tel"
            value={nationalNumber}
            onChange={(event) => emit(selectedCountryCode, event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </span>
      </label>
      {props.action ? <div className="data-action-cell">{props.action}</div> : null}
    </div>
  );
}

function CustomSelect(props: {
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  onChange(value: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);
  const options = props.options ?? [];
  const selectedIndex = options.findIndex((option) => option.value === props.value);
  const selectedLabel = selectedIndex >= 0 ? options[selectedIndex].label : "";

  useEffect(() => {
    if (!open) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (open) activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const choose = (value: string) => {
    props.onChange(value);
    setOpen(false);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (props.disabled) return;
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(options.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) choose(option.value);
    }
  };

  return (
    <div className={`data-select${open ? " open" : ""}`} ref={containerRef}>
      <button
        type="button"
        className="data-select-trigger"
        disabled={props.disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={props.ariaLabel}
        onClick={() => {
          if (!props.disabled) setOpen((value) => !value);
        }}
        onKeyDown={onKeyDown}
      >
        <span className={`data-select-value${selectedLabel ? "" : " placeholder"}`}>{selectedLabel || props.placeholder || "Select"}</span>
        <ChevronDown aria-hidden="true" size={22} />
      </button>
      {open ? (
        <ul className="data-select-menu" role="listbox">
          {options.map((option, index) => (
            <li
              key={option.value}
              ref={index === activeIndex ? activeRef : undefined}
              role="option"
              aria-selected={option.value === props.value}
              className={`data-select-option${option.value === props.value ? " selected" : ""}${index === activeIndex ? " active" : ""}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(option.value)}
            >
              <Check className="data-select-check" size={18} aria-hidden="true" />
              <span>{option.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function DataInputRow(props: {
  label: string;
  value: string;
  control?: "input" | "radio" | "select";
  disabled?: boolean;
  type?: "text" | "number" | "month";
  min?: number;
  max?: number;
  step?: number | string;
  inputMode?: "decimal" | "email" | "numeric" | "search" | "tel" | "text" | "url";
  options?: ReadonlyArray<{ value: string; label: string }>;
  placeholder?: string;
  readOnly?: boolean;
  required?: boolean;
  status?: ReactNode;
  visualPrefix?: string;
  action?: ReactNode;
  onChange(value: string): void;
}) {
  const input = (
    <input
      disabled={props.disabled}
      inputMode={props.inputMode}
      max={props.max}
      min={props.min}
      placeholder={props.placeholder}
      readOnly={props.readOnly}
      required={props.required}
      step={props.step}
      type={props.type ?? "text"}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    />
  );

  return (
    <div className={`${props.action ? "data-input-row has-action" : "data-input-row"}${props.disabled ? " disabled" : ""}${props.readOnly ? " readonly" : ""}`}>
      <label className="data-input-main">
        <span className="data-label-line">
          <span>
            {props.label}
            {props.required ? (
              <span className="data-required-mark" aria-hidden="true">
                *
              </span>
            ) : null}
          </span>
          {props.status}
        </span>
        {props.control === "select" ? (
          <CustomSelect
            ariaLabel={props.label}
            disabled={props.disabled}
            options={props.options ?? []}
            placeholder={props.placeholder}
            value={props.value}
            onChange={props.onChange}
          />
        ) : props.control === "radio" ? (
          <div className="data-radio-group" role="radiogroup" aria-label={props.label}>
            {(props.options ?? []).map((option) => (
              <label className={props.value === option.value ? "data-radio-option active" : "data-radio-option"} key={option.value}>
                <input
                  checked={props.value === option.value}
                  disabled={props.disabled}
                  name={props.label}
                  required={props.required}
                  type="radio"
                  value={option.value}
                  onChange={(event) => props.onChange(event.target.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        ) : props.visualPrefix ? (
          <span className="data-input-prefix-wrap">
            <span className="data-input-prefix" aria-hidden="true">
              {props.visualPrefix}
            </span>
            {input}
          </span>
        ) : (
          input
        )}
      </label>
      {props.action ? <div className="data-action-cell">{props.action}</div> : null}
    </div>
  );
}

function CdrAction(props: { field: FieldDraft; busy: boolean; disabled?: boolean; onClick(): void }) {
  const hasIssuedCdr = Boolean(props.field.cdrVaultUuid && props.field.cdrLicenseIpId && props.field.cdrLicenseTermsId);
  const isDeploying = props.field.cdrState === "deploying";

  if (!hasIssuedCdr) {
    return (
      <button
        className="data-ip-button"
        type="button"
        onClick={props.onClick}
        disabled={props.disabled || props.busy || isDeploying}
        aria-label={`Issue ${props.field.label} IP and CDR`}
      >
        {isDeploying ? "..." : <IconAsset name="ip" size={32} />}
      </button>
    );
  }

  return (
    <>
      <span className="data-action-label">Search</span>
      <button
        className={props.field.cdrState === "on" ? "data-cdr-switch on" : "data-cdr-switch"}
        type="button"
        onClick={props.onClick}
        disabled={props.disabled || props.busy || isDeploying}
        aria-label={`${props.field.label} search visibility ${props.field.cdrState === "on" ? "on" : "off"}`}
      >
        <span>{props.field.cdrState === "on" ? "ON" : "OFF"}</span>
        <i aria-hidden="true" />
      </button>
    </>
  );
}

function EmptyState(props: { icon: ReactNode; title: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state-content">
        {props.icon}
        <strong>{props.title}</strong>
      </div>
    </div>
  );
}
