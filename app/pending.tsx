import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';

export default function PendingScreen() {
  const insets = useSafeAreaInsets();
  const app = useApp();
  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;
  const topPad = (insets.top || webTopInset);
  const bottomPad = (insets.bottom || webBottomInset);

  function handleBack() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace('/');
  }

  return (
    <View style={[styles.container, { paddingTop: topPad + 20, paddingBottom: bottomPad + 20 }]}>
      <Animated.View entering={FadeIn.duration(600)} style={styles.content}>
        <View style={styles.iconContainer}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="clock-outline" size={56} color={Colors.primary} />
          </View>
        </View>

        <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.textContent}>
          <Text style={styles.title}>بانتظار التفعيل</Text>
          <Text style={styles.subtitle}>
            تم إنشاء حسابك بنجاح وهو قيد المراجعة من قبل مشرف النظام
          </Text>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Feather name="user" size={16} color={Colors.textSecondary} />
              <Text style={styles.infoText}>{app.currentOwner?.name || ''}</Text>
            </View>
            <View style={styles.infoRow}>
              <Feather name="mail" size={16} color={Colors.textSecondary} />
              <Text style={styles.infoText}>{app.currentOwner?.email || ''}</Text>
            </View>
          </View>

          <View style={styles.stepsCard}>
            <Text style={styles.stepsTitle}>الخطوات القادمة</Text>
            <View style={styles.stepItem}>
              <View style={[styles.stepDot, styles.stepDotDone]} />
              <Text style={styles.stepText}>إنشاء الحساب ✓</Text>
            </View>
            <View style={styles.stepItem}>
              <View style={[styles.stepDot, styles.stepDotActive]} />
              <Text style={styles.stepTextActive}>مراجعة المشرف...</Text>
            </View>
            <View style={styles.stepItem}>
              <View style={styles.stepDot} />
              <Text style={styles.stepText}>تفعيل الحساب</Text>
            </View>
          </View>
        </Animated.View>

        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.85 }]}
          onPress={handleBack}
        >
          <Feather name="arrow-right" size={18} color={Colors.primary} />
          <Text style={styles.backBtnText}>العودة لتسجيل الدخول</Text>
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
    backgroundColor: Colors.primaryFaded,
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
    color: Colors.text,
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
  stepsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    width: '100%',
    gap: 12,
  },
  stepsTitle: {
    fontSize: 15,
    fontFamily: 'Cairo_700Bold',
    color: Colors.text,
    textAlign: 'right',
    marginBottom: 4,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'flex-end',
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.border,
  },
  stepDotDone: {
    backgroundColor: Colors.success,
  },
  stepDotActive: {
    backgroundColor: Colors.warning,
  },
  stepText: {
    fontSize: 14,
    fontFamily: 'Cairo_400Regular',
    color: Colors.textMuted,
  },
  stepTextActive: {
    fontSize: 14,
    fontFamily: 'Cairo_600SemiBold',
    color: Colors.warning,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: Colors.primaryFaded,
    marginTop: 8,
  },
  backBtnText: {
    fontSize: 14,
    fontFamily: 'Cairo_600SemiBold',
    color: Colors.primary,
  },
});
