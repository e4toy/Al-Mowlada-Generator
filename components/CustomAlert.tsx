import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, Pressable, StyleSheet, Modal, Platform,
  Animated as RNAnimated, Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import Colors from '@/constants/colors';

type AlertType = 'confirm' | 'success' | 'error' | 'info' | 'warning';
type AlertIcon = 'trash-2' | 'check-circle' | 'alert-circle' | 'alert-triangle' | 'info' | 'x-circle' | 'lock' | 'unlock' | 'refresh-cw' | 'user-x' | 'user-check' | 'dollar-sign' | 'shield';

interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface AlertConfig {
  type: AlertType;
  title: string;
  message: string;
  icon?: AlertIcon;
  buttons: AlertButton[];
}

interface AlertContextValue {
  showAlert: (config: AlertConfig) => void;
  showConfirm: (title: string, message: string, onConfirm: () => void, icon?: AlertIcon) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
}

const AlertContext = createContext<AlertContextValue | null>(null);

function getIconForType(type: AlertType, icon?: AlertIcon): AlertIcon {
  if (icon) return icon;
  switch (type) {
    case 'confirm': return 'alert-triangle';
    case 'success': return 'check-circle';
    case 'error': return 'alert-circle';
    case 'warning': return 'alert-triangle';
    case 'info': return 'info';
  }
}

function getIconColor(type: AlertType): string {
  switch (type) {
    case 'confirm': return Colors.warning;
    case 'success': return Colors.success;
    case 'error': return Colors.error;
    case 'warning': return Colors.warning;
    case 'info': return Colors.primary;
  }
}

function getIconBg(type: AlertType): string {
  switch (type) {
    case 'confirm': return Colors.warningLight;
    case 'success': return Colors.successLight;
    case 'error': return Colors.errorLight;
    case 'warning': return Colors.warningLight;
    case 'info': return Colors.primaryFaded;
  }
}

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const scaleAnim = useRef(new RNAnimated.Value(0.85)).current;
  const opacityAnim = useRef(new RNAnimated.Value(0)).current;
  const queueRef = useRef<AlertConfig[]>([]);
  const isShowingRef = useRef(false);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const processQueue = useCallback(() => {
    if (isShowingRef.current || queueRef.current.length === 0) return;
    const next = queueRef.current.shift()!;
    isShowingRef.current = true;
    setConfig(next);
    setVisible(true);

    scaleAnim.setValue(0.85);
    opacityAnim.setValue(0);
    RNAnimated.parallel([
      RNAnimated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 65,
        friction: 8,
      }),
      RNAnimated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    const hasOnlyDefaultButtons = next.buttons.every(b => !b.onPress || b.style === 'cancel');
    const isSingleButton = next.buttons.length <= 1;
    if (isSingleButton && (next.type === 'success' || next.type === 'error' || next.type === 'info')) {
      autoCloseTimerRef.current = setTimeout(() => {
        dismissAlert();
      }, 2500);
    }
  }, []);

  const dismissAlert = useCallback((callback?: () => void) => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    RNAnimated.parallel([
      RNAnimated.timing(scaleAnim, {
        toValue: 0.85,
        duration: 150,
        useNativeDriver: true,
      }),
      RNAnimated.timing(opacityAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
      setConfig(null);
      isShowingRef.current = false;
      if (callback) callback();
      setTimeout(() => processQueue(), 100);
    });
  }, [processQueue]);

  const showAlert = useCallback((alertConfig: AlertConfig) => {
    queueRef.current.push(alertConfig);
    processQueue();
  }, [processQueue]);

  const showConfirm = useCallback((title: string, message: string, onConfirm: () => void, icon?: AlertIcon) => {
    showAlert({
      type: 'confirm',
      title,
      message,
      icon: icon || 'alert-triangle',
      buttons: [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'تأكيد', style: 'destructive', onPress: onConfirm },
      ],
    });
  }, [showAlert]);

  const showSuccess = useCallback((message: string) => {
    showAlert({
      type: 'success',
      title: 'تم بنجاح',
      message,
      icon: 'check-circle',
      buttons: [{ text: 'حسناً', style: 'default' }],
    });
  }, [showAlert]);

  const showError = useCallback((message: string) => {
    showAlert({
      type: 'error',
      title: 'خطأ',
      message,
      icon: 'alert-circle',
      buttons: [{ text: 'حسناً', style: 'default' }],
    });
  }, [showAlert]);

  const showInfo = useCallback((message: string) => {
    showAlert({
      type: 'info',
      title: 'تنبيه',
      message,
      icon: 'info',
      buttons: [{ text: 'حسناً', style: 'default' }],
    });
  }, [showAlert]);

  function handleButtonPress(button: AlertButton) {
    dismissAlert(button.onPress);
  }

  const value = { showAlert, showConfirm, showSuccess, showError, showInfo };

  return (
    <AlertContext.Provider value={value}>
      {children}
      <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
        <RNAnimated.View style={[styles.overlay, { opacity: opacityAnim }]}>
          {Platform.OS === 'web' ? (
            <View style={styles.backdropWeb} />
          ) : (
            <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
          )}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => {
            if (config && config.buttons.length <= 1) dismissAlert();
          }} />
          {config ? (
            <RNAnimated.View style={[
              styles.alertContainer,
              {
                transform: [{ scale: scaleAnim }],
                opacity: opacityAnim,
              },
            ]}>
              <View style={[styles.iconCircle, { backgroundColor: getIconBg(config.type) }]}>
                <Feather
                  name={getIconForType(config.type, config.icon)}
                  size={28}
                  color={getIconColor(config.type)}
                />
              </View>

              <Text style={styles.title}>{config.title}</Text>
              <Text style={styles.message}>{config.message}</Text>

              <View style={[
                styles.buttonRow,
                config.buttons.length === 1 && styles.buttonRowSingle,
              ]}>
                {config.buttons.map((button, index) => {
                  const isDestructive = button.style === 'destructive';
                  const isCancel = button.style === 'cancel';
                  return (
                    <Pressable
                      key={index}
                      style={({ pressed }) => [
                        styles.button,
                        isDestructive && styles.buttonDestructive,
                        isCancel && styles.buttonCancel,
                        !isDestructive && !isCancel && styles.buttonDefault,
                        config.buttons.length > 1 && { flex: 1 },
                        pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
                      ]}
                      onPress={() => handleButtonPress(button)}
                    >
                      <Text style={[
                        styles.buttonText,
                        isDestructive && styles.buttonTextDestructive,
                        isCancel && styles.buttonTextCancel,
                        !isDestructive && !isCancel && styles.buttonTextDefault,
                      ]}>
                        {button.text}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </RNAnimated.View>
          ) : null}
        </RNAnimated.View>
      </Modal>
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useAlert must be used within AlertProvider');
  return ctx;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ALERT_WIDTH = Math.min(SCREEN_WIDTH - 48, 340);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  backdropWeb: {
    ...StyleSheet.absoluteFillObject,
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
  } as any,
  alertContainer: {
    width: ALERT_WIDTH,
    backgroundColor: Colors.surface,
    borderRadius: 24,
    paddingTop: 28,
    paddingHorizontal: 24,
    paddingBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 20,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 19,
    fontFamily: 'Cairo_700Bold',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    fontFamily: 'Cairo_400Regular',
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 22,
    paddingHorizontal: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  buttonRowSingle: {
    justifyContent: 'center',
  },
  button: {
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
  },
  buttonDestructive: {
    backgroundColor: Colors.error,
  },
  buttonCancel: {
    backgroundColor: Colors.surfaceSecondary,
  },
  buttonDefault: {
    backgroundColor: Colors.primary,
    flex: undefined,
    minWidth: 140,
  },
  buttonText: {
    fontSize: 15,
    fontFamily: 'Cairo_700Bold',
  },
  buttonTextDestructive: {
    color: '#FFFFFF',
  },
  buttonTextCancel: {
    color: Colors.textSecondary,
  },
  buttonTextDefault: {
    color: '#FFFFFF',
  },
});
