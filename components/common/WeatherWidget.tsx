import React, { useState, useEffect, useRef } from 'react';
import {
    Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow,
    Moon, Sun, Wind, MapPin, Eye, Droplets, Thermometer, Gauge,
    Sunset, Sunrise, X, Activity, CloudSun
} from 'lucide-react';

interface WeatherCurrent {
    temperature: number;
    apparentTemperature: number;
    humidity: number;
    windSpeed: number;
    windGusts: number;
    windDirection: number;
    weatherCode: number;
    isDay: boolean;
    visibility: number;
    precipitationProbability: number;
    cloudCover: number;
    pressure: number;
}

interface WeatherDaily {
    sunrise: string;
    sunset: string;
    tempMax: number;
    tempMin: number;
    precipSum: number;
    uvIndex: number;
    windMax: number;
}

interface WeatherData {
    current: WeatherCurrent;
    daily: WeatherDaily;
    lat: number;
    lon: number;
}

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

export const WeatherWidget: React.FC = () => {
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [open, setOpen] = useState(false);
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchWeather = async (lat: number = 41.3879, lon: number = 2.1699) => {
            try {
                const params = [
                    `latitude=${lat}`,
                    `longitude=${lon}`,
                    `current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day,visibility,precipitation_probability,cloud_cover,pressure_msl`,
                    `daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max,wind_speed_10m_max`,
                    `timezone=Europe%2FBerlin`,
                    `forecast_days=1`
                ].join('&');

                const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
                if (!res.ok) throw new Error('API Error');
                const data = await res.json();
                const c = data.current;
                const d = data.daily;
                setWeather({
                    current: {
                        temperature: Math.round(c.temperature_2m),
                        apparentTemperature: Math.round(c.apparent_temperature),
                        humidity: c.relative_humidity_2m,
                        windSpeed: Math.round(c.wind_speed_10m),
                        windGusts: Math.round(c.wind_gusts_10m),
                        windDirection: c.wind_direction_10m,
                        weatherCode: c.weather_code,
                        isDay: c.is_day === 1,
                        visibility: Math.round(c.visibility / 100) / 10, // km
                        precipitationProbability: c.precipitation_probability || 0,
                        cloudCover: c.cloud_cover,
                        pressure: Math.round(c.pressure_msl),
                    },
                    daily: {
                        sunrise: d.sunrise?.[0] || '',
                        sunset: d.sunset?.[0] || '',
                        tempMax: Math.round(d.temperature_2m_max?.[0] ?? 0),
                        tempMin: Math.round(d.temperature_2m_min?.[0] ?? 0),
                        precipSum: Math.round((d.precipitation_sum?.[0] ?? 0) * 10) / 10,
                        uvIndex: Math.round(d.uv_index_max?.[0] ?? 0),
                        windMax: Math.round(d.wind_speed_10m_max?.[0] ?? 0),
                    },
                    lat, lon
                });
                setError(false);
            } catch (err) {
                console.error('Weather error:', err);
                setError(true);
            } finally {
                setLoading(false);
            }
        };

        const init = () => {
            if ('geolocation' in navigator) {
                navigator.geolocation.getCurrentPosition(
                    p => fetchWeather(p.coords.latitude, p.coords.longitude),
                    () => fetchWeather(),
                    { timeout: 10000 }
                );
            } else fetchWeather();
        };

        init();
        const id = setInterval(init, 10 * 60 * 1000);
        return () => clearInterval(id);
    }, []);

    // Close on Escape
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open]);

    if (loading) return <div className="animate-pulse h-6 w-28 bg-gray-200 dark:bg-white/10 rounded-full" />;
    if (error || !weather) return null;

    const { current: w, daily: d } = weather;
    const desc = WMO_DESCRIPTIONS[w.weatherCode] || 'Desconegut';
    const uv = getUVLabel(d.uvIndex);

    return (
        <>
            {/* ── Compact chip (always visible) ── */}
            <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/50 dark:bg-black/20 backdrop-blur-md rounded-full border border-gray-200/50 dark:border-white/5 shadow-sm hover:shadow-md hover:scale-[1.03] transition-all cursor-pointer group"
                title="Veure detall meteorològic"
            >
                {getWeatherIcon(w.weatherCode, w.isDay)}
                <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-gray-800 dark:text-gray-200">{w.temperature}°C</span>
                    <MapPin size={8} className="text-fgc-green animate-pulse" />
                </div>
                <span className="opacity-30 mx-0.5">•</span>
                <Wind size={12} className="text-gray-400" />
                <span className="text-[10px] text-gray-500 font-medium">{w.windSpeed} km/h</span>
            </button>

            {/* ── Full Weather Modal ── */}
            {open && (
                <div
                    className="fixed inset-0 z-[200] flex items-start justify-end p-4 pt-16 sm:pt-20"
                    onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
                >
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in duration-200" />

                    {/* Panel */}
                    <div
                        ref={modalRef}
                        className="relative z-10 w-full max-w-sm bg-white/90 dark:bg-[#1a1f2e]/95 backdrop-blur-2xl border border-gray-200/60 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-top-4 duration-300"
                    >
                        {/* Header gradient */}
                        <div className={`relative px-6 pt-6 pb-8 ${w.isDay
                            ? 'bg-gradient-to-br from-sky-400/20 via-blue-300/10 to-transparent'
                            : 'bg-gradient-to-br from-indigo-900/40 via-slate-800/20 to-transparent'}`}
                        >
                            <button
                                onClick={() => setOpen(false)}
                                className="absolute top-4 right-4 p-1.5 rounded-full bg-white/20 dark:bg-white/10 hover:bg-white/30 dark:hover:bg-white/20 transition-all"
                            >
                                <X size={14} className="text-gray-600 dark:text-gray-300" />
                            </button>

                            <div className="flex items-start gap-4">
                                <div className="flex-none">
                                    {getWeatherIcon(w.weatherCode, w.isDay, 52, 'drop-shadow-lg')}
                                </div>
                                <div>
                                    <div className="text-4xl font-black text-gray-800 dark:text-white tabular-nums leading-none">
                                        {w.temperature}°
                                    </div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400 font-semibold mt-1">{desc}</div>
                                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-1">
                                        <Thermometer size={10} />
                                        Sensació tèrmica {w.apparentTemperature}°C
                                    </div>
                                </div>
                            </div>

                            {/* Max / Min */}
                            <div className="flex items-center gap-3 mt-4">
                                <span className="text-xs font-bold text-red-500">↑ {d.tempMax}°</span>
                                <span className="text-xs font-bold text-blue-500">↓ {d.tempMin}°</span>
                                <span className="text-[10px] text-gray-400 ml-auto flex items-center gap-1">
                                    <MapPin size={9} className="text-fgc-green" />
                                    {weather.lat.toFixed(3)}, {weather.lon.toFixed(3)}
                                </span>
                            </div>
                        </div>

                        {/* Grid stats */}
                        <div className="px-5 py-4 grid grid-cols-3 gap-3">
                            {/* Humidity */}
                            <StatTile
                                icon={<Droplets size={15} className="text-blue-400" />}
                                label="Humitat"
                                value={`${w.humidity}%`}
                            />
                            {/* Visibility */}
                            <StatTile
                                icon={<Eye size={15} className="text-indigo-400" />}
                                label="Visibilitat"
                                value={`${w.visibility} km`}
                                alert={w.visibility < 1}
                            />
                            {/* Cloud */}
                            <StatTile
                                icon={<Cloud size={15} className="text-gray-400" />}
                                label="Nuvolositat"
                                value={`${w.cloudCover}%`}
                            />
                            {/* Wind */}
                            <StatTile
                                icon={<Wind size={15} className="text-teal-400" />}
                                label="Vent"
                                value={`${w.windSpeed} km/h`}
                                sub={getWindDir(w.windDirection)}
                            />
                            {/* Wind gusts */}
                            <StatTile
                                icon={<Activity size={15} className="text-orange-400" />}
                                label="Ratxes"
                                value={`${w.windGusts} km/h`}
                                alert={w.windGusts > 60}
                            />
                            {/* Pressure */}
                            <StatTile
                                icon={<Gauge size={15} className="text-purple-400" />}
                                label="Pressió"
                                value={`${w.pressure} hPa`}
                            />
                        </div>

                        {/* Precip & UV row */}
                        <div className="px-5 pb-4 grid grid-cols-2 gap-3">
                            <div className="flex items-center gap-3 px-3 py-2.5 bg-blue-50 dark:bg-blue-500/10 rounded-2xl border border-blue-100 dark:border-blue-500/20">
                                <CloudRain size={16} className="text-blue-400 flex-none" />
                                <div>
                                    <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Precipitació</div>
                                    <div className="text-sm font-black text-gray-800 dark:text-white">{w.precipitationProbability}%
                                        <span className="text-[10px] font-normal text-gray-400 ml-1">prob.</span>
                                    </div>
                                    <div className="text-[10px] text-gray-400">{d.precipSum} mm avui</div>
                                </div>
                            </div>
                            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl border ${d.uvIndex >= 6
                                ? 'bg-orange-50 dark:bg-orange-500/10 border-orange-100 dark:border-orange-500/20'
                                : 'bg-gray-50 dark:bg-white/5 border-gray-100 dark:border-white/5'}`}
                            >
                                <Sun size={16} className="text-amber-400 flex-none" />
                                <div>
                                    <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Índex UV</div>
                                    <div className={`text-sm font-black ${uv.color}`}>{d.uvIndex}
                                        <span className="text-[10px] font-semibold ml-1">{uv.label}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Sunrise / Sunset */}
                        <div className="px-5 pb-5 flex items-center justify-between">
                            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-500/10 rounded-2xl border border-amber-100 dark:border-amber-500/20 flex-1 mr-2">
                                <Sunrise size={14} className="text-amber-400" />
                                <div>
                                    <div className="text-[9px] text-gray-400 uppercase tracking-wider font-semibold">Sortida sol</div>
                                    <div className="text-sm font-black text-gray-800 dark:text-white">{formatTime(d.sunrise)}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl border border-indigo-100 dark:border-indigo-500/20 flex-1">
                                <Sunset size={14} className="text-indigo-400" />
                                <div>
                                    <div className="text-[9px] text-gray-400 uppercase tracking-wider font-semibold">Posta sol</div>
                                    <div className="text-sm font-black text-gray-800 dark:text-white">{formatTime(d.sunset)}</div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-5 pb-4 text-center">
                            <p className="text-[9px] text-gray-400 dark:text-gray-600">Open-Meteo · Actualitzat en temps real</p>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

// ── Helper sub-component ──
const StatTile: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: string;
    sub?: string;
    alert?: boolean;
}> = ({ icon, label, value, sub, alert }) => (
    <div className={`flex flex-col gap-1 p-3 rounded-2xl border transition-all ${alert
        ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30'
        : 'bg-gray-50 dark:bg-white/[0.04] border-gray-100 dark:border-white/5'}`}
    >
        <div className="flex items-center gap-1.5">
            {icon}
            <span className="text-[9px] text-gray-400 dark:text-gray-500 font-semibold uppercase tracking-wide">{label}</span>
        </div>
        <div className={`text-sm font-black leading-none ${alert ? 'text-red-500' : 'text-gray-800 dark:text-white'}`}>{value}</div>
        {sub && <div className="text-[9px] text-gray-400 font-medium">{sub}</div>}
    </div>
);
