import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// ──────────────────────────────────────────────
// ErrorBoundary — Envuelve vistas principales para
// evitar que un fallo en una sección tumbe toda la app.
// ──────────────────────────────────────────────

interface ErrorBoundaryProps {
    /** Nombre legible de la sección (p.ej. "Mapa d'Incidències") */
    sectionName?: string;
    /** Componente de fallback personalizado */
    fallback?: ReactNode;
    /** Callback opcional cuando ocurre un error */
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
    children: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        this.setState({ errorInfo });
        console.error(`[ErrorBoundary] Error a "${this.props.sectionName || 'Secció desconeguda'}":`, error, errorInfo);
        this.props.onError?.(error, errorInfo);
    }

    handleReset = (): void => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    render(): ReactNode {
        if (this.state.hasError) {
            // Fallback personalizado si se proporciona
            if (this.props.fallback) return this.props.fallback;

            // Fallback por defecto: panel de error elegante
            return (
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-in fade-in duration-500">
                    <div className="w-20 h-20 bg-red-50 dark:bg-red-950/30 rounded-full flex items-center justify-center mb-6 shadow-lg">
                        <AlertTriangle size={40} className="text-red-500" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-700 dark:text-gray-200 uppercase tracking-tight mb-2">
                        Error a {this.props.sectionName || 'aquesta secció'}
                    </h3>
                    <p className="text-sm text-gray-400 dark:text-gray-500 max-w-md mb-6 leading-relaxed">
                        S'ha produït un error inesperat. La resta de l'aplicació segueix funcionant.
                        Pots reintentar o tornar enrere.
                    </p>
                    {this.state.error && (
                        <pre className="text-[10px] font-mono text-red-400 bg-red-50 dark:bg-red-950/20 p-3 rounded-xl mb-6 max-w-lg overflow-x-auto border border-red-100 dark:border-red-900/30 text-left">
                            {this.state.error.message}
                        </pre>
                    )}
                    <button
                        onClick={this.handleReset}
                        className="flex items-center gap-2 px-6 py-3 bg-fgc-green text-white rounded-2xl font-bold text-sm uppercase tracking-wider hover:opacity-90 transition-all shadow-lg"
                    >
                        <RefreshCw size={16} />
                        Reintentar
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
