import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC_KEY = "BNQstO2w84c7CPzPC_ZULMNDTFxptTB_Bzd84DNPxFnzaIEZISASCy0smt_tKbZsAihU2LGVPAUBOtP6qK0d-6I";
const VAPID_PRIVATE_KEY = "fARW9oOq-yqofv2skPbQzBwJ4M8MLOoRBiMchk2KI5I";
const VAPID_SUBJECT = "mailto:operacions@nexus.fgc.cat";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function formatDelayMinSec(sec: number): string {
  const abs = Math.abs(sec);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    let body: any = {};
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch (_) {}
    }

    // Obtenir subscripcions actives de la BD
    const { data: subscriptions, error: subErr } = await supabase
      .from("push_subscriptions")
      .select("*");

    if (subErr) {
      return new Response(JSON.stringify({ error: subErr.message }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ status: "no_subscribers", message: "No active push subscriptions found" }), {
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // ACCIÓ 1: Test de notificació push al mòbil
    if (body.action === "test_push") {
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

    // ACCIÓ 2: Notificar un retard concret
    if (body.action === "notify_delay" && body.circId && body.delaySec) {
      const circId = body.circId.trim().toUpperCase();
      const delaySec = Number(body.delaySec);

      // Comprovar si ja s'ha notificat en els darrers 15 minuts
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
        if (delaySec - lastDelay < 120) {
          return new Response(JSON.stringify({ message: "Throttled (already notified recently)" }), {
            headers: { ...CORS, "Content-Type": "application/json" }
          });
        }
      }

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

    // ACCIÓ 3 (Per defecte / CRON cada minut):
    // Consultar passos recents amb retard >= 240s enregistrats a gip_registre_pas
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: delayedPassages } = await supabase
      .from("gip_registre_pas")
      .select("circulacio_id, linia, ut, estacio_nom, diferencia_segons, creat_el")
      .gte("creat_el", tenMinsAgo)
      .gte("diferencia_segons", 240)
      .order("diferencia_segons", { ascending: false });

    let sentCount = 0;
    if (delayedPassages && delayedPassages.length > 0) {
      const uniqueCircs = new Map<string, any>();
      delayedPassages.forEach((p) => {
        if (!uniqueCircs.has(p.circulacio_id)) {
          uniqueCircs.set(p.circulacio_id, p);
        }
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
          if (item.diferencia_segons - lastDelay < 120) {
            continue;
          }
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

    return new Response(JSON.stringify({ status: "ok", checked: delayedPassages?.length || 0, sent: sentCount }), {
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
