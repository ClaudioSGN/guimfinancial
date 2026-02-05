import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { useLanguage } from '@/lib/language';

const STORAGE_KEYS = {
  enabled: 'dailyReminderEnabled',
  hour: 'dailyReminderHour',
  minute: 'dailyReminderMinute',
  notificationId: 'dailyReminderNotificationId',
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

export default function MoreScreen() {
  const router = useRouter();
  const { language, setLanguage, t } = useLanguage();
  const [enabled, setEnabled] = useState(true);
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [notificationId, setNotificationId] = useState<string | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadSettings() {
      const [enabledEntry, hourEntry, minuteEntry, idEntry] =
        await AsyncStorage.multiGet([
          STORAGE_KEYS.enabled,
          STORAGE_KEYS.hour,
          STORAGE_KEYS.minute,
          STORAGE_KEYS.notificationId,
        ]);

      if (enabledEntry?.[1] != null) {
        setEnabled(enabledEntry[1] === 'true');
      }
      if (hourEntry?.[1] != null) {
        setHour(Number(hourEntry[1]));
      }
      if (minuteEntry?.[1] != null) {
        setMinute(Number(minuteEntry[1]));
      }
      if (idEntry?.[1]) {
        setNotificationId(idEntry[1]);
      }
    }

    loadSettings();

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('daily-reminder', {
        name: 'Daily Reminder',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
  }, []);

  const timeLabel = useMemo(() => `${pad2(hour)}:${pad2(minute)}`, [hour, minute]);

  async function ensureNotificationPermission() {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') {
      return true;
    }

    const requested = await Notifications.requestPermissionsAsync();
    return requested.status === 'granted';
  }

  async function handleSave() {
    setErrorMsg(null);
    setSaved(false);

    if (
      Number.isNaN(hour) ||
      Number.isNaN(minute) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      setErrorMsg(language === 'pt' ? 'Hora inválida.' : 'Invalid time.');
      return;
    }

    setSaving(true);

    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      setNotificationId(null);
      await AsyncStorage.removeItem(STORAGE_KEYS.notificationId);
    }

    if (enabled) {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        setSaving(false);
        setErrorMsg(
          language === 'pt'
            ? 'Permissão de notificações é necessária.'
            : 'Notifications permission is required.'
        );
        return;
      }

      const nextId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Daily reminder',
          body: 'Take a moment to check your finances.',
          sound: true,
        },
        trigger: {
          hour,
          minute,
          repeats: true,
          channelId: Platform.OS === 'android' ? 'daily-reminder' : undefined,
        },
      });

      setNotificationId(nextId);
      await AsyncStorage.setItem(STORAGE_KEYS.notificationId, nextId);
    }

    await AsyncStorage.multiSet([
      [STORAGE_KEYS.enabled, String(enabled)],
      [STORAGE_KEYS.hour, String(hour)],
      [STORAGE_KEYS.minute, String(minute)],
    ]);

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const pickerValue = useMemo(() => {
    const date = new Date();
    date.setHours(hour, minute, 0, 0);
    return date;
  }, [hour, minute]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.kicker}>{t('tabs.more')}</Text>
          <Text style={styles.title}>{t('more.title')}</Text>
          <Text style={styles.subtitle}>{t('more.subtitle')}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('more.dailyReminder')}</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.textBlock}>
                <Text style={styles.label}>{t('more.enableReminder')}</Text>
                <Text style={styles.helper}>{t('more.reminderHelper')}</Text>
              </View>
              <Switch
                value={enabled}
                onValueChange={setEnabled}
                trackColor={{ false: '#2A2F3A', true: '#2F6C73' }}
                thumbColor={enabled ? '#E0F2F1' : '#D7DBE2'}
              />
            </View>

            <View style={styles.row}>
              <View style={styles.textBlock}>
                <Text style={styles.label}>{t('more.reminderTime')}</Text>
                <Text style={styles.helper}>{t('more.reminderTimeHelper')}</Text>
              </View>
              <Pressable onPress={() => setShowTimePicker(true)} style={styles.timeButton}>
                <Text style={styles.timeText}>{timeLabel}</Text>
              </Pressable>
            </View>

            {showTimePicker && (
              <View style={styles.timePicker}>
                <DateTimePicker
                  value={pickerValue}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, selectedDate) => {
                    setShowTimePicker(Platform.OS === 'ios');
                    if (event.type === 'dismissed' || !selectedDate) {
                      return;
                    }
                    setHour(selectedDate.getHours());
                    setMinute(selectedDate.getMinutes());
                  }}
                />
              </View>
            )}

            <View style={styles.statusRow}>
              <View style={styles.statusBadge}>
                <View style={[styles.statusDot, enabled ? styles.statusOn : styles.statusOff]} />
                <Text style={styles.statusText}>
                  {enabled ? t('more.active') : t('more.paused')}
                </Text>
              </View>
              <Text style={styles.statusHint}>
                {enabled ? `${t('more.next')}: ${timeLabel}` : t('more.notScheduled')}
              </Text>
            </View>

            <View style={styles.actions}>
              {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
              {saved && !errorMsg ? <Text style={styles.success}>{t('more.saved')}</Text> : null}
              <Pressable
                onPress={handleSave}
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                disabled={saving}>
                <Text style={styles.saveText}>
                  {saving ? t('common.saving') : t('common.save')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('more.moreOptions')}</Text>
          <View style={styles.list}>
            <Pressable style={styles.listRow} onPress={() => router.push('/accounts')}>
              <Text style={styles.listText}>{t('more.accounts')}</Text>
              <Text style={styles.listHint}>{t('more.accountsHint')}</Text>
            </Pressable>
            <Pressable style={styles.listRow} onPress={() => router.push('/cards')}>
              <Text style={styles.listText}>{t('more.cards')}</Text>
              <Text style={styles.listHint}>{t('more.cardsHint')}</Text>
            </Pressable>
            <Pressable style={styles.listRow} onPress={() => router.push('/export')}>
              <Text style={styles.listText}>{t('more.export')}</Text>
              <Text style={styles.listHint}>{t('more.exportHint')}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('more.language')}</Text>
          <View style={styles.languageRow}>
            <Pressable
              style={[styles.languageButton, language === 'pt' && styles.languageActive]}
              onPress={() => setLanguage('pt')}>
              <Text style={styles.languageText}>{t('more.portuguese')}</Text>
            </Pressable>
            <Pressable
              style={[styles.languageButton, language === 'en' && styles.languageActive]}
              onPress={() => setLanguage('en')}>
              <Text style={styles.languageText}>{t('more.english')}</Text>
            </Pressable>
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
    paddingTop: 20,
    paddingBottom: 32,
    gap: 24,
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
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: '#C7CEDA',
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1E232E',
    backgroundColor: '#121621',
    padding: 18,
    gap: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18,
  },
  textBlock: {
    flex: 1,
    gap: 6,
  },
  label: {
    color: '#E4E7EC',
    fontSize: 15,
    fontWeight: '600',
  },
  helper: {
    color: '#8A93A3',
    fontSize: 12,
    lineHeight: 16,
  },
  timeButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A3140',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#151A27',
    minWidth: 92,
    alignItems: 'center',
  },
  timeText: {
    color: '#E6EDF3',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  timePicker: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E2432',
    backgroundColor: '#0F121A',
    padding: 6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: '#0C1018',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#1B2232',
  },
  statusDot: {
    height: 8,
    width: 8,
    borderRadius: 4,
  },
  statusOn: {
    backgroundColor: '#5DD6C7',
  },
  statusOff: {
    backgroundColor: '#5B667A',
  },
  statusText: {
    color: '#C7CEDA',
    fontSize: 12,
    fontWeight: '600',
  },
  statusHint: {
    color: '#7F8694',
    fontSize: 12,
  },
  actions: {
    alignItems: 'stretch',
    gap: 10,
  },
  error: {
    color: '#F87171',
    fontSize: 12,
  },
  success: {
    color: '#5DD6C7',
    fontSize: 12,
  },
  saveButton: {
    borderRadius: 16,
    backgroundColor: '#E6EDF3',
    paddingHorizontal: 18,
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
  list: {
    gap: 12,
  },
  listRow: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1C2332',
    backgroundColor: '#0F121A',
    padding: 14,
    gap: 6,
  },
  listText: {
    color: '#E4E7EC',
    fontSize: 14,
    fontWeight: '600',
  },
  listHint: {
    color: '#8B94A6',
    fontSize: 12,
    lineHeight: 17,
  },
  languageRow: {
    flexDirection: 'row',
    gap: 12,
  },
  languageButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1C2332',
    backgroundColor: '#0F121A',
    paddingVertical: 12,
    alignItems: 'center',
  },
  languageActive: {
    borderColor: '#3A8F8A',
    backgroundColor: '#163137',
  },
  languageText: {
    color: '#DCE3EE',
    fontSize: 13,
    fontWeight: '600',
  },
});
