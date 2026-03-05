"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Big from "big.js";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/language";
import { useAuth } from "@/lib/auth";
import { AppIcon } from "@/components/AppIcon";
import { formatCentsInput, parseCentsInput } from "@/lib/moneyInput";
import {
  computeNewAveragePrice,
  computeQuantityFromValue,
  computeTotal,
} from "@/lib/investments/math";

type Investment = {
  id: string;
  type: "b3" | "crypto";
  symbol: string;
  name: string | null;
  quantity: number;
  average_price: number;
};

type Quote = {
  price: number;
  changePct?: number | null;
  logoUrl?: string | null;
  assetName?: string | null;
  dyPct?: number | null;
  pVp?: number | null;
  sharesOutstanding?: number | null;
  bookValue?: number | null;
  vacancyPct?: number | null;
};

type PricePoint = {
  time: number;
  price: number;
};

type CryptoSearchItem = {
  id: string;
  symbol: string;
  name: string;
  thumb: string | null;
  rank: number | null;
};

type CryptoMarketSnapshot = {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  rank: number | null;
  price: number;
  changePct24h: number | null;
  marketCap: number | null;
  volume24h: number | null;
  high24h: number | null;
  low24h: number | null;
};

type Purchase = {
  id: string;
  date: string;
  price_per_share: number | string;
  quantity: number | string;
  total_invested: number | string;
  mode_used: "quantity" | "value";
  input_value: number | string | null;
};

type InvestmentMetricKey =
  | "dyPct"
  | "pVp"
  | "sharesOutstanding"
  | "bookValue"
  | "vacancyPct";

type InvestmentFilterSettings = {
  enabled: boolean;
  showOnlyAbove: boolean;
  limits: Record<InvestmentMetricKey, string>;
};

type InvestmentOrganizer = "alphabetical" | "category";
type InvestmentCategory = "fii" | "etf" | "stock" | "bdr" | "crypto" | "other";

const BRAPI_KEY = process.env.NEXT_PUBLIC_BRAPI_KEY;
const B3_SUFFIX = ".SA";
const FEATURED_CRYPTO_IDS = [
  "bitcoin",
  "ethereum",
  "tether",
  "binancecoin",
  "solana",
  "ripple",
  "usd-coin",
  "cardano",
  "dogecoin",
  "tron",
];
const INVESTMENT_FILTER_STORAGE_PREFIX = "guimfinancial:investments:dy-filter";
const DEFAULT_INVESTMENT_FILTER: InvestmentFilterSettings = {
  enabled: true,
  showOnlyAbove: false,
  limits: {
    dyPct: "10",
    pVp: "1.5",
    sharesOutstanding: "",
    bookValue: "",
    vacancyPct: "10",
  },
};
const BRAPI_DEFAULT_HEADERS = {
  Accept: "application/json,text/plain,*/*",
};
const BRAPI_BACKOFF_MS = 30 * 1000;
const BRAPI_PERMANENT_SYMBOL_CODES = new Set([
  "INVALID_STOCK",
  "INVALID_SYMBOL",
  "SYMBOL_NOT_FOUND",
  "QUOTE_NOT_FOUND",
  "NO_RESULTS",
  "NOT_FOUND",
]);
let brapiBlockedUntil = 0;
const badB3Symbols = new Set<string>();
let brapiUseToken = Boolean(BRAPI_KEY);
let brapiHistoryRange = "1y";
const INVESTIDOR10_PROXY_PREFIXES = [
  "https://api.codetabs.com/v1/proxy/?quest=",
  "https://api.allorigins.win/raw?url=",
];
const investidor10FundamentalsCache = new Map<string, Partial<Quote> | null>();

function toPoints(entries: Array<{ time: number; price: number }> | PricePoint[]) {
  return entries
    .map((entry) => ({
      time: Number(entry?.time ?? 0),
      price: Number(entry?.price ?? 0),
    }))
    .filter((entry) => entry.time && entry.price)
    .sort((a, b) => a.time - b.time);
}

function isLikelyB3Symbol(value: string) {
  return /^[A-Z0-9]{4,8}$/.test(value);
}

function isLikelyCryptoId(value: string) {
  return /^[a-z0-9-]{2,64}$/.test(value);
}

function isBrapiBlocked() {
  return Date.now() < brapiBlockedUntil;
}

function pickSupportedBrapiRange(message?: string) {
  if (!message) return null;
  const fromMessage = message.match(/Ranges permitidos:\s*([^\n]+)/i)?.[1];
  if (!fromMessage) return null;
  const available = fromMessage
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const preferredOrder = ["1y", "3mo", "1mo", "5d", "1d"];
  return preferredOrder.find((range) => available.includes(range)) ?? null;
}

function extractBrapiErrorDetails(payload: any) {
  const codeCandidates = [
    payload?.code,
    payload?.errorCode,
    payload?.error?.code,
    payload?.errors?.[0]?.code,
  ];
  const messageCandidates = [
    payload?.message,
    payload?.error_description,
    payload?.error?.message,
    typeof payload?.error === "string" ? payload.error : undefined,
    payload?.errors?.[0]?.message,
  ];
  const code = codeCandidates.find((value) => typeof value === "string");
  const message = messageCandidates.find((value) => typeof value === "string");
  return {
    code: code ? String(code) : undefined,
    message: message ? String(message) : undefined,
  };
}

function isPermanentB3SymbolError(code?: string, message?: string) {
  if (code && BRAPI_PERMANENT_SYMBOL_CODES.has(code.toUpperCase())) {
    return true;
  }
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    (lower.includes("symbol") && lower.includes("invalid")) ||
    lower.includes("symbol not found") ||
    lower.includes("nao encontrado")
  );
}

function parseNumberish(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withoutPercent = trimmed.replace(/%/g, "").replace(/\s+/g, "");
  const commaCount = (withoutPercent.match(/,/g) ?? []).length;
  const dotCount = (withoutPercent.match(/\./g) ?? []).length;
  let normalized = withoutPercent;
  if (commaCount > 0 && dotCount > 0) {
    normalized = withoutPercent.replace(/\./g, "").replace(/,/g, ".");
  } else if (commaCount > 0) {
    normalized = withoutPercent.replace(/,/g, ".");
  } else if (dotCount > 1) {
    normalized = withoutPercent.replace(/\./g, "");
  }
  const cleaned = normalized.replace(/[^0-9+-.]/g, "");
  if (!cleaned || cleaned === "." || cleaned === "+" || cleaned === "-") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePercentValue(value: unknown) {
  const numeric = parseNumberish(value);
  if (numeric == null) return null;
  if (numeric > -1 && numeric < 1 && numeric !== 0) return numeric * 100;
  return numeric;
}

function parseNumberWithScale(value: unknown) {
  if (typeof value !== "string") {
    return parseNumberish(value);
  }
  const numeric = parseNumberish(value);
  if (numeric == null) return null;
  const normalizedText = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (normalizedText.includes("trilh")) return numeric * 1_000_000_000_000;
  if (normalizedText.includes("bilh")) return numeric * 1_000_000_000;
  if (normalizedText.includes("milh")) return numeric * 1_000_000;
  if (/\bmil\b/.test(normalizedText)) return numeric * 1_000;
  return numeric;
}

function extractRegexValue(content: string, pattern: RegExp) {
  const match = content.match(pattern);
  return match?.[1]?.trim() ?? null;
}

function extractInvestidor10CardValue(content: string, title: string) {
  return extractRegexValue(
    content,
    new RegExp(
      `<span[^>]*title=["']${title}["'][^>]*>[\\s\\S]*?<\\/span>[\\s\\S]*?<div[^>]*class=["'][^"']*_card-body[^"']*["'][^>]*>[\\s\\S]*?<span>\\s*([^<]+?)\\s*<\\/span>`,
      "i",
    ),
  );
}

function extractInvestidor10InfoValue(content: string, labelPattern: string) {
  return extractRegexValue(
    content,
    new RegExp(
      `<span[^>]*class=["'][^"']*name[^"']*["'][^>]*>[\\s\\S]*?${labelPattern}[\\s\\S]*?<\\/span>[\\s\\S]*?<div[^>]*class=["'][^"']*value[^"']*["'][^>]*>[\\s\\S]*?<span>\\s*([^<]+?)\\s*<\\/span>`,
      "i",
    ),
  );
}

function parseInvestidor10FiiFundamentals(content: string) {
  const dyText =
    extractInvestidor10CardValue(content, "Dividend Yield") ??
    extractRegexValue(content, /DY\s*\(12M\)\s*:\s*([0-9.,]+%)/i);
  const pvpText =
    extractInvestidor10CardValue(content, "P\/VP") ??
    extractRegexValue(content, /P\/VP\s*:\s*([0-9.,]+)/i);
  const sharesText =
    extractInvestidor10InfoValue(content, "COTAS\\s+EMITIDAS") ??
    extractRegexValue(
      content,
      /content--info--item--title[^>]*>\s*N[U\u00da]MERO DE COTAS\s*<\/span>[\s\S]*?content--info--item--value[^>]*>\s*([^<]+?)\s*<\/span>/i,
    );
  const bookValueText =
    extractInvestidor10InfoValue(content, "VALOR\\s+PATRIMONIAL") ??
    extractRegexValue(
      content,
      /content--info--item--title[^>]*>\s*VALOR PATRIMONIAL\s*<\/span>[\s\S]*?content--info--item--value[^>]*>\s*([^<]+?)\s*<\/span>/i,
    );
  const vacancyText = extractInvestidor10InfoValue(content, "VAC[\\u00c2A]NCIA");

  const parsed: Partial<Quote> = {};
  const dyValue = normalizePercentValue(dyText);
  const pvpValue = parseNumberish(pvpText);
  const sharesValue = parseNumberWithScale(sharesText);
  const bookValue = parseNumberWithScale(bookValueText);
  const vacancyValue = normalizePercentValue(vacancyText);

  if (dyValue != null) parsed.dyPct = dyValue;
  if (pvpValue != null) parsed.pVp = pvpValue;
  if (sharesValue != null) parsed.sharesOutstanding = sharesValue;
  if (bookValue != null) parsed.bookValue = bookValue;
  if (vacancyValue != null) parsed.vacancyPct = vacancyValue;

  return Object.keys(parsed).length ? parsed : null;
}

async function fetchTextWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFiiFundamentalsFallback(normalized: string) {
  if (investidor10FundamentalsCache.has(normalized)) {
    return investidor10FundamentalsCache.get(normalized) ?? null;
  }

  const target = `https://investidor10.com.br/fiis/${normalized.toLowerCase()}/`;
  for (const proxyPrefix of INVESTIDOR10_PROXY_PREFIXES) {
    const proxyUrl = `${proxyPrefix}${encodeURIComponent(target)}`;
    const html = await fetchTextWithTimeout(proxyUrl, 12000);
    if (!html) continue;
    const parsed = parseInvestidor10FiiFundamentals(html);
    if (parsed) {
      investidor10FundamentalsCache.set(normalized, parsed);
      return parsed;
    }
  }

  investidor10FundamentalsCache.set(normalized, null);
  return null;
}

function shouldUseFiiFallback(normalized: string, longName: unknown) {
  const companyName = typeof longName === "string" ? longName.toLowerCase() : "";
  return (
    companyName.includes("fundo de investimento imobiliario") ||
    companyName.includes("fii") ||
    /11$/.test(normalized)
  );
}

function handleBrapiFailure(
  status: number,
  normalizedSymbol?: string,
  usedToken?: boolean,
  code?: string,
  message?: string,
) {
  if (status === 400 && code?.toUpperCase() === "INVALID_RANGE") {
    const nextRange = pickSupportedBrapiRange(message);
    if (nextRange) {
      brapiHistoryRange = nextRange;
    } else if (brapiHistoryRange === "1y") {
      brapiHistoryRange = "3mo";
    }
    return;
  }
  if (
    (status === 400 || status === 404) &&
    normalizedSymbol &&
    isPermanentB3SymbolError(code, message)
  ) {
    badB3Symbols.add(normalizedSymbol);
    return;
  }
  if ((status === 401 || status === 403) && usedToken) {
    brapiUseToken = false;
    return;
  }
  if (status === 429 || status >= 500 || status === 0) {
    brapiBlockedUntil = Date.now() + BRAPI_BACKOFF_MS;
  }
}

async function fetchSingleB3Quote(
  normalized: string,
  options: { includeFundamentalsFallback?: boolean } = {},
): Promise<Quote | null> {
  if (isBrapiBlocked()) return null;
  if (!isLikelyB3Symbol(normalized) || badB3Symbols.has(normalized)) return null;
  const { includeFundamentalsFallback = true } = options;

  const requestQuote = async (useToken: boolean): Promise<Quote | null> => {
    const tokenParam = useToken && BRAPI_KEY ? `?token=${encodeURIComponent(BRAPI_KEY)}` : "";
    const res = await fetch(
      `https://brapi.dev/api/quote/${encodeURIComponent(normalized)}${tokenParam}`,
      { cache: "no-store", headers: BRAPI_DEFAULT_HEADERS },
    );
    if (!res.ok) {
      let errorCode: string | undefined;
      let errorMessage: string | undefined;
      try {
        const json = await res.json();
        const details = extractBrapiErrorDetails(json);
        errorCode = details.code;
        errorMessage = details.message;
      } catch {
        // ignore json parse for error body
      }
      handleBrapiFailure(res.status, normalized, useToken, errorCode, errorMessage);
      return null;
    }
    const json = await res.json();
    const item = (json?.results ?? []).find(
      (result: any) =>
        result?.symbol &&
        normalizeB3Symbol(String(result.symbol)) === normalized,
    );
    if (item?.regularMarketPrice == null) return null;
    const rawDy =
      item?.dividendYield ??
      item?.dividend_yield ??
      item?.regularMarketDividendYield ??
      item?.trailingAnnualDividendYield;
    const rawPvp =
      item?.priceToBook ??
      item?.priceToBookRatio ??
      item?.pvp;
    const rawSharesOutstanding =
      item?.sharesOutstanding ??
      item?.totalShares ??
      item?.shares;
    const rawBookValue =
      item?.bookValue ??
      item?.netWorth ??
      item?.patrimonialValue;
    const rawVacancy =
      item?.vacancy ??
      item?.vacancia ??
      item?.vacancyRate;
    const quote: Quote = {
      price: Number(item.regularMarketPrice) || 0,
      changePct:
        item.regularMarketChangePercent != null
          ? Number(item.regularMarketChangePercent)
          : null,
      logoUrl:
        typeof item?.logourl === "string"
          ? item.logourl
          : typeof item?.logoUrl === "string"
            ? item.logoUrl
            : typeof item?.logo === "string"
              ? item.logo
              : null,
      assetName:
        typeof item?.longName === "string"
          ? item.longName
          : typeof item?.shortName === "string"
            ? item.shortName
            : null,
      dyPct: normalizePercentValue(rawDy),
      pVp: parseNumberish(rawPvp),
      sharesOutstanding: parseNumberish(rawSharesOutstanding),
      bookValue: parseNumberish(rawBookValue),
      vacancyPct: normalizePercentValue(rawVacancy),
    };

    const hasMissingFundamentals =
      quote.dyPct == null ||
      quote.pVp == null ||
      quote.sharesOutstanding == null ||
      quote.bookValue == null ||
      quote.vacancyPct == null;

    if (
      includeFundamentalsFallback &&
      hasMissingFundamentals &&
      shouldUseFiiFallback(normalized, item?.longName)
    ) {
      const fallback = await fetchFiiFundamentalsFallback(normalized);
      if (fallback) {
        quote.dyPct = quote.dyPct ?? fallback.dyPct ?? null;
        quote.pVp = quote.pVp ?? fallback.pVp ?? null;
        quote.sharesOutstanding =
          quote.sharesOutstanding ?? fallback.sharesOutstanding ?? null;
        quote.bookValue = quote.bookValue ?? fallback.bookValue ?? null;
        quote.vacancyPct = quote.vacancyPct ?? fallback.vacancyPct ?? null;
      }
    }

    return quote;
  };

  try {
    const useToken = brapiUseToken && Boolean(BRAPI_KEY);
    const withPreferredMode = await requestQuote(useToken);
    if (withPreferredMode) {
      return withPreferredMode;
    }
    if (useToken && !isBrapiBlocked()) {
      return await requestQuote(false);
    }
    return null;
  } catch {
    handleBrapiFailure(0, normalized, brapiUseToken && Boolean(BRAPI_KEY));
    return null;
  }
}

async function fetchB3History(symbol: string): Promise<PricePoint[]> {
  const normalized = normalizeB3Symbol(symbol);
  if (isBrapiBlocked()) return [];
  if (!isLikelyB3Symbol(normalized) || badB3Symbols.has(normalized)) return [];

  const requestHistory = async (
    useToken: boolean,
    range: string,
  ): Promise<{ points: PricePoint[]; invalidRange: boolean }> => {
    const query = new URLSearchParams({
      range,
      interval: "1d",
    });
    if (useToken && BRAPI_KEY) {
      query.set("token", BRAPI_KEY);
    }
    const res = await fetch(
      `https://brapi.dev/api/quote/${encodeURIComponent(
        normalized,
      )}?${query.toString()}`,
      { cache: "no-store", headers: BRAPI_DEFAULT_HEADERS },
    );
    if (!res.ok) {
      let errorCode: string | undefined;
      let errorMessage: string | undefined;
      try {
        const json = await res.json();
        const details = extractBrapiErrorDetails(json);
        errorCode = details.code;
        errorMessage = details.message;
      } catch {
        // ignore json parse for error body
      }
      handleBrapiFailure(res.status, normalized, useToken, errorCode, errorMessage);
      return {
        points: [],
        invalidRange: res.status === 400 && errorCode?.toUpperCase() === "INVALID_RANGE",
      };
    }
    const json = await res.json();
    const item = (json?.results ?? []).find(
      (result: any) =>
        result?.symbol &&
        normalizeB3Symbol(String(result.symbol)) === normalized,
    );
    const history =
      item?.historicalDataPrice ?? item?.historicalData ?? item?.prices ?? [];
    const points = history
      .map((entry: any) => {
        const rawDate =
          entry?.date ?? entry?.timestamp ?? entry?.time ?? entry?.datetime;
        let time = 0;
        if (typeof rawDate === "number") {
          time = rawDate > 1e12 ? rawDate : rawDate * 1000;
        } else if (typeof rawDate === "string") {
          const parsed = Date.parse(rawDate);
          if (!Number.isNaN(parsed)) {
            time = parsed;
          }
        }
        const price = Number(
          entry?.close ??
            entry?.adjustedClose ??
            entry?.price ??
            entry?.value ??
            0,
        );
        if (!time || !price) return null;
        return { time, price };
      })
      .filter(Boolean) as PricePoint[];
    return { points: points.length ? toPoints(points) : [], invalidRange: false };
  };

  try {
    const useToken = brapiUseToken && Boolean(BRAPI_KEY);
    let historyRange = brapiHistoryRange;
    let withPreferredMode = await requestHistory(useToken, historyRange);
    if (!withPreferredMode.points.length && withPreferredMode.invalidRange && !isBrapiBlocked()) {
      historyRange = brapiHistoryRange;
      withPreferredMode = await requestHistory(useToken, historyRange);
    }
    if (withPreferredMode.points.length) {
      return withPreferredMode.points;
    }
    if (useToken && !isBrapiBlocked()) {
      let withoutToken = await requestHistory(false, historyRange);
      if (!withoutToken.points.length && withoutToken.invalidRange && !isBrapiBlocked()) {
        historyRange = brapiHistoryRange;
        withoutToken = await requestHistory(false, historyRange);
      }
      if (withoutToken.points.length) return withoutToken.points;
    }
  } catch {
    handleBrapiFailure(0, normalized, brapiUseToken && Boolean(BRAPI_KEY));
  }
  return [];
}

async function fetchCryptoHistory(symbol: string): Promise<PricePoint[]> {
  const id = normalizeCryptoId(symbol);

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(
        id,
      )}/market_chart?vs_currency=brl&days=365`,
      { cache: "no-store" },
    );

    if (!res.ok) return [];
    const json = await res.json();
    const prices = json?.prices ?? [];
    const points = prices.map((entry: [number, number]) => ({
      time: Number(entry[0]),
      price: Number(entry[1]),
    }));
    return points.length ? toPoints(points) : [];
  } catch (err) {
    console.error(err);
    return [];
  }
}

function normalizeB3Symbol(value: string) {
  return value.toUpperCase().replace(/\s+/g, "").replace(B3_SUFFIX, "");
}

function normalizeCryptoId(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, "");
}

async function fetchCryptoMarketSnapshot(id: string): Promise<CryptoMarketSnapshot | null> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=brl&ids=${encodeURIComponent(
        id,
      )}&price_change_percentage=24h`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const first = Array.isArray(json) ? json[0] : null;
    if (!first || first.current_price == null) return null;
    return {
      id: String(first.id ?? id),
      symbol: String(first.symbol ?? ""),
      name: String(first.name ?? id),
      image: typeof first.image === "string" ? first.image : null,
      rank:
        first.market_cap_rank != null && Number.isFinite(Number(first.market_cap_rank))
          ? Number(first.market_cap_rank)
          : null,
      price: Number(first.current_price) || 0,
      changePct24h:
        first.price_change_percentage_24h != null
          ? Number(first.price_change_percentage_24h)
          : null,
      marketCap:
        first.market_cap != null && Number.isFinite(Number(first.market_cap))
          ? Number(first.market_cap)
          : null,
      volume24h:
        first.total_volume != null && Number.isFinite(Number(first.total_volume))
          ? Number(first.total_volume)
          : null,
      high24h:
        first.high_24h != null && Number.isFinite(Number(first.high_24h))
          ? Number(first.high_24h)
          : null,
      low24h:
        first.low_24h != null && Number.isFinite(Number(first.low_24h))
          ? Number(first.low_24h)
          : null,
    };
  } catch (error) {
    return null;
  }
}

async function fetchFeaturedCryptoOptions(ids = FEATURED_CRYPTO_IDS) {
  const normalizedIds = ids.map((id) => normalizeCryptoId(id)).filter(Boolean);
  if (!normalizedIds.length) return [];
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=brl&ids=${encodeURIComponent(
        normalizedIds.join(","),
      )}&price_change_percentage=24h`,
      { cache: "no-store" },
    );
    if (!res.ok) return [];
    const json = await res.json();
    const entries = (Array.isArray(json) ? json : [])
      .map((item: any) => {
        if (!item || item.current_price == null || !item.id) return null;
        return {
          id: String(item.id),
          symbol: String(item.symbol ?? ""),
          name: String(item.name ?? item.id),
          image: typeof item.image === "string" ? item.image : null,
          rank:
            item.market_cap_rank != null && Number.isFinite(Number(item.market_cap_rank))
              ? Number(item.market_cap_rank)
              : null,
          price: Number(item.current_price) || 0,
          changePct24h:
            item.price_change_percentage_24h != null
              ? Number(item.price_change_percentage_24h)
              : null,
          marketCap:
            item.market_cap != null && Number.isFinite(Number(item.market_cap))
              ? Number(item.market_cap)
              : null,
          volume24h:
            item.total_volume != null && Number.isFinite(Number(item.total_volume))
              ? Number(item.total_volume)
              : null,
          high24h:
            item.high_24h != null && Number.isFinite(Number(item.high_24h))
              ? Number(item.high_24h)
              : null,
          low24h:
            item.low_24h != null && Number.isFinite(Number(item.low_24h))
              ? Number(item.low_24h)
              : null,
        } satisfies CryptoMarketSnapshot;
      })
      .filter((entry): entry is CryptoMarketSnapshot => entry != null);
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    return normalizedIds
      .map((id) => byId.get(id))
      .filter((entry): entry is CryptoMarketSnapshot => Boolean(entry));
  } catch (error) {
    return [];
  }
}

function normalizeSymbol(type: "b3" | "crypto", value: string) {
  return type === "b3" ? normalizeB3Symbol(value) : normalizeCryptoId(value);
}

function getAssetQuoteKey(asset: Investment) {
  return asset.type === "b3"
    ? normalizeB3Symbol(asset.symbol)
    : normalizeCryptoId(asset.symbol);
}

function getQuantityDecimals(type: "b3" | "crypto") {
  return type === "crypto" ? 8 : 0;
}

function normalizeCategoryText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getAssetDisplayName(asset: Investment) {
  return (asset.name?.trim() || asset.symbol || "").toUpperCase();
}

function getInvestmentCategory(asset: Investment): InvestmentCategory {
  if (asset.type === "crypto") return "crypto";

  const symbol = normalizeB3Symbol(asset.symbol);
  const normalizedName = normalizeCategoryText(asset.name);
  const isBdrByName = normalizedName.includes("bdr");
  const isEtfByName =
    normalizedName.includes("etf") ||
    normalizedName.includes("fundo de indice") ||
    normalizedName.includes("fundo indice") ||
    normalizedName.includes("index fund");
  const isFiiByName =
    normalizedName.includes("fii") || normalizedName.includes("fundo imobili");

  if (isBdrByName || /34$/.test(symbol)) return "bdr";
  if (isEtfByName) return "etf";
  if (isFiiByName || /11$/.test(symbol)) return "fii";
  if (/^[A-Z]{4}\d{1,2}$/.test(symbol)) return "stock";
  return "other";
}

function formatCurrency(value: number, language: "pt" | "en") {
  return new Intl.NumberFormat(language === "pt" ? "pt-BR" : "en-US", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatShortDate(value: string, language: "pt" | "en") {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(language === "pt" ? "pt-BR" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

function formatChartDate(value: number, language: "pt" | "en") {
  return new Intl.DateTimeFormat(language === "pt" ? "pt-BR" : "en-US", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

function formatAxisCurrency(value: number, language: "pt" | "en") {
  return new Intl.NumberFormat(language === "pt" ? "pt-BR" : "en-US", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number, language: "pt" | "en") {
  const formatter = new Intl.NumberFormat(language === "pt" ? "pt-BR" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${value >= 0 ? "+" : ""}${formatter.format(value)}%`;
}

function formatPlainPercent(value: number, language: "pt" | "en") {
  const formatter = new Intl.NumberFormat(language === "pt" ? "pt-BR" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatter.format(value)}%`;
}

function parseFilterThreshold(value: string) {
  const cleaned = value.trim().replace(",", ".");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function getMetricValue(
  quote: Quote | null | undefined,
  key: InvestmentMetricKey,
) {
  if (!quote) return null;
  const value = quote[key];
  return value != null && Number.isFinite(value) ? value : null;
}

function isMetricAboveLimit(
  quote: Quote | null | undefined,
  settings: InvestmentFilterSettings,
  key: InvestmentMetricKey,
) {
  if (!settings.enabled) return false;
  const metricValue = getMetricValue(quote, key);
  if (metricValue == null) return false;
  const threshold = parseFilterThreshold(settings.limits[key]);
  if (threshold == null) return false;
  return metricValue > threshold;
}

function getExceededMetrics(
  quote: Quote | null | undefined,
  settings: InvestmentFilterSettings,
): InvestmentMetricKey[] {
  if (!settings.enabled) return [];
  const metricKeys: InvestmentMetricKey[] = [
    "dyPct",
    "pVp",
    "sharesOutstanding",
    "bookValue",
    "vacancyPct",
  ];
  return metricKeys.filter((key) => isMetricAboveLimit(quote, settings, key));
}

function formatCompactNumber(value: number, language: "pt" | "en") {
  return new Intl.NumberFormat(language === "pt" ? "pt-BR" : "en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function buildChartSummary(history: PricePoint[]) {
  if (!history.length) {
    return { current: null, changePct: null };
  }
  const first = history[0]?.price ?? null;
  const last = history[history.length - 1]?.price ?? null;
  if (!first || !last) {
    return { current: null, changePct: null };
  }
  const changePct = ((last - first) / first) * 100;
  return { current: last, changePct };
}

function getLatestPrice(history: PricePoint[]) {
  if (!history.length) return null;
  const last = history[history.length - 1]?.price ?? null;
  return last ?? null;
}

function parseBig(value: string) {
  const cleaned = value.replace(/\s+/g, "").replace(",", ".");
  if (!cleaned) return null;
  try {
    const parsed = new Big(cleaned);
    if (!parsed.c || parsed.lte(0)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function InvestmentsScreen() {
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const openNewKey = searchParams.get("new") ?? undefined;
  const [assets, setAssets] = useState<Investment[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [priceHistory, setPriceHistory] = useState<Record<string, PricePoint[]>>(
    {},
  );
  const historyFetchRef = useRef(0);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [selectedAsset, setSelectedAsset] = useState<Investment | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isCreate, setIsCreate] = useState(false);
  const [activePurchases, setActivePurchases] = useState<Purchase[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [purchasesError, setPurchasesError] = useState<string | null>(null);

  const [type, setType] = useState<"b3" | "crypto">("b3");
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"quantity" | "value">("quantity");
  const [quantity, setQuantity] = useState("");
  const [investedValue, setInvestedValue] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [date, setDate] = useState(toDateString(new Date()));
  const [previewQuote, setPreviewQuote] = useState<Quote | null>(null);
  const previewFetchRef = useRef<number>(0);
  const previewKeyRef = useRef<string>("");
  const previewRequestRef = useRef(0);
  const [selectedCrypto, setSelectedCrypto] = useState<CryptoSearchItem | null>(null);
  const [cryptoMarket, setCryptoMarket] = useState<CryptoMarketSnapshot | null>(null);
  const [featuredCryptoOptions, setFeaturedCryptoOptions] = useState<CryptoMarketSnapshot[]>([]);
  const [featuredCryptoLoading, setFeaturedCryptoLoading] = useState(false);
  const [cryptoPickerOpen, setCryptoPickerOpen] = useState(false);
  const featuredCryptoOptionsRef = useRef<CryptoMarketSnapshot[]>([]);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editSymbol, setEditSymbol] = useState("");
  const [editName, setEditName] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [organizeBy, setOrganizeBy] = useState<InvestmentOrganizer>("alphabetical");
  const [investmentFilter, setInvestmentFilter] = useState<InvestmentFilterSettings>(
    DEFAULT_INVESTMENT_FILTER,
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const filterStorageKey = user?.id
    ? `${INVESTMENT_FILTER_STORAGE_PREFIX}:${user.id}`
    : null;

  const loadAssets = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("investments")
      .select("id,type,symbol,name,quantity,average_price")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setAssets([]);
    } else {
      setAssets((data ?? []) as Investment[]);
    }
  }, [user]);

  const fetchHistoryForAsset = useCallback(
    async (asset: Investment) => {
      try {
        return asset.type === "b3"
          ? await fetchB3History(asset.symbol)
          : await fetchCryptoHistory(asset.symbol);
      } catch (err) {
        console.error(err);
        return [];
      }
    },
    [],
  );

  useEffect(() => {
    async function init() {
      await loadAssets();
    }
    void init();
  }, [loadAssets]);

  useEffect(() => {
    if (!filterStorageKey || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(filterStorageKey);
      if (!raw) {
        setInvestmentFilter(DEFAULT_INVESTMENT_FILTER);
        return;
      }
      const parsed = JSON.parse(raw) as any;
      const hasLimitsObject =
        parsed && typeof parsed === "object" && parsed.limits && typeof parsed.limits === "object";

      if (hasLimitsObject) {
        setInvestmentFilter({
          enabled:
            typeof parsed.enabled === "boolean"
              ? parsed.enabled
              : DEFAULT_INVESTMENT_FILTER.enabled,
          showOnlyAbove:
            typeof parsed.showOnlyAbove === "boolean"
              ? parsed.showOnlyAbove
              : DEFAULT_INVESTMENT_FILTER.showOnlyAbove,
          limits: {
            dyPct:
              typeof parsed.limits.dyPct === "string"
                ? parsed.limits.dyPct
                : DEFAULT_INVESTMENT_FILTER.limits.dyPct,
            pVp:
              typeof parsed.limits.pVp === "string"
                ? parsed.limits.pVp
                : DEFAULT_INVESTMENT_FILTER.limits.pVp,
            sharesOutstanding:
              typeof parsed.limits.sharesOutstanding === "string"
                ? parsed.limits.sharesOutstanding
                : DEFAULT_INVESTMENT_FILTER.limits.sharesOutstanding,
            bookValue:
              typeof parsed.limits.bookValue === "string"
                ? parsed.limits.bookValue
                : DEFAULT_INVESTMENT_FILTER.limits.bookValue,
            vacancyPct:
              typeof parsed.limits.vacancyPct === "string"
                ? parsed.limits.vacancyPct
                : DEFAULT_INVESTMENT_FILTER.limits.vacancyPct,
          },
        });
      } else {
        // Migrate old DY-only filter shape
        setInvestmentFilter({
          ...DEFAULT_INVESTMENT_FILTER,
          enabled:
            typeof parsed?.enabled === "boolean"
              ? parsed.enabled
              : DEFAULT_INVESTMENT_FILTER.enabled,
          showOnlyAbove: parsed?.view === "bad",
          limits: {
            ...DEFAULT_INVESTMENT_FILTER.limits,
            dyPct:
              typeof parsed?.threshold === "string"
                ? parsed.threshold
                : DEFAULT_INVESTMENT_FILTER.limits.dyPct,
          },
        });
      }
    } catch {
      setInvestmentFilter(DEFAULT_INVESTMENT_FILTER);
    }
  }, [filterStorageKey]);

  useEffect(() => {
    if (!filterStorageKey || typeof window === "undefined") return;
    window.localStorage.setItem(filterStorageKey, JSON.stringify(investmentFilter));
  }, [filterStorageKey, investmentFilter]);

  const fetchQuotes = useCallback(async () => {
    if (!assets.length) return;
    setQuoteError(null);

    const b3Symbols = Array.from(new Set(assets
      .filter((asset) => asset.type === "b3")
      .map((asset) => normalizeB3Symbol(asset.symbol))
      .filter((symbol) => isLikelyB3Symbol(symbol) && !badB3Symbols.has(symbol))));
    const cryptoIds = Array.from(new Set(assets
      .filter((asset) => asset.type === "crypto")
      .map((asset) => normalizeCryptoId(asset.symbol))
      .filter((id) => isLikelyCryptoId(id))));

    const nextQuotes: Record<string, Quote> = {};
    let hadFailures = false;

    if (b3Symbols.length) {
      if (isBrapiBlocked()) {
        hadFailures = true;
      } else {
        const [firstSymbol, ...restSymbols] = b3Symbols;
        const firstQuote = await fetchSingleB3Quote(firstSymbol);
        if (firstQuote) {
          nextQuotes[firstSymbol] = firstQuote;
        }
        if (!isBrapiBlocked() && restSymbols.length) {
          const responses = await Promise.all(
            restSymbols.map(async (normalized) => {
              const quote = await fetchSingleB3Quote(normalized);
              return { normalized, quote };
            }),
          );
          responses.forEach(({ normalized, quote }) => {
            if (!quote) return;
            nextQuotes[normalized] = quote;
          });
        }
        const hasAtLeastOneB3Quote = b3Symbols.some((symbol) => nextQuotes[symbol]);
        if (!hasAtLeastOneB3Quote) {
          hadFailures = true;
        }
      }
    }

    if (cryptoIds.length) {
      try {
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoIds.join(
          ",",
        )}&vs_currencies=brl&include_24hr_change=true`;
        const res = await fetch(url);
        if (!res.ok) {
          hadFailures = true;
          setQuotes(nextQuotes);
          setQuoteError(t("investments.quoteError"));
          return;
        }
        const json = await res.json();
        cryptoIds.forEach((id) => {
          const entry = json?.[id];
          if (!entry?.brl) return;
          nextQuotes[id] = {
            price: Number(entry.brl) || 0,
            changePct:
            entry?.brl_24h_change != null
                ? Number(entry.brl_24h_change)
                : null,
          };
        });
      } catch {
        hadFailures = true;
      }
    }

    setQuotes(nextQuotes);
    if (hadFailures) {
      setQuoteError(t("investments.quoteError"));
    }
  }, [assets, t]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      if (!assets.length) {
        setPriceHistory({});
        return;
      }
      const requestId = Date.now();
      historyFetchRef.current = requestId;
      const entries: Array<readonly [string, PricePoint[]]> = [];
      for (const asset of assets) {
        if (asset.type === "b3" && isBrapiBlocked()) {
          entries.push([asset.id, []]);
          continue;
        }
        const history = await fetchHistoryForAsset(asset);
        entries.push([asset.id, history]);
      }
      if (cancelled) return;
      if (historyFetchRef.current !== requestId) return;
      const next: Record<string, PricePoint[]> = {};
      entries.forEach(([id, history]) => {
        next[id] = history;
      });
      setPriceHistory(next);
    }
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [assets, fetchHistoryForAsset]);

  const activeAsset = selectedAsset;
  const currentAvg = activeAsset ? new Big(activeAsset.average_price || 0) : new Big(0);
  const currentQty = activeAsset ? new Big(activeAsset.quantity || 0) : new Big(0);
  const previewPriceBig =
    previewQuote?.price != null ? new Big(previewQuote.price) : null;
  const manualPriceValue = parseCentsInput(manualPrice);
  const manualPriceBig = manualPriceValue > 0 ? new Big(manualPriceValue) : null;
  const priceBig = manualPriceBig ?? previewPriceBig;
  const quantityBig = parseBig(quantity);
  const investedCents = parseCentsInput(investedValue);
  const investedBig = investedCents > 0 ? new Big(investedCents) : null;
  const decimals = getQuantityDecimals(type);

  const computed = useMemo(() => {
    if (!priceBig) {
      return { qty: new Big(0), total: new Big(0), newAvg: currentAvg };
    }
    if (mode === "quantity") {
      if (!quantityBig) {
        return { qty: new Big(0), total: new Big(0), newAvg: currentAvg };
      }
      const total = computeTotal(quantityBig, priceBig);
      const newAvg = computeNewAveragePrice(
        currentQty,
        currentAvg,
        quantityBig,
        priceBig,
      );
      return { qty: quantityBig, total, newAvg };
    }
    if (!investedBig) {
      return { qty: new Big(0), total: new Big(0), newAvg: currentAvg };
    }
    const { quantity: qty, total } = computeQuantityFromValue(
      investedBig,
      priceBig,
      decimals,
    );
    const newAvg = computeNewAveragePrice(
      currentQty,
      currentAvg,
      qty,
      priceBig,
    );
    return { qty, total, newAvg };
  }, [priceBig, quantityBig, investedBig, mode, currentAvg, currentQty, decimals]);

  const preview = previewQuote;
  const displayPrice = manualPriceBig
    ? Number(manualPriceBig.toString())
    : preview?.price ?? null;

  useEffect(() => {
    if (!showModal || !isCreate) return;
    const trimmedSymbol = symbol.trim();
    if (!trimmedSymbol || trimmedSymbol.length < 2) {
      setPreviewQuote(null);
      setSelectedCrypto(null);
      setCryptoMarket(null);
      previewKeyRef.current = "";
      return;
    }
    const previewKey = `${type}:${normalizeSymbol(type, trimmedSymbol)}`;
    if (previewKeyRef.current !== previewKey) {
      previewKeyRef.current = previewKey;
      previewFetchRef.current = 0;
      setPreviewQuote(null);
      if (type === "crypto") {
        setCryptoMarket(null);
      }
    }
    const now = Date.now();
    if (now - previewFetchRef.current < 1200) return;
    previewFetchRef.current = now;
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;

    async function fetchPreview() {
      try {
        if (type === "b3") {
          setSelectedCrypto(null);
          setCryptoMarket(null);
          const sym = normalizeB3Symbol(trimmedSymbol);
          const quote = await fetchSingleB3Quote(sym, {
            includeFundamentalsFallback: false,
          });
          if (previewRequestRef.current !== requestId) return;
          setPreviewQuote(quote);
          if (quote?.assetName) {
            setName((current) => (current.trim() ? current : quote.assetName ?? current));
          }
          return;
        }

        const id = normalizeCryptoId(trimmedSymbol);
        if (!id) {
          setSelectedCrypto(null);
          setCryptoMarket(null);
          setPreviewQuote(null);
          return;
        }
        const cachedFeatured = featuredCryptoOptionsRef.current.find((item) => item.id === id);
        if (cachedFeatured) {
          setSelectedCrypto({
            id: cachedFeatured.id,
            symbol: cachedFeatured.symbol,
            name: cachedFeatured.name,
            thumb: cachedFeatured.image,
            rank: cachedFeatured.rank,
          });
          setCryptoMarket(cachedFeatured);
          setPreviewQuote({
            price: cachedFeatured.price,
            changePct: cachedFeatured.changePct24h,
          });
          setName((current) => (current.trim() ? current : cachedFeatured.name));
          return;
        }
        const snapshot = await fetchCryptoMarketSnapshot(id);
        if (previewRequestRef.current !== requestId) return;
        if (!snapshot) {
          setCryptoMarket(null);
          setPreviewQuote(null);
          return;
        }
        setSelectedCrypto({
          id: snapshot.id,
          symbol: snapshot.symbol,
          name: snapshot.name,
          thumb: snapshot.image,
          rank: snapshot.rank,
        });
        setCryptoMarket(snapshot);
        setPreviewQuote({
          price: snapshot.price,
          changePct: snapshot.changePct24h,
        });
        setName((current) => (current.trim() ? current : snapshot.name));
      } catch {
        setPreviewQuote(null);
        if (type === "crypto") {
          setCryptoMarket(null);
        }
      }
    }

    void fetchPreview();
  }, [showModal, isCreate, symbol, type]);

  useEffect(() => {
    featuredCryptoOptionsRef.current = featuredCryptoOptions;
  }, [featuredCryptoOptions]);

  useEffect(() => {
    if (!showModal || !isCreate || type !== "crypto" || featuredCryptoOptions.length) return;
    let cancelled = false;
    async function loadFeaturedCryptos() {
      setFeaturedCryptoLoading(true);
      const options = await fetchFeaturedCryptoOptions();
      if (cancelled) return;
      setFeaturedCryptoOptions(options);
      setFeaturedCryptoLoading(false);
      if (!options.length) return;

      const normalizedSymbol = normalizeCryptoId(symbol);
      const currentOption =
        options.find((item) => item.id === normalizedSymbol) ?? options[0];
      setSymbol(currentOption.id);
      setSelectedCrypto({
        id: currentOption.id,
        symbol: currentOption.symbol,
        name: currentOption.name,
        thumb: currentOption.image,
        rank: currentOption.rank,
      });
      setCryptoMarket(currentOption);
      setPreviewQuote({
        price: currentOption.price,
        changePct: currentOption.changePct24h,
      });
      setName((current) => (current.trim() ? current : currentOption.name));
    }
    void loadFeaturedCryptos();
    return () => {
      cancelled = true;
    };
  }, [showModal, isCreate, type, symbol, featuredCryptoOptions.length]);

  async function handleRemove(id: string) {
    if (!user) return;
    const { error } = await supabase
      .from("investments")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) {
      console.error(error);
      setErrorMsg(t("investments.removeError"));
      return;
    }
    await loadAssets();
  }

  async function handleUpdateAsset() {
    if (!user || !selectedAsset) return;
    const nextSymbol = editSymbol.trim();
    const nextName = editName.trim();
    if (!nextSymbol) {
      setErrorMsg(t("investments.symbolHint"));
      return;
    }
    setEditSaving(true);
    setErrorMsg(null);
    const { error } = await supabase
      .from("investments")
      .update({
        symbol: nextSymbol,
        name: nextName || null,
      })
      .eq("id", selectedAsset.id)
      .eq("user_id", user.id);
    if (error) {
      console.error(error);
      setEditSaving(false);
      setErrorMsg(t("investments.saveError"));
      return;
    }
    setEditSaving(false);
    setShowModal(false);
    await loadAssets();
  }

  const openCreate = useCallback(() => {
    setIsCreate(true);
    setSelectedAsset(null);
    setShowModal(true);
    setType("b3");
    setSymbol("");
    setName("");
    setMode("quantity");
    setQuantity("");
    setInvestedValue("");
    setManualPrice("");
    setDate(toDateString(new Date()));
    setPreviewQuote(null);
    setSelectedCrypto(null);
    setCryptoMarket(null);
    setFeaturedCryptoOptions([]);
    setFeaturedCryptoLoading(false);
    setCryptoPickerOpen(false);
    setErrorMsg(null);
  }, []);

  useEffect(() => {
    if (!openNewKey) return;
    openCreate();
  }, [openNewKey, openCreate]);

  function openDetails(asset: Investment) {
    setIsCreate(false);
    setSelectedAsset(asset);
    setShowModal(true);
    setErrorMsg(null);
    setEditSymbol(asset.symbol ?? "");
    setEditName(asset.name ?? "");
  }

  useEffect(() => {
    if (!selectedAsset || !user) {
      setActivePurchases([]);
      setPurchasesError(null);
      return;
    }
    const activeUser = user;
    const activeAsset = selectedAsset;
    let cancelled = false;
    async function loadPurchases() {
      setPurchasesLoading(true);
      setPurchasesError(null);
      const { data, error } = await supabase
        .from("investment_purchases")
        .select(
          "id,date,price_per_share,quantity,total_invested,mode_used,input_value",
        )
        .eq("user_id", activeUser.id)
        .eq("asset_id", activeAsset.id)
        .order("date", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error(error);
        setPurchasesError(t("investments.saveError"));
        setActivePurchases([]);
      } else {
        setActivePurchases((data ?? []) as Purchase[]);
      }
      setPurchasesLoading(false);
    }
    loadPurchases();
    return () => {
      cancelled = true;
    };
  }, [selectedAsset, user, t]);


  async function handleSave() {
    if (!user) return;
    setErrorMsg(null);
    if (!symbol.trim()) {
      setErrorMsg(
        type === "crypto"
          ? language === "pt"
            ? "Selecione uma cripto da lista."
            : "Select a crypto from the list."
          : t("investments.addError"),
      );
      return;
    }
    if (!priceBig) {
      setErrorMsg(t("investments.priceRequired"));
      return;
    }
    if (mode === "quantity" && !quantityBig) {
      setErrorMsg(t("investments.quantityRequired"));
      return;
    }
    if (mode === "value" && !investedBig) {
      setErrorMsg(t("investments.valueRequired"));
      return;
    }
    if (mode === "value" && computed.qty.lte(0)) {
      setErrorMsg(t("investments.insufficientValue"));
      return;
    }
    if (computed.qty.lte(0)) {
      setErrorMsg(t("investments.addError"));
      return;
    }

    setSaving(true);

    let normalized = normalizeSymbol(type, symbol);
    let persistedName = name.trim() ? name.trim() : null;
    if (type === "crypto") {
      const normalizedSymbol = normalizeCryptoId(symbol);
      let resolved = selectedCrypto;
      if (!resolved && normalizedSymbol) {
        const matched = featuredCryptoOptions.find((item) => item.id === normalizedSymbol);
        if (matched) {
          resolved = {
            id: matched.id,
            symbol: matched.symbol,
            name: matched.name,
            thumb: matched.image,
            rank: matched.rank,
          };
        }
      }
      if (!resolved) {
        setSaving(false);
        setErrorMsg(
          language === "pt"
            ? "Selecione uma cripto da lista."
            : "Select a crypto from the list.",
        );
        return;
      }
      normalized = normalizeCryptoId(resolved.id);
      if (!persistedName) {
        persistedName = resolved.name;
      }
      setSelectedCrypto(resolved);
    }

    const existing = assets.find(
      (asset) =>
        asset.type === type &&
        normalizeSymbol(asset.type, asset.symbol) === normalized,
    );

    const nextAvg = computed.newAvg;
    const nextQty = existing
      ? new Big(existing.quantity).plus(computed.qty)
      : computed.qty;

    let assetId = existing?.id;

    if (existing) {
      const { error } = await supabase
        .from("investments")
        .update({
          quantity: nextQty.toString(),
          average_price: nextAvg.toString(),
        })
        .eq("id", existing.id);
      if (error) {
        console.error(error);
        setSaving(false);
        setErrorMsg(t("investments.saveError"));
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("investments")
        .insert([
          {
            user_id: user.id,
            type,
            symbol: normalized,
            name: persistedName,
            quantity: nextQty.toString(),
            average_price: nextAvg.toString(),
            currency: "BRL",
          },
        ])
        .select("id")
        .maybeSingle();
      if (error || !data) {
        console.error(error);
        setSaving(false);
        setErrorMsg(t("investments.saveError"));
        return;
      }
      assetId = data.id;
    }

    const { error: purchaseError } = await supabase
      .from("investment_purchases")
      .insert([
        {
          user_id: user.id,
          asset_id: assetId,
          date,
          price_per_share: priceBig.toString(),
          quantity: computed.qty.toString(),
          total_invested: computed.total.toString(),
          mode_used: mode,
          input_value: mode === "value" ? investedBig?.toString() : null,
        },
      ]);

    if (purchaseError) {
      console.error(purchaseError);
      setSaving(false);
      setErrorMsg(t("investments.saveError"));
      return;
    }

    setSaving(false);
    setShowModal(false);
    await loadAssets();
  }

  const exceededMetricsByAssetId = useMemo(() => {
    const next: Record<string, InvestmentMetricKey[]> = {};
    assets.forEach((asset) => {
      const key = getAssetQuoteKey(asset);
      next[asset.id] = getExceededMetrics(quotes[key], investmentFilter);
    });
    return next;
  }, [assets, quotes, investmentFilter]);

  const assetsAboveLimit = useMemo(
    () => assets.filter((asset) => (exceededMetricsByAssetId[asset.id] ?? []).length > 0),
    [assets, exceededMetricsByAssetId],
  );

  const filteredAssets = useMemo(() => {
    if (!investmentFilter.enabled || !investmentFilter.showOnlyAbove) return assets;
    return assetsAboveLimit;
  }, [assets, assetsAboveLimit, investmentFilter.enabled, investmentFilter.showOnlyAbove]);

  const categoryLabelByKey = useMemo<Record<InvestmentCategory, string>>(
    () => ({
      fii: t("investments.categoryFii"),
      etf: t("investments.categoryEtf"),
      stock: t("investments.categoryStock"),
      bdr: t("investments.categoryBdr"),
      crypto: t("investments.categoryCrypto"),
      other: t("investments.categoryOther"),
    }),
    [t],
  );

  const organizedAssets = useMemo(() => {
    const collator = new Intl.Collator(language === "pt" ? "pt-BR" : "en-US", {
      numeric: true,
      sensitivity: "base",
    });
    const next = [...filteredAssets];
    next.sort((a, b) => {
      if (organizeBy === "category") {
        const categoryCompare = collator.compare(
          categoryLabelByKey[getInvestmentCategory(a)],
          categoryLabelByKey[getInvestmentCategory(b)],
        );
        if (categoryCompare !== 0) return categoryCompare;
      }
      const nameCompare = collator.compare(getAssetDisplayName(a), getAssetDisplayName(b));
      if (nameCompare !== 0) return nameCompare;
      return collator.compare(a.symbol, b.symbol);
    });
    return next;
  }, [categoryLabelByKey, filteredAssets, language, organizeBy]);

  const metricConfig = useMemo(
    () => [
      { key: "dyPct" as const, label: t("investments.metricDy"), isPercent: true },
      { key: "pVp" as const, label: t("investments.metricPvp"), isPercent: false },
      { key: "sharesOutstanding" as const, label: t("investments.metricShares"), isPercent: false },
      { key: "bookValue" as const, label: t("investments.metricBookValue"), isPercent: false },
      { key: "vacancyPct" as const, label: t("investments.metricVacancy"), isPercent: true },
    ],
    [t],
  );

  const metricLabelByKey = useMemo(() => {
    const map: Record<InvestmentMetricKey, string> = {
      dyPct: "",
      pVp: "",
      sharesOutstanding: "",
      bookValue: "",
      vacancyPct: "",
    };
    metricConfig.forEach((metric) => {
      map[metric.key] = metric.label;
    });
    return map;
  }, [metricConfig]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#7F8694]">
            {t("investments.title")}
          </p>
          <p className="text-xl font-semibold text-[#E5E8EF]">
            {t("investments.title")}
          </p>
          <p className="text-sm text-[#9CA3AF]">{t("investments.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[#1E232E] bg-[#121621] text-[#9AA3B2]"
          aria-label={t("investments.filterButton")}
          title={t("investments.filterButton")}
        >
          <AppIcon name="filter" size={16} />
        </button>
      </div>

      {investmentFilter.enabled && assetsAboveLimit.length ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-red-300">
            {t("investments.warningAboveTitle")}
          </p>
          <p className="mt-1 text-xs text-red-200">
            {t("investments.warningAbovePrefix")}{" "}
            {assetsAboveLimit.map((asset) => asset.name || asset.symbol.toUpperCase()).slice(0, 4).join(", ")}
            {assetsAboveLimit.length > 4 ? "..." : ""}.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-[#8B94A6]">{t("investments.organizeByLabel")}</p>
        <button
          type="button"
          onClick={() => setOrganizeBy("alphabetical")}
          className={`rounded-full border px-3 py-1 text-xs ${
            organizeBy === "alphabetical"
              ? "border-[#3A8F8A] bg-[#163137] text-[#DCE3EE]"
              : "border-[#2A3344] bg-[#0F121A] text-[#8B94A6]"
          }`}
        >
          {t("investments.organizeAlphabetical")}
        </button>
        <button
          type="button"
          onClick={() => setOrganizeBy("category")}
          className={`rounded-full border px-3 py-1 text-xs ${
            organizeBy === "category"
              ? "border-[#3A8F8A] bg-[#163137] text-[#DCE3EE]"
              : "border-[#2A3344] bg-[#0F121A] text-[#8B94A6]"
          }`}
        >
          {t("investments.organizeCategory")}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {organizedAssets.length === 0 ? (
          <div className="col-span-2 rounded-2xl border border-dashed border-[#2A3445] bg-[#121621] p-6 text-sm text-[#8B94A6] sm:col-span-3">
            {investmentFilter.enabled && investmentFilter.showOnlyAbove
              ? t("investments.filterEmptyAbove")
              : t("investments.empty")}
          </div>
        ) : organizedAssets.map((asset) => {
          const key = getAssetQuoteKey(asset);
          const quote = quotes[key];
          const history = priceHistory[asset.id] ?? [];
          const current = quote?.price ?? getLatestPrice(history);
          const value = current != null ? current * asset.quantity : null;
          const categoryLabel = categoryLabelByKey[getInvestmentCategory(asset)];
          const summary = buildChartSummary(history);
          const exceededMetrics = exceededMetricsByAssetId[asset.id] ?? [];
          const hasExceededMetrics = investmentFilter.enabled && exceededMetrics.length > 0;
          const exceededLabelText = exceededMetrics
            .map((metricKey) => metricLabelByKey[metricKey])
            .join(", ");
          const exchangeLabel =
            asset.type === "b3"
              ? `BVMF - ${normalizeB3Symbol(asset.symbol)}`
              : `CRYPTO - ${normalizeCryptoId(asset.symbol).toUpperCase()}`;
          return (
            <button
              key={asset.id}
              type="button"
              onClick={() => openDetails(asset)}
              className="flex min-h-[260px] min-w-0 flex-col justify-between gap-3 rounded-2xl border border-[#1E232E] bg-[#121621] p-4 text-left"
            >
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#8B94A6]">
                  {exchangeLabel}
                </p>
                <div className="flex items-center gap-2">
                  {asset.type === "b3" ? (
                    quote?.logoUrl ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={quote.logoUrl}
                          alt={asset.symbol.toUpperCase()}
                          className="h-5 w-5 rounded-full object-cover"
                        />
                      </>
                    ) : (
                      <span className="h-5 w-5 rounded-full border border-[#273244] bg-[#151A27]" />
                    )
                  ) : null}
                  <p className="text-sm font-semibold text-[#E4E7EC]">
                    {asset.name || asset.symbol.toUpperCase()}
                  </p>
                </div>
                <p className="text-[10px] text-[#8B94A6]">{categoryLabel}</p>
                {hasExceededMetrics ? (
                  <div className="mt-1 space-y-1">
                    <span className="inline-flex rounded-full border border-red-500/50 px-2 py-0.5 text-[10px] font-semibold text-red-300">
                      {t("investments.aboveLimitTag")}
                    </span>
                    <p className="text-[10px] text-red-200">{exceededLabelText}</p>
                  </div>
                ) : null}
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-semibold text-[#E5E8EF]">
                    {summary.current != null
                      ? formatCurrency(summary.current, language)
                      : "--"}
                  </span>
                  {summary.changePct != null ? (
                    <span
                      className={`text-xs font-semibold ${
                        summary.changePct >= 0 ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      {formatPercent(summary.changePct, language)}{" "}
                      {language === "pt" ? "(1 ano)" : "(1 year)"}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {metricConfig.map((metric) => {
                    const metricValue = getMetricValue(quote, metric.key);
                    const isExceeded = exceededMetrics.includes(metric.key);
                    let display = "--";
                    if (metricValue != null) {
                      if (metric.isPercent) {
                        display = formatPlainPercent(metricValue, language);
                      } else if (metric.key === "bookValue") {
                        display = formatCurrency(metricValue, language);
                      } else if (metric.key === "sharesOutstanding") {
                        display = formatCompactNumber(metricValue, language);
                      } else {
                        display = new Intl.NumberFormat(
                          language === "pt" ? "pt-BR" : "en-US",
                          { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                        ).format(metricValue);
                      }
                    }
                    return (
                      <div
                        key={`${asset.id}-${metric.key}`}
                        className={`rounded-md border px-2 py-1 ${
                          isExceeded
                            ? "border-red-500/40 bg-red-500/10"
                            : "border-[#232D3F] bg-[#0F121A]"
                        }`}
                      >
                        <p className="text-[10px] text-[#8B94A6]">{metric.label}</p>
                        <p
                          className={`text-[11px] font-semibold ${
                            isExceeded ? "text-red-300" : "text-[#D8DEE9]"
                          }`}
                        >
                          {display}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="h-40 min-w-0">
                {history.length ? (
                  <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={120}>
                    <AreaChart data={history}>
                      <defs>
                        <linearGradient id={`asset-${asset.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#C49A5A" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#C49A5A" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1F2632" />
                      <XAxis
                        dataKey="time"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        tickFormatter={(value) => formatChartDate(value, language)}
                        tick={{ fill: "#7F8694", fontSize: 10 }}
                        axisLine={{ stroke: "#1F2632" }}
                        tickLine={{ stroke: "#1F2632" }}
                      />
                      <YAxis
                        tickFormatter={(value) => formatAxisCurrency(value, language)}
                        tick={{ fill: "#7F8694", fontSize: 10 }}
                        axisLine={{ stroke: "#1F2632" }}
                        tickLine={{ stroke: "#1F2632" }}
                        width={50}
                      />
                      {summary.current != null ? (
                        <ReferenceLine
                          y={summary.current}
                          stroke="#5E6777"
                          strokeDasharray="3 3"
                        />
                      ) : null}
                      <Tooltip
                        formatter={(value) => formatCurrency(Number(value ?? 0), language)}
                        labelFormatter={(label) => formatShortDate(String(label), language)}
                        contentStyle={{
                          background: "#0F121A",
                          border: "1px solid #1E232E",
                          borderRadius: 8,
                          color: "#E4E7EC",
                          fontSize: 12,
                        }}
                        labelStyle={{ color: "#8B94A6" }}
                      />
                      <Area
                        type="monotone"
                        dataKey="price"
                        stroke="#C49A5A"
                        fill={`url(#asset-${asset.id})`}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-[11px] text-[#8B94A6]">
                    --
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-[#8B94A6]">{t("investments.totalValue")}</p>
                <p className="text-sm font-semibold text-[#E5E8EF]">
                  {value != null ? formatCurrency(value, language) : "--"}
                </p>
              </div>
            </button>
          );
        })}

      </div>

      {quoteError ? <p className="text-xs text-red-400">{quoteError}</p> : null}

      {filterOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-6"
          onClick={() => setFilterOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-3xl border border-[#1E232E] bg-[#0F121A] p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[#E5E8EF]">
                  {t("investments.filterModalTitle")}
                </p>
                <p className="text-xs text-[#8B94A6]">
                  {t("investments.filterModalSubtitle")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="text-xs text-[#8B94A6]"
              >
                {t("common.cancel")}
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setInvestmentFilter((current) => ({
                      ...current,
                      enabled: !current.enabled,
                    }))
                  }
                  className={`rounded-full border px-3 py-1 text-xs ${
                    investmentFilter.enabled
                      ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
                      : "border-[#2A3344] bg-[#0F121A] text-[#8B94A6]"
                  }`}
                >
                  {investmentFilter.enabled
                    ? t("investments.filterEnabled")
                    : t("investments.filterDisabled")}
                </button>
                <label className="flex items-center gap-2 text-xs text-[#8B94A6]">
                  <input
                    type="checkbox"
                    checked={investmentFilter.showOnlyAbove}
                    onChange={(event) =>
                      setInvestmentFilter((current) => ({
                        ...current,
                        showOnlyAbove: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-[#2A3344] bg-[#0F121A]"
                  />
                  {t("investments.filterShowOnlyAbove")}
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {metricConfig.map((metric) => (
                  <div key={`filter-${metric.key}`} className="rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2">
                    <p className="text-[11px] text-[#8B94A6]">{metric.label}</p>
                    <input
                      value={investmentFilter.limits[metric.key]}
                      onChange={(event) =>
                        setInvestmentFilter((current) => ({
                          ...current,
                          limits: {
                            ...current.limits,
                            [metric.key]: event.target.value,
                          },
                        }))
                      }
                      placeholder={t("investments.metricLimitPlaceholder")}
                      className="mt-2 w-full rounded-xl border border-[#1E232E] bg-[#0F121A] px-3 py-2 text-sm text-[#E4E7EC]"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-6">
          <div className="w-full max-w-lg rounded-3xl border border-[#1E232E] bg-[#0F121A] p-5">
            {isCreate ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#E5E8EF]">
                    {t("investments.addTitle")}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="text-xs text-[#8B94A6]"
                  >
                    {t("common.cancel")}
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setType("b3");
                        setCryptoPickerOpen(false);
                      }}
                      className={`flex-1 rounded-xl border px-3 py-2 text-xs ${
                        type === "b3"
                          ? "border-[#3A8F8A] bg-[#163137] text-[#DCE3EE]"
                          : "border-[#1C2332] bg-[#0F121A] text-[#DCE3EE]"
                      }`}
                    >
                      {t("investments.b3")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setType("crypto");
                        setSymbol("");
                        setSelectedCrypto(null);
                        setCryptoMarket(null);
                        setPreviewQuote(null);
                        setFeaturedCryptoOptions([]);
                        setCryptoPickerOpen(false);
                      }}
                      className={`flex-1 rounded-xl border px-3 py-2 text-xs ${
                        type === "crypto"
                          ? "border-[#3A8F8A] bg-[#163137] text-[#DCE3EE]"
                          : "border-[#1C2332] bg-[#0F121A] text-[#DCE3EE]"
                      }`}
                    >
                      {t("investments.crypto")}
                    </button>
                  </div>
                  <div>
                    {type === "crypto" ? (
                      <div>
                        <button
                          type="button"
                          onClick={() => setCryptoPickerOpen((current) => !current)}
                          className="flex w-full items-center justify-between rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2 text-sm text-[#E4E7EC]"
                        >
                          <span className="truncate text-left">
                            {selectedCrypto
                              ? `${selectedCrypto.symbol.toUpperCase()} - ${selectedCrypto.name}`
                              : language === "pt"
                                ? "Selecionar cripto"
                                : "Select crypto"}
                          </span>
                          <AppIcon name="chevron-down" size={16} color="#8B94A6" />
                        </button>
                        <p className="mt-1 text-[11px] text-[#8B94A6]">
                          {language === "pt"
                            ? "Selecione uma cripto da lista de destaque."
                            : "Select a crypto from the featured list."}
                        </p>
                        {cryptoPickerOpen ? (
                          <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-xl border border-[#1E232E] bg-[#0F121A] p-2">
                            {featuredCryptoLoading ? (
                              <p className="px-2 py-1 text-[11px] text-[#8B94A6]">
                                {language === "pt" ? "Carregando criptos..." : "Loading cryptos..."}
                              </p>
                            ) : featuredCryptoOptions.length ? (
                              featuredCryptoOptions.map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => {
                                    setSymbol(item.id);
                                    setSelectedCrypto({
                                      id: item.id,
                                      symbol: item.symbol,
                                      name: item.name,
                                      thumb: item.image,
                                      rank: item.rank,
                                    });
                                    setCryptoMarket(item);
                                    setPreviewQuote({
                                      price: item.price,
                                      changePct: item.changePct24h,
                                    });
                                    setName((current) => (current.trim() ? current : item.name));
                                    setCryptoPickerOpen(false);
                                  }}
                                  className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition ${
                                    selectedCrypto?.id === item.id
                                      ? "bg-[#163137] text-[#DCE3EE]"
                                      : "hover:bg-[#151A27] text-[#C8D0DC]"
                                  }`}
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    {item.image ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={item.image}
                                        alt={item.name}
                                        className="h-5 w-5 rounded-full object-cover"
                                      />
                                    ) : (
                                      <span className="h-5 w-5 rounded-full bg-[#1E232E]" />
                                    )}
                                    <span className="min-w-0">
                                      <span className="block truncate text-xs font-semibold">
                                        {item.name}
                                      </span>
                                      <span className="block truncate text-[11px] text-[#8B94A6]">
                                        {item.symbol.toUpperCase()} - {item.id}
                                      </span>
                                    </span>
                                  </span>
                                  {item.rank ? (
                                    <span className="text-[10px] text-[#8B94A6]">#{item.rank}</span>
                                  ) : null}
                                </button>
                              ))
                            ) : (
                              <p className="px-2 py-1 text-[11px] text-[#8B94A6]">
                                {language === "pt"
                                  ? "Sem criptos disponiveis no momento."
                                  : "No cryptos available right now."}
                              </p>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div>
                        <input
                          value={symbol}
                          onChange={(event) => setSymbol(event.target.value)}
                          placeholder={t("investments.symbol")}
                          className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2 text-sm text-[#E4E7EC]"
                        />
                        <p className="mt-1 text-[11px] text-[#8B94A6]">
                          {t("investments.symbolHint")}
                        </p>
                      </div>
                    )}
                  </div>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t("investments.name")}
                    className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2 text-sm text-[#E4E7EC]"
                  />
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2 text-sm text-[#E4E7EC]"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("quantity")}
                    className={`flex-1 rounded-xl border px-3 py-2 text-xs ${
                      mode === "quantity"
                        ? "border-[#3A8F8A] bg-[#163137] text-[#DCE3EE]"
                        : "border-[#1C2332] bg-[#0F121A] text-[#DCE3EE]"
                    }`}
                  >
                    {t("investments.modeQuantity")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("value")}
                    className={`flex-1 rounded-xl border px-3 py-2 text-xs ${
                      mode === "value"
                        ? "border-[#3A8F8A] bg-[#163137] text-[#DCE3EE]"
                        : "border-[#1C2332] bg-[#0F121A] text-[#DCE3EE]"
                    }`}
                  >
                    {t("investments.modeValue")}
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {mode === "quantity" ? (
                    <input
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                      placeholder={t("investments.quantity")}
                      className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2 text-sm text-[#E4E7EC]"
                    />
                  ) : (
                    <input
                      value={investedValue}
                      onChange={(event) => setInvestedValue(formatCentsInput(event.target.value))}
                      placeholder={t("investments.investedValue")}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2 text-sm text-[#E4E7EC]"
                    />
                  )}
                  <div>
                    <input
                      value={manualPrice}
                      onChange={(event) => setManualPrice(formatCentsInput(event.target.value))}
                      placeholder={t("investments.manualPrice")}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2 text-sm text-[#E4E7EC]"
                    />
                    <p className="mt-1 text-[11px] text-[#8B94A6]">
                      {t("investments.manualPriceHint")}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2">
                    <p className="text-[11px] text-[#8B94A6]">
                      {t("investments.total")}
                    </p>
                    <p className="text-sm font-semibold text-[#E5E8EF]">
                      {priceBig && computed.qty.gt(0)
                        ? formatCurrency(Number(computed.total.toString()), language)
                        : "--"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2">
                    <p className="text-[11px] text-[#8B94A6]">
                      {t("investments.currentPrice")}
                    </p>
                    <p className="text-sm font-semibold text-[#E5E8EF]">
                      {displayPrice != null
                        ? formatCurrency(displayPrice, language)
                        : "--"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2">
                    <p className="text-[11px] text-[#8B94A6]">
                      {t("investments.currentAvg")}
                    </p>
                    <p className="text-sm font-semibold text-[#E5E8EF]">
                      {currentAvg.gt(0)
                        ? formatCurrency(Number(currentAvg.toString()), language)
                        : "--"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2">
                    <p className="text-[11px] text-[#8B94A6]">
                      {t("investments.newAvg")}
                    </p>
                    <p className="text-sm font-semibold text-[#E5E8EF]">
                      {computed.newAvg.gt(0)
                        ? formatCurrency(Number(computed.newAvg.toString()), language)
                        : "--"}
                    </p>
                  </div>
                </div>

                {type === "b3" ? (
                  <div className="rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2">
                    <p className="text-[11px] text-[#8B94A6]">
                      {language === "pt" ? "Ativo selecionado" : "Selected asset"}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      {preview?.logoUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={preview.logoUrl}
                            alt={symbol.toUpperCase()}
                            className="h-6 w-6 rounded-full object-cover"
                          />
                        </>
                      ) : (
                        <span className="h-6 w-6 rounded-full border border-[#273244] bg-[#151A27]" />
                      )}
                      <p className="text-sm font-semibold text-[#E5E8EF]">
                        {name.trim() || symbol.toUpperCase() || "--"}
                      </p>
                    </div>
                    <p className="text-[11px] text-[#8B94A6]">
                      {symbol ? `B3 - ${normalizeB3Symbol(symbol)}` : "--"}
                    </p>
                  </div>
                ) : null}

                {type === "crypto" ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2">
                      <p className="text-[11px] text-[#8B94A6]">
                        {language === "pt" ? "Cripto selecionada" : "Selected crypto"}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        {cryptoMarket?.image || selectedCrypto?.thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={cryptoMarket?.image ?? selectedCrypto?.thumb ?? ""}
                            alt={cryptoMarket?.name ?? selectedCrypto?.name ?? "crypto"}
                            className="h-6 w-6 rounded-full object-cover"
                          />
                        ) : (
                          <span className="h-6 w-6 rounded-full bg-[#1E232E]" />
                        )}
                        <p className="text-sm font-semibold text-[#E5E8EF]">
                          {cryptoMarket?.name ?? selectedCrypto?.name ?? "--"}
                        </p>
                      </div>
                      <p className="text-[11px] text-[#8B94A6]">
                        {cryptoMarket?.symbol
                          ? `${cryptoMarket.symbol.toUpperCase()} - ${cryptoMarket.id}`
                          : selectedCrypto
                            ? `${selectedCrypto.symbol.toUpperCase()} - ${selectedCrypto.id}`
                            : "--"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2">
                      <p className="text-[11px] text-[#8B94A6]">
                        {language === "pt" ? "Ranking de mercado" : "Market rank"}
                      </p>
                      <p className="text-sm font-semibold text-[#E5E8EF]">
                        {cryptoMarket?.rank ? `#${cryptoMarket.rank}` : "--"}
                      </p>
                      <p className="text-[11px] text-[#8B94A6]">
                        {language === "pt" ? "Atualizacao em tempo real" : "Live market update"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2">
                      <p className="text-[11px] text-[#8B94A6]">
                        {language === "pt" ? "Market cap" : "Market cap"}
                      </p>
                      <p className="text-sm font-semibold text-[#E5E8EF]">
                        {cryptoMarket?.marketCap != null
                          ? formatCurrency(cryptoMarket.marketCap, language)
                          : "--"}
                      </p>
                      <p className="text-[11px] text-[#8B94A6]">
                        {language === "pt" ? "Volume 24h" : "24h volume"}:{" "}
                        {cryptoMarket?.volume24h != null
                          ? formatCompactNumber(cryptoMarket.volume24h, language)
                          : "--"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2">
                      <p className="text-[11px] text-[#8B94A6]">
                        {language === "pt" ? "Faixa 24h" : "24h range"}
                      </p>
                      <p className="text-sm font-semibold text-[#E5E8EF]">
                        {cryptoMarket?.low24h != null
                          ? formatCurrency(cryptoMarket.low24h, language)
                          : "--"}{" "}
                        -{" "}
                        {cryptoMarket?.high24h != null
                          ? formatCurrency(cryptoMarket.high24h, language)
                          : "--"}
                      </p>
                      <p
                        className={`text-[11px] ${
                          (cryptoMarket?.changePct24h ?? 0) >= 0
                            ? "text-emerald-300"
                            : "text-rose-300"
                        }`}
                      >
                        {language === "pt" ? "Variação 24h" : "24h change"}:{" "}
                        {cryptoMarket?.changePct24h != null
                          ? formatPercent(cryptoMarket.changePct24h, language)
                          : "--"}
                      </p>
                    </div>
                  </div>
                ) : null}

                {errorMsg ? <p className="text-xs text-red-400">{errorMsg}</p> : null}

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full rounded-xl bg-[#E6EDF3] py-2 text-sm font-semibold text-[#0C1018] disabled:opacity-60"
                >
                  {saving ? t("common.saving") : t("common.save")}
                </button>
              </div>
            ) : activeAsset ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#E5E8EF]">
                      {activeAsset.name || activeAsset.symbol.toUpperCase()}
                    </p>
                    <p className="text-xs text-[#8B94A6]">
                      {activeAsset.type === "b3" ? "B3" : "Cripto"} -{" "}
                      {activeAsset.symbol}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="text-xs text-[#8B94A6]"
                  >
                    {t("common.cancel")}
                  </button>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[#E5E8EF]">
                    {t("investments.purchaseTitle")}
                  </p>
                  {purchasesLoading ? (
                    <p className="text-xs text-[#8B94A6]">{t("common.loading")}</p>
                  ) : purchasesError ? (
                    <p className="text-xs text-red-400">{purchasesError}</p>
                  ) : activePurchases.length ? (
                    <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                      {activePurchases.map((purchase) => (
                        <div
                          key={purchase.id}
                          className="rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2 text-xs"
                        >
                          <div className="flex items-center justify-between text-[#8B94A6]">
                            <span>{formatShortDate(purchase.date, language)}</span>
                            <span>
                              {purchase.mode_used === "quantity"
                                ? t("investments.modeQuantity")
                                : t("investments.modeValue")}
                            </span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-[#E5E8EF]">
                            <div>
                              {t("investments.pricePerShare")}{" "}
                              {formatCurrency(Number(purchase.price_per_share) || 0, language)}
                            </div>
                            <div>
                              {t("investments.quantity")}{" "}
                              {Number(purchase.quantity) || 0}
                            </div>
                            <div>
                              {t("investments.total")}{" "}
                              {formatCurrency(
                                Number(purchase.total_invested) || 0,
                                language,
                              )}
                            </div>
                            {purchase.input_value ? (
                              <div>
                                {t("investments.investedValue")}{" "}
                                {formatCurrency(
                                  Number(purchase.input_value) || 0,
                                  language,
                                )}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#8B94A6]">--</p>
                  )}
                </div>

                <div className="space-y-2 rounded-2xl border border-[#1E232E] bg-[#121621] p-3">
                  <p className="text-xs font-semibold text-[#E5E8EF]">
                    {t("investments.title")}
                  </p>
                  <div className="grid gap-2 md:grid-cols-2">
                    <input
                      value={editSymbol}
                      onChange={(event) => setEditSymbol(event.target.value)}
                      placeholder={t("investments.symbol")}
                      className="w-full rounded-xl border border-[#1E232E] bg-[#0F121A] px-3 py-2 text-sm text-[#E4E7EC]"
                    />
                    <input
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      placeholder={t("investments.name")}
                      className="w-full rounded-xl border border-[#1E232E] bg-[#0F121A] px-3 py-2 text-sm text-[#E4E7EC]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleUpdateAsset}
                    disabled={editSaving}
                    className="w-full rounded-xl bg-[#E6EDF3] py-2 text-sm font-semibold text-[#0C1018] disabled:opacity-60"
                  >
                    {editSaving ? t("common.saving") : t("common.save")}
                  </button>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleRemove(activeAsset.id)}
                    className="rounded-full border border-[#1E232E] bg-[#0F121A] px-3 py-1 text-xs text-[#8B94A6] hover:border-red-500/60 hover:text-red-400"
                  >
                    {t("investments.remove")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
