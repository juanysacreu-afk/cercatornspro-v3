
import React, { useState } from 'react';
import { X, Upload, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '../supabaseClient.ts';
import * as pdfjsLib from 'pdfjs-dist';

// Usamos el CDN oficial de PDF.js para el worker para asegurar compatibilidad en Vercel
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

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
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const extractedData: any[] = [];

    const shiftRegex = /^(?:.*?)\s*([QR][A-Z0-9]{3,4})\s+(?:\d+\s+)?(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(\d{5,6})\s+(.*?)(?:\s+[SN]\s+[SN]\s+[SN]\s+(.*))?$/;
    const statusRegex = /^([A-Z]{3}|AJN|DAG|DIS|FOR)\s+(?:MQ\s+)?(?:BA\s+)?(\d{5,6})\s+(.*?)(?:\s+[SN]\s+[SN]\s+[SN]\s+(.*))?$/;

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
      const extractedData = await parsePDF(file);

      if (extractedData.length === 0) {
        throw new Error("No s'han pogut extreure dades del PDF.");
      }

      const { error: deleteError } = await supabase.from('daily_assignments').delete().neq('id', -1);
      if (deleteError) throw deleteError;

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
                      </>
                    )}
                  </>
                )}
              </div>

              {file && status === 'idle' && (
                <button onClick={handleUpload} className="w-full bg-fgc-green text-fgc-grey py-4 rounded-xl font-black text-lg shadow-lg">
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
