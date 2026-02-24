import React, { useState, useEffect } from 'react';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, Moon, Sun, Wind, MapPin } from 'lucide-react';

interface WeatherData {
    temperature: number;
    windSpeed: number;
    weatherCode: number;
    isDay: boolean;
}

export const WeatherWidget: React.FC = () => {
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        const fetchWeather = async (lat: number = 41.3879, lon: number = 2.1699) => {
            try {
                const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,is_day,weather_code,wind_speed_10m&timezone=Europe%2FBerlin`);

                if (!res.ok) throw new Error('API Error');

                const data = await res.json();
                setWeather({
                    temperature: Math.round(data.current.temperature_2m),
                    windSpeed: Math.round(data.current.wind_speed_10m),
                    weatherCode: data.current.weather_code,
                    isDay: data.current.is_day === 1,
                });
                setError(false);
            } catch (err) {
                console.error("Error fetching weather:", err);
                setError(true);
            } finally {
                setLoading(false);
            }
        };

        const initWeather = () => {
            if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        fetchWeather(position.coords.latitude, position.coords.longitude);
                    },
                    (err) => {
                        console.warn("Geolocation denied or error, using default BCN:", err);
                        fetchWeather(); // Default to BCN
                    },
                    { timeout: 10000 }
                );
            } else {
                fetchWeather();
            }
        };

        initWeather();
        // Refresh every 10 minutes
        const interval = setInterval(initWeather, 10 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    // WMO Weather interpretation codes
    const getWeatherIcon = (code: number, isDay: boolean) => {
        if (code === 0) return isDay ? <Sun size={14} className="text-amber-500" /> : <Moon size={14} className="text-gray-400" />; // Clear sky
        if (code === 1 || code === 2 || code === 3) return <Cloud size={14} className="text-gray-400 dark:text-gray-300" />; // Mainly clear, partly cloudy, and overcast
        if (code === 45 || code === 48) return <CloudFog size={14} className="text-gray-400" />; // Fog
        if (code === 51 || code === 53 || code === 55 || code === 56 || code === 57) return <CloudDrizzle size={14} className="text-blue-400" />; // Drizzle
        if (code === 61 || code === 63 || code === 65 || code === 66 || code === 67) return <CloudRain size={14} className="text-blue-500" />; // Rain
        if (code === 71 || code === 73 || code === 75 || code === 77 || code === 85 || code === 86) return <CloudSnow size={14} className="text-sky-300" />; // Snow
        if (code === 80 || code === 81 || code === 82) return <CloudRain size={14} className="text-blue-500" />; // Rain showers
        if (code === 95 || code === 96 || code === 99) return <CloudLightning size={14} className="text-yellow-500" />; // Thunderstorm
        // fallback
        return isDay ? <Sun size={14} className="text-amber-500" /> : <Moon size={14} className="text-gray-400" />;
    };

    if (loading) {
        return <div className="animate-pulse h-6 w-24 bg-gray-200 dark:bg-gray-800 rounded-full"></div>;
    }

    if (error || !weather) {
        return null;
    }

    return (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white/50 dark:bg-black/20 backdrop-blur-md rounded-full border border-gray-200/50 dark:border-white/5 shadow-sm">
            {getWeatherIcon(weather.weatherCode, weather.isDay)}
            <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-gray-800 dark:text-gray-200">{weather.temperature}°C</span>
                <MapPin size={8} className="text-fgc-green animate-pulse" />
            </div>
            <span className="opacity-30 mx-0.5">•</span>
            <Wind size={12} className="text-gray-400" />
            <span className="text-[10px] text-gray-500 font-medium">{weather.windSpeed} km/h</span>
        </div>
    );
};
