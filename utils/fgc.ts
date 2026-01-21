
export const getStatusColor = (codi: string) => {
    const c = (codi || '').toUpperCase().trim();
    if (c === 'PC') return 'bg-blue-400';
    if (c === 'SR') return 'bg-purple-600';
    if (c === 'RE') return 'bg-purple-300';
    if (c === 'RB') return 'bg-pink-500';
    if (c === 'NA') return 'bg-orange-500';
    if (c === 'PN') return 'bg-[#00B140]';
    if (c === 'TB') return 'bg-[#a67c52]';
    if (c === 'Viatger') return 'bg-sky-500';
    return 'bg-gray-200 dark:bg-gray-700';
};

export const getLiniaColor = (linia: string) => {
    const l = linia?.toUpperCase().trim() || '';
    if (l === 'L6') return 'bg-purple-600';
    if (l === 'L7') return 'bg-[#8B4513]';
    if (l === 'L12') return 'bg-purple-300';
    if (l === 'S1') return 'bg-orange-500';
    if (l === 'S2') return 'bg-[#00B140]';
    return 'bg-fgc-grey dark:bg-gray-800';
};

export const getShortTornId = (id: string) => {
    const trimmed = id.trim();
    if (trimmed.startsWith('Q') && !trimmed.startsWith('QR') && trimmed.length === 5) return trimmed[0] + trimmed.slice(2);
    return trimmed;
};

export const getTrainPhone = (train: string) => {
    if (!train) return null;
    const parts = train.split('.');
    if (parts.length < 2) return null;
    const serie = parts[0];
    const unitCode = parseInt(parts[1], 10);
    if (isNaN(unitCode)) return null;
    const unitStr = parts[1].padStart(2, '0');
    if (serie === '112') return `692${(unitCode + 50).toString().padStart(2, '0')}`;
    if (serie === '113') return `694${unitStr}`;
    if (serie === '114') return `694${(unitCode + 50).toString().padStart(2, '0')}`;
    if (serie === '115') return `697${unitStr}`;
    return null;
};

export const ALL_STATIONS = [
    "Barcelona - Pl. Catalunya", "Provença", "Gràcia", "Sant Gervasi", "Muntaner", "La Bonanova", "Les Tres Torres", "Sarrià", "Peu del Funicular", "Baixador de Vallvidrera", "Les Planes", "La Floresta", "Valldoreix", "Sant Cugat Centre", "Mira-sol", "Hospital General", "Rubí Centre", "Les Fonts", "Terrassa Rambla", "Vallparadís Universitat", "Terrassa Estació del Nord", "Terrassa Nacions Unides", "Volpelleres", "Sant Joan", "Bellaterra", "Universitat Autònoma", "Sant Quirze", "Can Feu | Gràcia", "Sabadell Plaça Major", "La Creu Alta", "Sabadell Nord", "Sabadell Parc del Nord", "Pl. Molina", "Pàdua", "El Putxet", "Av. Tibidabo", "Reina Elisenda"
].sort();

export const STATION_CODE_MAP: Record<string, string> = {
    "Barcelona - Pl. Catalunya": "PC",
    "Provença": "PR",
    "Gràcia": "GR",
    "Sant Gervasi": "SG",
    "Muntaner": "MN",
    "La Bonanova": "BN",
    "Les Tres Torres": "TT",
    "Sarrià": "SR",
    "Peu del Funicular": "PF",
    "Baixador de Vallvidrera": "VL",
    "Les Planes": "LP",
    "La Floresta": "LF",
    "Valldoreix": "VD",
    "Sant Cugat Centre": "SC",
    "Mira-sol": "MS",
    "Hospital General": "HG",
    "Rubí Centre": "RB",
    "Les Fonts": "FN",
    "Terrassa Rambla": "TR",
    "Vallparadís Universitat": "VP",
    "Terrassa Estació del Nord": "EN",
    "Terrassa Nacions Unides": "NA",
    "Volpelleres": "VO",
    "Sant Joan": "SJ",
    "Bellaterra": "BT",
    "Universitat Autònoma": "UN",
    "Sant Quirze": "SQ",
    "Can Feu | Gràcia": "CF",
    "Sabadell Plaça Major": "PJ",
    "La Creu Alta": "CT",
    "Sabadell Nord": "NO",
    "Sabadell Parc del Nord": "PN",
    "Pl. Molina": "PM",
    "Pàdua": "PD",
    "El Putxet": "EP",
    "Av. Tibidabo": "TB",
    "Reina Elisenda": "RE"
};
