import React from 'react';

interface GlassPanelProps {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
    hover?: boolean;
}

const GlassPanel: React.FC<GlassPanelProps> = ({ children, className = '', onClick, hover = false }) => {
    return (
        <div
            onClick={onClick}
            className={`
        bg-white/80 dark:bg-gray-900/80 
        backdrop-blur-xl 
        border border-white/20 dark:border-white/5 
        shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] 
        dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.3)]
        rounded-[32px] 
        transition-all 
        duration-300
        ${hover ? 'hover:scale-[1.02] hover:shadow-[0_8px_32px_0_rgba(31,38,135,0.12)] cursor-pointer' : ''}
        ${className}
      `}
        >
            {children}
        </div>
    );
};

export default GlassPanel;
