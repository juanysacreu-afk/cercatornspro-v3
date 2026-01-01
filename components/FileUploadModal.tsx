
import React, { useState } from 'react';
import { X, Upload, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '../supabaseClient.ts';
import * as pdfjsLib from 'pdfjs-dist';

// Use unpkg as it consistently hosts all versions of pdfjs-dist including the latest ones.
// We use the version property from the library to ensure matching versions between the main lib and the worker.
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
    // Converteix DD.MM.YY a YYYY-MM-DD per Supabase
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

    // Regex per trobar la data al PDF: Data: 30.12.25
    const dateRegex = /Data:\s*(\d{2}\.\d{2}\.\d{2})/;
    
    // Regex per torns (Q301, QRR4, etc)
    // Grup 1: Torn, Grup 2: Inici, Grup 3: Fi, Grup 4: Empleat ID, Grup 5: Nom, 
    // Grup 6-8: Abs.parc.C, Dta, Dpa (S/N), Grup 9: Observacions
    const shiftRegex = /([QR][A-Z0-9]{3,4})\s+(?:\d+\s+)?(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(\d{5,6})\s+(.*?)(?:\s+([SN])\s+([SN])\s+([SN]))?(?:\s+[SN])?(?:\s+(.*))?$/;
    
    // Regex per estats (FOR, VAC, DAG, DES, DIS)
    const statusRegex = /^([A-Z]{3})\s+(?:MQ\s+)?(?:BA\s+)?(\d{5,6})\s+(.*?)(?:\s+([SN])\s+([SN])\s+([SN]))?(?:\s+[SN])?(?:\s+(.*))?$/;

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
        
        // Extreure data de la pàgina si no la tenim
        const dateMatch = textLine.match(dateRegex);
        if (dateMatch) {
          currentDate = parseDate(dateMatch[1]);
        }

        const shiftMatch = textLine.match(shiftRegex);
        if (shiftMatch) {
          extractedData.push({
            torn: shiftMatch[1],
            hora_inici: shiftMatch[2],
            hora_fi: shiftMatch[3],
            empleat_id: shiftMatch[4],
            nom: shiftMatch[5].trim(),
            abs_parc_c: shiftMatch[6] || 'N',
            dta: shiftMatch[7] || 'N',
            dpa: shiftMatch[8] || 'N',
            observacions: shiftMatch[9] ? shiftMatch[9].trim() : "",
            data_servei: currentDate
          });
          return;
        }

        const statusMatch = textLine.match(statusRegex);
        if (statusMatch) {
          extractedData.push({
            torn: statusMatch[1],
            hora_inici: "00:00",
            hora_fi: "00:00",
            empleat_id: statusMatch[2],
            nom: statusMatch[3].trim(),
            abs_parc_c: statusMatch[4] || 'N',
            dta: statusMatch[5] || 'N',
            dpa: statusMatch[6] || 'N',
            observacions: statusMatch[7] ? statusMatch[7].trim() : "",
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
        throw new Error("No s'han pogut extreure dades del PDF. Verifica el format.");
      }

      // Netejem dades anteriors
      const { error: deleteError } = await supabase.from('daily_assignments').delete().neq('id', -1);
      if (deleteError) throw deleteError;

      // Inserim en blocs per evitar errors de timeout o de límit de mida
      const chunkSize = 50;
      for (let i = 0; i < extractedData.length; i += chunkSize) {
        const chunk = extractedData.slice(i, i + chunkSize);
        const { error: insertError } = await supabase
          .from('daily_assignments')
          .insert(chunk);
        if (insertError) throw insertError;
      }
      
      setStatus('success');
    } catch (error: any) {
      console.error("Error processant PDF:", error);
      setErrorMessage(error.message || "Error durant l'extracció de dades.");
      setStatus('error');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-fgc-grey/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white w-full max-w-lg rounded-[32px] overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-fgc-green/10 rounded-lg text-fgc-green">
              <FileText size={20} />
            </div>
            <h2 className="text-xl font-bold text-fgc-grey">Carregar PDF Diari</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X size={20} />
          </button>
        </div>

        <div className="p-8">
          {status === 'idle' || status === 'processing' ? (
            <div className="space-y-6">
              <div 
                className={`border-2 border-dashed rounded-[24px] p-10 flex flex-col items-center justify-center text-center ${
                  file ? 'border-fgc-green bg-fgc-green/5' : 'border-gray-200'
                }`}
              >
                {status === 'processing' ? (
                  <div className="space-y-4 flex flex-col items-center">
                    <Loader2 className="text-fgc-green animate-spin" size={48} />
                    <p className="font-bold text-fgc-grey text-lg">Processant...</p>
                    <p className="text-xs text-gray-400">Extreient torns, data i indicadors N/S</p>
                  </div>
                ) : (
                  <>
                    <Upload className="text-gray-300 mb-4" size={48} />
                    {file ? (
                      <div>
                        <p className="font-bold text-fgc-grey">{file.name}</p>
                        <button onClick={() => setFile(null)} className="text-xs text-red-500 font-bold mt-2">Eliminar</button>
                      </div>
                    ) : (
                      <>
                        <input type="file" id="pdf-upload" className="hidden" accept="application/pdf" onChange={handleFileChange} />
                        <label htmlFor="pdf-upload" className="bg-fgc-grey text-white px-8 py-3 rounded-xl font-bold cursor-pointer hover:bg-fgc-dark transition-all">SELECCIONAR PDF</label>
                        <p className="mt-4 text-[10px] text-gray-400 uppercase font-black tracking-widest">Format: Llistat torns Servei Diari</p>
                      </>
                    )}
                  </>
                )}
              </div>

              {file && status === 'idle' && (
                <button onClick={handleUpload} className="w-full bg-fgc-green text-fgc-grey py-4 rounded-xl font-black text-lg shadow-lg hover:brightness-110 active:scale-95 transition-all">
                  PUJAR DADES
                </button>
              )}
            </div>
          ) : status === 'success' ? (
            <div className="text-center py-8 space-y-6">
              <div className="w-20 h-20 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 size={48} />
              </div>
              <h3 className="text-2xl font-black text-fgc-grey">Actualitzat correctament</h3>
              <p className="text-sm text-gray-500">S'han carregat els torns amb data i flags N/S.</p>
              <button onClick={onClose} className="w-full bg-fgc-grey text-white py-4 rounded-xl font-bold">TANCAR</button>
            </div>
          ) : (
            <div className="text-center py-8 space-y-6">
              <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle size={48} />
              </div>
              <p className="text-red-500 font-bold">{errorMessage}</p>
              <button onClick={() => setStatus('idle')} className="w-full bg-fgc-grey text-white py-4 rounded-xl font-bold">REINTENTAR</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FileUploadModal;
