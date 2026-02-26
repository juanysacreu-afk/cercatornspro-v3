/**
 * utils/export.ts
 * Centralised export utilities for NEXUS dashboard and views.
 * Previously `exportDashboardCSV` lived inline in DashboardView.tsx — moved here
 * for separation of concerns and reuse (audit: Bloc A.5 🟡 refactorització 2).
 */

interface DashboardKPIsSnapshot {
    serviceCoverage: number;
    planningCoverage: number;
    activeTrains: number;
    scheduledTrains: number;
    totalPersonnel: number;
    assignedPersonnel: number;
    activePersonnel: number;
    reserveAvailable: number;
    reserveTotal: number;
    availableTrainUnits: number;
    brokenTrainUnits: number;
}

interface AlertExport {
    severity: string;
    title: string;
    subtitle: string;
}

interface ReservePersonnel {
    torn: string;
    cognoms: string;
    nom: string;
}

interface ReserveExport {
    station: string;
    personnel: ReservePersonnel[];
}

/**
 * Generates and triggers the download of a CSV summary of the current
 * dashboard operational state (KPIs, alerts, reserve personnel).
 */
export function exportDashboardCSV(
    kpis: DashboardKPIsSnapshot,
    alerts: AlertExport[],
    reserves: ReserveExport[]
): void {
    const now = new Date();
    const lines: string[] = [
        'NEXUS \u2014 Resum Operacional',
        `Data,${now.toLocaleDateString('ca-ES')}`,
        `Hora exportaci\u00f3,${now.toLocaleTimeString('ca-ES')}`,
        '',
        '--- KPIs ---',
        `Cobertura servei,${kpis.serviceCoverage}%`,
        `Planificaci\u00f3 di\u00e0ria,${kpis.planningCoverage}%`,
        `Circulacions actives,${kpis.activeTrains}`,
        `Circulacions programades,${kpis.scheduledTrains}`,
        `Total torns,${kpis.totalPersonnel}`,
        `Torns assignats,${kpis.assignedPersonnel}`,
        `Personal actiu ara,${kpis.activePersonnel}`,
        `Reserves disponibles,${kpis.reserveAvailable}`,
        `Unitats operatives,${kpis.availableTrainUnits}`,
        `Unitats avar\u00efades,${kpis.brokenTrainUnits}`,
        '',
        '--- ALERTES ---',
        'Severitat,T\u00edtol,Detall',
        ...alerts.map(a => `${a.severity},"${a.title}","${a.subtitle}"`),
        '',
        '--- RESERVES ---',
        'Estaci\u00f3,Torn,Cognom,Nom',
        ...reserves.flatMap(r =>
            r.personnel.map(p => `${r.station},"${p.torn}","${p.cognoms}","${p.nom}"`)
        ),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nexus-resum-${now.toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}
