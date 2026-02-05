import { Tabs, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLanguage } from '@/lib/language';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuProgress = useRef(new Animated.Value(0)).current;

  function openNewEntry(type: string) {
    if (type === 'investment') {
      router.push({ pathname: '/plan', params: { new: '1' } });
      setMenuOpen(false);
      return;
    }
    router.push({ pathname: '/new-transaction', params: { type } });
    setMenuOpen(false);
  }

  const menuItems = useMemo(
    () => [
      {
        key: 'transfer',
        label: t('newEntry.transfer'),
        icon: 'arrow.left.arrow.right',
        angle: 210,
      },
      {
        key: 'income',
        label: t('newEntry.income'),
        icon: 'arrow.up',
        angle: 150,
      },
      {
        key: 'investment',
        label: t('investments.newInvestment'),
        icon: 'chart.line.uptrend.xyaxis',
        angle: 270,
      },
      {
        key: 'card_expense',
        label: t('newEntry.cardExpense'),
        icon: 'creditcard',
        angle: 30,
      },
      {
        key: 'expense',
        label: t('newEntry.expense'),
        icon: 'arrow.down',
        angle: 330,
      },
    ],
    [t]
  );

  useEffect(() => {
    Animated.timing(menuProgress, {
      toValue: menuOpen ? 1 : 0,
      duration: menuOpen ? 220 : 160,
      useNativeDriver: true,
    }).start();
  }, [menuOpen, menuProgress]);

  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarStyle: styles.tabBar,
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: t('tabs.home'),
            tabBarIcon: ({ color }) => <IconSymbol size={26} name="house.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="transactions"
          options={{
            title: t('tabs.transactions'),
            tabBarIcon: ({ color }) => (
              <IconSymbol size={26} name="list.bullet.rectangle" color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="action"
          options={{
            title: '',
            tabBarLabel: '',
            tabBarButton: () => (
              <Pressable onPress={() => setMenuOpen((value) => !value)} style={styles.actionButton}>
                <View style={styles.actionInner}>
                  <Animated.View
                    style={{
                      transform: [
                        {
                          rotate: menuProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '45deg'],
                          }),
                        },
                      ],
                    }}>
                    <IconSymbol size={24} name="plus" color={menuOpen ? '#F8FAFC' : '#0B0E13'} />
                  </Animated.View>
                </View>
              </Pressable>
            ),
          }}
        />
        <Tabs.Screen
          name="plan"
          options={{
            title: t('tabs.investments'),
            tabBarIcon: ({ color }) => <IconSymbol size={26} name="calendar" color={color} />,
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: t('tabs.more'),
            tabBarIcon: ({ color }) => <IconSymbol size={26} name="ellipsis.circle" color={color} />,
          }}
        />
      </Tabs>

      {menuOpen ? (
        <Pressable style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.menuShade,
              {
                opacity: menuProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1],
                }),
              },
            ]}
          />
          <View style={styles.menuContainer}>
            {menuItems.map((item) => {
              const radius = 88;
              const radians = (item.angle * Math.PI) / 180;
              const x = Math.cos(radians) * radius;
              const y = Math.sin(radians) * radius;
              const translateX = menuProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, x],
              });
              const translateY = menuProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, y],
              });
              const scale = menuProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [0.4, 1],
              });
              const opacity = menuProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 1],
              });

              return (
                <Animated.View
                  key={item.key}
                  style={[
                    styles.menuItem,
                    {
                      opacity,
                      transform: [{ translateX }, { translateY }, { scale }],
                    },
                  ]}>
                  <Pressable onPress={() => openNewEntry(item.key)} style={styles.menuButton}>
                    <View style={styles.menuIconWrap}>
                      <IconSymbol name={item.icon} size={18} color="#0B0E13" />
                    </View>
                    <Text style={styles.menuLabel}>{item.label}</Text>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    backgroundColor: '#0D1016',
    borderTopColor: '#1B2230',
    height: 66,
    paddingBottom: 10,
  },
  actionButton: {
    marginTop: -12,
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#101520',
    borderWidth: 1,
    borderColor: '#20293A',
  },
  actionInner: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#E5EDF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    paddingBottom: 88,
  },
  menuShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 14, 19, 0.7)',
  },
  menuContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  menuItem: {
    position: 'absolute',
    alignItems: 'center',
    gap: 6,
  },
  menuButton: {
    alignItems: 'center',
    gap: 6,
  },
  menuIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E5EDF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    color: '#E4E7EC',
    fontSize: 12,
    fontWeight: '600',
  },
  menuIncome: {
    borderRadius: 24,
  },
  menuExpense: {
    borderRadius: 24,
  },
  menuTransfer: {
    borderRadius: 24,
  },
  menuCard: {
    borderRadius: 24,
  },
});
