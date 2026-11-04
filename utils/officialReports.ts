/**
 * utils/officialReports.ts
 * Generador d'Informes Oficials en PDF Imprimible (A4) i Excel / CSV per a NEXUS Supervisors.
 * Aplica estrictament la Identitat Visual Corporativa de Ferrocarrils de la Generalitat de Catalunya (FGC):
 * - Verd Corporatiu FGC (#97BE14)
 * - Gris Corporatiu FGC (#4D5358)
 * - Tipografies: Montserrat (Bold) per a titulars, Helvetica/Arial per al cos i taules.
 * - Composició alineada a l'esquerra, caixes de validació i signatures oficials CSO.
 */

import { formatFgcTime, resolveStationId, getCandidateShiftIds, normalizeTimeDiffSec } from './stations';
import { STATION_GEO_MAP } from './stationGeoData';
import { supabase } from '../supabaseClient';
import { fetchFullTurns } from './queries';
import { getFgcServiceDate } from './gipRecorder';

const FGC_GREEN = '#97BE14';
const FGC_GRAY = '#4D5358';

const resolveStationName = (codeOrName: string, linia: string = ''): string => {
  if (!codeOrName) return '';
  const trimmed = codeOrName.trim();
  const code = resolveStationId(trimmed, linia);
  const geo = STATION_GEO_MAP.get(code);
  return geo?.name || trimmed;
};

// SVG Vector Oficial del Símbol d'FGC d'alta fidelitat
const FGC_LOGO_SVG = `
<svg width="44" height="44" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" rx="20" fill="${FGC_GREEN}"/>
  <path d="M 28 32 C 28 25 34 20 42 20 L 68 20 C 76 20 82 26 82 34 C 82 42 76 48 68 48 L 44 48 C 36 48 32 52 32 60 C 32 68 36 72 44 72 L 72 72 C 80 72 86 78 86 86 C 86 92 80 96 72 96 L 32 96 C 24 96 18 90 18 82 C 18 74 24 68 32 68 L 58 68 C 64 68 68 64 68 58 C 68 52 64 48 58 48 L 42 48 C 34 48 28 42 28 32 Z" fill="#FFFFFF"/>
</svg>
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
    linia?: string;
    inici?: string;
    final?: string;
    sortida?: string;
    arribada?: string;
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
const openPrintWindow = (htmlContent: string, title: string) => {
  const printWin = window.open('', '_blank', 'width=1020,height=900,menubar=no,toolbar=no,location=no,status=no');
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
export function generateAgentReportPrint(data: AgentReportData): void {
  const { agent, shiftData, overallPunctuality, circulationsList = [], serviceDate, contact, isPrivacyMode } = data;
  const now = new Date();
  const dateFormatted = serviceDate || now.toISOString().slice(0, 10);
  const timeFormatted = now.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' });
  const refCode = `FGC-OP-AGT-${agent.empleat_id}-${dateFormatted.replace(/-/g, '')}`;

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
        ${FGC_LOGO_SVG}
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
          ${overallPunctuality?.completedCircs || 0} / ${overallPunctuality?.totalCircs || circulationsList.length}
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
      <span style="font-size:8pt; font-weight:600; color:#6C7378;">Total: ${circulationsList.length} circulacions</span>
    </h3>

    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 50px;">Tren</th>
          <th style="width: 45px;">Línia</th>
          <th>Trajecte (Origen → Destinació)</th>
          <th style="width: 70px;">Sortida</th>
          <th style="width: 70px;">Arribada</th>
          <th style="width: 60px;">UT</th>
          <th style="width: 50px;">Cicle</th>
          <th style="width: 75px; text-align:right;">Puntualitat</th>
          <th style="width: 80px; text-align:center;">Estat</th>
        </tr>
      </thead>
      <tbody>
        ${circulationsList.length === 0 ? `
          <tr>
            <td colspan="9" style="text-align:center; padding:18px; color:#9CA3AF;">
              No hi ha circulacions detallades assignades a aquest torn.
            </td>
          </tr>
        ` : circulationsList.map(c => {
          const isPassenger = c.codi === 'Viatger';
          const isDelayed = (c.delayedStopsCount || 0) > 0 || (c.maxDelaySec || 0) > 239;
          const statusBadge = isPassenger
            ? '<span class="badge" style="background:#e0f2fe; color:#0369a1;">Viatger</span>'
            : c.status === 'COMPLETED'
              ? (isDelayed ? '<span class="badge badge-delayed">Amb retard</span>' : '<span class="badge badge-ontime">A l\'hora</span>')
              : c.status === 'IN_PROGRESS'
                ? '<span class="badge" style="background:#fef3c7; color:#92400e;">En curs</span>'
                : '<span class="badge badge-pending">Pendent</span>';

          return `
            <tr>
              <td><strong>${c.codi}</strong></td>
              <td><span style="font-weight:700; color:${FGC_GRAY};">${c.linia || '—'}</span></td>
              <td>${resolveStationName(c.inici || '')} → ${resolveStationName(c.final || '')}</td>
              <td>${c.sortida || '--:--'}</td>
              <td>${c.arribada || '--:--'}</td>
              <td style="font-family:monospace; font-weight:700;">${c.ut || c.train || '—'}</td>
              <td>${c.cicle || '—'}</td>
              <td style="text-align:right; font-weight:700; color:${c.rate !== null && c.rate !== undefined ? (c.rate >= 95 ? '#059669' : c.rate >= 85 ? '#d97706' : '#dc2626') : '#9CA3AF'};">
                ${c.rate !== null && c.rate !== undefined ? `${c.rate}%` : '—'}
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

  openPrintWindow(html, `Informe_Agent_${agent.empleat_id}_${dateFormatted}`);
}

/**
 * ────────────────────────────────────────────────────────────────
 * 2. INFORME OFICIAL INDIVIDUAL D'AGENT (EXCEL / CSV)
 * ────────────────────────────────────────────────────────────────
 */
export function generateAgentReportExcel(data: AgentReportData): void {
  const { agent, shiftData, overallPunctuality, circulationsList = [], serviceDate } = data;
  const now = new Date();
  const dateStr = serviceDate || now.toISOString().slice(0, 10);

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
    `"${overallPunctuality?.rate !== null && overallPunctuality?.rate !== undefined ? overallPunctuality.rate : 'N/D'}","${overallPunctuality?.totalPassages || 0}","${overallPunctuality?.onTimePassages || 0}","${overallPunctuality?.delayedCount || 0}","${overallPunctuality?.completedCircs || 0}","${overallPunctuality?.totalCircs || circulationsList.length}","${overallPunctuality?.maxDelaySec || 0}","${overallPunctuality?.avgDelaySec || 0}"`,
    '',
    '--- DETALL DE CIRCULACIONS ---',
    'Codi Tren,Línia,Origen,Destinació,Sortida Teòrica,Arribada Teòrica,UT Conduïda,Cicle,Puntualitat (%),Passos a temps,Passos retard,Estat',
    ...circulationsList.map(c => {
      const orig = resolveStationName(c.inici || '');
      const dest = resolveStationName(c.final || '');
      return `"${c.codi}","${c.linia || ''}","${orig}","${dest}","${c.sortida || ''}","${c.arribada || ''}","${c.ut || c.train || ''}","${c.cicle || ''}","${c.rate !== null && c.rate !== undefined ? c.rate : ''}","${c.onTimeStops || 0}","${c.delayedStopsCount || 0}","${c.status || ''}"`;
    }),
    '',
    '--- DILIGÈNCIA DE VALIDACIÓ ---',
    'Supervisió Operativa CSO,Validat i auditat amb dades oficials del pas de trens GIP (FGC)'
  ];

  // Afegir UTF-8 BOM (\uFEFF) per a compatibilitat transparent amb Microsoft Excel
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `nexus-informe-agent-${agent.empleat_id}-${dateStr}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * ────────────────────────────────────────────────────────────────
 * 3. INFORME GENÈRIC GLOBAL D'OPERACIONS CSO (PDF / IMPRESSIÓ A4)
 * ────────────────────────────────────────────────────────────────
 */
export function generateGlobalReportPrint(data: GlobalReportData): void {
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
        ${FGC_LOGO_SVG}
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

  openPrintWindow(html, `Informe_Global_CSO_${dateFormatted}`);
}

/**
 * ────────────────────────────────────────────────────────────────
 * 4. INFORME GENÈRIC GLOBAL D'OPERACIONS CSO (EXCEL / CSV)
 * ────────────────────────────────────────────────────────────────
 */
export function generateGlobalReportExcel(data: GlobalReportData): void {
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

  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
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
  const sDate = serviceDate || getFgcServiceDate();
  const rawTorn = (agent?.torn || '').trim();
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
    const numMatch = cleanTorn.match(/\d+/);
    const num = numMatch ? numMatch[0] : '';
    const numPadded = num.padStart(3, '0');

    const prefixes = ['1', '0', '4', '5'];
    const candidatePool = Array.from(new Set([
      cleanTorn,
      `Q${cleanTorn}`,
      ...(obsTorn ? [obsTorn, `Q${obsTorn}`] : []),
      ...prefixes.map(p => `Q${p}${numPadded}`),
      ...prefixes.map(p => `Q${p}${num}`),
      `Q${numPadded}`,
      num,
      ...getCandidateShiftIds(cleanTorn, 'Tots')
    ])).filter(Boolean);

    try {
      const { data: foundShifts } = await supabase
        .from('shifts')
        .select('*')
        .in('id', candidatePool);

      const bestDbShift = foundShifts?.find(s => s.circulations?.length > 0) || foundShifts?.[0];

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
    const circCodes: string[] = Array.from(new Set(
      fullCircs
        .map((c: any) => typeof c === 'string' ? c : (c.codi || c.realCodi || c.id))
        .filter((c: string) => c && c !== 'Viatger')
    ));

    if (circCodes.length > 0) {
      try {
        const { data: passages } = await supabase
          .from('gip_registre_pas')
          .select('*')
          .eq('data_servei', sDate)
          .in('circulacio_id', circCodes);
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
      inici_torn: agent?.hora_inici || '--:--',
      final_torn: agent?.hora_fi || '--:--',
      dependencia: agent?.dependencia || ''
    };
  }

  // Calculate circulations list and punctuality
  const circulationsList = fullCircs.map((c: any) => {
    const codi = typeof c === 'string' ? c : (c.codi || c.realCodi || c.id);
    const passagesForCirc = gipPassages.filter(p => p.circulacio_id === codi);
    const onTimePassages = passagesForCirc.filter(p => p.estat === 'en_hora' || p.estat === 'avanc').length;
    const delayedStops = passagesForCirc.filter(p => p.estat === 'retard');
    const totalStops = passagesForCirc.length;
    const rate = totalStops > 0 ? Number(((onTimePassages / totalStops) * 100).toFixed(1)) : null;
    const maxDelaySec = delayedStops.length > 0
      ? Math.max(...delayedStops.map(p => normalizeTimeDiffSec(p.diferencia_segons)))
      : 0;

    return {
      codi,
      linia: c.linia || (codi?.startsWith('F') ? 'S2' : (codi?.startsWith('D') ? 'S1' : 'FGC')),
      inici: c.inici,
      final: c.final,
      sortida: c.sortida,
      arribada: c.arribada,
      cicle: c.cicle,
      train: c.train || c.ut,
      ut: c.ut || c.train,
      status: totalStops > 0 ? 'COMPLETED' : 'PENDING',
      rate,
      totalStops,
      onTimeStops: onTimePassages,
      delayedStopsCount: delayedStops.length,
      maxDelaySec
    };
  });

  const totalPassages = gipPassages.length;
  const onTimePassages = gipPassages.filter(p => p.estat === 'en_hora' || p.estat === 'avanc').length;
  const delayedPassages = gipPassages.filter(p => p.estat === 'retard');
  const overallRate = totalPassages > 0 ? Number(((onTimePassages / totalPassages) * 100).toFixed(1)) : null;
  const maxDelay = delayedPassages.length > 0
    ? Math.max(...delayedPassages.map(p => normalizeTimeDiffSec(p.diferencia_segons)))
    : 0;
  const avgDelay = delayedPassages.length > 0
    ? Math.round(delayedPassages.reduce((acc, p) => acc + normalizeTimeDiffSec(p.diferencia_segons), 0) / delayedPassages.length)
    : 0;

  const reportPayload: AgentReportData = {
    agent,
    shiftData: resolvedShift,
    overallPunctuality: {
      rate: overallRate,
      totalPassages,
      onTimePassages,
      delayedCount: delayedPassages.length,
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
    generateAgentReportPrint(reportPayload);
  }

  return true;
}

