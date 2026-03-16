import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator,
  Platform, I18nManager,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import { UserStatus } from '@/lib/storage';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { session, loading, currentOwner, login } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;

  useEffect(() => {
    if (loading) return;
    if (session) {
      if (session.type === 'owner') {
        router.replace('/dashboard');
      } else if (session.type === 'admin') {
        router.replace('/admin');
      } else if (session.type === 'subscriber') {
        router.replace('/subscriber-dashboard');
      }
      return;
    }
    if (currentOwner) {
      if (currentOwner.status === UserStatus.PENDING) {
        router.replace('/pending');
        return;
      }
      if (!currentOwner.isActive) {
        router.replace('/suspended');
        return;
      }
    }
  }, [loading, session, currentOwner]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (session) return null;

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError('يرجى ملء جميع الحقول');
      return;
    }
    setError('');
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await login(email.trim(), password);
    setSubmitting(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/dashboard');
    } else if (result.pending) {
      router.replace('/pending');
    } else if (result.suspended) {
      router.replace('/suspended');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(result.message);
    }
  }

  function handleAdminLongPress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push('/admin-login');
  }

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: (insets.top || webTopInset) + 40,
            paddingBottom: (insets.bottom || webBottomInset) + 40,
          },
        ]}
        bottomOffset={20}
      >
        <Animated.View entering={FadeIn.duration(600)} style={styles.header}>
          <Pressable
            onLongPress={handleAdminLongPress}
            delayLongPress={800}
            style={styles.boltContainer}
          >
            <View style={styles.boltCircle}>
              <MaterialCommunityIcons name="lightning-bolt" size={32} color={Colors.primary} />
            </View>
          </Pressable>
          <Text style={styles.appName}>المولدة</Text>
          <Text style={styles.subtitle}>إدارة اشتراكات المولدات الأهلية</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>البريد الإلكتروني</Text>
            <View style={styles.inputContainer}>
              <Feather name="mail" size={18} color={Colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="أدخل بريدك الإلكتروني"
                placeholderTextColor={Colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textAlign={I18nManager.isRTL ? 'right' : 'left'}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>كلمة المرور</Text>
            <View style={styles.inputContainer}>
              <Feather name="lock" size={18} color={Colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="أدخل كلمة المرور"
                placeholderTextColor={Colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                textAlign={I18nManager.isRTL ? 'right' : 'left'}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
                <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={Colors.textMuted} />
              </Pressable>
            </View>
          </View>

          {error ? (
            <Animated.View entering={FadeIn.duration(300)} style={styles.errorBox}>
              <Feather name="alert-circle" size={16} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </Animated.View>
          ) : null}

          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={handleLogin}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>تسجيل الدخول</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={() => router.push('/signup')}
          >
            <Text style={styles.secondaryButtonText}>إنشاء حساب جديد</Text>
          </Pressable>
        </Animated.View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  boltContainer: {
    marginBottom: 16,
  },
  boltCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primaryFaded,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appName: {
    fontSize: 32,
    fontFamily: 'Cairo_700Bold',
    color: Colors.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Cairo_400Regular',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontFamily: 'Cairo_600SemiBold',
    color: Colors.text,
    textAlign: 'right',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
  },
  inputIcon: {
    opacity: 0.6,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Cairo_400Regular',
    color: Colors.text,
    height: '100%',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.errorLight,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Cairo_400Regular',
    color: Colors.error,
    textAlign: 'right',
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  buttonText: {
    fontSize: 16,
    fontFamily: 'Cairo_700Bold',
    color: '#fff',
  },
  secondaryButton: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontFamily: 'Cairo_600SemiBold',
    color: Colors.primary,
  },
});
