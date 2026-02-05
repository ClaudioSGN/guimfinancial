import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams } from 'expo-router';
import Big from 'big.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { supabase } from '@/lib/supabaseClient';
import { useLanguage } from '@/lib/language';
import {
  computeNewAveragePrice,
  computeQuantityFromValue,
  computeTotal,
} from '@/lib/investments/math';

type Investment = {
  id: string;
  type: 'b3' | 'crypto';
  symbol: string;
  name: string | null;
  quantity: number;
  average_price: number;
};

type Quote = {
  price: number;
  changePct?: number | null;
};

const BRAPI_KEY = process.env.EXPO_PUBLIC_BRAPI_KEY;
const B3_SUFFIX = '.SA';

const CRYPTO_ID_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  BNB: 'binancecoin',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  DOT: 'polkadot',
  AVAX: 'avalanche-2',
  MATIC: 'matic-network',
  LINK: 'chainlink',
  LTC: 'litecoin',
};

function normalizeB3Symbol(value: string) {
  return value.toUpperCase().replace(/\s+/g, '').replace(B3_SUFFIX, '');
}

function normalizeCryptoId(value: string) {
  const upper = value.toUpperCase().replace(/\s+/g, '');
  return CRYPTO_ID_MAP[upper] ?? value.toLowerCase().trim();
}

function normalizeSymbol(type: 'b3' | 'crypto', value: string) {
  return type === 'b3' ? normalizeB3Symbol(value) : value.toLowerCase().trim();
}

function getQuantityDecimals(type: 'b3' | 'crypto') {
  return type === 'crypto' ? 8 : 0;
}

function formatCurrency(value: number, language: 'pt' | 'en') {
  return new Intl.NumberFormat(language === 'pt' ? 'pt-BR' : 'en-US', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}

function parseBig(value: string) {
  const cleaned = value.replace(/\s+/g, '').replace(',', '.');
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
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function PlanScreen() {
  const { language, t } = useLanguage();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ new?: string }>();
  const [assets, setAssets] = useState<Investment[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [selectedAsset, setSelectedAsset] = useState<Investment | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isCreate, setIsCreate] = useState(false);

  const [type, setType] = useState<'b3' | 'crypto'>('b3');
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'quantity' | 'value'>('quantity');
  const [quantity, setQuantity] = useState('');
  const [investedValue, setInvestedValue] = useState('');
  const [date, setDate] = useState(toDateString(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [previewQuote, setPreviewQuote] = useState<Quote | null>(null);
  const previewFetchRef = useRef<number>(0);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const openedFromQuery = useRef(false);

  const cardGap = 12;
  const cardSize = (width - 40 - cardGap) / 2;

  const loadAssets = useCallback(async () => {
    const { data, error } = await supabase
      .from('investments')
      .select('id,type,symbol,name,quantity,average_price')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      setAssets([]);
    } else {
      setAssets((data ?? []) as Investment[]);
    }
  }, []);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  const fetchQuotes = useCallback(async () => {
    if (!assets.length) return;
    setQuoteError(null);

    const b3Symbols = assets
      .filter((asset) => asset.type === 'b3')
      .map((asset) => normalizeB3Symbol(asset.symbol));
    const cryptoIds = assets
      .filter((asset) => asset.type === 'crypto')
      .map((asset) => normalizeCryptoId(asset.symbol));

    const nextQuotes: Record<string, Quote> = {};

    if (b3Symbols.length) {
      if (!BRAPI_KEY) {
        setQuoteError(t('investments.missingKey'));
      } else {
        try {
          const res = await fetch(
            `https://brapi.dev/api/quote/${b3Symbols.join(',')}?token=${BRAPI_KEY}`
          );
          if (!res.ok) {
            throw new Error(`BRAPI ${res.status}`);
          }
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
            setQuoteError(t('investments.quoteError'));
          }
        } catch (err) {
          console.error(err);
          setQuoteError(t('investments.quoteError'));
        }
      }
    }

    if (cryptoIds.length) {
      try {
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoIds.join(
          ','
        )}&vs_currencies=brl&include_24hr_change=true`;
        const res = await fetch(url);
        const json = await res.json();
        cryptoIds.forEach((id) => {
          const entry = json?.[id];
          if (!entry?.brl) return;
          nextQuotes[id] = {
            price: Number(entry.brl) || 0,
            changePct: entry?.brl_24h_change != null ? Number(entry.brl_24h_change) : null,
          };
        });
      } catch (err) {
        console.error(err);
        setQuoteError(t('investments.quoteError'));
      }
    }

    setQuotes(nextQuotes);
  }, [assets, t]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  const activeAsset = selectedAsset;
  const currentAvg = activeAsset ? new Big(activeAsset.average_price || 0) : new Big(0);
  const currentQty = activeAsset ? new Big(activeAsset.quantity || 0) : new Big(0);
  const priceBig = previewQuote?.price != null ? new Big(previewQuote.price) : null;
  const quantityBig = parseBig(quantity);
  const investedBig = parseBig(investedValue);
  const decimals = getQuantityDecimals(type);

  const computed = useMemo(() => {
    if (!priceBig) {
      return { qty: new Big(0), total: new Big(0), newAvg: currentAvg };
    }
    if (mode === 'quantity') {
      if (!quantityBig) {
        return { qty: new Big(0), total: new Big(0), newAvg: currentAvg };
      }
      const total = computeTotal(quantityBig, priceBig);
      const newAvg = computeNewAveragePrice(currentQty, currentAvg, quantityBig, priceBig);
      return { qty: quantityBig, total, newAvg };
    }
    if (!investedBig) {
      return { qty: new Big(0), total: new Big(0), newAvg: currentAvg };
    }
    const { quantity: qty, total } = computeQuantityFromValue(investedBig, priceBig, decimals);
    const newAvg = computeNewAveragePrice(currentQty, currentAvg, qty, priceBig);
    return { qty, total, newAvg };
  }, [priceBig, quantityBig, investedBig, mode, currentAvg, currentQty, decimals]);

  const currentQuoteForSelected = useMemo(() => {
    if (!activeAsset) return null;
    const key =
      activeAsset.type === 'b3'
        ? normalizeB3Symbol(activeAsset.symbol)
        : normalizeCryptoId(activeAsset.symbol);
    return quotes[key] ?? null;
  }, [activeAsset, quotes]);

  useEffect(() => {
    if (!showModal || !isCreate) return;
    if (!symbol || symbol.length < 2) {
      setPreviewQuote(null);
      return;
    }
    const now = Date.now();
    if (now - previewFetchRef.current < 3000) return;
    previewFetchRef.current = now;

    async function fetchPreview() {
      if (type === 'b3') {
        if (!BRAPI_KEY) return;
        const sym = normalizeB3Symbol(symbol);
        const res = await fetch(`https://brapi.dev/api/quote/${sym}?token=${BRAPI_KEY}`);
        if (!res.ok) return;
        const json = await res.json();
        const item = json?.results?.[0];
        if (item?.regularMarketPrice != null) {
          setPreviewQuote({
            price: Number(item.regularMarketPrice) || 0,
            changePct:
              item.regularMarketChangePercent != null
                ? Number(item.regularMarketChangePercent)
                : null,
          });
        }
        return;
      }
      const id = normalizeCryptoId(symbol);
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=brl&include_24hr_change=true`
      );
      if (!res.ok) return;
      const json = await res.json();
      if (json?.[id]?.brl != null) {
        setPreviewQuote({
          price: Number(json[id].brl) || 0,
          changePct: json[id].brl_24h_change ?? null,
        });
      }
    }

    fetchPreview();
  }, [showModal, isCreate, symbol, type]);

  const openCreate = useCallback(() => {
    setIsCreate(true);
    setSelectedAsset(null);
    setShowModal(true);
    setType('b3');
    setSymbol('');
    setName('');
    setMode('quantity');
    setQuantity('');
    setInvestedValue('');
    setDate(toDateString(new Date()));
    setPreviewQuote(null);
    setErrorMsg(null);
  }, []);

  useEffect(() => {
    if (!params) return;
    const shouldOpen = params.new === '1';
    if (!shouldOpen || openedFromQuery.current) return;
    openedFromQuery.current = true;
    openCreate();
  }, [params, openCreate]);

  function openDetails(asset: Investment) {
    setIsCreate(false);
    setSelectedAsset(asset);
    setShowModal(true);
    setErrorMsg(null);
  }

  async function handleRemove(id: string) {
    const { error } = await supabase.from('investments').delete().eq('id', id);
    if (error) {
      console.error(error);
      setErrorMsg(t('investments.removeError'));
      return;
    }
    await loadAssets();
  }

  async function handleSave() {
    setErrorMsg(null);
    if (!symbol.trim()) {
      setErrorMsg(t('investments.addError'));
      return;
    }
    if (!priceBig) {
      setErrorMsg(t('investments.priceRequired'));
      return;
    }
    if (mode === 'quantity' && !quantityBig) {
      setErrorMsg(t('investments.quantityRequired'));
      return;
    }
    if (mode === 'value' && !investedBig) {
      setErrorMsg(t('investments.valueRequired'));
      return;
    }
    if (mode === 'value' && computed.qty.lte(0)) {
      setErrorMsg(t('investments.insufficientValue'));
      return;
    }
    if (computed.qty.lte(0)) {
      setErrorMsg(t('investments.addError'));
      return;
    }

    setSaving(true);

    const normalized = normalizeSymbol(type, symbol);
    const existing = assets.find(
      (asset) => asset.type === type && normalizeSymbol(asset.type, asset.symbol) === normalized
    );

    const nextAvg = computed.newAvg;
    const nextQty = existing ? new Big(existing.quantity).plus(computed.qty) : computed.qty;

    let assetId = existing?.id;

    if (existing) {
      const { error } = await supabase
        .from('investments')
        .update({
          quantity: nextQty.toString(),
          average_price: nextAvg.toString(),
        })
        .eq('id', existing.id);
      if (error) {
        console.error(error);
        setSaving(false);
        setErrorMsg(t('investments.saveError'));
        return;
      }
    } else {
      const { data, error } = await supabase
        .from('investments')
        .insert([
          {
            type,
            symbol: normalized,
            name: name.trim() ? name.trim() : null,
            quantity: nextQty.toString(),
            average_price: nextAvg.toString(),
            currency: 'BRL',
          },
        ])
        .select('id')
        .maybeSingle();
      if (error || !data) {
        console.error(error);
        setSaving(false);
        setErrorMsg(t('investments.saveError'));
        return;
      }
      assetId = data.id;
    }

    const { error: purchaseError } = await supabase.from('investment_purchases').insert([
      {
        asset_id: assetId,
        date,
        price_per_share: priceBig.toString(),
        quantity: computed.qty.toString(),
        total_invested: computed.total.toString(),
        mode_used: mode,
        input_value: mode === 'value' ? investedBig?.toString() : null,
      },
    ]);

    if (purchaseError) {
      console.error(purchaseError);
      setSaving(false);
      setErrorMsg(t('investments.saveError'));
      return;
    }

    setSaving(false);
    setShowModal(false);
    await loadAssets();
  }

  const displayDate = useMemo(() => {
    const value = new Date(date);
    return value.toLocaleDateString(language === 'pt' ? 'pt-BR' : 'en-US');
  }, [date, language]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.kicker}>{t('investments.title')}</Text>
          <Text style={styles.title}>{t('investments.title')}</Text>
          <Text style={styles.subtitle}>{t('investments.subtitle')}</Text>
        </View>

        <View style={styles.grid}>
          {assets.map((asset, index) => {
            const key =
              asset.type === 'b3'
                ? normalizeB3Symbol(asset.symbol)
                : normalizeCryptoId(asset.symbol);
            const quote = quotes[key];
            const current = quote?.price ?? null;
            const value = current != null ? current * asset.quantity : null;
            const marginRight = index % 2 === 0 ? cardGap : 0;
            return (
              <Pressable
                key={asset.id}
                onPress={() => openDetails(asset)}
                style={[styles.card, { width: cardSize, height: cardSize, marginRight }]}>
                <View>
                  <Text style={styles.cardTitle}>
                    {asset.name || asset.symbol.toUpperCase()}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {asset.type === 'b3' ? 'B3' : 'Cripto'} - {asset.symbol}
                  </Text>
                </View>
                <View>
                  <Text style={styles.cardLabel}>{t('investments.totalValue')}</Text>
                  <Text style={styles.cardValue}>
                    {value != null ? formatCurrency(value, language) : '--'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {assets.length === 0 ? <Text style={styles.empty}>{t('investments.empty')}</Text> : null}
        {quoteError ? <Text style={styles.error}>{quoteError}</Text> : null}
      </ScrollView>

      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {isCreate ? (
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{t('investments.addTitle')}</Text>
                  <Pressable onPress={() => setShowModal(false)}>
                    <Text style={styles.modalCancel}>{t('common.cancel')}</Text>
                  </Pressable>
                </View>

                <View style={styles.row}>
                  <Pressable
                    onPress={() => setType('b3')}
                    style={[styles.toggle, type === 'b3' && styles.toggleActive]}>
                    <Text style={styles.toggleText}>{t('investments.b3')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setType('crypto')}
                    style={[styles.toggle, type === 'crypto' && styles.toggleActive]}>
                    <Text style={styles.toggleText}>{t('investments.crypto')}</Text>
                  </Pressable>
                </View>

                <View style={styles.field}>
                  <TextInput
                    value={symbol}
                    onChangeText={setSymbol}
                    placeholder={t('investments.symbol')}
                    placeholderTextColor="#5E6777"
                    style={styles.input}
                  />
                  <Text style={styles.helper}>{t('investments.symbolHint')}</Text>
                </View>

                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder={t('investments.name')}
                  placeholderTextColor="#5E6777"
                  style={styles.input}
                />

                <Pressable style={styles.input} onPress={() => setShowDatePicker(true)}>
                  <Text style={styles.inputText}>{displayDate}</Text>
                </Pressable>

                {showDatePicker && (
                  <DateTimePicker
                    value={new Date(date)}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, selectedDate) => {
                      setShowDatePicker(Platform.OS === 'ios');
                      if (event.type === 'dismissed' || !selectedDate) {
                        return;
                      }
                      setDate(toDateString(selectedDate));
                    }}
                  />
                )}

                <View style={styles.row}>
                  <Pressable
                    onPress={() => setMode('quantity')}
                    style={[styles.toggle, mode === 'quantity' && styles.toggleActive]}>
                    <Text style={styles.toggleText}>{t('investments.modeQuantity')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setMode('value')}
                    style={[styles.toggle, mode === 'value' && styles.toggleActive]}>
                    <Text style={styles.toggleText}>{t('investments.modeValue')}</Text>
                  </Pressable>
                </View>

                {mode === 'quantity' ? (
                  <TextInput
                    value={quantity}
                    onChangeText={setQuantity}
                    placeholder={t('investments.quantity')}
                    placeholderTextColor="#5E6777"
                    keyboardType="decimal-pad"
                    style={styles.input}
                  />
                ) : (
                  <TextInput
                    value={investedValue}
                    onChangeText={setInvestedValue}
                    placeholder={t('investments.investedValue')}
                    placeholderTextColor="#5E6777"
                    keyboardType="decimal-pad"
                    style={styles.input}
                  />
                )}

                <View style={styles.summaryGrid}>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>{t('investments.total')}</Text>
                    <Text style={styles.summaryValue}>
                      {priceBig && computed.qty.gt(0)
                        ? formatCurrency(Number(computed.total.toString()), language)
                        : '--'}
                    </Text>
                  </View>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>{t('investments.currentPrice')}</Text>
                    <Text style={styles.summaryValue}>
                      {previewQuote?.price != null
                        ? formatCurrency(previewQuote.price, language)
                        : '--'}
                    </Text>
                  </View>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>{t('investments.currentAvg')}</Text>
                    <Text style={styles.summaryValue}>
                      {currentAvg.gt(0)
                        ? formatCurrency(Number(currentAvg.toString()), language)
                        : '--'}
                    </Text>
                  </View>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>{t('investments.newAvg')}</Text>
                    <Text style={styles.summaryValue}>
                      {computed.newAvg.gt(0)
                        ? formatCurrency(Number(computed.newAvg.toString()), language)
                        : '--'}
                    </Text>
                  </View>
                </View>

                {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

                <Pressable
                  onPress={handleSave}
                  style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                  disabled={saving}>
                  <Text style={styles.saveText}>{saving ? t('common.saving') : t('common.save')}</Text>
                </Pressable>
              </View>
            ) : selectedAsset ? (
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>
                      {selectedAsset.name || selectedAsset.symbol.toUpperCase()}
                    </Text>
                    <Text style={styles.modalSubtitle}>
                      {selectedAsset.type === 'b3' ? 'B3' : 'Cripto'} - {selectedAsset.symbol}
                    </Text>
                  </View>
                  <Pressable onPress={() => setShowModal(false)}>
                    <Text style={styles.modalCancel}>{t('common.cancel')}</Text>
                  </Pressable>
                </View>

                <View style={styles.summaryGrid}>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>{t('investments.quantity')}</Text>
                    <Text style={styles.summaryValue}>{selectedAsset.quantity}</Text>
                  </View>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>{t('investments.currentPrice')}</Text>
                    <Text style={styles.summaryValue}>
                      {currentQuoteForSelected?.price != null
                        ? formatCurrency(currentQuoteForSelected.price, language)
                        : '--'}
                    </Text>
                  </View>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>{t('investments.currentAvg')}</Text>
                    <Text style={styles.summaryValue}>
                      {formatCurrency(selectedAsset.average_price, language)}
                    </Text>
                  </View>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>{t('investments.totalValue')}</Text>
                    <Text style={styles.summaryValue}>
                      {currentQuoteForSelected?.price != null
                        ? formatCurrency(
                            currentQuoteForSelected.price * selectedAsset.quantity,
                            language
                          )
                        : '--'}
                    </Text>
                  </View>
                </View>

                <View style={styles.modalFooter}>
                  <Pressable onPress={() => handleRemove(selectedAsset.id)} style={styles.removeButton}>
                    <Text style={styles.removeText}>{t('investments.remove')}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0D0F14',
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 16,
  },
  header: {
    gap: 6,
  },
  kicker: {
    color: '#7F8694',
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  title: {
    color: '#E5E8EF',
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 13,
    lineHeight: 19,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E232E',
    backgroundColor: '#121621',
    padding: 12,
    marginBottom: 12,
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: '#E4E7EC',
    fontSize: 14,
    fontWeight: '600',
  },
  cardMeta: {
    color: '#8B94A6',
    fontSize: 12,
    marginTop: 4,
  },
  cardLabel: {
    color: '#8B94A6',
    fontSize: 11,
  },
  cardValue: {
    color: '#E5E8EF',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  empty: {
    color: '#8B94A6',
    fontSize: 12,
  },
  error: {
    color: '#F87171',
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 20,
    justifyContent: 'center',
  },
  modalCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1E232E',
    backgroundColor: '#0F121A',
    padding: 16,
  },
  modalContent: {
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    color: '#E5E8EF',
    fontSize: 16,
    fontWeight: '700',
  },
  modalSubtitle: {
    color: '#8B94A6',
    fontSize: 12,
    marginTop: 4,
  },
  modalCancel: {
    color: '#8B94A6',
    fontSize: 12,
  },
  field: {
    gap: 6,
  },
  helper: {
    color: '#8B94A6',
    fontSize: 11,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E232E',
    backgroundColor: '#121621',
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#E4E7EC',
  },
  inputText: {
    color: '#E4E7EC',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  toggle: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1C2332',
    backgroundColor: '#0F121A',
    paddingVertical: 8,
    alignItems: 'center',
  },
  toggleActive: {
    borderColor: '#3A8F8A',
    backgroundColor: '#163137',
  },
  toggleText: {
    color: '#DCE3EE',
    fontSize: 12,
    fontWeight: '600',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCard: {
    width: '48%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E232E',
    backgroundColor: '#121621',
    padding: 10,
  },
  summaryLabel: {
    color: '#8B94A6',
    fontSize: 11,
  },
  summaryValue: {
    color: '#E5E8EF',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  saveButton: {
    borderRadius: 14,
    backgroundColor: '#E6EDF3',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveText: {
    color: '#0C1018',
    fontSize: 14,
    fontWeight: '700',
  },
  modalFooter: {
    alignItems: 'flex-end',
  },
  removeButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1E232E',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  removeText: {
    color: '#8B94A6',
    fontSize: 12,
  },
});
