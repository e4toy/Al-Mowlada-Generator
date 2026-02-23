import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList, Modal, TextInput,
  Platform, Linking, ScrollView, I18nManager,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import {
  Subscriber, Payment, Expense, getMonthKey, getMonthLabel,
  getTierColor, getTierBgColor, getTierLabel, sanitizePhone,
} from '@/lib/storage';

type ModalType = 'none' | 'addSubscriber' | 'editSubscriber' | 'setPricing' | 'partialPayment' | 'addExpense' | 'expenseHistory' | 'payments';
type FilterType = 'all' | 'paid' | 'unpaid';

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const app = useApp();
  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;
  const topPad = (insets.top || webTopInset);
  const bottomPad = (insets.bottom || webBottomInset);

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(now.getMonth());
  const selectedMonth = getMonthKey(selectedYear, selectedMonthIdx);

  const [modal, setModal] = useState<ModalType>('none');
  const [activeSubscriber, setActiveSubscriber] = useState<Subscriber | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterType>('all');

  const [newSubName, setNewSubName] = useState('');
  const [newSubPhone, setNewSubPhone] = useState('');
  const [newSubAmperes, setNewSubAmperes] = useState('');
  const [newSubTier, setNewSubTier] = useState<'gold' | 'silver' | 'bronze'>('gold');

  const [editSubName, setEditSubName] = useState('');
  const [editSubPhone, setEditSubPhone] = useState('');
  const [editSubAmperes, setEditSubAmperes] = useState('');
  const [editSubTier, setEditSubTier] = useState<'gold' | 'silver' | 'bronze'>('gold');

  const [priceGold, setPriceGold] = useState('');
  const [priceSilver, setPriceSilver] = useState('');
  const [priceBronze, setPriceBronze] = useState('');

  const [partialAmount, setPartialAmount] = useState('');

  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');

  const months = useMemo(() => {
    const list: { key: string; label: string; year: number; month: number }[] = [];
    for (let m = 0; m < 12; m++) {
      list.push({
        key: getMonthKey(selectedYear, m),
        label: getMonthLabel(getMonthKey(selectedYear, m)),
        year: selectedYear,
        month: m,
      });
    }
    return list;
  }, [selectedYear]);

  const monthSubscribers = useMemo(() => {
    return app.subscribers.filter(s => s.createdMonth <= selectedMonth);
  }, [app.subscribers, selectedMonth]);

  const filteredSubscribers = useMemo(() => {
    let list = monthSubscribers;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') {
      list = list.filter(s => {
        const due = app.getSubscriberDue(s, selectedMonth);
        const paid = app.getSubscriberPaid(s.id, selectedMonth);
        const remaining = due - paid;
        if (statusFilter === 'paid') return remaining <= 0 && due > 0;
        return remaining > 0 || due === 0;
      });
    }
    return list;
  }, [monthSubscribers, searchQuery, statusFilter, selectedMonth, app]);

  const monthPricing = app.pricing[selectedMonth];

  const monthExpenses = useMemo(() => {
    return app.expenses.filter(e => e.month === selectedMonth);
  }, [app.expenses, selectedMonth]);

  const stats = useMemo(() => {
    let totalAmperes = 0;
    let totalDue = 0;
    let totalPaid = 0;
    monthSubscribers.forEach(sub => {
      totalAmperes += sub.amperes;
      totalDue += app.getSubscriberDue(sub, selectedMonth);
      totalPaid += app.getSubscriberPaid(sub.id, selectedMonth);
    });
    const totalExpenses = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
    return {
      totalAmperes,
      totalCollected: totalPaid,
      totalOutstanding: totalDue - totalPaid,
      totalExpenses,
    };
  }, [monthSubscribers, selectedMonth, app, monthExpenses]);

  function openPricingModal() {
    const p = app.pricing[selectedMonth];
    setPriceGold(p?.gold?.toString() || '');
    setPriceSilver(p?.silver?.toString() || '');
    setPriceBronze(p?.bronze?.toString() || '');
    setModal('setPricing');
  }

  async function savePricing() {
    const g = parseFloat(priceGold) || 0;
    const s = parseFloat(priceSilver) || 0;
    const b = parseFloat(priceBronze) || 0;
    if (g < 0 || s < 0 || b < 0) return;
    await app.setPricing(selectedMonth, { gold: g, silver: s, bronze: b });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setModal('none');
  }

  function openAddSubscriber() {
    setNewSubName('');
    setNewSubPhone('');
    setNewSubAmperes('');
    setNewSubTier('gold');
    setModal('addSubscriber');
  }

  async function saveSubscriber() {
    if (!newSubName.trim() || !newSubAmperes.trim()) return;
    const ampVal = parseFloat(newSubAmperes);
    if (isNaN(ampVal) || ampVal <= 0) return;
    await app.addSubscriber({
      name: newSubName.trim(),
      phone: newSubPhone.trim(),
      amperes: ampVal,
      tier: newSubTier,
      createdMonth: selectedMonth,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setModal('none');
  }

  function openEditSubscriber(sub: Subscriber) {
    setActiveSubscriber(sub);
    setEditSubName(sub.name);
    setEditSubPhone(sub.phone);
    setEditSubAmperes(sub.amperes.toString());
    setEditSubTier(sub.tier);
    setModal('editSubscriber');
  }

  async function saveEditSubscriber() {
    if (!activeSubscriber || !editSubName.trim() || !editSubAmperes.trim()) return;
    const ampVal = parseFloat(editSubAmperes);
    if (isNaN(ampVal) || ampVal <= 0) return;
    await app.updateSubscriber(activeSubscriber.id, {
      name: editSubName.trim(),
      phone: editSubPhone.trim(),
      amperes: ampVal,
      tier: editSubTier,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setModal('none');
  }

  async function handleFullPayment(sub: Subscriber) {
    const due = app.getSubscriberDue(sub, selectedMonth);
    const paid = app.getSubscriberPaid(sub.id, selectedMonth);
    const remaining = due - paid;
    if (remaining <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await app.recordPayment(sub.id, selectedMonth, remaining, 'full');
    const msg = `تم استلام دفعة كاملة بمبلغ ${remaining.toLocaleString()} من ${sub.name} لاشتراك${sub.tier} بتاريخ ${new Date().toLocaleDateString('ar-IQ')}`;
    sendWhatsApp(sub.phone,msg);
  }

  function openPartialPayment(sub: Subscriber) {
    setActiveSubscriber(sub);
    setPartialAmount('');
    setModal('partialPayment');
  }

  async function savePartialPayment() {
    if (!activeSubscriber || !partialAmount.trim()) return;
    const amount = parseFloat(partialAmount);
    if (isNaN(amount) || amount <= 0) return;
    await app.recordPayment(activeSubscriber.id, selectedMonth, amount, 'partial');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const due = app.getSubscriberDue(activeSubscriber, selectedMonth);
    const paid = app.getSubscriberPaid(activeSubscriber.id, selectedMonth) + amount;
    const remaining = due - paid;
    const msg = `تم استلام دفعة جزئية بمبلغ ${amount.toLocaleString()} من ${activeSubscriber.name}. المتبقي: ${remaining.toLocaleString()} بتاريخ ${new Date().toLocaleDateString('ar-IQ')}`;
    sendWhatsApp(activeSubscriber.phone, msg);
    setModal('none');
  }

  function openPaymentHistory(sub: Subscriber) {
    setActiveSubscriber(sub);
    setModal('payments');
  }

  async function handleCancelPayment(paymentId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await app.cancelPayment(paymentId);
  }

  function sendWhatsApp(phone: string, message: string) {
    if (!phone) return;
    const cleanPhone = sanitizePhone(phone);
    const url = `whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;
    Linking.openURL(url).catch(() => {});
  }

  function openExpenseModal() {
    setExpenseDesc('');
    setExpenseAmount('');
    setModal('addExpense');
  }

  async function saveExpense() {
    if (!expenseDesc.trim() || !expenseAmount.trim()) return;
    const amt = parseFloat(expenseAmount);
    if (isNaN(amt) || amt <= 0) return;
    await app.addExpense(selectedMonth, expenseDesc.trim(), amt);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setModal('none');
  }

  async function handleDeleteExpense(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await app.deleteExpense(id);
  }

  function handleLogout() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    app.logout();
    router.replace('/');
  }

  const subscriberPayments = activeSubscriber
    ? app.getSubscriberPayments(activeSubscriber.id, selectedMonth)
    : [];

  const renderSubscriberItem = useCallback(({ item }: { item: Subscriber }) => {
    const due = app.getSubscriberDue(item, selectedMonth);
    const paid = app.getSubscriberPaid(item.id, selectedMonth);
    const remaining = due - paid;
    const isPaidFull = remaining <= 0 && due > 0;
    return (
      <Animated.View entering={FadeInDown.duration(300)} style={styles.subCard}>
        <View style={styles.subHeader}>
          <View style={styles.subInfo}>
            <Text style={styles.subName}>{item.name}</Text>
            <View style={[styles.tierBadge, { backgroundColor: getTierBgColor(item.tier) }]}>
              <Text style={[styles.tierText, { color: getTierColor(item.tier) }]}>{getTierLabel(item.tier)}</Text>
            </View>
          </View>
          <View style={styles.subHeaderRight}>
            <View style={styles.amperesBox}>
              <MaterialCommunityIcons name="flash" size={14} color={Colors.primary} />
              <Text style={styles.amperesText}>{item.amperes}A</Text>
            </View>
            <Pressable
              onPress={() => openEditSubscriber(item)}
              hitSlop={6}
              style={({ pressed }) => [styles.editIconBtn, pressed && { opacity: 0.6 }]}
            >
              <Feather name="edit-2" size={14} color={Colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.subFinancials}>
          <View style={styles.finItem}>
            <Text style={styles.finLabel}>المستحق</Text>
            <Text style={styles.finValue}>{due.toLocaleString()}</Text>
          </View>
          <View style={styles.finDivider} />
          <View style={styles.finItem}>
            <Text style={styles.finLabel}>المدفوع</Text>
            <Text style={[styles.finValue, { color: Colors.success }]}>{paid.toLocaleString()}</Text>
          </View>
          <View style={styles.finDivider} />
          <View style={styles.finItem}>
            <Text style={styles.finLabel}>المتبقي</Text>
            <Text style={[styles.finValue, { color: remaining > 0 ? Colors.error : Colors.success }]}>
              {remaining.toLocaleString()}
            </Text>
          </View>
        </View>

        <View style={styles.subActions}>
          {!isPaidFull ? (
            <>
              <Pressable
                style={({ pressed }) => [styles.actionBtn, styles.fullPayBtn, pressed && { opacity: 0.7 }]}
                onPress={() => handleFullPayment(item)}
              >
                <Feather name="check-circle" size={15} color="#fff" />
                <Text style={styles.actionBtnText}>دفع كامل</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.actionBtn, styles.partialPayBtn, pressed && { opacity: 0.7 }]}
                onPress={() => openPartialPayment(item)}
              >
                <Feather name="edit-3" size={15} color={Colors.primary} />
                <Text style={[styles.actionBtnText, { color: Colors.primary }]}>دفع جزئي</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.paidBadge}>
              <Feather name="check" size={14} color={Colors.success} />
              <Text style={styles.paidText}>مدفوع بالكامل</Text>
            </View>
          )}
          <Pressable
            style={({ pressed }) => [styles.actionBtn, styles.historyBtn, pressed && { opacity: 0.7 }]}
            onPress={() => openPaymentHistory(item)}
          >
            <Feather name="clock" size={15} color={Colors.textSecondary} />
          </Pressable>
        </View>
      </Animated.View>
    );
  }, [selectedMonth, app]);

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.ownerName}>{app.currentOwner?.name || ''}</Text>
          <Text style={styles.ownerLabel}>لوحة التحكم</Text>
        </View>
        <View style={styles.topBarRight}>
          <Pressable onPress={() => setModal('expenseHistory')} hitSlop={6} style={styles.topIconBtn}>
            <Feather name="file-text" size={20} color={Colors.text} />
          </Pressable>
          <Pressable onPress={openExpenseModal} hitSlop={6} style={styles.topIconBtn}>
            <Feather name="settings" size={20} color={Colors.text} />
          </Pressable>
          <Pressable onPress={handleLogout} hitSlop={6} style={styles.topIconBtn}>
            <Feather name="log-out" size={20} color={Colors.error} />
          </Pressable>
        </View>
      </View>

      <View style={styles.yearRow}>
        <Pressable onPress={() => setSelectedYear(y => y - 1)} hitSlop={8}>
          <Feather name="chevron-right" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.yearText}>{selectedYear}</Text>
        <Pressable onPress={() => setSelectedYear(y => y + 1)} hitSlop={8}>
          <Feather name="chevron-left" size={22} color={Colors.text} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.monthScroll}
        style={styles.monthScrollContainer}
      >
        {months.map((m) => {
          const isActive = m.month === selectedMonthIdx;
          return (
            <Pressable
              key={m.key}
              onPress={() => setSelectedMonthIdx(m.month)}
              style={[styles.monthChip, isActive && styles.monthChipActive]}
            >
              <Text style={[styles.monthChipText, isActive && styles.monthChipTextActive]}>
                {m.label.split(' ')[0]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView style={styles.statsRow} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsContent}>
        <StatCard icon="zap" label="إجمالي الأمبيرات" value={stats.totalAmperes.toString()} color={Colors.primary} />
        <StatCard icon="dollar-sign" label="إجمالي المحصّل" value={stats.totalCollected.toLocaleString()} color={Colors.success} />
        <StatCard icon="trending-up" label="المتبقي" value={stats.totalOutstanding.toLocaleString()} color={Colors.error} />
        <StatCard icon="clipboard" label="المصاريف" value={stats.totalExpenses.toLocaleString()} color={Colors.warning} />
      </ScrollView>

      {!monthPricing ? (
        <View style={styles.noPricingBanner}>
          <Feather name="alert-triangle" size={16} color={Colors.warning} />
          <Text style={styles.noPricingText}>لم يتم تعيين أسعار هذا الشهر</Text>
          <Pressable onPress={openPricingModal}>
            <Text style={styles.noPricingLink}>تعيين الآن</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.searchFilterRow}>
        <View style={styles.searchBox}>
          <Feather name="search" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="بحث بالاسم..."
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            textAlign={I18nManager.isRTL ? 'right' : 'left'}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={6}>
              <Feather name="x" size={16} color={Colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.filterRow}>
          {(['all', 'paid', 'unpaid'] as FilterType[]).map((f) => (
            <Pressable
              key={f}
              onPress={() => setStatusFilter(f)}
              style={[styles.filterChip, statusFilter === f && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, statusFilter === f && styles.filterChipTextActive]}>
                {f === 'all' ? 'الكل' : f === 'paid' ? 'مدفوع' : 'غير مدفوع'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        data={filteredSubscribers}
        keyExtractor={(item) => item.id}
        renderItem={renderSubscriberItem}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad + 80 }]}
        style={{ marginTop: -10 }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!filteredSubscribers.length}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="users" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyText}>
              {searchQuery || statusFilter !== 'all' ? 'لا توجد نتائج مطابقة' : 'لا يوجد مشتركون لهذا الشهر'}
            </Text>
            {!searchQuery && statusFilter === 'all' ? (
              <Text style={styles.emptySubText}>أضف مشتركين جدد لبدء الإدارة</Text>
            ) : null}
          </View>
        }
      />

      <Pressable
        style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.93 }] }]}
        onPress={openAddSubscriber}
      >
        <Feather name="plus" size={24} color="#fff" />
      </Pressable>

      {/* Add Subscriber Modal */}
      <Modal visible={modal === 'addSubscriber'} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>إضافة مشترك</Text>
              <Pressable onPress={() => setModal('none')}><Feather name="x" size={22} color={Colors.text} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.modalLabel}>الاسم</Text>
              <TextInput style={styles.modalInput} value={newSubName} onChangeText={setNewSubName} placeholder="اسم المشترك" placeholderTextColor={Colors.textMuted} textAlign={I18nManager.isRTL ? 'right' : 'left'} />
              <Text style={styles.modalLabel}>رقم الهاتف</Text>
              <TextInput style={styles.modalInput} value={newSubPhone} onChangeText={setNewSubPhone} placeholder="07XXXXXXXXX" placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" textAlign={I18nManager.isRTL ? 'right' : 'left'} />
              <Text style={styles.modalLabel}>عدد الأمبيرات</Text>
              <TextInput style={styles.modalInput} value={newSubAmperes} onChangeText={setNewSubAmperes} placeholder="مثال: 5" placeholderTextColor={Colors.textMuted} keyboardType="numeric" textAlign={I18nManager.isRTL ? 'right' : 'left'} />
              <Text style={styles.modalLabel}>نوع الاشتراك</Text>
              <View style={styles.tierPicker}>
                {(['gold', 'silver', 'bronze'] as const).map((t) => (
                  <Pressable
                    key={t}
                    style={[styles.tierOption, newSubTier === t && { backgroundColor: getTierBgColor(t), borderColor: getTierColor(t) }]}
                    onPress={() => setNewSubTier(t)}
                  >
                    <Text style={[styles.tierOptionText, { color: getTierColor(t) }]}>{getTierLabel(t)}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable style={({ pressed }) => [styles.modalBtn, pressed && { opacity: 0.85 }]} onPress={saveSubscriber}>
                <Text style={styles.modalBtnText}>إضافة</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit Subscriber Modal */}
      <Modal visible={modal === 'editSubscriber'} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>تعديل المشترك</Text>
              <Pressable onPress={() => setModal('none')}><Feather name="x" size={22} color={Colors.text} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.modalLabel}>الاسم</Text>
              <TextInput style={styles.modalInput} value={editSubName} onChangeText={setEditSubName} placeholder="اسم المشترك" placeholderTextColor={Colors.textMuted} textAlign={I18nManager.isRTL ? 'right' : 'left'} />
              <Text style={styles.modalLabel}>رقم الهاتف</Text>
              <TextInput style={styles.modalInput} value={editSubPhone} onChangeText={setEditSubPhone} placeholder="07XXXXXXXXX" placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" textAlign={I18nManager.isRTL ? 'right' : 'left'} />
              <Text style={styles.modalLabel}>عدد الأمبيرات</Text>
              <TextInput style={styles.modalInput} value={editSubAmperes} onChangeText={setEditSubAmperes} placeholder="مثال: 5" placeholderTextColor={Colors.textMuted} keyboardType="numeric" textAlign={I18nManager.isRTL ? 'right' : 'left'} />
              <Text style={styles.modalLabel}>نوع الاشتراك</Text>
              <View style={styles.tierPicker}>
                {(['gold', 'silver', 'bronze'] as const).map((t) => (
                  <Pressable
                    key={t}
                    style={[styles.tierOption, editSubTier === t && { backgroundColor: getTierBgColor(t), borderColor: getTierColor(t) }]}
                    onPress={() => setEditSubTier(t)}
                  >
                    <Text style={[styles.tierOptionText, { color: getTierColor(t) }]}>{getTierLabel(t)}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable style={({ pressed }) => [styles.modalBtn, pressed && { opacity: 0.85 }]} onPress={saveEditSubscriber}>
                <Text style={styles.modalBtnText}>حفظ التعديلات</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Set Pricing Modal */}
      <Modal visible={modal === 'setPricing'} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>أسعار {getMonthLabel(selectedMonth)}</Text>
              <Pressable onPress={() => setModal('none')}><Feather name="x" size={22} color={Colors.text} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody}>
              <View style={styles.pricingRow}>
                <View style={[styles.pricingDot, { backgroundColor: Colors.gold }]} />
                <Text style={styles.modalLabel}>سعر الأمبير الذهبي</Text>
              </View>
              <TextInput style={styles.modalInput} value={priceGold} onChangeText={setPriceGold} placeholder="0" placeholderTextColor={Colors.textMuted} keyboardType="numeric" textAlign={I18nManager.isRTL ? 'right' : 'left'} />
              <View style={styles.pricingRow}>
                <View style={[styles.pricingDot, { backgroundColor: Colors.silver }]} />
                <Text style={styles.modalLabel}>سعر الأمبير الليلي</Text>
              </View>
              <TextInput style={styles.modalInput} value={priceSilver} onChangeText={setPriceSilver} placeholder="0" placeholderTextColor={Colors.textMuted} keyboardType="numeric" textAlign={I18nManager.isRTL ? 'right' : 'left'} />
              <View style={styles.pricingRow}>
                <View style={[styles.pricingDot, { backgroundColor: Colors.bronze }]} />
                <Text style={styles.modalLabel}>سعر الأمبير العادي</Text>
              </View>
              <TextInput style={styles.modalInput} value={priceBronze} onChangeText={setPriceBronze} placeholder="0" placeholderTextColor={Colors.textMuted} keyboardType="numeric" textAlign={I18nManager.isRTL ? 'right' : 'left'} />
              <Pressable style={({ pressed }) => [styles.modalBtn, pressed && { opacity: 0.85 }]} onPress={savePricing}>
                <Text style={styles.modalBtnText}>حفظ الأسعار</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Partial Payment Modal */}
      <Modal visible={modal === 'partialPayment'} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: 320 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>دفع جزئي - {activeSubscriber?.name}</Text>
              <Pressable onPress={() => setModal('none')}><Feather name="x" size={22} color={Colors.text} /></Pressable>
            </View>
            <View style={styles.modalBody}>
              {activeSubscriber ? (
                <>
                  <Text style={styles.modalLabel}>
                    المتبقي: {(app.getSubscriberDue(activeSubscriber, selectedMonth) - app.getSubscriberPaid(activeSubscriber.id, selectedMonth)).toLocaleString()}
                  </Text>
                  <TextInput style={styles.modalInput} value={partialAmount} onChangeText={setPartialAmount} placeholder="أدخل المبلغ" placeholderTextColor={Colors.textMuted} keyboardType="numeric" textAlign={I18nManager.isRTL ? 'right' : 'left'} />
                  <Pressable style={({ pressed }) => [styles.modalBtn, pressed && { opacity: 0.85 }]} onPress={savePartialPayment}>
                    <Text style={styles.modalBtnText}>تسجيل الدفع</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Expense Modal */}
      <Modal visible={modal === 'addExpense'} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: 380 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>إضافة مصروف - {getMonthLabel(selectedMonth)}</Text>
              <Pressable onPress={() => setModal('none')}><Feather name="x" size={22} color={Colors.text} /></Pressable>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.modalLabel}>الوصف</Text>
              <TextInput style={styles.modalInput} value={expenseDesc} onChangeText={setExpenseDesc} placeholder="وصف المصروف" placeholderTextColor={Colors.textMuted} textAlign={I18nManager.isRTL ? 'right' : 'left'} />
              <Text style={styles.modalLabel}>المبلغ</Text>
              <TextInput style={styles.modalInput} value={expenseAmount} onChangeText={setExpenseAmount} placeholder="0" placeholderTextColor={Colors.textMuted} keyboardType="numeric" textAlign={I18nManager.isRTL ? 'right' : 'left'} />
              <Pressable style={({ pressed }) => [styles.modalBtn, pressed && { opacity: 0.85 }]} onPress={saveExpense}>
                <Text style={styles.modalBtnText}>إضافة المصروف</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Expense History Modal */}
      <Modal visible={modal === 'expenseHistory'} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>سجل المصاريف - {getMonthLabel(selectedMonth)}</Text>
              <Pressable onPress={() => setModal('none')}><Feather name="x" size={22} color={Colors.text} /></Pressable>
            </View>
            <View style={styles.expenseSummaryBar}>
              <Text style={styles.expenseSummaryLabel}>إجمالي المصاريف:</Text>
              <Text style={styles.expenseSummaryValue}>{stats.totalExpenses.toLocaleString()}</Text>
            </View>
            <FlatList
              data={monthExpenses}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16 }}
              scrollEnabled={!!monthExpenses.length}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Feather name="inbox" size={32} color={Colors.textMuted} />
                  <Text style={styles.emptyText}>لا توجد مصاريف مسجلة لهذا الشهر</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.expenseItem}>
                  <View style={styles.expenseInfo}>
                    <Text style={styles.expenseDesc}>{item.description}</Text>
                    <View style={styles.expenseMetaRow}>
                      <Text style={styles.expenseAmountText}>{item.amount.toLocaleString()}</Text>
                      <Text style={styles.expenseDateText}>
                        {item.date ? new Date(item.date).toLocaleDateString('ar-IQ') : '-'}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => handleDeleteExpense(item.id)}
                    style={({ pressed }) => [styles.cancelPayBtn, pressed && { opacity: 0.6 }]}
                  >
                    <Feather name="trash-2" size={16} color={Colors.error} />
                  </Pressable>
                </View>
              )}
            />
            <Pressable
              style={({ pressed }) => [styles.expenseAddFromHistory, pressed && { opacity: 0.85 }]}
              onPress={() => { setModal('none'); setTimeout(openExpenseModal, 200); }}
            >
              <Feather name="plus" size={18} color="#fff" />
              <Text style={styles.expenseAddBtnText}>إضافة مصروف</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Payment History Modal */}
      <Modal visible={modal === 'payments'} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>سجل الدفعات - {activeSubscriber?.name}</Text>
              <Pressable onPress={() => setModal('none')}><Feather name="x" size={22} color={Colors.text} /></Pressable>
            </View>
            <FlatList
              data={subscriberPayments}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16 }}
              scrollEnabled={!!subscriberPayments.length}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Feather name="inbox" size={32} color={Colors.textMuted} />
                  <Text style={styles.emptyText}>لا توجد دفعات مسجلة</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.paymentItem}>
                  <View style={styles.paymentInfo}>
                    <Text style={styles.paymentAmount}>{item.amount.toLocaleString()}</Text>
                    <Text style={styles.paymentDate}>
                      {new Date(item.date).toLocaleDateString('ar-IQ')} - {item.type === 'full' ? 'كامل' : 'جزئي'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleCancelPayment(item.id)}
                    style={({ pressed }) => [styles.cancelPayBtn, pressed && { opacity: 0.6 }]}
                  >
                    <Feather name="rotate-ccw" size={16} color={Colors.error} />
                  </Pressable>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <View style={statStyles.card}>
      <View style={[statStyles.iconBg, { backgroundColor: color + '18' }]}>
        <Feather name={icon as any} size={18} color={color} />
      </View>
      <Text style={statStyles.value}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    width: 140,
    marginRight: 10,
    gap: 6,
  },
  iconBg: {
    width: 25,
    minHeight: 25,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  value: {
    fontSize: 14,
    fontFamily: 'Cairo_700Bold',
    color: Colors.text,
    lineHeight: 18,
    position: 'relative',
    right: -48,
    bottom: 35,
  },
  label: {
    fontSize: 9,
    fontFamily: 'Cairo_400Regular',
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
    position: "relative",
    bottom: 40,
    left: 20,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  topBarLeft: {
    position: 'relative',
    left: 5,
    top: -2,
    marginBottom: 5,
  },
  topBarRight: {
    flexDirection: 'row',
    gap: 6,
    position: 'absolute',
    right: 10,
    marginBottom: 5,
    zIndex: 999,
  },
  topIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ownerName: {
    fontSize: 10,
    fontFamily: 'Cairo_700Bold',
    color: Colors.text,
    textAlign: 'center',
  },
  ownerLabel: {
    fontSize: 10,
    fontFamily: 'Cairo_400Regular',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  yearRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    position: 'absolute',
    top: 40,
    right: '15%',
    left: '35%',
    marginBottom: 5,
    width: 100,
  },
  yearText: {
    fontSize: 14,
    fontFamily: 'Cairo_700Bold',
    color: Colors.text,
  },
  monthScrollContainer: {
    maxHeight: 80,
    marginBottom: 3,
    height: 50,
    flexShrink: 0,
    zIndex: 10,
  },
  monthScroll: {
    paddingHorizontal: 16,
    gap: 6,
    position: 'absolute',
    top: 5,
  },
  monthChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
  },
  monthChipActive: {
    backgroundColor: Colors.primary,
  },
  monthChipText: {
    fontSize: 13,
    fontFamily: 'Cairo_600SemiBold',
    color: Colors.textSecondary,
  },
  monthChipTextActive: {
    color: '#fff',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 5,
    minHeight: 70,
  },
  statsContent: {
    flex: 1,
    height: '90%',
    paddingVertical: 4,
    marginHorizontal: 4,
    borderRadius: 12,
    position: 'absolute',
    top: 0,
  },
  noPricingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: Colors.warningLight,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  noPricingText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Cairo_400Regular',
    color: Colors.warning,
    textAlign: 'right',
  },
  noPricingLink: {
    fontSize: 13,
    fontFamily: 'Cairo_600SemiBold',
    color: Colors.primary,
  },
  searchFilterRow: {
    paddingHorizontal: 16,
    marginTop: -10,
    marginBottom: 10,
    gap: 8,
    zIndex: 5,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Cairo_400Regular',
    color: Colors.text,
    height: '100%',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    flex: 1,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primaryFaded,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: 'Cairo_600SemiBold',
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.primary,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  subCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 1,
    marginBottom: 3,
    paddingVertical: 1,
    paddingBottom: 3,
    transform: [{ scaleY: 0.95 }],
  },
  subHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: -15,
  },
  subInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  subHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  editIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: Colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 17,
  },
  subName: {
    fontSize: 15,
    fontFamily: 'Cairo_700Bold',
    color: Colors.text,
    marginTop: 17,
  },
  tierBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 17,
  },
  tierText: {
    fontSize: 13,
    fontFamily: 'Cairo_600SemiBold',
  },
  amperesBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.primaryFaded,
    height: 30,
    paddingHorizontal: 5,
    borderRadius: 8,
    marginTop: 17,
  },
  amperesText: {
    fontSize: 15,
    fontFamily: 'Cairo_700Bold',
    color: Colors.primary,
  },
  subFinancials: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingVertical: 5,
    marginBottom: 6,
  },
  finItem: {
    alignItems: 'center',
    flex: 1,
  },
  finDivider: {
    width: 1,
    backgroundColor: Colors.border,
  },
  finLabel: {
    fontSize: 11,
    fontFamily: 'Cairo_400Regular',
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  finValue: {
    fontSize: 13,
    fontFamily: 'Cairo_700Bold',
    color: Colors.text,
  },
  subActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: -5
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 3,
  },
  fullPayBtn: {
    backgroundColor: Colors.success,
  },
  partialPayBtn: {
    backgroundColor: Colors.primaryFaded,
  },
  historyBtn: {
    backgroundColor: Colors.surfaceSecondary,
    marginLeft: 'auto',
  },
  actionBtnText: {
    fontSize: 10,
    fontFamily: 'Cairo_600SemiBold',
    color: '#fff',
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.successLight,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
  },
  paidText: {
    fontSize: 12,
    fontFamily: 'Cairo_600SemiBold',
    color: Colors.success,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: 'Cairo_600SemiBold',
    color: Colors.textMuted,
  },
  emptySubText: {
    fontSize: 13,
    fontFamily: 'Cairo_400Regular',
    color: Colors.textMuted,
  },
  fab: {
    position: 'absolute',
    bottom: 45,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Cairo_700Bold',
    color: Colors.text,
    flex: 1,
    textAlign: 'right',
  },
  modalBody: {
    padding: 20,
    gap: 12,
  },
  modalLabel: {
    fontSize: 14,
    fontFamily: 'Cairo_600SemiBold',
    color: Colors.text,
    textAlign: 'right',
  },
  modalInput: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 15,
    fontFamily: 'Cairo_400Regular',
    color: Colors.text,
  },
  modalBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  modalBtnText: {
    fontSize: 15,
    fontFamily: 'Cairo_700Bold',
    color: '#fff',
  },
  tierPicker: {
    flexDirection: 'row',
    gap: 8,
  },
  tierOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  tierOptionText: {
    fontSize: 13,
    fontFamily: 'Cairo_600SemiBold',
  },
  pricingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pricingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  paymentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  paymentInfo: {
    flex: 1,
  },
  paymentAmount: {
    fontSize: 16,
    fontFamily: 'Cairo_700Bold',
    color: Colors.text,
    textAlign: 'right',
  },
  paymentDate: {
    fontSize: 12,
    fontFamily: 'Cairo_400Regular',
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  cancelPayBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.errorLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expenseSummaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.warningLight,
  },
  expenseSummaryLabel: {
    fontSize: 14,
    fontFamily: 'Cairo_600SemiBold',
    color: Colors.warning,
  },
  expenseSummaryValue: {
    fontSize: 16,
    fontFamily: 'Cairo_700Bold',
    color: Colors.warning,
  },
  expenseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  expenseInfo: {
    flex: 1,
  },
  expenseDesc: {
    fontSize: 15,
    fontFamily: 'Cairo_600SemiBold',
    color: Colors.text,
    textAlign: 'right',
  },
  expenseMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  expenseAmountText: {
    fontSize: 14,
    fontFamily: 'Cairo_700Bold',
    color: Colors.error,
  },
  expenseDateText: {
    fontSize: 12,
    fontFamily: 'Cairo_400Regular',
    color: Colors.textMuted,
  },
  expenseAddFromHistory: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    height: 44,
  },
  expenseAddBtnText: {
    fontSize: 14,
    fontFamily: 'Cairo_700Bold',
    color: '#fff',
  },
});
