import {
  DEFAULT_ORG_LABEL,
  ORG_LABELS,
  resolveOrgLabel,
} from "../../src/contracts/orgWhitelist";

describe("REQ-D-007 org whitelist resolution", () => {
  it("ORG-T-001 matches sub-units by substring, including the default label", () => {
    expect(resolveOrgLabel("國防部軍備局")).toBe("國防部");
    expect(resolveOrgLabel("國防部")).toBe(DEFAULT_ORG_LABEL);
  });

  it("ORG-T-002 returns null for organizations outside the whitelist", () => {
    expect(resolveOrgLabel("某某地方合作社")).toBeNull();
  });

  it("ORG-T-003 returns null for empty or whitespace-only input", () => {
    expect(resolveOrgLabel("")).toBeNull();
    expect(resolveOrgLabel("   ")).toBeNull();
  });

  it("ORG-T-004 prefers the first matching group when a name contains multiple patterns", () => {
    // A central-ministry field office operating in a city should resolve to the
    // ministry (higher priority group), not the city government.
    expect(resolveOrgLabel("財政部國有財產署臺北市分署")).toBe("財政部");
  });

  it("ORG-T-005 normalizes full-width and half-width city name variants", () => {
    expect(resolveOrgLabel("台北市政府工務局")).toBe("臺北市");
  });

  it("ORG-T-006 keeps ORG_LABELS non-empty and free of duplicates", () => {
    expect(ORG_LABELS.length).toBeGreaterThan(0);
    expect(new Set(ORG_LABELS).size).toBe(ORG_LABELS.length);
    expect(ORG_LABELS).toContain(DEFAULT_ORG_LABEL);
  });
});
