import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// 資料集在滾動累積下可能真的是零筆（例如假日或剛跨日還沒有新公告），這是合法狀態；
// 測試需要能辨識並分別驗證，而不是預設 Production 一定有資料可顯示。
async function waitForAppReady(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "國防部當日公告標案儀表板" }),
  ).toBeVisible();
  await expect(
    page.getByText(/\d+／\d+ 筆/).or(page.getByText("當日沒有已發布標案資料")),
  ).toBeVisible();
}

async function hasPublishedTenders(page: Page): Promise<boolean> {
  return (await page.getByText(/\d+／\d+ 筆/).count()) > 0;
}

// 累積資料集本身可能有上千筆，但預設篩選（機關＝國防部、日期範圍＝當日）套用後，
// 當天剛好沒有新公告時篩選結果一樣會是零筆，畫面顯示「找不到符合篩選條件的標案」
// 而不是表格；這跟「整個資料集是零筆」是兩種不同狀態，要分開判斷。
async function hasFilteredResults(page: Page): Promise<boolean> {
  const summary = await page
    .getByText(/\d+／\d+ 筆/)
    .first()
    .textContent()
    .catch(() => null);
  const match = summary ? /(\d+)／(\d+) 筆/.exec(summary) : null;
  return match !== null && Number(match[1]) > 0;
}

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await waitForAppReady(page);
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
  const results = await new AxeBuilder({ page }).analyze();
  const severe = results.violations.filter(({ impact }) =>
    ["serious", "critical"].includes(impact ?? ""),
  );
  expect(severe).toEqual([]);

  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "重新載入已發布資料" }),
  ).toBeFocused();

  test.skip(
    !(await hasFilteredResults(page)),
    "預設篩選（國防部／當日）套用後為零筆，表格／連結相關檢查沒有元素可驗證",
  );

  await expect(page.getByRole("table")).toHaveCount(
    test.info().project.name === "desktop" ? 1 : 0,
  );
  const progressCount = await page.getByRole("progressbar").count();
  expect(progressCount).toBeGreaterThan(0);

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
  await waitForAppReady(page);

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

test("E2E-T-004 defaults to 國防部 and 當日, and updates results when either filter changes", async ({
  page,
}) => {
  test.skip(
    !(await hasPublishedTenders(page)),
    "本次資料集為零筆，機關／日期範圍下拉在空狀態下不會渲染",
  );

  await expect(page.getByRole("combobox", { name: "機關" })).toHaveValue(
    "國防部",
  );
  await expect(page.getByRole("combobox", { name: "日期範圍" })).toHaveValue(
    "TODAY",
  );

  const initialCount = await page.getByText(/\d+／\d+ 筆/).textContent();

  await page
    .getByRole("combobox", { name: "日期範圍" })
    .selectOption({ label: "一週" });
  await expect(page.getByText(/\d+／\d+ 筆/)).toBeVisible();

  await page.getByRole("combobox", { name: "機關" }).selectOption("內政部");
  await expect(page.getByText(/\d+／\d+ 筆/)).toBeVisible();
  const afterOrgSwitch = await page.getByText(/\d+／\d+ 筆/).textContent();
  expect(afterOrgSwitch).not.toBe(initialCount);
});
