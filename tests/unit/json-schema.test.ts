import { readFile } from "node:fs/promises";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { createTenderDataset } from "../../scripts/lib/dataset";

describe("REQ-D-001 published JSON Schema", () => {
  it("SCHEMA-T-001 accepts a valid dataset and rejects malicious URL, unsafe budget, and extras", async () => {
    const schema = JSON.parse(
      await readFile(
        "docs/specs/001-pages-migration/data-contract.schema.json",
        "utf8",
      ),
    ) as object;
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    const valid = createTenderDataset(
      [
        {
          id: "A",
          name: "測試標案",
          method: "公開招標",
          org: "國防部",
          budget: 1000,
          announcedDate: "2026-07-24",
          deadlineDate: "2026-08-01",
          link: "https://web.pcc.gov.tw/prkms/a",
        },
      ],
      "2026-07-24T08:17:00+08:00",
    );

    expect(validate(valid), JSON.stringify(validate.errors)).toBe(true);
    expect(
      validate({
        ...valid,
        tenders: [{ ...valid.tenders[0], link: "javascript:alert(1)" }],
      }),
    ).toBe(false);
    expect(
      validate({
        ...valid,
        tenders: [{ ...valid.tenders[0], budget: Number.MAX_SAFE_INTEGER + 1 }],
      }),
    ).toBe(false);
    expect(validate({ ...valid, unexpected: true })).toBe(false);

    for (const field of [
      "schemaVersion",
      "source",
      "queryMode",
      "fetchedAt",
      "recordCount",
      "sha256",
      "tenders",
    ]) {
      const missingDatasetField = structuredClone(valid) as unknown as Record<
        string,
        unknown
      >;
      Reflect.deleteProperty(missingDatasetField, field);
      expect(validate(missingDatasetField), field).toBe(false);
    }

    for (const field of [
      "id",
      "name",
      "method",
      "org",
      "budget",
      "announcedDate",
      "deadlineDate",
      "link",
    ]) {
      const missingTenderField = structuredClone(valid) as unknown as {
        tenders: Record<string, unknown>[];
      };
      const firstTender = missingTenderField.tenders[0];
      expect(firstTender).toBeDefined();
      if (firstTender) Reflect.deleteProperty(firstTender, field);
      expect(validate(missingTenderField), field).toBe(false);
    }
  });
});
