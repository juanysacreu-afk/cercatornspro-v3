/**
 * FGC Barcelona-Vallès — Velocitats màximes i limitacions permanents
 * Itinerari BV07 — Desembre 2022 (versió març 2023)
 *
 * Secció 2.2: Velocitats màximes per trajecte (sèries 112-115)
 *   PC→SR / GR→SR : 60 km/h
 *   SR→RE          : 45 km/h
 *   SR→LP (PF)     : 60 km/h
 *   LP→SC (Les Planes → Sant Cugat): 90 km/h
 *   SC→RB (Sant Cugat → Rubí):       90 km/h
 *   RB→TR (Rubí → Terrassa Rambla):  90 km/h
 *   TR→NA:                            60 km/h
 *   SC→PN:                            90 km/h
 *
 * Seccions 2.3 i 2.4: Limitacions permanents per sentit i via
 *
 * Conveni de direcció:
 *  - isAscending=true  → cap a Terrassa/Sabadell/Tibidabo/Reina Elisenda (pk creixent)
 *  - isAscending=false → cap a Pl.Catalunya (pk decreixent)
 *  - isContravia=true  → circulació a contravia (via 2 en ASC, via 1 en DESC)
 */

export type PkSegmentKey =
    | 'PC/RE'
    | 'GR/TB'
    | 'SR/LP'
    | 'LP/TR'
    | 'LP/NA'
    | 'SC/PN'
    | 'BT/UN';

export interface SpeedLimit {
    /** PK start of the restriction (km), inclusive */
    pkStart: number;
    /** PK end of the restriction (km), exclusive */
    pkEnd: number;
    /** Maximum allowed speed (km/h) */
    speedKmh: number;
    /** Optional human-readable note */
    note?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2.3.1  Limitacions ASCENDENTS via NORMAL (via 1)
// ─────────────────────────────────────────────────────────────────────────────

const ASC_NORMAL: Record<PkSegmentKey, SpeedLimit[]> = {
    'PC/RE': [
        { pkStart: 0.000, pkEnd: 0.223, speedKmh: 25, note: 'Sortides de Pl.Catalunya per via normal' },
        { pkStart: 1.969, pkEnd: 2.043, speedKmh: 30, note: 'Entrada a via 3 de Gràcia' },
        { pkStart: 4.312, pkEnd: 4.614, speedKmh: 30, note: 'Entrada a via 1 de Sarrià' },
        { pkStart: 4.987, pkEnd: 5.167, speedKmh: 30, note: 'Entrada fins andana via 1 Reina Elisenda' },
        { pkStart: 5.167, pkEnd: 5.250, speedKmh: 20, note: 'Entrada a estacionament via 1 Reina Elisenda' },
        { pkStart: 5.250, pkEnd: 5.444, speedKmh: 10, note: 'Final andana Reina Elisenda fins topalls' },
    ],
    'GR/TB': [
        { pkStart: 2.043, pkEnd: 0.175, speedKmh: 40, note: 'Entrada i Sortida de via 3 de Gràcia (PK ref PC/RE)' }, // special
        { pkStart: 0.000, pkEnd: 0.175, speedKmh: 40, note: 'Entrada i Sortida de via 3 de Gràcia' },
        { pkStart: 0.434, pkEnd: 0.635, speedKmh: 40, note: 'Entrada a Pl.Molina' },
        { pkStart: 1.759, pkEnd: 1.859, speedKmh: 20, note: 'Entrada a Avinguda Tibidabo' },
    ],
    'SR/LP': [
        { pkStart: 0.000, pkEnd: 0.450, speedKmh: 45, note: 'Sortida de Sarrià fins a Túnel 1' },
        { pkStart: 0.450, pkEnd: 2.120, speedKmh: 50, note: 'Entre Sarrià i Peu del Funicular' },
        { pkStart: 3.732, pkEnd: 3.826, speedKmh: 60, note: 'Entrada a Baixador de Vallvidrera' },
    ],
    'LP/TR': [
        { pkStart: 0.015, pkEnd: 0.712, speedKmh: 60, note: 'Sortida de via 1 de Les Planes' },
        { pkStart: 0.712, pkEnd: 1.030, speedKmh: 70, note: 'Tram comprès entre Les Planes i La Floresta' },
        { pkStart: 2.088, pkEnd: 3.023, speedKmh: 60, note: 'Entrada a La Floresta' },
        { pkStart: 5.617, pkEnd: 5.800, speedKmh: 60, note: 'Entrada a Sant Cugat Centre' },
        { pkStart: 5.800, pkEnd: 6.010, speedKmh: 55, note: 'Entrada a Sant Cugat Centre' },
        { pkStart: 6.010, pkEnd: 6.285, speedKmh: 55, note: 'Sortida de Sant Cugat Centre' },
        { pkStart: 9.953, pkEnd: 11.000, speedKmh: 60, note: 'Tram COR i Rubí Centre' },
        { pkStart: 11.000, pkEnd: 11.320, speedKmh: 70, note: 'A continuació de la Sortida de Rubí Centre' },
        { pkStart: 19.868, pkEnd: 20.136, speedKmh: 60, note: 'Entrada a Terrassa-Rambla' },
    ],
    'LP/NA': [
        { pkStart: 23.668, pkEnd: 23.849, speedKmh: 30, note: 'Entrada a Nacions Unides' },
        { pkStart: 23.849, pkEnd: 24.332, speedKmh: 20, note: 'Maniobres dipòsit Can Roca (Nacions Unides)' },
    ],
    'SC/PN': [
        { pkStart: 2.640, pkEnd: 2.770, speedKmh: 60, note: 'Sortida de Sant Joan' },
        { pkStart: 8.666, pkEnd: 9.690, speedKmh: 60, note: 'Entrada i Sortida de Can Feu | Gràcia' },
        { pkStart: 9.690, pkEnd: 11.035, speedKmh: 85, note: 'Entre Can Feu | Gràcia i Sabadell Plaça Major' },
        { pkStart: 12.982, pkEnd: 13.440, speedKmh: 85, note: 'Entre Sabadell Nord i Sabadell Parc del Nord' },
        { pkStart: 13.440, pkEnd: 13.601, speedKmh: 60, note: 'Entre Sabadell Nord i Sabadell Parc del Nord' },
        { pkStart: 13.601, pkEnd: 13.918, speedKmh: 45, note: 'Entrada a Sabadell Parc del Nord' },
        { pkStart: 13.918, pkEnd: 13.982, speedKmh: 30, note: 'Canvi velocitat a l\'andana de Sabadell Parc del Nord' },
        { pkStart: 13.982, pkEnd: 14.330, speedKmh: 20, note: 'Maniobres al dipòsit de Ca n\'Oriac' },
    ],
    'BT/UN': [
        { pkStart: 0.000, pkEnd: 1.300, speedKmh: 60, note: 'Entrada a Universitat Autònoma' },
        { pkStart: 1.300, pkEnd: 3.354, speedKmh: 80, note: 'Sortida d\'Universitat Autònoma' },
    ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 2.4.1  Limitacions DESCENDENTS via NORMAL (via 2 general, via 1 per alguns trams)
// Note: PKs are listed in descending order in the PDF (high→low),
//       stored here as [pkStart=high, pkEnd=low] with descending semantics.
// ─────────────────────────────────────────────────────────────────────────────

const DESC_NORMAL: Record<PkSegmentKey, SpeedLimit[]> = {
    'PC/RE': [
        { pkStart: 5.165, pkEnd: 4.757, speedKmh: 30, note: 'Sortida de via 2 de Reina Elisenda' },
        { pkStart: 4.757, pkEnd: 4.493, speedKmh: 30, note: 'Entrada a via 4 de Sarrià' },
        { pkStart: 4.493, pkEnd: 4.316, speedKmh: 30, note: 'Sortida de via 2 i 4 de Sarrià' },
        { pkStart: 3.040, pkEnd: 3.010, speedKmh: 30, note: 'Sortida de Muntaner' },
        { pkStart: 0.263, pkEnd: 0.085, speedKmh: 25, note: 'Entrades fins a andanes de Pl.Catalunya' },
        { pkStart: 0.085, pkEnd: 0.000, speedKmh: 20, note: 'Entrades a les andanes de Pl.Catalunya' },
    ],
    'GR/TB': [
        // Descendent from TB to GR: no specific permanent restrictions listed beyond max speed
    ],
    'SR/LP': [
        { pkStart: 2.175, pkEnd: 1.844, speedKmh: 40, note: 'Entrada a Peu del Funicular' },
        { pkStart: 1.844, pkEnd: 0.098, speedKmh: 50, note: 'Entre Peu del Funicular i Sarrià' },
        { pkStart: 0.098, pkEnd: 0.000, speedKmh: 30, note: 'Entrada a Sarrià' },
    ],
    'LP/TR': [
        { pkStart: 11.320, pkEnd: 11.000, speedKmh: 70, note: 'Entre Les Fonts i Rubí Centre' },
        { pkStart: 11.000, pkEnd: 10.310, speedKmh: 60, note: 'Entrada i Sortida de Rubí Centre' },
        { pkStart: 6.285, pkEnd: 5.923, speedKmh: 55, note: 'Entrada a Sant Cugat Centre' },
        { pkStart: 5.923, pkEnd: 5.800, speedKmh: 55, note: 'Sortida de Sant Cugat Centre' },
        { pkStart: 3.023, pkEnd: 2.088, speedKmh: 60, note: 'Entrada i Sortida de La Floresta' },
        { pkStart: 1.030, pkEnd: 0.712, speedKmh: 70, note: 'Entre La Floresta i Les Planes' },
        { pkStart: 0.712, pkEnd: 0.000, speedKmh: 60, note: 'Entrada a Les Planes' },
    ],
    'LP/NA': [
        { pkStart: 24.332, pkEnd: 23.849, speedKmh: 20, note: 'Maniobres dipòsit Can Roca (Nacions Unides)' },
    ],
    'SC/PN': [
        { pkStart: 14.330, pkEnd: 13.863, speedKmh: 20, note: 'Dipòsit de Ca N\'Oriac. Sortida des de via 1' },
        { pkStart: 13.863, pkEnd: 13.601, speedKmh: 45, note: 'Sortida de via 1 de Sabadell Parc del Nord' },
        { pkStart: 13.630, pkEnd: 13.100, speedKmh: 85, note: 'Entre Sabadell Parc del Nord i Sabadell Nord' },
    ],
    'BT/UN': [
        { pkStart: 3.354, pkEnd: 1.300, speedKmh: 80, note: 'Entrada a Universitat Autònoma' },
        { pkStart: 1.300, pkEnd: 0.000, speedKmh: 60, note: 'Entrada a Bellaterra' },
    ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 2.3.2  Limitacions ASCENDENTS CONTRAVIA (via 2)
// ─────────────────────────────────────────────────────────────────────────────

const ASC_CONTRAVIA: Record<PkSegmentKey, SpeedLimit[]> = {
    'PC/RE': [
        { pkStart: 0.000, pkEnd: 0.263, speedKmh: 25, note: 'Sortides a contravia de Pl.Catalunya' },
        { pkStart: 0.958, pkEnd: 1.047, speedKmh: 50, note: 'Contravia entre Pl.Catalunya i Provença' },
        { pkStart: 1.805, pkEnd: 2.094, speedKmh: 20, note: 'Entrada de Contravia a Gràcia' },
        { pkStart: 3.010, pkEnd: 3.659, speedKmh: 30, note: 'Entrada i Sortida a Contravia de via 2 Muntaner fins La Bonanova' },
        { pkStart: 4.127, pkEnd: 4.614, speedKmh: 30, note: 'Sortida a Contravia de Les Tres Torres fins via 2, 4 de Sarrià' },
        { pkStart: 4.726, pkEnd: 5.106, speedKmh: 30, note: 'Circulació per via 2 al tram SR-RE' },
        { pkStart: 5.106, pkEnd: 5.250, speedKmh: 20, note: 'Entrada de Contravia a andanes de Reina Elisenda' },
    ],
    'GR/TB': [
        { pkStart: 0.630, pkEnd: 0.656, speedKmh: 20, note: 'Sortida a Contravia de via 2 de Pl.Molina' },
        { pkStart: 1.759, pkEnd: 1.859, speedKmh: 20, note: 'Entrada de Contravia a l\'Avinguda Tibidabo' },
    ],
    'SR/LP': [
        { pkStart: 0.000, pkEnd: 0.450, speedKmh: 45, note: 'Sortida a Contravia de via 2 de Sarrià fins a Túnel 1' },
        { pkStart: 0.450, pkEnd: 1.844, speedKmh: 50, note: 'Contravia entre Sarrià i Peu del Funicular' },
        { pkStart: 1.844, pkEnd: 2.120, speedKmh: 40, note: 'Entrada de Contravia a Peu del Funicular' },
    ],
    'LP/TR': [
        { pkStart: 0.015, pkEnd: 0.030, speedKmh: 20, note: 'Sortida a Contravia de via 2 de Les Planes' },
        { pkStart: 0.030, pkEnd: 0.712, speedKmh: 60, note: 'Contravia entre Les Planes i La Floresta' },
        { pkStart: 0.712, pkEnd: 1.030, speedKmh: 70, note: 'Contravia entre Les Planes i La Floresta' },
        { pkStart: 2.088, pkEnd: 3.023, speedKmh: 60, note: 'Entrada de Contravia a La Floresta' },
        { pkStart: 5.610, pkEnd: 6.010, speedKmh: 20, note: 'Entrada de Contravia a Sant Cugat Centre' },
        { pkStart: 6.010, pkEnd: 6.285, speedKmh: 55, note: 'Sortida a Contravia de Sant Cugat Centre' },
        { pkStart: 9.953, pkEnd: 10.854, speedKmh: 60, note: 'Entrada de Contravia a Rubí Centre' },
        { pkStart: 10.854, pkEnd: 11.000, speedKmh: 20, note: 'Sortida a Contravia de via 2 de Rubí Centre' },
        { pkStart: 11.000, pkEnd: 11.320, speedKmh: 70, note: 'Contravia a continuació de la sortida de Rubí Centre' },
        { pkStart: 15.105, pkEnd: 15.915, speedKmh: 70, note: 'Entrada de Contravia a Les Fonts' },
        { pkStart: 15.915, pkEnd: 16.034, speedKmh: 20, note: 'Sortida a Contravia de via 2 de Les Fonts' },
        { pkStart: 19.868, pkEnd: 20.136, speedKmh: 20, note: 'Entrada de Contravia a Terrassa-Rambla' },
    ],
    'LP/NA': [
        { pkStart: 20.136, pkEnd: 20.200, speedKmh: 20, note: 'Sortida a Contravia de via 2 de Terrassa-Rambla' },
        { pkStart: 23.549, pkEnd: 23.849, speedKmh: 30, note: 'Entrada de Contravia a Nacions Unides' },
    ],
    'SC/PN': [
        { pkStart: 1.004, pkEnd: 1.064, speedKmh: 20, note: 'Contravia entre Sant Cugat Centre i Volpelleres' },
        { pkStart: 1.569, pkEnd: 1.700, speedKmh: 50, note: 'Sortida a Contravia de via 2 de Volpelleres' },
        { pkStart: 2.640, pkEnd: 2.770, speedKmh: 80, note: 'Entrada a Sant Joan' },
        { pkStart: 3.898, pkEnd: 0.015, speedKmh: 70, note: 'Entrada de Contravia a Bellaterra (BT/UN ref)' },
        { pkStart: 6.719, pkEnd: 6.964, speedKmh: 60, note: 'Entrada de Contravia a Sant Quirze' },
        { pkStart: 8.667, pkEnd: 9.094, speedKmh: 60, note: 'Contravia Sant Quirze i Can Feu | Gràcia' },
        { pkStart: 9.094, pkEnd: 9.548, speedKmh: 45, note: 'Entrada de Contravia a Can Feu | Gràcia' },
        { pkStart: 9.548, pkEnd: 11.088, speedKmh: 85, note: 'Entrada i Sortida de Contravia de via 2 de Plaça Major' },
        { pkStart: 13.100, pkEnd: 13.408, speedKmh: 85, note: 'Contravia Sabadell Nord i Sabadell Parc del Nord' },
        { pkStart: 13.408, pkEnd: 13.569, speedKmh: 60, note: 'Contravia Sabadell Nord i Sabadell Parc del Nord' },
        { pkStart: 13.569, pkEnd: 13.909, speedKmh: 45, note: 'Entrada de Contravia a Sabadell Parc del Nord' },
    ],
    'BT/UN': [
        { pkStart: 0.000, pkEnd: 1.300, speedKmh: 60, note: 'Entrada a Universitat Autònoma' },
        { pkStart: 1.300, pkEnd: 3.354, speedKmh: 80, note: 'Sortida d\'Universitat Autònoma' },
    ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 2.4.2  Limitacions DESCENDENTS CONTRAVIA (via 1)
// ─────────────────────────────────────────────────────────────────────────────

const DESC_CONTRAVIA: Record<PkSegmentKey, SpeedLimit[]> = {
    'PC/RE': [
        { pkStart: 5.165, pkEnd: 4.757, speedKmh: 30, note: 'Sortida de via 2 de Reina Elisenda fins entrada a via 4 de Sarrià' },
        { pkStart: 4.757, pkEnd: 4.493, speedKmh: 30, note: 'Entrada a via 4 de Sarrià' },
        { pkStart: 4.493, pkEnd: 4.316, speedKmh: 30, note: 'Sortida de via 2 i 4 de Sarrià' },
        { pkStart: 3.040, pkEnd: 3.010, speedKmh: 30, note: 'Sortida de Muntaner' },
        { pkStart: 0.263, pkEnd: 0.085, speedKmh: 25, note: 'Entrades fins a andanes de Pl.Catalunya' },
        { pkStart: 0.085, pkEnd: 0.000, speedKmh: 20, note: 'Entrades a les andanes de Pl.Catalunya' },
    ],
    'GR/TB': [
        { pkStart: 0.557, pkEnd: 0.434, speedKmh: 20, note: 'Sortida a Contravia de via 1 de Pl.Molina' },
        { pkStart: 0.175, pkEnd: 0.055, speedKmh: 40, note: 'Contravia de via 1 entre Pl.Molina i via 3 Gràcia' },
        { pkStart: 0.055, pkEnd: 2.042, speedKmh: 30, note: 'Entrada de Contravia a via 3 de Gràcia des de Pl.Molina' },
    ],
    'SR/LP': [
        { pkStart: 4.634, pkEnd: 4.532, speedKmh: 30, note: 'Sortida de Contravia de via 1 de Les Planes' },
        { pkStart: 4.050, pkEnd: 3.732, speedKmh: 60, note: 'Entrada de Contravia a Baixador de Vallvidrera' },
        { pkStart: 2.339, pkEnd: 2.120, speedKmh: 60, note: 'Tram entre Baixador de Vallvidrera i Peu del Funicular' },
        { pkStart: 2.120, pkEnd: 0.100, speedKmh: 50, note: 'Entrada de Contravia a Peu del Funicular' },
        { pkStart: 0.100, pkEnd: 0.000, speedKmh: 20, note: 'Entrada de Contravia a Sarrià' },
    ],
    'LP/TR': [
        { pkStart: 20.046, pkEnd: 20.005, speedKmh: 20, note: 'Sortida a Contravia de Terrassa-Rambla' },
        { pkStart: 16.410, pkEnd: 16.120, speedKmh: 80, note: 'Contravia entre Terrassa-Rambla i Les Fonts' },
        { pkStart: 11.320, pkEnd: 10.753, speedKmh: 60, note: 'Entrada de Contravia a Rubí Centre' },
        { pkStart: 10.753, pkEnd: 10.660, speedKmh: 20, note: 'Sortida a Contravia de via 1 de Rubí Centre' },
        { pkStart: 10.660, pkEnd: 10.310, speedKmh: 60, note: 'Sortida a Contravia de Rubí Centre' },
        { pkStart: 6.471, pkEnd: 6.285, speedKmh: 20, note: 'Contravia entre Mira-Sol i Sant Cugat Centre' },
        { pkStart: 6.285, pkEnd: 5.923, speedKmh: 55, note: 'Entrada de Contravia a Sant Cugat Centre' },
        { pkStart: 5.923, pkEnd: 5.800, speedKmh: 55, note: 'Sortida a Contravia de via 1 de Sant Cugat Centre' },
        { pkStart: 3.023, pkEnd: 2.815, speedKmh: 60, note: 'Entrada de Contravia a La Floresta' },
        { pkStart: 2.815, pkEnd: 2.780, speedKmh: 20, note: 'Sortida a Contravia de via 1 de La Floresta' },
        { pkStart: 2.780, pkEnd: 2.088, speedKmh: 60, note: 'Contravia entre La Floresta i Les Planes' },
        { pkStart: 1.030, pkEnd: 0.712, speedKmh: 70, note: 'Contravia entre La Floresta i Les Planes' },
        { pkStart: 0.712, pkEnd: 0.119, speedKmh: 60, note: 'Contravia entre La Floresta i Les Planes' },
        { pkStart: 0.119, pkEnd: 0.000, speedKmh: 20, note: 'Entrada de Contravia a Les Planes' },
    ],
    'LP/NA': [
        { pkStart: 20.420, pkEnd: 20.046, speedKmh: 30, note: 'Entrada de Contravia a Terrassa-Rambla' },
    ],
    'SC/PN': [
        { pkStart: 13.601, pkEnd: 12.982, speedKmh: 85, note: 'Contravia Sabadell Parc del Nord - Sabadell Nord' },
        { pkStart: 11.035, pkEnd: 9.947, speedKmh: 85, note: 'Entrada i Sortida a Contravia de Plaça Major' },
        { pkStart: 9.947, pkEnd: 8.886, speedKmh: 60, note: 'Entrada i Sortida a Contravia de Can Feu | Gràcia' },
        { pkStart: 4.306, pkEnd: 4.243, speedKmh: 20, note: 'Sortida a Contravia de vies 1, 3 de Bellaterra' },
        { pkStart: 2.770, pkEnd: 2.640, speedKmh: 60, note: 'Entrada de Contravia a Baixador de Sant Joan' },
        { pkStart: 1.895, pkEnd: 1.804, speedKmh: 20, note: 'Contravia entre Sant Joan i Volpelleres' },
        { pkStart: 1.418, pkEnd: 1.190, speedKmh: 60, note: 'Sortida a Contravia de via 1 de Volpelleres' },
        { pkStart: 0.302, pkEnd: 0.000, speedKmh: 20, note: 'Entrada de Contravia a St.Cugat Centre' },
    ],
    'BT/UN': [
        { pkStart: 3.354, pkEnd: 1.300, speedKmh: 80, note: 'Entrada de Contravia a Universitat Autònoma' },
        { pkStart: 1.300, pkEnd: 0.000, speedKmh: 60, note: 'Entrada de Contravia a Bellaterra' },
    ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 2.2  Velocitats màximes per trajecte (sèries 112-115-114-113)
// Used as the baseline/ceiling when no specific restriction applies
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_SPEED_BY_SEGMENT: Record<PkSegmentKey, number> = {
    'PC/RE': 60,  // Pl.Catalunya → Sarrià = 60, Sarrià → RE = 45
    'GR/TB': 60,
    'SR/LP': 60,  // Sarrià → Peu del Funicular: 60 (via normal), Les Planes: 90
    'LP/TR': 90,  // Les Planes → Sant Cugat: 90, Sant Cugat → TR: 90
    'LP/NA': 60,  // Terrassa Rambla → Nacions Unides: 60
    'SC/PN': 90,  // Sant Cugat → Sabadell (main): 90
    'BT/UN': 80,  // Bellaterra → Universitat Autònoma: 80
};

// Specific segment-level max speeds (override by PK range)
const SEGMENT_MAX_BY_PK: Record<PkSegmentKey, SpeedLimit[]> = {
    'PC/RE': [
        { pkStart: 0.000, pkEnd: 4.610, speedKmh: 60 },
        { pkStart: 4.610, pkEnd: 5.444, speedKmh: 45 },
    ],
    'GR/TB': [{ pkStart: 0.000, pkEnd: 1.860, speedKmh: 60 }],
    'SR/LP': [{ pkStart: 0.000, pkEnd: 4.710, speedKmh: 60 }],
    'LP/TR': [
        { pkStart: 0.000, pkEnd: 5.990, speedKmh: 90 },  // LP → SC
        { pkStart: 5.990, pkEnd: 20.150, speedKmh: 90 }, // SC → TR
    ],
    'LP/NA': [{ pkStart: 20.150, pkEnd: 24.332, speedKmh: 60 }],
    'SC/PN': [{ pkStart: 0.000, pkEnd: 13.918, speedKmh: 90 }],
    'BT/UN': [{ pkStart: 0.000, pkEnd: 3.354, speedKmh: 80 }],
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the maximum allowed speed in km/h for a given position and direction
 * on the FGC Barcelona-Vallès network.
 *
 * @param segment  The PK segment key (e.g. 'LP/TR')
 * @param pk       Current kilometric point within the segment (km)
 * @param isAscending   true = heading away from Barcelona (pk increasing)
 * @param isContravia   true = running on the opposite track (contravia)
 * @returns speed in km/h
 */
export function getSegmentSpeedKmh(
    segment: PkSegmentKey,
    pk: number,
    isAscending: boolean,
    isContravia = false
): number {
    // Pick the right table
    const table = isAscending
        ? (isContravia ? ASC_CONTRAVIA[segment] : ASC_NORMAL[segment])
        : (isContravia ? DESC_CONTRAVIA[segment] : DESC_NORMAL[segment]);

    // Baseline from max-speed table
    const maxTable = SEGMENT_MAX_BY_PK[segment] ?? [];
    let baseline = MAX_SPEED_BY_SEGMENT[segment] ?? 60;
    for (const r of maxTable) {
        const lo = Math.min(r.pkStart, r.pkEnd);
        const hi = Math.max(r.pkStart, r.pkEnd);
        if (pk >= lo && pk <= hi) {
            baseline = r.speedKmh;
            break;
        }
    }

    // Find the most restrictive limit that covers the current PK
    let limit = baseline;
    for (const r of table) {
        const lo = Math.min(r.pkStart, r.pkEnd);
        const hi = Math.max(r.pkStart, r.pkEnd);
        if (pk >= lo && pk <= hi) {
            limit = Math.min(limit, r.speedKmh);
        }
    }

    return limit;
}

/**
 * Compute a weighted average speed (km/h) between two PK values on a segment.
 * Walks the track in small steps and averages the allowed speed.
 *
 * @param segment     PK segment
 * @param pkFrom      Starting PK
 * @param pkTo        Ending PK
 * @param isAscending Travelling direction
 * @param isContravia Running on contravia track
 * @param steps       Number of integration steps (higher = more accurate)
 */
export function avgSpeedKmhBetweenPks(
    segment: PkSegmentKey,
    pkFrom: number,
    pkTo: number,
    isAscending: boolean,
    isContravia = false,
    steps = 20
): number {
    if (Math.abs(pkTo - pkFrom) < 0.001) {
        return getSegmentSpeedKmh(segment, pkFrom, isAscending, isContravia);
    }
    let sum = 0;
    for (let i = 0; i <= steps; i++) {
        const pk = pkFrom + (pkTo - pkFrom) * (i / steps);
        sum += getSegmentSpeedKmh(segment, pk, isAscending, isContravia);
    }
    return sum / (steps + 1);
}
