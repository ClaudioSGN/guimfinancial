import { useEffect, useState } from 'react';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';

import { supabase } from '@/lib/supabaseClient';
import { useLanguage } from '@/lib/language';

type CardOwnerType = 'self' | 'friend';

type Card = {
  id: string;
  name: string;
  limit_amount: number | string;
  owner_type: CardOwnerType;
  friend_name: string | null;
  closing_day: number;
  due_day: number;
};

type LegacyCard = Omit<Card, 'owner_type' | 'friend_name'>;

function getErrorMessage(error: unknown) {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

function isCardOwnershipColumnMissing(error: unknown) {
  const patterns = [
    /column ["']?([a-zA-Z0-9_]+)["']? does not exist/i,
    /could not find (?:the )?["']?([a-zA-Z0-9_]+)["']? column/i,
  ];
  const candidates = [getErrorMessage(error)];

  if (error && typeof error === 'object' && 'details' in error) {
    const details = (error as { details?: unknown }).details;
    if (typeof details === 'string') candidates.push(details);
  }

  return candidates.some((candidate) =>
    patterns.some((pattern) => {
      const match = candidate.match(pattern);
      return match?.[1] === 'owner_type' || match?.[1] === 'friend_name';
    })
  );
}

function hydrateLegacyCards(cards: LegacyCard[]): Card[] {
  return cards.map((card) => ({
    ...card,
    owner_type: 'self',
    friend_name: null,
  }));
}

export default function CardsScreen() {
  const { language, t } = useLanguage();
  const [cards, setCards] = useState<Card[]>([]);
  const [name, setName] = useState('');
  const [limitAmount, setLimitAmount] = useState('');
  const [ownerType, setOwnerType] = useState<CardOwnerType>('self');
  const [friendName, setFriendName] = useState('');
  const [closingDay, setClosingDay] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function loadCards() {
    const { data, error } = await supabase
      .from('credit_cards')
      .select('id,name,limit_amount,owner_type,friend_name,closing_day,due_day')
      .order('owner_type', { ascending: true })
      .order('name');
    if (!error) {
      setCards((data ?? []) as Card[]);
      return;
    }

    if (!isCardOwnershipColumnMissing(error)) return;

    const legacyResult = await supabase
      .from('credit_cards')
      .select('id,name,limit_amount,closing_day,due_day')
      .order('name');

    if (!legacyResult.error) {
      setCards(hydrateLegacyCards((legacyResult.data ?? []) as LegacyCard[]));
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
    const trimmedFriendName = friendName.trim();

    if (!name.trim()) {
      setErrorMsg(t('cards.nameError'));
      return;
    }
    if (ownerType === 'friend' && !trimmedFriendName) {
      setErrorMsg(t('cards.friendNameError'));
      return;
    }
    if (!Number.isFinite(parsedLimit) || !Number.isFinite(parsedClosing) || !Number.isFinite(parsedDue)) {
      setErrorMsg(t('cards.dataError'));
      return;
    }

    setSaving(true);
    let { error } = await supabase.from('credit_cards').insert([
      {
        name: name.trim(),
        limit_amount: parsedLimit,
        owner_type: ownerType,
        friend_name: ownerType === 'friend' ? trimmedFriendName : null,
        closing_day: parsedClosing,
        due_day: parsedDue,
      },
    ]);

    if (error && isCardOwnershipColumnMissing(error)) {
      if (ownerType === 'friend') {
        setErrorMsg(t('cards.schemaUpdateRequired'));
        setSaving(false);
        return;
      }

      const legacyResult = await supabase.from('credit_cards').insert([
        {
          name: name.trim(),
          limit_amount: parsedLimit,
          closing_day: parsedClosing,
          due_day: parsedDue,
        },
      ]);
      error = legacyResult.error;
    }

    if (error) {
      setErrorMsg(t('cards.saveError'));
      setSaving(false);
      return;
    }

    setName('');
    setLimitAmount('');
    setOwnerType('self');
    setFriendName('');
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
        <View style={styles.field}>
          <Text style={styles.label}>{t('cards.ownerLabel')}</Text>
          <View style={styles.toggleRow}>
            <Pressable
              onPress={() => setOwnerType('self')}
              style={[styles.toggleChip, ownerType === 'self' && styles.toggleChipActive]}>
              <Text style={[styles.toggleChipText, ownerType === 'self' && styles.toggleChipTextActive]}>
                {t('cards.ownerSelf')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setOwnerType('friend')}
              style={[styles.toggleChip, ownerType === 'friend' && styles.toggleChipActive]}>
              <Text style={[styles.toggleChipText, ownerType === 'friend' && styles.toggleChipTextActive]}>
                {t('cards.ownerFriend')}
              </Text>
            </Pressable>
          </View>
        </View>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('cards.namePlaceholder')}
          placeholderTextColor="#5E6777"
          style={styles.input}
        />
        {ownerType === 'friend' ? (
          <TextInput
            value={friendName}
            onChangeText={setFriendName}
            placeholder={t('cards.friendNamePlaceholder')}
            placeholderTextColor="#5E6777"
            style={styles.input}
          />
        ) : null}
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
              <View style={styles.badgeRow}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <View style={styles.ownerBadge}>
                  <Text style={styles.ownerBadgeText}>
                    {item.owner_type === 'friend' ? t('cards.ownerBadgeFriend') : t('cards.ownerBadgeSelf')}
                  </Text>
                </View>
              </View>
              {item.owner_type === 'friend' && item.friend_name ? (
                <Text style={styles.friendMeta}>
                  {t('home.friendCardOwner')}: {item.friend_name}
                </Text>
              ) : null}
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
  field: {
    gap: 8,
  },
  label: {
    color: '#C7CEDA',
    fontSize: 12,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2A3140',
    backgroundColor: '#0F141E',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toggleChipActive: {
    borderColor: '#5DD6C7',
    backgroundColor: '#173038',
  },
  toggleChipText: {
    color: '#A8B2C3',
    fontSize: 12,
    fontWeight: '600',
  },
  toggleChipTextActive: {
    color: '#D7FBF6',
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
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  rowTitle: {
    color: '#E4E7EC',
    fontSize: 14,
    fontWeight: '600',
  },
  ownerBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2A3140',
    backgroundColor: '#0F141E',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  ownerBadgeText: {
    color: '#9AA3B2',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  friendMeta: {
    color: '#A8D7D1',
    fontSize: 11,
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
