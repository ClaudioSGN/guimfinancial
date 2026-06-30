import { NextResponse } from "next/server";

export const runtime = "nodejs";

type DiscoveryMetric = "dy" | "pvp" | "roi";
type DiscoveryOrder = "desc" | "asc";

type BrapiListAsset = {
  stock?: string;
  name?: string;
  close?: number;
  change?: number;
  volume?: number;
  market_cap?: number;
  logo?: string;
  sector?: string;
  type?: string;
  subType?: string;
};

type BrapiListResponse = {
  stocks?: BrapiListAsset[];
  totalCount?: number;
  totalPages?: number;
  currentPage?: number;
};

type DiscoveryAsset = {
  symbol: string;
  name: string;
  price: number | null;
  changePct: number | null;
  dyPct: number | null;
  pVp: number | null;
  metricValue: number;
  logoUrl: string | null;
  sector: string | null;
  type: string | null;
  subType: string | null;
  volume: number | null;
  marketCap: number | null;
};

const BRAPI_LIST_URL = "https://brapi.dev/api/quote/list";
const FUNDAMENTUS_STOCKS_URL = "https://www.fundamentus.com.br/resultado.php";
const FUNDAMENTUS_FIIS_URL = "https://www.fundamentus.com.br/fii_resultado.php";
const PAGE_SIZE = 50;
const ROI_SCAN_LIMIT = 150;
const DISCOVERY_RESULT_LIMIT = 80;

function normalizeMetric(value: string | null): DiscoveryMetric {
  if (value === "pvp" || value === "roi") return value;
  return "dy";
}

function normalizeOrder(value: string | null): DiscoveryOrder {
  return value === "asc" ? "asc" : "desc";
}

function parseNumber(value: string | null) {
  if (!value) return null;
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function asFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePtNumber(value: string | null | undefined) {
  if (!value) return null;
  const cleaned = value
    .replace(/%/g, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9+-.]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "+" || cleaned === ".") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function repairUtf8Mojibake(value: string) {
  if (!/[ÃÂâ]/.test(value)) return value;
  try {
    return Buffer.from(value, "latin1").toString("utf8");
  } catch {
    return value;
  }
}

function cellToText(value: string) {
  return repairUtf8Mojibake(
    decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function extractTitle(value: string) {
  const title = value.match(/title=["']([^"']+)["']/i)?.[1];
  return title ? cellToText(title) : null;
}

function passesThreshold(value: number, threshold: number | null, order: DiscoveryOrder) {
  if (threshold == null) return true;
  return order === "desc" ? value >= threshold : value <= threshold;
}

async function fetchBrapiListPage(params: {
  page: number;
  sortBy: "volume" | "change";
  sortOrder: DiscoveryOrder;
}) {
  const token = process.env.BRAPI_TOKEN ?? process.env.NEXT_PUBLIC_BRAPI_TOKEN;
  if (!token) {
    throw new Error("missing_brapi_token");
  }

  const url = new URL(BRAPI_LIST_URL);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("sortBy", params.sortBy);
  url.searchParams.set("sortOrder", params.sortOrder);

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`brapi_list_${response.status}`);
  }

  return (await response.json()) as BrapiListResponse;
}

async function fetchCandidates(metric: DiscoveryMetric, order: DiscoveryOrder) {
  const sortBy = metric === "roi" ? "change" : "volume";
  const limit = ROI_SCAN_LIMIT;
  const maxPages = Math.ceil(limit / PAGE_SIZE);
  const candidates: BrapiListAsset[] = [];
  let totalCount = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    const data = await fetchBrapiListPage({ page, sortBy, sortOrder: order });
    totalCount = data.totalCount ?? totalCount;
    candidates.push(...(data.stocks ?? []));
    if (!data.stocks?.length || (data.totalPages && page >= data.totalPages)) break;
  }

  const seen = new Set<string>();
  return {
    totalCount,
    candidates: candidates
      .filter((asset) => {
        const symbol = String(asset.stock ?? "").trim().toUpperCase();
        if (!symbol || seen.has(symbol)) return false;
        seen.add(symbol);
        return true;
      })
      .slice(0, limit),
  };
}

async function fetchFundamentusPage(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`fundamentus_${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  return new TextDecoder("iso-8859-1").decode(buffer);
}

function parseFundamentusRows(html: string, kind: "stock" | "fii") {
  const rows: DiscoveryAsset[] = [];
  const rowMatches = Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi));

  for (const rowMatch of rowMatches) {
    const rowHtml = rowMatch[1] ?? "";
    const cells = Array.from(rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map(
      (cell) => cell[1] ?? "",
    );
    if (cells.length < 6) continue;

    const symbol =
      cells[0].match(/papel=([A-Z0-9]+)/i)?.[1]?.toUpperCase() ??
      cellToText(cells[0]).toUpperCase();
    if (!/^[A-Z]{4}\d{1,2}[A-Z]?$/.test(symbol)) continue;

    const name = extractTitle(cells[0]) ?? symbol;
    const price = kind === "stock" ? parsePtNumber(cells[1]) : parsePtNumber(cells[2]);
    const dyPct = kind === "stock" ? parsePtNumber(cells[5]) : parsePtNumber(cells[4]);
    const pVp = kind === "stock" ? parsePtNumber(cells[3]) : parsePtNumber(cells[5]);
    const sector = kind === "fii" ? cellToText(cells[1]) || "FII" : null;
    const marketCap = kind === "stock" ? parsePtNumber(cells[19]) : parsePtNumber(cells[6]);

    rows.push({
      symbol,
      name,
      price,
      changePct: null,
      dyPct,
      pVp,
      metricValue: 0,
      logoUrl: `https://icons.brapi.dev/icons/${symbol}.svg`,
      sector,
      type: kind === "fii" ? "fund" : "stock",
      subType: kind === "fii" ? "fii" : "stock",
      volume: null,
      marketCap,
    });
  }

  return rows;
}

async function fetchFundamentusAssets() {
  const [stocksHtml, fiisHtml] = await Promise.all([
    fetchFundamentusPage(FUNDAMENTUS_STOCKS_URL),
    fetchFundamentusPage(FUNDAMENTUS_FIIS_URL),
  ]);

  const assets = [
    ...parseFundamentusRows(stocksHtml, "stock"),
    ...parseFundamentusRows(fiisHtml, "fii"),
  ];
  const seen = new Set<string>();
  return assets.filter((asset) => {
    if (seen.has(asset.symbol)) return false;
    seen.add(asset.symbol);
    return true;
  });
}

function buildBaseAsset(asset: BrapiListAsset, metricValue: number): DiscoveryAsset {
  return {
    symbol: String(asset.stock ?? "").trim().toUpperCase(),
    name: String(asset.name ?? asset.stock ?? "").trim(),
    price: asFiniteNumber(asset.close),
    changePct: asFiniteNumber(asset.change),
    dyPct: null,
    pVp: null,
    metricValue,
    logoUrl: asset.logo ?? null,
    sector: asset.sector ?? null,
    type: asset.type ?? null,
    subType: asset.subType ?? null,
    volume: asFiniteNumber(asset.volume),
    marketCap: asFiniteNumber(asset.market_cap),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const metric = normalizeMetric(url.searchParams.get("metric"));
  const order = normalizeOrder(url.searchParams.get("order"));
  const threshold = parseNumber(url.searchParams.get("threshold"));

  try {
    if (metric === "roi") {
      const { candidates, totalCount } = await fetchCandidates(metric, order);
      const assets = candidates
        .map((asset) => {
          const value = asFiniteNumber(asset.change);
          if (value == null || !passesThreshold(value, threshold, order)) return null;
          return buildBaseAsset(asset, value);
        })
        .filter((asset): asset is DiscoveryAsset => Boolean(asset))
        .sort((left, right) =>
          order === "desc"
            ? right.metricValue - left.metricValue
            : left.metricValue - right.metricValue,
        );

      return NextResponse.json({
        assets,
        metric,
        updatedAt: new Date().toISOString(),
        source: "brapi",
        scannedCount: candidates.length,
        totalCount,
      });
    }

    const fundamentalAssets = await fetchFundamentusAssets();
    const assets = fundamentalAssets
      .map((asset) => {
        const value = metric === "dy" ? asset.dyPct : asset.pVp;
        if (value == null || !Number.isFinite(value)) return null;
        if (value <= 0) return null;
        if (!passesThreshold(value, threshold, order)) return null;
        return {
          ...asset,
          metricValue: value,
        };
      })
      .filter((asset): asset is DiscoveryAsset => Boolean(asset))
      .sort((left, right) =>
        order === "desc"
          ? right.metricValue - left.metricValue
          : left.metricValue - right.metricValue,
      )
      .slice(0, DISCOVERY_RESULT_LIMIT);

    return NextResponse.json({
      assets,
      metric,
      updatedAt: new Date().toISOString(),
      source: "Fundamentus",
      scannedCount: fundamentalAssets.length,
      totalCount: fundamentalAssets.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
