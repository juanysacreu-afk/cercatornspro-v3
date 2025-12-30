
import React, { useState } from 'react';
import { X, Upload, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import * as pdfjsLib from 'pdfjs-dist';

// Configurar el worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.mjs`;

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

  const parsePDF = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const extractedData: any[] = [];

    /**
     * REGEX PRINCIPAL PER A TORNS ACTIUS (Pag 1-3)
     * Grups:
     * 1: Dependència (opcional)
     * 2: Codi Torn (Q... o QR...)
     * 3: Hora Inici (HH:mm)
     * 4: Hora Fi (HH:mm)
     * 5: Nòmina (5-6 dígits)
     * 6: Nom Complet
     * 7: Observacions (opcional)
     */
    const shiftRegex = /^(?:.*?)\s*([QR][A-Z0-9]{3,4})\s+(?:\d+\s+)?(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(\d{5,6})\s+(.*?)(?:\s+[SN]\s+[SN]\s+[SN]\s+(.*))?$/;

    /**
     * REGEX PER A ESTATS ESPECIALS (Pag 4-6: VAC, DES, AJN, etc.)
     * Grups:
     * 1: Codi Estat (VAC, DES, FOR, etc.)
     * 2: Nòmina
     * 3: Nom
     * 4: Observacions
     */
    const statusRegex = /^([A-Z]{3}|AJN|DAG|DIS|FOR)\s+(?:MQ\s+)?(?:BA\s+)?(\d{5,6})\s+(.*?)(?:\s+[SN]\s+[SN]\s+[SN]\s+(.*))?$/;

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      // Reagrupar el text per línies segons la posició Y (transform[5])
      // També ordenem per X (transform[4]) per mantenir l'ordre de columnes
      const items = textContent.items as any[];
      const lineMap: { [key: number]: any[] } = {};
      
      items.forEach((item) => {
        const y = Math.round(item.transform[5]);
        if (!lineMap[y]) lineMap[y] = [];
        lineMap[y].push(item);
      });

      // Ordenar línies de dalt a baix
      const sortedY = Object.keys(lineMap).map(Number).sort((a, b) => b - a);
      
      sortedY.forEach(y => {
        // Ordenar ítems de la mateixa línia d'esquerra a dreta
        const lineItems = lineMap[y].sort((a, b) => a.transform[4] - b.transform[4]);
        const textLine = lineItems.map(item => item.str).join(" ").replace(/\s+/g, " ").trim();
        
        // 1. Intentar detectar línia de torn estàndard
        const shiftMatch = textLine.match(shiftRegex);
        if (shiftMatch) {
          extractedData.push({
            torn: shiftMatch[1],
            hora_inici: shiftMatch[2],
            hora_fi: shiftMatch[3],
            empleat_id: shiftMatch[4],
            nom: shiftMatch[5].trim(),
            observacions: shiftMatch[6] ? shiftMatch[6].trim() : ""
          });
          return; // Saltem a la següent línia
        }

        // 2. Intentar detectar línia d'estat especial (Vacances, Festes...)
        const statusMatch = textLine.match(statusRegex);
        if (statusMatch) {
          extractedData.push({
            torn: statusMatch[1], // "VAC", "DES", etc.
            hora_inici: "00:00",
            hora_fi: "00:00",
            empleat_id: statusMatch[2],
            nom: statusMatch[3].trim(),
            observacions: statusMatch[4] ? statusMatch[4].trim() : ""
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
      // 1. Extreure dades automàticament
      const extractedData = await parsePDF(file);

      if (extractedData.length === 0) {
        throw new Error("No s'han pogut extreure torns del fitxer. Assegura't que el PDF és el llistat oficial de torns.");
      }

      // 2. Netejar dades actuals a Supabase
      const { error: deleteError } = await supabase.from('daily_assignments').delete().neq('id', -1);
      if (deleteError) throw deleteError;

      // 3. Insertar noves dades
      // Dividim en blocs de 100 per seguretat si el llistat és molt gran
      const chunkSize = 100;
      for (let i = 0; i < extractedData.length; i += chunkSize) {
        const chunk = extractedData.slice(i, i + chunkSize);
        const { error: insertError } = await supabase
          .from('daily_assignments')
          .insert(chunk);
        if (insertError) throw insertError;
      }
      
      setStatus('success');
    } catch (error: any) {
      console.error("Error detallat processant PDF:", error);
      setErrorMessage(error.message || "Error durant l'extracció de dades del PDF.");
      setStatus('error');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-fgc-grey/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white w-full max-w-lg rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in duration-300">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-fgc-green/10 rounded-lg text-fgc-green">
              <FileText size={20} />
            </div>
            <h2 className="text-xl font-bold text-fgc-grey tracking-tight">Càrrega de Llistat</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-8">
          {status === 'idle' || status === 'processing' ? (
            <div className="space-y-6">
              <div 
                className={`border-2 border-dashed rounded-[24px] p-10 flex flex-col items-center justify-center text-center transition-all ${
                  file ? 'border-fgc-green bg-fgc-green/5' : 'border-gray-200 hover:border-fgc-green/50'
                }`}
              >
                {status === 'processing' ? (
                  <div className="space-y-4 flex flex-col items-center">
                    <Loader2 className="text-fgc-green animate-spin" size={48} />
                    <p className="font-bold text-fgc-grey text-lg">Analitzant PDF...</p>
                    <p className="text-sm text-gray-400">Extraient torns i assignacions de personal.</p>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 text-gray-400">
                      <Upload size={32} />
                    </div>
                    {file ? (
                      <div className="space-y-2">
                        <p className="font-bold text-fgc-grey text-lg truncate max-w-[250px]">{file.name}</p>
                        <p className="text-xs text-gray-400 font-medium">{(file.size / 1024).toFixed(1)} KB — Arxiu vàlid</p>
                        <button 
                          onClick={() => setFile(null)} 
                          className="text-xs font-bold text-red-500 hover:text-red-600 transition-colors mt-2"
                        >
                          Eliminar i triar un altre
                        </button>
                      </div>
                    ) : (
                      <>
                        <h3 className="text-lg font-bold text-fgc-grey mb-2">Puja el PDF de Torns</h3>
                        <p className="text-sm text-gray-400 mb-8 max-w-[250px]">L'aplicació extraurà automàticament les dades del llistat oficial.</p>
                        <input 
                          type="file" 
                          id="pdf-upload" 
                          className="hidden" 
                          accept="application/pdf"
                          onChange={handleFileChange}
                        />
                        <label 
                          htmlFor="pdf-upload" 
                          className="bg-fgc-grey text-white px-10 py-4 rounded-2xl font-bold cursor-pointer hover:bg-fgc-dark transition-all shadow-lg active:scale-95 flex items-center gap-2"
                        >
                          <FileText size={18} />
                          SELECCIONAR FITXER
                        </label>
                      </>
                    )}
                  </>
                )}
              </div>

              {file && status === 'idle' && (
                <button 
                  onClick={handleUpload}
                  className="w-full bg-fgc-green text-fgc-grey py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-xl shadow-fgc-green/20 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  <Upload size={22} />
                  SINCRO AMB SUPABASE
                </button>
              )}
            </div>
          ) : status === 'success' ? (
            <div className="text-center py-8 space-y-8 animate-in fade-in zoom-in duration-500">
              <div className="w-24 h-24 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-inner border border-green-100">
                <CheckCircle2 size={56} />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-fgc-grey tracking-tight">Dades Actualitzades</h3>
                <p className="text-gray-500 font-medium">El llistat diari s'ha processat i sincronitzat correctament.</p>
              </div>
              <button 
                onClick={onClose}
                className="w-full bg-fgc-grey text-white py-5 rounded-2xl font-black text-lg shadow-xl hover:bg-fgc-dark transition-all active:scale-95"
              >
                FINALITZAR
              </button>
            </div>
          ) : (
            <div className="text-center py-8 space-y-8 animate-in fade-in zoom-in duration-500">
              <div className="w-24 h-24 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto shadow-inner border border-red-100">
                <AlertCircle size={56} />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-fgc-grey tracking-tight">Error de Lectura</h3>
                <p className="text-red-500 font-medium bg-red-50 p-4 rounded-2xl text-sm border border-red-100">{errorMessage}</p>
              </div>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => setStatus('idle')}
                  className="w-full bg-fgc-grey text-white py-5 rounded-2xl font-black text-lg shadow-xl hover:bg-fgc-dark transition-all active:scale-95"
                >
                  REINTENTAR
                </button>
                <button 
                  onClick={onClose}
                  className="w-full py-3 text-gray-400 font-bold hover:text-fgc-grey transition-colors"
                >
                  Tancar finestra
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FileUploadModal;
