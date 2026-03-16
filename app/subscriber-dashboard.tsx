import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Modal, FlatList,
  Platform, ActivityIndicator, RefreshControl, TextInput, I18nManager,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import { Storage, AppUser, AppMessage, MonthlyPricing, Payment, PaymentMethodData, getMonthLabel } from '@/lib/storage';
import { getApiUrl } from '@/lib/query-client';

type DrawerTab = 'none' | 'drawer';

const TIER_LABELS: Record<string, string> = { gold: 'ذهبي', silver: 'ليلي', bronze: 'عادي' };
const TIER_COLORS: Record<string, string> = { gold: Colors.gold, silver: Colors.silver, bronze: Colors.bronze };
const TIER_BG: Record<string, string> = { gold: Colors.goldLight, silver: Colors.silverLight, bronze: Colors.bronzeLight };

export default function SubscriberDashboardScreen() {
  const insets = useSafeAreaInsets();
  const { logout, session } = useApp();

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;
  const topPad = insets.top || webTopInset;
  const bottomPad = insets.bottom || webBottomInset;

  const [user, setUser] = useState<AppUser | null>(null);
  const [pricing, setPricing] = useState<Record<string, MonthlyPricing>>({});
  const [messages, setMessages] = useState<AppMessage[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'prices' | 'messages' | 'payments'>('prices');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showAddPaymentMethod, setShowAddPaymentMethod] = useState(false);
  const [addMethodType, setAddMethodType] = useState<'zaincash' | 'card' | null>(null);
  const [methodDetails, setMethodDetails] = useState('');
  const [methodSubmitting, setMethodSubmitting] = useState(false);

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const currentPricing = pricing[currentMonth];

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const savedUser = await Storage.getAppUser();
      if (!savedUser) {
        router.replace('/');
        return;
      }
      setUser(savedUser);
      await fetchAll(savedUser.id, savedUser.linkedOwnerId);
    } catch (e) {
      console.error('Load subscriber data error:', e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAll(userId: string, ownerId: string) {
    const baseUrl = getApiUrl();
    try {
      const [prcRes, msgRes, payRes, pmRes] = await Promise.all([
        fetch(`${baseUrl}/api/app-users/${userId}/pricing`),
        fetch(`${baseUrl}/api/messages/${ownerId}`),
        fetch(`${baseUrl}/api/app-users/${userId}/payments`),
        fetch(`${baseUrl}/api/payment-methods/${userId}`),
      ]);
      if (prcRes.ok) {
        const prcData = await prcRes.json();
        setPricing(prcData);
      }
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        setMessages(msgData);
      }
      if (payRes.ok) {
        const payData = await payRes.json();
        setPayments(payData);
      }
      if (pmRes.ok) {
        const pmData = await pmRes.json();
        setPaymentMethods(pmData);
      }
    } catch (e) {
      console.error('Fetch subscriber data error:', e);
    }
  }

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const savedUser = await Storage.getAppUser();
    if (savedUser) {
      await fetchAll(savedUser.id, savedUser.linkedOwnerId);
    }
    setRefreshing(false);
  }, []);

  async function handleAddPaymentMethod() {
    if (!user || !addMethodType || !methodDetails.trim()) return;
    setMethodSubmitting(true);
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}/api/payment-methods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          userType: 'subscriber',
          methodType: addMethodType,
          details: methodDetails.trim(),
          isDefault: paymentMethods.length === 0,
        }),
      });
      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await fetchAll(user.id, user.linkedOwnerId);
        setShowAddPaymentMethod(false);
        setAddMethodType(null);
        setMethodDetails('');
      }
    } catch {}
    setMethodSubmitting(false);
  }

  async function handleDeletePaymentMethod(id: string) {
    if (!user) return;
    try {
      const baseUrl = getApiUrl();
      await fetch(`${baseUrl}/api/payment-methods/${id}`, { method: 'DELETE' });
      await fetchAll(user.id, user.linkedOwnerId);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  }

  async function handleLogout() {
    await logout();
    router.replace('/');
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.gold} />
      </View>
    );
  }

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Pressable onPress={() => setDrawerOpen(true)} hitSlop={8}>
          <Feather name="menu" size={24} color={Colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>المولدة</Text>
          {user?.ownerName ? <Text style={styles.headerSub}>{user.ownerName}</Text> : null}
        </View>
        <View style={styles.headerRight}>
          <View style={styles.onlineDot} />
        </View>
      </View>

      <View style={styles.tabBar}>
        {(['prices', 'messages', 'payments'] as const).map((tab) => (
          <Pressable key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'prices' ? 'الأسعار' : tab === 'messages' ? 'الرسائل' : 'المدفوعات'}
            </Text>
            {tab === 'messages' && messages.length > 0 && (
              <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{messages.length}</Text></View>
            )}
          </Pressable>
        ))}
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomPad + 24, paddingTop: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.gold} />}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'prices' && (
          <Animated.View entering={FadeIn.duration(300)}>
            <Text style={styles.sectionTitle}>أسعار الأمبير - {getMonthLabel(currentMonth)}</Text>
            {currentPricing ? (
              <View style={styles.priceCards}>
                {(['gold', 'silver', 'bronze'] as const).map((tier) => (
                  <Animated.View key={tier} entering={FadeInDown.delay((['gold','silver','bronze'].indexOf(tier)) * 80).duration(400)} style={[styles.priceCard, { borderColor: TIER_COLORS[tier], borderWidth: 1.5 }]}>
                    <View style={[styles.priceCardIcon, { backgroundColor: TIER_BG[tier] }]}>
                      <Feather name="zap" size={18} color={TIER_COLORS[tier]} />
                    </View>
                    <Text style={[styles.priceTierLabel, { color: TIER_COLORS[tier] }]}>{TIER_LABELS[tier]}</Text>
                    <Text style={styles.priceAmount}>{currentPricing[tier].toLocaleString()}</Text>
                    <Text style={styles.pricePer}>د.ع / أمبير</Text>
                  </Animated.View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Feather name="tag" size={36} color={Colors.textMuted} />
                <Text style={styles.emptyText}>لم تُحدَّد الأسعار بعد لهذا الشهر</Text>
              </View>
            )}

            {Object.keys(pricing).length > 1 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 24 }]}>الأشهر السابقة</Text>
                {Object.entries(pricing)
                  .filter(([m]) => m !== currentMonth)
                  .sort(([a], [b]) => b.localeCompare(a))
                  .slice(0, 3)
                  .map(([month, prc]) => (
                    <View key={month} style={styles.prevMonthCard}>
                      <Text style={styles.prevMonthLabel}>{getMonthLabel(month)}</Text>
                      <View style={styles.prevMonthPrices}>
                        {(['gold', 'silver', 'bronze'] as const).map((t) => (
                          <View key={t} style={styles.prevMonthItem}>
                            <Text style={[styles.prevMonthTier, { color: TIER_COLORS[t] }]}>{TIER_LABELS[t]}</Text>
                            <Text style={styles.prevMonthPrice}>{prc[t].toLocaleString()}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
              </>
            )}
          </Animated.View>
        )}

        {activeTab === 'messages' && (
          <Animated.View entering={FadeIn.duration(300)}>
            <Text style={styles.sectionTitle}>رسائل صاحب المولدة</Text>
            {messages.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="message-square" size={36} color={Colors.textMuted} />
                <Text style={styles.emptyText}>لا توجد رسائل بعد</Text>
              </View>
            ) : (
              messages.map((msg) => (
                <Animated.View key={msg.id} entering={FadeInDown.duration(300)} style={styles.messageCard}>
                  <View style={styles.messageIcon}>
                    <Feather name="message-circle" size={18} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.messageTitle}>{msg.title}</Text>
                    <Text style={styles.messageBody}>{msg.body}</Text>
                    <Text style={styles.messageDate}>{new Date(msg.createdAt).toLocaleDateString('ar-IQ')}</Text>
                  </View>
                </Animated.View>
              ))
            )}
          </Animated.View>
        )}

        {activeTab === 'payments' && (
          <Animated.View entering={FadeIn.duration(300)}>
            <View style={styles.paymentSummary}>
              <View style={styles.paymentSummaryItem}>
                <Text style={styles.paymentSummaryValue}>{totalPaid.toLocaleString()}</Text>
                <Text style={styles.paymentSummaryLabel}>مجموع المدفوع</Text>
              </View>
              <View style={styles.paymentSummaryDivider} />
              <View style={styles.paymentSummaryItem}>
                <Text style={styles.paymentSummaryValue}>{payments.length}</Text>
                <Text style={styles.paymentSummaryLabel}>عدد الدفعات</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>سجل الدفعات</Text>
            {payments.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="credit-card" size={36} color={Colors.textMuted} />
                <Text style={styles.emptyText}>لا توجد دفعات مسجلة بعد</Text>
              </View>
            ) : (
              payments.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((pay: any) => (
                <Animated.View key={pay.id} entering={FadeInDown.duration(300)} style={styles.paymentCard}>
                  <View style={[styles.paymentTypeTag, { backgroundColor: pay.type === 'full' ? Colors.successLight : Colors.warningLight }]}>
                    <Text style={[styles.paymentTypeText, { color: pay.type === 'full' ? Colors.success : Colors.warning }]}>
                      {pay.type === 'full' ? 'كامل' : 'جزئي'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.paymentMonth}>{getMonthLabel(pay.month)}</Text>
                    <Text style={styles.paymentDate}>{new Date(pay.date).toLocaleDateString('ar-IQ')}</Text>
                  </View>
                  <Text style={styles.paymentAmount}>{Number(pay.amount).toLocaleString()} د.ع</Text>
                </Animated.View>
              ))
            )}
          </Animated.View>
        )}
      </ScrollView>

      <Modal
        visible={drawerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setDrawerOpen(false)}
      >
        <Pressable style={styles.drawerOverlay} onPress={() => setDrawerOpen(false)}>
          <Pressable style={[styles.drawer, { paddingTop: topPad + 16, paddingBottom: bottomPad + 16 }]} onPress={() => {}}>
            <View style={styles.drawerHeader}>
              <View>
                <Text style={styles.drawerUserName}>{user?.name}</Text>
                <Text style={styles.drawerUserSub}>مشترك • {user?.ownerName}</Text>
              </View>
              <Pressable onPress={() => setDrawerOpen(false)} hitSlop={8}>
                <Feather name="x" size={22} color={Colors.text} />
              </Pressable>
            </View>

            <View style={styles.drawerDivider} />

            <Text style={styles.drawerSectionLabel}>وسائل الدفع</Text>
            {paymentMethods.length === 0 ? (
              <Text style={styles.drawerEmpty}>لم تُضَف وسيلة دفع بعد</Text>
            ) : (
              paymentMethods.map((pm) => (
                <View key={pm.id} style={styles.drawerPayMethodItem}>
                  <Feather name={pm.methodType === 'zaincash' ? 'smartphone' : 'credit-card'} size={18} color={Colors.text} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.drawerPayMethodType}>{pm.methodType === 'zaincash' ? 'زين كاش' : 'بطاقة ائتمانية'}</Text>
                    <Text style={styles.drawerPayMethodDetails}>{pm.details}</Text>
                  </View>
                  {pm.isDefault && (
                    <View style={styles.defaultBadge}><Text style={styles.defaultBadgeText}>افتراضي</Text></View>
                  )}
                  <Pressable onPress={() => handleDeletePaymentMethod(pm.id)} hitSlop={8}>
                    <Feather name="trash-2" size={16} color={Colors.error} />
                  </Pressable>
                </View>
              ))
            )}
            <Pressable
              style={[styles.drawerItem, { marginTop: 8 }]}
              onPress={() => { setDrawerOpen(false); setShowAddPaymentMethod(true); }}
            >
              <Feather name={paymentMethods.length > 0 ? 'edit-2' : 'plus-circle'} size={20} color={Colors.primary} />
              <Text style={styles.drawerItemText}>{paymentMethods.length > 0 ? 'تعديل وسائل الدفع' : 'إضافة وسيلة دفع'}</Text>
            </Pressable>

            <View style={styles.drawerDivider} />

            <Pressable style={[styles.drawerItem, styles.logoutItem]} onPress={handleLogout}>
              <Feather name="log-out" size={20} color={Colors.error} />
              <Text style={[styles.drawerItemText, { color: Colors.error }]}>تسجيل الخروج</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showAddPaymentMethod} transparent animationType="slide" onRequestClose={() => setShowAddPaymentMethod(false)}>
        <Pressable style={styles.drawerOverlay} onPress={() => setShowAddPaymentMethod(false)}>
          <Pressable style={[styles.bottomSheet, { paddingBottom: bottomPad + 16 }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>إضافة وسيلة دفع</Text>
            {!addMethodType ? (
              <View style={{ gap: 12, marginTop: 8 }}>
                <Pressable style={({ pressed }) => [styles.methodOption, pressed && styles.methodOptionPressed]}
                  onPress={() => setAddMethodType('zaincash')}>
                  <Feather name="smartphone" size={22} color={Colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.methodOptionTitle}>زين كاش</Text>
                    <Text style={styles.methodOptionDesc}>ربط رقم محفظة زين كاش</Text>
                  </View>
                  <Feather name="chevron-left" size={18} color={Colors.textMuted} />
                </Pressable>
                <Pressable style={({ pressed }) => [styles.methodOption, pressed && styles.methodOptionPressed]}
                  onPress={() => setAddMethodType('card')}>
                  <Feather name="credit-card" size={22} color={Colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.methodOptionTitle}>بطاقة ائتمانية</Text>
                    <Text style={styles.methodOptionDesc}>ربط بطاقة مصرفية</Text>
                  </View>
                  <Feather name="chevron-left" size={18} color={Colors.textMuted} />
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 16, marginTop: 8 }}>
                <Pressable onPress={() => setAddMethodType(null)} style={styles.backBtn}>
                  <Feather name="arrow-left" size={20} color={Colors.text} />
                  <Text style={{ fontFamily: 'Cairo_400Regular', color: Colors.text, fontSize: 14 }}>
                    {addMethodType === 'zaincash' ? 'زين كاش' : 'بطاقة ائتمانية'}
                  </Text>
                </Pressable>
                <Text style={styles.methodHint}>
                  {addMethodType === 'zaincash' ? 'أدخل رقم محفظة زين كاش' : 'أدخل رقم البطاقة (مشفر)'}
                </Text>
                <View style={styles.inputContainer}>
                  <Feather name={addMethodType === 'zaincash' ? 'smartphone' : 'credit-card'} size={18} color={Colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder={addMethodType === 'zaincash' ? '07XXXXXXXXX' : 'XXXX-XXXX-XXXX-XXXX'}
                    placeholderTextColor={Colors.textMuted}
                    value={methodDetails}
                    onChangeText={setMethodDetails}
                    keyboardType={addMethodType === 'zaincash' ? 'phone-pad' : 'numeric'}
                    textAlign={I18nManager.isRTL ? 'right' : 'left'}
                  />
                </View>
                {addMethodType === 'card' && (
                  <View style={styles.securityNote}>
                    <Feather name="shield" size={14} color={Colors.primary} />
                    <Text style={styles.securityText}>البيانات محمية ومشفرة ولا تُخزَّن بشكل نصي</Text>
                  </View>
                )}
                <Pressable
                  style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                  onPress={handleAddPaymentMethod}
                  disabled={methodSubmitting}
                >
                  {methodSubmitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.buttonText}>حفظ</Text>}
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontFamily: 'Cairo_700Bold', color: Colors.text },
  headerSub: { fontSize: 12, fontFamily: 'Cairo_400Regular', color: Colors.textMuted },
  headerRight: { width: 24, alignItems: 'flex-end' },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 4,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.gold,
  },
  tabText: { fontSize: 14, fontFamily: 'Cairo_600SemiBold', color: Colors.textMuted },
  tabTextActive: { color: Colors.gold },
  tabBadge: {
    backgroundColor: Colors.gold, borderRadius: 10,
    minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeText: { fontSize: 10, fontFamily: 'Cairo_700Bold', color: '#fff' },
  content: { flex: 1 },
  sectionTitle: { fontSize: 15, fontFamily: 'Cairo_700Bold', color: Colors.text, marginBottom: 12, textAlign: 'right' },
  priceCards: { flexDirection: 'row', gap: 10 },
  priceCard: {
    flex: 1, backgroundColor: Colors.surface,
    borderRadius: 14, padding: 14,
    alignItems: 'center', gap: 6,
  },
  priceCardIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  priceTierLabel: { fontSize: 14, fontFamily: 'Cairo_700Bold' },
  priceAmount: { fontSize: 18, fontFamily: 'Cairo_700Bold', color: Colors.text },
  pricePer: { fontSize: 11, fontFamily: 'Cairo_400Regular', color: Colors.textMuted },
  prevMonthCard: {
    backgroundColor: Colors.surface, borderRadius: 12,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  prevMonthLabel: { fontSize: 14, fontFamily: 'Cairo_600SemiBold', color: Colors.text, textAlign: 'right', marginBottom: 8 },
  prevMonthPrices: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  prevMonthItem: { alignItems: 'center' },
  prevMonthTier: { fontSize: 11, fontFamily: 'Cairo_600SemiBold' },
  prevMonthPrice: { fontSize: 13, fontFamily: 'Cairo_700Bold', color: Colors.text },
  messageCard: {
    backgroundColor: Colors.surface, borderRadius: 12,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
    flexDirection: 'row', gap: 12,
  },
  messageIcon: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.primaryFaded,
    justifyContent: 'center', alignItems: 'center',
  },
  messageTitle: { fontSize: 15, fontFamily: 'Cairo_700Bold', color: Colors.text, textAlign: 'right' },
  messageBody: { fontSize: 13, fontFamily: 'Cairo_400Regular', color: Colors.textSecondary, textAlign: 'right', marginTop: 4 },
  messageDate: { fontSize: 11, fontFamily: 'Cairo_400Regular', color: Colors.textMuted, textAlign: 'right', marginTop: 6 },
  paymentSummary: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 14, padding: 16,
    marginBottom: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  paymentSummaryItem: { flex: 1, alignItems: 'center' },
  paymentSummaryValue: { fontSize: 20, fontFamily: 'Cairo_700Bold', color: Colors.text },
  paymentSummaryLabel: { fontSize: 12, fontFamily: 'Cairo_400Regular', color: Colors.textMuted, marginTop: 2 },
  paymentSummaryDivider: { width: 1, backgroundColor: Colors.border },
  paymentCard: {
    backgroundColor: Colors.surface, borderRadius: 12,
    padding: 14, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  paymentTypeTag: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8, alignSelf: 'flex-start',
  },
  paymentTypeText: { fontSize: 11, fontFamily: 'Cairo_700Bold' },
  paymentMonth: { fontSize: 14, fontFamily: 'Cairo_600SemiBold', color: Colors.text, textAlign: 'right' },
  paymentDate: { fontSize: 12, fontFamily: 'Cairo_400Regular', color: Colors.textMuted, textAlign: 'right' },
  paymentAmount: { fontSize: 15, fontFamily: 'Cairo_700Bold', color: Colors.success },
  emptyState: {
    alignItems: 'center', paddingVertical: 48, gap: 12,
  },
  emptyText: { fontSize: 14, fontFamily: 'Cairo_400Regular', color: Colors.textMuted },
  drawerOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
  },
  drawer: {
    width: '80%',
    height: '100%',
    backgroundColor: Colors.surface,
    paddingHorizontal: 20,
    alignSelf: 'flex-start',
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  drawerHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 16,
  },
  drawerUserName: { fontSize: 16, fontFamily: 'Cairo_700Bold', color: Colors.text },
  drawerUserSub: { fontSize: 12, fontFamily: 'Cairo_400Regular', color: Colors.textMuted, marginTop: 2 },
  drawerDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 16 },
  drawerSectionLabel: { fontSize: 12, fontFamily: 'Cairo_600SemiBold', color: Colors.textMuted, textAlign: 'right', marginBottom: 12, textTransform: 'uppercase' },
  drawerEmpty: { fontSize: 13, fontFamily: 'Cairo_400Regular', color: Colors.textMuted, textAlign: 'right', marginBottom: 8 },
  drawerPayMethodItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10,
  },
  drawerPayMethodType: { fontSize: 14, fontFamily: 'Cairo_600SemiBold', color: Colors.text, textAlign: 'right' },
  drawerPayMethodDetails: { fontSize: 12, fontFamily: 'Cairo_400Regular', color: Colors.textMuted, textAlign: 'right' },
  defaultBadge: {
    backgroundColor: Colors.primaryFaded, borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  defaultBadgeText: { fontSize: 10, fontFamily: 'Cairo_600SemiBold', color: Colors.primary },
  drawerItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12,
  },
  drawerItemText: { fontSize: 15, fontFamily: 'Cairo_600SemiBold', color: Colors.text },
  logoutItem: { marginTop: 8 },
  bottomSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingTop: 12,
    width: '100%',
    alignSelf: 'flex-end',
  },
  sheetHandle: {
    width: 40, height: 4, backgroundColor: Colors.border,
    borderRadius: 2, alignSelf: 'center', marginBottom: 16,
  },
  sheetTitle: { fontSize: 18, fontFamily: 'Cairo_700Bold', color: Colors.text, textAlign: 'right', marginBottom: 16 },
  methodOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, backgroundColor: Colors.background,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
  },
  methodOptionPressed: { opacity: 0.8 },
  methodOptionTitle: { fontSize: 15, fontFamily: 'Cairo_600SemiBold', color: Colors.text, textAlign: 'right' },
  methodOptionDesc: { fontSize: 12, fontFamily: 'Cairo_400Regular', color: Colors.textMuted, textAlign: 'right' },
  methodHint: { fontSize: 14, fontFamily: 'Cairo_600SemiBold', color: Colors.text, textAlign: 'right' },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.background, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, height: 52, gap: 10,
  },
  input: { flex: 1, fontSize: 15, fontFamily: 'Cairo_400Regular', color: Colors.text, height: '100%' },
  securityNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primaryFaded, borderRadius: 8, padding: 10,
  },
  securityText: { flex: 1, fontSize: 12, fontFamily: 'Cairo_400Regular', color: Colors.primary, textAlign: 'right' },
  button: {
    backgroundColor: Colors.primary, borderRadius: 12, height: 52,
    justifyContent: 'center', alignItems: 'center',
  },
  buttonPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  buttonText: { fontSize: 16, fontFamily: 'Cairo_700Bold', color: '#fff' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
