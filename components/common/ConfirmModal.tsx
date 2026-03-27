import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
    message,
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancel·lar',
    danger = true,
    onConfirm,
    onCancel,
}) => {
    return createPortal(
        <div
            className="fixed inset-0 z-[500000] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
        >
            <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl max-w-sm w-full p-8 flex flex-col gap-6 animate-in zoom-in-95 duration-200">
                <div className="flex items-start gap-4">
                    <div className={`flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center ${danger ? 'bg-red-100 dark:bg-red-900/40' : 'bg-blue-100 dark:bg-blue-900/40'}`}>
                        <AlertTriangle size={20} className={danger ? 'text-red-500' : 'text-blue-500'} />
                    </div>
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 leading-relaxed pt-1">
                        {message}
                    </p>
                    <button onClick={onCancel} className="ml-auto flex-shrink-0 text-gray-300 hover:text-gray-500 dark:hover:text-gray-200 transition-colors">
                        <X size={18} />
                    </button>
                </div>
                <div className="flex gap-3 justify-end">
                    <button
                        onClick={onCancel}
                        className="px-5 py-2.5 rounded-2xl text-sm font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 transition-all"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-5 py-2.5 rounded-2xl text-sm font-bold text-white transition-all active:scale-95 ${danger ? 'bg-red-500 hover:bg-red-600' : 'bg-fgc-green hover:bg-fgc-green/90'}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ConfirmModal;
