import React, { useState, useEffect, useCallback } from 'react';
import { X, ChevronRight, ChevronLeft, Map } from 'lucide-react';

interface TourStep {
    id: string;
    title: string;
    content: string;
    targetSelector: string; // CSS selector
}

const TOUR_STEPS: TourStep[] = [
    {
        id: 'dashboard',
        title: 'Monitor CSO',
        content: 'Benvingut a CercatornsPro. Aquí pots veure les alertes crítiques, l\'estat de la xarxa i el personal de reserva en temps real.',
        targetSelector: '[data-tour="dashboard-tab"]'
    },
    {
        id: 'cercar',
        title: 'Cerca Intel·ligent',
        content: 'Cerca qualsevol torn, maquinista, estació o circulació ràpidament. Els resultats s\'actualitzen a l\'instant.',
        targetSelector: '[data-tour="cercar-tab"]'
    },
    {
        id: 'organitza',
        title: 'Malla Operativa',
        content: 'Supervisa els torns gràficament, gestiona descoberts i reassigna personal arrossegant (drag & drop) les assignacions.',
        targetSelector: '[data-tour="organitza-tab"]'
    },
    {
        id: 'incidencia',
        title: 'Gestió de Crisis',
        content: 'Dissenya plans de servei alternatiu ràpidament. Talla la línia, defineix illes d\'operació i visualitza la nova malla en segons.',
        targetSelector: '[data-tour="incidencia-tab"]'
    },
    {
        id: 'missatges',
        title: 'Missatgeria',
        content: 'Comunica\'t amb la resta de l\'equip de CSO, comparteix arxius i fixa missatges importants.',
        targetSelector: '[data-tour="mensajeria-tab"]'
    },
    {
        id: 'cicles',
        title: 'Material Mòbil',
        content: 'Controla l\'estat de tota la flota de trens, inspeccions i manteniment.',
        targetSelector: '[data-tour="cicles-tab"]'
    },
    {
        id: 'upload',
        title: 'Càrrega de Dades',
        content: 'Puja els horaris diaris i les assignacions de personal directament des de fitxers PDF o Excel per mantenir el sistema actualitzat.',
        targetSelector: '[data-tour="upload-btn"]'
    },
    {
        id: 'settings',
        title: 'Configuració i Perfil',
        content: 'Personalitza la teva experiència: canvia el mode fosc, ajusta la navegació o actualitza les dades del teu perfil.',
        targetSelector: '[data-tour="settings-btn"]'
    }
];

export const OnboardingTour: React.FC = () => {
    const [isVisible, setIsVisible] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

    // Initial check
    useEffect(() => {
        const hasSeenTour = localStorage.getItem('cercatornspro_tour_seen');
        if (!hasSeenTour) {
            // Delay slightly to let app render
            setTimeout(() => {
                setIsVisible(true);
            }, 1500);
        }

        // Expose a global method to trigger the tour manually
        (window as any).startAppTour = () => {
            setCurrentStep(0);
            setIsVisible(true);
        };
    }, []);

    const updateTargetRect = useCallback(() => {
        if (!isVisible) return;
        const selector = TOUR_STEPS[currentStep].targetSelector;
        const el = document.querySelector(selector);
        if (el) {
            setTargetRect(el.getBoundingClientRect());
            // optionally scroll into view
            if (currentStep > 0) { // Keep view mostly stable but scroll if needed
                // el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } else {
            setTargetRect(null);
        }
    }, [currentStep, isVisible]);

    useEffect(() => {
        updateTargetRect();
        window.addEventListener('resize', updateTargetRect);
        return () => window.removeEventListener('resize', updateTargetRect);
    }, [updateTargetRect]);

    const handleNext = () => {
        if (currentStep < TOUR_STEPS.length - 1) {
            setCurrentStep(c => c + 1);
        } else {
            handleClose();
        }
    };

    const handlePrev = () => {
        if (currentStep > 0) {
            setCurrentStep(c => c - 1);
        }
    };

    const handleClose = () => {
        setIsVisible(false);
        localStorage.setItem('cercatornspro_tour_seen', 'true');
    };

    if (!isVisible) return null;

    const stepInfo = TOUR_STEPS[currentStep];

    return (
        <div className="fixed inset-0 z-[99999] pointer-events-none transition-opacity duration-500">
            {/* Dark overlay mask */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-[2px] pointer-events-auto transition-all duration-500"
                onClick={handleClose}
            />

            {/* Spotlight cut-out logic (SVG approach for perfect rounded cutouts) */}
            {targetRect && (
                <div
                    className="absolute ring-4 ring-fgc-green/50 ring-offset-4 ring-offset-transparent rounded-xl transition-all duration-500 ease-out z-[100000] pointer-events-none"
                    style={{
                        top: targetRect.top - 8,
                        left: targetRect.left - 8,
                        width: targetRect.width + 16,
                        height: targetRect.height + 16,
                        boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)' // Fallback mask
                    }}
                >
                    <div className="absolute inset-0 border-2 border-fgc-green rounded-xl animate-pulse" />
                </div>
            )}

            {/* Tooltip Card */}
            <div
                className="absolute z-[100001] bg-white dark:bg-gray-800 text-[#4D5358] dark:text-gray-200 p-6 rounded-3xl shadow-2xl border border-gray-100 dark:border-white/10 w-80 pointer-events-auto transition-all duration-500 ease-out flex flex-col gap-4"
                style={{
                    top: targetRect ? Math.min(targetRect.bottom + 20, window.innerHeight - 250) : window.innerHeight / 2 - 100,
                    left: targetRect ? Math.max(20, Math.min(targetRect.left, window.innerWidth - 340)) : window.innerWidth / 2 - 160,
                }}
            >
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <Map size={18} className="text-fgc-green" />
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                            Pas {currentStep + 1} de {TOUR_STEPS.length}
                        </span>
                    </div>
                    <h3 className="text-lg font-bold text-[#4D5358] dark:text-white mb-2">{stepInfo.title}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed font-medium">
                        {stepInfo.content}
                    </p>
                </div>

                <div className="flex items-center justify-between mt-4">
                    <button
                        onClick={handleClose}
                        className="text-xs font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    >
                        Saltar Tour
                    </button>
                    <div className="flex gap-2">
                        <button
                            onClick={handlePrev}
                            disabled={currentStep === 0}
                            className="p-2 rounded-xl bg-gray-100 dark:bg-white/5 disabled:opacity-30 transition-all hover:bg-gray-200 dark:hover:bg-white/10"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <button
                            onClick={handleNext}
                            className="px-4 py-2 rounded-xl bg-fgc-green text-white font-bold text-xs flex items-center gap-1 hover:brightness-110 active:scale-95 transition-all shadow-md shadow-fgc-green/20"
                        >
                            {currentStep === TOUR_STEPS.length - 1 ? 'Finalitzar' : 'Següent'}
                            {currentStep < TOUR_STEPS.length - 1 && <ChevronRight size={16} />}
                        </button>
                    </div>
                </div>

                {/* Close Button */}
                <button
                    onClick={handleClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-800 dark:hover:text-white transition-colors"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
};
