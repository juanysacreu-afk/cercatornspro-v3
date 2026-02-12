import React from 'react';

interface SkeletonProps {
    className?: string;
    count?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', count = 1 }) => {
    return (
        <>
            {Array.from({ length: count }).map((_, i) => (
                <div
                    key={i}
                    className={`animate-pulse bg-gray-200 dark:bg-white/5 rounded-2xl ${className}`}
                />
            ))}
        </>
    );
};

export const CardSkeleton = () => (
    <div className="p-6 bg-white dark:bg-gray-900 rounded-[32px] border border-gray-100 dark:border-white/5 space-y-4">
        <div className="flex justify-between items-center">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-8 rounded-full" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <div className="pt-4 flex gap-2">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 flex-1" />
        </div>
    </div>
);

export const ListSkeleton = ({ items = 5 }) => (
    <div className="space-y-3">
        {Array.from({ length: items }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 bg-white/50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5">
                <Skeleton className="w-12 h-12 rounded-xl" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-1/4" />
                    <Skeleton className="h-2 w-1/2" />
                </div>
                <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
        ))}
    </div>
);

export default Skeleton;
