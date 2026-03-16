import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator,
  Platform, I18nManager,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import NetInfo from '@react-native-community/netinfo';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import Colors from '@/constants/colors';

type Step = 'role' | 'ownerForm';

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('role');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;

  async function handleOwnerSignup() {
    if (!name.trim() || !phone.trim() || !email.trim() || !password.trim()) {
      setError('يرجى ملء جميع الحقول');
      return;
    }
    if (password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    setError('');
    setSuccess('');
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        throw new Error('لا يوجد اتصال بالإنترنت. يجب أن تكون متصلاً لإرسال طلبك للمدير.');
      }

      const response = await fetch('https://almolda.com/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          password: password,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSuccess('تم إرسال طلبك للمدير بنجاح، بانتظار الموافقة.');
        setName(''); setPhone(''); setEmail(''); setPassword('');
      } else {
        throw new Error(result.message || 'فشل التسجيل في السيرفر');
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err.message || 'حدث خطأ في الاتصال بالسيرفر');
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'role') {
    return (
      <View style={styles.container}>
        <View style={[styles.roleContainer, { paddingTop: (insets.top || webTopInset) + 20, paddingBottom: (insets.bottom || webBottomInset) + 40 }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={Colors.text} />
          </Pressable>

          <Animated.View entering={FadeIn.duration(500)} style={styles.roleHeader}>
            <View style={styles.boltCircle}>
              <MaterialCommunityIcons name="lightning-bolt" size={32} color={Colors.primary} />
            </View>
            <Text style={styles.title}>إنشاء حساب</Text>
            <Text style={styles.subtitle}>كيف تريد استخدام التطبيق؟</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.roleCards}>
            <Pressable
              style={({ pressed }) => [styles.roleCard, pressed && styles.roleCardPressed]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setStep('ownerForm');
              }}
            >
              <View style={styles.roleIconWrap}>
                <MaterialCommunityIcons name="lightning-bolt" size={32} color={Colors.primary} />
              </View>
              <Text style={styles.roleTitle}>صاحب مولدة</Text>
              <Text style={styles.roleDesc}>إدارة المشتركين والمدفوعات والأسعار</Text>
              <View style={styles.roleArrow}>
                <Feather name="arrow-left" size={18} color={Colors.primary} />
              </View>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.roleCard, styles.roleCardSubscriber, pressed && styles.roleCardPressed]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/subscriber-onboarding');
              }}
            >
              <View style={[styles.roleIconWrap, styles.roleIconSubscriber]}>
                <Feather name="users" size={28} color={Colors.gold} />
              </View>
              <Text style={styles.roleTitle}>مشترك</Text>
              <Text style={styles.roleDesc}>عرض الأسعار وسجل المدفوعات ورسائل صاحب المولدة</Text>
              <View style={styles.roleArrow}>
                <Feather name="arrow-left" size={18} color={Colors.gold} />
              </View>
            </Pressable>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(400).duration(500)}>
            <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
              <Text style={styles.secondaryButtonText}>لديك حساب؟ تسجيل الدخول</Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: (insets.top || webTopInset) + 20, paddingBottom: (insets.bottom || webBottomInset) + 40 },
        ]}
        bottomOffset={20}
      >
        <Pressable onPress={() => setStep('role')} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={Colors.text} />
        </Pressable>

        <Animated.View entering={FadeIn.duration(500)} style={styles.header}>
          <Text style={styles.title}>حساب صاحب مولدة</Text>
          <Text style={styles.subtitle}>سجّل كمالك مولدة لإدارة اشتراكاتك</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>الاسم الكامل</Text>
            <View style={styles.inputContainer}>
              <Feather name="user" size={18} color={Colors.textMuted} />
              <TextInput
                style={styles.input}
                placeholder="أدخل اسمك الكامل"
                placeholderTextColor={Colors.textMuted}
                value={name}
                onChangeText={setName}
                textAlign={I18nManager.isRTL ? 'right' : 'left'}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>رقم الهاتف</Text>
            <View style={styles.inputContainer}>
              <Feather name="phone" size={18} color={Colors.textMuted} />
              <TextInput
                style={styles.input}
                placeholder="07XXXXXXXXX"
                placeholderTextColor={Colors.textMuted}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                textAlign={I18nManager.isRTL ? 'right' : 'left'}
              />
              <Text style={styles.phonePrefix}>+964</Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>البريد الإلكتروني</Text>
            <View style={styles.inputContainer}>
              <Feather name="mail" size={18} color={Colors.textMuted} />
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
              <Feather name="lock" size={18} color={Colors.textMuted} />
              <TextInput
                style={styles.input}
                placeholder="6 أحرف على الأقل"
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

          {success ? (
            <Animated.View entering={FadeIn.duration(300)} style={styles.successBox}>
              <Feather name="check-circle" size={16} color={Colors.success} />
              <Text style={styles.successText}>{success}</Text>
            </Animated.View>
          ) : null}

          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={handleOwnerSignup}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>إنشاء الحساب</Text>
            )}
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
  roleContainer: {
    flex: 1,
    paddingHorizontal: 24,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  roleHeader: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 16,
  },
  boltCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primaryFaded,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  header: {
    marginBottom: 28,
  },
  title: {
    fontSize: 26,
    fontFamily: 'Cairo_700Bold',
    color: Colors.text,
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Cairo_400Regular',
    color: Colors.textSecondary,
    textAlign: 'right',
    marginTop: 4,
  },
  roleCards: {
    gap: 16,
    marginBottom: 24,
  },
  roleCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
    position: 'relative',
  },
  roleCardSubscriber: {
    borderColor: Colors.goldLight,
    backgroundColor: 'rgba(212,175,55,0.03)',
  },
  roleCardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  roleIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primaryFaded,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  roleIconSubscriber: {
    backgroundColor: Colors.goldLight,
  },
  roleTitle: {
    fontSize: 18,
    fontFamily: 'Cairo_700Bold',
    color: Colors.text,
    textAlign: 'right',
    marginBottom: 4,
  },
  roleDesc: {
    fontSize: 13,
    fontFamily: 'Cairo_400Regular',
    color: Colors.textSecondary,
    textAlign: 'right',
    paddingLeft: 32,
  },
  roleArrow: {
    position: 'absolute',
    left: 16,
    top: '50%',
    transform: [{ translateY: -9 }],
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
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Cairo_400Regular',
    color: Colors.text,
    height: '100%',
  },
  phonePrefix: {
    fontSize: 14,
    fontFamily: 'Cairo_600SemiBold',
    color: Colors.primary,
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
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.successLight,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  successText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Cairo_400Regular',
    color: Colors.success,
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
