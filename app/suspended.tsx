import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Animated as RNAnimated } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';

export default function SuspendedScreen() {
  const insets = useSafeAreaInsets();
  const app = useApp();
  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;
  const topPad = (insets.top || webTopInset);
  const bottomPad = (insets.bottom || webBottomInset);

  const pulseAnim = useRef(new RNAnimated.Value(1)).current;

  useEffect(() => {
    const pulse = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulseAnim, { toValue: 1.08, duration: 1200, useNativeDriver: true }),
        RNAnimated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  function handleLogout() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    app.logout();
    router.replace('/');
  }

  return (
    <View style={[styles.container, { paddingTop: topPad + 20, paddingBottom: bottomPad + 20 }]}>
      <Animated.View entering={FadeIn.duration(600)} style={styles.content}>
        <RNAnimated.View style={[styles.iconContainer, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="lock-outline" size={56} color={Colors.error} />
          </View>
        </RNAnimated.View>

        <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.textContent}>
          <Text style={styles.title}>تم تعطيل حسابك</Text>
          <Text style={styles.subtitle}>
            تم إغلاق حسابك من قبل الإدارة. يرجى التواصل مع الدعم الفني لمزيد من المعلومات.
          </Text>

          {app.currentOwner ? (
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Feather name="user" size={16} color={Colors.textSecondary} />
                <Text style={styles.infoText}>{app.currentOwner.name}</Text>
              </View>
              <View style={styles.infoRow}>
                <Feather name="mail" size={16} color={Colors.textSecondary} />
                <Text style={styles.infoText}>{app.currentOwner.email}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.warningCard}>
            <Feather name="alert-triangle" size={20} color={Colors.error} />
            <Text style={styles.warningText}>
              إذا كنت تعتقد أن هذا خطأ، يرجى التواصل مع المشرف لإعادة تفعيل حسابك.
            </Text>
          </View>
        </Animated.View>

        <Pressable
          style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.85 }]}
          onPress={handleLogout}
        >
          <Feather name="log-out" size={18} color={Colors.error} />
          <Text style={styles.logoutBtnText}>تسجيل الخروج</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  content: {
    alignItems: 'center',
    gap: 24,
  },
  iconContainer: {
    marginBottom: 8,
  },
  iconCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: Colors.errorLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContent: {
    alignItems: 'center',
    width: '100%',
    gap: 16,
  },
  title: {
    fontSize: 26,
    fontFamily: 'Cairo_700Bold',
    color: Colors.error,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'Cairo_400Regular',
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 10,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    width: '100%',
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'flex-end',
  },
  infoText: {
    fontSize: 14,
    fontFamily: 'Cairo_600SemiBold',
    color: Colors.text,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.errorLight,
    borderRadius: 14,
    padding: 16,
    width: '100%',
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Cairo_400Regular',
    color: Colors.error,
    textAlign: 'right',
    lineHeight: 22,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: Colors.errorLight,
    marginTop: 8,
  },
  logoutBtnText: {
    fontSize: 14,
    fontFamily: 'Cairo_600SemiBold',
    color: Colors.error,
  },
});
