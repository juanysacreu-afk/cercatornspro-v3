import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import {
    Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow,
    Moon, Sun, Wind, MapPin, Eye, Droplets, Thermometer, Gauge,
    Sunset, Sunrise, X, Activity, CloudSun, Train, Radio, Compass,
    AlertTriangle, ShieldAlert, ShieldCheck
} from 'lucide-react';
import { STATION_GEO_DATA, haversineKm } from '../../utils/stationGeoData';
import {
    fetchHybridWeather,
    HybridWeatherData,
    WeatherAlert,
    METEOCAT_FGC_STATIONS,
    MeteocatFgcStation
} from '../../utils/meteocatService';

const WMO_DESCRIPTIONS: Record<number, string> = {
    0: 'Cel clar', 1: 'Principalment clar', 2: 'Parcialment nuvolat', 3: 'Cobert',
    45: 'Boira', 48: 'Boira gelant',
    51: 'Plugim fi', 53: 'Plugim moderat', 55: 'Plugim dens',
    61: 'Pluja lleu', 63: 'Pluja moderada', 65: 'Pluja forta',
    71: 'Neu lleu', 73: 'Neu moderada', 75: 'Neu forta', 77: 'Granissol',
    80: 'Ruixats lleus', 81: 'Ruixats moderats', 82: 'Ruixats violents',
    95: 'Tempesta', 96: 'Tempesta amb calamarsa', 99: 'Tempesta forta',
};

const getWindDir = (deg: number): string => {
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
    return dirs[Math.round(deg / 22.5) % 16];
};

const getUVLabel = (uv: number): { label: string; color: string } => {
    if (uv <= 2) return { label: 'Baix', color: 'text-green-500' };
    if (uv <= 5) return { label: 'Moderat', color: 'text-yellow-500' };
    if (uv <= 7) return { label: 'Alt', color: 'text-orange-500' };
    if (uv <= 10) return { label: 'Molt alt', color: 'text-red-500' };
    return { label: 'Extrem', color: 'text-purple-500' };
};

const formatTime = (iso: string): string => {
    try { return new Date(iso).toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' }); }
    catch { return '--:--'; }
};

function getWeatherIcon(code: number, isDay: boolean, size: number = 14, className: string = '') {
    if (code === 0) return isDay
        ? <Sun size={size} className={`text-amber-400 ${className}`} />
        : <Moon size={size} className={`text-indigo-300 ${className}`} />;
    if (code <= 3) return isDay
        ? <CloudSun size={size} className={`text-gray-400 ${className}`} />
        : <Cloud size={size} className={`text-gray-500 ${className}`} />;
    if (code === 45 || code === 48) return <CloudFog size={size} className={`text-gray-400 ${className}`} />;
    if (code >= 51 && code <= 57) return <CloudDrizzle size={size} className={`text-blue-400 ${className}`} />;
    if (code >= 61 && code <= 67) return <CloudRain size={size} className={`text-blue-500 ${className}`} />;
    if (code >= 71 && code <= 77) return <CloudSnow size={size} className={`text-sky-300 ${className}`} />;
    if (code >= 80 && code <= 82) return <CloudRain size={size} className={`text-blue-500 ${className}`} />;
    if (code >= 95) return <CloudLightning size={size} className={`text-yellow-400 ${className}`} />;
    return isDay ? <Sun size={size} className={`text-amber-400 ${className}`} /> : <Moon size={size} className={`text-indigo-300 ${className}`} />;
}

const STORAGE_COORDS_KEY = 'cercatorns_last_weather_coords';

const getInitialCoords = (): { lat: number; lon: number } => {
    try {
        const saved = localStorage.getItem(STORAGE_COORDS_KEY);
        if (saved) {
            const p = JSON.parse(saved);
            if (typeof p.lat === 'number' && typeof p.lon === 'number') {
                return p;
            }
        }
    } catch {}
    return { lat: 41.3879, lon: 2.1699 };
};

export const WeatherWidget: React.FC = () => {
    const [weather, setWeather] = useState<HybridWeatherData | null>(null);
    const [loading, setLoading] = useState(true);
    const [switching, setSwitching] = useState(false);
    const [error, setError] = useState(false);
    const [open, setOpen] = useState(false);
    const [userCoords, setUserCoords] = useState<{ lat: number; lon: number }>(getInitialCoords);
    const [selectedStationId, setSelectedStationId] = useState<string>('auto');
    const modalRef = useRef<HTMLDivElement>(null);

    const loadData = async (lat: number, lon: number, explicitStation?: string) => {
        try {
            const data = await fetchHybridWeather(
                lat,
                lon,
                explicitStation === 'auto' ? undefined : explicitStation
            );
            setWeather(data);
            setError(false);
        } catch (err) {
            console.error('[WeatherWidget] Error loading weather:', err);
            setError(true);
        } finally {
            setLoading(false);
            setSwitching(false);
        }
    };

    // Initial Geolocation & fetch
    useEffect(() => {
        let isMounted = true;

        const init = () => {
            if ('geolocation' in navigator) {
                navigator.geolocation.getCurrentPosition(
                    p => {
                        if (!isMounted) return;
                        const coords = { lat: p.coords.latitude, lon: p.coords.longitude };
                        try {
                            localStorage.setItem(STORAGE_COORDS_KEY, JSON.stringify(coords));
                        } catch {}
                        setUserCoords(coords);
                        loadData(coords.lat, coords.lon, selectedStationId);
                    },
                    (geoErr) => {
                        console.warn('[WeatherWidget] Geolocation error or permission denied:', geoErr.message);
                        if (!isMounted) return;
                        loadData(userCoords.lat, userCoords.lon, selectedStationId);
                    },
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
                );
            } else {
                loadData(userCoords.lat, userCoords.lon, selectedStationId);
            }
        };

        init();
        const id = setInterval(() => {
            loadData(userCoords.lat, userCoords.lon, selectedStationId);
        }, 10 * 60 * 1000);

        return () => {
            isMounted = false;
            clearInterval(id);
        };
    }, []);

    // Handle station selector change
    const handleStationSelect = (stationId: string) => {
        if (stationId === selectedStationId && !switching) return;
        setSelectedStationId(stationId);
        setSwitching(true);
        loadData(userCoords.lat, userCoords.lon, stationId);
    };

    // Close on Escape or outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open]);

    // Prevent body scroll when modal open
    useEffect(() => {
        if (open) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [open]);

    if (loading) return <div className="animate-pulse h-6 w-32 bg-gray-200 dark:bg-white/10 rounded-full" />;
    if (error || !weather) return null;

    const { current: w, daily: d, stationInfo } = weather;
    const desc = WMO_DESCRIPTIONS[w.weatherCode] || 'Desconegut';
    const uv = getUVLabel(d.uvIndex);
    const isMeteocat = weather.source === 'hybrid';
    const nearestFgc = getNearestStationInfo(weather.lat, weather.lon);

    return (
        <>
            {/* ── Compact chip (always visible on Dashboard header) ── */}
            <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/70 dark:bg-black/30 backdrop-blur-md rounded-full border border-gray-200/60 dark:border-white/10 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all cursor-pointer group"
                title={`Meteo FGC · ${weather.municipality} · Clic per veure detall de sensors i previsió`}
            >
                {getWeatherIcon(w.weatherCode, w.isDay)}
                <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black text-gray-800 dark:text-gray-100 tabular-nums">
                        {w.temperature}°C
                    </span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[#75990F]/15 text-[#5e7c0c] dark:text-[#A8D017]">
                        <MapPin size={9} className="text-fgc-green animate-pulse" />
                        {weather.municipality}
                    </span>
                </div>
                <span className="opacity-25 mx-0.5">•</span>
                <Wind size={12} className="text-gray-400 group-hover:text-teal-500 transition-colors" />
                <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">{w.windSpeed} km/h</span>
                {weather.alerts && weather.alerts.length > 0 && (
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black animate-pulse ${
                        weather.alerts.some(a => a.level === 'red')
                            ? 'bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30'
                            : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                    }`}>
                        <AlertTriangle size={10} />
                        {weather.alerts[0].type.toUpperCase()}
                    </span>
                )}
            </button>

            {/* ── Full Weather Modal via Portal ── */}
            {open && ReactDOM.createPortal(
                <div
                    className="fixed inset-0 z-[9999] flex items-start justify-end p-3 sm:p-4 pt-14 sm:pt-16"
                    onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
                >
                    {/* Dimmed backdrop */}
                    <div
                        className="absolute inset-0 bg-black/45 backdrop-blur-sm animate-in fade-in duration-200"
                        onClick={() => setOpen(false)}
                    />

                    {/* Panel Container */}
                    <div
                        ref={modalRef}
                        className="relative z-10 w-full max-w-md bg-white dark:bg-slate-950 backdrop-blur-2xl border border-gray-200/80 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-top-4 duration-300 max-h-[92vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header Gradient */}
                        <div className={`relative px-5 pt-5 pb-6 flex-none ${w.isDay
                            ? 'bg-gradient-to-br from-sky-400/20 via-blue-200/10 to-transparent'
                            : 'bg-gradient-to-br from-indigo-950/60 via-slate-900/30 to-transparent'}`}
                        >
                            {/* Close Button */}
                            <button
                                onClick={() => setOpen(false)}
                                className="absolute top-4 right-4 p-1.5 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 transition-all z-20 text-gray-500 dark:text-gray-300"
                                title="Tancar"
                            >
                                <X size={15} />
                            </button>

                            {/* Station Selector Bar (CSO Operational Bases) */}
                            <div className="mb-3.5 pr-8">
                                <div className="text-[9px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5 flex items-center gap-1">
                                    <Compass size={10} className="text-[#75990F]" />
                                    Bases i Estacions FGC
                                </div>
                                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                                    <button
                                        onClick={() => handleStationSelect('auto')}
                                        disabled={switching}
                                        className={`flex-none px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${selectedStationId === 'auto'
                                            ? 'bg-[#75990F] text-white shadow-sm'
                                            : 'bg-white/70 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-white/10 border border-gray-200/40 dark:border-white/5'
                                            }`}
                                    >
                                        🛰️ Auto ({weather.isGpsAuto ? weather.municipality : 'GPS'})
                                    </button>
                                    {METEOCAT_FGC_STATIONS.map(st => (
                                        <button
                                            key={st.id}
                                            onClick={() => handleStationSelect(st.id)}
                                            disabled={switching}
                                            className={`flex-none px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${selectedStationId === st.id
                                                ? 'bg-[#75990F] text-white shadow-sm'
                                                : 'bg-white/70 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-white/10 border border-gray-200/40 dark:border-white/5'
                                                }`}
                                            title={st.name}
                                        >
                                            {st.shortName}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Main Weather Information */}
                            <div className="flex items-start gap-4">
                                <div className="flex-none pt-1">
                                    {getWeatherIcon(w.weatherCode, w.isDay, 56, 'drop-shadow-lg')}
                                </div>

                                <div className="flex-1 min-w-0">
                                    {/* Location & Sensor badge */}
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight truncate">
                                                {weather.municipality}
                                            </span>
                                            {weather.isGpsAuto ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/25">
                                                    <MapPin size={9} className="animate-pulse text-blue-500" />
                                                    GPS Detectat
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#75990F]/15 text-[#5e7c0c] dark:text-[#A8D017] border border-[#75990F]/25">
                                                    Base FGC
                                                </span>
                                            )}
                                        </div>

                                        {stationInfo && (
                                            <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium truncate mt-0.5 flex items-center gap-1">
                                                <Radio size={9} className="text-[#75990F] flex-none" />
                                                <span>
                                                    Sensor XEMA: {stationInfo.name} ({stationInfo.distanceKm} km)
                                                </span>
                                            </div>
                                        )}

                                        {nearestFgc && (
                                            <div className="flex items-center gap-1 text-[11px] font-bold text-[#75990F] dark:text-[#A8D017] mt-0.5">
                                                <Train size={11} strokeWidth={2.5} />
                                                <span>FGC {nearestFgc}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Big Temp and Conditions */}
                                    <div className="flex items-baseline gap-3 mt-2">
                                        <div className="text-4xl sm:text-5xl font-black text-gray-900 dark:text-white tabular-nums tracking-tighter">
                                            {w.temperature}°
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-gray-700 dark:text-gray-200">{desc}</div>
                                            <div className="text-[10px] text-gray-400 dark:text-gray-500 font-medium flex items-center gap-1 mt-0.5">
                                                <Thermometer size={10} />
                                                Sensació tèrmica {w.apparentTemperature}°C
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Max / Min & Sensor reading timestamp */}
                            <div className="flex items-center justify-between text-xs font-bold mt-3 pt-2 border-t border-gray-200/40 dark:border-white/5">
                                <div className="flex items-center gap-3">
                                    <span className="text-red-500">↑ {d.tempMax}°</span>
                                    <span className="text-blue-500">↓ {d.tempMin}°</span>
                                </div>
                                {stationInfo?.readingTime ? (
                                    <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500">
                                        Lectura física: {stationInfo.readingTime} h
                                    </span>
                                ) : (
                                    <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500">
                                        En temps real
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Scrollable Body: Alerts, Sensors & Forecast */}
                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 no-scrollbar">
                            {/* Emergency Alerts Section */}
                            {weather.alerts && weather.alerts.length > 0 ? (
                                <div className="space-y-2">
                                    <div className="text-[9px] font-black uppercase tracking-wider text-red-500 dark:text-red-400 flex items-center gap-1.5">
                                        <AlertTriangle size={12} className="animate-pulse" />
                                        Alertes i Avisos per a la Circulació
                                    </div>
                                    {weather.alerts.map((alert) => (
                                        <div
                                            key={alert.id}
                                            className={`p-3 rounded-2xl border flex items-start gap-2.5 shadow-sm transition-all ${
                                                alert.level === 'red'
                                                    ? 'bg-red-50/80 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-950 dark:text-red-200'
                                                    : 'bg-amber-50/80 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-950 dark:text-amber-200'
                                            }`}
                                        >
                                            <AlertTriangle
                                                size={18}
                                                className={`flex-none mt-0.5 ${
                                                    alert.level === 'red' ? 'text-red-500' : 'text-amber-500'
                                                }`}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-1.5 flex-wrap">
                                                    <span className="text-xs font-black uppercase tracking-tight">
                                                        {alert.title}
                                                    </span>
                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/70 dark:bg-white/10 border border-black/5 dark:border-white/5">
                                                        {alert.source}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] font-medium mt-1 leading-snug opacity-90">
                                                    {alert.description}
                                                </p>
                                                <div className="mt-2 text-[10px] font-bold flex items-center gap-1.5 text-gray-800 dark:text-gray-100 bg-white/80 dark:bg-white/10 px-2.5 py-1.5 rounded-xl border border-black/5 dark:border-white/5">
                                                    <Train size={12} className="flex-none text-[#75990F]" />
                                                    <span>Impacte FGC: {alert.impactFgc}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-[#75990F]/10 border border-[#75990F]/20 text-[#547008] dark:text-[#A8D017]">
                                    <ShieldCheck size={16} className="flex-none text-[#75990F]" />
                                    <span className="text-[11px] font-bold">
                                        Sense alertes meteorològiques a la zona · Condicions normals de via
                                    </span>
                                </div>
                            )}

                            {/* Grid stats (6 items) */}
                            <div>
                                <div className="text-[9px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                                    Lectures de Sensors i Atmosfera
                                </div>
                                <div className="grid grid-cols-3 gap-2.5">
                                    <StatTile
                                        icon={<Droplets size={14} className="text-blue-400" />}
                                        label="Humitat"
                                        value={`${w.humidity}%`}
                                        sub={isMeteocat ? 'Sensor XEMA' : undefined}
                                    />
                                    <StatTile
                                        icon={<Wind size={14} className="text-teal-400" />}
                                        label="Vent"
                                        value={`${w.windSpeed} km/h`}
                                        sub={getWindDir(w.windDirection)}
                                    />
                                    <StatTile
                                        icon={<Activity size={14} className="text-orange-400" />}
                                        label="Ratxa Màx."
                                        value={`${w.windGusts} km/h`}
                                        alert={w.windGusts > 50}
                                        sub={w.windGusts > 50 ? 'Alerta vent' : (isMeteocat ? 'Anemòmetre' : undefined)}
                                    />
                                    <StatTile
                                        icon={<Gauge size={14} className="text-purple-400" />}
                                        label="Pressió"
                                        value={`${w.pressure} hPa`}
                                    />
                                    <StatTile
                                        icon={<Eye size={14} className="text-indigo-400" />}
                                        label="Visibilitat"
                                        value={`${w.visibility} km`}
                                        alert={w.visibility < 1}
                                    />
                                    <StatTile
                                        icon={<Cloud size={14} className="text-gray-400" />}
                                        label="Nuvols"
                                        value={`${w.cloudCover}%`}
                                    />
                                </div>
                            </div>

                            {/* Precip & UV row */}
                            <div className="grid grid-cols-2 gap-2.5">
                                <div className="flex items-center gap-3 p-3 bg-blue-50/60 dark:bg-blue-500/10 rounded-2xl border border-blue-100/60 dark:border-blue-500/20">
                                    <CloudRain size={16} className="text-blue-500 dark:text-blue-400 flex-none" />
                                    <div>
                                        <div className="text-[9px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">
                                            Precipitació
                                        </div>
                                        <div className="text-sm font-black text-gray-800 dark:text-white">
                                            {w.precipitationProbability}%
                                            <span className="text-[10px] font-normal text-gray-400 ml-1">prob.</span>
                                        </div>
                                        <div className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
                                            {d.precipSum} mm acumulats avui
                                        </div>
                                    </div>
                                </div>

                                <div className={`flex items-center gap-3 p-3 rounded-2xl border ${d.uvIndex >= 6
                                    ? 'bg-orange-50/60 dark:bg-orange-500/10 border-orange-100/60 dark:border-orange-500/20'
                                    : 'bg-gray-50/60 dark:bg-white/5 border-gray-100/60 dark:border-white/5'
                                    }`}
                                >
                                    <Sun size={16} className="text-amber-500 dark:text-amber-400 flex-none" />
                                    <div>
                                        <div className="text-[9px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">
                                            Índex UV
                                        </div>
                                        <div className={`text-sm font-black ${uv.color}`}>
                                            {d.uvIndex}
                                            <span className="text-[10px] font-semibold ml-1">{uv.label}</span>
                                        </div>
                                        <div className="text-[10px] text-gray-400 dark:text-gray-500">
                                            Radiació màx. solar
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Sunrise / Sunset */}
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-2.5 px-3 py-2 bg-amber-50/60 dark:bg-amber-500/10 rounded-2xl border border-amber-100/60 dark:border-amber-500/20 flex-1">
                                    <Sunrise size={14} className="text-amber-500" />
                                    <div>
                                        <div className="text-[9px] text-gray-400 uppercase tracking-wider font-semibold">Sortida sol</div>
                                        <div className="text-xs font-black text-gray-800 dark:text-white">{formatTime(d.sunrise)}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2.5 px-3 py-2 bg-indigo-50/60 dark:bg-indigo-500/10 rounded-2xl border border-indigo-100/60 dark:border-indigo-500/20 flex-1">
                                    <Sunset size={14} className="text-indigo-400" />
                                    <div>
                                        <div className="text-[9px] text-gray-400 uppercase tracking-wider font-semibold">Posta sol</div>
                                        <div className="text-xs font-black text-gray-800 dark:text-white">{formatTime(d.sunset)}</div>
                                    </div>
                                </div>
                            </div>

                            {/* 7-8 Days Official Forecast (SMC / Meteocat) */}
                            {weather.forecast && weather.forecast.length > 0 && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[9px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                            Previsió Oficial · {weather.municipality} ({weather.forecast.length} dies)
                                        </span>
                                        {isMeteocat && (
                                            <span className="text-[9px] font-bold text-[#75990F] dark:text-[#A8D017]">
                                                SMC Oficial
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                                        {weather.forecast.map((day, idx) => {
                                            const dateObj = new Date(day.date);
                                            const dayName = new Intl.DateTimeFormat('ca-ES', { weekday: 'short' }).format(dateObj).replace('.', '');
                                            return (
                                                <div
                                                    key={idx}
                                                    className="flex-none w-16 p-2 rounded-2xl bg-gray-50/70 dark:bg-white/[0.03] border border-gray-100/70 dark:border-white/5 flex flex-col items-center justify-center text-center transition-all hover:bg-gray-100/70 dark:hover:bg-white/[0.06]"
                                                >
                                                    <span className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                                                        {dayName}
                                                    </span>
                                                    <div className="my-0.5">
                                                        {getWeatherIcon(day.weatherCode, true, 20, 'drop-shadow-sm')}
                                                    </div>
                                                    <div className="mt-1.5 text-[11px] font-black text-gray-800 dark:text-gray-200">
                                                        {day.tempMax}°
                                                    </div>
                                                    <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500">
                                                        {day.tempMin}°
                                                    </div>
                                                    {day.precipProbability !== undefined && day.precipProbability > 0 && (
                                                        <span className="text-[9px] font-bold text-blue-500 mt-1">
                                                            {day.precipProbability}%
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer with institutional source certification */}
                        <div className="px-5 py-3 border-t border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.01] flex items-center justify-between text-[9px] text-gray-400 dark:text-gray-500 flex-none">
                            <span>
                                {isMeteocat
                                    ? 'Servei Meteorològic de Catalunya (XEMA) + Open-Meteo'
                                    : 'Open-Meteo API'}
                            </span>
                            <span className="font-bold text-[#75990F]">FGC Operacions</span>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

// ── Helper Sub-component ──
const StatTile: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: string;
    sub?: string;
    alert?: boolean;
}> = ({ icon, label, value, sub, alert }) => (
    <div className={`flex flex-col gap-1 p-2.5 rounded-2xl border transition-all ${alert
        ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30'
        : 'bg-gray-50 dark:bg-white/[0.03] border-gray-100 dark:border-white/5'
        }`}
    >
        <div className="flex items-center gap-1.5">
            {icon}
            <span className="text-[9px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider truncate">
                {label}
            </span>
        </div>
        <div className={`text-sm font-black leading-none ${alert ? 'text-red-500' : 'text-gray-800 dark:text-slate-100'}`}>
            {value}
        </div>
        {sub && <div className="text-[9px] text-gray-400 dark:text-gray-500 font-medium truncate">{sub}</div>}
    </div>
);

// ── Pure logic helpers ──
function getNearestStationInfo(lat: number, lon: number): string {
    if (!STATION_GEO_DATA || STATION_GEO_DATA.length === 0) return '';

    let nearest = STATION_GEO_DATA[0];
    let minDist = haversineKm(lat, lon, nearest.lat, nearest.lon);

    for (let i = 1; i < STATION_GEO_DATA.length; i++) {
        const s = STATION_GEO_DATA[i];
        const d = haversineKm(lat, lon, s.lat, s.lon);
        if (d < minDist) {
            minDist = d;
            nearest = s;
        }
    }

    return `${nearest.name} (${minDist.toFixed(1)} km)`;
}

export default WeatherWidget;
