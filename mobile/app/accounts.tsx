import { useEffect, useState } from 'react';
import { FlatList, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';

import { supabase } from '@/lib/supabaseClient';
import { useLanguage } from '@/lib/language';

type Account = {
  id: string;
  name: string;
  type: string;
  balance: number | string;
};

export default function AccountsScreen() {
  const { language, t } = useLanguage();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [balance, setBalance] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function loadAccounts() {
    const { data, error } = await supabase.from('accounts').select('id,name,type,balance').order('name');
    if (!error) {
      setAccounts((data ?? []) as Account[]);
    }
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  async function handleAdd() {
    setErrorMsg(null);
    const parsedBalance = Number(balance.replace(',', '.'));
    if (!name.trim() || !type.trim()) {
      setErrorMsg(t('accounts.nameTypeError'));
      return;
    }

    if (!Number.isFinite(parsedBalance)) {
      setErrorMsg(t('accounts.balanceError'));
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('accounts').insert([
      {
        name: name.trim(),
        type: type.trim(),
        balance: parsedBalance,
      },
    ]);

    if (error) {
      setErrorMsg(t('accounts.saveError'));
      setSaving(false);
      return;
    }

    setName('');
    setType('');
    setBalance('');
    setSaving(false);
    loadAccounts();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.kicker}>{t('accounts.title')}</Text>
        <Text style={styles.title}>{t('accounts.subtitle')}</Text>
      </View>

      <View style={styles.form}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('accounts.namePlaceholder')}
          placeholderTextColor="#5E6777"
          style={styles.input}
        />
        <TextInput
          value={type}
          onChangeText={setType}
          placeholder={t('accounts.typePlaceholder')}
          placeholderTextColor="#5E6777"
          style={styles.input}
        />
        <TextInput
          value={balance}
          onChangeText={setBalance}
          placeholder={t('accounts.balancePlaceholder')}
          placeholderTextColor="#5E6777"
          keyboardType="decimal-pad"
          style={styles.input}
        />
        {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
        <Pressable onPress={handleAdd} style={[styles.saveButton, saving && styles.saveDisabled]}>
          <Text style={styles.saveText}>
            {saving ? t('common.saving') : t('accounts.add')}
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={accounts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowInfo}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowMeta}>{item.type}</Text>
            </View>
            <Text style={styles.rowAmount}>
              {new Intl.NumberFormat(language === 'pt' ? 'pt-BR' : 'en-US', {
                style: 'currency',
                currency: 'BRL',
              }).format(Number(item.balance) || 0)}
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
