/**
 * Snapshot Morocco places that do not need a live Overpass round-trip.
 * ONCF stops: unofficial GTFS (ODbL 1.0) from rail_maroc_oncf / Transitland
 *   https://github.com/newsbubbles/rail_maroc_oncf
 * Airports: OurAirports scheduled-service extract for iso_country=MA
 *   https://ourairports.com (public domain)
 * UNESCO: World Heritage coordinates from whc.unesco.org state party MA
 */
import { normalizeMoroccoKinds } from './moroccoBounds.js';

export const MOROCCO_ONCF_STOPS = Object.freeze([
  Object.freeze({ id: "oncf:TANGER_VILLE", kind: "stations", name: "Tanger-Ville", latitude: 35.7643, longitude: -5.834, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:TANGER_BORAQ", kind: "stations", name: "Tanger Al Boraq", latitude: 35.7385, longitude: -5.8145, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:ASILAH", kind: "stations", name: "Asilah", latitude: 35.4653, longitude: -6.0344, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:KENITRA", kind: "stations", name: "Kénitra", latitude: 34.261, longitude: -6.5802, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:KENITRA_MEDINA", kind: "stations", name: "Kénitra-Medina", latitude: 34.2519, longitude: -6.5803, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:RABAT_AGDAL", kind: "stations", name: "Rabat-Agdal", latitude: 34.0078, longitude: -6.8517, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:RABAT_VILLE", kind: "stations", name: "Rabat-Ville", latitude: 34.0212, longitude: -6.8395, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:SALE", kind: "stations", name: "Salé", latitude: 34.053, longitude: -6.749, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:SALE_TABRIQUET", kind: "stations", name: "Salé-Tabriquet", latitude: 34.04, longitude: -6.77, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:CASA_VOYAGEURS", kind: "stations", name: "Casa-Voyageurs", latitude: 33.5979, longitude: -7.6191, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:CASA_PORT", kind: "stations", name: "Casa-Port", latitude: 33.6065, longitude: -7.628, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:CASA_OASIS", kind: "stations", name: "Casa-Oasis", latitude: 33.5692, longitude: -7.6495, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:AIN_SEBAA", kind: "stations", name: "Aïn Sebaâ", latitude: 33.6167, longitude: -7.55, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:MOHAMMEDIA", kind: "stations", name: "Mohammedia", latitude: 33.6867, longitude: -7.3833, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:BOUZNIKA", kind: "stations", name: "Bouznika", latitude: 33.7833, longitude: -7.1667, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:SKHIRAT", kind: "stations", name: "Skhirat", latitude: 33.85, longitude: -7.0333, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:TEMARA", kind: "stations", name: "Témara", latitude: 33.9167, longitude: -6.9167, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:SETTAT", kind: "stations", name: "Settat", latitude: 32.9955, longitude: -7.6174, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:BEN_GUERIR", kind: "stations", name: "Ben Guerir", latitude: 32.2333, longitude: -7.95, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:MARRAKECH", kind: "stations", name: "Marrakech", latitude: 31.6295, longitude: -8.0153, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:MEKNES", kind: "stations", name: "Meknès", latitude: 33.8849, longitude: -5.5389, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:FES", kind: "stations", name: "Fès", latitude: 33.9789, longitude: -4.9935, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:TAZA", kind: "stations", name: "Taza", latitude: 34.2167, longitude: -4.0167, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:TAOURIRT", kind: "stations", name: "Taourirt", latitude: 34.4065, longitude: -3.0034, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:OUJDA", kind: "stations", name: "Oujda", latitude: 34.6805, longitude: -1.911, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:NADOR", kind: "stations", name: "Nador", latitude: 35.1681, longitude: -2.9343, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:BERKANE", kind: "stations", name: "Berkane", latitude: 35.1089, longitude: -2.3069, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:EL_JADIDA", kind: "stations", name: "El Jadida", latitude: 33.2316, longitude: -8.5147, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:SAFI", kind: "stations", name: "Safi", latitude: 32.2994, longitude: -9.2379, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:KHOURIBGA", kind: "stations", name: "Khouribga", latitude: 32.8811, longitude: -6.9063, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:OUED_ZEM", kind: "stations", name: "Oued Zem", latitude: 32.8633, longitude: -6.5667, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:BENI_MELLAL", kind: "stations", name: "Béni Mellal", latitude: 32.3374, longitude: -6.3494, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
  Object.freeze({ id: "oncf:SIDI_KACEM", kind: "stations", name: "Sidi Kacem", latitude: 34.2167, longitude: -5.7, operator: "ONCF", iata: "", icao: "", website: "", color: "#f0c14a" }),
]);

export const MOROCCO_OURAIRPORTS = Object.freeze([
  Object.freeze({ id: "ourairports:GMAD", kind: "airports", name: "Al Massira Airport", latitude: 30.322478, longitude: -9.412003, operator: "", iata: "AGA", icao: "GMAD", website: "http://www.agadir-airport.com/en/index.php", color: "#7ecbff" }),
  Object.freeze({ id: "ourairports:GMAT", kind: "airports", name: "Tan Tan Airport", latitude: 28.447563, longitude: -11.161749, operator: "", iata: "TTA", icao: "GMAT", website: "", color: "#7ecbff" }),
  Object.freeze({ id: "ourairports:GMAZ", kind: "airports", name: "Zagora Airport", latitude: 30.265788, longitude: -5.860808, operator: "", iata: "OZG", icao: "GMAZ", website: "", color: "#7ecbff" }),
  Object.freeze({ id: "ourairports:GMFB", kind: "airports", name: "Bouarfa Airport", latitude: 32.514306, longitude: -1.983056, operator: "", iata: "UAR", icao: "GMFB", website: "", color: "#7ecbff" }),
  Object.freeze({ id: "ourairports:GMFF", kind: "airports", name: "Fes Saïss International Airport", latitude: 33.927299, longitude: -4.97796, operator: "", iata: "FEZ", icao: "GMFF", website: "", color: "#7ecbff" }),
  Object.freeze({ id: "ourairports:GMFK", kind: "airports", name: "Moulay Ali Cherif Airport", latitude: 31.9475002289, longitude: -4.39833021164, operator: "", iata: "ERH", icao: "GMFK", website: "", color: "#7ecbff" }),
  Object.freeze({ id: "ourairports:GMFO", kind: "airports", name: "Oujda Angads Airport", latitude: 34.789558, longitude: -1.926041, operator: "", iata: "OUD", icao: "GMFO", website: "", color: "#7ecbff" }),
  Object.freeze({ id: "ourairports:GMMD", kind: "airports", name: "Beni Mellal Airport", latitude: 32.401895, longitude: -6.315905, operator: "", iata: "BEM", icao: "GMMD", website: "http://ww.onda.ma", color: "#7ecbff" }),
  Object.freeze({ id: "ourairports:GMME", kind: "airports", name: "Rabat-Salé Airport", latitude: 34.051498, longitude: -6.75152, operator: "", iata: "RBA", icao: "GMME", website: "https://www.onda.ma/en/Our-Airports/Rabat-Sale-Airport", color: "#7ecbff" }),
  Object.freeze({ id: "ourairports:GMMI", kind: "airports", name: "Essaouira-Mogador Airport", latitude: 31.397499, longitude: -9.68167, operator: "", iata: "ESU", icao: "GMMI", website: "", color: "#7ecbff" }),
  Object.freeze({ id: "ourairports:GMMN", kind: "airports", name: "Mohammed V International Airport", latitude: 33.3675, longitude: -7.58997, operator: "", iata: "CMN", icao: "GMMN", website: "https://www.aeroportcasablanca.ma/en/Our-Airports/Casablanca-Mohammed-V-Airport", color: "#7ecbff" }),
  Object.freeze({ id: "ourairports:GMMW", kind: "airports", name: "Nador Al Aaroui International Airport", latitude: 34.9888, longitude: -3.02821, operator: "", iata: "NDR", icao: "GMMW", website: "", color: "#7ecbff" }),
  Object.freeze({ id: "ourairports:GMMX", kind: "airports", name: "Marrakesh Menara Airport", latitude: 31.604807, longitude: -8.035788, operator: "", iata: "RAK", icao: "GMMX", website: "", color: "#7ecbff" }),
  Object.freeze({ id: "ourairports:GMMZ", kind: "airports", name: "Ouarzazate International Airport", latitude: 30.9391, longitude: -6.90943, operator: "", iata: "OZZ", icao: "GMMZ", website: "", color: "#7ecbff" }),
  Object.freeze({ id: "ourairports:GMTA", kind: "airports", name: "Cherif Al Idrissi Airport", latitude: 35.177101, longitude: -3.83952, operator: "", iata: "AHU", icao: "GMTA", website: "", color: "#7ecbff" }),
  Object.freeze({ id: "ourairports:GMTN", kind: "airports", name: "Sania Ramel Airport", latitude: 35.594299, longitude: -5.32002, operator: "", iata: "TTU", icao: "GMTN", website: "", color: "#7ecbff" }),
  Object.freeze({ id: "ourairports:GMTT", kind: "airports", name: "Tangier Ibn Battuta Airport", latitude: 35.731741, longitude: -5.921459, operator: "", iata: "TNG", icao: "GMTT", website: "", color: "#7ecbff" }),
]);

export const MOROCCO_UNESCO_SITES = Object.freeze([
  Object.freeze({ id: "unesco:fez-medina", kind: "unesco", name: "Medina of Fez", latitude: 34.0646, longitude: -4.9733, operator: "UNESCO", iata: "", icao: "", website: "https://whc.unesco.org/en/list/170", color: "#ff9f43" }),
  Object.freeze({ id: "unesco:marrakech-medina", kind: "unesco", name: "Medina of Marrakesh", latitude: 31.6258, longitude: -7.9891, operator: "UNESCO", iata: "", icao: "", website: "https://whc.unesco.org/en/list/331", color: "#ff9f43" }),
  Object.freeze({ id: "unesco:ait-ben-haddou", kind: "unesco", name: "Ksar of Ait-Ben-Haddou", latitude: 31.0472, longitude: -7.1319, operator: "UNESCO", iata: "", icao: "", website: "https://whc.unesco.org/en/list/444", color: "#ff9f43" }),
  Object.freeze({ id: "unesco:meknes", kind: "unesco", name: "Historic City of Meknes", latitude: 33.8947, longitude: -5.5473, operator: "UNESCO", iata: "", icao: "", website: "https://whc.unesco.org/en/list/793", color: "#ff9f43" }),
  Object.freeze({ id: "unesco:volubilis", kind: "unesco", name: "Volubilis", latitude: 34.0739, longitude: -5.5556, operator: "UNESCO", iata: "", icao: "", website: "https://whc.unesco.org/en/list/836", color: "#ff9f43" }),
  Object.freeze({ id: "unesco:tetouan-medina", kind: "unesco", name: "Medina of Tetouan", latitude: 35.5711, longitude: -5.3684, operator: "UNESCO", iata: "", icao: "", website: "https://whc.unesco.org/en/list/837", color: "#ff9f43" }),
  Object.freeze({ id: "unesco:essaouira", kind: "unesco", name: "Medina of Essaouira", latitude: 31.5125, longitude: -9.7699, operator: "UNESCO", iata: "", icao: "", website: "https://whc.unesco.org/en/list/753", color: "#ff9f43" }),
  Object.freeze({ id: "unesco:mazagan", kind: "unesco", name: "Portuguese City of Mazagan", latitude: 33.2566, longitude: -8.5028, operator: "UNESCO", iata: "", icao: "", website: "https://whc.unesco.org/en/list/1058", color: "#ff9f43" }),
  Object.freeze({ id: "unesco:rabat", kind: "unesco", name: "Rabat Historic City", latitude: 34.0209, longitude: -6.8416, operator: "UNESCO", iata: "", icao: "", website: "https://whc.unesco.org/en/list/1401", color: "#ff9f43" }),
]);

function inBox(record, box) {
  return record.latitude >= box.south
    && record.latitude <= box.north
    && record.longitude >= box.west
    && record.longitude <= box.east;
}

/**
 * @param {{south:number, west:number, north:number, east:number}} box
 * @param {string[]} [kinds]
 * @returns {object[]}
 */
export function moroccoStaticRecordsInBox(box, kinds) {
  if (!box) return [];
  const allowed = new Set(normalizeMoroccoKinds(kinds));
  const pool = [];
  if (allowed.has('stations')) pool.push(...MOROCCO_ONCF_STOPS);
  if (allowed.has('airports')) pool.push(...MOROCCO_OURAIRPORTS);
  if (allowed.has('unesco')) pool.push(...MOROCCO_UNESCO_SITES);
  return pool.filter((record) => inBox(record, box));
}

/**
 * Static records first, then live OSM, de-duplicated by id then name+kind.
 * @param {object[]} staticRecords
 * @param {object[]} liveRecords
 * @param {number} [cap=350]
 */
export function mergeMoroccoPlaceRecords(staticRecords, liveRecords, cap = 350) {
  const out = [];
  const seenId = new Set();
  const seenName = new Set();
  for (const record of [...(staticRecords || []), ...(liveRecords || [])]) {
    if (!record?.id || seenId.has(record.id)) continue;
    const nameKey = `${String(record.kind)}:${String(record.name || '').toLowerCase()}`;
    if (seenName.has(nameKey)) continue;
    seenId.add(record.id);
    seenName.add(nameKey);
    out.push(record);
    if (out.length >= cap) break;
  }
  return out;
}
