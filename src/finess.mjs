// Lecture des fichiers FINESS convertis par referentiels-sante (etablissements.csv, activites.csv)
// et mise en forme pour l'atlas : points par département, autorisations par établissement.

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

import { rangFamille } from './familles.mjs';

/** Lit un CSV « ; » ligne à ligne et rend des objets indexés par nom de colonne. Les champs entre guillemets sont gérés. */
export async function* lireCsv(chemin) {
  let colonnes = null;
  for await (const brute of createInterface({ input: createReadStream(chemin), crlfDelay: Infinity })) {
    const ligne = colonnes ? brute : brute.replace(/^﻿/, '');
    if (!ligne) continue;
    const champs = ligne.includes('"') ? decouper(ligne, ';') : ligne.split(';');
    if (!colonnes) { colonnes = champs; continue; }
    const objet = {};
    for (let i = 0; i < colonnes.length; i++) objet[colonnes[i]] = champs[i] ?? '';
    yield objet;
  }
}

/** Découpe une ligne CSV dont certains champs sont entre guillemets. */
export function decouper(ligne, separateur) {
  const champs = []; let champ = ''; let guillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (guillemets) {
      if (c === '"') { if (ligne[i + 1] === '"') { champ += '"'; i++; } else guillemets = false; } else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === separateur) { champs.push(champ); champ = ''; } else champ += c;
  }
  champs.push(champ);
  return champs;
}

// Activités de soins retenues pour résumer un établissement : code du régime AMM (QA…) et codes du régime AMF.
export const SOINS = {
  med: { nom: 'médecine', amm: ['QA001'], amf: ['01'] },
  chir: { nom: 'chirurgie', amm: ['QA002'], amf: ['02'] },
  obs: { nom: 'obstétrique', amm: ['QA003'], amf: ['03'] },
  psy: { nom: 'psychiatrie', amm: ['QA004'], amf: ['04'] },
  sld: { nom: 'soins de longue durée', amm: ['QA007'], amf: ['07'] },
  urg: { nom: 'urgences', amm: ['QA014'], amf: ['14'] },
  crit: { nom: 'soins critiques', amm: ['QA015'], amf: ['15'] },
  dial: { nom: 'dialyse', amm: ['QA016'], amf: ['16'] },
  cancer: { nom: 'traitement du cancer', amm: ['QA018'], amf: ['18'] },
  had: { nom: 'hospitalisation à domicile', amm: ['QA020'], amf: [] },
  smr: { nom: 'soins médicaux et de réadaptation', amm: ['QA050'], amf: ['50', '51', '52', '53', '54', '55', '56', '57', '58', '59'] },
};
const ORDRE_SOINS = Object.keys(SOINS);

const vide = (v) => !v || /^Pas de |^Aucun /.test(v);
const estUneForme = (v) => /^Hospitalisation|^Chirurgie ambulatoire/.test(v);
const estUneSaison = (v) => /saisonnier/i.test(v);

/** Grande activité de soins d'une ligne d'activité exercée et mise en œuvre, ou null. */
export function soinDeLigne(l) {
  if (l.niveau !== 'exercee' || l.etat !== 'A' || l.statut !== '1') return null;
  const regime = l.nature === 'AMM' ? 'amm' : l.nature === 'AMF' ? 'amf' : null;
  if (!regime) return null;
  return ORDRE_SOINS.find((s) => SOINS[s][regime].includes(l.activite)) ?? null;
}

/**
 * Une ligne d'activité devient une autorisation lisible : l'activité, ce qu'elle couvre,
 * les modes de prise en charge, la période, et si elle est mise en œuvre.
 */
export function autorisationDeLigne(l) {
  const details = [l.modalite_libelle, l.mention_libelle, l.pratique_libelle, l.forme_libelle, l.declaration_libelle, l.mode_fonctionnement_libelle, l.public_libelle]
    .filter((v) => !vide(v) && !estUneSaison(v));
  return {
    regime: l.nature,
    activite: l.activite_libelle || l.type_eml_libelle || l.nature_libelle || l.nature,
    objet: details.filter((v) => !estUneForme(v)).join(', '),
    formes: details.filter(estUneForme),
    appareils: l.nb_appareils && l.nb_appareils !== '0' ? Number(l.nb_appareils) : 0,
    debut: l.date_debut || '',
    fin: l.date_fin || '',
    attente: l.statut !== '1',
  };
}

/**
 * Regroupe les autorisations d'un établissement : une entrée par activité, et dans chacune une ligne par
 * objet et période, les modes de prise en charge réunis.
 */
export function regrouperAutorisations(autorisations) {
  const activites = new Map();
  for (const a of autorisations) {
    const cle = (a.regime === 'AMM' || a.regime === 'AMF' ? 'soins' : 'autres') + '|' + a.activite;
    if (!activites.has(cle)) activites.set(cle, { genre: cle.split('|')[0], activite: a.activite, lignes: new Map() });
    const lignes = activites.get(cle).lignes;
    const ligne = a.objet + '|' + a.debut + '|' + a.fin;
    if (!lignes.has(ligne)) lignes.set(ligne, { objet: a.objet, formes: [], debut: a.debut, fin: a.fin, appareils: a.appareils, attente: a.attente });
    const reunie = lignes.get(ligne);
    for (const f of a.formes) if (!reunie.formes.includes(f)) reunie.formes.push(f);
    reunie.attente = reunie.attente && a.attente;
  }
  return [...activites.values()]
    .map((x) => ({ genre: x.genre, activite: x.activite, lignes: [...x.lignes.values()] }))
    .sort((x, y) => (x.genre === y.genre ? y.lignes.length - x.lignes.length || x.activite.localeCompare(y.activite, 'fr') : x.genre === 'soins' ? -1 : 1));
}

/** Lit activites.csv et rend, par numéro FINESS d'établissement, ses grandes activités de soins et ses autorisations en vigueur. */
export async function lireActivites(chemin) {
  const soins = new Map(); const autorisations = new Map();
  for await (const l of lireCsv(chemin)) {
    if (l.niveau !== 'exercee' || l.etat !== 'A' || !l.finess_et) continue;
    const soin = soinDeLigne(l);
    if (soin) { if (!soins.has(l.finess_et)) soins.set(l.finess_et, new Set()); soins.get(l.finess_et).add(soin); }
    if (!autorisations.has(l.finess_et)) autorisations.set(l.finess_et, []);
    autorisations.get(l.finess_et).push(autorisationDeLigne(l));
  }
  const soinsOrdonnes = new Map([...soins].map(([f, s]) => [f, ORDRE_SOINS.filter((x) => s.has(x))]));
  return { soins: soinsOrdonnes, autorisations };
}

const adresseDe = (l) => [l.numero_voie, l.complement_voie, l.type_voie, l.libelle_voie].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || l.adresse_ligne_4 || l.lieu_dit || '';

/** Un établissement en activité tel que l'atlas le garde, ou null s'il est fermé. */
export function etablissementDeLigne(l, soins) {
  if (l.etat !== 'A' || l.date_fermeture) return null;
  const latitude = Number(l.latitude); const longitude = Number(l.longitude);
  const place = l.latitude !== '' && l.longitude !== '' && latitude >= -60 && latitude <= 72 && longitude >= -180 && longitude <= 180;
  const e = {
    finess: l.finess_et, nom: l.nom_long || l.nom_court, nomCourt: l.nom_court, categorie: l.categorie, categorieLibelle: l.categorie_libelle, domaine: l.domaine,
    secteur: l.secteur, adresse: adresseDe(l), codePostal: l.code_postal, commune: l.commune_acheminement, departement: l.departement, departementLibelle: l.departement_libelle,
    latitude: place ? latitude : null, longitude: place ? longitude : null, positionCalculee: l.latitude_longitude_origine === 'calcul',
    telephone: l.telephone, siret: l.siret, ouverture: l.date_ouverture, premiereAutorisation: l.date_premiere_autorisation,
    ej: l.ej_denomination, ejFiness: l.finess_ej, ejStatut: l.ej_statut_juridique_libelle, ght: l.ght_nom, ghtRole: l.ght_role,
    porteuse: l.ege_porteuse_finess, maj: (l.date_derniere_maj || '').slice(0, 10), soins: soins ?? [],
  };
  e.famille = rangFamille(e);
  return e;
}

// Colonnes du fichier d'un département, dans l'ordre des tableaux écrits.
export const COLONNES_POINT = ['finess', 'nom', 'famille', 'categorieLibelle', 'secteur', 'adresse', 'codePostal', 'commune', 'latitude', 'longitude', 'telephone', 'ej', 'ejStatut', 'ght', 'ghtRole', 'soins', 'detail'];

/** Tableau compact d'un établissement pour le fichier de son département. */
export function pointDe(e, detail) {
  return COLONNES_POINT.map((c) => (c === 'detail' ? (detail ? 1 : 0) : c === 'soins' ? e.soins.join(' ') : c === 'latitude' || c === 'longitude' ? (e[c] === null ? null : Math.round(e[c] * 1e5) / 1e5) : e[c] ?? ''));
}
