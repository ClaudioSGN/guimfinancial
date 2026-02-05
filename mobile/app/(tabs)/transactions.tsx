import { useCallback, useMemo, useState } from 'react';
import { FlatList, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '@/lib/supabaseClient';
import { getMonthShortName } from '@shared/i18n';
import { useLanguage } from '@/lib/language';

type Transaction = {
  id: string;
  type: 'income' | 'expense' | 'card_expense';
  amount: number | string;
  description: string | null;
  category: string | null;
  date: string;
};

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

function getMonthLabel(date = new Date(), language: 'pt' | 'en') {
  const month = date.getMonth();
  const year = date.getFullYear();
  return `${getMonthShortName(language, month)} ${year}`;
}

function formatCurrency(value: number, language: 'pt' | 'en') {
  return new Intl.NumberFormat(language === 'pt' ? 'pt-BR' : 'en-US', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string, language: 'pt' | 'en') {
  const date = new Date(value);
  return date.toLocaleDateString(language === 'pt' ? 'pt-BR' : 'en-US');
}

export default function TransactionsScreen() {
  const { language, t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const monthLabel = useMemo(() => getMonthLabel(new Date(), language), [language]);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const { start, end } = getMonthRange();

    const { data, error } = await supabase
      .from('transactions')
      .select('id,type,amount,description,category,date')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false });

    if (error) {
      setErrorMsg(t('transactions.loadError'));
      setLoading(false);
      return;
    }

    setTransactions((data ?? []) as Transaction[]);
    setLoading(false);
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      loadTransactions();
    }, [loadTransactions])
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.kicker}>{t('transactions.title')}</Text>
        <Text style={styles.title}>{t('transactions.monthSummary')}</Text>
        <Text style={styles.subtitle}>{monthLabel}</Text>
      </View>

      {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {loading ? t('common.loading') : t('transactions.empty')}
          </Text>
        }
        renderItem={({ item }) => {
          const amount = Number(item.amount) || 0;
          const isIncome = item.type === 'income';
          const isCard = item.type === 'card_expense';
          const title =
            item.description ||
            (isIncome ? t('newEntry.income') : isCard ? t('newEntry.cardExpense') : t('newEntry.expense'));
          return (
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>{title}</Text>
                <Text style={styles.rowMeta}>
                  {formatDate(item.date, language)} · {item.category ?? (language === 'pt' ? 'Sem categoria' : 'No category')}
                </Text>
              </View>
              <Text style={[styles.rowAmount, isIncome ? styles.amountPositive : styles.amountNegative]}>
                {isIncome ? '+' : '-'} {formatCurrency(amount, language)}
              </Text>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0D0F14',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
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
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 12,
  },
  row: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E232E',
    backgroundColor: '#121621',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowInfo: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    color: '#E4E7EC',
    fontSize: 14,
    fontWeight: '600',
  },
  rowMeta: {
    color: '#8A93A3',
    fontSize: 12,
  },
  rowAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  amountPositive: {
    color: '#5DD6C7',
  },
  amountNegative: {
    color: '#F59E8B',
  },
  emptyText: {
    color: '#8B94A6',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 32,
  },
  error: {
    color: '#F87171',
    fontSize: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
});
