import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { supabase } from '@/lib/supabaseClient';
import { useLanguage } from '@/lib/language';

type Account = {
  id: string;
  name: string;
  balance: number | string;
};

type Card = {
  id: string;
  name: string;
};

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function labelForType(type: string, t: (key: string) => string) {
  if (type === 'transfer') return t('newEntry.transfer');
  if (type === 'income') return t('newEntry.income');
  if (type === 'card_expense') return t('newEntry.cardExpense');
  return t('newEntry.expense');
}

export default function NewTransactionScreen() {
  const { language, t } = useLanguage();
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const entryType = params.type ?? 'expense';
  const isTransfer = entryType === 'transfer';
  const isCardExpense = entryType === 'card_expense';
  const needsAccount = entryType === 'income' || entryType === 'expense';

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(toDateString(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function loadRefs() {
      const [accountsResult, cardsResult] = await Promise.all([
        supabase.from('accounts').select('id,name,balance').order('name', { ascending: true }),
        supabase.from('credit_cards').select('id,name').order('name', { ascending: true }),
      ]);

      if (!accountsResult.error) {
        setAccounts((accountsResult.data ?? []) as Account[]);
      }
      if (!cardsResult.error) {
        setCards((cardsResult.data ?? []) as Card[]);
      }
    }

    loadRefs();
  }, []);

  const parsedAmount = useMemo(() => {
    const normalized = amount.replace(',', '.');
    return Number(normalized);
  }, [amount]);

  async function updateAccountBalance(id: string, delta: number) {
    const current = accounts.find((account) => account.id === id);
    if (!current) {
      return;
    }
    const nextBalance = (Number(current.balance) || 0) + delta;
    await supabase.from('accounts').update({ balance: nextBalance }).eq('id', id);
  }

  async function handleSave() {
    setErrorMsg(null);
    setSaved(false);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg(t('newEntry.amountError'));
      return;
    }

    if (isTransfer) {
      if (!accountId || !toAccountId) {
        setErrorMsg(t('newEntry.selectAccountsError'));
        return;
      }
    } else if (needsAccount && !accountId) {
      setErrorMsg(t('newEntry.selectAccountError'));
      return;
    } else if (isCardExpense && !cardId) {
      setErrorMsg(t('newEntry.selectCardError'));
      return;
    }

    setSaving(true);

    if (isTransfer) {
      const { error } = await supabase.from('transfers').insert([
        {
          from_account_id: accountId,
          to_account_id: toAccountId,
          amount: parsedAmount,
          description: description || null,
          date,
        },
      ]);

      if (error) {
        setErrorMsg(t('newEntry.saveErrorTransfer'));
        setSaving(false);
        return;
      }

      await updateAccountBalance(accountId!, -parsedAmount);
      await updateAccountBalance(toAccountId!, parsedAmount);
    } else {
      const { error } = await supabase.from('transactions').insert([
        {
          type: entryType,
          account_id: needsAccount ? accountId : null,
          card_id: isCardExpense ? cardId : null,
          amount: parsedAmount,
          description: description || null,
          category: category || null,
          date,
        },
      ]);

      if (error) {
        setErrorMsg(t('newEntry.saveError'));
        setSaving(false);
        return;
      }

      if (needsAccount) {
        const delta = entryType === 'income' ? parsedAmount : -parsedAmount;
        await updateAccountBalance(accountId!, delta);
      }
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.back();
  }

  const displayDate = useMemo(() => {
    const value = new Date(date);
    return value.toLocaleDateString(language === 'pt' ? 'pt-BR' : 'en-US');
  }, [date, language]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.kicker}>{t('newEntry.title')}</Text>
          <Text style={styles.title}>{labelForType(entryType, t)}</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>{t('newEntry.amount')}</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0,00"
              placeholderTextColor="#5E6777"
              keyboardType="decimal-pad"
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t('newEntry.description')}</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={language === 'pt' ? 'Ex: Supermercado' : 'e.g., Grocery'}
              placeholderTextColor="#5E6777"
              style={styles.input}
            />
          </View>

          {!isTransfer ? (
            <View style={styles.field}>
              <Text style={styles.label}>{t('newEntry.category')}</Text>
              <TextInput
                value={category}
                onChangeText={setCategory}
                placeholder={language === 'pt' ? 'Ex: Alimentação' : 'e.g., Food'}
                placeholderTextColor="#5E6777"
                style={styles.input}
              />
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={styles.label}>{t('newEntry.date')}</Text>
            <Pressable style={styles.input} onPress={() => setShowDatePicker(true)}>
              <Text style={styles.inputText}>{displayDate}</Text>
            </Pressable>
          </View>

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

          {isCardExpense ? (
            <View style={styles.field}>
              <Text style={styles.label}>{t('newEntry.card')}</Text>
              <View style={styles.chips}>
                {cards.length === 0 ? (
                  <Text style={styles.empty}>
                    {language === 'pt' ? 'Nenhum cartão cadastrado.' : 'No cards registered.'}
                  </Text>
                ) : (
                  cards.map((card) => (
                    <Pressable
                      key={card.id}
                      style={[
                        styles.chip,
                        cardId === card.id ? styles.chipActive : undefined,
                      ]}
                      onPress={() => setCardId(card.id)}>
                      <Text style={styles.chipText}>{card.name}</Text>
                    </Pressable>
                  ))
                )}
              </View>
            </View>
          ) : null}

          {needsAccount || isTransfer ? (
            <View style={styles.field}>
              <Text style={styles.label}>
                {isTransfer ? t('newEntry.fromAccount') : t('newEntry.account')}
              </Text>
              <View style={styles.chips}>
                {accounts.length === 0 ? (
                  <Text style={styles.empty}>
                    {language === 'pt' ? 'Nenhuma conta cadastrada.' : 'No accounts registered.'}
                  </Text>
                ) : (
                  accounts.map((account) => (
                    <Pressable
                      key={account.id}
                      style={[
                        styles.chip,
                        accountId === account.id ? styles.chipActive : undefined,
                      ]}
                      onPress={() => setAccountId(account.id)}>
                      <Text style={styles.chipText}>{account.name}</Text>
                    </Pressable>
                  ))
                )}
              </View>
            </View>
          ) : null}

          {isTransfer ? (
            <View style={styles.field}>
              <Text style={styles.label}>{t('newEntry.toAccount')}</Text>
              <View style={styles.chips}>
                {accounts.length === 0 ? (
                  <Text style={styles.empty}>
                    {language === 'pt' ? 'Nenhuma conta cadastrada.' : 'No accounts registered.'}
                  </Text>
                ) : (
                  accounts.map((account) => (
                    <Pressable
                      key={account.id}
                      style={[
                        styles.chip,
                        toAccountId === account.id ? styles.chipActive : undefined,
                      ]}
                      onPress={() => setToAccountId(account.id)}>
                      <Text style={styles.chipText}>{account.name}</Text>
                    </Pressable>
                  ))
                )}
              </View>
            </View>
          ) : null}
        </View>

        {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
        {saved ? <Text style={styles.success}>{t('newEntry.saved')}</Text> : null}

        <Pressable
          onPress={handleSave}
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          disabled={saving}>
          <Text style={styles.saveText}>{saving ? t('common.saving') : t('common.save')}</Text>
        </Pressable>
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
  form: {
    gap: 14,
  },
  field: {
    gap: 8,
  },
  label: {
    color: '#C7CEDA',
    fontSize: 13,
    fontWeight: '600',
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2A3140',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#0F141E',
  },
  chipActive: {
    backgroundColor: '#1F2A3A',
    borderColor: '#5DD6C7',
  },
  chipText: {
    color: '#C7CEDA',
    fontSize: 12,
  },
  empty: {
    color: '#8B94A6',
    fontSize: 12,
  },
  saveButton: {
    borderRadius: 14,
    backgroundColor: '#E6EDF3',
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveText: {
    color: '#0C1018',
    fontSize: 14,
    fontWeight: '700',
  },
  error: {
    color: '#F87171',
    fontSize: 12,
  },
  success: {
    color: '#5DD6C7',
    fontSize: 12,
  },
});
