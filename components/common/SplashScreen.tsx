import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';


interface SplashScreenProps {
    progress: number;
    message?: string;
    onComplete: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ progress, message, onComplete }) => {
    const [isVisible, setIsVisible] = useState(true);

    const isReadyToFade = progress >= 100;

    useEffect(() => {
        if (progress >= 100) {
            const timer = setTimeout(() => {
                setIsVisible(false);
                onComplete();
            }, 500);
            return () => clearTimeout(timer);
        }

        // Safety fallback: si passen més de 5s i per xarxa no arriba al 100%, obrir directament
        const forceTimer = setTimeout(() => {
            setIsVisible(false);
            onComplete();
        }, 5000);
        return () => clearTimeout(forceTimer);
    }, [progress, onComplete]);

    if (!isVisible) return null;

    return createPortal(
        <div className={`fixed inset-0 z-[10005] flex flex-col items-center justify-end bg-black transition-all duration-500 ease-out ${isReadyToFade ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100'}`}>
            {/* Fullscreen Video Background */}
            <div className="absolute inset-0 overflow-hidden flex justify-center">
                <video
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="w-full h-full object-cover sm:w-auto sm:object-contain"
                >
                    <source src="/loading.mp4" type="video/mp4" />
                </video>
            </div>

            {/* Content positioned in bottom third for mobile and desktop */}
            <div className="relative z-10 text-center space-y-8 max-w-xs w-full px-8 pb-[12vh] sm:pb-[15vh]">
                <div className="space-y-2">
                    <img
                        src="/logo-pro.png"
                        alt="Nexus"
                        className="h-16 sm:h-20 w-auto mx-auto object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                    />
                </div>

                <div className="relative h-1.5 w-full bg-white/10 rounded-full overflow-hidden border border-white/5">
                    <div
                        className="absolute top-0 left-0 h-full bg-fgc-green transition-all duration-500 ease-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] animate-pulse">
                    {progress < 100 ? (message || 'Sincronitzant dades...') : 'Sincronització completa'}
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
