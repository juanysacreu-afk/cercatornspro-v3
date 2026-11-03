import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC_KEY = "BNQstO2w84c7CPzPC_ZULMNDTFxptTB_Bzd84DNPxFnzaIEZISASCy0smt_tKbZsAihU2LGVPAUBOtP6qK0d-6I";
const VAPID_PRIVATE_KEY = "fARW9oOq-yqofv2skPbQzBwJ4M8MLOoRBiMchk2KI5I";
const VAPID_SUBJECT = "mailto:operacions@nexus.fgc.cat";

try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (e) {
  console.warn("VAPID setup warning:", e);
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// ── Station Catalog ──────────────────────────────────────────────────────────
const STATION_NAMES: Record<string, string> = {
  'PC': 'Plaça Catalunya', 'PR': 'Provença', 'GR': 'Gràcia', 'SG': 'Sant Gervasi',
  'MN': 'Muntaner', 'BN': 'La Bonanova', 'TT': 'Les Tres Torres', 'SR': 'Sarrià',
  'RE': 'Reina Elisenda', 'PM': 'Pl. Molina', 'PD': 'Pàdua', 'EP': 'El Putxet',
  'TB': 'Av. Tibidabo', 'PF': 'Peu del Funicular', 'VL': 'Baixador de Vallvidrera',
  'LP': 'Les Planes', 'LF': 'La Floresta', 'VD': 'Valldoreix', 'SC': 'Sant Cugat',
  'MS': 'Mira-sol', 'HG': 'Hospital General', 'RB': 'Rubí', 'FN': 'Les Fonts',
  'TR': 'Terrassa Rambla', 'VP': 'Vallparadís Universitat', 'EN': 'Terrassa Estació del Nord',
  'NA': 'Terrassa Nacions Unides', 'VO': 'Volpelleres', 'SJ': 'Sant Joan',
  'BT': 'Bellaterra', 'UN': 'Universitat Autònoma', 'SQ': 'Sant Quirze',
  'CF': 'Can Feu - Gràcia', 'PJ': 'Sabadell Plaça Major', 'CT': 'La Creu Alta',
  'NO': 'Sabadell Nord', 'PN': 'Sabadell Parc del Nord',
  'DNA': 'Can Roca', 'DPN': 'Ca n\'Oriach', 'DRE': 'Dipòsit Reina Elisenda', 'COR': 'Tallers de Rubí'
};

function resolveStationCode(input: string): string {
  if (!input) return '';
  const clean = input.trim().toUpperCase();
  if (STATION_NAMES[clean]) return clean;
  const norm = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (norm.includes('CATALUNYA')) return 'PC';
  if (norm.includes('PROVEN')) return 'PR';
  if (norm.includes('GRACIA')) return 'GR';
  if (norm.includes('SANT GERVASI')) return 'SG';
  if (norm.includes('MUNTANER')) return 'MN';
  if (norm.includes('BONANOVA')) return 'BN';
  if (norm.includes('TRES TORRES')) return 'TT';
  if (norm.includes('SARRIA')) return 'SR';
  if (norm.includes('ELISENDA')) return 'RE';
  if (norm.includes('MOLINA')) return 'PM';
  if (norm.includes('PADUA')) return 'PD';
  if (norm.includes('PUTXET')) return 'EP';
  if (norm.includes('TIBIDABO')) return 'TB';
  if (norm.includes('FUNICULAR')) return 'PF';
  if (norm.includes('BAIXADOR') || norm.includes('VALLVIDRERA')) return 'VL';
  if (norm.includes('PLANES')) return 'LP';
  if (norm.includes('FLORESTA')) return 'LF';
  if (norm.includes('VALLDOREIX')) return 'VD';
  if (norm.includes('CUGAT')) return 'SC';
  if (norm.includes('MIRA-SOL') || norm.includes('MIRASOL')) return 'MS';
  if (norm.includes('HOSPITAL GENERAL')) return 'HG';
  if (norm.includes('RUBI')) return 'RB';
  if (norm.includes('FONTS')) return 'FN';
  if (norm.includes('RAMBLA')) return 'TR';
  if (norm.includes('VALLPARADIS')) return 'VP';
  if (norm.includes('ESTACIO DEL NORD') || norm.includes('SABADELL NORD')) {
    if (norm.includes('TERRASSA') || norm.includes('EN')) return 'EN';
    if (norm.includes('SABADELL') || norm.includes('NO')) return 'NO';
  }
  if (norm.includes('NACIONS UNIDES')) return 'NA';
  if (norm.includes('VOLPELLERES') || norm.includes('VOLPALLERES')) return 'VO';
  if (norm.includes('SANT JOAN')) return 'SJ';
  if (norm.includes('BELLATERRA')) return 'BT';
  if (norm.includes('AUTONOMA') || norm.includes('UAB')) return 'UN';
  if (norm.includes('QUIRZE')) return 'SQ';
  if (norm.includes('CAN FEU')) return 'CF';
  if (norm.includes('PLACA MAJOR') || norm.includes('PL. MAJOR')) return 'PJ';
  if (norm.includes('CREU ALTA')) return 'CT';
  if (norm.includes('PARC DEL NORD')) return 'PN';
  return clean;
}

// ── Circulation & UT Decoders ─────────────────────────────────────────────────
const LINE_MAP: Record<string, { line: string; dir: string }> = {
  '6a': { line: 'S1', dir: 'D' },
  '68': { line: 'S2', dir: 'F' },
  '6c': { line: 'L7', dir: 'B' },
  '6f': { line: 'L6', dir: 'A' },
  '62': { line: 'L12', dir: 'L' },
};

function decodeGeotrenCirculation(fullId?: string | null): { line: string; fullName: string } | null {
  if (!fullId || !fullId.includes('|')) return null;
  const parts = fullId.split('|');
  const ncPart = parts[1]?.toLowerCase();
  if (!ncPart || ncPart.length < 10) return null;

  const lineConfig = LINE_MAP[ncPart.substring(0, 2)];
  const hundredsHex = parseInt(ncPart[5], 16);
  const tensHex = parseInt(ncPart[7], 16);
  const unitHex = parseInt(ncPart[9], 16);
  if (isNaN(hundredsHex) || isNaN(tensHex) || isNaN(unitHex)) return null;

  const hundredsDigit = hundredsHex ^ 7;
  const tensDigit = tensHex ^ 3;
  const unitDigit = unitHex ^ 2;
  const num = hundredsDigit * 100 + tensDigit * 10 + unitDigit;
  if (isNaN(num)) return null;

  const numberStr = num.toString().padStart(3, '0');
  const direction = lineConfig?.dir || 'D';
  const line = lineConfig?.line || '??';
  return { line, fullName: `${direction}${numberStr}` };
}

const SUFFIX_TO_UNIT: Record<string, number> = {
  '0275': 1, '0276': 2, '0277': 3, '0270': 4, '0271': 5, '0272': 6, '0273': 7, '027c': 8, '027d': 9,
  '0374': 10, '0375': 11, '0376': 12, '0377': 13, '0370': 14, '0371': 15, '0372': 16, '0373': 17, '037c': 18, '037d': 19,
  '0074': 20, '0075': 21, '0076': 22, '0077': 23, '0070': 24, '0071': 25, '0072': 26, '0073': 27, '007c': 28, '007d': 29,
  '0174': 30, '0175': 31, '0176': 32, '0177': 33, '0170': 34, '0171': 35, '0172': 36, '0173': 37, '017c': 38, '017d': 39,
  '0674': 40, '0675': 41, '0676': 42, '0677': 43, '0670': 44, '0671': 45, '0672': 46, '0673': 47, '067c': 48, '067d': 49,
  '0774': 50, '0775': 51, '0776': 52, '0777': 53, '0770': 54, '0771': 55, '0772': 56, '0773': 57, '077c': 58, '077d': 59
};

const SERIES_MAP: Record<string, string> = {
  '5fd': '112', '4fd': '113', '3fd': '114', '2fd': '115'
};

function decodeGeotrenUt(ut?: string | null): string {
  if (!ut) return '';
  const clean = ut.trim().toLowerCase();
  if (clean.length === 12) {
    const seriesHex = clean.substring(5, 8);
    const suffix = clean.substring(8, 12);
    const series = SERIES_MAP[seriesHex] || '112';
    const unitNum = SUFFIX_TO_UNIT[suffix];
    if (unitNum !== undefined) {
      return `${series}.${unitNum.toString().padStart(2, '0')}`;
    }
  }
  return ut.trim();
}

// ── Time Helpers ─────────────────────────────────────────────────────────────
function getFgcServiceDate(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(new Date());
  let year = '', month = '', day = '', hour = 0;
  for (const part of parts) {
    if (part.type === 'year') year = part.value;
    if (part.type === 'month') month = part.value;
    if (part.type === 'day') day = part.value;
    if (part.type === 'hour') hour = parseInt(part.value, 10);
  }
  if (hour < 4) {
    const dt = new Date(`${year}-${month}-${day}T12:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() - 1);
    return dt.toISOString().split('T')[0];
  }
  return `${year}-${month}-${day}`;
}

function getMadridTime(): { timeStr: string; secs: number } {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const timeStr = formatter.format(new Date());
  const [h, m, s] = timeStr.split(':').map(Number);
  return { timeStr, secs: h * 3600 + m * 60 + s };
}

function timeStringToSeconds(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const parts = timeStr.trim().split(':');
  if (parts.length >= 2) {
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parts[2] ? parseInt(parts[2], 10) : 0;
    return h * 3600 + m * 60 + s;
  }
  return null;
}

function secondsToTimeString(totalSecs: number): string {
  let s = totalSecs % 86400;
  if (s < 0) s += 86400;
  const h = Math.floor(s / 3600).toString().padStart(2, '0');
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

function normalizeTimeDiffSec(diffSec: number): number {
  if (diffSec > 43200) return diffSec - 86400;
  if (diffSec < -43200) return diffSec + 86400;
  return diffSec;
}

function formatDelayMinSec(sec: number): string {
  const abs = Math.abs(sec);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

// ── Autonomous GIP Engine (Server-Side 24/7) ──────────────────────────────────
async function recordGipPassagesFromGeoTren(): Promise<{ inserted: number; trains: number }> {
  try {
    const serviceDate = getFgcServiceDate();
    const { timeStr: currentClockStr, secs: nowSecs } = getMadridTime();

    // 1. Descarregar posicions actuals de GeoTren
    const res = await fetch('https://geotren.fgc.cat/tracker/trens.geojson', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return { inserted: 0, trains: 0 };
    const data = await res.json();
    const features = data?.features;
    if (!Array.isArray(features) || features.length === 0) return { inserted: 0, trains: 0 };

    const VALID_LINES = new Set(['S1', 'S2', 'L6', 'L7', 'L12']);
    const activeTrains: Array<{
      circCode: string;
      linia: string;
      ut: string;
      estacionat_a: string | null;
      properes_parades: string[];
    }> = [];

    for (const f of features) {
      const p = f.properties || {};
      const lin = (p.lin || '').toUpperCase();
      if (!VALID_LINES.has(lin)) continue;

      const decCirc = decodeGeotrenCirculation(p.id);
      const circCode = p.circCode || decCirc?.fullName || (p.id ? p.id.split('|')[0]?.trim().toUpperCase() : null);
      if (!circCode) continue;

      const ut = decodeGeotrenUt(p.ut) || p.ut || '';
      const estacionat_a = p.estacionat_a ? resolveStationCode(p.estacionat_a) : null;

      let properes: string[] = [];
      if (Array.isArray(p.properes_parades)) {
        properes = p.properes_parades.map((x: any) => resolveStationCode(x.parada || x || ''));
      } else if (typeof p.properes_parades === 'string') {
        const matches = [...p.properes_parades.matchAll(/"parada":\s*"([^"]+)"/g)];
        properes = matches.map(m => resolveStationCode(m[1].trim()));
      }

      activeTrains.push({
        circCode,
        linia: decCirc?.line || lin,
        ut,
        estacionat_a,
        properes_parades: properes
      });
    }

    if (activeTrains.length === 0) return { inserted: 0, trains: 0 };

    // 2. Consultar horaris oficials a circulationsv2 per a les circulacions actives
    const circCodes = Array.from(new Set(activeTrains.map(t => t.circCode)));
    const { data: circRows } = await supabase
      .from('circulationsv2')
      .select('id, inici, final, linia, sortida, arribada, estacions')
      .in('id', circCodes);

    const circMap = new Map<string, any>();
    if (circRows) {
      circRows.forEach((r: any) => {
        if (!circMap.has(r.id)) circMap.set(r.id, r);
      });
    }

    // 3. Processar estacions i passos reals
    const recordsToUpsert: any[] = [];

    for (const train of activeTrains) {
      const circ = circMap.get(train.circCode);
      if (!circ) continue;

      const stops: Array<{ code: string; nom: string; hora: string }> = [];
      if (circ.inici && circ.sortida) {
        const c = resolveStationCode(circ.inici);
        stops.push({ code: c, nom: STATION_NAMES[c] || circ.inici, hora: circ.sortida });
      }
      if (Array.isArray(circ.estacions)) {
        circ.estacions.forEach((st: any) => {
          const h = st.sortida || st.hora || st.arribada;
          const code = resolveStationCode(st.codi || st.nom || '');
          if (code && h) {
            stops.push({ code, nom: STATION_NAMES[code] || st.nom || code, hora: h });
          }
        });
      }
      if (circ.final && circ.arribada) {
        const c = resolveStationCode(circ.final);
        stops.push({ code: c, nom: STATION_NAMES[c] || circ.final, hora: circ.arribada });
      }
      if (stops.length === 0) continue;

      // Trobar quina és l'estació actual o última superada
      let currentStationIndex = -1;

      if (train.estacionat_a) {
        const idx = stops.findIndex(s => s.code === train.estacionat_a);
        if (idx !== -1) currentStationIndex = idx;
      }

      if (currentStationIndex === -1 && train.properes_parades.length > 0) {
        const nextCode = train.properes_parades[0];
        const nextIdx = stops.findIndex(s => s.code === nextCode);
        if (nextIdx > 0) currentStationIndex = nextIdx - 1;
        else if (nextIdx === 0) currentStationIndex = 0;
      }

      if (currentStationIndex === -1 && train.properes_parades.length === 0) {
        currentStationIndex = stops.length - 1;
      }

      if (currentStationIndex === -1) continue;

      // Calcular retard a la parada actual observada
      const currStop = stops[currentStationIndex];
      let delaySec = 0;
      if (currStop?.hora) {
        const theoSecs = timeStringToSeconds(currStop.hora);
        if (theoSecs !== null) {
          delaySec = normalizeTimeDiffSec(nowSecs - theoSecs);
        }
      }

      // Enregistrar totes les parades fins a currentStationIndex
      for (let i = 0; i <= currentStationIndex; i++) {
        const st = stops[i];
        let diffSec = delaySec;
        let horaReal = currentClockStr;

        if (i !== currentStationIndex) {
          const theoSecs = timeStringToSeconds(st.hora);
          if (theoSecs !== null) {
            horaReal = secondsToTimeString(theoSecs + delaySec);
          }
        }

        diffSec = normalizeTimeDiffSec(diffSec);
        let estat = 'en_hora';
        if (diffSec > 240) estat = 'retard';
        else if (diffSec < -20) estat = 'avanc';

        recordsToUpsert.push({
          data_servei: serviceDate,
          circulacio_id: train.circCode,
          linia: train.linia,
          ut: train.ut,
          estacio_codi: st.code,
          estacio_nom: st.nom,
          hora_teorica: st.hora,
          hora_real: horaReal,
          diferencia_segons: diffSec,
          estat
        });
      }
    }

    if (recordsToUpsert.length > 0) {
      const { error } = await supabase
        .from('gip_registre_pas')
        .upsert(recordsToUpsert, {
          onConflict: 'data_servei,circulacio_id,estacio_codi',
          ignoreDuplicates: true
        });

      if (error) {
        console.error('[GIP Server Recorder] Error upserting passages:', error);
      }
      return { inserted: recordsToUpsert.length, trains: activeTrains.length };
    }

    return { inserted: 0, trains: activeTrains.length };
  } catch (err) {
    console.error('[GIP Server Recorder] Error in poll cycle:', err);
    return { inserted: 0, trains: 0 };
  }
}

// ── HTTP Request Handler ──────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    let body: any = {};
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch (_) {}
    }

    // ACCIÓ 1: Test de notificació push al mòbil
    if (body.action === "test_push") {
      const { data: subscriptions } = await supabase.from("push_subscriptions").select("*");
      if (subscriptions && subscriptions.length > 0) {
        const payload = JSON.stringify({
          title: body.title || "⚠️ Prova de Notificació (App Tancada)",
          body: body.body || "Aquesta alerta arriba fins i tot amb l'aplicació completament tancada!",
          tag: "test-push-" + Date.now(),
          data: { url: "/?view=gip" }
        });
        const results = await sendPushToAll(subscriptions, payload);
        return new Response(JSON.stringify({ success: true, sent_to: subscriptions.length, results }), {
          headers: { ...CORS, "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ status: "no_subscribers" }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // ACCIÓ 2: Notificar un retard concret
    if (body.action === "notify_delay" && body.circId && body.delaySec) {
      const { data: subscriptions } = await supabase.from("push_subscriptions").select("*");
      if (subscriptions && subscriptions.length > 0) {
        const circId = body.circId.trim().toUpperCase();
        const delaySec = Number(body.delaySec);
        const formattedDelay = formatDelayMinSec(delaySec);
        const lineStr = body.linia ? ` (${body.linia})` : "";
        const utStr = body.ut ? ` [UT ${body.ut}]` : "";
        const stStr = body.stationName ? ` a ${body.stationName}` : "";

        const payload = JSON.stringify({
          title: `⚠️ Retard +${formattedDelay} · ${circId}${lineStr}`,
          body: `La circulació ${circId}${utStr} porta +${formattedDelay} de retard${stStr}.`,
          tag: `delay-${circId}`,
          data: { url: `/?view=gip&circ=${encodeURIComponent(circId)}` }
        });

        const results = await sendPushToAll(subscriptions, payload);
        await supabase.from("push_notification_logs").insert({
          circulacio_id: circId,
          delay_sec: delaySec,
          station_name: body.stationName || null
        });
        return new Response(JSON.stringify({ success: true, results }), {
          headers: { ...CORS, "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ status: "no_subscribers" }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // ACCIÓ PER DEFECTE (CRON 24/7 CADA MINUT):
    // 1. Enregistrament autònom de passos de GeoTren a gip_registre_pas
    const gipResult = await recordGipPassagesFromGeoTren();

    // 2. Comprovació de retards per a notificacions push
    let sentCount = 0;
    const { data: subscriptions } = await supabase.from("push_subscriptions").select("*");
    if (subscriptions && subscriptions.length > 0) {
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: delayedPassages } = await supabase
        .from("gip_registre_pas")
        .select("circulacio_id, linia, ut, estacio_nom, diferencia_segons, creat_el")
        .gte("creat_el", tenMinsAgo)
        .gte("diferencia_segons", 240)
        .order("diferencia_segons", { ascending: false });

      if (delayedPassages && delayedPassages.length > 0) {
        const uniqueCircs = new Map<string, any>();
        delayedPassages.forEach((p) => {
          if (!uniqueCircs.has(p.circulacio_id)) uniqueCircs.set(p.circulacio_id, p);
        });

        for (const [circId, item] of uniqueCircs.entries()) {
          const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
          const { data: recentLogs } = await supabase
            .from("push_notification_logs")
            .select("id, delay_sec, created_at")
            .eq("circulacio_id", circId)
            .gte("created_at", fifteenMinsAgo)
            .order("created_at", { ascending: false })
            .limit(1);

          if (recentLogs && recentLogs.length > 0) {
            const lastDelay = recentLogs[0].delay_sec;
            if (item.diferencia_segons - lastDelay < 120) continue;
          }

          const formattedDelay = formatDelayMinSec(item.diferencia_segons);
          const lineStr = item.linia ? ` (${item.linia})` : "";
          const utStr = item.ut ? ` [UT ${item.ut}]` : "";
          const stStr = item.estacio_nom ? ` a ${item.estacio_nom}` : "";

          const payload = JSON.stringify({
            title: `⚠️ Retard +${formattedDelay} · ${circId}${lineStr}`,
            body: `La circulació ${circId}${utStr} porta +${formattedDelay} de retard${stStr}.`,
            tag: `delay-${circId}`,
            data: { url: `/?view=gip&circ=${encodeURIComponent(circId)}` }
          });

          await sendPushToAll(subscriptions, payload);
          await supabase.from("push_notification_logs").insert({
            circulacio_id: circId,
            delay_sec: item.diferencia_segons,
            station_name: item.estacio_nom || null
          });
          sentCount++;
        }
      }
    }

    return new Response(JSON.stringify({
      status: "ok",
      server_time: new Date().toISOString(),
      gip_passages_recorded: gipResult.inserted,
      active_trains_scanned: gipResult.trains,
      notifications_sent: sentCount
    }), {
      headers: { ...CORS, "Content-Type": "application/json" }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
});

async function sendPushToAll(subscriptions: any[], payload: string) {
  const expiredEndpoints: string[] = [];
  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      const pushConfig = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      try {
        await webpush.sendNotification(pushConfig, payload, {
          TTL: 300,
          urgency: "high"
        });
        return { endpoint: sub.endpoint, success: true };
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          expiredEndpoints.push(sub.endpoint);
        }
        return { endpoint: sub.endpoint, success: false, error: err.message };
      }
    })
  );

  if (expiredEndpoints.length > 0) {
    await supabase.from("push_subscriptions").delete().in("endpoint", expiredEndpoints);
  }

  return results;
}
