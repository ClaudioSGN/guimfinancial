import { useEffect, useState } from 'react';
import { FlatList, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';

import { supabase } from '@/lib/supabaseClient';
import { useLanguage } from '@/lib/language';

type Card = {
  id: string;
  name: string;
  limit_amount: number | string;
  closing_day: number;
  due_day: number;
};

export default function CardsScreen() {
  const { language, t } = useLanguage();
  const [cards, setCards] = useState<Card[]>([]);
  const [name, setName] = useState('');
  const [limitAmount, setLimitAmount] = useState('');
  const [closingDay, setClosingDay] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function loadCards() {
    const { data, error } = await supabase
      .from('credit_cards')
      .select('id,name,limit_amount,closing_day,due_day')
      .order('name');
    if (!error) {
      setCards((data ?? []) as Card[]);
    }
  }

  useEffect(() => {
    loadCards();
  }, []);

  async function handleAdd() {
    setErrorMsg(null);
    const parsedLimit = Number(limitAmount.replace(',', '.'));
    const parsedClosing = Number(closingDay);
    const parsedDue = Number(dueDay);

    if (!name.trim()) {
      setErrorMsg(t('cards.nameError'));
      return;
    }
    if (!Number.isFinite(parsedLimit) || !Number.isFinite(parsedClosing) || !Number.isFinite(parsedDue)) {
      setErrorMsg(t('cards.dataError'));
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('credit_cards').insert([
      {
        name: name.trim(),
        limit_amount: parsedLimit,
        closing_day: parsedClosing,
        due_day: parsedDue,
      },
    ]);

    if (error) {
      setErrorMsg(t('cards.saveError'));
      setSaving(false);
      return;
    }

    setName('');
    setLimitAmount('');
    setClosingDay('');
    setDueDay('');
    setSaving(false);
    loadCards();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.kicker}>{t('cards.title')}</Text>
        <Text style={styles.title}>{t('cards.subtitle')}</Text>
      </View>

      <View style={styles.form}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('cards.namePlaceholder')}
          placeholderTextColor="#5E6777"
          style={styles.input}
        />
        <TextInput
          value={limitAmount}
          onChangeText={setLimitAmount}
          placeholder={t('cards.limitPlaceholder')}
          placeholderTextColor="#5E6777"
          keyboardType="decimal-pad"
          style={styles.input}
        />
        <TextInput
          value={closingDay}
          onChangeText={setClosingDay}
          placeholder={t('cards.closingDayPlaceholder')}
          placeholderTextColor="#5E6777"
          keyboardType="number-pad"
          style={styles.input}
        />
        <TextInput
          value={dueDay}
          onChangeText={setDueDay}
          placeholder={t('cards.dueDayPlaceholder')}
          placeholderTextColor="#5E6777"
          keyboardType="number-pad"
          style={styles.input}
        />
        {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
        <Pressable onPress={handleAdd} style={[styles.saveButton, saving && styles.saveDisabled]}>
          <Text style={styles.saveText}>{saving ? t('common.saving') : t('cards.add')}</Text>
        </Pressable>
      </View>

      <FlatList
        data={cards}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowInfo}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowMeta}>
                {t('cards.closes')} {item.closing_day} · {t('cards.due')} {item.due_day}
              </Text>
            </View>
            <Text style={styles.rowAmount}>
              {new Intl.NumberFormat(language === 'pt' ? 'pt-BR' : 'en-US', {
                style: 'currency',
                currency: 'BRL',
              }).format(Number(item.limit_amount) || 0)}
            </Text>
          </View>
        )}
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
  form: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
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
  saveButton: {
    borderRadius: 12,
    backgroundColor: '#E6EDF3',
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveDisabled: {
    opacity: 0.6,
  },
  saveText: {
    color: '#0C1018',
    fontSize: 14,
    fontWeight: '700',
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
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
  },
  rowInfo: {
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
    color: '#C7CEDA',
    fontSize: 13,
    fontWeight: '600',
  },
  error: {
    color: '#F87171',
    fontSize: 12,
  },
});
