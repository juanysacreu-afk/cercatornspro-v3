import { formatDelayMinSec } from './stations';
import { feedback } from './feedback';

const STORAGE_KEY = 'nexus_delay_notifs_enabled';
export const DELAY_ALERT_THRESHOLD_SEC = 240; // 4 minuts (retard oficial FGC)
const COOLDOWN_MS = 15 * 60 * 1000; // 15 minuts de refredament per tren per evitar saturació

// Registre intern de notificacions enviades per evitar alertes repetitives cada 10s
const notifiedDelays = new Map<string, { timestamp: number; delaySec: number }>();

/**
 * Comprova si el navegador o dispositiu suporta Notificacions
 */
export const isDelayNotifsSupported = (): boolean => {
  return typeof window !== 'undefined' && 'Notification' in window;
};

/**
 * Retorna l'estat del permís de notificació
 */
export const getDelayNotifsPermission = (): NotificationPermission | 'unsupported' => {
  if (!isDelayNotifsSupported()) return 'unsupported';
  return Notification.permission;
};

/**
 * Comprova si l'usuari ha activat la preferència d'avisos de retard (> 4 min)
 */
export const isDelayNotifsEnabled = (): boolean => {
  if (!isDelayNotifsSupported()) return false;
  if (Notification.permission !== 'granted') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

/**
 * Desa la preferència d'activació d'avisos
 */
export const setDelayNotifsEnabled = (enabled: boolean): void => {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  } catch (e) {
    console.warn('Could not save delay notifs setting', e);
  }
};

/**
 * Sol·licita el permís natiu al telèfon mòbil / navegador per a notificacions
 */
export const requestDelayNotifsPermission = async (): Promise<{ granted: boolean; permission: string }> => {
  if (!isDelayNotifsSupported()) {
    return { granted: false, permission: 'unsupported' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setDelayNotifsEnabled(true);
      // Notificació de confirmació al dispositiu
      await sendSystemNotification({
        title: '🔔 Avisos de Retard Activats',
        body: 'Rebràs una notificació al mòbil quan una circulació superi els 4 minuts de retard.',
        tag: 'nexus-welcome-notif'
      });
      feedback.success();
      return { granted: true, permission };
    } else {
      setDelayNotifsEnabled(false);
      return { granted: false, permission };
    }
  } catch (err) {
    console.error('Error requesting notification permission:', err);
    return { granted: false, permission: 'denied' };
  }
};

/**
 * Envia una notificació de prova perquè l'usuari comprovi que funciona al mòbil
 */
export const sendTestNotification = async (): Promise<boolean> => {
  if (!isDelayNotifsSupported() || Notification.permission !== 'granted') {
    const res = await requestDelayNotifsPermission();
    if (!res.granted) return false;
  }

  return sendSystemNotification({
    title: '⚠️ Prova d\'Avís de Retard (NEXUS)',
    body: 'Circulació S11 (UT 112.04) amb +4m 30s de retard a Sant Cugat. Prova de recepció correcta!',
    tag: 'nexus-test-notif'
  });
};

interface NotificationPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

/**
 * Envia la notificació del sistema operatiu (a través del Service Worker si està disponible)
 */
const sendSystemNotification = async ({ title, body, tag, url = '/?view=gip' }: NotificationPayload): Promise<boolean> => {
  if (!isDelayNotifsSupported() || Notification.permission !== 'granted') {
    return false;
  }

  const options: any = {
    body,
    icon: '/logoNX.png',
    badge: '/logoNX.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: tag || 'nexus-delay-alert',
    renotify: true,
    data: { url }
  };

  try {
    // Si tenim el Service Worker actiu (PWA instal·lada al mòbil), fem servir registration.showNotification
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if (registration && registration.showNotification) {
        await registration.showNotification(title, options);
        feedback.playNotification();
        return true;
      }
    }

    // Fallback: API Notification estàndard
    new Notification(title, options);
    feedback.playNotification();
    return true;
  } catch (err) {
    console.warn('[Notification] Error dispatching notification:', err);
    try {
      new Notification(title, { body: options.body, icon: options.icon });
      return true;
    } catch (e) {
      return false;
    }
  }
};

export interface DelayAlertInfo {
  circId: string;
  linia?: string;
  ut?: string;
  delaySec: number;
  stationName?: string;
  desti?: string;
}

/**
 * Comprova si cal enviar un avís per retard superior a 4 minuts (240s)
 */
export const checkAndNotifyDelay = async (info: DelayAlertInfo): Promise<boolean> => {
  if (!isDelayNotifsEnabled()) return false;
  if (info.delaySec < DELAY_ALERT_THRESHOLD_SEC) return false;

  const circKey = info.circId.trim().toUpperCase();
  const now = Date.now();
  const last = notifiedDelays.get(circKey);

  // Evitem spamejar cada 10 segons: només avisem de nou si han passat 15 minuts
  // o si el retard ha pujat més de 2 minuts (120 segons) addicionals
  if (last) {
    const elapsed = now - last.timestamp;
    const delayIncrease = info.delaySec - last.delaySec;
    if (elapsed < COOLDOWN_MS && delayIncrease < 120) {
      return false;
    }
  }

  notifiedDelays.set(circKey, { timestamp: now, delaySec: info.delaySec });

  const delayFormatted = formatDelayMinSec(info.delaySec);
  const lineStr = info.linia ? ` (${info.linia})` : '';
  const utStr = info.ut ? ` [UT ${info.ut}]` : '';
  const stStr = info.stationName ? ` a ${info.stationName}` : '';
  const destStr = info.desti ? ` Destí: ${info.desti}.` : '';

  const title = `⚠️ Retard +${delayFormatted} · ${info.circId}${lineStr}`;
  const body = `La circulació ${info.circId}${utStr} porta +${delayFormatted} de retard${stStr}.${destStr}`;

  return sendSystemNotification({
    title,
    body,
    tag: `delay-${circKey}`,
    url: `/?view=gip&circ=${encodeURIComponent(info.circId)}`
  });
};
