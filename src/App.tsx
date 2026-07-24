import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  Clock3,
  ExternalLink,
  Flower2,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

import type { Tender, TenderDataset } from "./contracts/tender";
import { loadTenderDataset } from "./services/tenderService";
import { getDatasetFreshness } from "./utils/freshness";

const CHART_COLORS = [
  "accent-pink",
  "accent-blue",
  "accent-gold",
  "accent-green",
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTaipeiTime(value: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Taipei",
  }).format(new Date(value));
}

function TenderName({ tender }: { tender: Tender }) {
  return (
    <a
      href={tender.link}
      target="_blank"
      rel="noopener noreferrer"
      className="tender-link"
    >
      {tender.name}
      <ExternalLink aria-hidden="true" />
      <span className="sr-only">（另開政府採購網）</span>
    </a>
  );
}

export default function App() {
  const [dataset, setDataset] = useState<TenderDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [methodFilter, setMethodFilter] = useState("ALL");
  const initialLoadStarted = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextDataset = await loadTenderDataset();
      setDataset(nextDataset);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "資料載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    void refresh();
  }, [refresh]);

  const tenders = useMemo(() => dataset?.tenders ?? [], [dataset]);
  const methods = useMemo(
    () => ["ALL", ...new Set(tenders.map((tender) => tender.method))],
    [tenders],
  );
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase("zh-TW");
  const filteredTenders = useMemo(
    () =>
      tenders.filter((tender) => {
        const matchesText =
          normalizedSearch === "" ||
          tender.name.toLocaleLowerCase("zh-TW").includes(normalizedSearch) ||
          tender.id.toLocaleLowerCase("zh-TW").includes(normalizedSearch);
        return (
          matchesText &&
          (methodFilter === "ALL" || tender.method === methodFilter)
        );
      }),
    [methodFilter, normalizedSearch, tenders],
  );

  const statistics = useMemo(() => {
    const totalBudget = filteredTenders.reduce(
      (total, tender) => total + tender.budget,
      0,
    );
    const largest =
      filteredTenders.length === 0
        ? null
        : filteredTenders.reduce((current, tender) =>
            tender.budget > current.budget ? tender : current,
          );
    return {
      count: filteredTenders.length,
      totalBudget,
      largest,
      largestShare:
        largest && totalBudget > 0
          ? Math.round((largest.budget / totalBudget) * 1000) / 10
          : 0,
    };
  }, [filteredTenders]);

  const chartData = useMemo(() => {
    const topBudgets = [...filteredTenders]
      .sort((left, right) => right.budget - left.budget)
      .slice(0, 5);
    const methodCounts = new Map<string, number>();
    for (const tender of filteredTenders) {
      methodCounts.set(
        tender.method,
        (methodCounts.get(tender.method) ?? 0) + 1,
      );
    }
    return { topBudgets, methodCounts: [...methodCounts.entries()] };
  }, [filteredTenders]);

  const freshness = dataset ? getDatasetFreshness(dataset.fetchedAt) : null;

  return (
    <div className="page-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">非官方公開資料整理</p>
          <h1>國防部當日公告標案儀表板</h1>
          <p className="hero-copy">
            資料由 GitHub Actions 定時擷取、驗證並以靜態 JSON
            發布；瀏覽器不直接連線政府採購網。
          </p>
        </div>
        <button
          type="button"
          className="refresh-button"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw aria-hidden="true" className={loading ? "spin" : ""} />
          {loading ? "載入資料中" : "重新載入已發布資料"}
        </button>
      </header>

      <main>
        <section className="source-panel" aria-labelledby="source-title">
          <div>
            <h2 id="source-title">
              <ShieldCheck aria-hidden="true" /> 資料狀態
            </h2>
            {dataset ? (
              <dl className="metadata">
                <div>
                  <dt>資料來源</dt>
                  <dd>
                    <a
                      href={dataset.source}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      政府電子採購網
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>查詢模式</dt>
                  <dd>當日公告（{dataset.queryMode}）</dd>
                </div>
                <div>
                  <dt>擷取時間</dt>
                  <dd>{formatTaipeiTime(dataset.fetchedAt)}</dd>
                </div>
                <div>
                  <dt>驗證筆數</dt>
                  <dd>{dataset.recordCount} 筆</dd>
                </div>
              </dl>
            ) : (
              <p>尚未取得可驗證資料。</p>
            )}
          </div>
          {freshness && (
            <div
              className={
                freshness.isStale ? "freshness stale" : "freshness fresh"
              }
              role="status"
              data-testid="freshness"
            >
              <Clock3 aria-hidden="true" />
              <span>
                {freshness.isStale ? "資料可能過期" : "資料在兩小時新鮮度內"}
              </span>
            </div>
          )}
        </section>

        <div aria-live="polite" aria-atomic="true">
          {error && (
            <div className="alert" role="alert">
              <AlertCircle aria-hidden="true" />
              <div>
                <strong>
                  {dataset
                    ? "重新載入失敗，保留上一版資料。"
                    : "無法載入資料。"}
                </strong>
                <p>{error}</p>
              </div>
            </div>
          )}
        </div>

        {loading && !dataset ? (
          <section className="state-card" aria-busy="true">
            <span className="loading-flower" aria-hidden="true">
              🌸
            </span>
            <h2>正在載入已發布資料</h2>
          </section>
        ) : !dataset ? (
          <section className="state-card">
            <h2>目前沒有可顯示的資料</h2>
            <p>請稍後重試；本頁不會直接向政府採購網發出請求。</p>
          </section>
        ) : dataset.tenders.length === 0 ? (
          <section className="state-card">
            <h2>當日沒有已發布標案資料</h2>
            <p>資料集已通過契約驗證，但內容為零筆。</p>
          </section>
        ) : (
          <>
            <section className="kpi-grid" aria-label="篩選結果摘要">
              <article>
                <span>標案總數</span>
                <strong>{statistics.count}</strong>
              </article>
              <article>
                <span>總預算規模</span>
                <strong>{formatCurrency(statistics.totalBudget)}</strong>
              </article>
              <article>
                <span>最大標案佔比</span>
                <strong>{statistics.largestShare}%</strong>
                <small>{statistics.largest?.name ?? "無資料"}</small>
              </article>
            </section>

            <section className="charts-grid" aria-label="標案統計圖表">
              <article className="chart-card">
                <h2>
                  <TrendingUp aria-hidden="true" /> 預算最高 Top 5
                </h2>
                <ol className="progress-list">
                  {chartData.topBudgets.map((tender, index) => (
                    <li key={`${tender.id}-${tender.link}`}>
                      <div>
                        <span>{tender.name}</span>
                        <strong>{formatCurrency(tender.budget)}</strong>
                      </div>
                      <progress
                        className={CHART_COLORS[index % CHART_COLORS.length]}
                        max={Math.max(chartData.topBudgets[0]?.budget ?? 1, 1)}
                        value={tender.budget}
                        aria-label={`${tender.name}預算 ${formatCurrency(tender.budget)}`}
                      />
                    </li>
                  ))}
                </ol>
              </article>
              <article className="chart-card">
                <h2>
                  <BarChart3 aria-hidden="true" /> 招標方式組成
                </h2>
                <ul className="progress-list">
                  {chartData.methodCounts.map(([method, count], index) => (
                    <li key={method}>
                      <div>
                        <span>{method}</span>
                        <strong>{count} 筆</strong>
                      </div>
                      <progress
                        className={CHART_COLORS[index % CHART_COLORS.length]}
                        max={Math.max(statistics.count, 1)}
                        value={count}
                        aria-label={`${method} ${String(count)} 筆`}
                      />
                    </li>
                  ))}
                </ul>
              </article>
            </section>

            <section aria-labelledby="explorer-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">資料探索</p>
                  <h2 id="explorer-title">全部標案查詢列表</h2>
                </div>
                <span>
                  {filteredTenders.length}／{tenders.length} 筆
                </span>
              </div>
              <div className="filters">
                <label>
                  <span>搜尋案名或案號</span>
                  <span className="input-wrap">
                    <Search aria-hidden="true" />
                    <input
                      type="search"
                      value={searchTerm}
                      maxLength={120}
                      onChange={(event) => {
                        setSearchTerm(event.target.value);
                      }}
                      placeholder="輸入案名或案號"
                    />
                  </span>
                </label>
                <label>
                  <span>招標方式</span>
                  <select
                    value={methodFilter}
                    onChange={(event) => {
                      setMethodFilter(event.target.value);
                    }}
                  >
                    {methods.map((method) => (
                      <option key={method} value={method}>
                        {method === "ALL" ? "所有招標方式" : method}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {filteredTenders.length === 0 ? (
                <div className="no-results" role="status">
                  找不到符合篩選條件的標案。
                </div>
              ) : (
                <>
                  <div className="desktop-table">
                    <table>
                      <caption className="sr-only">
                        國防部當日公告標案列表
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">案號／公告日</th>
                          <th scope="col">標案名稱</th>
                          <th scope="col">招標方式</th>
                          <th scope="col">截止日</th>
                          <th scope="col">預算</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTenders.map((tender) => (
                          <tr
                            key={`${tender.id}-${tender.announcedDate}-${tender.link}`}
                          >
                            <td>
                              <strong>{tender.id}</strong>
                              <small>{tender.announcedDate}</small>
                            </td>
                            <td>
                              <TenderName tender={tender} />
                            </td>
                            <td>
                              <span className="method-pill">
                                {tender.method}
                              </span>
                            </td>
                            <td>{tender.deadlineDate}</td>
                            <td className="currency">
                              {formatCurrency(tender.budget)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mobile-cards">
                    {filteredTenders.map((tender) => (
                      <article
                        key={`${tender.id}-${tender.announcedDate}-${tender.link}`}
                      >
                        <div className="card-meta">
                          <strong>{tender.id}</strong>
                          <span>{tender.announcedDate}</span>
                        </div>
                        <TenderName tender={tender} />
                        <dl>
                          <div>
                            <dt>招標方式</dt>
                            <dd>{tender.method}</dd>
                          </div>
                          <div>
                            <dt>截止日期</dt>
                            <dd>{tender.deadlineDate}</dd>
                          </div>
                          <div>
                            <dt>預算</dt>
                            <dd>{formatCurrency(tender.budget)}</dd>
                          </div>
                        </dl>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </main>

      <footer>
        <p>
          <Flower2 aria-hidden="true" />{" "}
          本站為非官方公開資料整理，內容以政府電子採購網原始公告為準。
        </p>
        <p>
          GitHub Pages 無法由本專案自訂完整 HTTP response security headers。
        </p>
      </footer>
    </div>
  );
}
