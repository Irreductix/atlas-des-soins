// Fabrique les données de l'atlas à partir des fichiers publics :
//   node scripts/construire.mjs --finess <dossier> --has <valeurs.csv> --sortie site/donnees
// <dossier> contient etablissements.csv, activites.csv et structures-resume.json, produits par referentiels-sante.
// Écrit france.json (les départements), departements/<code>.json (les établissements de chacun),
// fiches/<code>/<finess>.json (autorisations, activité, qualité) et recherche.json (les établissements de soins).

import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FAMILLES } from '../src/familles.mjs';
import { COLONNES_POINT, SOINS, etablissementDeLigne, lireActivites, lireCsv, pointDe, regrouperAutorisations } from '../src/finess.mjs';
import { lireValeurs, qualiteDe } from '../src/has.mjs';

// Territoires proposés en raccourci sur la carte : hors de l'Hexagone, on ne les trouve pas en déplaçant la vue.
const TERRITOIRES = { 971: 'Guadeloupe', 972: 'Martinique', 973: 'Guyane', 974: 'La Réunion', 975: 'Saint-Pierre-et-Miquelon', 976: 'Mayotte', 977: 'Saint-Barthélemy', 978: 'Saint-Martin', 986: 'Wallis-et-Futuna' };

/**
 * @param {{ finess: string, has?: string, sortie: string, journal?: (m: string) => void }} options
 */
export async function construire({ finess, has, sortie, journal = () => {} }) {
  journal('lecture des activités…');
  const { soins, autorisations } = await lireActivites(join(finess, 'activites.csv'));
  journal(`${autorisations.size} établissements avec des autorisations`);

  const qualite = has ? await lireValeurs(has) : new Map();
  if (has) journal(`${qualite.size} établissements dans la base de la HAS`);

  const departements = new Map(); const rattaches = new Map(); const parFiness = new Map();
  for await (const ligne of lireCsv(join(finess, 'etablissements.csv'))) {
    const e = etablissementDeLigne(ligne, soins.get(ligne.finess_et));
    if (!e || !/^(\d\d|2[AB]|9[78]\d)$/.test(e.departement)) continue;
    if (!departements.has(e.departement)) departements.set(e.departement, []);
    departements.get(e.departement).push(e);
    parFiness.set(e.finess, e);
    if (e.porteuse && e.porteuse !== e.finess) { if (!rattaches.has(e.porteuse)) rattaches.set(e.porteuse, []); rattaches.get(e.porteuse).push(e); }
  }

  rmSync(sortie, { recursive: true, force: true });
  mkdirSync(join(sortie, 'departements'), { recursive: true });
  const resume = []; const recherche = []; let fiches = 0; let total = 0; let sansPosition = 0;
  for (const [code, etablissements] of [...departements].sort((a, b) => a[0].padStart(3, '0').localeCompare(b[0].padStart(3, '0')))) {
    etablissements.sort((a, b) => a.famille - b.famille || a.nom.localeCompare(b.nom, 'fr'));
    const dossier = join(sortie, 'fiches', code); let dossierCree = false;
    const points = [];
    for (const e of etablissements) {
      const fiche = ficheDe(e, autorisations.get(e.finess), rattaches.get(e.finess), qualiteDe(qualite.get(e.finess)));
      const detail = Boolean(fiche.autorisations || fiche.rattaches || fiche.qualite);
      if (detail) {
        if (!dossierCree) { mkdirSync(dossier, { recursive: true }); dossierCree = true; }
        writeFileSync(join(dossier, `${e.finess}.json`), JSON.stringify(fiche));
        fiches++;
      }
      points.push(pointDe(e, detail));
      if (e.latitude === null) sansPosition++;
      // La recherche nationale porte sur les établissements de soins ; les autres se cherchent une fois leur département affiché.
      if (e.latitude !== null && (e.soins.length || fiche.qualite || e.famille <= 1)) recherche.push([e.finess, e.nom, e.commune, code, e.famille, Math.round(e.latitude * 1e4) / 1e4, Math.round(e.longitude * 1e4) / 1e4]);
    }
    writeFileSync(join(sortie, 'departements', `${code}.json`), JSON.stringify({ colonnes: COLONNES_POINT, lignes: points }));
    const places = etablissements.filter((e) => e.latitude !== null);
    const lat = places.map((e) => e.latitude).sort((a, b) => a - b); const lon = places.map((e) => e.longitude).sort((a, b) => a - b);
    // L'emprise écarte le centième des points les plus excentrés : une adresse mal placée ne doit pas étirer le département.
    const borne = (t, p) => t[Math.min(t.length - 1, Math.max(0, Math.round(p * (t.length - 1))))];
    const parFamille = FAMILLES.map((f, i) => etablissements.filter((e) => e.famille === i).length);
    resume.push({ code, nom: etablissements.find((e) => e.departementLibelle)?.departementLibelle || TERRITOIRES[code] || code, n: etablissements.length, familles: parFamille,
      boite: places.length ? [borne(lat, 0.005), borne(lon, 0.005), borne(lat, 0.995), borne(lon, 0.995)].map((v) => Math.round(v * 1e4) / 1e4) : null,
      centre: places.length ? [borne(lat, 0.5), borne(lon, 0.5)].map((v) => Math.round(v * 1e4) / 1e4) : null, territoire: TERRITOIRES[code] ? 1 : 0 });
    total += etablissements.length;
  }

  const source = existsSync(join(finess, 'structures-resume.json')) ? JSON.parse(readFileSync(join(finess, 'structures-resume.json'), 'utf8')) : {};
  const france = {
    genere: new Date().toISOString().slice(0, 10), instantane: (source.generatedAt || '').slice(0, 10), qualite: Boolean(has),
    etablissements: total, fiches, sansPosition,
    familles: FAMILLES.map((f) => ({ cle: f.cle, nom: f.nom })), soins: Object.fromEntries(Object.entries(SOINS).map(([k, v]) => [k, v.nom])),
    departements: resume,
  };
  writeFileSync(join(sortie, 'france.json'), JSON.stringify(france));
  recherche.sort((a, b) => a[4] - b[4] || a[1].localeCompare(b[1], 'fr'));
  writeFileSync(join(sortie, 'recherche.json'), JSON.stringify(recherche));
  journal(`${total} établissements dans ${resume.length} départements ; ${fiches} fiches détaillées ; ${recherche.length} établissements dans la recherche nationale ; ${sansPosition} sans position`);
  return france;
}

/** Ce que la fiche d'un établissement ajoute à la ligne de son département. */
export function ficheDe(e, autorisations, rattaches, qualite) {
  const fiche = { finess: e.finess, siret: e.siret || '', ouverture: e.ouverture || '', premiereAutorisation: e.premiereAutorisation || '', ejFiness: e.ejFiness || '', maj: e.maj || '', positionCalculee: e.positionCalculee ? 1 : 0 };
  if (autorisations?.length) fiche.autorisations = regrouperAutorisations(autorisations);
  if (rattaches?.length) fiche.rattaches = rattaches.map((r) => ({ finess: r.finess, nom: r.nom, commune: r.commune, departement: r.departement })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  if (qualite) fiche.qualite = qualite;
  return fiche;
}

function option(arguments_, nom) {
  const rang = arguments_.indexOf(nom);
  return rang >= 0 ? arguments_[rang + 1] : undefined;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const arguments_ = process.argv.slice(2);
  const finess = option(arguments_, '--finess'); const sortie = option(arguments_, '--sortie') ?? 'site/donnees';
  if (!finess) { console.error('usage : node scripts/construire.mjs --finess <dossier> [--has <valeurs.csv>] [--sortie site/donnees]'); process.exit(2); }
  await construire({ finess, has: option(arguments_, '--has'), sortie, journal: (m) => console.error(m) });
}
