import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { createTenderDataset } from "../../scripts/lib/dataset";
import type { TenderDataset } from "../../src/contracts/tender";
import { loadTenderDataset } from "../../src/services/tenderService";
import { taipeiDate } from "../../src/utils/dateRange";

vi.mock("../../src/services/tenderService", () => ({
  loadTenderDataset: vi.fn(),
}));

import App from "../../src/App";

const mockedLoad = vi.mocked(loadTenderDataset);

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

// 預設篩選是「機關=國防部、日期範圍=當日」，fixture 必須用當下日期，
// 否則測試結果會隨執行日期漂移。
const TODAY = taipeiDate(Date.now());

function fixtureDataset(fetchedAt = new Date().toISOString()): TenderDataset {
  return createTenderDataset(
    [
      {
        id: "A-001",
        name: "醫療大樓整修工程",
        method: "公開招標",
        org: "國防部",
        budget: 21_389_616,
        announcedDate: TODAY,
        deadlineDate: "2026-08-07",
        link: "https://web.pcc.gov.tw/prkms/a",
      },
      {
        id: "B-002",
        name: "航電系統委商維護",
        method: "限制性招標",
        org: "國防部",
        budget: 1_200_000,
        announcedDate: TODAY,
        deadlineDate: "2026-08-01",
        link: "https://web.pcc.gov.tw/prkms/b",
      },
    ],
    fetchedAt,
  );
}

describe("REQ-F-001/002/003 dashboard behavior", () => {
  it("APP-T-001 shows a loading state while the static dataset request is pending", () => {
    mockedLoad.mockReturnValue(new Promise(() => undefined));
    render(<App />);
    expect(screen.getByText("正在載入已發布資料")).toBeInTheDocument();
  });

  it("APP-T-002 shows all records initially and filters by name and method", async () => {
    mockedLoad.mockResolvedValue(fixtureDataset());
    render(<App />);

    expect(await screen.findByText("2／2 筆")).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "搜尋案名或案號" }),
    ).toHaveValue("");
    expect(screen.getAllByText("醫療大樓整修工程").length).toBeGreaterThan(0);
    expect(screen.getAllByText("航電系統委商維護").length).toBeGreaterThan(0);
    expect(screen.getByText("當日公告（isNow）")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "政府電子採購網" }),
    ).toHaveAttribute("href", "https://web.pcc.gov.tw/");
    expect(screen.getByText("2 筆")).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("searchbox", { name: "搜尋案名或案號" }),
      {
        target: { value: "航電" },
      },
    );
    expect(screen.getByText("1／2 筆")).toBeInTheDocument();
    expect(
      screen.queryByText("找不到符合篩選條件的標案。"),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "招標方式" }), {
      target: { value: "公開招標" },
    });
    expect(screen.getByText("0／2 筆")).toBeInTheDocument();
    expect(screen.getByText("找不到符合篩選條件的標案。")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "招標方式" }), {
      target: { value: "ALL" },
    });
    fireEvent.change(
      screen.getByRole("searchbox", { name: "搜尋案名或案號" }),
      {
        target: { value: "  B-002  " },
      },
    );
    expect(screen.getByText("1／2 筆")).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("searchbox", { name: "搜尋案名或案號" }),
      {
        target: { value: "" },
      },
    );
    expect(screen.getByText("2／2 筆")).toBeInTheDocument();
  });

  it("APP-T-003 marks data older than two hours as stale", async () => {
    mockedLoad.mockResolvedValue(
      fixtureDataset(new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()),
    );
    render(<App />);

    expect(await screen.findByTestId("freshness")).toHaveTextContent(
      "資料可能過期",
    );
  });

  it("APP-T-004 preserves the last good dataset when refresh fails", async () => {
    mockedLoad
      .mockResolvedValueOnce(fixtureDataset())
      .mockRejectedValueOnce(new Error("offline"));
    render(<App />);

    await screen.findByText("2／2 筆");
    fireEvent.click(screen.getByRole("button", { name: "重新載入已發布資料" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("保留上一版資料");
    });
    expect(screen.getByText("2／2 筆")).toBeInTheDocument();
  });

  it("APP-T-005 shows an invalid-data state when the first load fails", async () => {
    mockedLoad.mockRejectedValue(new Error("SHA-256 驗證失敗"));
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入資料");
    expect(screen.getByText("目前沒有可顯示的資料")).toBeInTheDocument();
  });

  it("APP-T-006 shows a distinct valid-empty state", async () => {
    mockedLoad.mockResolvedValue(createTenderDataset([]));
    render(<App />);

    expect(
      await screen.findByText("當日沒有已發布標案資料"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("APP-T-007 shows an explicit network error when no older data is available", async () => {
    mockedLoad.mockRejectedValue(new TypeError("network offline"));
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "network offline",
    );
    expect(screen.getByText("目前沒有可顯示的資料")).toBeInTheDocument();
  });

  it("APP-T-008 ignores arbitrary URL search parameters and always starts empty", async () => {
    window.history.replaceState(null, "", "/?q=綜合任務");
    mockedLoad.mockResolvedValue(fixtureDataset());
    render(<App />);

    await screen.findByText("2／2 筆");
    expect(
      screen.getByRole("searchbox", { name: "搜尋案名或案號" }),
    ).toHaveValue("");
  });
});
