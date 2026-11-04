import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
// Clau Resend per defecte o variable d'entorn Supabase
const resendApiKey = Deno.env.get('RESEND_API_KEY') || atob('cmVfR1M5ZmRXN0pfNERwYWJHMXEzbVpGNUV0SmZYMXZ5Q0Ra')

// Adreça de destinació per defecte sol·licitada
const DEFAULT_RECIPIENT = 'mlopezj@fgc.cat'
// Llista blanca de destinataris autoritzats
const ALLOWED_RECIPIENTS = new Set([
  'mlopezj@fgc.cat',
  'juanysacreu@gmail.com'
])

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // supabase-js (functions.invoke) envia també apikey i x-client-info
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

// Codificació segura de cadenes UTF-8 a Base64 a Deno
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function formatDelay(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `+${s}s`
  if (s === 0) return `+${m}m`
  return `+${m}m ${s}s`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Llegir paràmetres de la petició si s'ha fet POST
    let targetEmail = DEFAULT_RECIPIENT
    let requestedDate: string | null = null
    let isManualTrigger = false

    if (req.method === 'POST') {
      try {
        const body = await req.json()
        if (body.targetEmail) targetEmail = String(body.targetEmail).trim()
        if (body.serviceDate) requestedDate = String(body.serviceDate).trim()
        if (body.manual) isManualTrigger = true
      } catch (_) {
        // Sense cos de petició
      }
    } else {
      const url = new URL(req.url)
      if (url.searchParams.get('email')) targetEmail = url.searchParams.get('email')!
      if (url.searchParams.get('date')) requestedDate = url.searchParams.get('date')!
    }

    if (!ALLOWED_RECIPIENTS.has(targetEmail.toLowerCase())) {
      targetEmail = DEFAULT_RECIPIENT
    }

    // Calcular data del servei a analitzar (horari de Madrid / FGC)
    let serviceDate = requestedDate
    if (!serviceDate) {
      const currentDate = new Date()
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Madrid',
        hour: '2-digit',
        hour12: false
      })
      const hour = parseInt(formatter.format(currentDate), 10)

      const spainDate = new Date(currentDate.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }))
      // Si s'executa abans de les 05:00 AM (ex: el cron de les 03:00 AM), analitzem el dia d'ahir
      if (hour < 5) {
        spainDate.setDate(spainDate.getDate() - 1)
      }
      const y = spainDate.getFullYear()
      const m = String(spainDate.getMonth() + 1).padStart(2, '0')
      const d = String(spainDate.getDate()).padStart(2, '0')
      serviceDate = `${y}-${m}-${d}`
    }

    const dateClean = serviceDate.replace(/-/g, '')
    const now = new Date()
    const nowFormatted = now.toLocaleString('ca-ES', { timeZone: 'Europe/Madrid' })

    // 1. Obtenir registres GIP de la jornada (paginat: PostgREST limita a 1000 files per petició)
    const PAGE = 1000
    const passages: any[] = []
    for (let from = 0; ; from += PAGE) {
      const { data: page, error: gipErr } = await supabase
        .from('gip_registre_pas')
        .select('linia, circulacio_id, estat, diferencia_segons')
        .eq('data_servei', serviceDate)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (gipErr) throw gipErr
      if (!page || page.length === 0) break
      passages.push(...page)
      if (page.length < PAGE) break
    }

    // 2. Obtenir rendiment dels agents de la jornada
    const { data: perfRows } = await supabase
      .from('agent_performance_history')
      .select('*')
      .eq('data_servei', serviceDate)

    // 3. Obtenir assignacions del dia
    const { data: assignments } = await supabase
      .from('daily_assignments')
      .select('*')

    const safePassages = passages || []
    const totalPassages = safePassages.length
    const onTimeCount = safePassages.filter(p => p.estat === 'en_hora' || p.estat === 'avanc').length
    const delayedCount = safePassages.filter(p => p.estat === 'retard').length
    const globalRate = totalPassages > 0 ? Number(((onTimeCount / totalPassages) * 100).toFixed(1)) : 100

    const delayedPassages = safePassages.filter(p => p.estat === 'retard')
    const totalDelaySec = delayedPassages.reduce((acc, p) => acc + (p.diferencia_segons || 0), 0)
    const avgDelaySec = delayedPassages.length > 0 ? Math.round(totalDelaySec / delayedPassages.length) : 0
    const avgDelayStr = formatDelay(avgDelaySec)

    // Desglossament per línia
    const lineStatsMap: Record<string, { total: number; onTime: number; delayed: number }> = {}
    safePassages.forEach(p => {
      const lin = p.linia || (p.circulacio_id?.startsWith('F') ? 'S2' : (p.circulacio_id?.startsWith('D') ? 'S1' : 'L6/L7'))
      if (!lineStatsMap[lin]) lineStatsMap[lin] = { total: 0, onTime: 0, delayed: 0 }
      lineStatsMap[lin].total++
      if (p.estat === 'en_hora' || p.estat === 'avanc') lineStatsMap[lin].onTime++
      if (p.estat === 'retard') lineStatsMap[lin].delayed++
    })

    const lineRows = Object.entries(lineStatsMap).map(([linia, s]) => {
      const r = s.total > 0 ? Number(((s.onTime / s.total) * 100).toFixed(1)) : 100
      return { linia, total: s.total, onTime: s.onTime, delayed: s.delayed, rate: r }
    })

    const rateColor = globalRate >= 95 ? '#059669' : globalRate >= 85 ? '#d97706' : '#dc2626'

    // 4. Construcció del Cos del Correu Electrònic (HTML Corporatiu FGC)
    const emailHtml = `<!DOCTYPE html>
<html lang="ca">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F3F4F6; margin: 0; padding: 24px; color: #374151; }
    .card { max-width: 620px; margin: 0 auto; background: #FFFFFF; border-radius: 18px; border: 1px solid #E5E7EB; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
    .header { background: #4D5358; padding: 24px; border-bottom: 4px solid #97BE14; color: #FFFFFF; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px; text-transform: uppercase; }
    .header p { margin: 4px 0 0; font-size: 12px; color: #D1D5DB; text-transform: uppercase; letter-spacing: 0.5px; }
    .body { padding: 24px; }
    .kpi-grid { display: flex; gap: 10px; margin: 18px 0; }
    .kpi-box { flex: 1; background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 12px; padding: 14px; text-align: center; }
    .kpi-val { font-size: 22px; font-weight: 800; margin-top: 4px; }
    .kpi-lbl { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #6B7280; letter-spacing: 0.5px; }
    .line-table { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 12px; }
    .line-table th { background: #F3F4F6; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; color: #4B5563; border-bottom: 2px solid #E5E7EB; }
    .line-table td { padding: 8px 10px; border-bottom: 1px solid #F3F4F6; }
    .footer { background: #F9FAFB; padding: 16px 24px; border-top: 1px solid #E5E7EB; font-size: 11px; color: #9CA3AF; text-align: center; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 6px; font-weight: 700; font-size: 10px; background: #E5E7EB; color: #4D5358; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h1>FGC Operacions · CSO</h1>
          <p>Tancament Oficial de Jornada Ferroviària</p>
        </div>
        <span class="pill" style="background:#97BE14; color:#4D5358;">SERVEI ${serviceDate}</span>
      </div>
    </div>

    <div class="body">
      <p style="font-size: 13px; line-height: 1.5; margin-top: 0;">
        Hola Marcos,<br>
        A continuació tens el resum operatiu del <strong>tancament de servei del dia ${serviceDate}</strong> registrat pel sistema NEXUS Supervisors.
      </p>

      <!-- Resum KPIs -->
      <div class="kpi-grid">
        <div class="kpi-box">
          <div class="kpi-lbl">Puntualitat Global</div>
          <div class="kpi-val" style="color: ${rateColor};">${globalRate}%</div>
          <div style="font-size: 9px; color: #9CA3AF; margin-top: 2px;">Criteri &lt; 4 min</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-lbl">Passos GIP</div>
          <div class="kpi-val" style="color: #4D5358;">${totalPassages}</div>
          <div style="font-size: 9px; color: #9CA3AF; margin-top: 2px;">${onTimeCount} a temps · ${delayedCount} retard</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-lbl">Retard Mitjà</div>
          <div class="kpi-val" style="color: #4D5358;">${avgDelayStr}</div>
          <div style="font-size: 9px; color: #9CA3AF; margin-top: 2px;">Per pas amb demora</div>
        </div>
      </div>

      <!-- Puntualitat per línia -->
      <h3 style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #4D5358; margin: 18px 0 8px 0; border-bottom: 1.5px solid #E5E7EB; padding-bottom: 4px;">
        Balanç de Puntualitat per Línia
      </h3>
      <table class="line-table">
        <thead>
          <tr>
            <th>Línia</th>
            <th>Passos Totals</th>
            <th>A l'hora</th>
            <th>Amb Retard</th>
            <th style="text-align:right;">Puntualitat</th>
          </tr>
        </thead>
        <tbody>
          ${lineRows.length === 0 ? `
            <tr><td colspan="5" style="text-align:center; color:#9CA3AF;">Sense registres de pas a aquesta data.</td></tr>
          ` : lineRows.map(l => `
            <tr>
              <td><strong>${l.linia}</strong></td>
              <td>${l.total}</td>
              <td>${l.onTime}</td>
              <td>${l.delayed}</td>
              <td style="text-align:right; font-weight:700; color:${l.rate >= 95 ? '#059669' : l.rate >= 85 ? '#d97706' : '#dc2626'};">${l.rate}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <!-- Resum de Plantilla -->
      <div style="background: #F3F4F6; padding: 12px 16px; border-radius: 10px; font-size: 12px; margin-top: 16px; display: flex; justify-content: space-between; align-items: center;">
        <span>Plantilla de maquinistes auditada a la jornada:</span>
        <strong>${perfRows ? perfRows.length : 0} agents registrats</strong>
      </div>

      <p style="font-size: 11px; color: #6B7280; margin-top: 18px; line-height: 1.4;">
        📎 S'adjunten a aquest correu el <strong>full de dades operacionals en format Excel (.CSV amb BOM UTF-8)</strong> i la diligència de supervisió per a registre i auditoria del CSO.
      </p>
    </div>

    <div class="footer">
      Emès automàticament per NEXUS Supervisors per a Ferrocarrils de la Generalitat de Catalunya (FGC).<br>
      Data d'emissió: ${nowFormatted} · Conforme a RGPD/LOPDGDD.
    </div>
  </div>
</body>
</html>`

    // 5. Construcció del fitxer adjunt CSV per a Excel (amb BOM UTF-8)
    const csvContent = [
      'FERROCARRILS DE LA GENERALITAT DE CATALUNYA — NEXUS SUPERVISORS',
      'INFORME OFICIAL DE TANCAMENT DIARI DE SERVEI (CSO)',
      `Data d'emissió,${nowFormatted}`,
      `Data de servei analitzada,${serviceDate}`,
      '',
      '--- INDICADORS GLOBALS DE XARXA ---',
      'Puntualitat Global (%),Passos Totals,Passos a l\'hora,Passos amb Retard,Retard Mitjà',
      `"${globalRate}%","${totalPassages}","${onTimeCount}","${delayedCount}","${avgDelayStr}"`,
      '',
      '--- PUNTUALITAT PER LÍNIA ---',
      'Línia,Passos Totals,A l\'hora,Amb Retard,Puntualitat (%)',
      ...lineRows.map(l => `"${l.linia}","${l.total}","${l.onTime}","${l.delayed}","${l.rate}%"`),
      '',
      '--- DILIGÈNCIA DE TANCAMENT ---',
      'Supervisió Operativa CSO,Validat i auditat amb dades oficials del pas de trens GIP (FGC)'
    ].join('\n')

    const csvBase64 = utf8ToBase64('\uFEFF' + csvContent)

    // 6. Enviament mitjançant Resend API
    let emailSent = false
    let emailResponseData = null

    if (resendApiKey) {
      const emailPayload = {
        from: 'NEXUS Supervisors <onboarding@resend.dev>',
        to: [targetEmail],
        subject: `[FGC CSO] Tancament Oficial de Servei — ${serviceDate} (Puntualitat: ${globalRate}%)`,
        html: emailHtml,
        attachments: [
          {
            filename: `tancament-cso-${dateClean}.csv`,
            content: csvBase64
          }
        ]
      }

      let resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailPayload)
      })

      emailResponseData = await resendRes.json()
      emailSent = resendRes.ok
      let fallbackSentTo: string | null = null

      // Si Resend bloqueja l'enviament a mlopezj@fgc.cat amb 403 perquè el compte de prova gratuït
      // només té permès enviar a la bústia del propietari del compte (juanysacreu@gmail.com):
      if (!emailSent && resendRes.status === 403 && targetEmail !== 'juanysacreu@gmail.com') {
        const fallbackRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ...emailPayload,
            to: ['juanysacreu@gmail.com']
          })
        })
        const fallbackData = await fallbackRes.json()
        if (fallbackRes.ok) {
          emailSent = true
          emailResponseData = fallbackData
          fallbackSentTo = 'juanysacreu@gmail.com'
        }
      }

      let responseMsg = ''
      if (emailSent) {
        if (fallbackSentTo) {
          responseMsg = `Correu enviat a ${fallbackSentTo}! Per rebre'l a ${targetEmail}, registra el compte gratuït de Resend amb aquest correu d'FGC.`
        } else {
          responseMsg = `Informe de tancament enviat correctament a ${targetEmail}!`
        }
      } else {
        responseMsg = `Error Resend: ${emailResponseData?.message || JSON.stringify(emailResponseData)}`
      }

      return new Response(
        JSON.stringify({
          ok: true,
          serviceDate,
          targetEmail,
          deliveredTo: fallbackSentTo || (emailSent ? targetEmail : null),
          globalRate,
          totalPassages,
          emailSent,
          hasResendKey: true,
          emailResponse: emailResponseData,
          message: responseMsg
        }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        ok: true,
        serviceDate,
        targetEmail,
        globalRate,
        totalPassages,
        emailSent: false,
        hasResendKey: false,
        message: "Falta configurar RESEND_API_KEY a Supabase."
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('[daily-closing-report] Error:', error)
    return new Response(
      JSON.stringify({ ok: false, error: error?.message || 'Error desconegut' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
