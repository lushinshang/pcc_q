import { readFile, readdir } from "node:fs/promises";

import { parse } from "yaml";

const WORKFLOW_DIRECTORY = ".github/workflows";
const FULL_SHA = /^[a-f0-9]{40}$/;

interface WorkflowStep {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}

interface WorkflowJob {
  env?: Record<string, string>;
  if?: string;
  needs?: string | string[];
  permissions?: Record<string, string>;
  environment?: { name?: string } | string;
  steps?: WorkflowStep[];
  "timeout-minutes"?: number;
}

interface Workflow {
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
  concurrency?: Record<string, unknown>;
  jobs?: Record<string, WorkflowJob>;
}

async function workflow(
  name: string,
): Promise<{ raw: string; value: Workflow }> {
  const raw = await readFile(`${WORKFLOW_DIRECTORY}/${name}`, "utf8");
  return { raw, value: parse(raw) as Workflow };
}

describe("REQ-S-004/005/008 workflow policy", () => {
  it("WF-T-001 pins every third-party action to a full 40-character commit SHA", async () => {
    const names = (await readdir(WORKFLOW_DIRECTORY)).filter((name) =>
      name.endsWith(".yml"),
    );
    expect(names.length).toBeGreaterThanOrEqual(3);

    for (const name of names) {
      const { raw, value } = await workflow(name);
      for (const job of Object.values(value.jobs ?? {})) {
        for (const step of job.steps ?? []) {
          if (!step.uses) continue;
          const [action, revision] = step.uses.split("@");
          expect(action, `${name}: ${step.uses}`).toMatch(
            /^[\w.-]+\/[\w./-]+$/,
          );
          expect(revision, `${name}: ${step.uses}`).toMatch(FULL_SHA);
          expect(
            raw,
            `${name}: ${step.uses} 必須在同一行標註已核對版本`,
          ).toMatch(
            new RegExp(
              `${step.uses.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+#\\s+v`,
            ),
          );
        }
      }
    }
  });

  it("WF-T-002 keeps CI and pull-request permissions read-only", async () => {
    const { value } = await workflow("ci.yml");
    expect(value.permissions).toEqual({ contents: "read" });
    expect(value.jobs?.quality?.env).toEqual({
      PAGES_BASE_PATH: "${{ vars.PAGES_BASE_PATH }}",
    });
    expect(JSON.stringify(value)).not.toContain('"pages":"write"');
    expect(JSON.stringify(value)).not.toContain('"id-token":"write"');
  });

  it("WF-T-003 grants Pages and OIDC write only to the deploy job", async () => {
    const { value } = await workflow("data-and-pages.yml");
    const fetchData = value.jobs?.["fetch-data"];
    const build = value.jobs?.build;
    const deploy = value.jobs?.deploy;
    const configurePages = deploy?.steps?.find((step) =>
      step.uses?.startsWith("actions/configure-pages@"),
    );

    expect(value.permissions).toEqual({ contents: "read" });
    expect(fetchData?.permissions).toBeUndefined();
    expect(build?.permissions).toBeUndefined();
    expect(deploy?.permissions).toEqual({
      contents: "read",
      pages: "write",
      "id-token": "write",
    });
    expect(build?.needs).toContain("fetch-data");
    expect(deploy?.needs).toContain("build");
    expect(deploy?.if).toContain("github.ref == 'refs/heads/main'");
    expect(deploy?.if).toContain("github.event_name != 'pull_request'");
    expect(deploy?.environment).toMatchObject({ name: "github-pages" });
    expect(configurePages?.uses).toBe(
      "actions/configure-pages@983d7736d9b0ae728b81ab479565c72886d7745b",
    );
  });

  it("WF-T-003b gives the first-run backfill job its own extended timeout, separate from the quality-gate job", async () => {
    const { value } = await workflow("data-and-pages.yml");
    const fetchData = value.jobs?.["fetch-data"];
    const build = value.jobs?.build;

    expect(fetchData?.["timeout-minutes"]).toBeGreaterThanOrEqual(60);
    expect(build?.["timeout-minutes"]).toBeLessThanOrEqual(25);
  });

  it("WF-T-004 schedules weekday Asia/Taipei refreshes and permits manual runs", async () => {
    const { raw, value } = await workflow("data-and-pages.yml");
    expect(raw).toMatch(/cron:\s+["']0 0,3,6,9,12,15,18,21 \* \* 1-5["']/);
    expect(raw).toContain("timezone: Asia/Taipei");
    expect(value.on).toHaveProperty("workflow_dispatch");
    expect(value.jobs?.build?.env).toEqual({
      PAGES_BASE_PATH: "${{ vars.PAGES_BASE_PATH }}",
    });
    expect(value.concurrency).toMatchObject({
      group: "pages-production",
      "cancel-in-progress": false,
    });
  });

  it("WF-T-005 deploys only after live fetch and every local gate, uploading only dist", async () => {
    const { raw, value } = await workflow("data-and-pages.yml");
    const fetchSteps = value.jobs?.["fetch-data"]?.steps ?? [];
    const steps = value.jobs?.build?.steps ?? [];
    const fetchCommands = fetchSteps.flatMap((step) =>
      step.run ? [step.run] : [],
    );
    const commands = steps.flatMap((step) => (step.run ? [step.run] : []));
    const checkout = steps.find((step) =>
      step.uses?.startsWith("actions/checkout@"),
    );
    const upload = steps.find((step) =>
      step.uses?.startsWith("actions/upload-pages-artifact@"),
    );

    expect(fetchCommands).toContain("npm run fetch:data");
    expect(commands).not.toContain("npm run fetch:data");
    expect(commands).toContain("npm run validate:code");
    expect(commands).toContain("npm run security:workflows");
    expect(commands).toContain("npm run workflow:lint");
    expect(commands).toContain("npm run security:history");
    expect(commands).toContain("npm run build");
    expect(commands).toContain("npm run validate:html");
    expect(commands).toContain("npm run security:dist");
    expect(commands).toContain("npm run test:e2e");
    expect(commands).toContain("npm audit --audit-level=high");
    expect(checkout?.with).toMatchObject({ "fetch-depth": 0 });
    expect(upload?.with).toEqual({ path: "dist" });
    expect(raw).not.toMatch(/\bgit\s+(?:add|commit|push)\b/);
    expect(steps.indexOf(upload ?? {})).toBeGreaterThan(
      steps.findIndex((step) => step.run === "npm run test:e2e"),
    );
  });

  it("WF-T-006 hands the fetched dataset from fetch-data to build via an artifact, not a direct write", async () => {
    const { value } = await workflow("data-and-pages.yml");
    const fetchSteps = value.jobs?.["fetch-data"]?.steps ?? [];
    const buildSteps = value.jobs?.build?.steps ?? [];
    const uploadArtifact = fetchSteps.find((step) =>
      step.uses?.startsWith("actions/upload-artifact@"),
    );
    const downloadArtifact = buildSteps.find((step) =>
      step.uses?.startsWith("actions/download-artifact@"),
    );

    expect(uploadArtifact?.with).toMatchObject({
      name: "tender-dataset",
      path: "public/data/tenders.json",
    });
    expect(downloadArtifact?.with).toMatchObject({
      name: "tender-dataset",
      path: "public/data",
    });
    expect(buildSteps.indexOf(downloadArtifact ?? {})).toBeLessThan(
      buildSteps.findIndex((step) => step.run === "npm run validate:code"),
    );
  });
});
