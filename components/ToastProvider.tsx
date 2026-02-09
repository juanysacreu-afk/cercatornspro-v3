
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { X, CheckCircle2, AlertCircle, Info, LucideIcon } from 'lucide-react';
import { feedback } from '../utils/feedback';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
    icon?: LucideIcon;
}

interface ToastContextType {
    showToast: (message: string, type: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error('useToast must be used within a ToastProvider');
    return context;
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts((prev) => [...prev, { id, message, type }]);

        // Play feedback based on type
        if (type === 'success') feedback.success();
        else feedback.click();

        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 4000);
    }, []);

    const removeToast = (id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[10002] flex flex-col gap-3 pointer-events-none w-full max-w-xs sm:max-w-md px-6">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`
              pointer-events-auto flex items-center gap-4 px-6 py-4 rounded-[24px] 
              backdrop-blur-2xl border shadow-2xl animate-in slide-in-from-bottom-4 duration-500
              ${toast.type === 'success' ? 'bg-fgc-green/10 border-fgc-green/30 text-fgc-grey dark:text-fgc-green' : ''}
              ${toast.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400' : ''}
              ${toast.type === 'info' ? 'bg-white/10 border-white/20 text-fgc-grey dark:text-white' : ''}
            `}
                    >
                        <div className={`p-2 rounded-xl bg-white dark:bg-black/20 shadow-sm`}>
                            {toast.type === 'success' && <CheckCircle2 size={18} />}
                            {toast.type === 'error' && <AlertCircle size={18} />}
                            {toast.type === 'info' && <Info size={18} />}
                        </div>

                        <p className="flex-1 text-sm font-black uppercase tracking-tight leading-tight">
                            {toast.message}
                        </p>

                        <button
                            onClick={() => removeToast(toast.id)}
                            className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};
