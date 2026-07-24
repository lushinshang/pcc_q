import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "國防部當日公告標案儀表板" }),
  ).toBeVisible();
  await expect(page.getByText(/\d+／\d+ 筆/)).toBeVisible();
});

test("E2E-T-001 renders the published dataset without browser requests to PCC or an API", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));

  await page.getByRole("button", { name: "重新載入已發布資料" }).click();
  await expect(
    page.getByRole("button", { name: "重新載入已發布資料" }),
  ).toBeEnabled();

  expect(requests.some((url) => url.includes("/data/tenders.json"))).toBe(true);
  expect(requests.some((url) => url.includes("/api/tenders"))).toBe(false);
  expect(
    requests.some((url) => new URL(url).hostname === "web.pcc.gov.tw"),
  ).toBe(false);
});

test("E2E-T-002 provides text alternatives and no serious accessibility violations", async ({
  page,
}) => {
  await expect(page.getByRole("table")).toHaveCount(
    test.info().project.name === "desktop" ? 1 : 0,
  );
  const progressCount = await page.getByRole("progressbar").count();
  expect(progressCount).toBeGreaterThan(0);

  const results = await new AxeBuilder({ page }).analyze();
  const severe = results.violations.filter(({ impact }) =>
    ["serious", "critical"].includes(impact ?? ""),
  );
  expect(severe).toEqual([]);

  const tenderLinks = await page.locator("a.tender-link").evaluateAll((links) =>
    links.map((link) => {
      const anchor = link as HTMLAnchorElement;
      return { href: anchor.href, rel: anchor.rel, target: anchor.target };
    }),
  );
  expect(tenderLinks.length).toBeGreaterThan(0);
  for (const link of tenderLinks) {
    expect(new URL(link.href).origin).toBe("https://web.pcc.gov.tw");
    expect(link.rel.split(/\s+/)).toEqual(
      expect.arrayContaining(["noopener", "noreferrer"]),
    );
    expect(link.target).toBe("_blank");
  }

  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "重新載入已發布資料" }),
  ).toBeFocused();
});

test("E2E-T-003 honors CSP and fits the target viewport without horizontal overflow", async ({
  page,
}) => {
  const cspErrors: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) {
      cspErrors.push(message.text());
    }
  });
  await page.reload();
  await expect(page.getByText(/\d+／\d+ 筆/)).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  expect(cspErrors).toEqual([]);

  const screenshotName =
    test.info().project.name === "desktop"
      ? "qa/dashboard-desktop.png"
      : "qa/dashboard-mobile.png";
  await page.screenshot({ path: screenshotName, fullPage: true });
});
