import React, { useState, useEffect, useRef } from 'react';

interface MarqueeTextProps {
    text: string;
    className?: string;
}

export const MarqueeText: React.FC<MarqueeTextProps> = ({ text, className = '' }) => {
    const [shouldAnimate, setShouldAnimate] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const container = containerRef.current;
        const textElement = textRef.current;
        if (!container || !textElement) return;

        const checkOverflow = () => {
            // Fem servir un element invisible per mesurar el text real sense truncament ni animacions
            const range = document.createRange();
            range.selectNodeContents(textElement);
            const textWidth = range.getBoundingClientRect().width;
            const containerWidth = container.getBoundingClientRect().width;

            // Debug opcional: console.log(`Text: ${text}, Content: ${textWidth}, Container: ${containerWidth}`);
            setShouldAnimate(textWidth > containerWidth);
        };

        // Mesura inicial amb un petit delay per esperar el reflow del layout
        const timer = setTimeout(checkOverflow, 100);

        const observer = new ResizeObserver(checkOverflow);
        observer.observe(container);

        return () => {
            clearTimeout(timer);
            observer.disconnect();
        };
    }, [text]);

    return (
        <div
            ref={containerRef}
            className="min-w-0 flex-1 overflow-hidden relative"
            style={shouldAnimate ? {
                maskImage: 'linear-gradient(to right, black calc(100% - 2rem), transparent)',
                WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 2rem), transparent)'
            } : undefined}
        >
            <div
                ref={textRef}
                className={`
                    ${className} 
                    inline-flex
                    whitespace-nowrap 
                    ${shouldAnimate ? 'animate-marquee' : 'truncate'}
                    transition-opacity duration-300
                    ${shouldAnimate ? 'w-max' : 'w-full'}
                `}
                title={!shouldAnimate ? text : undefined}
            >
                <span>{text}</span>
                {shouldAnimate && <span className="ml-12">{text}</span>}
            </div>
        </div>
    );
};
