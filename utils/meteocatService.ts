/**
 * Meteocat (Servei Meteorològic de Catalunya) & Hybrid Weather Service
 * 
 * Provides official physical sensor readings from the XEMA network (Generalitat de Catalunya)
 * for stations along FGC lines (Vallès and Llobregat-Anoia networks) and official 8-day municipal forecasts.
 * 
 * Implements a hybrid architecture:
 * 1. Primary: Ground-truth sensor data from nearest XEMA weather station & official SMC forecast.
 * 2. Secondary / Enrichment: Complementary atmospheric variables (UV Index, Visibility, Cloud Cover, Sunrise/Sunset) from Open-Meteo.
 * 3. Resilient Fallback: If Meteocat API is unavailable or limits reached, gracefully falls back to Open-Meteo.
 */

import { haversineKm } from './stationGeoData';

export interface MeteocatFgcStation {
    id: string;
    name: string;
    shortName: string;
    municipalityCode: string;
    municipalityName: string;
    lat: number;
    lon: number;
    badge: string;
}

export interface WeatherCurrent {
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

export interface WeatherDaily {
    sunrise: string;
    sunset: string;
    tempMax: number;
    tempMin: number;
    precipSum: number;
    uvIndex: number;
    windMax: number;
}

export interface WeatherForecastDay {
    date: string;
    weatherCode: number;
    tempMax: number;
    tempMin: number;
    precipProbability?: number;
}

export interface HybridWeatherData {
    current: WeatherCurrent;
    daily: WeatherDaily;
    forecast: WeatherForecastDay[];
    lat: number;
    lon: number;
    municipality: string;
    nearestStation: string;
    source: 'meteocat-xema' | 'open-meteo' | 'hybrid';
    stationInfo?: {
        id: string;
        name: string;
        shortName: string;
        badge: string;
        readingTime?: string;
        distanceKm: number;
    };
}

/**
 * Key official Meteocat (XEMA) weather stations situated along FGC lines
 */
export const METEOCAT_FGC_STATIONS: MeteocatFgcStation[] = [
    {
        id: 'XV',
        name: 'Sant Cugat del Vallès - CAR',
        shortName: 'Sant Cugat',
        municipalityCode: '082055',
        municipalityName: 'Sant Cugat del Vallès',
        lat: 41.48318,
        lon: 2.07947,
        badge: 'Vallès / COR Rubí'
    },
    {
        id: 'YK',
        name: 'Terrassa',
        shortName: 'Terrassa',
        municipalityCode: '082798',
        municipalityName: 'Terrassa',
        lat: 41.55363,
        lon: 1.99006,
        badge: 'Línia S1 Terrassa'
    },
    {
        id: 'XF',
        name: 'Sabadell - Parc Agrari',
        shortName: 'Sabadell',
        municipalityCode: '081878',
        municipalityName: 'Sabadell',
        lat: 41.56568,
        lon: 2.06955,
        badge: 'Línia S2 Sabadell'
    },
    {
        id: 'X4',
        name: 'Barcelona - el Raval',
        shortName: 'Barcelona Centre',
        municipalityCode: '080193',
        municipalityName: 'Barcelona',
        lat: 41.38386,
        lon: 2.16774,
        badge: 'Pl. Catalunya / Sarrià'
    },
    {
        id: 'D5',
        name: 'Barcelona - Observatori Fabra',
        shortName: 'Collserola / Fabra',
        municipalityCode: '080193',
        municipalityName: 'Barcelona',
        lat: 41.41864,
        lon: 2.12379,
        badge: 'Collserola / Tibidabo'
    },
    {
        id: 'WN',
        name: 'Montserrat - Sant Dimes',
        shortName: 'Montserrat',
        municipalityCode: '081271',
        municipalityName: 'Monistrol de Montserrat',
        lat: 41.59539,
        lon: 1.83750,
        badge: 'Cremallera de Montserrat'
    },
    {
        id: 'XC',
        name: 'Castellbisbal',
        shortName: 'Baix Llobregat',
        municipalityCode: '080543',
        municipalityName: 'Castellbisbal',
        lat: 41.47892,
        lon: 1.97546,
        badge: 'Línia Llobregat-Anoia'
    },
    {
        id: 'XL',
        name: 'El Prat de Llobregat',
        shortName: 'El Prat / Sud',
        municipalityCode: '081691',
        municipalityName: 'El Prat de Llobregat',
        lat: 41.34054,
        lon: 2.08019,
        badge: 'Llobregat / Cornellà'
    }
];

const METEOCAT_DEFAULT_KEY = 'Hr2Qm4asTA3nTnHss5vjG2G4WBiwNjlh13lIA9g2';

export const getMeteocatApiKey = (): string => {
    const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_METEOCAT_API_KEY : undefined;
    const procEnv = typeof process !== 'undefined' ? process.env?.VITE_METEOCAT_API_KEY : undefined;
    return metaEnv || procEnv || METEOCAT_DEFAULT_KEY;
};

/**
 * Finds the closest Meteocat station to the given GPS coordinates
 */
export function findNearestMeteocatStation(lat: number, lon: number): { station: MeteocatFgcStation; distanceKm: number } {
    let nearest = METEOCAT_FGC_STATIONS[0];
    let minDist = haversineKm(lat, lon, nearest.lat, nearest.lon);

    for (let i = 1; i < METEOCAT_FGC_STATIONS.length; i++) {
        const s = METEOCAT_FGC_STATIONS[i];
        const dist = haversineKm(lat, lon, s.lat, s.lon);
        if (dist < minDist) {
            minDist = dist;
            nearest = s;
        }
    }

    return { station: nearest, distanceKm: minDist };
}

/**
 * Maps Meteocat's `estatCel` code (1..27) to standard WMO weather codes used by the widget icons
 */
export function mapMeteocatCelToWmo(estatCel?: number): number {
    if (!estatCel) return 0;
    if (estatCel === 1) return 0;   // Cel clar
    if (estatCel === 2) return 1;   // Poc ennuvolat
    if (estatCel === 3) return 2;   // Mig ennuvolat
    if (estatCel === 4) return 3;   // Cobert
    if (estatCel >= 10 && estatCel <= 19) return 45; // Boires
    if (estatCel === 20) return 51; // Plugim
    if (estatCel === 21) return 61; // Pluja lleu
    if (estatCel === 22) return 80; // Ruixats
    if (estatCel === 23) return 65; // Pluja forta
    if (estatCel === 24) return 95; // Tempesta
    if (estatCel === 25) return 96; // Tempesta amb calamarsa
    if (estatCel === 26) return 71; // Neu
    if (estatCel === 27) return 77; // Granissol
    return 1;
}

// ── In-memory caches to respect rate limits & provide sub-millisecond response ──
interface CacheItem<T> {
    data: T;
    timestamp: number;
}
const xemaVariableCache: Map<number, CacheItem<any[]>> = new Map();
const forecastCache: Map<string, CacheItem<any>> = new Map();

const XEMA_CACHE_TTL = 8 * 60 * 1000;      // 8 min (XEMA reports every 30 mins)
const FORECAST_CACHE_TTL = 30 * 60 * 1000;  // 30 min

/**
 * Fetches latest readings across Catalonia for a given XEMA measured variable
 */
async function fetchXemaVariable(variableCode: number, apiKey: string): Promise<any[] | null> {
    const now = Date.now();
    const cached = xemaVariableCache.get(variableCode);
    if (cached && (now - cached.timestamp < XEMA_CACHE_TTL)) {
        return cached.data;
    }

    try {
        const res = await fetch(`https://api.meteo.cat/xema/v1/variables/mesurades/${variableCode}/ultimes`, {
            headers: { 'X-Api-Key': apiKey }
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (Array.isArray(data)) {
            xemaVariableCache.set(variableCode, { data, timestamp: now });
            return data;
        }
        return null;
    } catch (err) {
        console.warn(`[Meteocat] Error fetching variable ${variableCode}:`, err);
        return null;
    }
}

/**
 * Fetches official 8-day municipal forecast from Meteocat
 */
async function fetchMeteocatForecast(muniCode: string, apiKey: string): Promise<any | null> {
    const now = Date.now();
    const cached = forecastCache.get(muniCode);
    if (cached && (now - cached.timestamp < FORECAST_CACHE_TTL)) {
        return cached.data;
    }

    try {
        const res = await fetch(`https://api.meteo.cat/pronostic/v1/municipal/${muniCode}`, {
            headers: { 'X-Api-Key': apiKey }
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data && data.dies) {
            forecastCache.set(muniCode, { data, timestamp: now });
            return data;
        }
        return null;
    } catch (err) {
        console.warn(`[Meteocat] Error fetching forecast for muni ${muniCode}:`, err);
        return null;
    }
}

/**
 * Main Hybrid Fetch Function:
 * Interleaves Meteocat XEMA ground station physical sensors + official SMC forecast with Open-Meteo supplementary data.
 */
export async function fetchHybridWeather(
    lat: number = 41.3879,
    lon: number = 2.1699,
    explicitStationId?: string
): Promise<HybridWeatherData> {
    const apiKey = getMeteocatApiKey();

    // 1. Determine target station
    let targetStation: MeteocatFgcStation;
    let distanceKm: number;

    if (explicitStationId) {
        const found = METEOCAT_FGC_STATIONS.find(s => s.id === explicitStationId);
        if (found) {
            targetStation = found;
            distanceKm = haversineKm(lat, lon, found.lat, found.lon);
        } else {
            const nearest = findNearestMeteocatStation(lat, lon);
            targetStation = nearest.station;
            distanceKm = nearest.distanceKm;
        }
    } else {
        const nearest = findNearestMeteocatStation(lat, lon);
        targetStation = nearest.station;
        distanceKm = nearest.distanceKm;
    }

    // Coords to query Open-Meteo (use target station coords if explicitly picked, else user coords)
    const queryLat = explicitStationId ? targetStation.lat : lat;
    const queryLon = explicitStationId ? targetStation.lon : lon;

    // 2. Fetch Open-Meteo concurrently (provides fallback and secondary fields)
    const openMeteoPromise = (async () => {
        const params = [
            `latitude=${queryLat}`,
            `longitude=${queryLon}`,
            `current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day,visibility,precipitation_probability,cloud_cover,pressure_msl`,
            `daily=weather_code,sunrise,sunset,temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max,wind_speed_10m_max`,
            `timezone=Europe%2FBerlin`,
            `forecast_days=8`
        ].join('&');
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
        if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`);
        return await res.json();
    })();

    // 3. Fetch Meteocat Sensors (Var 32=Temp, 33=Hum, 30=Vent, 50=Ratxa, 35=Pluja)
    const meteocatSensorsPromise = Promise.all([
        fetchXemaVariable(32, apiKey),
        fetchXemaVariable(33, apiKey),
        fetchXemaVariable(30, apiKey),
        fetchXemaVariable(50, apiKey),
        fetchXemaVariable(35, apiKey)
    ]);

    // 4. Fetch Meteocat 8-day Municipal Forecast
    const meteocatForecastPromise = fetchMeteocatForecast(targetStation.municipalityCode, apiKey);

    // Run in parallel with resilience
    const [omResult, mcSensorsResult, mcForecastResult] = await Promise.allSettled([
        openMeteoPromise,
        meteocatSensorsPromise,
        meteocatForecastPromise
    ]);

    const omData = omResult.status === 'fulfilled' ? omResult.value : null;

    if (!omData) {
        throw new Error('No weather provider available (Open-Meteo failed and no cache).');
    }

    const c = omData.current;
    const d = omData.daily;

    // Base current weather from Open-Meteo
    let current: WeatherCurrent = {
        temperature: Math.round(c.temperature_2m),
        apparentTemperature: Math.round(c.apparent_temperature),
        humidity: c.relative_humidity_2m,
        windSpeed: Math.round(c.wind_speed_10m),
        windGusts: Math.round(c.wind_gusts_10m),
        windDirection: c.wind_direction_10m,
        weatherCode: c.weather_code,
        isDay: c.is_day === 1,
        visibility: Math.round(c.visibility / 100) / 10,
        precipitationProbability: c.precipitation_probability || 0,
        cloudCover: c.cloud_cover,
        pressure: Math.round(c.pressure_msl)
    };

    let daily: WeatherDaily = {
        sunrise: d.sunrise?.[0] || '',
        sunset: d.sunset?.[0] || '',
        tempMax: Math.round(d.temperature_2m_max?.[0] ?? 0),
        tempMin: Math.round(d.temperature_2m_min?.[0] ?? 0),
        precipSum: Math.round((d.precipitation_sum?.[0] ?? 0) * 10) / 10,
        uvIndex: Math.round(d.uv_index_max?.[0] ?? 0),
        windMax: Math.round(d.wind_speed_10m_max?.[0] ?? 0)
    };

    let forecast: WeatherForecastDay[] = [];
    if (d.time && d.time.length > 1) {
        for (let i = 1; i < d.time.length; i++) {
            forecast.push({
                date: d.time[i],
                weatherCode: d.weather_code[i],
                tempMax: Math.round(d.temperature_2m_max?.[i] ?? 0),
                tempMin: Math.round(d.temperature_2m_min?.[i] ?? 0),
                precipProbability: undefined
            });
        }
    }

    let isMeteocatActive = false;
    let sensorReadingTime: string | undefined = undefined;

    // Process Meteocat Sensors
    if (mcSensorsResult.status === 'fulfilled' && mcSensorsResult.value) {
        const [tData, hData, wData, gData, pData] = mcSensorsResult.value;

        const getStationReading = (dataset: any[] | null) => {
            if (!dataset) return null;
            const stationEntry = dataset.find(i => i.codi === targetStation.id);
            return stationEntry?.variables?.[0]?.lectures?.[0] || null;
        };

        const tVal = getStationReading(tData);
        const hVal = getStationReading(hData);
        const wVal = getStationReading(wData);
        const gVal = getStationReading(gData);
        const pVal = getStationReading(pData);

        if (tVal && typeof tVal.valor === 'number') {
            isMeteocatActive = true;
            current.temperature = Math.round(tVal.valor * 10) / 10;
            if (tVal.data) {
                try {
                    sensorReadingTime = new Date(tVal.data).toLocaleTimeString('ca-ES', {
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                } catch {
                    sensorReadingTime = undefined;
                }
            }
        }

        if (hVal && typeof hVal.valor === 'number') {
            current.humidity = Math.round(hVal.valor);
        }

        if (wVal && typeof wVal.valor === 'number') {
            current.windSpeed = Math.round(wVal.valor * 3.6);
        }

        if (gVal && typeof gVal.valor === 'number') {
            current.windGusts = Math.round(gVal.valor * 3.6);
        }

        if (pVal && typeof pVal.valor === 'number') {
            daily.precipSum = Math.round(pVal.valor * 10) / 10;
        }

        // Adjust apparent temperature with real humidity if available
        if (tVal && hVal) {
            // Simplified Australian Bureau of Meteorology Apparent Temperature
            const T = tVal.valor;
            const e = (hVal.valor / 100) * 6.105 * Math.exp((17.27 * T) / (237.7 + T));
            const ws = (wVal?.valor || 0.5);
            const at = T + 0.33 * e - 0.70 * ws - 4.00;
            current.apparentTemperature = Math.round(at);
        }
    }

    // Process Meteocat Municipal Forecast (up to 8 days)
    if (mcForecastResult.status === 'fulfilled' && mcForecastResult.value?.dies?.length) {
        const mcDies = mcForecastResult.value.dies;
        const mcForecastList: WeatherForecastDay[] = [];

        // Check today's max/min from official forecast
        const todayForecast = mcDies[0]?.variables;
        if (todayForecast?.tmax?.valor) {
            daily.tempMax = Math.round(parseFloat(todayForecast.tmax.valor));
        }
        if (todayForecast?.tmin?.valor) {
            daily.tempMin = Math.round(parseFloat(todayForecast.tmin.valor));
        }
        if (todayForecast?.precipitacio?.valor) {
            current.precipitationProbability = Math.round(parseFloat(todayForecast.precipitacio.valor));
        }

        // Next 7 days
        for (let i = 1; i < mcDies.length; i++) {
            const day = mcDies[i];
            const vars = day.variables;
            if (!vars) continue;

            const celCode = vars.estatCel?.valor;
            const wCode = mapMeteocatCelToWmo(celCode);
            const tMax = vars.tmax?.valor ? Math.round(parseFloat(vars.tmax.valor)) : 0;
            const tMin = vars.tmin?.valor ? Math.round(parseFloat(vars.tmin.valor)) : 0;
            const pProb = vars.precipitacio?.valor ? Math.round(parseFloat(vars.precipitacio.valor)) : 0;

            mcForecastList.push({
                date: day.data ? day.data.replace('Z', '') : `Dia +${i}`,
                weatherCode: wCode,
                tempMax: tMax,
                tempMin: tMin,
                precipProbability: pProb
            });
        }

        if (mcForecastList.length > 0) {
            forecast = mcForecastList;
            isMeteocatActive = true;
        }
    }

    return {
        current,
        daily,
        forecast,
        lat: queryLat,
        lon: queryLon,
        municipality: targetStation.municipalityName,
        nearestStation: `${targetStation.shortName}`,
        source: isMeteocatActive ? 'hybrid' : 'open-meteo',
        stationInfo: {
            id: targetStation.id,
            name: targetStation.name,
            shortName: targetStation.shortName,
            badge: targetStation.badge,
            readingTime: sensorReadingTime,
            distanceKm: Math.round(distanceKm * 10) / 10
        }
    };
}
