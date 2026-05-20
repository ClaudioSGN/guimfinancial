export type B3AssetSection = "fiis" | "acoes" | "etfs" | "bdrs";

export type B3Snapshot = {
  symbol: string;
  section: B3AssetSection;
  sourceUrl: string;
  assetName: string | null;
  logoUrl: string | null;
  price: number | null;
  changePct: number | null;
  dyPct: number | null;
  pVp: number | null;
  sharesOutstanding: number | null;
  bookValue: number | null;
  vacancyPct: number | null;
};

export type B3HistoryPoint = {
  time: number;
  price: number;
};

type StockIndicators = {
  p_vp?: unknown;
  vpa?: unknown;
  total_tickers?: unknown;
  variation_12_months?: unknown;
  dividend_yield_last_12_months?: unknown;
  balance_net_worth?: unknown;
};

const INVESTIDOR10_BASE_URL = "https://investidor10.com.br";
const INVESTIDOR10_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
};
const INVESTIDOR10_JSON_HEADERS = {
  ...INVESTIDOR10_HEADERS,
  accept: "application/json,text/plain,*/*",
};

function normalizeB3Symbol(value: string) {
  return value.toUpperCase().replace(/\s+/g, "").replace(/\.SA$/i, "");
}

function normalizeCategoryText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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
  if (!/[ÃÂâ€]/.test(value)) return value;
  try {
    return Buffer.from(value, "latin1").toString("utf8");
  } catch {
    return value;
  }
}

function htmlToText(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

function extractRegexValue(content: string, pattern: RegExp) {
  const match = content.match(pattern);
  return match?.[1]?.trim() ?? null;
}

function extractJsonObject<T>(content: string, variableName: string): T | null {
  const raw = extractRegexValue(
    content,
    new RegExp(`${variableName}\\s*=\\s*({[\\s\\S]*?});`, "i"),
  );
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
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
    extractRegexValue(
      content,
      /<div[^>]*class=["'][^"']*content--info--item[^"']*["'][^>]*>\s*<span[^>]*class=["'][^"']*content--info--item--title[^"']*["'][^>]*>\s*N[U\u00da]MERO DE COTAS\s*<\/span>\s*<span[^>]*class=["'][^"']*content--info--item--value[^"']*["'][^>]*>\s*([^<]+?)\s*<\/span>/i,
    ) ??
    extractInvestidor10InfoValue(content, "COTAS\\s+EMITIDAS") ??
    extractRegexValue(
      content,
      /COTAS\s+EMITIDAS[\s\S]*?<div[^>]*class=["']value["'][^>]*>\s*<span>\s*([^<]+?)\s*<\/span>/i,
    ) ??
    extractRegexValue(
      content,
      /content--info--item--title[^>]*>\s*N[U\u00da]MERO DE COTAS\s*<\/span>[\s\S]*?content--info--item--value[^>]*>\s*([^<]+?)\s*<\/span>/i,
    );
  const bookValueText =
    extractRegexValue(
      content,
      /<div[^>]*class=["'][^"']*content--info--item[^"']*["'][^>]*>\s*<span[^>]*class=["'][^"']*content--info--item--title[^"']*["'][^>]*>\s*VALOR PATRIMONIAL\s*<\/span>\s*<span[^>]*class=["'][^"']*content--info--item--value[^"']*["'][^>]*>\s*([^<]+?)\s*<\/span>/i,
    ) ??
    extractInvestidor10InfoValue(content, "VALOR\\s+PATRIMONIAL") ??
    extractRegexValue(
      content,
      /VALOR\s+PATRIMONIAL[\s\S]*?<div[^>]*class=["']value["'][^>]*>\s*<span>\s*([^<]+?)\s*<\/span>/i,
    ) ??
    extractRegexValue(
      content,
      /content--info--item--title[^>]*>\s*VALOR PATRIMONIAL\s*<\/span>[\s\S]*?content--info--item--value[^>]*>\s*([^<]+?)\s*<\/span>/i,
    );
  const vacancyText =
    extractInvestidor10InfoValue(content, "VAC[\\u00c2A]NCIA") ??
    extractRegexValue(
      content,
      /VAC[^<]*NCIA[\s\S]*?<div[^>]*class=["']value["'][^>]*>\s*<span>\s*([^<]+?)\s*<\/span>/i,
    );

  return {
    dyPct: normalizePercentValue(dyText),
    pVp: parseNumberish(pvpText),
    sharesOutstanding: parseNumberWithScale(sharesText),
    bookValue: parseNumberWithScale(bookValueText),
    vacancyPct: normalizePercentValue(vacancyText),
  };
}

function parseNarrativeMetrics(content: string) {
  const text = htmlToText(content);
  const price =
    parseNumberish(
      extractRegexValue(
        text,
        /Atualmente,[\s\S]{0,220}?est[aá]\s+cota(?:do|da)\s+a\s+R\$\s*([0-9.,]+)/i,
      ) ??
        extractRegexValue(text, /cota[cç][aã]o atual(?:izada)?[^R$]*R\$\s*([0-9.,]+)/i),
    ) ?? null;
  const changePct =
    normalizePercentValue(
      extractRegexValue(
        text,
        /No [uú]ltimo ano,[\s\S]{0,180}?varia[cç][aã]o de\s*([+-]?[0-9.,]+)%/i,
      ) ??
        extractRegexValue(
          text,
          /apresentou uma varia[cç][aã]o de\s*([+-]?[0-9.,]+)%/i,
        ),
    ) ?? null;
  const dyPct =
    normalizePercentValue(
      extractRegexValue(
        text,
        /Dividend Yield(?: no per[ií]odo)?(?: de)?\s*([0-9.,]+)%/i,
      ) ?? extractRegexValue(text, /DY\s*\(12M\)\s*:?\s*([0-9.,]+)%/i),
    ) ?? null;

  return { price, changePct, dyPct };
}

function parseAssetName(content: string, symbol: string) {
  const title = extractRegexValue(content, /<title>\s*([^<]+?)\s*<\/title>/i);
  if (!title) return null;
  const cleaned = repairUtf8Mojibake(decodeHtmlEntities(title))
    .replace(/\s*-\s*Investidor10.*$/i, "")
    .replace(/\s*\|\s*Investidor10.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  const segments = cleaned.split(" - ").map((part) => part.trim()).filter(Boolean);
  if (segments.length >= 3 && normalizeB3Symbol(segments[0]) === symbol) {
    return segments[1] || segments[0];
  }
  if (segments.length >= 1 && segments[0].toUpperCase().includes(symbol)) {
    return segments[0];
  }
  return cleaned.includes(symbol) ? cleaned : `${symbol} - ${cleaned}`;
}

function absolutizeInvestidor10Url(url: string | null) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${INVESTIDOR10_BASE_URL}${url}`;
  return `${INVESTIDOR10_BASE_URL}/${url.replace(/^\/+/, "")}`;
}

function parseLogoUrl(content: string, symbol: string, section: B3AssetSection) {
  if (section === "fiis") {
    return `${INVESTIDOR10_BASE_URL}/assets/front/icons/building.svg`;
  }

  const matchedByAlt =
    extractRegexValue(
      content,
      new RegExp(
        `<img[^>]+src=["']([^"']+)["'][^>]+alt=["']${symbol}["']`,
        "i",
      ),
    ) ??
    extractRegexValue(
      content,
      new RegExp(
        `<img[^>]+alt=["']${symbol}["'][^>]+src=["']([^"']+)["']`,
        "i",
      ),
    );
  if (matchedByAlt) {
    return absolutizeInvestidor10Url(matchedByAlt);
  }

  const structuredImage = extractRegexValue(
    content,
    /"image"\s*:\s*{\s*"@type"\s*:\s*"ImageObject"\s*,\s*"url"\s*:\s*"([^"]+)"/i,
  );
  if (structuredImage && !/logo_share\.jpg/i.test(structuredImage)) {
    return absolutizeInvestidor10Url(structuredImage);
  }

  return null;
}

function parseStockLikeIndicators(content: string) {
  const rawIndicators = extractJsonObject<StockIndicators>(content, "_sectorIndicators");
  if (!rawIndicators) return null;
  return {
    pVp: parseNumberish(rawIndicators.p_vp),
    sharesOutstanding: parseNumberish(rawIndicators.total_tickers),
    bookValue:
      parseNumberish(rawIndicators.vpa) ??
      parseNumberish(rawIndicators.balance_net_worth),
    changePct: normalizePercentValue(rawIndicators.variation_12_months),
    dyPct: normalizePercentValue(rawIndicators.dividend_yield_last_12_months),
  };
}

function parseInvestidor10Date(value: unknown) {
  if (typeof value !== "string") return 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;

  const isoMatch = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (isoMatch) {
    const [, year, month, day, hour = "00", minute = "00", second = "00"] = isoMatch;
    return Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
  }

  const brMatch = trimmed.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (brMatch) {
    const [, day, month, year, hour = "00", minute = "00", second = "00"] = brMatch;
    return Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function extractHistoryBaseUrl(content: string) {
  return (
    absolutizeInvestidor10Url(
      extractRegexValue(content, /urlQuotationBase(?:Br)?\s*=\s*['"]([^'"]+)['"]/i) ??
        extractRegexValue(content, /quotations:\s*['"]([^'"]+)['"]/i),
    ) ?? null
  );
}

export function parseB3HistoryPayload(payload: unknown): B3HistoryPoint[] {
  let entries: unknown[] = [];
  if (Array.isArray(payload)) {
    entries = payload;
  } else if (payload && typeof payload === "object") {
    const objectPayload = payload as Record<string, unknown>;
    if (Array.isArray(objectPayload.real)) {
      entries = objectPayload.real;
    } else if (Array.isArray(objectPayload.dolar)) {
      entries = objectPayload.dolar;
    } else if (Array.isArray(objectPayload.dollar)) {
      entries = objectPayload.dollar;
    } else {
      const firstArray = Object.values(objectPayload).find(Array.isArray);
      if (Array.isArray(firstArray)) {
        entries = firstArray;
      }
    }
  }

  return entries
    .map((entry) => {
      const item = entry as Record<string, unknown>;
      const time =
        parseInvestidor10Date(item?.created_at) ||
        parseInvestidor10Date(item?.date) ||
        parseInvestidor10Date(item?.timestamp);
      const price =
        parseNumberish(item?.price) ??
        parseNumberish(item?.quotation) ??
        parseNumberish(item?.close) ??
        parseNumberish(item?.value);
      if (!time || price == null || price <= 0) return null;
      return { time, price };
    })
    .filter(Boolean)
    .sort((left, right) => left!.time - right!.time) as B3HistoryPoint[];
}

export function guessB3AssetSections(
  symbol: string,
  name?: string | null,
): B3AssetSection[] {
  const normalizedSymbol = normalizeB3Symbol(symbol);
  const normalizedName = normalizeCategoryText(name);
  const isBdr = normalizedName.includes("bdr") || /34$/.test(normalizedSymbol);
  const isEtf =
    normalizedName.includes("etf") ||
    normalizedName.includes("fundo de indice") ||
    normalizedName.includes("fundo indice") ||
    normalizedName.includes("index fund");
  const isFii =
    normalizedName.includes("fii") || normalizedName.includes("fundo imobili");

  if (isBdr) return ["bdrs", "acoes"];
  if (isEtf) return ["etfs", "acoes"];
  if (isFii) return ["fiis", "etfs", "acoes"];
  if (/11$/.test(normalizedSymbol)) return ["fiis", "etfs", "acoes"];
  return ["acoes", "bdrs", "etfs"];
}

export function parseB3SnapshotFromHtml(params: {
  symbol: string;
  section: B3AssetSection;
  sourceUrl: string;
  html: string;
}): B3Snapshot | null {
  const normalizedSymbol = normalizeB3Symbol(params.symbol);
  const narrative = parseNarrativeMetrics(params.html);
  const fiiFundamentals =
    params.section === "fiis" ? parseInvestidor10FiiFundamentals(params.html) : null;
  const stockIndicators =
    params.section === "acoes" || params.section === "bdrs"
      ? parseStockLikeIndicators(params.html)
      : null;

  const snapshot: B3Snapshot = {
    symbol: normalizedSymbol,
    section: params.section,
    sourceUrl: params.sourceUrl,
    assetName: parseAssetName(params.html, normalizedSymbol),
    logoUrl: parseLogoUrl(params.html, normalizedSymbol, params.section),
    price: narrative.price,
    changePct: narrative.changePct ?? stockIndicators?.changePct ?? null,
    dyPct: narrative.dyPct ?? stockIndicators?.dyPct ?? fiiFundamentals?.dyPct ?? null,
    pVp: stockIndicators?.pVp ?? fiiFundamentals?.pVp ?? null,
    sharesOutstanding:
      stockIndicators?.sharesOutstanding ?? fiiFundamentals?.sharesOutstanding ?? null,
    bookValue: stockIndicators?.bookValue ?? fiiFundamentals?.bookValue ?? null,
    vacancyPct: fiiFundamentals?.vacancyPct ?? null,
  };

  const hasUsefulData =
    snapshot.price != null ||
    snapshot.dyPct != null ||
    snapshot.pVp != null ||
    snapshot.sharesOutstanding != null ||
    snapshot.bookValue != null ||
    snapshot.vacancyPct != null;

  return hasUsefulData ? snapshot : null;
}

async function fetchInvestidor10Html(section: B3AssetSection, symbol: string) {
  const normalizedSymbol = normalizeB3Symbol(symbol).toLowerCase();
  const sourceUrl = `${INVESTIDOR10_BASE_URL}/${section}/${normalizedSymbol}/`;
  const response = await fetch(sourceUrl, {
    cache: "no-store",
    headers: INVESTIDOR10_HEADERS,
  });
  if (!response.ok) return null;
  return {
    sourceUrl,
    html: await response.text(),
  };
}

async function fetchInvestidor10Json(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: INVESTIDOR10_JSON_HEADERS,
  });
  if (!response.ok) return null;
  return response.json();
}

export async function fetchB3Snapshot(
  symbol: string,
  name?: string | null,
): Promise<B3Snapshot | null> {
  const normalizedSymbol = normalizeB3Symbol(symbol);
  const sections = guessB3AssetSections(normalizedSymbol, name);

  for (const section of sections) {
    try {
      const page = await fetchInvestidor10Html(section, normalizedSymbol);
      if (!page) continue;
      const parsed = parseB3SnapshotFromHtml({
        symbol: normalizedSymbol,
        section,
        sourceUrl: page.sourceUrl,
        html: page.html,
      });
      if (parsed) return parsed;
    } catch {
      // Try the next candidate section for this symbol.
    }
  }

  return null;
}

export async function fetchB3History(
  symbol: string,
  name?: string | null,
): Promise<B3HistoryPoint[]> {
  const normalizedSymbol = normalizeB3Symbol(symbol);
  const sections = guessB3AssetSections(normalizedSymbol, name);

  for (const section of sections) {
    try {
      const page = await fetchInvestidor10Html(section, normalizedSymbol);
      if (!page) continue;
      const historyBaseUrl = extractHistoryBaseUrl(page.html);
      if (!historyBaseUrl) continue;
      const historyPayload =
        (await fetchInvestidor10Json(`${historyBaseUrl}365/false`)) ??
        (await fetchInvestidor10Json(`${historyBaseUrl}365/false/real`));
      const history = parseB3HistoryPayload(historyPayload);
      if (history.length) return history;
    } catch {
      // Try the next candidate section for this symbol.
    }
  }

  return [];
}
