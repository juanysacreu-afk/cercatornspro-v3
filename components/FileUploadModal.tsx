import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, FileText, Loader2, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '../supabaseClient.ts';
import { logLopdAccess } from '../utils/auditLogger';
import { db } from '../utils/offlineDb';
import { getServiceForDateAsync, calendarCodeToFilterCode, getServiceToday } from '../utils/serviceCalendar';
import { getShortTornId, isServiceVisible } from '../utils/stations';
import { useToast } from './ToastProvider';
import { feedback } from '../utils/feedback';
import * as pdfjsLib from 'pdfjs-dist';

// Use unpkg for matching worker version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface FileUploadModalProps {
  onClose: () => void;
}

interface UncoveredShiftInfo {
  shiftId: string;
  shortId: string;
  inici_torn: string;
  final_torn: string;
  dependencia: string;
  wasPreviouslyCovered: boolean;
}

const EXCLUDED_STATUS_CODES = new Set([
  'VAC', 'DIS', 'DES', 'FOR', 'DAG', 'FORA', 'AJN', 'FESTES', 'DISPONIBLE', 'FORA DE SERVEI', 'RMD'
]);

const normalizeShiftCode = (rawTorn: string): { cleanedTorn: string; tipusTorn: string | null } => {
  let cleanedTorn = rawTorn.trim().toUpperCase();
  let tipusTorn: string | null = null;

  // Ex: 107R -> Q107 (Reducció), 032T -> Q032 (Torn)
  const rtNumericMatch = cleanedTorn.match(/^Q?(\d{3})([RT])$/);
  // Ex: QN2R -> QN02 (Reducció), QP2R -> QP02
  const rtLetterMatch = cleanedTorn.match(/^Q?([FNPS])0?(\d)([RT])$/);

  if (rtNumericMatch) {
    cleanedTorn = `Q${rtNumericMatch[1]}`;
    tipusTorn = rtNumericMatch[2] === 'R' ? 'Reducció' : 'Torn';
  } else if (rtLetterMatch) {
    cleanedTorn = `Q${rtLetterMatch[1]}0${rtLetterMatch[2]}`;
    tipusTorn = rtLetterMatch[3] === 'R' ? 'Reducció' : 'Torn';
  } else if (/^\d+$/.test(cleanedTorn)) {
    cleanedTorn = `Q${cleanedTorn}`;
  }

  return { cleanedTorn, tipusTorn };
};

const FileUploadModal: React.FC<FileUploadModalProps> = ({ onClose }) => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [lastUploadDate, setLastUploadDate] = useState<string | null>(null);
  const [uncoveredShifts, setUncoveredShifts] = useState<UncoveredShiftInfo[]>([]);
  const { showToast } = useToast();

  const fetchLastUploadDate = async () => {
    try {
      const { data } = await supabase
        .from('daily_assignments')
        .select('data_servei')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setLastUploadDate(data.data_servei);
      }
    } catch (e) {
      console.warn('Error fetching last upload date', e);
    }
  };

  React.useEffect(() => {
    fetchLastUploadDate();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setUncoveredShifts([]);
    }
  };

  const parseDate = (dateStr: string): string => {
    const parts = dateStr.split('.');
    if (parts.length === 3) {
      const year = `20${parts[2]}`;
      const month = parts[1].padStart(2, '0');
      const day = parts[0].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return dateStr;
  };

  const parsePDF = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const extractedData: any[] = [];
    const explicitUncoveredInPdf: Map<string, { inici: string; fi: string }> = new Map();
    let currentDate: string | null = null;

    const dateRegex = /Data:\s*(\d{2}\.\d{2}\.\d{2})/;

    // Regex per Torns Operatius (Q301, 107R, QN2R, etc.) amb empleat assignat
    const operativeShiftRegex = /([QR0-9][A-Z0-9]{2,5})\s+(?:\d+\s+)?(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(\d{5,8})\s+([^,]+),\s+(.*)$/;

    // Regex per Torns Operatius que apareguin al PDF amb horari però SENSE maquinista assignat
    const unassignedOperativeShiftRegex = /([QR0-9][A-Z0-9]{2,5})\s+(?:\d+\s+)?(\d{2}:\d{2})\s+(\d{2}:\d{2})\s*$/;

    // Regex per Estats de personal (VAC, DIS, DES, FOR, DAG, etc.) sense horaris
    const statusRowRegex = /^(VAC|DIS|DES|FOR|DAG|FORA|AJN|FESTES|DISPONIBLE|FORA DE SERVEI)\s+(?:MQ\s+)?(?:BA\s+)?(?:[A-Z]{2}\s+)?(\d{5,8})\s+([^,]+),\s+(.*)$/;

    // Regex per Alteracions (Darrera pàgina del PDF)
    const alterationRowRegex = /^(\d{5,8})\s+([^,]+),\s+([^\s]+)\s+([QR0-9][A-Z0-9]{2,5})\s+([SN])\s+([SN])\s+([SN])/;

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      const items = textContent.items as any[];
      const lineMap: { [key: number]: any[] } = {};

      items.forEach((item) => {
        const y = Math.round(item.transform[5]);
        if (!lineMap[y]) lineMap[y] = [];
        lineMap[y].push(item);
      });

      const sortedY = Object.keys(lineMap).map(Number).sort((a, b) => b - a);

      sortedY.forEach(y => {
        const lineItems = lineMap[y].sort((a, b) => a.transform[4] - b.transform[4]);
        const textLine = lineItems.map(item => item.str).join(" ").replace(/\s+/g, " ").trim();

        // 1. Cercar data del document
        const dateMatch = textLine.match(dateRegex);
        if (dateMatch) {
          currentDate = parseDate(dateMatch[1]);
        }

        // 2. Identificar tipus de línia
        let match: any = null;
        let lineType: 'OPERATIVE' | 'STATUS' | 'ALTERATION' | null = null;

        const opMatch = textLine.match(operativeShiftRegex);
        if (opMatch) {
          match = opMatch;
          lineType = 'OPERATIVE';
        } else {
          const altMatch = textLine.match(alterationRowRegex);
          if (altMatch) {
            match = altMatch;
            lineType = 'ALTERATION';
          } else {
            const statMatch = textLine.match(statusRowRegex);
            if (statMatch) {
              match = statMatch;
              lineType = 'STATUS';
            } else {
              const unassignedMatch = textLine.match(unassignedOperativeShiftRegex);
              if (unassignedMatch) {
                const { cleanedTorn } = normalizeShiftCode(unassignedMatch[1]);
                explicitUncoveredInPdf.set(cleanedTorn, {
                  inici: unassignedMatch[2],
                  fi: unassignedMatch[3]
                });
              }
            }
          }
        }

        if (match && lineType) {
          let cleanedTorn = "";
          let tipusTorn: string | null = null;
          let horaInici = "00:00";
          let horaFi = "23:59";
          let empId = "";
          let cognoms = "";
          let nom = "";
          let restOfLine = "";
          let f1 = 'N', f2 = 'N', f3 = 'N', obs = "";

          if (lineType === 'OPERATIVE') {
            cleanedTorn = match[1];
            horaInici = match[2];
            horaFi = match[3];
            empId = match[4];
            cognoms = match[5].trim();
            restOfLine = match[6].trim();
          } else if (lineType === 'ALTERATION') {
            empId = match[1];
            cognoms = match[2].trim();
            nom = match[3].trim();
            cleanedTorn = match[4];
            f1 = match[5];
            f2 = match[6];
            f3 = match[7];
            tipusTorn = "Alteració";
          } else {
            // STATUS
            cleanedTorn = match[1];
            empId = match[2];
            cognoms = match[3].trim();
            restOfLine = match[4].trim();
          }

          if (lineType !== 'ALTERATION') {
            const normalized = normalizeShiftCode(cleanedTorn);
            cleanedTorn = normalized.cleanedTorn;
            tipusTorn = normalized.tipusTorn;

            const flagsPattern = /\s+([SN])\s+([SN])\s+([SN])(?:\s+[SN])?(?:\s+(.*))?$/;
            const flagsMatch = restOfLine.match(flagsPattern);

            if (flagsMatch) {
              nom = restOfLine.substring(0, restOfLine.indexOf(flagsMatch[0])).trim();
              f1 = flagsMatch[1];
              f2 = flagsMatch[2];
              f3 = flagsMatch[3];
              obs = flagsMatch[4] ? flagsMatch[4].trim() : "";
            } else {
              const parts = restOfLine.split(/\s{2,}/);
              nom = parts[0].trim();
              if (parts.length > 1) {
                obs = parts.slice(1).join(" ").trim();
              }
            }
          } else {
            const normalized = normalizeShiftCode(cleanedTorn);
            cleanedTorn = normalized.cleanedTorn;
          }

          extractedData.push({
            torn: cleanedTorn,
            tipus_torn: tipusTorn,
            hora_inici: horaInici,
            hora_fi: horaFi,
            empleat_id: empId,
            nom: nom,
            cognoms: cognoms,
            abs_parc_c: f1,
            dta: f2,
            dpa: f3,
            observacions: obs,
            data_servei: currentDate
          });
        }
      });
    }

    return { extractedData, explicitUncoveredInPdf, currentDate };
  };

  const detectUncoveredShifts = async (
    extractedData: any[],
    explicitUncoveredInPdf: Map<string, { inici: string; fi: string }>,
    targetDate: string | null,
    previousRows: any[]
  ): Promise<UncoveredShiftInfo[]> => {
    // 1. Determinar torns operatius que estaven coberts en la càrrega anterior (si era del mateix dia)
    const previouslyCoveredSet = new Set<string>();
    const previousShiftMeta = new Map<string, { inici: string; fi: string }>();
    previousRows.forEach(r => {
      if (!r.torn) return;
      const code = String(r.torn).trim().toUpperCase();
      if (EXCLUDED_STATUS_CODES.has(code)) return;
      if (!targetDate || !r.data_servei || r.data_servei === targetDate) {
        const shortCode = getShortTornId(code);
        previouslyCoveredSet.add(shortCode);
        if (r.hora_inici && r.hora_fi) {
          previousShiftMeta.set(shortCode, { inici: r.hora_inici, fi: r.hora_fi });
        }
      }
    });

    // 2. Determinar codi de servei teòric per a la data del PDF
    let serviceFilter = getServiceToday();
    if (targetDate) {
      const parsedDate = new Date(`${targetDate}T12:00:00`);
      if (!isNaN(parsedDate.getTime())) {
        const rawCode = await getServiceForDateAsync(parsedDate);
        serviceFilter = calendarCodeToFilterCode(rawCode);
      }
    }

    // 3. Obtenir els torns teòrics de la taula shifts per a aquest servei
    const { data: allShifts } = await supabase
      .from('shifts')
      .select('id, servei, inici_torn, final_torn, dependencia');

    const serviceShifts = (allShifts || []).filter(s =>
      isServiceVisible(s.servei, serviceFilter) ||
      (s.id && s.id.toUpperCase().startsWith('QR') && isServiceVisible(s.servei, serviceFilter))
    );

    // 4. Comprovar quins torns estan realment coberts al nou PDF
    const isShiftCoveredInNewPdf = (shiftId: string, shortId: string): boolean => {
      const sUpper = shiftId.toUpperCase();
      const shortUpper = shortId.toUpperCase();

      const hasDirectDriver = extractedData.some(a => {
        const aTorn = String(a.torn || '').trim().toUpperCase();
        const aShort = getShortTornId(aTorn);
        const hasEmployee = Boolean(a.empleat_id && String(a.empleat_id).trim().length > 0);
        return hasEmployee && (aTorn === sUpper || aTorn === shortUpper || aShort === shortUpper);
      });

      if (hasDirectDriver) return true;

      const hasExplicitCover = extractedData.some(a => {
        if (!a.observacions) return false;
        const obs = String(a.observacions).toUpperCase();
        return (
          obs.includes(`COBREIX ${shortUpper}`) ||
          obs.includes(`COBREIX ${sUpper}`) ||
          obs.includes(`COBRINT ${shortUpper}`) ||
          obs.includes(`COBRINT ${sUpper}`) ||
          obs.includes(`COBREIX: ${shortUpper}`)
        );
      });

      return hasExplicitCover;
    };

    const uncoveredMap = new Map<string, UncoveredShiftInfo>();

    // A) Comprovar tots els torns teòrics del servei
    serviceShifts.forEach(s => {
      const shortId = getShortTornId(s.id).toUpperCase();
      if (!isShiftCoveredInNewPdf(s.id, shortId)) {
        uncoveredMap.set(shortId, {
          shiftId: s.id,
          shortId,
          inici_torn: s.inici_torn || '--:--',
          final_torn: s.final_torn || '--:--',
          dependencia: s.dependencia || 'CSO',
          wasPreviouslyCovered: previouslyCoveredSet.has(shortId)
        });
      }
    });

    // B) Comprovar si algun torn que estava cobert al PDF anterior del mateix dia ha desaparegut
    previouslyCoveredSet.forEach(shortId => {
      if (!uncoveredMap.has(shortId) && !isShiftCoveredInNewPdf(shortId, shortId)) {
        const meta = previousShiftMeta.get(shortId);
        uncoveredMap.set(shortId, {
          shiftId: shortId,
          shortId,
          inici_torn: meta?.inici || '--:--',
          final_torn: meta?.fi || '--:--',
          dependencia: 'CSO',
          wasPreviouslyCovered: true
        });
      }
    });

    // C) Comprovar si el propi PDF contenia línies de torn sense maquinista
    explicitUncoveredInPdf.forEach((times, shortId) => {
      const upper = shortId.toUpperCase();
      if (!uncoveredMap.has(upper) && !isShiftCoveredInNewPdf(upper, upper)) {
        uncoveredMap.set(upper, {
          shiftId: upper,
          shortId: upper,
          inici_torn: times.inici,
          final_torn: times.fi,
          dependencia: 'CSO',
          wasPreviouslyCovered: previouslyCoveredSet.has(upper)
        });
      }
    });

    return Array.from(uncoveredMap.values()).sort((a, b) => a.shortId.localeCompare(b.shortId));
  };

  const handleUpload = async () => {
    if (!file) return;
    setStatus('processing');
    setUncoveredShifts([]);
    try {
      const { extractedData, explicitUncoveredInPdf, currentDate } = await parsePDF(file);
      if (extractedData.length === 0) {
        throw new Error("No s'han pogut identificar dades vàlides al PDF. Comprova que el format coincideix amb el llistat de torns.");
      }

      const targetDate = currentDate || extractedData[0]?.data_servei || null;

      // Llegim els torns anteriors ÚNICAMENT per detectar si algun torn que abans estava cobert ha quedat ara descobert.
      // MAI es restauren torns anteriors: si un torn no ve al nou PDF, queda com a descobert.
      const { data: existingRows } = await supabase
        .from('daily_assignments')
        .select('torn, hora_inici, hora_fi, data_servei');

      // 1. Esborrem totes les assignacions anteriors a Supabase (sense restaurar-les mai)
      const { error: deleteError } = await supabase.from('daily_assignments').delete().gte('id', 0);
      if (deleteError) throw deleteError;

      // 2. Inserim exclusivament les dades del nou PDF per blocs
      const chunkSize = 50;
      for (let i = 0; i < extractedData.length; i += chunkSize) {
        const { error } = await supabase.from('daily_assignments').insert(extractedData.slice(i, i + chunkSize));
        if (error) throw error;
      }

      // 3. Netegem la memòria cau local (IndexedDB) perquè no quedi cap torn antic cobert
      try {
        await db.daily_assignments.clear();
        await db.daily_assignments.bulkPut(extractedData);
      } catch (cacheErr) {
        console.warn('Error sincronitzant memòria cau local:', cacheErr);
      }

      // 4. Detectem immediatament si falten torns per cobrir
      const missingShifts = await detectUncoveredShifts(
        extractedData,
        explicitUncoveredInPdf,
        targetDate,
        existingRows || []
      );
      setUncoveredShifts(missingShifts);

      // 5. Notifiquem a totes les vistes (Monitor CSO i Malla Operativa) perquè s'actualitzin a l'instant
      window.dispatchEvent(new CustomEvent('fgc:assignments-updated'));

      // 6. Avisem imperativament si hi ha torns sense cobrir
      if (missingShifts.length > 0) {
        feedback.error();
        const shiftList = missingShifts.map(s => s.shortId).join(', ');
        showToast(
          `🚨 ATENCIÓ: S'han detectat ${missingShifts.length} torn(s) SENSE COBRIR al PDF (${shiftList})`,
          'error'
        );
      } else {
        feedback.success();
        showToast('Servei actualitzat: tots els torns estan coberts.', 'success');
      }

      logLopdAccess('UPLOAD_DAILY_ASSIGNMENTS', undefined, {
        file_name: file.name,
        service_date: targetDate,
        records_count: extractedData.length,
        uncovered_shifts_count: missingShifts.length,
        uncovered_shifts: missingShifts.map(s => s.shortId)
      });

      setStatus('success');
      fetchLastUploadDate();
    } catch (error: any) {
      console.error("Error processant fitxer:", error);
      setErrorMessage(error.message || "S'ha produït un error inesperat durant la càrrega.");
      setStatus('error');
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-fgc-grey/60 backdrop-blur-md animate-in fade-in duration-500 ease-out-expo" onClick={onClose} />
      <div className="relative bg-white dark:bg-fgc-grey w-full max-w-lg rounded-[32px] overflow-hidden shadow-2xl border border-gray-100 dark:border-white/10 animate-modal-premium">
        <div className="p-6 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-fgc-green/10 rounded-lg text-fgc-green"><Download size={20} /></div>
            <div>
              <h2 id="modal-title" className="text-xl font-bold text-fgc-grey dark:text-white">Carregar PDF Diari</h2>
              {lastUploadDate && (
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5">
                  Última càrrega: <span className="text-fgc-green">{new Date(lastUploadDate).toLocaleDateString('ca-ES')}</span>
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors"><X size={20} className="dark:text-gray-400" /></button>
        </div>

        <div className="p-8">
          {status === 'idle' || status === 'processing' ? (
            <div className="space-y-6">
              <div className={`border-2 border-dashed rounded-[24px] p-10 flex flex-col items-center justify-center text-center transition-all ${file ? 'border-fgc-green bg-fgc-green/5' : 'border-gray-200 dark:border-gray-800'}`}>
                {status === 'processing' ? (
                  <div className="space-y-4 flex flex-col items-center">
                    <Loader2 className="text-fgc-green animate-spin" size={48} />
                    <p className="font-bold text-fgc-grey dark:text-white text-lg">Analitzant document...</p>
                    <p className="text-xs text-gray-400">Extreient horaris, personal i verificant torns descoberts</p>
                  </div>
                ) : (
                  <>
                    <FileText className="text-gray-300 dark:text-gray-700 mb-4" size={48} />
                    {file ? (
                      <div>
                        <p className="font-bold text-fgc-grey dark:text-white">{file.name}</p>
                        <button onClick={() => setFile(null)} className="text-xs text-red-500 font-bold mt-2">Canviar fitxer</button>
                      </div>
                    ) : (
                      <>
                        <input type="file" id="pdf-upload" className="hidden" accept="application/pdf" onChange={handleFileChange} />
                        <label htmlFor="pdf-upload" className="bg-fgc-grey dark:bg-black text-white px-8 py-3 rounded-xl font-bold cursor-pointer hover:bg-fgc-dark transition-all">SELECCIONAR PDF</label>
                        <p className="mt-4 text-[10px] text-gray-400 uppercase tracking-widest font-bold">Admet llistat de torns i alteracions</p>
                      </>
                    )}
                  </>
                )}
              </div>
              {file && status === 'idle' && (
                <button onClick={handleUpload} className="w-full bg-fgc-green text-fgc-grey py-4 rounded-xl font-black text-lg shadow-lg hover:brightness-110 active:scale-95 transition-all uppercase tracking-widest">ACTUALITZAR SERVEI</button>
              )}
            </div>
          ) : status === 'success' ? (
            <div className="text-center py-4 space-y-6">
              {uncoveredShifts.length > 0 ? (
                <>
                  <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-full flex items-center justify-center mx-auto shadow-inner animate-pulse">
                    <AlertTriangle size={48} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-black text-red-600 dark:text-red-400 uppercase tracking-tight">
                      Atenció: {uncoveredShifts.length} {uncoveredShifts.length === 1 ? 'Torn Sense Cobrir' : 'Torns Sense Cobrir'}
                    </h3>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-300">
                      S'ha carregat el nou PDF però els següents torns no tenen maquinista assignat (descoberts):
                    </p>
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-2 text-left bg-red-50/70 dark:bg-red-950/30 border border-red-200 dark:border-red-500/30 rounded-2xl p-4">
                    {uncoveredShifts.map((u) => (
                      <div
                        key={u.shiftId}
                        className="flex items-center justify-between gap-2 bg-white dark:bg-black/40 px-3.5 py-2.5 rounded-xl border border-red-100 dark:border-red-500/20 shadow-sm"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-black text-xs tracking-wider">
                            {u.shortId}
                          </span>
                          <div>
                            <p className="text-xs font-extrabold text-fgc-grey dark:text-white">
                              Dep: {u.dependencia} · {u.inici_torn} – {u.final_torn}
                            </p>
                            <p className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase">
                              {u.wasPreviouslyCovered ? '⚠️ Abans cobert · Ara descobert al nou PDF' : '🔴 Torn descobert (sense maquinista)'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 bg-green-50 dark:bg-green-900/20 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-inner"><CheckCircle2 size={48} /></div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-black text-fgc-grey dark:text-white">Dades Carregades</h3>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      S'han importat correctament tots els torns del document. Tots els torns del servei estan coberts.
                    </p>
                  </div>
                </>
              )}
              <button onClick={onClose} className="w-full bg-fgc-grey dark:bg-black text-white py-4 rounded-xl font-bold hover:brightness-110 transition-all">TANCAR</button>
            </div>
          ) : (
            <div className="text-center py-8 space-y-6">
              <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-full flex items-center justify-center mx-auto"><AlertCircle size={48} /></div>
              <div className="space-y-2">
                <p className="text-red-500 font-bold uppercase tracking-tight">S'ha produït un error</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{errorMessage}</p>
              </div>
              <button onClick={() => setStatus('idle')} className="w-full bg-fgc-grey dark:bg-black text-white py-4 rounded-xl font-bold">REINTENTAR</button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default FileUploadModal;