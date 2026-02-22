import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, SectionList, Modal,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import { Owner, isOwnerExpired, getDaysRemaining, getOwnerExpiryDate } from '@/lib/storage';

export default function AdminDashboardScreen() {
  const insets = useSafeAreaInsets();
  const app = useApp();
  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;
  const topPad = (insets.top || webTopInset);

  const [renewModal, setRenewModal] = useState(false);
  const [renewTarget, setRenewTarget] = useState<Owner | null>(null);

  const sections = useMemo(() => {
    const pending = app.owners.filter(o => o.status === 'pending');
    const active = app.owners.filter(o => o.status === 'approved' && !isOwnerExpired(o));
    const expired = app.owners.filter(o => o.status === 'approved' && isOwnerExpired(o));
    const rejected = app.owners.filter(o => o.status === 'rejected');

    const result: { title: string; data: Owner[]; type: string }[] = [];
    if (pending.length > 0) result.push({ title: 'طلبات الانتظار', data: pending, type: 'pending' });
    if (active.length > 0) result.push({ title: 'الحسابات النشطة', data: active, type: 'active' });
    if (expired.length > 0) result.push({ title: 'حسابات منتهية الصلاحية', data: expired, type: 'expired' });
    if (rejected.length > 0) result.push({ title: 'الحسابات المرفوضة', data: rejected, type: 'rejected' });
    return result;
  }, [app.owners]);

  function handleLogout() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    app.logout();
    router.replace('/');
  }

  async function handleApprove(ownerId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await app.approveOwner(ownerId);
  }

  async function handleReject(ownerId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await app.rejectOwner(ownerId);
  }

  async function handleDelete(ownerId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await app.deleteOwner(ownerId);
  }

  function openRenewModal(owner: Owner) {
    setRenewTarget(owner);
    setRenewModal(true);
  }

  async function handleRenew(months: number) {
    if (!renewTarget) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await app.renewOwner(renewTarget.id, months);
    setRenewModal(false);
    setRenewTarget(null);
  }

  const renderOwnerItem = useCallback(({ item, section }: { item: Owner; section: { type: string } }) => {
    const sectionType = section.type;
    const daysLeft = getDaysRemaining(item);
    const expiryDate = getOwnerExpiryDate(item);
    return (
      <Animated.View entering={FadeInDown.duration(300)} style={styles.ownerCard}>
        <View style={styles.ownerHeader}>
          <View style={styles.ownerAvatar}>
            <Feather name="user" size={20} color={Colors.primary} />
          </View>
          <View style={styles.ownerInfo}>
            <Text style={styles.ownerName}>{item.name}</Text>
            <Text style={styles.ownerEmail}>{item.email}</Text>
            <Text style={styles.ownerPhone}>{item.phone}</Text>
          </View>
          {sectionType === 'active' ? (
            <View style={styles.daysLeftBadge}>
              <Text style={styles.daysLeftText}>{daysLeft} يوم</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.ownerMeta}>
          <Feather name="calendar" size={13} color={Colors.textMuted} />
          <Text style={styles.metaText}>
            تاريخ التسجيل: {new Date(item.createdAt).toLocaleDateString('ar-IQ')}
          </Text>
        </View>
        {expiryDate && (sectionType === 'active' || sectionType === 'expired') ? (
          <View style={styles.ownerMeta}>
            <Feather name="clock" size={13} color={sectionType === 'expired' ? Colors.error : Colors.textMuted} />
            <Text style={[styles.metaText, sectionType === 'expired' && { color: Colors.error }]}>
              تاريخ الانتهاء: {expiryDate.toLocaleDateString('ar-IQ')}
            </Text>
          </View>
        ) : null}

        <View style={styles.ownerActions}>
          {sectionType === 'pending' ? (
            <>
              <Pressable
                style={({ pressed }) => [styles.adminActionBtn, styles.approveBtn, pressed && { opacity: 0.7 }]}
                onPress={() => handleApprove(item.id)}
              >
                <Feather name="check" size={16} color="#fff" />
                <Text style={styles.adminActionBtnText}>قبول</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.adminActionBtn, styles.rejectBtn, pressed && { opacity: 0.7 }]}
                onPress={() => handleReject(item.id)}
              >
                <Feather name="x" size={16} color="#fff" />
                <Text style={styles.adminActionBtnText}>رفض</Text>
              </Pressable>
            </>
          ) : null}
          {sectionType === 'active' || sectionType === 'expired' ? (
            <Pressable
              style={({ pressed }) => [styles.adminActionBtn, styles.renewBtn, pressed && { opacity: 0.7 }]}
              onPress={() => openRenewModal(item)}
            >
              <Feather name="refresh-cw" size={16} color="#fff" />
              <Text style={styles.adminActionBtnText}>تجديد</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.adminActionBtn, styles.deleteBtn, pressed && { opacity: 0.7 }]}
            onPress={() => handleDelete(item.id)}
          >
            <Feather name="trash-2" size={16} color={Colors.error} />
          </Pressable>
        </View>
      </Animated.View>
    );
  }, []);

  const renewOptions = [
    { months: 1, label: 'شهر واحد', sublabel: '30 يوم' },
    { months: 3, label: '3 أشهر', sublabel: '90 يوم' },
    { months: 6, label: '6 أشهر', sublabel: '180 يوم' },
  ];

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <View style={styles.adminBadge}>
            <MaterialCommunityIcons name="shield-check" size={16} color="#D32F2F" />
            <Text style={styles.adminBadgeText}>مشرف النظام</Text>
          </View>
          <Text style={styles.pageTitle}>إدارة المالكين</Text>
        </View>
        <Pressable onPress={handleLogout} style={styles.logoutBtn}>
          <Feather name="log-out" size={20} color={Colors.error} />
        </Pressable>
      </View>

      <View style={styles.statsBar}>
        <View style={styles.miniStat}>
          <Text style={styles.miniStatValue}>{app.owners.filter(o => o.status === 'pending').length}</Text>
          <Text style={styles.miniStatLabel}>قيد الانتظار</Text>
        </View>
        <View style={styles.miniStatDivider} />
        <View style={styles.miniStat}>
          <Text style={styles.miniStatValue}>{app.owners.filter(o => o.status === 'approved' && !isOwnerExpired(o)).length}</Text>
          <Text style={styles.miniStatLabel}>نشط</Text>
        </View>
        <View style={styles.miniStatDivider} />
        <View style={styles.miniStat}>
          <Text style={styles.miniStatValue}>{app.owners.filter(o => o.status === 'approved' && isOwnerExpired(o)).length}</Text>
          <Text style={styles.miniStatLabel}>منتهي</Text>
        </View>
        <View style={styles.miniStatDivider} />
        <View style={styles.miniStat}>
          <Text style={styles.miniStatValue}>{app.owners.length}</Text>
          <Text style={styles.miniStatLabel}>الإجمالي</Text>
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderOwnerItem}
        renderSectionHeader={({ section: { title } }) => (
          <Text style={styles.sectionTitle}>{title}</Text>
        )}
        contentContainerStyle={[styles.listContent, { paddingBottom: (insets.bottom || webBottomInset) + 20 }]}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="users" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyText}>لا توجد حسابات مسجلة</Text>
          </View>
        }
      />

      {/* Renewal Modal */}
      <Modal visible={renewModal} animationType="slide" transparent>
        <View style={styles.renewOverlay}>
          <View style={styles.renewContent}>
            <View style={styles.renewHeader}>
              <Text style={styles.renewTitle}>تجديد الاشتراك</Text>
              <Pressable onPress={() => setRenewModal(false)}>
                <Feather name="x" size={22} color={Colors.text} />
              </Pressable>
            </View>
            {renewTarget ? (
              <View style={styles.renewBody}>
                <View style={styles.renewOwnerInfo}>
                  <Feather name="user" size={18} color={Colors.primary} />
                  <Text style={styles.renewOwnerName}>{renewTarget.name}</Text>
                </View>
                <Text style={styles.renewSubtitle}>اختر مدة التجديد</Text>
                {renewOptions.map((opt) => (
                  <Pressable
                    key={opt.months}
                    style={({ pressed }) => [styles.renewOption, pressed && { opacity: 0.7 }]}
                    onPress={() => handleRenew(opt.months)}
                  >
                    <View style={styles.renewOptionLeft}>
                      <Text style={styles.renewOptionLabel}>{opt.label}</Text>
                      <Text style={styles.renewOptionSub}>{opt.sublabel}</Text>
                    </View>
                    <Feather name="chevron-left" size={20} color={Colors.primary} />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

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
    flex: 1,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(211, 47, 47, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  adminBadgeText: {
    fontSize: 12,
    fontFamily: 'Cairo_600SemiBold',
    color: '#D32F2F',
  },
  pageTitle: {
    fontSize: 22,
    fontFamily: 'Cairo_700Bold',
    color: Colors.text,
    textAlign: 'right',
  },
  logoutBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  miniStat: {
    flex: 1,
    alignItems: 'center',
  },
  miniStatDivider: {
    width: 1,
    backgroundColor: Colors.divider,
  },
  miniStatValue: {
    fontSize: 20,
    fontFamily: 'Cairo_700Bold',
    color: Colors.text,
  },
  miniStatLabel: {
    fontSize: 11,
    fontFamily: 'Cairo_400Regular',
    color: Colors.textSecondary,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Cairo_700Bold',
    color: Colors.text,
    textAlign: 'right',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  ownerCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  ownerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  ownerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryFaded,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ownerInfo: {
    flex: 1,
  },
  ownerName: {
    fontSize: 16,
    fontFamily: 'Cairo_700Bold',
    color: Colors.text,
    textAlign: 'right',
  },
  ownerEmail: {
    fontSize: 12,
    fontFamily: 'Cairo_400Regular',
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  ownerPhone: {
    fontSize: 12,
    fontFamily: 'Cairo_400Regular',
    color: Colors.textMuted,
    textAlign: 'right',
  },
  daysLeftBadge: {
    backgroundColor: Colors.successLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  daysLeftText: {
    fontSize: 12,
    fontFamily: 'Cairo_600SemiBold',
    color: Colors.success,
  },
  ownerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  metaText: {
    fontSize: 12,
    fontFamily: 'Cairo_400Regular',
    color: Colors.textMuted,
  },
  ownerActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  adminActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  adminActionBtnText: {
    fontSize: 13,
    fontFamily: 'Cairo_600SemiBold',
    color: '#fff',
  },
  approveBtn: {
    backgroundColor: Colors.success,
  },
  rejectBtn: {
    backgroundColor: Colors.error,
  },
  renewBtn: {
    backgroundColor: Colors.primary,
  },
  deleteBtn: {
    backgroundColor: Colors.errorLight,
    marginLeft: 'auto',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 10,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Cairo_600SemiBold',
    color: Colors.textMuted,
  },
  renewOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  renewContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  renewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  renewTitle: {
    fontSize: 18,
    fontFamily: 'Cairo_700Bold',
    color: Colors.text,
    flex: 1,
    textAlign: 'right',
  },
  renewBody: {
    padding: 20,
    gap: 14,
  },
  renewOwnerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'flex-end',
    backgroundColor: Colors.primaryFaded,
    padding: 12,
    borderRadius: 12,
  },
  renewOwnerName: {
    fontSize: 16,
    fontFamily: 'Cairo_700Bold',
    color: Colors.primary,
  },
  renewSubtitle: {
    fontSize: 14,
    fontFamily: 'Cairo_600SemiBold',
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  renewOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  renewOptionLeft: {
    gap: 2,
  },
  renewOptionLabel: {
    fontSize: 16,
    fontFamily: 'Cairo_700Bold',
    color: Colors.text,
    textAlign: 'right',
  },
  renewOptionSub: {
    fontSize: 12,
    fontFamily: 'Cairo_400Regular',
    color: Colors.textMuted,
    textAlign: 'right',
  },
});
