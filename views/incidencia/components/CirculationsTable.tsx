import React, { useState } from 'react';
import { Search, Train, User, ArrowRight, Download, Filter, Inbox } from 'lucide-react';
import { mainLiniaForFilter, LINE_COLORS } from '../../../utils/stations';

interface CirculationsTableProps {
    generatedCircs: any[];
    onExport: () => void;
}

const CirculationsTable: React.FC<CirculationsTableProps> = ({ generatedCircs, onExport }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterLinia, setFilterLinia] = useState('Tots');

    const filtered = generatedCircs.filter(c => {
        const matchesSearch =
            c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.torn.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.train.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.driver.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesLinia = filterLinia === 'Tots' || mainLiniaForFilter(c.linia) === filterLinia;
        return matchesSearch && matchesLinia;
    });

    if (generatedCircs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-gray-50 dark:bg-black/20 rounded-[32px] border border-dashed border-gray-200 dark:border-white/10">
                <div className="p-4 bg-gray-100 dark:bg-white/5 rounded-full mb-4">
                    <Inbox size={32} className="text-gray-400" />
                </div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">No s'han generat circulacions encara</p>
            </div>
        );
    }

    return (
        <div className="animate-in fade-in slide-in-from-right duration-500 flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <div className="relative group">
                        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="Cercar número, torn, tren..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-2 bg-white dark:bg-gray-900 border border-gray-100 dark:border-white/10 rounded-2xl text-[11px] font-bold text-[#4D5358] dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all w-64 uppercase tracking-wider"
                        />
                    </div>
                    <div className="flex items-center bg-gray-100 dark:bg-white/5 p-1 rounded-2xl border border-gray-200 dark:border-white/10">
                        {['Tots', 'S1', 'S2', 'L6', 'L7', 'L12'].map(ln => (
                            <button
                                key={ln}
                                onClick={() => setFilterLinia(ln)}
                                className={`px-4 py-1.5 rounded-xl text-[9px] font-bold uppercase transition-all ${filterLinia === ln ? 'bg-white dark:bg-gray-800 text-[#4D5358] dark:text-white shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}
                            >
                                {ln}
                            </button>
                        ))}
                    </div>
                </div>
                <button
                    onClick={onExport}
                    className="flex items-center gap-2 px-6 py-2 bg-[#4D5358] hover:bg-black text-white rounded-2xl text-[10px] font-bold uppercase transition-all shadow-lg shadow-black/10 active:scale-95"
                >
                    <Download size={14} />
                    <span>Exportar XLS</span>
                </button>
            </div>

            <div className="flex-1 bg-white dark:bg-gray-900 rounded-[32px] border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden flex flex-col">
                <div className="overflow-auto scrollbar-thin">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800/80 backdrop-blur">
                            <tr>
                                <th className="px-6 py-4 text-[9px] font-heavy text-gray-400 uppercase tracking-[0.2em] first:rounded-tl-[32px]">ID</th>
                                <th className="px-6 py-4 text-[9px] font-heavy text-gray-400 uppercase tracking-[0.2em]">Linia</th>
                                <th className="px-6 py-4 text-[9px] font-heavy text-gray-400 uppercase tracking-[0.2em]">Recorregut</th>
                                <th className="px-6 py-4 text-[9px] font-heavy text-gray-400 uppercase tracking-[0.2em]">M/A</th>
                                <th className="px-6 py-4 text-[9px] font-heavy text-gray-400 uppercase tracking-[0.2em]">Unitat</th>
                                <th className="px-6 py-4 text-[9px] font-heavy text-gray-400 uppercase tracking-[0.2em]">Maquinista</th>
                                <th className="px-6 py-4 text-[9px] font-heavy text-gray-400 uppercase tracking-[0.2em]">Torn</th>
                                <th className="px-6 py-4 text-[9px] font-heavy text-gray-400 uppercase tracking-[0.2em] last:rounded-tr-[32px]">Següent</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                            {filtered.map((c, idx) => {
                                const color = LINE_COLORS[mainLiniaForFilter(c.linia)]?.hex || '#9ca3af';
                                return (
                                    <tr key={`${c.id}-${idx}`} className="group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: color }} />
                                                <span className="text-[11px] font-bold text-[#4D5358] dark:text-white tracking-widest">{c.id}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-[9px] font-bold px-2.5 py-1 rounded-lg border border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 uppercase">{c.linia}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold text-[#4D5358] dark:text-white uppercase">{c.route.split(' → ')[0]}</span>
                                                <ArrowRight size={10} className="text-gray-300" />
                                                <span className="text-[10px] font-bold text-[#4D5358] dark:text-white uppercase">{c.route.split(' → ')[1]}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-bold text-blue-500">{c.sortida}</span>
                                                <span className="text-[10px] font-bold text-orange-500">{c.arribada}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                                                <Train size={12} />
                                                <span className="text-[10px] font-bold">{c.train}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                                                <User size={12} />
                                                <span className="text-[10px] font-bold truncate max-w-[120px] uppercase">{c.driver}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-[10px] font-heavy text-gray-400 uppercase">{c.torn}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[9px] font-bold uppercase transition-all ${c.nextId === 'Final de servei' ? 'text-red-400' : 'text-gray-400 group-hover:text-blue-500'}`}>
                                                    {c.nextId === 'Final de servei' ? 'Final' : c.nextId}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default CirculationsTable;
