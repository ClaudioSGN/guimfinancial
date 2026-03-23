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
import { useCurrency } from "@/lib/currency";
import { useAuth } from "@/lib/auth";
import { AppIcon } from "@/components/AppIcon";
import { parseCentsInput } from "@/lib/moneyInput";
import {
  computeNewAveragePrice,
  computeQuantityFromValue,
  computeTotal,
} from "@/lib/investments/math";
import {
  canSelectInvestmentCurrency,
  DEFAULT_INVESTMENT_CURRENCY,
  getCoinGeckoCurrency,
  normalizeInvestmentCurrency,
  type SupportedInvestmentCurrency,
} from "../../../shared/investmentCurrency";

type InvestmentType = "b3" | "crypto" | "fixed_income";

type Investment = {
  id: string;
  type: InvestmentType;
  symbol: string;
  name: string | null;
  currency: SupportedInvestmentCurrency;
  quantity: number;
  average_price: number;
  cdi_rate_pct: number | null;
  cdi_multiplier_pct: number | null;
  fixed_started_at: string | null;
  created_at: string | null;
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
type InvestmentCategory = "fii" | "etf" | "stock" | "bdr" | "crypto" | "fixed" | "other";

type FixedIncomeSnapshot = {
  principal: number;
  annualCdiPct: number;
  cdiMultiplierPct: number;
  effectiveAnnualPct: number;
  startAtMs: number;
  elapsedDays: number;
  currentValue: number;
  profit: number;
  estimatedDailyProfit: number;
};

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

async function fetchCryptoHistory(
  symbol: string,
  currency: SupportedInvestmentCurrency,
): Promise<PricePoint[]> {
  const id = normalizeCryptoId(symbol);
  const vsCurrency = getCoinGeckoCurrency(currency, "crypto");

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(
        id,
      )}/market_chart?vs_currency=${vsCurrency}&days=365`,
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

async function fetchCryptoMarketSnapshot(
  id: string,
  currency: SupportedInvestmentCurrency,
): Promise<CryptoMarketSnapshot | null> {
  const vsCurrency = getCoinGeckoCurrency(currency, "crypto");
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${vsCurrency}&ids=${encodeURIComponent(
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

async function fetchFeaturedCryptoOptions(
  ids = FEATURED_CRYPTO_IDS,
  currency: SupportedInvestmentCurrency = DEFAULT_INVESTMENT_CURRENCY,
) {
  const normalizedIds = ids.map((id) => normalizeCryptoId(id)).filter(Boolean);
  if (!normalizedIds.length) return [];
  const vsCurrency = getCoinGeckoCurrency(currency, "crypto");
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${vsCurrency}&ids=${encodeURIComponent(
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

function normalizeSymbol(type: InvestmentType, value: string) {
  if (type === "b3") return normalizeB3Symbol(value);
  if (type === "crypto") return normalizeCryptoId(value);
  return "CDI";
}

function getAssetCurrency(asset: Pick<Investment, "type" | "currency">) {
  return normalizeInvestmentCurrency(asset.currency, asset.type);
}

function getAssetQuoteKey(asset: Investment) {
  if (asset.type === "b3") return normalizeB3Symbol(asset.symbol);
  if (asset.type === "crypto") {
    return `${normalizeCryptoId(asset.symbol)}:${getAssetCurrency(asset)}`;
  }
  return `fixed:${asset.id}`;
}

function getQuantityDecimals(type: InvestmentType) {
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
  if (asset.type === "fixed_income") return "fixed";

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

function getInvestmentPrincipal(asset: Investment) {
  if (asset.type === "fixed_income") return Number(asset.quantity) || 0;
  return (Number(asset.quantity) || 0) * (Number(asset.average_price) || 0);
}

function getInvestmentCurrentValue(
  asset: Investment,
  quote: Quote | undefined,
  fixedSnapshot: FixedIncomeSnapshot | undefined,
) {
  if (asset.type === "fixed_income") {
    return fixedSnapshot?.currentValue ?? getInvestmentPrincipal(asset);
  }

  if (quote?.price != null) {
    return quote.price * (Number(asset.quantity) || 0);
  }

  return getInvestmentPrincipal(asset);
}

function getInvestmentTypeLabel(asset: Investment, language: "pt" | "en") {
  if (asset.type === "b3") return "B3";
  if (asset.type === "crypto") return language === "pt" ? "Cripto" : "Crypto";
  return language === "pt" ? "Renda fixa" : "Fixed income";
}

function formatCurrency(
  value: number,
  language: "pt" | "en",
  currency: SupportedInvestmentCurrency = DEFAULT_INVESTMENT_CURRENCY,
) {
  return new Intl.NumberFormat(language === "pt" ? "pt-BR" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatCentsInputForCurrency(
  raw: string,
  currency: SupportedInvestmentCurrency = DEFAULT_INVESTMENT_CURRENCY,
) {
  const cleaned = raw.replace(/\D/g, "");
  if (!cleaned) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(0);
  }
  const value = Number(cleaned) / 100;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

function formatAxisCurrency(
  value: number,
  language: "pt" | "en",
  currency: SupportedInvestmentCurrency = DEFAULT_INVESTMENT_CURRENCY,
) {
  return new Intl.NumberFormat(language === "pt" ? "pt-BR" : "en-US", {
    style: "currency",
    currency,
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

function getErrorText(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const asAny = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof asAny.code === "string" ? asAny.code : "";
  const message = typeof asAny.message === "string" ? asAny.message : "";
  const details = typeof asAny.details === "string" ? asAny.details : "";
  return `${code} ${message} ${details}`.trim().toLowerCase();
}

function isFixedIncomeSchemaError(error: unknown) {
  const text = getErrorText(error);
  if (!text) return false;
  return (
    text.includes("42703") ||
    text.includes("23514") ||
    text.includes("investments_type_check") ||
    text.includes("fixed_income") ||
    text.includes("cdi_rate_pct") ||
    text.includes("cdi_multiplier_pct") ||
    text.includes("fixed_started_at")
  );
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

function parseLocalDateInputToMs(value: string | null | undefined) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    if (year && month && day) {
      return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
    }
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getTime();
}

function computeFixedIncomeSnapshot(params: {
  principal: number;
  annualCdiPct: number;
  cdiMultiplierPct: number;
  startAtMs: number;
  nowMs: number;
}): FixedIncomeSnapshot | null {
  const principal = Number(params.principal) || 0;
  if (principal <= 0) return null;
  const annualCdiPct = Number(params.annualCdiPct) || 0;
  const cdiMultiplierPct = Number(params.cdiMultiplierPct) || 0;
  if (annualCdiPct <= 0 || cdiMultiplierPct <= 0) return null;
  const effectiveAnnualPct = annualCdiPct * (cdiMultiplierPct / 100);
  const startAtMs = Number.isFinite(params.startAtMs) ? params.startAtMs : params.nowMs;
  const nowMs = Math.max(params.nowMs, startAtMs);
  const elapsedMs = Math.max(nowMs - startAtMs, 0);
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
  const elapsedYears = elapsedDays / 365;
  const annualFactor = 1 + effectiveAnnualPct / 100;
  const currentValue = principal * Math.pow(Math.max(annualFactor, 0), elapsedYears);
  const profit = currentValue - principal;
  const dailyRate = Math.pow(Math.max(annualFactor, 0), 1 / 365) - 1;
  const estimatedDailyProfit = currentValue * dailyRate;
  return {
    principal,
    annualCdiPct,
    cdiMultiplierPct,
    effectiveAnnualPct,
    startAtMs,
    elapsedDays,
    currentValue,
    profit,
    estimatedDailyProfit,
  };
}

function buildFixedIncomeHistory(
  snapshot: FixedIncomeSnapshot,
  nowMs: number,
  maxPoints = 90,
): PricePoint[] {
  const start = snapshot.startAtMs;
  const end = Math.max(nowMs, start);
  const spanMs = Math.max(end - start, 0);
  if (spanMs === 0) {
    return [{ time: end, price: snapshot.currentValue }];
  }
  const dayMs = 24 * 60 * 60 * 1000;
  const points = Math.min(maxPoints, Math.max(2, Math.ceil(spanMs / dayMs) + 1));

  const history: PricePoint[] = [];
  for (let index = 0; index < points; index += 1) {
    const ratio = points === 1 ? 1 : index / (points - 1);
    const atMs = start + spanMs * ratio;
    const atSnapshot = computeFixedIncomeSnapshot({
      principal: snapshot.principal,
      annualCdiPct: snapshot.annualCdiPct,
      cdiMultiplierPct: snapshot.cdiMultiplierPct,
      startAtMs: snapshot.startAtMs,
      nowMs: atMs,
    });
    if (!atSnapshot) continue;
    history.push({ time: atMs, price: atSnapshot.currentValue });
  }

  return history;
}

export function InvestmentsScreen() {
  const { language, t } = useLanguage();
  const { currency: appCurrency } = useCurrency();
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

  const [type, setType] = useState<InvestmentType>("b3");
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<SupportedInvestmentCurrency>(
    DEFAULT_INVESTMENT_CURRENCY,
  );
  const [mode, setMode] = useState<"quantity" | "value">("quantity");
  const [quantity, setQuantity] = useState("");
  const [investedValue, setInvestedValue] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [fixedCdiRatePct, setFixedCdiRatePct] = useState("10.5");
  const [fixedCdiMultiplierPct, setFixedCdiMultiplierPct] = useState("100");
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
  const [editCurrency, setEditCurrency] = useState<SupportedInvestmentCurrency>(
    DEFAULT_INVESTMENT_CURRENCY,
  );
  const [editSaving, setEditSaving] = useState(false);
  const [organizeBy, setOrganizeBy] = useState<InvestmentOrganizer>("alphabetical");
  const [investmentFilter, setInvestmentFilter] = useState<InvestmentFilterSettings>(
    DEFAULT_INVESTMENT_FILTER,
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());
  const preferredNewInvestmentCurrency = normalizeInvestmentCurrency(appCurrency, "crypto");
  const filterStorageKey = user?.id
    ? `${INVESTMENT_FILTER_STORAGE_PREFIX}:${user.id}`
    : null;

  const loadAssets = useCallback(async () => {
    if (!user) return;
    const fullSelect =
      "id,type,symbol,name,currency,quantity,average_price,cdi_rate_pct,cdi_multiplier_pct,fixed_started_at,created_at";
    const baseSelect = "id,type,symbol,name,quantity,average_price,created_at";

    const { data, error } = await supabase
      .from("investments")
      .select(fullSelect)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      const missingColumn =
        error.code === "42703" ||
        String(error.message ?? "").toLowerCase().includes("column");
      if (!missingColumn) {
        console.error(error);
        setAssets([]);
        return;
      }

      const fallback = await supabase
        .from("investments")
        .select(baseSelect)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (fallback.error) {
        console.error(fallback.error);
        setAssets([]);
        return;
      }

      const normalizedFallback = (fallback.data ?? []).map((asset: any) => ({
        ...asset,
        currency: normalizeInvestmentCurrency(appCurrency, asset.type),
        cdi_rate_pct: null,
        cdi_multiplier_pct: null,
        fixed_started_at: null,
      })) as Investment[];
      setAssets(normalizedFallback);
      return;
    }

    setAssets(
      ((data ?? []) as Array<Omit<Investment, "currency"> & { currency?: string | null }>).map(
        (asset) => ({
          ...asset,
          currency: normalizeInvestmentCurrency(asset.currency, asset.type),
        }),
      ),
    );
  }, [appCurrency, user]);

  const fetchHistoryForAsset = useCallback(
    async (asset: Investment) => {
      try {
        if (asset.type === "b3") return await fetchB3History(asset.symbol);
        if (asset.type === "crypto") {
          return await fetchCryptoHistory(asset.symbol, getAssetCurrency(asset));
        }
        return [];
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

  useEffect(() => {
    if (canSelectInvestmentCurrency(type)) return;
    if (currency === DEFAULT_INVESTMENT_CURRENCY) return;
    setCurrency(DEFAULT_INVESTMENT_CURRENCY);
  }, [currency, type]);

  useEffect(() => {
    const nextCurrency = normalizeInvestmentCurrency(currency, type);
    setInvestedValue((current) => {
      if (!current) return current;
      const next = formatCentsInputForCurrency(current, nextCurrency);
      return next === current ? current : next;
    });
    setManualPrice((current) => {
      if (!current) return current;
      const next = formatCentsInputForCurrency(current, nextCurrency);
      return next === current ? current : next;
    });
  }, [currency, type]);

  const fetchQuotes = useCallback(async () => {
    if (!assets.length) {
      setQuotes({});
      setQuoteError(null);
      return;
    }
    setQuoteError(null);

    const b3Symbols = Array.from(new Set(assets
      .filter((asset) => asset.type === "b3")
      .map((asset) => normalizeB3Symbol(asset.symbol))
      .filter((symbol) => isLikelyB3Symbol(symbol) && !badB3Symbols.has(symbol))));
    const cryptoIdsByCurrency = assets.reduce(
      (map, asset) => {
        if (asset.type !== "crypto") return map;
        const id = normalizeCryptoId(asset.symbol);
        if (!isLikelyCryptoId(id)) return map;
        const assetCurrency = getAssetCurrency(asset);
        map[assetCurrency].add(id);
        return map;
      },
      {
        BRL: new Set<string>(),
        EUR: new Set<string>(),
      } satisfies Record<SupportedInvestmentCurrency, Set<string>>,
    );

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

    for (const assetCurrency of ["BRL", "EUR"] as const) {
      const cryptoIds = Array.from(cryptoIdsByCurrency[assetCurrency]);
      if (!cryptoIds.length) continue;
      const vsCurrency = getCoinGeckoCurrency(assetCurrency, "crypto");
      try {
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoIds.join(
          ",",
        )}&vs_currencies=${vsCurrency}&include_24hr_change=true`;
        const res = await fetch(url);
        if (!res.ok) {
          hadFailures = true;
          continue;
        }
        const json = await res.json();
        cryptoIds.forEach((id) => {
          const entry = json?.[id];
          const price = entry?.[vsCurrency];
          if (price == null) return;
          nextQuotes[`${id}:${assetCurrency}`] = {
            price: Number(price) || 0,
            changePct:
              entry?.[`${vsCurrency}_24h_change`] != null
                ? Number(entry[`${vsCurrency}_24h_change`])
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

  const hasFixedIncomeAssets = useMemo(
    () => assets.some((asset) => asset.type === "fixed_income"),
    [assets],
  );

  useEffect(() => {
    const shouldTick =
      hasFixedIncomeAssets || (showModal && isCreate && type === "fixed_income");
    if (!shouldTick) return;
    const timer = window.setInterval(() => {
      setLiveNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [hasFixedIncomeAssets, isCreate, showModal, type]);

  const fixedSnapshotByAssetId = useMemo(() => {
    const map: Record<string, FixedIncomeSnapshot> = {};
    assets.forEach((asset) => {
      if (asset.type !== "fixed_income") return;
      const principal = Number(asset.quantity) || 0;
      const annualCdiPct = Number(asset.cdi_rate_pct) || 0;
      const cdiMultiplierPct = Number(asset.cdi_multiplier_pct) || 0;
      const startAtMs =
        parseLocalDateInputToMs(asset.fixed_started_at) ??
        parseLocalDateInputToMs(asset.created_at) ??
        liveNowMs;
      const snapshot = computeFixedIncomeSnapshot({
        principal,
        annualCdiPct,
        cdiMultiplierPct,
        startAtMs,
        nowMs: liveNowMs,
      });
      if (!snapshot) return;
      map[asset.id] = snapshot;
    });
    return map;
  }, [assets, liveNowMs]);

  const fixedQuoteByKey = useMemo(() => {
    const next: Record<string, Quote> = {};
    assets.forEach((asset) => {
      if (asset.type !== "fixed_income") return;
      const snapshot = fixedSnapshotByAssetId[asset.id];
      if (!snapshot) return;
      next[getAssetQuoteKey(asset)] = {
        price: snapshot.currentValue,
        changePct:
          snapshot.principal > 0 ? (snapshot.profit / snapshot.principal) * 100 : 0,
      };
    });
    return next;
  }, [assets, fixedSnapshotByAssetId]);

  const fixedHistoryByAssetId = useMemo(() => {
    const next: Record<string, PricePoint[]> = {};
    assets.forEach((asset) => {
      if (asset.type !== "fixed_income") return;
      const snapshot = fixedSnapshotByAssetId[asset.id];
      if (!snapshot) {
        next[asset.id] = [];
        return;
      }
      next[asset.id] = buildFixedIncomeHistory(snapshot, liveNowMs);
    });
    return next;
  }, [assets, fixedSnapshotByAssetId, liveNowMs]);

  const allQuotes = useMemo(
    () => ({ ...quotes, ...fixedQuoteByKey }),
    [quotes, fixedQuoteByKey],
  );

  const allPriceHistory = useMemo(
    () => ({ ...priceHistory, ...fixedHistoryByAssetId }),
    [priceHistory, fixedHistoryByAssetId],
  );

  const activeAsset = selectedAsset;
  const isFixedIncome = type === "fixed_income";
  const formCurrency = normalizeInvestmentCurrency(currency, type);
  const existingAssetForForm = useMemo(() => {
    if (selectedAsset || type === "fixed_income") return null;
    const trimmedSymbol = symbol.trim();
    if (!trimmedSymbol) return null;
    const normalized = normalizeSymbol(type, trimmedSymbol);
    return (
      assets.find(
        (asset) =>
          asset.type === type &&
          normalizeSymbol(asset.type, asset.symbol) === normalized &&
          getAssetCurrency(asset) === formCurrency,
      ) ?? null
    );
  }, [assets, formCurrency, selectedAsset, symbol, type]);
  const mathAsset = activeAsset ?? existingAssetForForm;
  const activeAssetCurrency = activeAsset
    ? getAssetCurrency(activeAsset)
    : DEFAULT_INVESTMENT_CURRENCY;
  const editAssetCurrency = activeAsset
    ? normalizeInvestmentCurrency(editCurrency, activeAsset.type)
    : DEFAULT_INVESTMENT_CURRENCY;
  const currentAvg = mathAsset ? new Big(mathAsset.average_price || 0) : new Big(0);
  const currentQty = mathAsset ? new Big(mathAsset.quantity || 0) : new Big(0);
  const previewPriceBig =
    previewQuote?.price != null ? new Big(previewQuote.price) : null;
  const manualPriceValue = parseCentsInput(manualPrice);
  const manualPriceBig = manualPriceValue > 0 ? new Big(manualPriceValue) : null;
  const priceBig = manualPriceBig ?? previewPriceBig;
  const quantityBig = parseBig(quantity);
  const investedCents = parseCentsInput(investedValue);
  const investedBig = investedCents > 0 ? new Big(investedCents) : null;
  const fixedAnnualCdiPct = parseFilterThreshold(fixedCdiRatePct);
  const fixedCdiMultiplier = parseFilterThreshold(fixedCdiMultiplierPct);
  const decimals = getQuantityDecimals(type);

  const computed = useMemo(() => {
    if (isFixedIncome) {
      if (!investedBig) {
        return { qty: new Big(0), total: new Big(0), newAvg: currentAvg };
      }
      return { qty: investedBig, total: investedBig, newAvg: investedBig };
    }
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
  }, [isFixedIncome, priceBig, quantityBig, investedBig, mode, currentAvg, currentQty, decimals]);

  const preview = previewQuote;
  const displayPrice = manualPriceBig
    ? Number(manualPriceBig.toString())
    : preview?.price ?? null;
  const fixedPreviewSnapshot = useMemo(() => {
    if (!isFixedIncome || !investedBig) return null;
    if (fixedAnnualCdiPct == null || fixedAnnualCdiPct <= 0) return null;
    if (fixedCdiMultiplier == null || fixedCdiMultiplier <= 0) return null;
    const startAtMs = parseLocalDateInputToMs(date) ?? liveNowMs;
    return computeFixedIncomeSnapshot({
      principal: Number(investedBig.toString()),
      annualCdiPct: fixedAnnualCdiPct,
      cdiMultiplierPct: fixedCdiMultiplier,
      startAtMs,
      nowMs: liveNowMs,
    });
  }, [
    date,
    fixedAnnualCdiPct,
    fixedCdiMultiplier,
    investedBig,
    isFixedIncome,
    liveNowMs,
  ]);

  useEffect(() => {
    if (type !== "crypto") return;
    setFeaturedCryptoOptions([]);
    featuredCryptoOptionsRef.current = [];
    setSelectedCrypto(null);
    setCryptoMarket(null);
    setPreviewQuote(null);
    previewFetchRef.current = 0;
    previewKeyRef.current = "";
  }, [formCurrency, type]);

  useEffect(() => {
    if (!showModal || !isCreate) return;
    if (type === "fixed_income") {
      setPreviewQuote(null);
      setSelectedCrypto(null);
      setCryptoMarket(null);
      previewKeyRef.current = "";
      return;
    }
    const trimmedSymbol = symbol.trim();
    if (!trimmedSymbol || trimmedSymbol.length < 2) {
      setPreviewQuote(null);
      setSelectedCrypto(null);
      setCryptoMarket(null);
      previewKeyRef.current = "";
      return;
    }
    const previewKey = `${type}:${normalizeSymbol(type, trimmedSymbol)}:${formCurrency}`;
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
        const snapshot = await fetchCryptoMarketSnapshot(id, formCurrency);
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
  }, [formCurrency, isCreate, showModal, symbol, type]);

  useEffect(() => {
    featuredCryptoOptionsRef.current = featuredCryptoOptions;
  }, [featuredCryptoOptions]);

  useEffect(() => {
    if (!showModal || !isCreate || type !== "crypto" || featuredCryptoOptions.length) return;
    let cancelled = false;
    async function loadFeaturedCryptos() {
      setFeaturedCryptoLoading(true);
      const options = await fetchFeaturedCryptoOptions(FEATURED_CRYPTO_IDS, formCurrency);
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
  }, [featuredCryptoOptions.length, formCurrency, isCreate, showModal, symbol, type]);

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
    setSelectedAsset(null);
    setShowModal(false);
    await loadAssets();
  }

  async function handleUpdateAsset() {
    if (!user || !selectedAsset) return;
    const nextSymbol = editSymbol.trim();
    const nextName = editName.trim();
    const nextCurrency = normalizeInvestmentCurrency(editCurrency, selectedAsset.type);
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
        currency: nextCurrency,
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
    setCurrency(DEFAULT_INVESTMENT_CURRENCY);
    setMode("quantity");
    setQuantity("");
    setInvestedValue("");
    setManualPrice("");
    setFixedCdiRatePct("10.5");
    setFixedCdiMultiplierPct("100");
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
    setEditCurrency(getAssetCurrency(asset));
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
    if (!isFixedIncome && !symbol.trim()) {
      setErrorMsg(
        type === "crypto"
          ? language === "pt"
            ? "Selecione uma cripto da lista."
            : "Select a crypto from the list."
          : t("investments.addError"),
      );
      return;
    }
    if (isFixedIncome && !investedBig) {
      setErrorMsg(t("investments.valueRequired"));
      return;
    }
    if (isFixedIncome && (fixedAnnualCdiPct == null || fixedAnnualCdiPct <= 0)) {
      setErrorMsg(t("investments.fixedRateRequired"));
      return;
    }
    if (isFixedIncome && (fixedCdiMultiplier == null || fixedCdiMultiplier <= 0)) {
      setErrorMsg(t("investments.fixedMultiplierRequired"));
      return;
    }
    if (!isFixedIncome && !priceBig) {
      setErrorMsg(t("investments.priceRequired"));
      return;
    }
    if (!isFixedIncome && mode === "quantity" && !quantityBig) {
      setErrorMsg(t("investments.quantityRequired"));
      return;
    }
    if (!isFixedIncome && mode === "value" && !investedBig) {
      setErrorMsg(t("investments.valueRequired"));
      return;
    }
    if (!isFixedIncome && mode === "value" && computed.qty.lte(0)) {
      setErrorMsg(t("investments.insufficientValue"));
      return;
    }
    if (computed.qty.lte(0)) {
      setErrorMsg(t("investments.addError"));
      return;
    }

    setSaving(true);

    let normalized = isFixedIncome ? "CDI" : normalizeSymbol(type, symbol);
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
    if (isFixedIncome && !persistedName) {
      const cdiText = fixedCdiMultiplier?.toFixed(0) ?? "100";
      persistedName = `CDI ${cdiText}%`;
    }

    const existing = isFixedIncome ? undefined : existingAssetForForm ?? undefined;

    const nextAvg = isFixedIncome ? computed.total : computed.newAvg;
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
          currency: formCurrency,
          cdi_rate_pct: isFixedIncome ? fixedAnnualCdiPct : null,
          cdi_multiplier_pct: isFixedIncome ? fixedCdiMultiplier : null,
          fixed_started_at: isFixedIncome
            ? new Date((parseLocalDateInputToMs(date) ?? Date.now())).toISOString()
            : null,
        })
        .eq("id", existing.id);
      if (error) {
        const message = getErrorText(error);
        if (message) {
          console.warn("[investments] failed to update asset:", message);
        } else {
          console.warn("[investments] failed to update asset.");
        }
        setSaving(false);
        setErrorMsg(
          isFixedIncomeSchemaError(error)
            ? t("investments.schemaUpdateRequired")
            : t("investments.saveError"),
        );
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
            cdi_rate_pct: isFixedIncome ? fixedAnnualCdiPct : null,
            cdi_multiplier_pct: isFixedIncome ? fixedCdiMultiplier : null,
            fixed_started_at: isFixedIncome
              ? new Date((parseLocalDateInputToMs(date) ?? Date.now())).toISOString()
              : null,
            currency: formCurrency,
          },
        ])
        .select("id")
        .maybeSingle();
      if (error || !data) {
        if (error) {
          const message = getErrorText(error);
          if (message) {
            console.warn("[investments] failed to create asset:", message);
          } else {
            console.warn("[investments] failed to create asset.");
          }
        }
        setSaving(false);
        setErrorMsg(
          isFixedIncomeSchemaError(error)
            ? t("investments.schemaUpdateRequired")
            : t("investments.saveError"),
        );
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
          price_per_share: isFixedIncome ? "1" : priceBig?.toString() ?? "0",
          quantity: computed.qty.toString(),
          total_invested: computed.total.toString(),
          mode_used: isFixedIncome ? "value" : mode,
          input_value:
            isFixedIncome || mode === "value" ? investedBig?.toString() ?? null : null,
        },
      ]);

    if (purchaseError) {
      const message = getErrorText(purchaseError);
      if (message) {
        console.warn("[investments] failed to save purchase:", message);
      } else {
        console.warn("[investments] failed to save purchase.");
      }
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
      next[asset.id] = getExceededMetrics(allQuotes[key], investmentFilter);
    });
    return next;
  }, [assets, allQuotes, investmentFilter]);

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
      fixed: t("investments.categoryFixed"),
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

  const portfolioSummaryByCurrency = useMemo(() => {
    const buckets = new Map<SupportedInvestmentCurrency, {
      currency: SupportedInvestmentCurrency;
      invested: number;
      current: number;
      profit: number;
      assets: number;
    }>();

    assets.forEach((asset) => {
      const assetCurrency = getAssetCurrency(asset);
      const quote = allQuotes[getAssetQuoteKey(asset)];
      const fixedSnapshot = fixedSnapshotByAssetId[asset.id];
      const invested = getInvestmentPrincipal(asset);
      const current = getInvestmentCurrentValue(asset, quote, fixedSnapshot);
      const existing = buckets.get(assetCurrency) ?? {
        currency: assetCurrency,
        invested: 0,
        current: 0,
        profit: 0,
        assets: 0,
      };

      existing.invested += invested;
      existing.current += current;
      existing.profit += current - invested;
      existing.assets += 1;
      buckets.set(assetCurrency, existing);
    });

    return Array.from(buckets.values()).sort((a, b) => a.currency.localeCompare(b.currency));
  }, [allQuotes, assets, fixedSnapshotByAssetId]);

  const portfolioTotals = useMemo(() => {
    return {
      assets: assets.length,
      categories: new Set(assets.map((asset) => getInvestmentCategory(asset))).size,
      positiveResults: assets.filter((asset) => {
        const quote = allQuotes[getAssetQuoteKey(asset)];
        const fixedSnapshot = fixedSnapshotByAssetId[asset.id];
        const invested = getInvestmentPrincipal(asset);
        const current = getInvestmentCurrentValue(asset, quote, fixedSnapshot);
        return current > invested;
      }).length,
    };
  }, [allQuotes, assets, fixedSnapshotByAssetId]);

  const categoryAllocation = useMemo(() => {
    const totalValue = assets.reduce((sum, asset) => {
      const quote = allQuotes[getAssetQuoteKey(asset)];
      const fixedSnapshot = fixedSnapshotByAssetId[asset.id];
      return sum + getInvestmentCurrentValue(asset, quote, fixedSnapshot);
    }, 0);

    const rows = Object.entries(
      assets.reduce<Record<InvestmentCategory, number>>((acc, asset) => {
        const key = getInvestmentCategory(asset);
        const quote = allQuotes[getAssetQuoteKey(asset)];
        const fixedSnapshot = fixedSnapshotByAssetId[asset.id];
        acc[key] = (acc[key] ?? 0) + getInvestmentCurrentValue(asset, quote, fixedSnapshot);
        return acc;
      }, {
        fii: 0,
        etf: 0,
        stock: 0,
        bdr: 0,
        crypto: 0,
        fixed: 0,
        other: 0,
      }),
    )
      .filter(([, value]) => value > 0)
      .map(([key, value]) => ({
        key: key as InvestmentCategory,
        label: categoryLabelByKey[key as InvestmentCategory],
        value,
        share: totalValue > 0 ? (value / totalValue) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);

    return rows;
  }, [allQuotes, assets, categoryLabelByKey, fixedSnapshotByAssetId]);

  const topHoldings = useMemo(() => {
    return assets
      .map((asset) => {
        const quote = allQuotes[getAssetQuoteKey(asset)];
        const fixedSnapshot = fixedSnapshotByAssetId[asset.id];
        const invested = getInvestmentPrincipal(asset);
        const current = getInvestmentCurrentValue(asset, quote, fixedSnapshot);
        const profit = current - invested;
        const assetCurrency = getAssetCurrency(asset);

        return {
          id: asset.id,
          name: getAssetDisplayName(asset),
          typeLabel: getInvestmentTypeLabel(asset, language),
          currency: assetCurrency,
          current,
          invested,
          profit,
        };
      })
      .sort((a, b) => b.current - a.current)
      .slice(0, 5);
  }, [allQuotes, assets, fixedSnapshotByAssetId, language]);

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

      <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <div className="rounded-2xl border border-[#1E232E] bg-[#121621] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#E5E8EF]">
                {language === "pt" ? "Resumo da carteira" : "Portfolio summary"}
              </p>
              <p className="text-xs text-[#8B94A6]">
                {language === "pt"
                  ? "Visao consolidada por moeda dos teus investimentos."
                  : "Consolidated view by currency of your investments."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-full border border-[#2A3344] bg-[#0F121A] px-3 py-1 text-[#9AA3B2]">
                {portfolioTotals.assets} {language === "pt" ? "ativos" : "assets"}
              </span>
              <span className="rounded-full border border-[#2A3344] bg-[#0F121A] px-3 py-1 text-[#9AA3B2]">
                {portfolioTotals.categories} {language === "pt" ? "categorias" : "categories"}
              </span>
              <span className="rounded-full border border-[#235245] bg-[#10241E] px-3 py-1 text-[#7FE3BB]">
                {portfolioTotals.positiveResults} {language === "pt" ? "no lucro" : "in profit"}
              </span>
            </div>
          </div>

          {portfolioSummaryByCurrency.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-[#2A3445] bg-[#0F121A] p-5 text-sm text-[#8B94A6]">
              {t("investments.empty")}
            </div>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {portfolioSummaryByCurrency.map((bucket) => {
                const tone =
                  bucket.profit >= 0
                    ? "text-emerald-300 border-emerald-500/25 bg-emerald-500/5"
                    : "text-rose-300 border-rose-500/25 bg-rose-500/5";
                return (
                  <div
                    key={`summary-${bucket.currency}`}
                    className="rounded-2xl border border-[#1C2332] bg-[#0F121A] p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#E5E8EF]">{bucket.currency}</p>
                      <span className="rounded-full border border-[#2A3344] bg-[#111723] px-2.5 py-1 text-[11px] text-[#9AA3B2]">
                        {bucket.assets} {language === "pt" ? "ativos" : "assets"}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-[#1C2332] bg-[#111723] p-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-[#7F8AA0]">
                          {language === "pt" ? "Investido" : "Invested"}
                        </p>
                        <p className="mt-2 text-lg font-semibold text-[#E5E8EF]">
                          {formatCurrency(bucket.invested, language, bucket.currency)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-[#1C2332] bg-[#111723] p-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-[#7F8AA0]">
                          {language === "pt" ? "Valor atual" : "Current value"}
                        </p>
                        <p className="mt-2 text-lg font-semibold text-[#E5E8EF]">
                          {formatCurrency(bucket.current, language, bucket.currency)}
                        </p>
                      </div>
                    </div>
                    <div className={`mt-3 rounded-xl border p-3 ${tone}`}>
                      <p className="text-[11px] uppercase tracking-[0.18em] opacity-80">
                        {language === "pt" ? "Resultado" : "Result"}
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {bucket.profit >= 0 ? "+" : "-"}
                        {formatCurrency(Math.abs(bucket.profit), language, bucket.currency)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#1E232E] bg-[#121621] p-5">
          <div>
            <p className="text-sm font-semibold text-[#E5E8EF]">
              {language === "pt" ? "Distribuicao por categoria" : "Allocation by category"}
            </p>
            <p className="text-xs text-[#8B94A6]">
              {language === "pt"
                ? "Onde a carteira esta mais concentrada agora."
                : "Where the portfolio is most concentrated right now."}
            </p>
          </div>

          {categoryAllocation.length === 0 ? (
            <p className="mt-4 text-sm text-[#8B94A6]">{t("investments.empty")}</p>
          ) : (
            <div className="mt-4 space-y-3">
              {categoryAllocation.slice(0, 6).map((row) => (
                <div key={`allocation-${row.key}`} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium text-[#E5E8EF]">{row.label}</span>
                    <span className="text-[#8B94A6]">
                      {formatPercent(row.share, language)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#0F121A]">
                    <div
                      className="h-2 rounded-full bg-[#5DD6C7]"
                      style={{ width: `${Math.max(4, Math.min(row.share, 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-[#1E232E] bg-[#121621] p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#E5E8EF]">
              {language === "pt" ? "Maiores posicoes" : "Top holdings"}
            </p>
            <p className="text-xs text-[#8B94A6]">
              {language === "pt"
                ? "Os ativos com maior peso dentro da carteira."
                : "Assets with the biggest weight in the portfolio."}
            </p>
          </div>
        </div>
        {topHoldings.length === 0 ? (
          <p className="text-sm text-[#8B94A6]">{t("investments.empty")}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {topHoldings.map((asset) => (
              <div
                key={`top-${asset.id}`}
                className="rounded-2xl border border-[#1C2332] bg-[#0F121A] p-4"
              >
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#7F8AA0]">
                  {asset.typeLabel}
                </p>
                <p className="mt-2 text-sm font-semibold text-[#E5E8EF]">{asset.name}</p>
                <p className="mt-3 text-lg font-semibold text-[#E5E8EF]">
                  {formatCurrency(asset.current, language, asset.currency)}
                </p>
                <p className="mt-1 text-xs text-[#8B94A6]">
                  {language === "pt" ? "Investido" : "Invested"}:{" "}
                  {formatCurrency(asset.invested, language, asset.currency)}
                </p>
                <p
                  className={`mt-2 text-xs font-semibold ${
                    asset.profit >= 0 ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {language === "pt" ? "Resultado" : "Result"}:{" "}
                  {asset.profit >= 0 ? "+" : "-"}
                  {formatCurrency(Math.abs(asset.profit), language, asset.currency)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

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
          const quote = allQuotes[key];
          const history = allPriceHistory[asset.id] ?? [];
          const fixedSnapshot = fixedSnapshotByAssetId[asset.id];
          const assetCurrency = getAssetCurrency(asset);
          const current = quote?.price ?? getLatestPrice(history);
          const value =
            asset.type === "fixed_income"
              ? fixedSnapshot?.currentValue ?? null
              : current != null
                ? current * asset.quantity
                : null;
          const categoryLabel = categoryLabelByKey[getInvestmentCategory(asset)];
          const summary = buildChartSummary(history);
          const exceededMetrics = exceededMetricsByAssetId[asset.id] ?? [];
          const hasExceededMetrics = investmentFilter.enabled && exceededMetrics.length > 0;
          const exceededLabelText = exceededMetrics
            .map((metricKey) => metricLabelByKey[metricKey])
            .join(", ");
          const exchangeLabel = asset.type === "b3"
            ? `BVMF - ${normalizeB3Symbol(asset.symbol)} · ${assetCurrency}`
            : asset.type === "crypto"
              ? `CRYPTO - ${normalizeCryptoId(asset.symbol).toUpperCase()} · ${assetCurrency}`
              : language === "pt"
                ? `RENDA FIXA - CDI · ${assetCurrency}`
                : `FIXED INCOME - CDI · ${assetCurrency}`;
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
                      ? formatCurrency(summary.current, language, assetCurrency)
                      : "--"}
                  </span>
                  {summary.changePct != null ? (
                    <span
                      className={`text-xs font-semibold ${
                        summary.changePct >= 0 ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      {formatPercent(summary.changePct, language)}{" "}
                      {asset.type === "fixed_income"
                        ? language === "pt"
                          ? "(desde o inicio)"
                          : "(since start)"
                        : language === "pt"
                          ? "(1 ano)"
                          : "(1 year)"}
                    </span>
                  ) : null}
                </div>
                {asset.type === "fixed_income" ? (
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <div className="rounded-md border border-[#232D3F] bg-[#0F121A] px-2 py-1">
                      <p className="text-[10px] text-[#8B94A6]">
                        {language === "pt" ? "CDI anual" : "Annual CDI"}
                      </p>
                      <p className="text-[11px] font-semibold text-[#D8DEE9]">
                        {fixedSnapshot
                          ? formatPlainPercent(fixedSnapshot.annualCdiPct, language)
                          : "--"}
                      </p>
                    </div>
                    <div className="rounded-md border border-[#232D3F] bg-[#0F121A] px-2 py-1">
                      <p className="text-[10px] text-[#8B94A6]">
                        {language === "pt" ? "% do CDI" : "% of CDI"}
                      </p>
                      <p className="text-[11px] font-semibold text-[#D8DEE9]">
                        {fixedSnapshot
                          ? formatPlainPercent(fixedSnapshot.cdiMultiplierPct, language)
                          : "--"}
                      </p>
                    </div>
                    <div className="rounded-md border border-[#232D3F] bg-[#0F121A] px-2 py-1">
                      <p className="text-[10px] text-[#8B94A6]">
                        {language === "pt" ? "Taxa efetiva" : "Effective rate"}
                      </p>
                      <p className="text-[11px] font-semibold text-[#D8DEE9]">
                        {fixedSnapshot
                          ? formatPlainPercent(fixedSnapshot.effectiveAnnualPct, language)
                          : "--"}
                      </p>
                    </div>
                    <div className="rounded-md border border-[#232D3F] bg-[#0F121A] px-2 py-1">
                      <p className="text-[10px] text-[#8B94A6]">
                        {language === "pt" ? "Rendimento" : "Profit"}
                      </p>
                      <p className="text-[11px] font-semibold text-emerald-300">
                        {fixedSnapshot
                          ? formatCurrency(fixedSnapshot.profit, language, assetCurrency)
                          : "--"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {metricConfig.map((metric) => {
                      const metricValue = getMetricValue(quote, metric.key);
                      const isExceeded = exceededMetrics.includes(metric.key);
                      let display = "--";
                      if (metricValue != null) {
                        if (metric.isPercent) {
                          display = formatPlainPercent(metricValue, language);
                        } else if (metric.key === "bookValue") {
                          display = formatCurrency(metricValue, language, assetCurrency);
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
                )}
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
                        tickFormatter={(value) =>
                          formatAxisCurrency(value, language, assetCurrency)
                        }
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
                        formatter={(value) =>
                          formatCurrency(Number(value ?? 0), language, assetCurrency)
                        }
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
                  {value != null ? formatCurrency(value, language, assetCurrency) : "--"}
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

              <div className="grid min-w-0 gap-3 md:grid-cols-2">
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
        <div
          className="fixed inset-0 z-40 overflow-x-hidden overflow-y-auto bg-black/70 px-4 md:flex md:items-center md:justify-center md:px-6"
          style={{
            paddingTop: "max(1rem, env(safe-area-inset-top))",
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          }}
        >
          <div
            className="mx-auto w-full max-w-lg overflow-x-hidden overflow-y-auto rounded-3xl border border-[#1E232E] bg-[#0F121A] p-4 sm:p-5"
            style={{ maxHeight: "calc(100dvh - 2rem)" }}
          >
            {isCreate ? (
              <div className="min-w-0 space-y-4">
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

                <div className="grid min-w-0 gap-3 md:grid-cols-2">
                  <div className="flex min-w-0 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setType("b3");
                        setMode("quantity");
                        setSymbol("");
                        setPreviewQuote(null);
                        setCryptoPickerOpen(false);
                      }}
                      className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-xs ${
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
                        if (type === "b3") {
                          setCurrency(preferredNewInvestmentCurrency);
                        }
                        setMode("quantity");
                        setSymbol("");
                        setSelectedCrypto(null);
                        setCryptoMarket(null);
                        setPreviewQuote(null);
                        setFeaturedCryptoOptions([]);
                        setCryptoPickerOpen(false);
                      }}
                      className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-xs ${
                        type === "crypto"
                          ? "border-[#3A8F8A] bg-[#163137] text-[#DCE3EE]"
                          : "border-[#1C2332] bg-[#0F121A] text-[#DCE3EE]"
                      }`}
                    >
                      {t("investments.crypto")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setType("fixed_income");
                        if (type === "b3") {
                          setCurrency(preferredNewInvestmentCurrency);
                        }
                        setMode("value");
                        setSymbol("CDI");
                        setSelectedCrypto(null);
                        setCryptoMarket(null);
                        setPreviewQuote(null);
                        setFeaturedCryptoOptions([]);
                        setCryptoPickerOpen(false);
                      }}
                      className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-xs ${
                        type === "fixed_income"
                          ? "border-[#3A8F8A] bg-[#163137] text-[#DCE3EE]"
                          : "border-[#1C2332] bg-[#0F121A] text-[#DCE3EE]"
                      }`}
                    >
                      {t("investments.fixedIncome")}
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
                          <span className="min-w-0 truncate text-left">
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
                    ) : type === "fixed_income" ? (
                      <div className="rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2">
                        <p className="text-sm font-semibold text-[#E4E7EC]">
                          {t("investments.fixedIncome")}
                        </p>
                        <p className="mt-1 text-[11px] text-[#8B94A6]">
                          {t("investments.fixedIncomeHint")}
                        </p>
                        <p className="mt-1 text-[11px] text-[#8B94A6]">CDI</p>
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

                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[#8B94A6]">
                    {t("investments.currency")}
                  </p>
                  <div className="flex min-w-0 gap-2">
                    {(["BRL", "EUR"] as const).map((option) => {
                      const disabled = !canSelectInvestmentCurrency(type) && option !== "BRL";
                      const active = formCurrency === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setCurrency(option)}
                          disabled={disabled}
                          className={`flex-1 rounded-xl border px-3 py-2 text-left text-xs transition ${
                            active
                              ? "border-[#3A8F8A] bg-[#163137] text-[#DCE3EE]"
                              : "border-[#1C2332] bg-[#0F121A] text-[#DCE3EE]"
                          } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                        >
                          <span className="block font-semibold">{option}</span>
                          <span className="block text-[10px] text-[#8B94A6]">
                            {option === "BRL"
                              ? t("investments.currencyBrl")
                              : t("investments.currencyEur")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {!canSelectInvestmentCurrency(type) ? (
                    <p className="text-[11px] text-[#8B94A6]">
                      {t("investments.currencyLockedB3")}
                    </p>
                  ) : null}
                </div>

                {type !== "fixed_income" ? (
                  <div className="flex min-w-0 gap-2">
                    <button
                      type="button"
                      onClick={() => setMode("quantity")}
                      className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-xs ${
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
                      className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-xs ${
                        mode === "value"
                          ? "border-[#3A8F8A] bg-[#163137] text-[#DCE3EE]"
                          : "border-[#1C2332] bg-[#0F121A] text-[#DCE3EE]"
                      }`}
                    >
                      {t("investments.modeValue")}
                    </button>
                  </div>
                ) : null}

                <div className="grid min-w-0 gap-3 md:grid-cols-2">
                  {type === "fixed_income" ? (
                    <>
                      <input
                        value={investedValue}
                        onChange={(event) =>
                          setInvestedValue(
                            formatCentsInputForCurrency(event.target.value, formCurrency),
                          )
                        }
                        placeholder={t("investments.investedValue")}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2 text-sm text-[#E4E7EC]"
                      />
                      <input
                        value={fixedCdiRatePct}
                        onChange={(event) => setFixedCdiRatePct(event.target.value)}
                        placeholder={t("investments.fixedCdiRate")}
                        inputMode="decimal"
                        className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2 text-sm text-[#E4E7EC]"
                      />
                      <input
                        value={fixedCdiMultiplierPct}
                        onChange={(event) => setFixedCdiMultiplierPct(event.target.value)}
                        placeholder={t("investments.fixedCdiMultiplier")}
                        inputMode="decimal"
                        className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2 text-sm text-[#E4E7EC]"
                      />
                      <div className="rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2">
                        <p className="text-[11px] text-[#8B94A6]">
                          {t("investments.fixedEffectiveRate")}
                        </p>
                        <p className="text-sm font-semibold text-[#E5E8EF]">
                          {fixedPreviewSnapshot
                            ? formatPlainPercent(fixedPreviewSnapshot.effectiveAnnualPct, language)
                            : "--"}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
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
                          onChange={(event) =>
                            setInvestedValue(
                              formatCentsInputForCurrency(event.target.value, formCurrency),
                            )
                          }
                          placeholder={t("investments.investedValue")}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2 text-sm text-[#E4E7EC]"
                        />
                      )}
                      <div>
                        <input
                        value={manualPrice}
                        onChange={(event) =>
                          setManualPrice(
                            formatCentsInputForCurrency(event.target.value, formCurrency),
                          )
                        }
                          placeholder={t("investments.manualPrice")}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2 text-sm text-[#E4E7EC]"
                        />
                        <p className="mt-1 text-[11px] text-[#8B94A6]">
                          {t("investments.manualPriceHint")}
                        </p>
                      </div>
                    </>
                  )}
                </div>

                <div className="grid min-w-0 gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2">
                    <p className="text-[11px] text-[#8B94A6]">
                      {t("investments.total")}
                    </p>
                    <p className="text-sm font-semibold text-[#E5E8EF]">
                      {(type === "fixed_income" || priceBig) && computed.qty.gt(0)
                        ? formatCurrency(Number(computed.total.toString()), language, formCurrency)
                        : "--"}
                    </p>
                  </div>
                  {type === "fixed_income" ? (
                    <>
                      <div className="rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2">
                        <p className="text-[11px] text-[#8B94A6]">
                          {t("investments.fixedLiveValue")}
                        </p>
                        <p className="text-sm font-semibold text-[#E5E8EF]">
                          {fixedPreviewSnapshot
                            ? formatCurrency(
                                fixedPreviewSnapshot.currentValue,
                                language,
                                formCurrency,
                              )
                            : "--"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2">
                        <p className="text-[11px] text-[#8B94A6]">
                          {t("investments.fixedProfit")}
                        </p>
                        <p className="text-sm font-semibold text-emerald-300">
                          {fixedPreviewSnapshot
                            ? formatCurrency(
                                fixedPreviewSnapshot.profit,
                                language,
                                formCurrency,
                              )
                            : "--"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2">
                        <p className="text-[11px] text-[#8B94A6]">
                          {t("investments.fixedDailyEstimate")}
                        </p>
                        <p className="text-sm font-semibold text-[#E5E8EF]">
                          {fixedPreviewSnapshot
                            ? formatCurrency(
                                fixedPreviewSnapshot.estimatedDailyProfit,
                                language,
                                formCurrency,
                              )
                            : "--"}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2">
                        <p className="text-[11px] text-[#8B94A6]">
                          {t("investments.currentPrice")}
                        </p>
                        <p className="text-sm font-semibold text-[#E5E8EF]">
                          {displayPrice != null
                            ? formatCurrency(displayPrice, language, formCurrency)
                            : "--"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2">
                        <p className="text-[11px] text-[#8B94A6]">
                          {t("investments.currentAvg")}
                        </p>
                        <p className="text-sm font-semibold text-[#E5E8EF]">
                          {currentAvg.gt(0)
                            ? formatCurrency(Number(currentAvg.toString()), language, formCurrency)
                            : "--"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2">
                        <p className="text-[11px] text-[#8B94A6]">
                          {t("investments.newAvg")}
                        </p>
                        <p className="text-sm font-semibold text-[#E5E8EF]">
                          {computed.newAvg.gt(0)
                            ? formatCurrency(
                                Number(computed.newAvg.toString()),
                                language,
                                formCurrency,
                              )
                            : "--"}
                        </p>
                      </div>
                    </>
                  )}
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
                  <div className="grid min-w-0 gap-3 md:grid-cols-2">
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
                          ? formatCurrency(cryptoMarket.marketCap, language, formCurrency)
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
                          ? formatCurrency(cryptoMarket.low24h, language, formCurrency)
                          : "--"}{" "}
                        -{" "}
                        {cryptoMarket?.high24h != null
                          ? formatCurrency(cryptoMarket.high24h, language, formCurrency)
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

                {type === "fixed_income" ? (
                  <div className="rounded-xl border border-[#1E232E] bg-[#121621] px-3 py-2">
                    <p className="text-[11px] text-[#8B94A6]">
                      {t("investments.fixedRealtimeNote")}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#E5E8EF]">
                      {fixedPreviewSnapshot
                        ? `${formatCurrency(fixedPreviewSnapshot.currentValue, language, formCurrency)} · ${formatPlainPercent(fixedPreviewSnapshot.effectiveAnnualPct, language)}`
                        : "--"}
                    </p>
                    <p className="mt-1 text-[11px] text-[#8B94A6]">
                      {fixedPreviewSnapshot
                        ? `${language === "pt" ? "Dias corridos" : "Elapsed days"}: ${Math.floor(fixedPreviewSnapshot.elapsedDays)}`
                        : "--"}
                    </p>
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
              <div className="min-w-0 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#E5E8EF]">
                      {activeAsset.name || activeAsset.symbol.toUpperCase()}
                    </p>
                    <p className="text-xs text-[#8B94A6]">
                      {activeAsset.type === "b3"
                        ? "B3"
                        : activeAsset.type === "crypto"
                          ? "Cripto"
                          : language === "pt"
                            ? "Renda fixa"
                            : "Fixed income"} -{" "}
                      {activeAsset.symbol} · {activeAssetCurrency}
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
                              {formatCurrency(
                                Number(purchase.price_per_share) || 0,
                                language,
                                activeAssetCurrency,
                              )}
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
                                activeAssetCurrency,
                              )}
                            </div>
                            {purchase.input_value ? (
                              <div>
                                {t("investments.investedValue")}{" "}
                                {formatCurrency(
                                  Number(purchase.input_value) || 0,
                                  language,
                                  activeAssetCurrency,
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
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[#8B94A6]">
                      {t("investments.currency")}
                    </p>
                    <div className="flex min-w-0 gap-2">
                      {(["BRL", "EUR"] as const).map((option) => {
                        const disabled =
                          !canSelectInvestmentCurrency(activeAsset.type) && option !== "BRL";
                        const active = editAssetCurrency === option;
                        return (
                          <button
                            key={`${activeAsset.id}-${option}`}
                            type="button"
                            onClick={() => setEditCurrency(option)}
                            disabled={disabled}
                            className={`flex-1 rounded-xl border px-3 py-2 text-left text-xs transition ${
                              active
                                ? "border-[#3A8F8A] bg-[#163137] text-[#DCE3EE]"
                                : "border-[#1C2332] bg-[#0F121A] text-[#DCE3EE]"
                            } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                          >
                            <span className="block font-semibold">{option}</span>
                            <span className="block text-[10px] text-[#8B94A6]">
                              {option === "BRL"
                                ? t("investments.currencyBrl")
                                : t("investments.currencyEur")}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {!canSelectInvestmentCurrency(activeAsset.type) ? (
                      <p className="text-[11px] text-[#8B94A6]">
                        {t("investments.currencyLockedB3")}
                      </p>
                    ) : null}
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

