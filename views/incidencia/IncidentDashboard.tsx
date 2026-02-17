import React from 'react';
import {
    Search, Loader2, UserCheck, Train, Phone, Users, Rewind, FastForward,
    Coffee, MapPin, CheckCircle2, X, ShieldAlert, Info, ArrowRight, Timer, Repeat, User, Flag, Mail
} from 'lucide-react';
import GlassPanel from '../../components/common/GlassPanel';
import { CardSkeleton, ListSkeleton } from '../../components/common/Skeleton';
import CompactViatgerRow from './CompactViatgerRow';
import { getFgcMinutes, formatFgcTime } from '../../utils/stations';

interface IncidentDashboardProps {
    query: string;
    setQuery: (q: string) => void;
    onSearch: () => void;
    loading: boolean;
    searchedCircData: any;
    mainDriverInfo: any;
    passengerResults: any[];
    adjacentResults: { anterior: any[], posterior: any[] };
    restingResults: any[];
    extensibleResults: any[];
    reserveInterceptResults: any[];
    isPrivacyMode: boolean;
}

const IncidentDashboard: React.FC<IncidentDashboardProps> = ({
    query,
    setQuery,
    onSearch,
    loading,
    searchedCircData,
    mainDriverInfo,
    passengerResults,
    adjacentResults,
    restingResults,
    extensibleResults,
    reserveInterceptResults,
    isPrivacyMode
}) => {
    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <GlassPanel className="p-8">
                <div className="max-w-2xl mx-auto space-y-6 text-center w-full">
                    <h3 className="text-sm font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Identifica el Tren afectat</h3>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 relative">
                        <div className="relative flex-1">
                            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={24} />
                            <input
                                type="text"
                                placeholder="Ex: D125, A057..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && onSearch()}
                                className="w-full bg-gray-50 dark:bg-black/20 border-none rounded-[24px] sm:rounded-[28px] py-5 sm:py-6 pl-14 sm:pl-16 pr-8 focus:ring-4 focus:ring-red-500/20 outline-none text-lg sm:text-xl font-bold transition-all dark:text-white shadow-inner"
                            />
                        </div>
                        <button
                            onClick={onSearch}
                            disabled={loading || !query}
                            className="bg-fgc-green text-fgc-grey px-8 py-5 sm:py-3 rounded-[24px] sm:rounded-2xl font-black text-sm sm:text-base hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-fgc-green/20 disabled:opacity-50 whitespace-nowrap flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : <><Search size={18} /> CERCAR</>}
                        </button>
                    </div>
                </div>
            </GlassPanel>

            {loading ? (
                <div className="space-y-10 animate-in fade-in duration-500">
                    <CardSkeleton />
                    <ListSkeleton items={5} />
                    <ListSkeleton items={3} />
                </div>
            ) : searchedCircData && (
                <div className="grid grid-cols-1 gap-8">
                    <div className="space-y-10">
                        {mainDriverInfo && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 px-2"><UserCheck className="text-fgc-green" size={16} /><h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Maquinista titular</h3></div>
                                <div className="bg-white dark:bg-gray-800 rounded-[24px] p-5 sm:p-6 border-2 border-fgc-green shadow-lg shadow-fgc-green/5 relative overflow-hidden group transition-colors">
                                    <div className="flex flex-col">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-4">
                                                <div className="h-12 min-w-[3.5rem] px-3 bg-fgc-grey dark:bg-black text-white rounded-xl flex items-center justify-center font-black text-xl shadow-md shrink-0 whitespace-nowrap">{mainDriverInfo.id}</div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-xl font-black text-fgc-grey dark:text-white tracking-tight leading-none truncate">{mainDriverInfo.drivers?.[0]?.cognoms}, {mainDriverInfo.drivers?.[0]?.nom}</p>
                                                        {mainDriverInfo.drivers?.[0]?.tipus_torn && (
                                                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border shrink-0 ${mainDriverInfo.drivers?.[0]?.tipus_torn === 'Reducció'
                                                                ? 'bg-purple-600 text-white border-purple-700'
                                                                : 'bg-blue-600 text-white border-blue-700'
                                                                }`}>
                                                                {mainDriverInfo.drivers?.[0]?.tipus_torn}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1"><div className="w-2 h-2 bg-fgc-green rounded-full animate-pulse" /><span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Nom. {mainDriverInfo.drivers?.[0]?.nomina}</span>{mainDriverInfo.fullCirculations?.find((c: any) => c?.codi?.toUpperCase() === searchedCircData?.id?.toUpperCase())?.train && (<span className="bg-fgc-green/20 dark:bg-fgc-green/10 text-fgc-grey dark:text-fgc-green px-2 py-0.5 rounded text-[9px] font-black uppercase flex items-center gap-1"><Train size={10} /> {mainDriverInfo.fullCirculations?.find((c: any) => c?.codi?.toUpperCase() === searchedCircData?.id?.toUpperCase())?.train}</span>)}</div>
                                                </div>
                                            </div>
                                            <div className="flex gap-1">{mainDriverInfo.drivers?.[0]?.phones?.map((p: string, i: number) => (<a key={i} href={isPrivacyMode ? undefined : `tel:${p}`} className={`flex items-center justify-center gap-2 bg-fgc-grey dark:bg-black text-white px-5 py-2.5 rounded-xl font-black text-xs hover:bg-fgc-dark transition-all shadow-md active:scale-95 whitespace-nowrap ${isPrivacyMode ? 'cursor-default' : ''}`}><Phone size={14} /> {isPrivacyMode ? '*********' : p}</a>))}</div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-3 border-t border-gray-100 dark:border-white/5 transition-colors">
                                            <div className="flex items-center gap-2"><span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-tighter">TORN:</span><span className="text-base sm:text-lg font-black text-fgc-grey dark:text-gray-200 whitespace-nowrap">{mainDriverInfo.inici_torn} — {mainDriverInfo.final_torn} <span className="text-xs font-bold text-gray-400 dark:text-gray-500 ml-2">({mainDriverInfo.duracio})</span></span></div>
                                            {searchedCircData && (<div className="flex items-center gap-2"><span className="text-[9px] font-black text-fgc-green uppercase tracking-tighter">CIRCULACIÓ:</span><span className="text-base sm:text-lg font-black text-fgc-grey dark:text-gray-200 whitespace-nowrap">{searchedCircData.id} │ {searchedCircData.sortida} — {searchedCircData.arribada} <span className="text-xs font-bold text-gray-400 dark:text-gray-500 ml-1">({(getFgcMinutes(searchedCircData.arribada) || 0) - (getFgcMinutes(searchedCircData.sortida) || 0)} min)</span></span></div>)}
                                            {searchedCircData && (<div className="flex items-center gap-2"><span className="text-[9px] font-black text-blue-500 uppercase tracking-tighter">VIES:</span><span className="text-base sm:text-lg font-black text-fgc-grey dark:text-gray-200 whitespace-nowrap">V{searchedCircData.via_inici || '?'} → V{searchedCircData.via_final || '?'}</span></div>)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="flex items-center gap-2 px-2"><Users className="text-blue-500" size={16} /><h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Maquinistes de viatger ({passengerResults.length})</h3></div>
                            {passengerResults.length > 0 ? (<div className="flex flex-col gap-2">{passengerResults.map((torn, idx) => <CompactViatgerRow key={idx} torn={torn} viatgerCirc={torn.fullCirculations?.find((c: any) => c?.codi === 'Viatger' && c?.observacions && c.observacions.split('-')[0].toUpperCase() === searchedCircData?.id?.toUpperCase())} colorClass="border-l-blue-500" isPrivacyMode={isPrivacyMode} />)}</div>) : (<div className="bg-gray-50/50 dark:bg-black/20 rounded-2xl p-6 text-center border border-dashed border-gray-200 dark:border-white/10 transition-colors"><p className="text-gray-400 dark:text-gray-600 font-bold italic text-xs">Cap maquinista de viatger detectat.</p></div>)}
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-2 px-2"><Users className="text-purple-500" size={16} /><h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Maquinistes de viatger (Anterior / Posterior)</h3></div>
                            {(adjacentResults.anterior.length > 0 || adjacentResults.posterior.length > 0) ? (<div className="flex flex-col gap-2">
                                {adjacentResults.anterior.map((torn, idx) => <CompactViatgerRow key={`ant-${idx}`} torn={torn} viatgerCirc={torn.fullCirculations?.find((c: any) => c?.codi === 'Viatger' && c?.observacions && c.observacions.split('-')[0].toUpperCase() === torn.adjacentCode?.toUpperCase())} colorClass="border-l-purple-400" label={<span className="flex items-center gap-1 text-[8px] text-purple-600 font-black uppercase"><Rewind size={10} /> {torn.adjacentCode} (Ant)</span>} isPrivacyMode={isPrivacyMode} />)}
                                {adjacentResults.posterior.map((torn, idx) => <CompactViatgerRow key={`post-${idx}`} torn={torn} viatgerCirc={torn.fullCirculations?.find((c: any) => c?.codi === 'Viatger' && c?.observacions && c.observacions.split('-')[0].toUpperCase() === torn.adjacentCode?.toUpperCase())} colorClass="border-l-purple-600" label={<span className="flex items-center gap-1 text-[8px] text-purple-600 font-black uppercase"><FastForward size={10} /> {torn.adjacentCode} (Post)</span>} isPrivacyMode={isPrivacyMode} />)}
                            </div>) : (<div className="bg-gray-50/50 dark:bg-black/20 rounded-2xl p-6 text-center border border-dashed border-gray-200 dark:border-white/10 transition-colors"><p className="text-gray-400 dark:text-gray-600 font-bold italic text-xs">Cap viatger en circulacions adjacents.</p></div>)}
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-2 px-2"><Coffee className="text-fgc-green" size={16} /><h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Maquinistes en descans ({restingResults.length})</h3></div>
                            {restingResults.length > 0 ? (<div className="flex flex-col gap-2">{restingResults.map((torn, idx) => (
                                <div key={idx} className="bg-white dark:bg-gray-800 rounded-2xl p-3 border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md transition-all flex items-center gap-4 border-l-4 border-l-fgc-green">
                                    <div className="h-10 min-w-[2.5rem] px-2 bg-fgc-grey/10 dark:bg-black text-fgc-grey dark:text-gray-300 rounded-xl flex items-center justify-center font-black text-xs shadow-sm shrink-0 whitespace-nowrap">{torn.id}</div>
                                    <div className="flex flex-col min-w-[160px] max-w-[220px]">
                                        <div className="flex items-center gap-2">
                                            <p className="text-xs sm:text-sm font-black text-fgc-grey dark:text-gray-200 truncate">{torn.drivers?.[0]?.cognoms}, {torn.drivers?.[0]?.nom}</p>
                                        </div>
                                        <span className="flex items-center gap-1 text-[8px] text-fgc-green font-black uppercase tracking-widest mt-0.5"><MapPin size={8} /> {torn.restSeg?.codi}</span>
                                        <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-0.5">Nom. {torn.drivers?.[0]?.nomina}</p>
                                    </div>

                                    <div className="flex-1 px-4 flex flex-col justify-center space-y-1.5 border-l border-gray-100 dark:border-white/5 mx-2">
                                        {torn.nextCirculation ? (
                                            <>
                                                <div className="flex items-center gap-2">
                                                    <div className="bg-gray-100 dark:bg-white/10 p-1.5 rounded-lg text-gray-400 dark:text-gray-500"><Train size={12} /></div>
                                                    <span className="text-[10px] font-black text-fgc-grey dark:text-gray-300 uppercase leading-none">
                                                        SEGÜENT: CIRC. {torn.nextCirculation?.codi} <span className="text-gray-400 dark:text-gray-500 ml-1">({formatFgcTime(torn.nextCirculation?.start)} - {formatFgcTime(torn.nextCirculation?.end)})</span>
                                                    </span>
                                                </div>
                                                <div className="pl-8 space-y-1">
                                                    {torn.returnStatus === 'same_station' && (
                                                        <p className="text-[9px] font-bold text-fgc-green flex items-center gap-1.5"><CheckCircle2 size={10} /> Ja a l'estació ({torn.fullCirculations?.find((c: any) => c?.codi === torn.nextCirculation?.codi)?.machinistInici || '?'})</p>
                                                    )}
                                                    {torn.returnStatus === 'ok' && torn.returnCirc && (
                                                        <p className="text-[9px] font-bold text-fgc-green flex items-center gap-1.5"><CheckCircle2 size={10} /> Tornada: {torn.returnCirc?.id} ({torn.returnCirc?.sortida}-{torn.returnCirc?.arribada})</p>
                                                    )}
                                                    {torn.returnStatus === 'too_late' && torn.returnCirc && (
                                                        <p className="text-[9px] font-bold text-red-500 flex items-center gap-1.5"><X size={10} /> Tard amb {torn.returnCirc?.id} ({torn.returnCirc?.arribada})</p>
                                                    )}
                                                    {torn.returnStatus === 'no_route' && (
                                                        <p className="text-[9px] font-bold text-orange-500 flex items-center gap-1.5"><ShieldAlert size={10} /> No s'ha trobat tren tornada</p>
                                                    )}
                                                    {torn.returnStatus === 'unknown' && (
                                                        <p className="text-[9px] font-bold text-gray-400 flex items-center gap-1.5"><Info size={10} /> Ubicació desc.</p>
                                                    )}
                                                    <p className="text-[9px] font-medium text-red-500 dark:text-red-400 leading-none pt-0.5">⚠️ Quedarà descoberta si no s'arriba.</p>
                                                </div>
                                            </>
                                        ) : torn.isEndOfShift ? (
                                            <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 font-bold text-[10px] uppercase tracking-widest">
                                                <Flag size={12} className="text-fgc-green" /> FINAL DE TORN
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 text-gray-300 dark:text-gray-600 italic text-[10px]">
                                                <Info size={12} /> Sense assignació posterior confirmada
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                        <div className="flex items-center gap-1.5 bg-fgc-green/10 dark:bg-fgc-green/5 px-3 py-1 rounded-lg border border-fgc-green/20 dark:border-fgc-green/10 transition-colors">
                                            <span className="text-[10px] font-black uppercase text-fgc-grey dark:text-gray-300">{formatFgcTime(torn.restSeg?.start)}</span>
                                            <ArrowRight size={10} className="text-fgc-green" />
                                            <span className="text-[10px] font-black uppercase text-fgc-grey dark:text-gray-300">{formatFgcTime(torn.restSeg?.end)}</span>
                                        </div>
                                        <div className={`text-[10px] font-black px-2 py-0.5 rounded border min-w-[80px] text-center flex items-center justify-center gap-1 ${torn.conflictMinutes > 0 ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/30' : 'text-fgc-green bg-fgc-green/5 border-fgc-green/10'}`}>
                                            {torn.conflictMinutes > 0 && <ShieldAlert size={10} />}
                                            {torn.availableTime} MIN ÚTILS
                                        </div>
                                        {torn.conflictMinutes > 0 ? (
                                            <span className="text-[8px] font-bold text-red-500 dark:text-red-400 uppercase tracking-tight">Solapa {torn.conflictMinutes} min</span>
                                        ) : (
                                            <span className="text-[8px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-tight">Total: {(torn.restSeg?.end || 0) - (torn.restSeg?.start || 0)} min</span>
                                        )}
                                    </div>
                                    <div className="flex gap-1 shrink-0">{torn.drivers?.[0]?.phones?.map((p: string, i: number) => (<a key={i} href={isPrivacyMode ? undefined : `tel:${p}`} className={`w-8 h-8 bg-fgc-grey dark:bg-black text-white rounded-lg flex items-center justify-center hover:bg-fgc-dark transition-all shadow-sm ${isPrivacyMode ? 'cursor-default' : ''}`}><Phone size={12} /></a>))}</div>
                                </div>
                            ))}</div>) : (<div className="bg-gray-50/50 dark:bg-black/20 rounded-2xl p-6 text-center border border-dashed border-gray-200 dark:border-white/10 transition-colors"><p className="text-gray-400 dark:text-gray-600 font-bold italic text-xs">Cap maquinista en descans.</p></div>)}
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-2 px-2"><Timer className="text-orange-500" size={16} /><h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Torns amb possibilitat de perllongar ({extensibleResults.length})</h3></div>
                            {extensibleResults.length > 0 ? (<div className="flex flex-col gap-2">{extensibleResults.map((torn, idx) => (
                                <div key={idx} className="bg-white dark:bg-gray-800 rounded-2xl p-3 border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md transition-all flex items-center gap-4 border-l-4 border-l-orange-500">
                                    <div className="h-10 min-w-[2.5rem] px-2 bg-orange-50 dark:bg-orange-950/20 text-orange-600 rounded-xl flex items-center justify-center font-black text-xs shadow-sm shrink-0 whitespace-nowrap">{torn.id}</div>
                                    <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-6">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-black text-fgc-grey dark:text-gray-200 truncate">{torn.drivers?.[0]?.cognoms}, {torn.drivers?.[0]?.nom}</p>
                                                <span className="flex items-center gap-1 text-[8px] text-orange-500 font-black uppercase tracking-widest"><Timer size={10} /> Extensible</span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <p className="text-[8px] font-black text-gray-300 dark:text-gray-600 uppercase tracking-widest">Nom. {torn.drivers?.[0]?.nomina} {torn.drivers?.[0]?.tipus_torn ? `(${torn.drivers?.[0].tipus_torn})` : ''}</p>
                                                <span className="text-[8px] font-bold text-gray-400 dark:text-gray-500 uppercase">Durada: {torn.duracio}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 text-fgc-grey dark:text-gray-300 shrink-0">
                                            <div className="flex flex-col items-end">
                                                <div className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-950/20 px-3 py-1 rounded-lg border border-orange-100 dark:border-orange-900/40 transition-colors">
                                                    <span className="text-[10px] font-black uppercase text-orange-700 dark:text-orange-400">{formatFgcTime(getFgcMinutes(torn.final_torn))}</span>
                                                    <ArrowRight size={10} className="text-orange-300" />
                                                    <span className="text-[10px] font-black uppercase text-orange-700 dark:text-orange-400">{formatFgcTime(torn.extData?.estimatedReturn)}</span>
                                                </div>
                                                <span className="text-[8px] font-black text-orange-400 uppercase tracking-tighter mt-1">Extra: +{torn.extData?.extraNeeded || 0} min</span>
                                            </div>
                                            <div className="text-[10px] font-black text-white bg-orange-500 px-3 py-1 rounded-lg border border-orange-600 min-w-[100px] text-center shadow-sm">{Math.floor((525 - ((torn.extData?.originalDuration || 0) + (torn.extData?.extraNeeded || 0))))} MIN MARGE</div>
                                        </div>
                                    </div>
                                    <div className="flex gap-1 shrink-0">{torn.drivers?.[0]?.phones?.map((p: string, i: number) => (<a key={i} href={isPrivacyMode ? undefined : `tel:${p}`} className={`w-8 h-8 bg-orange-500 text-white rounded-lg flex items-center justify-center hover:bg-orange-600 transition-all shadow-sm ${isPrivacyMode ? 'cursor-default' : ''}`}><Phone size={12} /></a>))}</div>
                                </div>
                            ))}</div>) : (<div className="bg-gray-50/50 dark:bg-black/20 rounded-2xl p-6 text-center border border-dashed border-gray-200 dark:border-white/10 transition-colors"><p className="text-gray-400 dark:text-gray-600 font-bold italic text-xs">Cap torn extensible fins al final.</p></div>)}
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-2 px-2"><Repeat className="text-indigo-500" size={16} /><h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Perllongament + Reserva ({reserveInterceptResults.length})</h3></div>
                            {reserveInterceptResults.length > 0 ? (
                                <div className="flex flex-col gap-2">
                                    {reserveInterceptResults.map((torn, idx) => (
                                        <div key={idx} className="bg-white dark:bg-gray-800 rounded-2xl p-3 border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md transition-all flex flex-col gap-3 border-l-4 border-l-indigo-500">
                                            <div className="flex items-center gap-4">
                                                <div className="h-10 min-w-[2.5rem] px-2 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 rounded-xl flex items-center justify-center font-black text-xs shadow-sm shrink-0 whitespace-nowrap">{torn.id}</div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-xs sm:text-sm font-black text-fgc-grey dark:text-gray-200 truncate">{torn.drivers?.[0]?.cognoms}, {torn.drivers?.[0]?.nom}</p>
                                                    </div>
                                                    <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-0.5">Nom. {torn.drivers?.[0]?.nomina} {torn.drivers?.[0]?.tipus_torn ? `(${torn.drivers?.[0].tipus_torn})` : ''}</p>
                                                </div>
                                                <div className="flex items-center gap-3 shrink-0">
                                                    <div className="hidden sm:flex flex-col items-end mr-1">
                                                        <span className="text-[10px] font-black text-fgc-grey dark:text-gray-300 uppercase tracking-tighter">Horari Torn</span>
                                                        <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400">{torn.inici_torn} — {torn.final_torn}</span>
                                                        <span className="text-[9px] font-black text-red-500 dark:text-red-400 mt-0.5">LÍMIT (+45'): {formatFgcTime((getFgcMinutes(torn.final_torn) || 0) + 45)}</span>
                                                    </div>
                                                    <div className="flex gap-1">{torn.drivers?.[0]?.phones?.map((p: string, i: number) => (<a key={i} href={isPrivacyMode ? undefined : `tel:${p}`} className={`w-8 h-8 bg-indigo-500 text-white rounded-lg flex items-center justify-center hover:bg-indigo-600 transition-all shadow-sm ${isPrivacyMode ? 'cursor-default' : ''}`}><Phone size={12} /></a>))}</div>
                                                </div>
                                            </div>

                                            {/* Options List */}
                                            <div className="space-y-2 pl-2 border-l-2 border-dashed border-gray-200 dark:border-gray-700 ml-5">
                                                {torn.resOptions?.map((opt: any, optIdx: number) => (
                                                    <div key={optIdx} className="bg-gray-50 dark:bg-black/20 p-2 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <div className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0">{opt.reserveBase}</div>
                                                            <ArrowRight size={10} className="text-gray-400 shrink-0" />
                                                            <div className="flex items-center gap-1 min-w-0">
                                                                <span className="text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase whitespace-nowrap">
                                                                    {opt.reserveId}
                                                                </span>
                                                                <span className="text-[9px] text-gray-500 dark:text-gray-400 font-medium truncate">
                                                                    a <span className="font-bold">{opt.station}</span> ({opt.interceptTime})
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Return Info for Reserve */}
                                                        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 justify-end min-w-0">
                                                            {/* Reserve Return */}
                                                            {opt.returnCirc ? (
                                                                <div className="flex items-center gap-1 text-[9px] shrink-0" title="Retorn Reserva">
                                                                    <span className="text-gray-400 uppercase tracking-wider font-bold hidden sm:inline">R:</span>
                                                                    <div className="flex items-center gap-1 bg-white dark:bg-black/40 px-1.5 py-0.5 rounded border border-gray-100 dark:border-white/10">
                                                                        <Train size={10} className="text-gray-400" />
                                                                        <span className="font-bold text-fgc-grey dark:text-gray-300">{opt.returnCirc.id}</span>
                                                                        <span className="text-gray-400">({opt.returnCirc.start}-{opt.returnCirc.end})</span>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <span className="text-[9px] text-red-400 italic shrink-0" title="Retorn Reserva">Res: Sense retorn</span>
                                                            )}

                                                            {/* Driver Return */}
                                                            {opt.driverReturnCirc ? (
                                                                <div className="flex items-center gap-1 text-[9px] shrink-0" title="Retorn Maquinista">
                                                                    <span className="text-gray-400 uppercase tracking-wider font-bold hidden sm:inline">M:</span>
                                                                    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${opt.isOverLimit ? 'bg-red-500/10 border-red-500 text-red-600 dark:text-red-400 font-black' : 'bg-white dark:bg-black/40 border-gray-100 dark:border-white/10 text-fgc-grey dark:text-gray-300'}`}>
                                                                        <Train size={10} className={opt.isOverLimit ? 'text-red-500' : 'text-gray-400'} />
                                                                        <span className={opt.isOverLimit ? '' : 'text-fgc-grey dark:text-gray-300'}>{opt.driverReturnCirc.id}</span>
                                                                        <span className={opt.isOverLimit ? 'text-red-600/70' : 'text-gray-400'}>({opt.driverReturnCirc.start}-{opt.driverReturnCirc.end})</span>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <span className="text-[9px] text-red-400 italic shrink-0" title="Retorn Maquinista">Maq: Sense retorn</span>
                                                            )}

                                                            <div className={`text-[9px] font-black text-white px-2 py-0.5 rounded shadow-sm shrink-0 uppercase ${opt.isOverLimit ? 'bg-red-500 animate-pulse' : 'bg-indigo-500'}`}>
                                                                MARGE: {opt.margin} min
                                                            </div>
                                                            <a
                                                                href={`mailto:gpoperacions_@fgc.cat?subject=${encodeURIComponent(`Perllongament MQ BV - Torn ${torn.id}`)}&body=${encodeURIComponent(`Bon dia,\n\nS'informa que el maquinista ${torn.drivers?.[0]?.nom} ${torn.drivers?.[0]?.cognoms} del torn ${torn.id} finalitzarà la seva jornada a les ${opt.actualEndTime || formatFgcTime((getFgcMinutes(torn.final_torn) || 0) + 45 - opt.margin)} per necessitat del servei (cobertura d'incidència).\n\nPreguem realitzin la modificació corresponent al sistema SAP.\n\nMoltes gràcies,`)}`}
                                                                className="w-8 h-8 bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400 rounded-lg flex items-center justify-center hover:bg-gray-200 dark:hover:bg-white/20 transition-all shadow-sm active:scale-90"
                                                                title="Enviar correu a GPO"
                                                            >
                                                                <Mail size={12} />
                                                            </a>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="bg-gray-50/50 dark:bg-black/20 rounded-2xl p-6 text-center border border-dashed border-gray-200 dark:border-white/10 transition-colors">
                                    <p className="text-gray-400 dark:text-gray-600 font-bold italic text-xs">Cap possibilitat d'intercepció amb reserves.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {!passengerResults.length && !adjacentResults.anterior.length && !adjacentResults.posterior.length && !restingResults.length && !extensibleResults.length && !reserveInterceptResults.length && (
                        <div className="py-20 text-center space-y-4 opacity-40">
                            <div className="w-20 h-20 bg-gray-50 dark:bg-black/20 rounded-full flex items-center justify-center mx-auto text-gray-200 dark:text-gray-800"><User size={40} /></div>
                            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest italic">No s'han trobat opcions de cobertura.</p>
                        </div>
                    )}

                </div>
            )}
        </div>
    );
};

export default IncidentDashboard;
