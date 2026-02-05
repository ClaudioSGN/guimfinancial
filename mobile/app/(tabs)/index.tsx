import { useCallback, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '@/lib/supabaseClient';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getMonthShortName } from '@shared/i18n';
import { useLanguage } from '@/lib/language';

type Transaction = {
  id: string;
  type: 'income' | 'expense' | 'card_expense';
  amount: number | string;
  date: string;
};

type Account = {
  id: string;
  name: string;
  balance: number | string;
};

type CreditCard = {
  id: string;
  name: string;
  limit_amount: number | string;
  closing_day: number;
  due_day: number;
};

const CHART_BUCKETS = 10;

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: toDateString(start), end: toDateString(end) };
}

function getMonthTitle(date = new Date(), language: 'pt' | 'en') {
  const month = date.getMonth();
  const year = date.getFullYear();
  return `${getMonthShortName(language, month)} ${year}`;
}

function getMonthOptions(language: 'pt' | 'en', total = 12) {
  const options: { label: string; value: Date }[] = [];
  const now = new Date();
  for (let i = 0; i < total; i += 1) {
    const value = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({ label: getMonthTitle(value, language), value });
  }
  return options;
}

function formatCurrency(value: number, language: 'pt' | 'en') {
  return new Intl.NumberFormat(language === 'pt' ? 'pt-BR' : 'en-US', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}

function buildChartData(transactions: Transaction[]) {
  const values = Array.from({ length: CHART_BUCKETS }, () => 0);
  const today = new Date();
  const windowStart = new Date();
  windowStart.setDate(today.getDate() - 29);

  transactions.forEach((tx) => {
    const txDate = new Date(tx.date);
    if (txDate < windowStart || txDate > today) {
      return;
    }
    const dayDiff = Math.floor((txDate.getTime() - windowStart.getTime()) / 86400000);
    const bucket = Math.min(CHART_BUCKETS - 1, Math.floor(dayDiff / 3));
    const amount = Number(tx.amount) || 0;
    const value = tx.type === 'income' ? amount : -amount;
    values[bucket] += value;
  });

  return values;
}

export default function HomeScreen() {
  const { language, t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [totalBalance, setTotalBalance] = useState(0);
  const [income, setIncome] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [monthControl, setMonthControl] = useState(0);
  const [chartValues, setChartValues] = useState<number[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [showBalance, setShowBalance] = useState(true);
  const monthTitle = useMemo(
    () => getMonthTitle(selectedMonth, language),
    [selectedMonth, language]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    const { start, end } = getMonthRange(selectedMonth);

    const [accountsResult, transactionsResult, cardsResult] = await Promise.all([
      supabase.from('accounts').select('id,name,balance').order('name', { ascending: true }),
      supabase
        .from('transactions')
        .select('id,type,amount,date')
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: false }),
      supabase
        .from('credit_cards')
        .select('id,name,limit_amount,closing_day,due_day')
        .order('name', { ascending: true }),
    ]);

    if (accountsResult.error || transactionsResult.error || cardsResult.error) {
      const error = accountsResult.error || transactionsResult.error || cardsResult.error;
      console.error('Supabase load error', error);
      if (error?.code === '42P01') {
        setErrorMsg(t('home.schemaMissing'));
      } else {
        setErrorMsg(t('home.dataLoadError'));
      }
      setLoading(false);
      return;
    }

    const accounts = (accountsResult.data ?? []) as Account[];
    const transactions = (transactionsResult.data ?? []) as Transaction[];
    const cards = (cardsResult.data ?? []) as CreditCard[];

    const total = accounts.reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
    const monthIncome = transactions.reduce((sum, tx) => {
      return tx.type === 'income' ? sum + (Number(tx.amount) || 0) : sum;
    }, 0);
    const monthExpenses = transactions.reduce((sum, tx) => {
      return tx.type === 'expense' || tx.type === 'card_expense'
        ? sum + (Number(tx.amount) || 0)
        : sum;
    }, 0);

    const control =
      monthIncome > 0
        ? Math.max(0, Math.min(100, ((monthIncome - monthExpenses) / monthIncome) * 100))
        : 0;

    setTotalBalance(total || monthIncome - monthExpenses);
    setIncome(monthIncome);
    setExpenses(monthExpenses);
    setMonthControl(control);
    setChartValues(buildChartData(transactions));
    setAccounts(accounts);
    setCards(cards);
    setLoading(false);
  }, [selectedMonth, t]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  function handleMonthPress() {
    const options = getMonthOptions(language);
    const labels = options.map((option) => option.label).concat(t('common.cancel'));
    const cancelButtonIndex = labels.length - 1;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: labels, cancelButtonIndex },
        (buttonIndex) => {
          if (buttonIndex < options.length) {
            setSelectedMonth(options[buttonIndex].value);
          }
        }
      );
      return;
    }

    Alert.alert(
      t('home.pickMonth'),
      '',
      [
        ...options.map((option) => ({
          text: option.label,
          onPress: () => setSelectedMonth(option.value),
        })),
        { text: t('common.cancel'), style: 'cancel' },
      ],
      { cancelable: true }
    );
  }

  const chartMax = useMemo(() => {
    const maxValue = Math.max(1, ...chartValues.map((value) => Math.abs(value)));
    return maxValue;
  }, [chartValues]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Text style={styles.kicker}>{monthTitle}</Text>
              <Text style={styles.subtitle}>
                {selectedMonth.toLocaleDateString(language === 'pt' ? 'pt-BR' : 'en-US', {
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
            </View>
            <Pressable style={styles.headerAction} onPress={handleMonthPress}>
              <IconSymbol name="chevron.down" size={22} color="#A3ABB9" />
            </Pressable>
          </View>
        </View>

        {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>{t('home.balanceLabel')}</Text>
          <Text style={styles.balanceValue}>
              {loading ? '...' : showBalance ? formatCurrency(totalBalance, language) : '****'}
          </Text>
          <Pressable style={styles.eyeButton} onPress={() => setShowBalance((value) => !value)}>
            <IconSymbol name={showBalance ? 'eye.slash' : 'eye'} size={20} color="#A3ABB9" />
          </Pressable>
          <View style={styles.balanceRow}>
            <View style={styles.balanceStat}>
              <View style={[styles.balanceDot, styles.balanceDotIncome]}>
                <IconSymbol name="plus" size={16} color="#0C1018" />
              </View>
              <View>
                <Text style={styles.balanceCaption}>{t('home.income')}</Text>
                <Text style={styles.balanceAmount}>
                  {loading ? '...' : formatCurrency(income, language)}
                </Text>
              </View>
            </View>
            <View style={styles.balanceStat}>
              <View style={[styles.balanceDot, styles.balanceDotExpense]}>
                <IconSymbol name="chevron.down" size={16} color="#0C1018" />
              </View>
              <View>
                <Text style={styles.balanceCaption}>{t('home.expenses')}</Text>
                <Text style={styles.balanceAmount}>
                  {loading ? '...' : formatCurrency(expenses, language)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View>
              <Text style={styles.chartTitle}>{t('home.monthlyFlow')}</Text>
              <Text style={styles.chartSubtitle}>{t('home.inflowVsOutflow')}</Text>
            </View>
            <View style={styles.chartPill}>
              <Text style={styles.chartPillText}>{t('home.last30Days')}</Text>
            </View>
          </View>
          <View style={styles.chartBars}>
            {(chartValues.length ? chartValues : Array.from({ length: CHART_BUCKETS }, () => 0)).map(
              (value, index) => {
                const height = 14 + (Math.abs(value) / chartMax) * 62;
                return (
                  <View
                    key={`bar-${index}`}
                    style={[styles.chartBar, value >= 0 ? styles.chartPositive : styles.chartNegative, { height }]}
                  />
                );
              }
            )}
          </View>
          <View style={styles.controlRow}>
            <Text style={styles.controlLabel}>{t('home.monthControl')}</Text>
            <Text style={styles.controlValue}>{loading ? '...' : `${monthControl.toFixed(0)}%`}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('home.accounts')}</Text>
            <View style={styles.sectionIcon}>
              <IconSymbol name="wallet.pass" size={18} color="#92A0B7" />
            </View>
          </View>
          <View style={styles.sectionCard}>
            {accounts.length === 0 ? (
              <Text style={styles.emptyText}>{t('home.noAccounts')}</Text>
            ) : (
              accounts.map((account) => (
                <View key={account.id} style={styles.accountRow}>
                  <View style={styles.accountDot} />
                  <View style={styles.accountInfo}>
                    <Text style={styles.accountName}>{account.name}</Text>
                    <Text style={styles.accountBalance}>
                      {loading ? '...' : formatCurrency(Number(account.balance) || 0, language)}
                    </Text>
                  </View>
                </View>
              ))
            )}
            <View style={styles.sectionFooter}>
              <Text style={styles.sectionFooterText}>
                {t('home.total')} {loading ? '...' : formatCurrency(totalBalance, language)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('home.creditCards')}</Text>
            <View style={styles.sectionIcon}>
              <IconSymbol name="creditcard" size={18} color="#92A0B7" />
            </View>
          </View>
          <View style={styles.sectionCard}>
            <View style={styles.pillRow}>
              <View style={[styles.pill, styles.pillActive]}>
                <Text style={styles.pillTextActive}>{t('home.openStatements')}</Text>
              </View>
              <View style={styles.pill}>
                <Text style={styles.pillText}>{t('home.closedStatements')}</Text>
              </View>
            </View>
            {cards.length === 0 ? (
              <Text style={styles.emptyText}>{t('home.noCards')}</Text>
            ) : (
              cards.map((card) => (
                <View key={card.id} style={styles.cardRow}>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardName}>{card.name}</Text>
                    <Text style={styles.cardMeta}>
                      {t('cards.closes')} {card.closing_day} - {t('cards.due')} {card.due_day}
                    </Text>
                  </View>
                  <Text style={styles.cardLimit}>
                    {loading ? '...' : formatCurrency(Number(card.limit_amount) || 0, language)}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
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
    paddingTop: 18,
    paddingBottom: 40,
    gap: 18,
  },
  header: {
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    gap: 4,
  },
  headerAction: {
    height: 36,
    width: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1A2230',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111723',
  },
  kicker: {
    color: '#E2E6ED',
    fontSize: 18,
    fontWeight: '600',
  },
  subtitle: {
    color: '#9098A6',
    fontSize: 12,
  },
  balanceCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#1B2230',
    backgroundColor: '#141A25',
    paddingVertical: 18,
    paddingHorizontal: 18,
    gap: 10,
  },
  balanceLabel: {
    color: '#8D96A6',
    fontSize: 12,
  },
  balanceValue: {
    color: '#E7ECF2',
    fontSize: 28,
    fontWeight: '700',
  },
  eyeButton: {
    alignSelf: 'center',
    height: 32,
    width: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1C2332',
    backgroundColor: '#0F141E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  balanceStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  balanceDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceDotIncome: {
    backgroundColor: '#48C59F',
  },
  balanceDotExpense: {
    backgroundColor: '#E46E6E',
  },
  balanceCaption: {
    color: '#8D96A6',
    fontSize: 12,
  },
  balanceAmount: {
    color: '#E3E9F1',
    fontSize: 14,
    fontWeight: '600',
  },
  chartCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1B2230',
    backgroundColor: '#111723',
    padding: 18,
    gap: 16,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  chartTitle: {
    color: '#E4E7EC',
    fontSize: 15,
    fontWeight: '600',
  },
  chartSubtitle: {
    color: '#8B94A6',
    fontSize: 12,
    marginTop: 4,
  },
  chartPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#263043',
    backgroundColor: '#0F141E',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chartPillText: {
    color: '#9AA3B2',
    fontSize: 11,
  },
  chartBars: {
    height: 96,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  chartBar: {
    width: 14,
    borderRadius: 6,
  },
  chartPositive: {
    backgroundColor: '#4FC3A1',
  },
  chartNegative: {
    backgroundColor: '#E36B6B',
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controlLabel: {
    color: '#8D96A6',
    fontSize: 12,
  },
  controlValue: {
    color: '#E6EDF3',
    fontSize: 13,
    fontWeight: '600',
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#C7CEDA',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionIcon: {
    height: 30,
    width: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#1A2230',
    backgroundColor: '#101620',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1B2230',
    backgroundColor: '#111723',
    padding: 16,
    gap: 12,
  },
  emptyText: {
    color: '#8B94A6',
    fontSize: 12,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accountDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4FC3A1',
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    color: '#E4E7EC',
    fontSize: 14,
    fontWeight: '600',
  },
  accountBalance: {
    color: '#8D96A6',
    fontSize: 12,
    marginTop: 2,
  },
  sectionFooter: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1C2332',
  },
  sectionFooterText: {
    color: '#C7CEDA',
    fontSize: 13,
    fontWeight: '600',
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#263043',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#0F141E',
  },
  pillActive: {
    borderColor: '#3A8F8A',
    backgroundColor: '#163137',
  },
  pillText: {
    color: '#8D96A6',
    fontSize: 11,
  },
  pillTextActive: {
    color: '#64D1C4',
    fontSize: 11,
    fontWeight: '600',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  cardName: {
    color: '#E4E7EC',
    fontSize: 14,
    fontWeight: '600',
  },
  cardMeta: {
    color: '#8B94A6',
    fontSize: 12,
  },
  cardLimit: {
    color: '#A8B2C3',
    fontSize: 12,
    fontWeight: '600',
  },
  error: {
    color: '#F87171',
    fontSize: 12,
  },
});

