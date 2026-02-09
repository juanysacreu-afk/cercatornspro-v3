import React, { useState, useEffect, useRef } from 'react';

interface MarqueeTextProps {
    text: string;
    className?: string; // Additional classes for styling (e.g., fonts, colors)
}

export const MarqueeText: React.FC<MarqueeTextProps> = ({ text, className = '' }) => {
    const [shouldAnimate, setShouldAnimate] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const checkOverflow = () => {
            if (containerRef.current && textRef.current) {
                // Ensure text is rendered without wrapping for measurement
                // Compare text scroll width (actual content width) with container width
                const textWidth = textRef.current.scrollWidth;
                const containerWidth = containerRef.current.clientWidth;
                // Add a small buffer to avoid floating point issues or barely-fitting jitters
                setShouldAnimate(textWidth > containerWidth);
            }
        };

        checkOverflow();
        // Check on window resize as container width might change
        window.addEventListener('resize', checkOverflow);
        return () => window.removeEventListener('resize', checkOverflow);
    }, [text]);

    return (
        <div ref={containerRef} className="min-w-0 shrink overflow-hidden relative w-full">
            <div
                ref={textRef}
                className={`
                    ${className} 
                    flex
                    whitespace-nowrap 
                    ${shouldAnimate ? 'animate-marquee' : 'truncate'}
                    transition-all
                `}
                title={!shouldAnimate ? text : undefined}
            >
                <span>{text}</span>
                {shouldAnimate && <span className="ml-8">{text}</span>}
            </div>
        </div>
    );
};
