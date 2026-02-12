import React, { useEffect, useState } from 'react';
import { Train } from 'lucide-react';

interface SplashScreenProps {
    progress: number;
    onComplete: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ progress, onComplete }) => {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        if (progress >= 100) {
            const timer = setTimeout(() => {
                setIsVisible(false);
                onComplete();
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [progress, onComplete]);

    if (!isVisible) return null;

    return (
        <div className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-fgc-grey dark:bg-black transition-all duration-700 ${progress >= 100 ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100'}`}>
            <div className="relative mb-8">
                <div className="absolute inset-0 bg-fgc-green/20 blur-3xl rounded-full scale-150 animate-pulse" />
                <div className="relative flex items-center justify-center w-24 h-24 bg-white dark:bg-gray-900 rounded-[32px] shadow-2xl border border-white/10 overflow-hidden">
                    <Train size={48} className="text-fgc-green animate-bounce" />
                </div>
            </div>

            <div className="text-center space-y-4 max-w-xs w-full px-8">
                <h1 className="text-2xl font-black text-white uppercase tracking-tighter">
                    Cerca<span className="text-fgc-green">Torns</span>
                    <span className="ml-2 px-2 py-0.5 bg-fgc-green text-fgc-grey text-[10px] rounded-lg align-top">PRO</span>
                </h1>

                <div className="relative h-1.5 w-full bg-white/10 rounded-full overflow-hidden border border-white/5">
                    <div
                        className="absolute top-0 left-0 h-full bg-fgc-green transition-all duration-500 ease-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] animate-pulse">
                    {progress < 100 ? 'Sincronitzant dades...' : 'Sincronització completa'}
                </p>
            </div>

            <div className="absolute bottom-12 text-[10px] font-bold text-white/20 uppercase tracking-widest">
                FGC Operacions · v1.7.0
            </div>
        </div>
    );
};

export default SplashScreen;
