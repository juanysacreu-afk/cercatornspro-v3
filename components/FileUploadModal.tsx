
import React, { useState } from 'react';
import { X, Upload, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
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
    
    // Regex flexible per capturar torns operatius: 
    // Torn (Q/QR), Hora Inici, Hora Fi, ID Empleat, Cognoms, Nom i Flags
    const operativeShiftRegex = /\b([QR][A-Z0-9]{2,5})\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(\d{5,6})\s+([^,]+),\s+(.*)$/;
    
    // Regex per estats (VAC, DIS, etc.)
    const statusRowRegex = /\b(VAC|DIS|DES|FOR|DAG|FORA|DISPONIBLE)\s+(?:MQ\s+)?(?:BA\s+)?(\d{5,6})\s+([^,]+),\s+(.*)$/;

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
        
        const dateMatch = textLine.match(dateRegex);
        if (dateMatch) {
          currentDate = parseDate(dateMatch[1]);
        }

        let match: any = null;
        let isOperative = false;

        // Intentem primer amb el format de torn operatiu
        match = textLine.match(operativeShiftRegex);
        if (match) {
          isOperative = true;
        } else {
          // Si no, provem amb el format d'estat
          match = textLine.match(statusRowRegex);
        }

        if (match) {
          const torn = match[1];
          let horaInici = "00:00";
          let horaFi = "00:00";
          let empId = "";
          let cognoms = "";
          let restOfLine = "";

          if (isOperative) {
            horaInici = match[2];
            horaFi = match[3];
            empId = match[4];
            cognoms = match[5].trim();
            restOfLine = match[6].trim();
          } else {
            empId = match[2];
            cognoms = match[3].trim();
            restOfLine = match[4].trim();
          }
          
          // Processar "restOfLine" per trobar indicadors N/S
          // Busquem 3 lletres S/N separades per espais
          const flagsMatch = restOfLine.match(/^(.*?)\s+([SN])\s+([SN])\s+([SN])(?:\s+[SN])?(?:\s+(.*))?$/);
          
          let nom = restOfLine;
          let f1 = 'N', f2 = 'N', f3 = 'N', obs = "";

          if (flagsMatch) {
            nom = flagsMatch[1].trim();
            f1 = flagsMatch[2];
            f2 = flagsMatch[3];
            f3 = flagsMatch[4];
            obs = flagsMatch[5] ? flagsMatch[5].trim() : "";
          } else {
            // Heurística: si no hi ha flags, busquem si hi ha espais grans que separin observacions
            const parts = restOfLine.split(/\s{2,}/);
            nom = parts[0].trim();
            if (parts.length > 1) {
              obs = parts.slice(1).join(" ").trim();
            }
          }

          extractedData.push({
            torn: torn,
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
      if (extractedData.length === 0) throw new Error("No s'han pogut extreure dades del PDF. Revisa el format.");

      // Netejem dades prèvies
      const { error: deleteError } = await supabase.from('daily_assignments').delete().neq('id', -1);
      if (deleteError) throw deleteError;

      // Inserim per blocs
      const chunkSize = 50;
      for (let i = 0; i < extractedData.length; i += chunkSize) {
        const { error } = await supabase.from('daily_assignments').insert(extractedData.slice(i, i + chunkSize));
        if (error) throw error;
      }
      setStatus('success');
    } catch (error: any) {
      setErrorMessage(error.message || "Error processant el PDF.");
      setStatus('error');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-fgc-grey/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg rounded-[32px] overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-fgc-green/10 rounded-lg text-fgc-green"><FileText size={20} /></div>
            <h2 className="text-xl font-bold text-fgc-grey">Carregar PDF Diari</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X size={20} /></button>
        </div>
        <div className="p-8">
          {status === 'idle' || status === 'processing' ? (
            <div className="space-y-6">
              <div className={`border-2 border-dashed rounded-[24px] p-10 flex flex-col items-center justify-center text-center transition-all ${file ? 'border-fgc-green bg-fgc-green/5' : 'border-gray-200'}`}>
                {status === 'processing' ? (
                  <div className="space-y-4 flex flex-col items-center">
                    <Loader2 className="text-fgc-green animate-spin" size={48} />
                    <p className="font-bold text-fgc-grey text-lg">Analitzant PDF...</p>
                  </div>
                ) : (
                  <>
                    <Upload className="text-gray-300 mb-4" size={48} />
                    {file ? (
                      <div>
                        <p className="font-bold text-fgc-grey">{file.name}</p>
                        <button onClick={() => setFile(null)} className="text-xs text-red-500 font-bold mt-2">Canviar fitxer</button>
                      </div>
                    ) : (
                      <>
                        <input type="file" id="pdf-upload" className="hidden" accept="application/pdf" onChange={handleFileChange} />
                        <label htmlFor="pdf-upload" className="bg-fgc-grey text-white px-8 py-3 rounded-xl font-bold cursor-pointer hover:bg-fgc-dark transition-all">SELECCIONAR PDF</label>
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
              <div className="w-20 h-20 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto"><CheckCircle2 size={48} /></div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-fgc-grey">Dades Carregades</h3>
                <p className="text-sm font-medium text-gray-500">S'ha actualitzat tota la informació de maquinistes.</p>
              </div>
              <button onClick={onClose} className="w-full bg-fgc-grey text-white py-4 rounded-xl font-bold">TANCAR</button>
            </div>
          ) : (
            <div className="text-center py-8 space-y-6">
              <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto"><AlertCircle size={48} /></div>
              <div className="space-y-2">
                <p className="text-red-500 font-bold uppercase tracking-tight">S'ha produït un error</p>
                <p className="text-xs text-gray-400">{errorMessage}</p>
              </div>
              <button onClick={() => setStatus('idle')} className="w-full bg-fgc-grey text-white py-4 rounded-xl font-bold">REINTENTAR</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FileUploadModal;
