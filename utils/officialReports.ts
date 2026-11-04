/**
 * utils/officialReports.ts
 * Generador d'Informes Oficials en PDF Imprimible (A4) i Excel / CSV per a NEXUS Supervisors.
 * Aplica estrictament la Identitat Visual Corporativa de Ferrocarrils de la Generalitat de Catalunya (FGC):
 * - Verd Corporatiu FGC (#97BE14)
 * - Gris Corporatiu FGC (#4D5358)
 * - Tipografies: Montserrat (Bold) per a titulars, Helvetica/Arial per al cos i taules.
 * - Composició alineada a l'esquerra, caixes de validació i signatures oficials CSO.
 */

import { formatFgcTime, getFgcMinutes, resolveStationId, getCandidateShiftIds, normalizeTimeDiffSec, isReserveShift, STATION_CODE_TO_NAME } from './stations';
import { STATION_GEO_MAP } from './stationGeoData';
import { supabase } from '../supabaseClient';
import { fetchFullTurns } from './queries';
import { getFgcServiceDate } from './gipRecorder';
import { getServiceForDate } from './serviceCalendar';
import { getAgentPerformanceHistory } from './agentPerformanceService';
import type { AgentPerformanceHistory } from '../types';

import { FGC_ICON_BASE64 } from './fgcLogoBase64';

const FGC_GREEN = '#97BE14';
const FGC_GRAY = '#4D5358';

const resolveStationName = (codeOrName: string, linia: string = ''): string => {
  if (!codeOrName) return '';
  const trimmed = codeOrName.trim();
  const upper = trimmed.toUpperCase();
  if (STATION_CODE_TO_NAME[upper]) return STATION_CODE_TO_NAME[upper];
  const code = resolveStationId(trimmed, linia);
  const geo = STATION_GEO_MAP.get(code);
  if (geo?.name) return geo.name;
  if (STATION_CODE_TO_NAME[code]) return STATION_CODE_TO_NAME[code];
  return trimmed;
};

const formatShortTime = (t?: string): string => {
  if (!t || t === '-') return '--:--';
  const parts = t.trim().split(':');
  if (parts.length >= 2) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  return t;
};

const resolveLiniaName = (codi?: string, linia?: string): string => {
  if (linia && linia !== 'FGC' && linia !== '-') return linia;
  if (!codi) return 'FGC';
  const c = codi.trim().toUpperCase();
  if (c.startsWith('F') || c.startsWith('P')) return 'S2';
  if (c.startsWith('D') || c.startsWith('K') || c.startsWith('M')) return 'S1';
  if (c.startsWith('A')) return 'L6';
  if (c.startsWith('B')) return 'L7';
  if (c.startsWith('E')) return 'L12';
  if (c.startsWith('V')) return 'MSR';
  return linia || 'FGC';
};

// Logotip Oficial FGC segons el Manual d'Identitat Visual Corporativa
const FGC_OFFICIAL_LOGO = `
<img src="${FGC_ICON_BASE64}" alt="FGC" class="fgc-logo-badge" style="width: 48px; height: 48px; object-fit: contain; border-radius: 10px; display: block; flex-shrink: 0;" />
`;

export interface AgentReportData {
  agent: {
    empleat_id: string | number;
    nom: string;
    cognoms: string;
    torn?: string;
    dependencia?: string;
    hora_inici?: string;
    hora_fi?: string;
    tipus_torn?: string;
    observacions?: string;
    abs_parc_c?: string;
    dta?: string;
    dpa?: string;
  };
  shiftData?: {
    id?: string;
    servei?: string;
    dependencia?: string;
    inici_torn?: string;
    final_torn?: string;
  };
  overallPunctuality?: {
    rate: number | null;
    totalPassages: number;
    onTimePassages: number;
    delayedCount: number;
    maxDelaySec?: number;
    avgDelaySec?: number;
    totalCircs?: number;
    completedCircs?: number;
  };
  circulationsList?: Array<{
    codi: string;
    realCodi?: string | null;
    linia?: string;
    inici?: string;
    final?: string;
    sortida?: string;
    arribada?: string;
    sortidaReal?: string;
    arribadaReal?: string;
    train?: string;
    ut?: string;
    cicle?: string;
    status?: string;
    rate?: number | null;
    totalStops?: number;
    onTimeStops?: number;
    delayedStopsCount?: number;
    maxDelaySec?: number;
  }>;
  serviceDate?: string;
  contact?: { phones: string[]; email: string | null };
  isPrivacyMode?: boolean;
}

export interface AgentGenericReportData {
  agent: {
    empleat_id: string | number;
    nom: string;
    cognoms: string;
    torn?: string;
    dependencia?: string;
    hora_inici?: string;
    hora_fi?: string;
    tipus_torn?: string;
    observacions?: string;
    abs_parc_c?: string;
    dta?: string;
    dpa?: string;
  };
  historyRecords: AgentPerformanceHistory[];
  contact?: { phones: string[]; email: string | null };
  isPrivacyMode?: boolean;
}

export interface GlobalReportData {
  serviceDate: string;
  stats: {
    totalPassages: number;
    onTimeCount: number;
    delayedCount: number;
    globalRate: number;
    avgDelayFormatted: string;
    lineStats?: Array<{
      linia: string;
      total: number;
      onTime: number;
      delayed: number;
      rate: number;
      avgDelayFormatted: string;
    }>;
    recentDelays?: Array<{
      circulacioId: string;
      linia: string;
      estacioNom: string;
      horaReal: string;
      delayFormatted: string;
      ut?: string;
    }>;
  };
  kpis?: {
    serviceCoverage?: number;
    planningCoverage?: number;
    activeTrains?: number;
    scheduledTrains?: number;
    totalPersonnel?: number;
    assignedPersonnel?: number;
    activePersonnel?: number;
    reserveAvailable?: number;
    reserveTotal?: number;
    availableTrainUnits?: number;
    brokenTrainUnits?: number;
  };
  alerts?: Array<{
    severity: string;
    title: string;
    subtitle: string;
  }>;
  reserves?: Array<{
    station: string;
    personnel: Array<{
      torn: string;
      cognoms: string;
      nom: string;
    }>;
  }>;
}

/**
 * Funció auxiliar per obrir la finestra d'impressió oficial amb estil A4 FGC
 */
const openPrintWindow = (htmlContent: string, title: string, existingWin?: Window | null) => {
  const printWin = existingWin || window.open('', '_blank', 'width=1020,height=900,menubar=no,toolbar=no,location=no,status=no');
  if (!printWin) {
    alert("Si us plau, permet les finestres emergents per obrir l'informe oficial d'FGC.");
    return;
  }
  printWin.document.open();
  printWin.document.write(htmlContent);
  printWin.document.close();
  printWin.focus();
};

/**
 * ────────────────────────────────────────────────────────────────
 * 1. INFORME OFICIAL INDIVIDUAL D'AGENT (PDF / IMPRESSIÓ A4)
 * ────────────────────────────────────────────────────────────────
 */
export function buildAgentReportHtml(data: AgentReportData): string {
  const { agent, shiftData, overallPunctuality, circulationsList = [], serviceDate, contact, isPrivacyMode } = data;
  const now = new Date();
  const dateFormatted = serviceDate || now.toISOString().slice(0, 10);
  const timeFormatted = now.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' });
  const refCode = `FGC-OP-AGT-${agent.empleat_id}-${dateFormatted.replace(/-/g, '')}`;

  const validCirculations = circulationsList.filter(c => {
    const codi = (typeof c === 'string' ? c : c?.codi || '').trim();
    return codi && codi !== '-' && codi !== 'RESERVA';
  });
  const isShiftReserve = validCirculations.length === 0 && (
    isReserveShift(shiftData?.id || agent.torn) ||
    isReserveShift({ id: shiftData?.id || agent.torn, circulations: circulationsList })
  );

  const rate = overallPunctuality?.rate ?? null;
  const rateClass = rate === null ? '#888' : rate >= 95 ? '#059669' : rate >= 85 ? '#d97706' : '#dc2626';

  const html = `<!DOCTYPE html>
<html lang="ca">
<head>
  <meta charset="UTF-8">
  <title>Informe Oficial Agent ${agent.cognoms}, ${agent.nom} (${agent.empleat_id}) — FGC</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800;900&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 14mm 12mm 14mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;
      color: #2D3134;
      background: #FFFFFF;
      margin: 0;
      padding: 0;
      font-size: 11pt;
      line-height: 1.45;
    }
    .no-print-bar {
      background: #1E2124;
      color: #FFFFFF;
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .no-print-bar button {
      background: ${FGC_GREEN};
      color: ${FGC_GRAY};
      border: none;
      padding: 8px 18px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: opacity 0.2s;
    }
    .no-print-bar button.close-btn {
      background: #3E4347;
      color: #FFF;
      margin-left: 10px;
    }
    .sheet {
      max-width: 210mm;
      margin: 0 auto;
      padding: 24px 20px;
    }
    @media print {
      .no-print-bar { display: none !important; }
      .sheet { padding: 0 !important; max-width: 100% !important; }
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }

    /* HEADER OFICIAL FGC */
    .fgc-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 3px solid ${FGC_GREEN};
      padding-bottom: 14px;
      margin-bottom: 18px;
    }
    .fgc-brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .fgc-titles h1 {
      font-family: 'Montserrat', sans-serif;
      font-size: 18pt;
      font-weight: 800;
      color: ${FGC_GRAY};
      margin: 0;
      text-transform: uppercase;
      letter-spacing: -0.5px;
    }
    .fgc-titles p {
      margin: 2px 0 0;
      font-size: 9.5pt;
      color: #6C7378;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .fgc-meta {
      text-align: right;
      font-size: 9pt;
      color: #6C7378;
    }
    .fgc-meta .ref {
      font-family: monospace;
      font-weight: 700;
      color: ${FGC_GRAY};
      font-size: 9.5pt;
    }

    /* AGENT DOSSIER BANNER */
    .agent-card {
      background: #F8F9FA;
      border: 1px solid #E5E7EB;
      border-left: 6px solid ${FGC_GREEN};
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 18px;
      display: grid;
      grid-template-columns: 2fr 1fr 1fr;
      gap: 16px;
    }
    .agent-name h2 {
      font-family: 'Montserrat', sans-serif;
      font-size: 15pt;
      font-weight: 800;
      color: ${FGC_GRAY};
      margin: 0 0 4px;
      text-transform: uppercase;
    }
    .agent-sub {
      font-size: 9pt;
      color: #6C7378;
    }
    .data-pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 8pt;
      font-weight: 700;
      background: #E5E7EB;
      color: #374151;
      margin-right: 6px;
    }

    /* METRIC TILES */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 20px;
    }
    .kpi-box {
      border: 1px solid #E5E7EB;
      background: #FFFFFF;
      border-radius: 8px;
      padding: 10px 14px;
      text-align: center;
    }
    .kpi-box .val {
      font-family: 'Montserrat', monospace;
      font-size: 18pt;
      font-weight: 800;
      line-height: 1.1;
      margin-top: 4px;
    }
    .kpi-box .lbl {
      font-size: 8pt;
      text-transform: uppercase;
      font-weight: 700;
      color: #6C7378;
      letter-spacing: 0.5px;
    }

    /* SECTION TITLES */
    h3.section-title {
      font-family: 'Montserrat', sans-serif;
      font-size: 11pt;
      font-weight: 800;
      color: ${FGC_GRAY};
      text-transform: uppercase;
      margin: 18px 0 8px;
      padding-bottom: 4px;
      border-bottom: 1.5px solid #E5E7EB;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    /* TABLES */
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
      margin-bottom: 18px;
    }
    table.data-table th {
      background: #F1F3F5;
      color: ${FGC_GRAY};
      font-family: 'Montserrat', sans-serif;
      font-weight: 700;
      text-align: left;
      padding: 6px 8px;
      border-top: 1px solid #D1D5DB;
      border-bottom: 1px solid #D1D5DB;
      text-transform: uppercase;
      font-size: 7.5pt;
      letter-spacing: 0.3px;
    }
    table.data-table td {
      padding: 6px 8px;
      border-bottom: 1px solid #E5E7EB;
      color: #374151;
    }
    table.data-table tr:nth-child(even) td {
      background: #FAFAFB;
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 7.5pt;
      font-weight: 700;
    }
    .badge-ontime { background: #DCFCE7; color: #166534; }
    .badge-delayed { background: #FEE2E2; color: #991B1B; }
    .badge-pending { background: #F3F4F6; color: #4B5563; }

    /* SIGNATURES BOX */
    .signatures-box {
      margin-top: 24px;
      border-top: 1.5px dashed #D1D5DB;
      padding-top: 16px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .signature-slot {
      border: 1px solid #E5E7EB;
      background: #FBFBFC;
      border-radius: 6px;
      padding: 12px;
      min-height: 90px;
      display: flex;
      flex-col;
      justify-content: space-between;
    }
    .signature-title {
      font-size: 8pt;
      font-weight: 700;
      text-transform: uppercase;
      color: #6C7378;
    }
    .signature-footer {
      font-size: 7.5pt;
      color: #9CA3AF;
      border-top: 1px solid #E5E7EB;
      padding-top: 4px;
      margin-top: 40px;
    }

    .legal-notice {
      margin-top: 18px;
      font-size: 7pt;
      color: #9CA3AF;
      text-align: justify;
      line-height: 1.3;
    }
  </style>
</head>
<body>
  <div class="no-print-bar">
    <div style="font-weight:700; font-size:14px; display:flex; align-items:center; gap:10px;">
      <span style="color:${FGC_GREEN};">●</span>
      Informe Oficial FGC · Visualització Prèvia / Impressió en PDF
    </div>
    <div>
      <button onclick="window.print()">
        🖨️ Imprimir / Guardar en PDF
      </button>
      <button class="close-btn" onclick="window.close()">
        ✕ Tancar
      </button>
    </div>
  </div>

  <div class="sheet">
    <!-- CAPÇALERA OFICIAL FGC -->
    <div class="fgc-header">
      <div class="fgc-brand">
        ${FGC_OFFICIAL_LOGO}
        <div class="fgc-titles">
          <h1>FGC Operacions</h1>
          <p>Centre de Supervisió Operativa (CSO) · Línies Metropolitanes</p>
        </div>
      </div>
      <div class="fgc-meta">
        <div>Ref: <span class="ref">${refCode}</span></div>
        <div>Data Servei: <strong>${dateFormatted}</strong></div>
        <div>Emès: ${dateFormatted} a les ${timeFormatted}</div>
      </div>
    </div>

    <!-- DOSSIER DE L'AGENT -->
    <div class="agent-card">
      <div class="agent-name">
        <h2>${agent.cognoms}, ${agent.nom}</h2>
        <div class="agent-sub">
          <span class="data-pill">NÒMINA #${agent.empleat_id}</span>
          <span class="data-pill">TORN ${agent.torn || 'S/A'}</span>
          ${agent.tipus_torn ? `<span class="data-pill">${agent.tipus_torn.toUpperCase()}</span>` : ''}
          ${agent.dependencia ? `<span class="data-pill">DEP: ${agent.dependencia}</span>` : ''}
        </div>
        ${agent.observacions ? `<div style="margin-top:6px; font-size:8pt; color:#4B5563;"><strong>Obs:</strong> ${agent.observacions}</div>` : ''}
      </div>
      <div>
        <div style="font-size:8pt; font-weight:700; color:#6C7378; text-transform:uppercase;">Horari Jornada</div>
        <div style="font-size:12pt; font-weight:700; color:${FGC_GRAY}; margin-top:2px;">
          ${agent.hora_inici || shiftData?.inici_torn || '--:--'} — ${agent.hora_fi || shiftData?.final_torn || '--:--'}
        </div>
        <div style="font-size:8pt; color:#6C7378;">
          Servei: <strong>${shiftData?.servei || 'Ordinari'}</strong>
        </div>
      </div>
      <div>
        <div style="font-size:8pt; font-weight:700; color:#6C7378; text-transform:uppercase;">Incidències torn</div>
        <div style="font-size:8.5pt; color:#374151; margin-top:2px;">
          ${agent.abs_parc_c === 'S' ? '<span class="data-pill" style="color:#b91c1c; background:#fee2e2;">ABS PARCIAL</span>' : ''}
          ${agent.dta === 'S' ? '<span class="data-pill" style="color:#1d4ed8; background:#dbeafe;">DTA</span>' : ''}
          ${agent.dpa === 'S' ? '<span class="data-pill" style="color:#6d28d9; background:#ede9fe;">DPA</span>' : ''}
          ${(!agent.abs_parc_c && !agent.dta && !agent.dpa) ? 'Cap incidència' : ''}
        </div>
      </div>
    </div>

    <!-- INDICADORS DE RENDIMENT (KPIs) -->
    <div class="kpi-grid">
      <div class="kpi-box">
        <div class="lbl">Puntualitat Global</div>
        <div class="val" style="color:${rateClass};">
          ${rate !== null ? `${rate}%` : '--%'}
        </div>
        <div style="font-size:7.5pt; color:#6C7378; margin-top:2px;">Criteri FGC &lt; 4 min</div>
      </div>
      <div class="kpi-box">
        <div class="lbl">Circulacions Jornada</div>
        <div class="val" style="color:${FGC_GRAY};">
          ${overallPunctuality?.completedCircs || 0} / ${overallPunctuality?.totalCircs || validCirculations.length}
        </div>
        <div style="font-size:7.5pt; color:#6C7378; margin-top:2px;">Completades / Programades</div>
      </div>
      <div class="kpi-box">
        <div class="lbl">Passos Registrats</div>
        <div class="val" style="color:${FGC_GRAY};">
          ${overallPunctuality?.totalPassages || 0}
        </div>
        <div style="font-size:7.5pt; color:#6C7378; margin-top:2px;">${overallPunctuality?.onTimePassages || 0} a temps · ${overallPunctuality?.delayedCount || 0} retard</div>
      </div>
      <div class="kpi-box">
        <div class="lbl">Demora Màxima</div>
        <div class="val" style="color:${overallPunctuality?.maxDelaySec && overallPunctuality.maxDelaySec > 239 ? '#dc2626' : FGC_GRAY};">
          ${overallPunctuality?.maxDelaySec ? `+${Math.round(overallPunctuality.maxDelaySec / 60)}m` : '0 min'}
        </div>
        <div style="font-size:7.5pt; color:#6C7378; margin-top:2px;">Mitjana: ${overallPunctuality?.avgDelaySec ? `+${Math.round(overallPunctuality.avgDelaySec / 60)}m` : '0m'}</div>
      </div>
    </div>

    <!-- DETALL DE LES CIRCULACIONS -->
    <h3 class="section-title">
      <span>Taula de Circulacions Assignades</span>
      <span style="font-size:8pt; font-weight:600; color:#6C7378;">Total: ${validCirculations.length} circulacions</span>
    </h3>

    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 52px;">Tren</th>
          <th style="width: 44px;">Línia</th>
          <th>Trajecte (Origen → Destinació)</th>
          <th style="width: 82px;">Sortida</th>
          <th style="width: 82px;">Arribada</th>
          <th style="width: 58px;">UT</th>
          <th style="width: 52px;">Cicle</th>
          <th style="width: 82px; text-align:right;">Puntualitat</th>
          <th style="width: 78px; text-align:center;">Estat</th>
        </tr>
      </thead>
      <tbody>
        ${isShiftReserve ? `
          <tr>
            <td colspan="9" style="text-align:center; padding:22px; color:#4D5358; background:#f9fafb;">
              <div style="font-weight:800; font-size:10.5pt; color:#059669; margin-bottom:6px;">
                🛡️ TORN DE RESERVA OPERATIVA A DESTACAMENT (${shiftData?.dependencia || agent.dependencia || 'SR'})
              </div>
              <div style="font-size:8.5pt; color:#6B7280; max-width:550px; margin:0 auto; line-height:1.4;">
                Aquest torn no disposa de circulacions comercials fixes assignades al quadre horari regular. L'agent maquinista roman de guàrdia presencial al destacament a disposició del Centre de Supervisió Operativa (CSO) per a la gestió d'incidències, relleus imprevistos o maniobres de material.
              </div>
            </td>
          </tr>
        ` : validCirculations.length === 0 ? `
          <tr>
            <td colspan="9" style="text-align:center; padding:18px; color:#9CA3AF;">
              No s'han trobat circulacions comercials assignades a aquest torn per a la data seleccionada.
            </td>
          </tr>
        ` : validCirculations.map(c => {
          const isPassenger = c.codi === 'Viatger';
          const isDelayed = (c.delayedStopsCount || 0) > 0 || (c.maxDelaySec || 0) > 239;
          const statusBadge = isPassenger
            ? '<span class="badge" style="background:#e0f2fe; color:#0369a1;">Viatger</span>'
            : c.status === 'COMPLETED'
              ? (isDelayed ? '<span class="badge badge-delayed">Amb retard</span>' : '<span class="badge badge-ontime">A l\'hora</span>')
              : c.status === 'IN_PROGRESS'
                ? '<span class="badge" style="background:#fef3c7; color:#92400e;">En curs</span>'
                : '<span class="badge badge-pending">Pendent</span>';

          const liniaLabel = resolveLiniaName(c.codi, c.linia);
          const origName = resolveStationName(c.inici || '', liniaLabel);
          const destName = resolveStationName(c.final || '', liniaLabel);
          const routeText = (origName || destName) ? `${origName || '—'} → ${destName || '—'}` : '—';

          return `
            <tr>
              <td>
                <strong>${c.codi}</strong>
                ${c.realCodi && c.realCodi !== c.codi ? `<div style="font-size:6.8pt; color:#6B7280;">(${c.realCodi})</div>` : ''}
              </td>
              <td><span style="font-weight:700; color:${FGC_GRAY};">${liniaLabel}</span></td>
              <td>${routeText}</td>
              <td>
                <div style="font-weight:700;">${formatShortTime(c.sortida)}</div>
                ${c.sortidaReal ? `<div style="font-size:6.8pt; color:#059669; font-family:monospace; font-weight:600;">Real: ${c.sortidaReal}</div>` : ''}
              </td>
              <td>
                <div style="font-weight:700;">${formatShortTime(c.arribada)}</div>
                ${c.arribadaReal ? `<div style="font-size:6.8pt; color:#059669; font-family:monospace; font-weight:600;">Real: ${c.arribadaReal}</div>` : ''}
              </td>
              <td style="font-family:monospace; font-weight:700;">${c.ut || c.train || '—'}</td>
              <td>${c.cicle || '—'}</td>
              <td style="text-align:right; font-weight:700; color:${c.rate !== null && c.rate !== undefined ? (c.rate >= 95 ? '#059669' : c.rate >= 85 ? '#d97706' : '#dc2626') : '#9CA3AF'};">
                ${c.rate !== null && c.rate !== undefined ? `
                  <div>${c.rate}%</div>
                  ${c.totalStops ? `<div style="font-size:6.8pt; color:#6B7280; font-weight:600;">${c.onTimeStops ?? c.totalStops}/${c.totalStops} passos</div>` : ''}
                ` : '—'}
              </td>
              <td style="text-align:center;">${statusBadge}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>

    <!-- VALIDACIÓ I SIGNATURES -->
    <div class="signatures-box">
      <div class="signature-slot">
        <div class="signature-title">Conformitat de l'Agent Maquinista</div>
        <div class="signature-footer">Signat: ${agent.cognoms}, ${agent.nom} · Nòmina #${agent.empleat_id}</div>
      </div>
      <div class="signature-slot">
        <div class="signature-title">Validació Supervisor de Servei CSO</div>
        <div class="signature-footer">Centre de Supervisió Operativa (CSO) · Data: ${dateFormatted}</div>
      </div>
    </div>

    <!-- NOTA LEGAL RGPD -->
    <div class="legal-notice">
      Aquest document és un extracte oficial d'operacions generat per NEXUS Supervisors per a ús exclusiu de gestió i auditoria operativa de Ferrocarrils de la Generalitat de Catalunya (FGC). Conté dades laborals i de rendiment subjectes al Reglament (UE) 2016/679 (RGPD) i la Llei Orgànica 3/2018 (LOPDGDD). Queda prohibida la seva reproducció, distribució o cessió a tercers sense autorització expressa de la Direcció d'Operacions d'FGC.
    </div>
  </div>
</body>
</html>`;

  return html;
}

export function generateAgentReportPrint(data: AgentReportData, existingWin?: Window | null): void {
  const html = buildAgentReportHtml(data);
  const dateFormatted = data.serviceDate || new Date().toISOString().slice(0, 10);
  openPrintWindow(html, `Informe_Agent_${data.agent.empleat_id}_${dateFormatted}`, existingWin);
}

/**
 * ────────────────────────────────────────────────────────────────
 * 2. INFORME OFICIAL INDIVIDUAL D'AGENT (EXCEL / CSV)
 * ────────────────────────────────────────────────────────────────
 */
export function buildAgentReportCsv(data: AgentReportData): string {
  const { agent, shiftData, overallPunctuality, circulationsList = [], serviceDate } = data;
  const now = new Date();
  const dateStr = serviceDate || now.toISOString().slice(0, 10);
  const validCirculations = circulationsList.filter(c => {
    const codi = (typeof c === 'string' ? c : c?.codi || '').trim();
    return codi && codi !== '-' && codi !== 'RESERVA';
  });

  const lines: string[] = [
    'FERROCARRILS DE LA GENERALITAT DE CATALUNYA — NEXUS SUPERVISORS',
    'INFORME OFICIAL DE RENDIMENT I PUNTUALITAT PER AGENT',
    `Data d'emissió,${now.toLocaleDateString('ca-ES')} ${now.toLocaleTimeString('ca-ES')}`,
    `Data de servei,${dateStr}`,
    '',
    '--- DADES DE L\'AGENT ---',
    'Nòmina,Cognoms,Nom,Torn,Dependència,Hora Inici,Hora Fi,Tipus Torn,Observacions',
    `"${agent.empleat_id}","${agent.cognoms}","${agent.nom}","${agent.torn || 'S/A'}","${agent.dependencia || ''}","${agent.hora_inici || shiftData?.inici_torn || ''}","${agent.hora_fi || shiftData?.final_torn || ''}","${agent.tipus_torn || 'Ordinari'}","${(agent.observacions || '').replace(/"/g, '""')}"`,
    '',
    '--- INDICADORS DE PUNTUALITAT (GIP) ---',
    'Puntualitat Global (%),Passos Totals,Passos a l\'hora,Passos amb Retard,Circulacions Fetes,Circulacions Programades,Demora Màxima (segons),Demora Mitjana (segons)',
    `"${overallPunctuality?.rate !== null && overallPunctuality?.rate !== undefined ? overallPunctuality.rate : 'N/D'}","${overallPunctuality?.totalPassages || 0}","${overallPunctuality?.onTimePassages || 0}","${overallPunctuality?.delayedCount || 0}","${overallPunctuality?.completedCircs || 0}","${overallPunctuality?.totalCircs || validCirculations.length}","${overallPunctuality?.maxDelaySec || 0}","${overallPunctuality?.avgDelaySec || 0}"`,
    '',
    '--- DETALL DE CIRCULACIONS ---',
    'Codi Tren,Línia,Origen,Destinació,Sortida Teòrica,Sortida Real GIP,Arribada Teòrica,Arribada Real GIP,UT Conduïda,Cicle,Puntualitat (%),Passos a temps,Passos retard,Estat',
    ...validCirculations.map(c => {
      const liniaLabel = resolveLiniaName(c.codi, c.linia);
      const orig = resolveStationName(c.inici || '', liniaLabel);
      const dest = resolveStationName(c.final || '', liniaLabel);
      return `"${c.codi}","${liniaLabel}","${orig}","${dest}","${formatShortTime(c.sortida)}","${c.sortidaReal || ''}","${formatShortTime(c.arribada)}","${c.arribadaReal || ''}","${c.ut || c.train || ''}","${c.cicle || ''}","${c.rate !== null && c.rate !== undefined ? c.rate : ''}","${c.onTimeStops || 0}","${c.delayedStopsCount || 0}","${c.status || ''}"`;
    }),
    '',
    '--- DILIGÈNCIA DE VALIDACIÓ ---',
    'Supervisió Operativa CSO,Validat i auditat amb dades oficials del pas de trens GIP (FGC)'
  ];

  return lines.join('\n');
}

export function generateAgentReportExcel(data: AgentReportData): void {
  const dateStr = data.serviceDate || new Date().toISOString().slice(0, 10);
  const csv = buildAgentReportCsv(data);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `nexus-informe-agent-${data.agent.empleat_id}-${dateStr}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * ────────────────────────────────────────────────────────────────
 * 2B. DOSSIER GENÈRIC CONSOLIDAT D'AGENT (PDF / IMPRESSIÓ A4)
 * ────────────────────────────────────────────────────────────────
 */
export function generateAgentGenericReportPrint(data: AgentGenericReportData): void {
  const { agent, historyRecords = [], contact, isPrivacyMode } = data;
  const now = new Date();
  const dateFormatted = now.toISOString().slice(0, 10);
  const timeFormatted = now.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' });
  const refCode = `FGC-OP-GEN-${agent.empleat_id}-${dateFormatted.replace(/-/g, '')}`;

  // Ordenar cronològicament descendent (més recent a més antic)
  const sortedDesc = [...historyRecords].sort((a, b) => (b.data_servei || '').localeCompare(a.data_servei || ''));
  
  // Període cobert
  const sortedAsc = [...historyRecords].sort((a, b) => (a.data_servei || '').localeCompare(b.data_servei || ''));
  const firstDate = sortedAsc[0]?.data_servei || 'N/D';
  const lastDate = sortedAsc[sortedAsc.length - 1]?.data_servei || 'N/D';

  const totalShifts = sortedDesc.length;
  const totalPassages = sortedDesc.reduce((acc, r) => acc + (r.passos_totals || 0), 0);
  const onTimePassages = sortedDesc.reduce((acc, r) => acc + (r.passos_en_hora || 0), 0);
  const delayedPassages = sortedDesc.reduce((acc, r) => acc + (r.passos_retard || 0), 0);
  
  let rate: number | null = null;
  if (totalPassages > 0) {
    rate = Number(((onTimePassages / totalPassages) * 100).toFixed(1));
  } else {
    const validRates = sortedDesc
      .map(r => r.puntualitat_percentatge !== null ? Number(r.puntualitat_percentatge) : null)
      .filter((r): r is number => r !== null);
    if (validRates.length > 0) {
      rate = Number((validRates.reduce((a, b) => a + b, 0) / validRates.length).toFixed(1));
    }
  }

  const rateClass = rate === null ? '#888' : rate >= 95 ? '#059669' : rate >= 85 ? '#d97706' : '#dc2626';

  const totalCircs = sortedDesc.reduce((acc, r) => acc + (r.circulacions_totals || (r.detall_circulacions?.length || 0)), 0);
  const completedCircs = sortedDesc.reduce((acc, r) => acc + (r.circulacions_completades || 0), 0);
  const maxDelaySec = sortedDesc.length > 0 ? Math.max(...sortedDesc.map(r => r.retard_maxim_segons || 0)) : 0;

  const html = `<!DOCTYPE html>
<html lang="ca">
<head>
  <meta charset="UTF-8">
  <title>Dossier Genèric Consolidat Agent ${agent.cognoms}, ${agent.nom} (${agent.empleat_id}) — FGC</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800;900&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 14mm 12mm 14mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;
      color: #2D3134;
      background: #FFFFFF;
      margin: 0;
      padding: 0;
      font-size: 10pt;
      line-height: 1.4;
    }
    .no-print-bar {
      background: #1E2124;
      color: #FFFFFF;
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .no-print-bar button {
      background: ${FGC_GREEN};
      color: ${FGC_GRAY};
      border: none;
      padding: 8px 18px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: opacity 0.2s;
    }
    .no-print-bar button.close-btn {
      background: #3E4347;
      color: #FFF;
      margin-left: 10px;
    }
    .sheet {
      max-width: 210mm;
      margin: 0 auto;
      padding: 24px 20px;
    }
    @media print {
      .no-print-bar { display: none !important; }
      .sheet { padding: 0 !important; max-width: 100% !important; }
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }

    /* HEADER OFICIAL FGC */
    .fgc-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 3px solid ${FGC_GREEN};
      padding-bottom: 14px;
      margin-bottom: 16px;
    }
    .fgc-brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .fgc-titles h1 {
      font-family: 'Montserrat', sans-serif;
      font-size: 18pt;
      font-weight: 800;
      color: ${FGC_GRAY};
      margin: 0;
      text-transform: uppercase;
      letter-spacing: -0.5px;
    }
    .fgc-titles p {
      margin: 2px 0 0;
      font-size: 9pt;
      color: #6C7378;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .fgc-meta {
      text-align: right;
      font-size: 8.5pt;
      color: #6C7378;
    }
    .fgc-meta .ref {
      font-family: monospace;
      font-weight: 700;
      color: ${FGC_GRAY};
    }

    /* DOSSIER AGENT */
    .agent-card {
      background: #F9FAFB;
      border: 1px solid #E5E7EB;
      border-left: 5px solid ${FGC_GREEN};
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 18px;
      display: grid;
      grid-template-columns: 2fr 1fr 1fr;
      gap: 16px;
    }
    .agent-name h2 {
      font-family: 'Montserrat', sans-serif;
      font-size: 14pt;
      font-weight: 800;
      color: ${FGC_GRAY};
      margin: 0 0 6px 0;
      text-transform: uppercase;
    }
    .agent-sub {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }
    .data-pill {
      display: inline-block;
      font-size: 7.5pt;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 4px;
      background: #E5E7EB;
      color: ${FGC_GRAY};
      letter-spacing: 0.3px;
    }

    /* KPI TILES */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 20px;
    }
    .kpi-box {
      border: 1px solid #E5E7EB;
      background: #F9FAFB;
      border-radius: 8px;
      padding: 12px 14px;
      text-align: center;
    }
    .kpi-box .val {
      font-family: 'Montserrat', sans-serif;
      font-size: 17pt;
      font-weight: 800;
      line-height: 1.1;
      margin-top: 3px;
    }
    .kpi-box .lbl {
      font-size: 7.5pt;
      font-weight: 700;
      text-transform: uppercase;
      color: #6C7378;
      letter-spacing: 0.5px;
    }

    /* TAULA HISTÒRICA */
    .section-title {
      font-family: 'Montserrat', sans-serif;
      font-size: 11pt;
      font-weight: 800;
      color: ${FGC_GRAY};
      text-transform: uppercase;
      margin: 20px 0 10px 0;
      padding-bottom: 4px;
      border-bottom: 1.5px solid #E5E7EB;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
      margin-bottom: 22px;
    }
    .data-table th {
      background: #F3F4F6;
      color: ${FGC_GRAY};
      font-weight: 700;
      text-transform: uppercase;
      font-size: 7pt;
      letter-spacing: 0.5px;
      padding: 7px 8px;
      border-bottom: 2px solid #D1D5DB;
      text-align: left;
    }
    .data-table td {
      padding: 7px 8px;
      border-bottom: 1px solid #E5E7EB;
      color: #374151;
    }
    .data-table tr:nth-child(even) td {
      background: #FAFAFA;
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 7pt;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge-ontime { background: #DCFCE7; color: #15803D; }
    .badge-delayed { background: #FEE2E2; color: #B91C1C; }
    .badge-pending { background: #F3F4F6; color: #6B7280; }

    /* SIGNATURES I DILIGÈNCIA */
    .signatures-box {
      margin-top: 24px;
      border-top: 1.5px dashed #D1D5DB;
      padding-top: 16px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .signature-slot {
      border: 1px solid #E5E7EB;
      background: #FBFBFC;
      border-radius: 6px;
      padding: 12px;
      min-height: 85px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .signature-title {
      font-size: 8pt;
      font-weight: 700;
      text-transform: uppercase;
      color: #6C7378;
    }
    .signature-footer {
      font-size: 7.5pt;
      color: #9CA3AF;
      border-top: 1px solid #E5E7EB;
      padding-top: 4px;
      margin-top: 36px;
    }

    .legal-notice {
      margin-top: 16px;
      font-size: 7pt;
      color: #9CA3AF;
      text-align: justify;
      line-height: 1.3;
    }
  </style>
</head>
<body>
  <div class="no-print-bar">
    <div style="font-weight:700; font-size:14px; display:flex; align-items:center; gap:10px;">
      <span style="color:${FGC_GREEN};">●</span>
      Dossier Genèric FGC · Visualització Prèvia / Impressió en PDF
    </div>
    <div>
      <button onclick="window.print()">
        🖨️ Imprimir / Guardar en PDF
      </button>
      <button class="close-btn" onclick="window.close()">
        ✕ Tancar
      </button>
    </div>
  </div>

  <div class="sheet">
    <!-- CAPÇALERA OFICIAL FGC -->
    <div class="fgc-header">
      <div class="fgc-brand">
        ${FGC_OFFICIAL_LOGO}
        <div class="fgc-titles">
          <h1>FGC Operacions</h1>
          <p>Centre de Supervisió Operativa (CSO) · Dossier Històric i Consolidat</p>
        </div>
      </div>
      <div class="fgc-meta">
        <div>Ref: <span class="ref">${refCode}</span></div>
        <div>Període: <strong>${firstDate} — ${lastDate}</strong></div>
        <div>Emès: ${dateFormatted} a les ${timeFormatted}</div>
      </div>
    </div>

    <!-- DOSSIER DE L'AGENT -->
    <div class="agent-card">
      <div class="agent-name">
        <h2>${agent.cognoms}, ${agent.nom}</h2>
        <div class="agent-sub">
          <span class="data-pill">NÒMINA #${agent.empleat_id}</span>
          <span class="data-pill">TORN HABITUAL: ${agent.torn || 'S/A'}</span>
          ${agent.tipus_torn ? `<span class="data-pill">${agent.tipus_torn.toUpperCase()}</span>` : ''}
          ${agent.dependencia ? `<span class="data-pill">DEP: ${agent.dependencia}</span>` : ''}
        </div>
        ${agent.observacions ? `<div style="margin-top:6px; font-size:7.5pt; color:#4B5563;"><strong>Obs:</strong> ${agent.observacions}</div>` : ''}
      </div>
      <div>
        <div style="font-size:7.5pt; font-weight:700; color:#6C7378; text-transform:uppercase;">Àmbit Temporal</div>
        <div style="font-size:10.5pt; font-weight:700; color:${FGC_GRAY}; margin-top:2px;">
          ${totalShifts} Jornades
        </div>
        <div style="font-size:7.5pt; color:#6C7378;">
          Auditoria GIP Registrada
        </div>
      </div>
      <div>
        <div style="font-size:7.5pt; font-weight:700; color:#6C7378; text-transform:uppercase;">Estat del Servei</div>
        <div style="font-size:8pt; color:#374151; margin-top:2px;">
          ${agent.abs_parc_c === 'S' ? '<span class="data-pill" style="color:#b91c1c; background:#fee2e2;">ABS PARCIAL</span>' : ''}
          ${agent.dta === 'S' ? '<span class="data-pill" style="color:#1d4ed8; background:#dbeafe;">DTA</span>' : ''}
          ${agent.dpa === 'S' ? '<span class="data-pill" style="color:#6d28d9; background:#ede9fe;">DPA</span>' : ''}
          <span class="data-pill" style="background:#e0f2fe; color:#0369a1;">OPERATIU CSO</span>
        </div>
      </div>
    </div>

    <!-- INDICADORS HISTÒRICS ACUMULATS (KPIs) -->
    <div class="kpi-grid">
      <div class="kpi-box">
        <div class="lbl">Puntualitat Mitjana Ponderada</div>
        <div class="val" style="color:${rateClass};">
          ${rate !== null ? `${rate}%` : '--%'}
        </div>
        <div style="font-size:7pt; color:#6C7378; margin-top:2px;">Criteri FGC &lt; 4 min</div>
      </div>
      <div class="kpi-box">
        <div class="lbl">Torns / Jornades Auditades</div>
        <div class="val" style="color:${FGC_GRAY};">
          ${totalShifts}
        </div>
        <div style="font-size:7pt; color:#6C7378; margin-top:2px;">Dies de servei arxivats</div>
      </div>
      <div class="kpi-box">
        <div class="lbl">Passos GIP Totals</div>
        <div class="val" style="color:${FGC_GRAY};">
          ${totalPassages}
        </div>
        <div style="font-size:7pt; color:#6C7378; margin-top:2px;">${onTimePassages} a temps · ${delayedPassages} retard</div>
      </div>
      <div class="kpi-box">
        <div class="lbl">Circulacions Conduïdes</div>
        <div class="val" style="color:${FGC_GRAY};">
          ${completedCircs} / ${totalCircs}
        </div>
        <div style="font-size:7pt; color:#6C7378; margin-top:2px;">Demora màx: ${maxDelaySec ? `+${Math.round(maxDelaySec / 60)}m` : '0m'}</div>
      </div>
    </div>

    <!-- TAULA HISTÒRICA DE JORNADES -->
    <h3 class="section-title">
      <span>Històric Cronològic de Torn i Puntualitat</span>
      <span style="font-size:8pt; font-weight:600; color:#6C7378;">Total: ${totalShifts} jornades</span>
    </h3>

    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 80px;">Data Servei</th>
          <th style="width: 65px;">Torn</th>
          <th style="width: 95px;">Horari</th>
          <th style="width: 80px;">Dependència</th>
          <th style="width: 80px; text-align:right;">Puntualitat</th>
          <th style="width: 100px; text-align:center;">Passos GIP</th>
          <th style="width: 90px; text-align:center;">Circulacions</th>
          <th style="width: 80px; text-align:right;">Demora Màx</th>
          <th style="width: 85px; text-align:center;">Estat</th>
        </tr>
      </thead>
      <tbody>
        ${sortedDesc.length === 0 ? `
          <tr>
            <td colspan="9" style="text-align:center; padding:18px; color:#9CA3AF;">
              No hi ha registres històrics arxivats per a aquest agent a la base de dades.
            </td>
          </tr>
        ` : sortedDesc.map(r => {
          const pRate = r.puntualitat_percentatge !== null && r.puntualitat_percentatge !== undefined ? Number(r.puntualitat_percentatge) : null;
          const pColor = pRate === null ? '#9CA3AF' : pRate >= 95 ? '#059669' : pRate >= 85 ? '#d97706' : '#dc2626';
          const maxD = r.retard_maxim_segons ? Math.round(r.retard_maxim_segons / 60) : 0;
          const statusBadge = r.estat_torn === 'COMPLETAT'
            ? '<span class="badge badge-ontime">Completat</span>'
            : r.estat_torn === 'EN_CURS'
              ? '<span class="badge" style="background:#fef3c7; color:#92400e;">En curs</span>'
              : '<span class="badge badge-pending">Arxivat</span>';

          return `
            <tr>
              <td><strong>${r.data_servei || '—'}</strong></td>
              <td><span style="font-weight:700; color:${FGC_GRAY};">${r.torn || '—'}</span></td>
              <td>${r.hora_inici || '--:--'} — ${r.hora_fi || '--:--'}</td>
              <td>${r.dependencia || '—'}</td>
              <td style="text-align:right; font-weight:700; color:${pColor};">
                ${pRate !== null ? `${pRate}%` : '—'}
              </td>
              <td style="text-align:center;">
                ${r.passos_totals || 0} <span style="font-size:7pt; color:#6B7280;">(${r.passos_en_hora || 0} / ${r.passos_retard || 0})</span>
              </td>
              <td style="text-align:center;">
                ${r.circulacions_completades || 0} / ${r.circulacions_totals || (r.detall_circulacions?.length || 0)}
              </td>
              <td style="text-align:right; font-family:monospace; color:${maxD >= 4 ? '#b91c1c' : '#374151'};">
                ${maxD > 0 ? `+${maxD}m` : '0m'}
              </td>
              <td style="text-align:center;">${statusBadge}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>

    <!-- VALIDACIÓ I SIGNATURES -->
    <div class="signatures-box">
      <div class="signature-slot">
        <div class="signature-title">Conformitat de l'Agent Maquinista</div>
        <div class="signature-footer">Signat: ${agent.cognoms}, ${agent.nom} · Nòmina #${agent.empleat_id}</div>
      </div>
      <div class="signature-slot">
        <div class="signature-title">Validació Supervisor de Servei CSO</div>
        <div class="signature-footer">Centre de Supervisió Operativa (CSO) · Data: ${dateFormatted}</div>
      </div>
    </div>

    <!-- NOTA LEGAL RGPD -->
    <div class="legal-notice">
      Aquest document és un dossier històric oficial d'operacions generat per NEXUS Supervisors per a ús exclusiu de gestió i auditoria operativa de Ferrocarrils de la Generalitat de Catalunya (FGC). Conté dades laborals i de rendiment subjectes al Reglament (UE) 2016/679 (RGPD) i la Llei Orgànica 3/2018 (LOPDGDD). Queda prohibida la seva reproducció, distribució o cessió a tercers sense autorització expressa de la Direcció d'Operacions d'FGC.
    </div>
  </div>
</body>
</html>`;

  openPrintWindow(html, `Dossier_Generic_${agent.empleat_id}_FGC`);
}

/**
 * ────────────────────────────────────────────────────────────────
 * 2C. DOSSIER GENÈRIC CONSOLIDAT D'AGENT (EXCEL / CSV)
 * ────────────────────────────────────────────────────────────────
 */
export function generateAgentGenericReportExcel(data: AgentGenericReportData): void {
  const { agent, historyRecords = [] } = data;
  const now = new Date();

  // Ordenar cronològicament descendent
  const sortedDesc = [...historyRecords].sort((a, b) => (b.data_servei || '').localeCompare(a.data_servei || ''));
  const sortedAsc = [...historyRecords].sort((a, b) => (a.data_servei || '').localeCompare(b.data_servei || ''));
  const firstDate = sortedAsc[0]?.data_servei || 'N/D';
  const lastDate = sortedAsc[sortedAsc.length - 1]?.data_servei || 'N/D';

  const totalShifts = sortedDesc.length;
  const totalPassages = sortedDesc.reduce((acc, r) => acc + (r.passos_totals || 0), 0);
  const onTimePassages = sortedDesc.reduce((acc, r) => acc + (r.passos_en_hora || 0), 0);
  const delayedPassages = sortedDesc.reduce((acc, r) => acc + (r.passos_retard || 0), 0);

  let rate: number | null = null;
  if (totalPassages > 0) {
    rate = Number(((onTimePassages / totalPassages) * 100).toFixed(1));
  } else {
    const validRates = sortedDesc
      .map(r => r.puntualitat_percentatge !== null ? Number(r.puntualitat_percentatge) : null)
      .filter((r): r is number => r !== null);
    if (validRates.length > 0) {
      rate = Number((validRates.reduce((a, b) => a + b, 0) / validRates.length).toFixed(1));
    }
  }

  const totalCircs = sortedDesc.reduce((acc, r) => acc + (r.circulacions_totals || (r.detall_circulacions?.length || 0)), 0);
  const completedCircs = sortedDesc.reduce((acc, r) => acc + (r.circulacions_completades || 0), 0);
  const maxDelaySec = sortedDesc.length > 0 ? Math.max(...sortedDesc.map(r => r.retard_maxim_segons || 0)) : 0;

  const lines: string[] = [
    'FERROCARRILS DE LA GENERALITAT DE CATALUNYA — NEXUS SUPERVISORS',
    'DOSSIER CONSOLIDAT I HISTÒRIC DE RENDIMENT PER AGENT',
    `Data d'emissió,${now.toLocaleDateString('ca-ES')} ${now.toLocaleTimeString('ca-ES')}`,
    `Període auditat,Des de ${firstDate} fins a ${lastDate}`,
    `Total jornades registrades,${totalShifts}`,
    '',
    '--- DADES DE L\'AGENT ---',
    'Nòmina,Cognoms,Nom,Torn Habitual,Dependència,Tipus Torn,Observacions',
    `"${agent.empleat_id}","${agent.cognoms}","${agent.nom}","${agent.torn || 'S/A'}","${agent.dependencia || ''}","${agent.tipus_torn || 'Ordinari'}","${(agent.observacions || '').replace(/"/g, '""')}"`,
    '',
    '--- INDICADORS HISTÒRICS ACUMULATS (GIP) ---',
    'Puntualitat Mitjana Ponderada (%),Passos Totals,Passos a l\'hora,Passos amb Retard,Circulacions Conduïdes,Circulacions Programades,Demora Màxima (segons)',
    `"${rate !== null ? rate : 'N/D'}","${totalPassages}","${onTimePassages}","${delayedPassages}","${completedCircs}","${totalCircs}","${maxDelaySec}"`,
    '',
    '--- HISTÒRIC DETALLAT PER JORNADA ---',
    'Data Servei,Torn,Servei,Horari Inici,Horari Fi,Dependència,Puntualitat (%),Passos Totals,Passos a temps,Passos retard,Demora Màxima (s),Demora Mitjana (s),Circulacions Totals,Circulacions Fetes,Estat Torn',
    ...sortedDesc.map(r => {
      return `"${r.data_servei || ''}","${r.torn || ''}","${r.servei || ''}","${r.hora_inici || ''}","${r.hora_fi || ''}","${r.dependencia || ''}","${r.puntualitat_percentatge !== null && r.puntualitat_percentatge !== undefined ? r.puntualitat_percentatge : ''}","${r.passos_totals || 0}","${r.passos_en_hora || 0}","${r.passos_retard || 0}","${r.retard_maxim_segons || 0}","${r.retard_mitja_segons || 0}","${r.circulacions_totals || 0}","${r.circulacions_completades || 0}","${r.estat_torn || ''}"`;
    }),
    '',
    '--- DILIGÈNCIA DE VALIDACIÓ ---',
    'Supervisió Operativa CSO,Validat i auditat amb dades històriques oficials del pas de trens GIP (FGC)'
  ];

  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `nexus-dossier-generic-agent-${agent.empleat_id}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * ────────────────────────────────────────────────────────────────
 * 3. INFORME GENÈRIC GLOBAL D'OPERACIONS CSO (PDF / IMPRESSIÓ A4)
 * ────────────────────────────────────────────────────────────────
 */
export function buildGlobalReportHtml(data: GlobalReportData): string {
  const { serviceDate, stats, kpis, alerts = [], reserves = [] } = data;
  const now = new Date();
  const dateFormatted = serviceDate || now.toISOString().slice(0, 10);
  const timeFormatted = now.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' });
  const refCode = `FGC-CSO-GLOBAL-${dateFormatted.replace(/-/g, '')}`;

  const globalRate = stats.globalRate;
  const rateClass = globalRate >= 95 ? '#059669' : globalRate >= 85 ? '#d97706' : '#dc2626';

  const html = `<!DOCTYPE html>
<html lang="ca">
<head>
  <meta charset="UTF-8">
  <title>Informe Diari d'Operacions CSO (${dateFormatted}) — FGC</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800;900&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 14mm 12mm 14mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;
      color: #2D3134;
      background: #FFFFFF;
      margin: 0;
      padding: 0;
      font-size: 11pt;
      line-height: 1.45;
    }
    .no-print-bar {
      background: #1E2124;
      color: #FFFFFF;
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .no-print-bar button {
      background: ${FGC_GREEN};
      color: ${FGC_GRAY};
      border: none;
      padding: 8px 18px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .no-print-bar button.close-btn {
      background: #3E4347;
      color: #FFF;
      margin-left: 10px;
    }
    .sheet {
      max-width: 210mm;
      margin: 0 auto;
      padding: 24px 20px;
    }
    @media print {
      .no-print-bar { display: none !important; }
      .sheet { padding: 0 !important; max-width: 100% !important; }
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }

    /* HEADER OFICIAL */
    .fgc-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 3px solid ${FGC_GREEN};
      padding-bottom: 14px;
      margin-bottom: 18px;
    }
    .fgc-brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .fgc-titles h1 {
      font-family: 'Montserrat', sans-serif;
      font-size: 18pt;
      font-weight: 800;
      color: ${FGC_GRAY};
      margin: 0;
      text-transform: uppercase;
      letter-spacing: -0.5px;
    }
    .fgc-titles p {
      margin: 2px 0 0;
      font-size: 9.5pt;
      color: #6C7378;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .fgc-meta {
      text-align: right;
      font-size: 9pt;
      color: #6C7378;
    }
    .fgc-meta .ref {
      font-family: monospace;
      font-weight: 700;
      color: ${FGC_GRAY};
    }

    /* KPI TILES */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 20px;
    }
    .kpi-box {
      border: 1px solid #E5E7EB;
      background: #F9FAFB;
      border-radius: 8px;
      padding: 12px 14px;
      text-align: center;
    }
    .kpi-box .val {
      font-family: 'Montserrat', monospace;
      font-size: 20pt;
      font-weight: 800;
      line-height: 1.1;
      margin-top: 4px;
    }
    .kpi-box .lbl {
      font-size: 8pt;
      text-transform: uppercase;
      font-weight: 700;
      color: #6C7378;
      letter-spacing: 0.5px;
    }

    h3.section-title {
      font-family: 'Montserrat', sans-serif;
      font-size: 11pt;
      font-weight: 800;
      color: ${FGC_GRAY};
      text-transform: uppercase;
      margin: 18px 0 8px;
      padding-bottom: 4px;
      border-bottom: 1.5px solid #E5E7EB;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    table.data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
      margin-bottom: 18px;
    }
    table.data-table th {
      background: #F1F3F5;
      color: ${FGC_GRAY};
      font-family: 'Montserrat', sans-serif;
      font-weight: 700;
      text-align: left;
      padding: 6px 8px;
      border-top: 1px solid #D1D5DB;
      border-bottom: 1px solid #D1D5DB;
      text-transform: uppercase;
      font-size: 7.5pt;
    }
    table.data-table td {
      padding: 6px 8px;
      border-bottom: 1px solid #E5E7EB;
      color: #374151;
    }
    table.data-table tr:nth-child(even) td {
      background: #FAFAFB;
    }

    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 7.5pt;
      font-weight: 700;
    }
    .badge-ontime { background: #DCFCE7; color: #166534; }
    .badge-delayed { background: #FEE2E2; color: #991B1B; }

    .signatures-box {
      margin-top: 24px;
      border-top: 1.5px dashed #D1D5DB;
      padding-top: 16px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      page-break-inside: avoid;
    }
    .signature-slot {
      border: 1px solid #E5E7EB;
      background: #FBFBFC;
      border-radius: 6px;
      padding: 12px;
      min-height: 90px;
      display: flex;
      flex-col;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="no-print-bar">
    <div style="font-weight:700; font-size:14px; display:flex; align-items:center; gap:10px;">
      <span style="color:${FGC_GREEN};">●</span>
      Informe Diari de Supervisió Operativa (CSO) · Impressió Oficial FGC
    </div>
    <div>
      <button onclick="window.print()">
        🖨️ Imprimir / Guardar en PDF
      </button>
      <button class="close-btn" onclick="window.close()">
        ✕ Tancar
      </button>
    </div>
  </div>

  <div class="sheet">
    <div class="fgc-header">
      <div class="fgc-brand">
        ${FGC_OFFICIAL_LOGO}
        <div class="fgc-titles">
          <h1>Resum Operacional CSO</h1>
          <p>Centre de Supervisió Operativa · Xarxa Barcelona-Vallès (FGC)</p>
        </div>
      </div>
      <div class="fgc-meta">
        <div>Ref: <span class="ref">${refCode}</span></div>
        <div>Servei: <strong>${dateFormatted}</strong></div>
        <div>Emès: ${dateFormatted} a les ${timeFormatted}</div>
      </div>
    </div>

    <!-- RESUM GLOBAL -->
    <div class="kpi-grid">
      <div class="kpi-box">
        <div class="lbl">Puntualitat de Xarxa</div>
        <div class="val" style="color:${rateClass};">${globalRate}%</div>
        <div style="font-size:7.5pt; color:#6C7378; margin-top:2px;">Criteri FGC &lt; 4 minuts</div>
      </div>
      <div class="kpi-box">
        <div class="lbl">Passos Enregistrats</div>
        <div class="val" style="color:${FGC_GRAY};">${stats.totalPassages}</div>
        <div style="font-size:7.5pt; color:#6C7378; margin-top:2px;">${stats.onTimeCount} a l'hora · ${stats.delayedCount} retard</div>
      </div>
      <div class="kpi-box">
        <div class="lbl">Cobertura de Servei</div>
        <div class="val" style="color:${FGC_GRAY};">${kpis?.serviceCoverage || 100}%</div>
        <div style="font-size:7.5pt; color:#6C7378; margin-top:2px;">Planificació: ${kpis?.planningCoverage || 100}%</div>
      </div>
      <div class="kpi-box">
        <div class="lbl">Flota Operativa</div>
        <div class="val" style="color:${FGC_GRAY};">${kpis?.availableTrainUnits || 61} UT</div>
        <div style="font-size:7.5pt; color:#6C7378; margin-top:2px;">${kpis?.brokenTrainUnits || 0} unitats amb avaria</div>
      </div>
    </div>

    <!-- PUNTUALITAT PER LÍNIA -->
    <h3 class="section-title">
      <span>Puntualitat Desglossada per Línia</span>
    </h3>
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 70px;">Línia</th>
          <th>Passos Totals</th>
          <th>A l'hora</th>
          <th>Amb Retard</th>
          <th style="text-align:right;">Puntualitat (%)</th>
          <th style="text-align:right;">Retard Mitjà</th>
          <th style="text-align:center;">Estat</th>
        </tr>
      </thead>
      <tbody>
        ${(stats.lineStats || []).map(l => {
          const lRate = l.rate;
          const badge = lRate >= 95 
            ? '<span class="badge badge-ontime">Òptim</span>' 
            : lRate >= 85 
              ? '<span class="badge" style="background:#fef3c7; color:#92400e;">Regular</span>' 
              : '<span class="badge badge-delayed">Afectació</span>';

          return `
            <tr>
              <td><strong style="font-size:9.5pt;">${l.linia}</strong></td>
              <td>${l.total}</td>
              <td>${l.onTime}</td>
              <td>${l.delayed}</td>
              <td style="text-align:right; font-weight:700; color:${lRate >= 95 ? '#059669' : lRate >= 85 ? '#d97706' : '#dc2626'};">${lRate}%</td>
              <td style="text-align:right;">${l.avgDelayFormatted}</td>
              <td style="text-align:center;">${badge}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>

    <!-- RETARDS MÉS DESTACATS DE LA JORNADA -->
    ${(stats.recentDelays && stats.recentDelays.length > 0) ? `
      <h3 class="section-title">
        <span>Principals Demores Enregistrades (&gt; 3 minuts)</span>
        <span style="font-size:8pt; font-weight:600; color:#6C7378;">Top ${Math.min(stats.recentDelays.length, 8)} trens</span>
      </h3>
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 70px;">Tren</th>
            <th style="width: 60px;">Línia</th>
            <th>Estació d'Afectació</th>
            <th style="width: 80px;">Hora Real</th>
            <th style="width: 70px;">UT</th>
            <th style="width: 90px; text-align:right;">Retard</th>
          </tr>
        </thead>
        <tbody>
          ${stats.recentDelays.slice(0, 8).map(d => `
            <tr>
              <td><strong>${d.circulacioId}</strong></td>
              <td><strong>${d.linia}</strong></td>
              <td>${d.estacioNom}</td>
              <td>${d.horaReal}</td>
              <td style="font-family:monospace;">${d.ut || '—'}</td>
              <td style="text-align:right; font-weight:700; color:#dc2626;">${d.delayFormatted}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : ''}

    <!-- ESTAT DE RESERVES -->
    ${reserves.length > 0 ? `
      <h3 class="section-title">
        <span>Estat de Reserves als Destacaments</span>
        <span style="font-size:8pt; font-weight:600; color:#6C7378;">Disponibles: ${kpis?.reserveAvailable || 0} / ${kpis?.reserveTotal || 0}</span>
      </h3>
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 150px;">Destacament</th>
            <th>Maquinistes de Reserva</th>
          </tr>
        </thead>
        <tbody>
          ${reserves.map(r => `
            <tr>
              <td><strong>${r.station}</strong></td>
              <td>${r.personnel.map(p => `<span class="badge" style="background:#e5e7eb; color:#374151; margin-right:4px;">${p.torn} · ${p.cognoms}, ${p.nom}</span>`).join('')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : ''}

    <div class="signatures-box">
      <div class="signature-slot">
        <div style="font-size:8pt; font-weight:700; text-transform:uppercase; color:#6C7378;">Supervisor de Sala CSO</div>
        <div style="font-size:7.5pt; color:#9CA3AF; border-top:1px solid #E5E7EB; padding-top:4px; margin-top:40px;">
          Centre de Supervisió Operativa (CSO) · Rubí Operacions
        </div>
      </div>
      <div class="signature-slot">
        <div style="font-size:8pt; font-weight:700; text-transform:uppercase; color:#6C7378;">Cap de Torn / Regulació de Trànsit</div>
        <div style="font-size:7.5pt; color:#9CA3AF; border-top:1px solid #E5E7EB; padding-top:4px; margin-top:40px;">
          Ferrocarrils de la Generalitat de Catalunya · ${dateFormatted}
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

  return html;
}

export function generateGlobalReportPrint(data: GlobalReportData): void {
  const html = buildGlobalReportHtml(data);
  const dateFormatted = data.serviceDate || new Date().toISOString().slice(0, 10);
  openPrintWindow(html, `Informe_Global_CSO_${dateFormatted}`);
}

/**
 * ────────────────────────────────────────────────────────────────
 * 4. INFORME GENÈRIC GLOBAL D'OPERACIONS CSO (EXCEL / CSV)
 * ────────────────────────────────────────────────────────────────
 */
export function buildGlobalReportCsv(data: GlobalReportData): string {
  const { serviceDate, stats, kpis, alerts = [], reserves = [] } = data;
  const now = new Date();
  const dateStr = serviceDate || now.toISOString().slice(0, 10);

  const lines: string[] = [
    'FERROCARRILS DE LA GENERALITAT DE CATALUNYA — NEXUS SUPERVISORS',
    'INFORME DIARI DE SUPERVISIÓ OPERATIVA (CSO)',
    `Data d'emissió,${now.toLocaleDateString('ca-ES')} ${now.toLocaleTimeString('ca-ES')}`,
    `Data de servei analitzada,${dateStr}`,
    '',
    '--- INDICADORS GLOBALS DE XARXA ---',
    'Puntualitat Global (%),Passos Totals,Passos a l\'hora,Passos amb Retard,Retard Mitjà,Cobertura de Servei (%),Flota Operativa (UT),Flota Avariada (UT)',
    `"${stats.globalRate}%","${stats.totalPassages}","${stats.onTimeCount}","${stats.delayedCount}","${stats.avgDelayFormatted}","${kpis?.serviceCoverage || 100}%","${kpis?.availableTrainUnits || 61}","${kpis?.brokenTrainUnits || 0}"`,
    '',
    '--- PUNTUALITAT PER LÍNIA ---',
    'Línia,Passos Totals,A l\'hora,Amb Retard,Puntualitat (%),Retard Mitjà',
    ...(stats.lineStats || []).map(l =>
      `"${l.linia}","${l.total}","${l.onTime}","${l.delayed}","${l.rate}%","${l.avgDelayFormatted}"`
    ),
    '',
    '--- PRINCIPALS RETARDS DE LA JORNADA ---',
    'Codi Tren,Línia,Estació de Pas,Hora Real,UT,Retard',
    ...(stats.recentDelays || []).slice(0, 20).map(d =>
      `"${d.circulacioId}","${d.linia}","${d.estacioNom}","${d.horaReal}","${d.ut || ''}","${d.delayFormatted}"`
    ),
    '',
    '--- ESTAT DE RESERVES ALS DESTACAMENTS ---',
    'Destacament,Torn,Cognoms,Nom',
    ...reserves.flatMap(r =>
      r.personnel.map(p => `"${r.station}","${p.torn}","${p.cognoms}","${p.nom}"`)
    )
  ];

  return lines.join('\n');
}

export function generateGlobalReportExcel(data: GlobalReportData): void {
  const dateStr = data.serviceDate || new Date().toISOString().slice(0, 10);
  const csv = buildGlobalReportCsv(data);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `nexus-informe-cso-${dateStr}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * ────────────────────────────────────────────────────────────────
 * 5. CARREGA DIRECTA I GENERACIÓ PER A QUALSEVOL AGENT
 * ────────────────────────────────────────────────────────────────
 */
export async function generateAgentReportDirectly(
  agent: any,
  format: 'pdf' | 'excel' = 'pdf',
  serviceDate?: string,
  contact?: { phones: string[]; email: string | null },
  isPrivacyMode: boolean = false
): Promise<boolean> {
  let pendingWin: Window | null = null;
  if (format === 'pdf') {
    pendingWin = window.open('', '_blank', 'width=1020,height=900,menubar=no,toolbar=no,location=no,status=no');
    if (pendingWin) {
      pendingWin.document.open();
      pendingWin.document.write(`<!DOCTYPE html><html lang="ca"><head><meta charset="UTF-8"><title>Generant Informe Oficial FGC...</title></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#1E2124;color:#FFF;"><div style="text-align:center;"><div style="font-size:16px;font-weight:700;color:#97BE14;margin-bottom:8px;">FGC OPERACIONS · NEXUS SUPERVISORS</div><div style="font-size:13px;color:#9CA3AF;">Carregant circulacions del torn i registres oficials GIP...</div></div></body></html>`);
      pendingWin.document.close();
    }
  }

  const todayServiceDate = getFgcServiceDate();
  const sDate = serviceDate || todayServiceDate;
  const now = new Date();
  const nowTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  const nowMin = getFgcMinutes(nowTimeStr) ?? 0;

  // Check if agent_performance_history has a record for this date (useful for past dates or fallback)
  let historyRecord: AgentPerformanceHistory | null = null;
  if (agent?.empleat_id) {
    try {
      const { data: hist } = await supabase
        .from('agent_performance_history')
        .select('*')
        .eq('data_servei', sDate)
        .eq('empleat_id', String(agent.empleat_id).trim())
        .maybeSingle();
      if (hist) {
        historyRecord = hist as AgentPerformanceHistory;
      }
    } catch {}
  }

  const rawTorn = ((sDate !== todayServiceDate && historyRecord?.torn) ? historyRecord.torn : (agent?.torn || historyRecord?.torn || '')).trim();
  const obsMatch = (agent?.observacions || '').match(/(?:COBREIX\s+|TORN\s+)(Q?\d+[A-Z]?)/i)
    || (agent?.observacions || '').match(/\b(Q[A-Z0-9]+)\b/i);
  const obsTorn = obsMatch ? obsMatch[1].toUpperCase() : null;

  const isSpecialNonShift = ['VAC', 'DES', 'DIS', 'DAG', 'AJN', 'S/A', 'FOR', 'LLIB'].some(p => rawTorn.toUpperCase().startsWith(p));
  const targetTorn = (!isSpecialNonShift ? rawTorn : (obsTorn || rawTorn));

  let resolvedShift: any = null;
  let fullCircs: any[] = [];
  let gipPassages: any[] = [];

  if (targetTorn && (!isSpecialNonShift || obsTorn)) {
    const cleanTorn = targetTorn.toUpperCase();
    const targetDateObj = new Date(sDate + 'T12:00:00');
    const targetService = getServiceForDate(targetDateObj);

    const numMatch = cleanTorn.match(/\d+/);
    const num = numMatch ? numMatch[0] : '';
    const numPadded = num.padStart(3, '0');

    const prefixes = ['1', '0', '4', '5'];
    const candidatePool = Array.from(new Set([
      cleanTorn,
      `Q${cleanTorn}`,
      ...(obsTorn ? [obsTorn, `Q${obsTorn}`] : []),
      ...(num ? [
        ...prefixes.map(p => `Q${p}${numPadded}`),
        ...prefixes.map(p => `Q${p}${num}`),
        `Q${numPadded}`,
        num
      ] : []),
      ...getCandidateShiftIds(cleanTorn, targetService),
      ...getCandidateShiftIds(cleanTorn, 'Tots')
    ])).filter(Boolean);

    try {
      const { data: foundShifts } = await supabase
        .from('shifts')
        .select('*')
        .in('id', candidatePool);

      const bestDbShift = foundShifts?.find(s => s.servei === targetService && s.circulations?.length > 0)
        || foundShifts?.find(s => s.circulations?.length > 0)
        || foundShifts?.find(s => s.servei === targetService)
        || foundShifts?.[0];

      if (bestDbShift) {
        const enrichedList = await fetchFullTurns([bestDbShift.id], bestDbShift.servei);
        const fullEnriched = enrichedList.find(s => s.id === bestDbShift.id && s.fullCirculations?.length > 0)
          || enrichedList.find(s => s.fullCirculations?.length > 0)
          || enrichedList[0];

        resolvedShift = fullEnriched || bestDbShift;
        fullCircs = (fullEnriched?.fullCirculations && fullEnriched.fullCirculations.length > 0)
          ? fullEnriched.fullCirculations
          : (bestDbShift.circulations || []);
      }
    } catch (e) {
      console.warn('[officialReports] Error fetching shift:', e);
    }

    // Query GIP passages
    const circCodes = new Set<string>();
    fullCircs.forEach((c: any) => {
      const codi = typeof c === 'string' ? c : c.codi;
      const real = typeof c === 'object' ? c.realCodi : null;
      if (codi && codi !== '-' && codi !== 'Viatger') circCodes.add(codi);
      if (real && real !== '-') circCodes.add(real);
    });
    const circCodeList = Array.from(circCodes);

    if (circCodeList.length > 0) {
      try {
        const { data: passages } = await supabase
          .from('gip_registre_pas')
          .select('*')
          .eq('data_servei', sDate)
          .in('circulacio_id', circCodeList);
        if (passages) gipPassages = passages;
      } catch (e) {
        console.warn('[officialReports] Error fetching GIP passages:', e);
      }
    }
  }

  // Fallback virtual shift
  if (!resolvedShift) {
    resolvedShift = {
      id: targetTorn || 'S/A',
      inici_torn: historyRecord?.hora_inici || agent?.hora_inici || '--:--',
      final_torn: historyRecord?.hora_fi || agent?.hora_fi || '--:--',
      dependencia: historyRecord?.dependencia || agent?.dependencia || ''
    };
  }

  const shiftStartMin = getFgcMinutes(resolvedShift.inici_torn || agent?.hora_inici);
  const isShiftStarted = sDate < todayServiceDate || (sDate === todayServiceDate && shiftStartMin !== null && nowMin >= shiftStartMin);

  // Filter out placeholder '-' circulations on reserve shifts
  const realFullCircs = fullCircs.filter((c: any) => {
    const codi = (typeof c === 'string' ? c : (c?.codi || '')).trim();
    return codi && codi !== '-' && codi !== 'RESERVA';
  });

  // Calculate circulations list and punctuality
  const circulationsList = (realFullCircs.length === 0 && historyRecord?.detall_circulacions && historyRecord.detall_circulacions.length > 0)
    ? historyRecord.detall_circulacions.filter((c: any) => c?.codi && c.codi !== '-' && c.codi !== 'RESERVA')
    : realFullCircs.map((c: any) => {
      const codi = typeof c === 'string' ? c : (c.codi || c.realCodi || c.id);
      const realCodi = typeof c === 'object' ? c.realCodi : null;
      const histCirc = historyRecord?.detall_circulacions?.find((hc: any) =>
        hc.codi === codi || (realCodi && hc.codi === realCodi)
      );

      const rawPassagesForCirc = gipPassages
        .filter(p => p.circulacio_id === codi || (realCodi && p.circulacio_id === realCodi))
        .sort((a, b) => (getFgcMinutes(a.hora_real || a.hora_teorica) ?? 0) - (getFgcMinutes(b.hora_real || b.hora_teorica) ?? 0));

      const sMin = getFgcMinutes(c.sortida);
      const eMin = getFgcMinutes(c.arribada);
      let status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' = 'PENDING';

      if (sDate < todayServiceDate) {
        status = 'COMPLETED';
      } else if (sDate === todayServiceDate) {
        if (sMin !== null && eMin !== null) {
          if (nowMin >= eMin) {
            status = 'COMPLETED';
          } else if (nowMin >= sMin && nowMin < eMin) {
            status = 'IN_PROGRESS';
          } else if (rawPassagesForCirc.length > 0 && isShiftStarted) {
            status = 'IN_PROGRESS';
          }
        } else if (rawPassagesForCirc.length > 0) {
          status = 'COMPLETED';
        }
      }

      const passagesForCirc = (sDate === todayServiceDate && status === 'PENDING' && !isShiftStarted)
        ? []
        : rawPassagesForCirc;

      const totalStops = passagesForCirc.length > 0 ? passagesForCirc.length : (histCirc?.totalStops || 0);
      const onTimePassages = passagesForCirc.length > 0
        ? passagesForCirc.filter(p => p.estat === 'en_hora' || p.estat === 'avanc').length
        : (histCirc?.onTimeStops || 0);
      const delayedStops = passagesForCirc.filter(p => p.estat === 'retard');
      const delayedStopsCount = passagesForCirc.length > 0 ? delayedStops.length : (histCirc?.delayedStopsCount || 0);
      const rate = totalStops > 0 ? Number(((onTimePassages / totalStops) * 100).toFixed(1)) : (histCirc?.rate ?? null);
      const maxDelaySec = delayedStops.length > 0
        ? Math.max(...delayedStops.map(p => normalizeTimeDiffSec(p.diferencia_segons)))
        : (histCirc?.maxDelaySec || 0);

      const sortidaReal = passagesForCirc.length > 0
        ? passagesForCirc[0].hora_real
        : (histCirc?.sortidaReal || undefined);
      const arribadaReal = passagesForCirc.length > 0
        ? passagesForCirc[passagesForCirc.length - 1].hora_real
        : (histCirc?.arribadaReal || undefined);

      const passageUt = passagesForCirc.find(p => p.ut)?.ut;
      const resolvedUt = passageUt || c.ut || c.train || histCirc?.ut || histCirc?.train || undefined;
      const resolvedInici = c.inici || histCirc?.inici || (passagesForCirc[0]?.estacio_codi) || '';
      const resolvedFinal = c.final || histCirc?.final || (passagesForCirc[passagesForCirc.length - 1]?.estacio_codi) || '';
      const resolvedLinia = resolveLiniaName(codi, c.linia || histCirc?.linia || passagesForCirc[0]?.linia);

      return {
        codi,
        realCodi,
        linia: resolvedLinia,
        inici: resolvedInici,
        final: resolvedFinal,
        sortida: c.sortida || histCirc?.sortida,
        arribada: c.arribada || histCirc?.arribada,
        sortidaReal,
        arribadaReal,
        cicle: c.cicle || histCirc?.cicle,
        train: resolvedUt,
        ut: resolvedUt,
        status,
        rate,
        totalStops,
        onTimeStops: onTimePassages,
        delayedStopsCount,
        maxDelaySec
      };
    });

  const activeOrCompletedCircs = circulationsList.filter(c => c.status !== 'PENDING' || (c.totalStops || 0) > 0);
  const sumPassages = activeOrCompletedCircs.reduce((acc, c) => acc + (c.totalStops || 0), 0);
  const sumOnTime = activeOrCompletedCircs.reduce((acc, c) => acc + (c.onTimeStops || 0), 0);
  const sumDelayed = activeOrCompletedCircs.reduce((acc, c) => acc + (c.delayedStopsCount || 0), 0);

  const totalPassages = sumPassages > 0 ? sumPassages : (historyRecord?.passos_totals || 0);
  const onTimePassages = sumPassages > 0 ? sumOnTime : (historyRecord?.passos_en_hora || 0);
  const delayedCount = sumPassages > 0 ? sumDelayed : (historyRecord?.passos_retard || 0);
  const overallRate = totalPassages > 0
    ? Number(((onTimePassages / totalPassages) * 100).toFixed(1))
    : (historyRecord?.puntualitat_percentatge !== null && historyRecord?.puntualitat_percentatge !== undefined ? Number(historyRecord.puntualitat_percentatge) : null);

  const allDelayedPassages = gipPassages.filter(p => p.estat === 'retard');
  const maxDelay = allDelayedPassages.length > 0
    ? Math.max(...allDelayedPassages.map(p => normalizeTimeDiffSec(p.diferencia_segons)))
    : Math.max(0, ...circulationsList.map(c => c.maxDelaySec || 0), historyRecord?.retard_maxim_segons || 0);
  const avgDelay = allDelayedPassages.length > 0
    ? Math.round(allDelayedPassages.reduce((acc, p) => acc + normalizeTimeDiffSec(p.diferencia_segons), 0) / allDelayedPassages.length)
    : (historyRecord?.retard_mitja_segons || 0);

  const reportPayload: AgentReportData = {
    agent: {
      ...agent,
      torn: rawTorn || agent?.torn
    },
    shiftData: resolvedShift,
    overallPunctuality: {
      rate: overallRate,
      totalPassages,
      onTimePassages,
      delayedCount,
      maxDelaySec: maxDelay,
      avgDelaySec: avgDelay,
      totalCircs: circulationsList.length,
      completedCircs: circulationsList.filter(c => c.status === 'COMPLETED').length
    },
    circulationsList,
    serviceDate: sDate,
    contact,
    isPrivacyMode
  };

  if (format === 'excel') {
    generateAgentReportExcel(reportPayload);
  } else {
    generateAgentReportPrint(reportPayload, pendingWin);
  }

  return true;
}

/**
 * ────────────────────────────────────────────────────────────────
 * 6. CARREGA DIRECTA I GENERACIÓ DEL DOSSIER GENÈRIC PER A QUALSEVOL AGENT
 * ────────────────────────────────────────────────────────────────
 */
export async function generateAgentGenericReportDirectly(
  agent: any,
  format: 'pdf' | 'excel' = 'pdf',
  contact?: { phones: string[]; email: string | null },
  isPrivacyMode: boolean = false
): Promise<boolean> {
  let records: AgentPerformanceHistory[] = [];
  try {
    if (agent?.empleat_id) {
      records = await getAgentPerformanceHistory(String(agent.empleat_id), 100);
    }
  } catch (e) {
    console.warn('[officialReports] Error fetching history for generic report:', e);
  }

  const payload: AgentGenericReportData = {
    agent,
    historyRecords: records,
    contact,
    isPrivacyMode
  };

  if (format === 'excel') {
    generateAgentGenericReportExcel(payload);
  } else {
    generateAgentGenericReportPrint(payload);
  }

  return true;
}

