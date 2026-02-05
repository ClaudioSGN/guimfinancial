import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { useLanguage } from '@/lib/language';

export default function ExportScreen() {
  const { t } = useLanguage();
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.kicker}>{t('export.reports')}</Text>
        <Text style={styles.title}>{t('export.title')}</Text>
        <Text style={styles.subtitle}>{t('export.subtitle')}</Text>
      </View>
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
    paddingTop: 24,
    gap: 8,
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
    lineHeight: 19,
  },
});
