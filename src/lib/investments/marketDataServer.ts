import { getCoinGeckoCurrency, type SupportedInvestmentCurrency } from "../../../shared/investmentCurrency";

export type Quote = {
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

export type PricePoint = {
  time: number;
  price: number;
};

export type CryptoMarketSnapshot = {
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

const BRAPI_KEY = process.env.BRAPI_KEY ?? process.env.NEXT_PUBLIC_BRAPI_KEY;
const B3_SUFFIX = ".SA";
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
const INVESTIDOR10_PROXY_PREFIXES = [
  "https://api.codetabs.com/v1/proxy/?quest=",
  "https://api.allorigins.win/raw?url=",
];
const investidor10FundamentalsCache = new Map<string, Partial<Quote> | null>();

let brapiBlockedUntil = 0;
let brapiUseToken = Boolean(BRAPI_KEY);
let brapiHistoryRange = "1y";
const badB3Symbols = new Set<string>();

function toPoints(entries: Array<{ time: number; price: number }> | PricePoint[]) {
  return entries
    .map((entry) => ({
      time: Number(entry?.time ?? 0),
      price: Number(entry?.price ?? 0),
    }))
    .filter((entry) => entry.time && entry.price)
    .sort((a, b) => a.time - b.time);
}

export function normalizeB3Symbol(value: string) {
  return value.toUpperCase().replace(/\s+/g, "").replace(B3_SUFFIX, "");
}

export function normalizeCryptoId(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, "");
}

type BrapiQuoteResult = {
  symbol?: unknown;
  regularMarketPrice?: unknown;
  regularMarketChangePercent?: unknown;
  dividendYield?: unknown;
  dividend_yield?: unknown;
  regularMarketDividendYield?: unknown;
  trailingAnnualDividendYield?: unknown;
  priceToBook?: unknown;
  priceToBookRatio?: unknown;
  pvp?: unknown;
  sharesOutstanding?: unknown;
  totalShares?: unknown;
  shares?: unknown;
  bookValue?: unknown;
  netWorth?: unknown;
  patrimonialValue?: unknown;
  vacancy?: unknown;
  vacancia?: unknown;
  vacancyRate?: unknown;
  logourl?: unknown;
  logoUrl?: unknown;
  logo?: unknown;
  longName?: unknown;
  shortName?: unknown;
  historicalDataPrice?: unknown;
  historicalData?: unknown;
  prices?: unknown;
};

type BrapiHistoryEntry = {
  date?: unknown;
  timestamp?: unknown;
  time?: unknown;
  datetime?: unknown;
  close?: unknown;
  adjustedClose?: unknown;
  price?: unknown;
  value?: unknown;
};

type CoinGeckoMarketItem = {
  id?: unknown;
  symbol?: unknown;
  name?: unknown;
  image?: unknown;
  market_cap_rank?: unknown;
  current_price?: unknown;
  price_change_percentage_24h?: unknown;
  market_cap?: unknown;
  total_volume?: unknown;
  high_24h?: unknown;
  low_24h?: unknown;
};

type Investidor10QuotePoint = {
  price?: unknown;
  created_at?: unknown;
};

type Investidor10QuoteResponse = {
  real?: Investidor10QuotePoint[];
  dolar?: Investidor10QuotePoint[];
  euro?: Investidor10QuotePoint[];
};

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

function extractBrapiErrorDetails(payload: unknown) {
  const data = payload as {
    code?: unknown;
    errorCode?: unknown;
    error?: { code?: unknown; message?: unknown } | string;
    errors?: Array<{ code?: unknown; message?: unknown }>;
    message?: unknown;
    error_description?: unknown;
  } | null;
  const codeCandidates = [
    data?.code,
    data?.errorCode,
    typeof data?.error === "object" ? data?.error?.code : undefined,
    data?.errors?.[0]?.code,
  ];
  const messageCandidates = [
    data?.message,
    data?.error_description,
    typeof data?.error === "object" ? data?.error?.message : undefined,
    typeof data?.error === "string" ? data.error : undefined,
    data?.errors?.[0]?.message,
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

async function fetchJsonWithTimeout<T>(url: string, timeoutMs: number): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
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

function extractInvestidor10ChartId(content: string) {
  return (
    extractRegexValue(
      content,
      /urlQuotationBaseBr\s*=\s*['"]https:\/\/investidor10\.com\.br\/api\/fii\/cotacoes\/chart\/(\d+)\//i,
    ) ??
    extractRegexValue(
      content,
      /urlQuotationBase\s*=\s*['"]https:\/\/investidor10\.com\.br\/api\/fii\/cotacoes\/chart\/(\d+)\//i,
    )
  );
}

function extractInvestidor10AssetName(content: string) {
  return (
    extractRegexValue(content, /<title>\s*([^<]+?)\s*-\s*Investidor10<\/title>/i) ??
    extractRegexValue(content, /<meta property=["']twitter:title["'] content=["']([^"']+)["']/i)
  );
}

function parseInvestidor10Points(data: Investidor10QuoteResponse | null | undefined) {
  const points = Array.isArray(data?.real) ? data.real : [];
  return points
    .map((entry) => {
      const price = Number(entry?.price ?? 0);
      const rawDate = typeof entry?.created_at === "string" ? entry.created_at : "";
      if (!price || !rawDate) return null;
      const normalizedDate = rawDate.includes("/")
        ? rawDate.split("/").reverse().join("-")
        : rawDate.replace(" ", "T");
      const time = Date.parse(normalizedDate);
      if (!time || Number.isNaN(time)) return null;
      return { time, price };
    })
    .filter((entry): entry is PricePoint => entry != null);
}

async function fetchFiiQuoteFromInvestidor10(normalized: string): Promise<Quote | null> {
  const pageUrl = `https://investidor10.com.br/fiis/${normalized.toLowerCase()}/`;
  const html = await fetchTextWithTimeout(pageUrl, 12000);
  if (!html) return null;

  const intraday = await fetchJsonWithTimeout<Investidor10QuoteResponse>(
    `https://investidor10.com.br/api/quotations/one-day/${encodeURIComponent(normalized)}/`,
    12000,
  );
  const points = parseInvestidor10Points(intraday);
  const lastPoint = points[points.length - 1] ?? null;
  if (!lastPoint) return null;
  const firstPoint = points[0] ?? lastPoint;
  const changePct =
    firstPoint.price > 0 ? ((lastPoint.price - firstPoint.price) / firstPoint.price) * 100 : null;

  const quote: Quote = {
    price: lastPoint.price,
    changePct,
    assetName: extractInvestidor10AssetName(html),
  };

  const fundamentals = parseInvestidor10FiiFundamentals(html);
  if (fundamentals) {
    quote.dyPct = fundamentals.dyPct ?? null;
    quote.pVp = fundamentals.pVp ?? null;
    quote.sharesOutstanding = fundamentals.sharesOutstanding ?? null;
    quote.bookValue = fundamentals.bookValue ?? null;
    quote.vacancyPct = fundamentals.vacancyPct ?? null;
  }

  return quote;
}

async function fetchFiiHistoryFromInvestidor10(normalized: string): Promise<PricePoint[]> {
  const pageUrl = `https://investidor10.com.br/fiis/${normalized.toLowerCase()}/`;
  const html = await fetchTextWithTimeout(pageUrl, 12000);
  if (!html) return [];
  const chartId = extractInvestidor10ChartId(html);
  if (!chartId) return [];

  const payload = await fetchJsonWithTimeout<Investidor10QuoteResponse>(
    `https://investidor10.com.br/api/fii/cotacoes/chart/${encodeURIComponent(chartId)}/365/false`,
    12000,
  );
  const points = parseInvestidor10Points(payload);
  return points.length ? toPoints(points) : [];
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

export async function fetchSingleB3Quote(
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
    const results = Array.isArray(json?.results)
      ? (json.results as BrapiQuoteResult[])
      : [];
    const item = results.find(
      (result) =>
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
      const withoutToken = await requestQuote(false);
      if (withoutToken) return withoutToken;
    }
    if (shouldUseFiiFallback(normalized, null)) {
      return await fetchFiiQuoteFromInvestidor10(normalized);
    }
    return null;
  } catch {
    handleBrapiFailure(0, normalized, brapiUseToken && Boolean(BRAPI_KEY));
    if (shouldUseFiiFallback(normalized, null)) {
      return await fetchFiiQuoteFromInvestidor10(normalized);
    }
    return null;
  }
}

export async function fetchB3History(symbol: string): Promise<PricePoint[]> {
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
    const results = Array.isArray(json?.results)
      ? (json.results as BrapiQuoteResult[])
      : [];
    const item = results.find(
      (result) =>
        result?.symbol &&
        normalizeB3Symbol(String(result.symbol)) === normalized,
    );
    const historySource = item?.historicalDataPrice ?? item?.historicalData ?? item?.prices;
    const history = Array.isArray(historySource) ? (historySource as BrapiHistoryEntry[]) : [];
    const points = history
      .map((entry) => {
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
  if (shouldUseFiiFallback(normalized, null)) {
    return await fetchFiiHistoryFromInvestidor10(normalized);
  }
  return [];
}

export async function fetchCryptoSimplePrices(
  ids: string[],
  currency: SupportedInvestmentCurrency,
) {
  const normalizedIds = ids.map((id) => normalizeCryptoId(id)).filter(isLikelyCryptoId);
  if (!normalizedIds.length) return {};
  const vsCurrency = getCoinGeckoCurrency(currency, "crypto");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${normalizedIds.join(
    ",",
  )}&vs_currencies=${vsCurrency}&include_24hr_change=true`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return {};
  const json = await res.json();
  return normalizedIds.reduce<Record<string, Quote>>((acc, id) => {
    const entry = json?.[id];
    const price = entry?.[vsCurrency];
    if (price == null) return acc;
    acc[id] = {
      price: Number(price) || 0,
      changePct:
        entry?.[`${vsCurrency}_24h_change`] != null
          ? Number(entry[`${vsCurrency}_24h_change`])
          : null,
    };
    return acc;
  }, {});
}

export async function fetchCryptoMarketSnapshot(
  id: string,
  currency: SupportedInvestmentCurrency,
): Promise<CryptoMarketSnapshot | null> {
  const normalizedId = normalizeCryptoId(id);
  if (!isLikelyCryptoId(normalizedId)) return null;
  const vsCurrency = getCoinGeckoCurrency(currency, "crypto");
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${vsCurrency}&ids=${encodeURIComponent(
        normalizedId,
      )}&price_change_percentage=24h`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const items = Array.isArray(json) ? (json as CoinGeckoMarketItem[]) : [];
    const first = items[0] ?? null;
    if (!first || first.current_price == null) return null;
    return {
      id: String(first.id ?? normalizedId),
      symbol: String(first.symbol ?? ""),
      name: String(first.name ?? normalizedId),
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
  } catch {
    return null;
  }
}

export async function fetchCryptoHistory(
  symbol: string,
  currency: SupportedInvestmentCurrency,
): Promise<PricePoint[]> {
  const id = normalizeCryptoId(symbol);
  if (!isLikelyCryptoId(id)) return [];
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
  } catch {
    return [];
  }
}

export async function fetchFeaturedCryptoOptions(
  ids: string[],
  currency: SupportedInvestmentCurrency,
) {
  const normalizedIds = ids.map((id) => normalizeCryptoId(id)).filter(isLikelyCryptoId);
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
    const entries = (Array.isArray(json) ? (json as CoinGeckoMarketItem[]) : [])
      .map((item) => {
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
  } catch {
    return [];
  }
}
