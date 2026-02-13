import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '../supabaseClient.ts';
import * as pdfjsLib from 'pdfjs-dist';

// Use unpkg for matching worker version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface FileUploadModalProps {
  onClose: () => void;
}

const FileUploadModal: React.FC<FileUploadModalProps> = ({ onClose }) => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
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
    let currentDate: string | null = null;

    const dateRegex = /Data:\s*(\d{2}\.\d{2}\.\d{2})/;

    // Regex per Torns Operatius (Q301, 107R, etc.) que contenen dos horaris HH:MM HH:MM
    // Captura: Torn, (Opcional Variant), Inici, Fi, ID Empleat, Cognoms, resta...
    const operativeShiftRegex = /([QR0-9][A-Z0-9]{2,5})\s+(?:\d+\s+)?(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(\d{5,8})\s+([^,]+),\s+(.*)$/;

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

        // Provar primer torn operatiu (té horaris)
        const opMatch = textLine.match(operativeShiftRegex);
        if (opMatch) {
          match = opMatch;
          lineType = 'OPERATIVE';
        } else {
          // Provar alteració
          const altMatch = textLine.match(alterationRowRegex);
          if (altMatch) {
            match = altMatch;
            lineType = 'ALTERATION';
          } else {
            // Provar estat (VAC, DIS, etc.)
            const statMatch = textLine.match(statusRowRegex);
            if (statMatch) {
              match = statMatch;
              lineType = 'STATUS';
            }
          }
        }

        if (match && lineType) {
          let cleanedTorn = "";
          let tipusTorn = null;
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

          // Normalització del codi del torn (Ex: 107R -> Q107 amb tipus Reducció)
          if (lineType !== 'ALTERATION') {
            const rtMatch = cleanedTorn.match(/^(\d+)([RT])$/);
            if (rtMatch) {
              cleanedTorn = 'Q' + rtMatch[1];
              tipusTorn = rtMatch[2] === 'R' ? 'Reducció' : 'Torn';
            } else if (/^\d+$/.test(cleanedTorn)) {
              cleanedTorn = 'Q' + cleanedTorn;
            }

            // Extreure Nom i Flags de la resta de la línia (per OPERATIVE i STATUS)
            // Busquem patrons N o S aïllats que indiquen els flags Abs.parc.C, Dta, Dpa...
            const flagsPattern = /\s+([SN])\s+([SN])\s+([SN])(?:\s+[SN])?(?:\s+(.*))?$/;
            const flagsMatch = restOfLine.match(flagsPattern);

            if (flagsMatch) {
              nom = restOfLine.substring(0, restOfLine.indexOf(flagsMatch[0])).trim();
              f1 = flagsMatch[1];
              f2 = flagsMatch[2];
              f3 = flagsMatch[3];
              obs = flagsMatch[4] ? flagsMatch[4].trim() : "";
            } else {
              // Si no hi ha flags clars, agafem tot el que queda com a nom i mirem si hi ha dobles espais per a observacions
              const parts = restOfLine.split(/\s{2,}/);
              nom = parts[0].trim();
              if (parts.length > 1) {
                obs = parts.slice(1).join(" ").trim();
              }
            }
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

    return extractedData;
  };

  const handleUpload = async () => {
    if (!file) return;
    setStatus('processing');
    try {
      const extractedData = await parsePDF(file);
      if (extractedData.length === 0) {
        throw new Error("No s'han pogut identificar dades vàlides al PDF. Comprova que el format coincideix amb el llistat de torns.");
      }

      // Netejem dades existents abans de la nova càrrega
      const { error: deleteError } = await supabase.from('daily_assignments').delete().not('id', 'is', null);
      if (deleteError) throw deleteError;

      // Inserció per blocs per evitar límits de payload
      const chunkSize = 50;
      for (let i = 0; i < extractedData.length; i += chunkSize) {
        const { error } = await supabase.from('daily_assignments').insert(extractedData.slice(i, i + chunkSize));
        if (error) throw error;
      }

      setStatus('success');
    } catch (error: any) {
      console.error("Error processant fitxer:", error);
      setErrorMessage(error.message || "S'ha produït un error inesperat durant la càrrega.");
      setStatus('error');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-fgc-grey/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 w-full max-w-lg rounded-[32px] overflow-hidden shadow-2xl border border-gray-100 dark:border-white/10 animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-fgc-green/10 rounded-lg text-fgc-green"><Download size={20} /></div>
            <h2 className="text-xl font-bold text-fgc-grey dark:text-white">Carregar PDF Diari</h2>
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
                    <p className="text-xs text-gray-400">Extreient horaris, personal i alteracions</p>
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
            <div className="text-center py-8 space-y-6">
              <div className="w-20 h-20 bg-green-50 dark:bg-green-900/20 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-inner"><CheckCircle2 size={48} /></div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-fgc-grey dark:text-white">Dades Carregades</h3>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">S'han importat correctament tots els torns del document, incloent-hi els operatius i les alteracions.</p>
              </div>
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