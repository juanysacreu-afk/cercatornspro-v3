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

export interface WeatherAlert {
    id: string;
    type: 'vent' | 'pluja' | 'temperatura' | 'visibilitat' | 'smp_oficial';
    level: 'yellow' | 'orange' | 'red';
    title: string;
    description: string;
    impactFgc: string;
    source: 'Meteocat SMP' | 'Sensor XEMA' | 'Previsió Oficial' | 'Model Atmosfèric';
}

export interface HybridWeatherData {
    current: WeatherCurrent;
    daily: WeatherDaily;
    forecast: WeatherForecastDay[];
    alerts: WeatherAlert[];
    lat: number;
    lon: number;
    municipality: string;
    isGpsAuto: boolean;
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
    municipalityInfo?: {
        code: string;
        name: string;
        comarca?: string;
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

export interface SeedMunicipality {
    code: string;
    name: string;
    lat: number;
    lon: number;
    comarca?: string;
}

/**
 * High-speed seed of key Catalan municipalities (Vallès, Barcelonès, Baix Llobregat, Bages, Anoia)
 * for instant resolution with zero network lag
 */
export const MUNICIPALITIES_SEED: SeedMunicipality[] = [
    { code: '081803', name: 'Ripollet', lat: 41.4971, lon: 2.1550, comarca: 'Vallès Occidental' },
    { code: '082665', name: 'Cerdanyola del Vallès', lat: 41.4913, lon: 2.1402, comarca: 'Vallès Occidental' },
    { code: '082520', name: 'Barberà del Vallès', lat: 41.5167, lon: 2.1265, comarca: 'Vallès Occidental' },
    { code: '089045', name: 'Badia del Vallès', lat: 41.5097, lon: 2.1158, comarca: 'Vallès Occidental' },
    { code: '081250', name: 'Montcada i Reixac', lat: 41.4862, lon: 2.1868, comarca: 'Vallès Occidental' },
    { code: '082055', name: 'Sant Cugat del Vallès', lat: 41.4679, lon: 2.0782, comarca: 'Vallès Occidental' },
    { code: '081846', name: 'Rubí', lat: 41.4863, lon: 2.0314, comarca: 'Vallès Occidental' },
    { code: '081878', name: 'Sabadell', lat: 41.5481, lon: 2.1088, comarca: 'Vallès Occidental' },
    { code: '082798', name: 'Terrassa', lat: 41.5597, lon: 2.0075, comarca: 'Vallès Occidental' },
    { code: '082384', name: 'Sant Quirze del Vallès', lat: 41.5300, lon: 2.0887, comarca: 'Vallès Occidental' },
    { code: '080193', name: 'Barcelona', lat: 41.3856, lon: 2.1687, comarca: 'Barcelonès' },
    { code: '080155', name: 'Badalona', lat: 41.4500, lon: 2.2470, comarca: 'Barcelonès' },
    { code: '082458', name: 'Santa Coloma de Gramenet', lat: 41.4517, lon: 2.2081, comarca: 'Barcelonès' },
    { code: '081017', name: "L'Hospitalet de Llobregat", lat: 41.3597, lon: 2.0998, comarca: 'Barcelonès' },
    { code: '080734', name: 'Cornellà de Llobregat', lat: 41.3562, lon: 2.0701, comarca: 'Baix Llobregat' },
    { code: '081691', name: 'El Prat de Llobregat', lat: 41.3405, lon: 2.0802, comarca: 'Baix Llobregat' },
    { code: '082110', name: 'Sant Feliu de Llobregat', lat: 41.3833, lon: 2.0500, comarca: 'Baix Llobregat' },
    { code: '081232', name: 'Molins de Rei', lat: 41.4133, lon: 2.0167, comarca: 'Baix Llobregat' },
    { code: '080543', name: 'Castellbisbal', lat: 41.4789, lon: 1.9755, comarca: 'Baix Llobregat' },
    { code: '081142', name: 'Martorell', lat: 41.4744, lon: 1.9281, comarca: 'Baix Llobregat' },
    { code: '082631', name: 'Sant Vicenç dels Horts', lat: 41.3933, lon: 2.0100, comarca: 'Baix Llobregat' },
    { code: '081136', name: 'Manresa', lat: 41.7289, lon: 1.8267, comarca: 'Bages' },
    { code: '081271', name: 'Monistrol de Montserrat', lat: 41.5954, lon: 1.8375, comarca: 'Bages' },
    { code: '081022', name: 'Igualada', lat: 41.5811, lon: 1.6178, comarca: 'Anoia' },
    { code: '081245', name: 'Mollet del Vallès', lat: 41.5392, lon: 2.2131, comarca: 'Vallès Oriental' },
    { code: '080961', name: 'Granollers', lat: 41.6093, lon: 2.2985, comarca: 'Vallès Oriental' }
];

const METEOCAT_DEFAULT_KEY = 'Hr2Qm4asTA3nTnHss5vjG2G4WBiwNjlh13lIA9g2';

export const getMeteocatApiKey = (): string => {
    const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_METEOCAT_API_KEY : undefined;
    const procEnv = typeof process !== 'undefined' ? process.env?.VITE_METEOCAT_API_KEY : undefined;
    return metaEnv || procEnv || METEOCAT_DEFAULT_KEY;
};

/**
 * Cache for all 947 Catalan reference municipalities from Meteocat
 */
let allMunicipalitiesCache: SeedMunicipality[] | null = null;
let isFetchingMunis = false;

async function loadAllMunicipalities(apiKey: string): Promise<SeedMunicipality[]> {
    if (allMunicipalitiesCache && allMunicipalitiesCache.length > 0) {
        return allMunicipalitiesCache;
    }

    if (isFetchingMunis) {
        return MUNICIPALITIES_SEED;
    }

    try {
        isFetchingMunis = true;
        const res = await fetch('https://api.meteo.cat/referencia/v1/municipis', {
            headers: { 'X-Api-Key': apiKey }
        });
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                allMunicipalitiesCache = data
                    .filter(m => m.coordenades?.latitud && m.coordenades?.longitud)
                    .map(m => ({
                        code: m.codi,
                        name: m.nom,
                        lat: m.coordenades.latitud,
                        lon: m.coordenades.longitud,
                        comarca: m.comarca?.nom
                    }));
                return allMunicipalitiesCache;
            }
        }
    } catch (e) {
        console.warn('[Meteocat] Error loading full municipalities reference:', e);
    } finally {
        isFetchingMunis = false;
    }

    return MUNICIPALITIES_SEED;
}

/**
 * Resolves GPS coordinates to the exact closest Catalan municipality
 */
export async function resolveMunicipality(
    lat: number,
    lon: number,
    apiKey: string
): Promise<{ code: string; name: string; comarca?: string; distanceKm: number }> {
    // 1. Check seed first for instant sub-millisecond match
    let pool = allMunicipalitiesCache && allMunicipalitiesCache.length > 0
        ? allMunicipalitiesCache
        : MUNICIPALITIES_SEED;

    let nearest = pool[0];
    let minDist = haversineKm(lat, lon, nearest.lat, nearest.lon);

    for (let i = 1; i < pool.length; i++) {
        const m = pool[i];
        const d = haversineKm(lat, lon, m.lat, m.lon);
        if (d < minDist) {
            minDist = d;
            nearest = m;
        }
    }

    // Trigger background loading of full list if not ready
    if (!allMunicipalitiesCache) {
        loadAllMunicipalities(apiKey).catch(() => {});
    }

    return {
        code: nearest.code,
        name: nearest.name,
        comarca: nearest.comarca,
        distanceKm: minDist
    };
}

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
 * Evaluates rail operational safety alerts based on real-time XEMA physical sensor readings,
 * official SMC forecasts, and meteorological risk thresholds for FGC train operations.
 */
export function evaluateWeatherAlerts(
    current: WeatherCurrent,
    daily: WeatherDaily,
    stationName: string,
    municipality: string
): WeatherAlert[] {
    const alerts: WeatherAlert[] = [];

    // 1. Wind Gusts (VENTCAT / Rail Pantograph & Catenary safety)
    if (current.windGusts >= 70) {
        alerts.push({
            id: 'wind-red',
            type: 'vent',
            level: 'red',
            title: `Alerta per vent extrem (${current.windGusts} km/h)`,
            description: `S'ha registrat una ratxa màxima de ${current.windGusts} km/h a ${stationName}.`,
            impactFgc: "Risc sever per a la catenària i caiguda d'arbrat a la via. Recomanada marxa amb precaució o límit a 50 km/h.",
            source: 'Sensor XEMA'
        });
    } else if (current.windGusts >= 50) {
        alerts.push({
            id: 'wind-orange',
            type: 'vent',
            level: 'orange',
            title: `Avís per ratxes de vent fortes (${current.windGusts} km/h)`,
            description: `Ratxes superiors a 50 km/h detectades a la zona de ${municipality}.`,
            impactFgc: 'Atenció a pantògrafs en trams oberts del Vallès i viaductes.',
            source: 'Sensor XEMA'
        });
    }

    // 2. Severe Thunderstorms & Rain (INUNCAT / Rail Adherence)
    if (current.weatherCode >= 95) {
        alerts.push({
            id: 'storm',
            type: 'pluja',
            level: 'orange',
            title: 'Avís de tempesta elèctrica',
            description: `Tempesta activa detectada a la zona de ${municipality}.`,
            impactFgc: 'Risc de descàrregues atmosfèriques en subestacions i circuits de via.',
            source: 'Previsió Oficial'
        });
    } else if (daily.precipSum >= 20 || current.weatherCode === 65 || current.weatherCode === 82) {
        alerts.push({
            id: 'rain-heavy',
            type: 'pluja',
            level: 'orange',
            title: `Avís per acumulació de pluja (${daily.precipSum} mm)`,
            description: `Precipitació intensa registrada avui a ${municipality}.`,
            impactFgc: "Reducció severa d'adherència carril-roda. Augmentar distàncies de frenada.",
            source: 'Sensor XEMA'
        });
    }

    // 3. Extreme Temperatures (Track Dilation & Ice on Catenary)
    if (current.temperature >= 36) {
        alerts.push({
            id: 'heat-extreme',
            type: 'temperatura',
            level: 'orange',
            title: `Alerta per calor extrema (${current.temperature}°C)`,
            description: `Temperatures molt elevades detectades a la xarxa (${municipality}).`,
            impactFgc: "Vigilància d'esveltesa i dilatació tèrmica del carril soldat continu (CWR).",
            source: 'Sensor XEMA'
        });
    } else if (current.temperature <= 0) {
        alerts.push({
            id: 'freeze-red',
            type: 'temperatura',
            level: 'red',
            title: `Alerta per glaçada sota zero (${current.temperature}°C)`,
            description: `Temperatures sota zero registrades a la zona de ${municipality}.`,
            impactFgc: 'Risc de gel al fil de contacte de la catenària i patinament en agulles.',
            source: 'Sensor XEMA'
        });
    } else if (current.temperature <= 2 && current.humidity >= 80) {
        alerts.push({
            id: 'freeze-yellow',
            type: 'temperatura',
            level: 'yellow',
            title: `Avís per risc de gebre (${current.temperature}°C)`,
            description: `Humitat molt alta (${current.humidity}%) i temperatura vora el punt de congelació.`,
            impactFgc: 'Possible formació de capa de gebre a la catenària en primeres circulacions del matí.',
            source: 'Sensor XEMA'
        });
    }

    // 4. Fog / Low Visibility
    if (current.visibility < 1) {
        alerts.push({
            id: 'fog',
            type: 'visibilitat',
            level: 'yellow',
            title: `Avís per boira densa (${current.visibility} km)`,
            description: 'Visibilitat reduïda inferior a 1.000 metres a la via.',
            impactFgc: 'Conducció atenta i observació de senyals lluminosos en superfície.',
            source: 'Model Atmosfèric'
        });
    }

    return alerts;
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

    const isGpsAuto = !explicitStationId || explicitStationId === 'auto';

    let targetStation: MeteocatFgcStation;
    let distanceKm: number;
    let displayMunicipality: string;
    let forecastMuniCode: string;
    let municipalityInfo: { code: string; name: string; comarca?: string } | undefined;

    if (!isGpsAuto && explicitStationId) {
        // User manually selected a station from the pills
        const found = METEOCAT_FGC_STATIONS.find(s => s.id === explicitStationId);
        if (found) {
            targetStation = found;
            distanceKm = haversineKm(lat, lon, found.lat, found.lon);
        } else {
            const nearest = findNearestMeteocatStation(lat, lon);
            targetStation = nearest.station;
            distanceKm = nearest.distanceKm;
        }
        displayMunicipality = targetStation.municipalityName;
        forecastMuniCode = targetStation.municipalityCode;
        municipalityInfo = {
            code: forecastMuniCode,
            name: displayMunicipality
        };
    } else {
        // Auto GPS mode: Resolve real municipality where user is situated (e.g. Ripollet)
        const resolved = await resolveMunicipality(lat, lon, apiKey);
        displayMunicipality = resolved.name;
        forecastMuniCode = resolved.code;
        municipalityInfo = resolved;

        // Nearest XEMA physical sensor station (ground truth for temp/wind/rain)
        const nearest = findNearestMeteocatStation(lat, lon);
        targetStation = nearest.station;
        distanceKm = nearest.distanceKm;
    }

    // Coords to query Open-Meteo (use target station coords if explicitly picked, else user coords)
    const queryLat = (!isGpsAuto && explicitStationId) ? targetStation.lat : lat;
    const queryLon = (!isGpsAuto && explicitStationId) ? targetStation.lon : lon;

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

    // 4. Fetch Meteocat 8-day Municipal Forecast for the detected/selected municipality
    const meteocatForecastPromise = fetchMeteocatForecast(forecastMuniCode, apiKey);

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

    // Process Meteocat Sensors (ground truth from physical sensor)
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

    // Evaluate rail operational emergency alerts (wind gusts, storms, rain, freezing/catenary ice, heat/track dilation)
    const alerts = evaluateWeatherAlerts(current, daily, targetStation.name, displayMunicipality);

    return {
        current,
        daily,
        forecast,
        alerts,
        lat: queryLat,
        lon: queryLon,
        municipality: displayMunicipality,
        isGpsAuto,
        nearestStation: `${targetStation.shortName}`,
        source: isMeteocatActive ? 'hybrid' : 'open-meteo',
        stationInfo: {
            id: targetStation.id,
            name: targetStation.name,
            shortName: targetStation.shortName,
            badge: targetStation.badge,
            readingTime: sensorReadingTime,
            distanceKm: Math.round(distanceKm * 10) / 10
        },
        municipalityInfo
    };
}
