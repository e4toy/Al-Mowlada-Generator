import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator,
  Platform, I18nManager,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import { getApiUrl } from '@/lib/query-client';

type Step = 'code' | 'register';

interface OwnerPreview {
  ownerId: string;
  ownerName: string;
  invitationCode: string;
  pricing: { gold: number; silver: number; bronze: number } | null;
}

export default function SubscriberOnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { subscriberSignup } = useApp();

  const [step, setStep] = useState<Step>('code');
  const [invCode, setInvCode] = useState('');
  const [ownerPreview, setOwnerPreview] = useState<OwnerPreview | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;

  async function handleVerifyCode() {
    const code = invCode.trim().toUpperCase();
    if (!code || code.length < 4) {
      setError('يرجى إدخال كود الدعوة');
      return;
    }
    setError('');
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}/api/owners/by-code/${code}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'كود الدعوة غير صحيح');
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setOwnerPreview(data);
      setStep('register');
    } catch {
      setError('حدث خطأ في الاتصال بالسيرفر');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister() {
    if (!name.trim() || !phone.trim() || !email.trim() || !password.trim()) {
      setError('يرجى ملء جميع الحقول');
      return;
    }
    if (password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    setError('');
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await subscriberSignup({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      password,
      invitationCode: invCode.trim().toUpperCase(),
    });
    setSubmitting(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/subscriber-dashboard');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(result.message);
    }
  }

  const topPad = (insets.top || webTopInset) + 20;
  const bottomPad = (insets.bottom || webBottomInset) + 40;

  if (step === 'code') {
    return (
      <View style={styles.container}>
        <KeyboardAwareScrollViewCompat
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scrollContent, { paddingTop: topPad, paddingBottom: bottomPad }]}
          bottomOffset={20}
        >
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={Colors.text} />
          </Pressable>

          <Animated.View entering={FadeIn.duration(500)} style={styles.header}>
            <View style={styles.iconWrap}>
              <Feather name="users" size={30} color={Colors.gold} />
            </View>
            <Text style={styles.title}>ربط حساب مشترك</Text>
            <Text style={styles.subtitle}>أدخل كود الدعوة الذي أرسله لك صاحب المولدة</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>كود الدعوة</Text>
              <View style={[styles.inputContainer, styles.codeInput]}>
                <Feather name="key" size={18} color={Colors.textMuted} />
                <TextInput
                  style={[styles.input, styles.codeText]}
                  placeholder="ABC123"
                  placeholderTextColor={Colors.textMuted}
                  value={invCode}
                  onChangeText={(t) => setInvCode(t.toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={8}
                  textAlign="center"
                />
              </View>
              <Text style={styles.codeHint}>الكود مكون من 6 رموز</Text>
            </View>

            {error ? (
              <Animated.View entering={FadeIn.duration(300)} style={styles.errorBox}>
                <Feather name="alert-circle" size={16} color={Colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            ) : null}

            <Pressable
              style={({ pressed }) => [styles.button, styles.goldButton, pressed && styles.buttonPressed]}
              onPress={handleVerifyCode}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>تحقق من الكود</Text>
              )}
            </Pressable>

            <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
              <Text style={styles.secondaryButtonText}>لديك حساب؟ تسجيل الدخول</Text>
            </Pressable>
          </Animated.View>
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingTop: topPad, paddingBottom: bottomPad }]}
        bottomOffset={20}
      >
        <Pressable onPress={() => { setStep('code'); setError(''); }} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={Colors.text} />
        </Pressable>

        {ownerPreview && (
          <Animated.View entering={FadeIn.duration(400)} style={styles.ownerPreviewCard}>
            <View style={styles.ownerPreviewIcon}>
              <Feather name="zap" size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ownerPreviewTitle}>{ownerPreview.ownerName}</Text>
              <Text style={styles.ownerPreviewSub}>صاحب المولدة</Text>
            </View>
            <View style={styles.verifiedBadge}>
              <Feather name="check-circle" size={16} color={Colors.success} />
              <Text style={styles.verifiedText}>تم التحقق</Text>
            </View>
          </Animated.View>
        )}

        <Animated.View entering={FadeIn.duration(500)} style={[styles.header, { marginTop: 12 }]}>
          <Text style={styles.title}>أنشئ حسابك</Text>
          <Text style={styles.subtitle}>سيتم ربط حسابك بمولدة {ownerPreview?.ownerName}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.form}>
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

          <Pressable
            style={({ pressed }) => [styles.button, styles.goldButton, pressed && styles.buttonPressed]}
            onPress={handleRegister}
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
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  header: { marginBottom: 24 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.goldLight,
    justifyContent: 'center', alignItems: 'center',
    alignSelf: 'center', marginBottom: 16,
  },
  title: { fontSize: 26, fontFamily: 'Cairo_700Bold', color: Colors.text, textAlign: 'right' },
  subtitle: { fontSize: 14, fontFamily: 'Cairo_400Regular', color: Colors.textSecondary, textAlign: 'right', marginTop: 4 },
  ownerPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
    marginBottom: 8,
  },
  ownerPreviewIcon: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Colors.primaryFaded,
    justifyContent: 'center', alignItems: 'center',
  },
  ownerPreviewTitle: { fontSize: 15, fontFamily: 'Cairo_700Bold', color: Colors.text, textAlign: 'right' },
  ownerPreviewSub: { fontSize: 12, fontFamily: 'Cairo_400Regular', color: Colors.textMuted, textAlign: 'right' },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { fontSize: 12, fontFamily: 'Cairo_600SemiBold', color: Colors.success },
  form: { gap: 16 },
  inputGroup: { gap: 6 },
  label: { fontSize: 14, fontFamily: 'Cairo_600SemiBold', color: Colors.text, textAlign: 'right' },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, height: 52, gap: 10,
  },
  codeInput: { borderColor: Colors.gold, borderWidth: 1.5 },
  input: { flex: 1, fontSize: 15, fontFamily: 'Cairo_400Regular', color: Colors.text, height: '100%' },
  codeText: { fontSize: 20, fontFamily: 'Cairo_700Bold', letterSpacing: 4, textAlign: 'center' },
  codeHint: { fontSize: 12, fontFamily: 'Cairo_400Regular', color: Colors.textMuted, textAlign: 'right', marginTop: 2 },
  phonePrefix: { fontSize: 14, fontFamily: 'Cairo_600SemiBold', color: Colors.primary },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.errorLight, paddingVertical: 10,
    paddingHorizontal: 14, borderRadius: 10,
  },
  errorText: { flex: 1, fontSize: 13, fontFamily: 'Cairo_400Regular', color: Colors.error, textAlign: 'right' },
  button: {
    borderRadius: 12, height: 52,
    justifyContent: 'center', alignItems: 'center', marginTop: 8,
  },
  goldButton: { backgroundColor: Colors.gold },
  buttonPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  buttonText: { fontSize: 16, fontFamily: 'Cairo_700Bold', color: '#fff' },
  secondaryButton: { height: 44, justifyContent: 'center', alignItems: 'center' },
  secondaryButtonText: { fontSize: 14, fontFamily: 'Cairo_600SemiBold', color: Colors.primary },
});
