import { formatDelayMinSec } from './stations';
import { feedback } from './feedback';
import { supabase } from '../supabaseClient';

const STORAGE_KEY = 'nexus_delay_notifs_enabled';
export const DELAY_ALERT_THRESHOLD_SEC = 240; // 4 minuts (retard oficial FGC)
const COOLDOWN_MS = 15 * 60 * 1000; // 15 minuts de refredament per tren per evitar saturació

// VAPID Clau Pública oficial generada per a Web Push en segon pla (App Tancada)
export const VAPID_PUBLIC_KEY = 'BNQstO2w84c7CPzPC_ZULMNDTFxptTB_Bzd84DNPxFnzaIEZISASCy0smt_tKbZsAihU2LGVPAUBOtP6qK0d-6I';

// Converteix la clau VAPID Base64URL a Uint8Array per al PushManager del navegador/mòbil
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Registre intern de notificacions enviades en memòria per evitar alertes repetitives cada 10s
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
 * Subscriu el dispositiu al servei de Web Push per rebre alertes amb l'app TANCADA
 */
export const registerWebPushSubscription = async (): Promise<boolean> => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource
      });
    }

    if (subscription) {
      const rawKey = subscription.getKey ? subscription.getKey('p256dh') : null;
      const rawAuth = subscription.getKey ? subscription.getKey('auth') : null;

      const p256dh = rawKey ? btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(rawKey)))) : '';
      const auth = rawAuth ? btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(rawAuth)))) : '';

      const { error } = await supabase.from('push_subscriptions').upsert({
        endpoint: subscription.endpoint,
        p256dh,
        auth,
        user_agent: navigator.userAgent,
        updated_at: new Date().toISOString()
      }, { onConflict: 'endpoint' });

      if (error) {
        console.warn('Error saving push subscription in Supabase:', error);
      }
      return true;
    }
  } catch (err) {
    console.warn('Could not register Web Push subscription:', err);
  }
  return false;
};

/**
 * Cancel·la la subscripció Push del dispositiu
 */
export const unregisterWebPushSubscription = async (): Promise<boolean> => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
      await subscription.unsubscribe();
      return true;
    }
  } catch (err) {
    console.warn('Error unregistering Web Push:', err);
  }
  return false;
};

/**
 * Sol·licita el permís natiu al telèfon mòbil / navegador per a notificacions
 * i registra la subscripció Push per quan l'app estigui tancada.
 */
export const requestDelayNotifsPermission = async (): Promise<{ granted: boolean; permission: string }> => {
  if (!isDelayNotifsSupported()) {
    return { granted: false, permission: 'unsupported' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setDelayNotifsEnabled(true);

      // Registrar subscripció Push per rebre notificacions amb l'app tancada
      await registerWebPushSubscription();

      // Notificació de confirmació al dispositiu
      await sendSystemNotification({
        title: '🔔 Avisos de Retard Activats',
        body: 'Rebràs alertes al mòbil quan una circulació superi els 4 minuts de retard, fins i tot amb l\'app tancada.',
        tag: 'nexus-welcome-notif'
      });
      feedback.success();
      return { granted: true, permission };
    } else {
      setDelayNotifsEnabled(false);
      await unregisterWebPushSubscription();
      return { granted: false, permission };
    }
  } catch (err) {
    console.error('Error requesting notification permission:', err);
    return { granted: false, permission: 'denied' };
  }
};

/**
 * Envia una notificació de prova al mòbil (des del servidor Push per provar amb l'app tancada/en fons)
 */
export const sendTestNotification = async (): Promise<boolean> => {
  if (!isDelayNotifsSupported() || Notification.permission !== 'granted') {
    const res = await requestDelayNotifsPermission();
    if (!res.granted) return false;
  }

  // Assegurar subscripció Push registrada
  await registerWebPushSubscription();

  try {
    // Llançar test via Edge Function perquè viatgi a través del servidor Push
    const res = await fetch('https://hcpjthnhockfbefclycr.supabase.co/functions/v1/check-delays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'test_push',
        title: '⚠️ Prova d\'Alerta Push (NEXUS)',
        body: 'Aquesta notificació funciona fins i tot amb l\'aplicació completament tancada al mòbil!'
      })
    });

    if (res.ok) {
      feedback.playNotification();
      return true;
    }
  } catch (e) {
    console.warn('Error sending test push via server, fallback to local:', e);
  }

  // Fallback local si el servidor no respongués
  return sendSystemNotification({
    title: '⚠️ Prova d\'Avís de Retard (NEXUS)',
    body: 'Circulació S11 (UT 112.04) amb +4m 30s de retard a Sant Cugat. Prova correcta!',
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
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if (registration && registration.showNotification) {
        await registration.showNotification(title, options);
        feedback.playNotification();
        return true;
      }
    }

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

  // 1. Enviar notificació local immediata si l'app està en primer pla o en memòria
  sendSystemNotification({
    title,
    body,
    tag: `delay-${circKey}`,
    url: `/?view=gip&circ=${encodeURIComponent(info.circId)}`
  }).catch(() => {});

  // 2. Notificar al servidor Push perquè el servidor ho enviï a tots els telèfons amb l'app TANCADA
  try {
    fetch('https://hcpjthnhockfbefclycr.supabase.co/functions/v1/check-delays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'notify_delay',
        circId: info.circId,
        linia: info.linia,
        ut: info.ut,
        delaySec: info.delaySec,
        stationName: info.stationName
      })
    }).catch(() => {});
  } catch (e) {}

  return true;
};
