import { strToU8, zipSync } from "fflate";
import type { ExportPlan } from "./types";
import { readInlineCdrVault } from "./web3/cdr";
import type { PrivyWalletConnection } from "./web3/privy";

export interface DecryptedRow {
  profileRef: string;
  [key: string]: string;
}

export interface ExportResult {
  rows: DecryptedRow[];
  successfulFieldIds: string[];
  failedFieldIds: string[];
}

export type ExportFailure = {
  fieldId: string;
  kind: string;
  cdrVaultUuid?: string;
  licenseTokenIds: string[];
  accessAuxData: string;
  error: unknown;
};

export type BuildRowsOptions = {
  logFailures?: boolean;
  onFailure?(failure: ExportFailure): void;
};

async function decryptCdrSlot(item: ExportPlan["items"][number], wallet: PrivyWalletConnection): Promise<string> {
  return readInlineCdrVault(wallet, item);
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause,
    };
  }
  return error;
}

export async function buildRowsFromExportPlan(plan: ExportPlan, wallet: PrivyWalletConnection, options: BuildRowsOptions = {}): Promise<ExportResult> {
  const logFailures = options.logFailures ?? true;
  const rowsByProfile = new Map<string, DecryptedRow>();
  const successfulFieldIds: string[] = [];
  const failedFieldIds: string[] = [];

  for (const item of plan.items) {
    try {
      const row = rowsByProfile.get(item.profileRef) ?? { profileRef: item.profileRef };
      row[item.kind] = await decryptCdrSlot(item, wallet);
      rowsByProfile.set(item.profileRef, row);
      successfulFieldIds.push(item.fieldId);
    } catch (error) {
      const failure: ExportFailure = {
        fieldId: item.fieldId,
        kind: item.kind,
        cdrVaultUuid: item.cdrVaultUuid,
        licenseTokenIds: item.licenseTokenIds,
        accessAuxData: item.accessAuxData,
        error,
      };
      options.onFailure?.(failure);
      if (logFailures) {
        console.error("[axios-cdr] field_access_failed", {
          ...failure,
          error: serializeError(error),
        });
      }
      failedFieldIds.push(item.fieldId);
    }
  }

  return {
    rows: [...rowsByProfile.values()],
    successfulFieldIds,
    failedFieldIds,
  };
}

export function downloadCsv(filename: string, rows: DecryptedRow[]) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const csv = [
    columns.join(","),
    ...rows.map((row) =>
      columns
        .map((column) => JSON.stringify(row[column] ?? ""))
        .join(","),
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadXlsx(filename: string, rows: DecryptedRow[]) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const sheetRows = [columns, ...rows.map((row) => columns.map((column) => row[column] ?? ""))];
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${sheetRows
      .map(
        (cells, rowIndex) =>
          `<row r="${rowIndex + 1}">${cells
            .map((cell, cellIndex) => {
              const ref = `${columnName(cellIndex + 1)}${rowIndex + 1}`;
              return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`;
            })
            .join("")}</row>`,
      )
      .join("")}
  </sheetData>
</worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Purchased cards" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  const zipped = zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rels),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRels),
    "xl/worksheets/sheet1.xml": strToU8(worksheet),
  });
  const blob = new Blob([zipped], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index: number) {
  let name = "";
  let cursor = index;
  while (cursor > 0) {
    const remainder = (cursor - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    cursor = Math.floor((cursor - 1) / 26);
  }
  return name;
}
