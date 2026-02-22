import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';


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

    return createPortal(
        <div className={`fixed inset-0 z-[10005] flex flex-col items-center justify-center bg-fgc-grey dark:bg-black transition-all duration-700 ${progress >= 100 ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100'}`}>
            <div className="relative mb-8">
                <div className="absolute inset-0 bg-fgc-green/20 blur-3xl rounded-full scale-150 animate-pulse" />
                <div className="relative flex items-center justify-center w-32 h-32 bg-black/40 rounded-[32px] shadow-2xl border border-white/10 overflow-hidden backdrop-blur-sm">
                    <video
                        autoPlay
                        muted
                        loop
                        playsInline
                        className="w-full h-full object-cover"
                    >
                        <source src="/loading.mp4" type="video/mp4" />
                    </video>
                </div>
            </div>

            <div className="text-center space-y-4 max-w-xs w-full px-8">
                <img
                    src="/logo-pro.png"
                    alt="CercaTorns PRO"
                    className="h-16 w-auto mx-auto object-contain mb-2"
                />

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
        </div>,
        document.body
    );
};

export default SplashScreen;
