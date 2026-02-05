import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PricePoint = {
  time: number;
  price: number;
};

const BRAPI_KEY = process.env.BRAPI_KEY ?? process.env.NEXT_PUBLIC_BRAPI_KEY ?? "";
const B3_SUFFIX = ".SA";
const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
};
const CRYPTO_YAHOO_MAP: Record<string, string> = {
  bitcoin: "BTC-BRL",
  ethereum: "ETH-BRL",
  solana: "SOL-BRL",
  binancecoin: "BNB-BRL",
  ripple: "XRP-BRL",
  cardano: "ADA-BRL",
  dogecoin: "DOGE-BRL",
  polkadot: "DOT-BRL",
  "avalanche-2": "AVAX-BRL",
  "matic-network": "MATIC-BRL",
  chainlink: "LINK-BRL",
  litecoin: "LTC-BRL",
};

function normalizeB3Symbol(value: string) {
  return value.toUpperCase().replace(/\s+/g, "").replace(B3_SUFFIX, "");
}

function normalizeCryptoId(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, "");
}

function getYahooSymbol(type: "b3" | "crypto", symbol: string) {
  if (type === "b3") {
    return `${normalizeB3Symbol(symbol)}${B3_SUFFIX}`;
  }
  const id = normalizeCryptoId(symbol);
  return CRYPTO_YAHOO_MAP[id] ?? "";
}

function toPoints(
  entries: Array<{ time: number; price: number }> | PricePoint[],
) {
  return entries
    .map((entry) => ({
      time: Number(entry?.time ?? 0),
      price: Number(entry?.price ?? 0),
    }))
    .filter((entry) => entry.time && entry.price)
    .sort((a, b) => a.time - b.time);
}

async function fetchYahooHistory(
  type: "b3" | "crypto",
  symbol: string,
): Promise<PricePoint[]> {
  try {
    const yahooSymbol = getYahooSymbol(type, symbol);
    if (!yahooSymbol) return [];
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        yahooSymbol,
      )}?range=1y&interval=1d`,
      { cache: "no-store", headers: DEFAULT_HEADERS },
    );
    if (!res.ok) return [];
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const adjclose = result?.indicators?.adjclose?.[0]?.adjclose ?? [];
    const close = result?.indicators?.quote?.[0]?.close ?? [];
    const series = adjclose.length ? adjclose : close;

    return toPoints(
      (timestamps as number[]).map((time, idx) => ({
        time: time * 1000,
        price: Number(series[idx] ?? 0),
      })),
    );
  } catch (err) {
    console.error(err);
    return [];
  }
}

async function fetchB3History(symbol: string): Promise<PricePoint[]> {
  const normalized = normalizeB3Symbol(symbol);

  const tryBrapi = async (token?: string) => {
    const tokenParam = token ? `&token=${token}` : "";
    const res = await fetch(
      `https://brapi.dev/api/quote/${normalized}?range=1y&interval=1d${tokenParam}`,
      { cache: "no-store", headers: DEFAULT_HEADERS },
    );
    if (!res.ok) return [];
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
    return points.length ? toPoints(points) : [];
  };

  try {
    if (BRAPI_KEY) {
      const withKey = await tryBrapi(BRAPI_KEY);
      if (withKey.length) return withKey;
    }
    const withoutKey = await tryBrapi();
    if (withoutKey.length) return withoutKey;
  } catch (err) {
    console.error(err);
  }

  return fetchYahooHistory("b3", normalized);
}

async function fetchCryptoHistory(symbol: string): Promise<PricePoint[]> {
  const id = normalizeCryptoId(symbol);
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=brl&days=365`,
      { cache: "no-store", headers: DEFAULT_HEADERS },
    );
    if (!res.ok) {
      return fetchYahooHistory("crypto", id);
    }
    const json = await res.json();
    const prices = json?.prices ?? [];
    const points = prices.map((entry: [number, number]) => ({
      time: Number(entry[0]),
      price: Number(entry[1]),
    }));
    if (points.length) {
      return toPoints(points);
    }
  } catch (err) {
    console.error(err);
  }
  return fetchYahooHistory("crypto", id);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const symbol = searchParams.get("symbol");

    if ((type !== "b3" && type !== "crypto") || !symbol) {
      return NextResponse.json({ history: [] }, { status: 400 });
    }

    const history =
      type === "b3"
        ? await fetchB3History(symbol)
        : await fetchCryptoHistory(symbol);

    return NextResponse.json(
      { history },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (err) {
    console.error("market-history error", err);
    return NextResponse.json(
      {
        history: [],
        error:
          err instanceof Error
            ? err.message
            : "Unexpected error while fetching market history.",
      },
      { status: 500 },
    );
  }
}
