import { createHash } from "node:crypto";

import {
  PCC_SOURCE,
  QUERY_MODE,
  SCHEMA_VERSION,
  canonicalizeTenders,
  parseTenderDataset,
  type Tender,
  type TenderDataset,
} from "../../src/contracts/tender";

export function sha256ForTenders(tenders: readonly Tender[]): string {
  return createHash("sha256")
    .update(canonicalizeTenders(tenders), "utf8")
    .digest("hex");
}

export function createTenderDataset(
  tenders: readonly Tender[],
  fetchedAt = new Date().toISOString(),
): TenderDataset {
  return parseTenderDataset({
    schemaVersion: SCHEMA_VERSION,
    source: PCC_SOURCE,
    queryMode: QUERY_MODE,
    fetchedAt,
    recordCount: tenders.length,
    sha256: sha256ForTenders(tenders),
    tenders,
  });
}
