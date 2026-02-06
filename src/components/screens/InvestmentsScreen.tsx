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
};

type PricePoint = {
  time: number;
  price: number;
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

const BRAPI_KEY = process.env.NEXT_PUBLIC_BRAPI_KEY;
const B3_SUFFIX = ".SA";
const BRAPI_DEFAULT_HEADERS = {
  Accept: "application/json,text/plain,*/*",
};

function toPoints(entries: Array<{ time: number; price: number }> | PricePoint[]) {
  return entries
    .map((entry) => ({
      time: Number(entry?.time ?? 0),
      price: Number(entry?.price ?? 0),
    }))
    .filter((entry) => entry.time && entry.price)
    .sort((a, b) => a.time - b.time);
}

async function fetchB3History(symbol: string): Promise<PricePoint[]> {
  const normalized = normalizeB3Symbol(symbol);

  const tryBrapi = async (token?: string) => {
    const tokenParam = token ? `&token=${token}` : "";
    const res = await fetch(
      `https://brapi.dev/api/quote/${encodeURIComponent(
        normalized,
      )}?range=1y&interval=1d${tokenParam}`,
      { cache: "no-store", headers: BRAPI_DEFAULT_HEADERS },
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

function normalizeSymbol(type: "b3" | "crypto", value: string) {
  return type === "b3" ? normalizeB3Symbol(value) : normalizeCryptoId(value);
}

function getQuantityDecimals(type: "b3" | "crypto") {
  return type === "crypto" ? 8 : 0;
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
  const [date, setDate] = useState(toDateString(new Date()));
  const [previewQuote, setPreviewQuote] = useState<Quote | null>(null);
  const previewFetchRef = useRef<number>(0);
  const previewKeyRef = useRef<string>("");

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editSymbol, setEditSymbol] = useState("");
  const [editName, setEditName] = useState("");
  const [editSaving, setEditSaving] = useState(false);

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
    let mounted = true;
    async function init() {
      await loadAssets();
    }
    init();
    return () => {
      mounted = false;
    };
  }, [loadAssets]);

  const fetchQuotes = useCallback(async () => {
    if (!assets.length) return;
    setQuoteError(null);

    const b3Symbols = assets
      .filter((asset) => asset.type === "b3")
      .map((asset) => normalizeB3Symbol(asset.symbol));
    const cryptoIds = assets
      .filter((asset) => asset.type === "crypto")
      .map((asset) => normalizeCryptoId(asset.symbol));

    const nextQuotes: Record<string, Quote> = {};

    if (b3Symbols.length) {
      if (BRAPI_KEY) {
        try {
          const res = await fetch(
            `https://brapi.dev/api/quote/${b3Symbols.join(",")}?token=${BRAPI_KEY}`,
          );
          if (!res.ok) {
            setQuoteError(t("investments.quoteError"));
          } else {
            const json = await res.json();
            const results = json?.results ?? [];
            results.forEach((item: any) => {
              if (!item?.symbol || item?.regularMarketPrice == null) return;
              const normalized = normalizeB3Symbol(String(item.symbol));
              nextQuotes[normalized] = {
                price: Number(item.regularMarketPrice) || 0,
                changePct:
                  item.regularMarketChangePercent != null
                    ? Number(item.regularMarketChangePercent)
                    : null,
              };
            });
            if (!results.length) {
              setQuoteError(t("investments.quoteError"));
            }
          }
        } catch (err) {
          console.error(err);
          setQuoteError(t("investments.quoteError"));
        }
      }
    }

    if (cryptoIds.length) {
      try {
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoIds.join(
          ",",
        )}&vs_currencies=brl&include_24hr_change=true`;
        const res = await fetch(url);
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
      } catch (err) {
        console.error(err);
        setQuoteError(t("investments.quoteError"));
      }
    }

    setQuotes(nextQuotes);
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
      const entries = await Promise.all(
        assets.map(async (asset) => {
          const history = await fetchHistoryForAsset(asset);
          return [asset.id, history] as const;
        }),
      );
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
  const priceBig =
    previewQuote?.price != null ? new Big(previewQuote.price) : null;
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

  useEffect(() => {
    if (!showModal || !isCreate) return;
    const trimmedSymbol = symbol.trim();
    if (!trimmedSymbol || trimmedSymbol.length < 2) {
      setPreviewQuote(null);
      previewKeyRef.current = "";
      return;
    }
    const previewKey = `${type}:${normalizeSymbol(type, trimmedSymbol)}`;
    if (previewKeyRef.current !== previewKey) {
      previewKeyRef.current = previewKey;
      previewFetchRef.current = 0;
      setPreviewQuote(null);
    }
    const now = Date.now();
    if (now - previewFetchRef.current < 3000) return;
    previewFetchRef.current = now;

    async function fetchPreview() {
      if (type === "b3") {
        if (!BRAPI_KEY) return;
        const sym = normalizeB3Symbol(trimmedSymbol);
        const res = await fetch(`https://brapi.dev/api/quote/${sym}?token=${BRAPI_KEY}`);
        if (!res.ok) return;
        const json = await res.json();
        const item = (json?.results ?? []).find(
          (result: any) =>
            result?.symbol &&
            normalizeB3Symbol(String(result.symbol)) === sym,
        );
        if (item?.regularMarketPrice != null) {
          setPreviewQuote({
            price: Number(item.regularMarketPrice) || 0,
            changePct:
              item.regularMarketChangePercent != null
                ? Number(item.regularMarketChangePercent)
                : null,
          });
        } else {
          setPreviewQuote(null);
        }
        return;
      }
      const id = normalizeCryptoId(trimmedSymbol);
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=brl&include_24hr_change=true`,
      );
      if (!res.ok) return;
      const json = await res.json();
      if (json?.[id]?.brl != null) {
        setPreviewQuote({
          price: Number(json[id].brl) || 0,
          changePct: json[id].brl_24h_change ?? null,
        });
      } else {
        setPreviewQuote(null);
      }
    }

    fetchPreview();
  }, [showModal, isCreate, symbol, type]);

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
    setDate(toDateString(new Date()));
    setPreviewQuote(null);
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
      setErrorMsg(t("investments.addError"));
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

    const normalized = normalizeSymbol(type, symbol);
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
            name: name.trim() ? name.trim() : null,
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#7F8694]">
            {t("investments.title")}
          </p>
          <p className="text-xl font-semibold text-[#E5E8EF]">
            {t("investments.title")}
          </p>
          <p className="text-sm text-[#9CA3AF]">{t("investments.subtitle")}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {assets.map((asset) => {
          const key =
            asset.type === "b3"
              ? normalizeB3Symbol(asset.symbol)
              : normalizeCryptoId(asset.symbol);
          const quote = quotes[key];
          const history = priceHistory[asset.id] ?? [];
          const current = quote?.price ?? getLatestPrice(history);
          const value = current != null ? current * asset.quantity : null;
          const summary = buildChartSummary(history);
          const exchangeLabel =
            asset.type === "b3"
              ? `BVMF • ${normalizeB3Symbol(asset.symbol)}`
              : `CRYPTO • ${normalizeCryptoId(asset.symbol).toUpperCase()}`;
          return (
            <button
              key={asset.id}
              type="button"
              onClick={() => openDetails(asset)}
              className="flex min-h-[260px] flex-col justify-between gap-3 rounded-2xl border border-[#1E232E] bg-[#121621] p-4 text-left"
            >
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#8B94A6]">
                  {exchangeLabel}
                </p>
                <p className="text-sm font-semibold text-[#E4E7EC]">
                  {asset.name || asset.symbol.toUpperCase()}
                </p>
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
              </div>
              <div className="h-40">
                {history.length ? (
                  <ResponsiveContainer width="100%" height="100%">
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
                      onClick={() => setType("b3")}
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
                      onClick={() => setType("crypto")}
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
                      {preview?.price != null
                        ? formatCurrency(preview.price, language)
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
