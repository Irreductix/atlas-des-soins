import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

import { FAMILLES, rangFamille } from '../src/familles.mjs';
import { autorisationDeLigne, decouper, etablissementDeLigne, regrouperAutorisations, soinDeLigne } from '../src/finess.mjs';
import { VARIABLES, lireValeurs, qualiteDe } from '../src/has.mjs';
import { construire } from '../scripts/construire.mjs';

vm.runInThisContext(readFileSync(new URL('../site/outils.js', import.meta.url), 'utf8'));
const O = globalThis.AtlasOutils;

const ETABLISSEMENTS = ['finess_et', 'finess_ej', 'nom_court', 'nom_long', 'siret', 'categorie', 'categorie_libelle', 'domaine', 'etat', 'date_ouverture', 'date_premiere_autorisation', 'date_fermeture',
  'numero_voie', 'type_voie', 'libelle_voie', 'complement_voie', 'lieu_dit', 'adresse_ligne_4', 'code_postal', 'commune_acheminement', 'departement', 'departement_libelle', 'latitude', 'longitude', 'telephone',
  'ege_porteuse_finess', 'ej_denomination', 'ej_statut_juridique_libelle', 'date_derniere_maj', 'secteur', 'ght_nom', 'ght_role', 'latitude_longitude_origine'];
const ACTIVITES = ['finess_et', 'niveau', 'nature', 'nature_libelle', 'activite', 'activite_libelle', 'modalite_libelle', 'forme_libelle', 'mention_libelle', 'pratique_libelle', 'declaration_libelle', 'mode_fonctionnement_libelle', 'public_libelle', 'type_eml_libelle', 'nb_appareils', 'etat', 'statut', 'date_debut', 'date_fin'];
const ligne = (colonnes, valeurs) => colonnes.map((c) => valeurs[c] ?? '').join(';');
const etab = (v) => Object.fromEntries(ETABLISSEMENTS.map((c) => [c, v[c] ?? '']));

const HOPITAL = { finess_et: '440000271', finess_ej: '440000289', nom_court: 'CHU NANTES HOTEL DIEU', nom_long: 'CHU DE NANTES SITE HOTEL DIEU', siret: '26440013600012', categorie: '101', categorie_libelle: 'Centre hospitalier régional (CHR)', domaine: 'SAN', etat: 'A', date_ouverture: '1967-01-01',
  numero_voie: '1', type_voie: 'PL', libelle_voie: 'ALEXIS RICORDEAU', code_postal: '44093', commune_acheminement: 'NANTES CEDEX 1', departement: '44', departement_libelle: 'Loire-Atlantique', latitude: '47.2117', longitude: '-1.5536', telephone: '0240083333',
  ej_denomination: 'CHU DE NANTES', ej_statut_juridique_libelle: 'Etablissement Public Régional', date_derniere_maj: '2026-10-02T00:00:00', secteur: 'public', ght_nom: 'Loire Atlantique', ght_role: 'S', latitude_longitude_origine: 'source' };
const ANNEXE = { ...HOPITAL, finess_et: '440044428', nom_court: 'AMP BIO CHU NANTES', nom_long: '', latitude: '', longitude: '', ege_porteuse_finess: '440000271', latitude_longitude_origine: '' };
const PHARMACIE = { finess_et: '440012345', finess_ej: '440012344', nom_court: 'PHARMACIE DU PORT', categorie: '620', categorie_libelle: "Pharmacie d'Officine", domaine: 'SAN', etat: 'A', code_postal: '44000', commune_acheminement: 'NANTES', departement: '44', departement_libelle: 'Loire-Atlantique', latitude: '47.21', longitude: '-1.56', secteur: 'privé lucratif', latitude_longitude_origine: 'calcul' };
const EHPAD = { finess_et: '974000011', finess_ej: '974000010', nom_court: 'EHPAD LES ALIZES', categorie: '500', categorie_libelle: "Etablissement d'hébergement pour personnes âgées dépendantes", domaine: 'SOC', etat: 'A', code_postal: '97400', commune_acheminement: 'SAINT DENIS', departement: '974', departement_libelle: 'La Réunion', latitude: '-20.88', longitude: '55.45', secteur: 'public' };
const FERME = { ...PHARMACIE, finess_et: '440099999', etat: 'I', date_fermeture: '2020-01-01' };

const chirurgie = (pratique, forme) => ({ finess_et: '440000271', niveau: 'exercee', nature: 'AMM', activite: 'QA002', activite_libelle: 'Chirurgie', modalite_libelle: 'Adultes', mention_libelle: 'Pas de mention', pratique_libelle: pratique, forme_libelle: forme, declaration_libelle: 'Pas de déclaration', etat: 'A', statut: '1', date_debut: '2024-11-28', date_fin: '2031-11-30' });
const LIGNES_ACTIVITES = [
  chirurgie('Urologie', 'Hospitalisation ambulatoire'), chirurgie('Urologie', 'Hospitalisation à temps complet'), chirurgie('Ophtalmologie', 'Hospitalisation ambulatoire'),
  { finess_et: '440000271', niveau: 'exercee', nature: 'AMF', activite: '14', activite_libelle: "Médecine d'urgence", modalite_libelle: 'SU Structure des urgences', forme_libelle: 'Non saisonnier', etat: 'A', statut: '1', date_debut: '2007-02-20', date_fin: '2023-03-19' },
  { finess_et: '440000271', niveau: 'exercee', nature: 'AASA', activite: 'X', activite_libelle: 'Lactarium', modalite_libelle: 'A usage intérieur', forme_libelle: 'Pas de forme', etat: 'A', statut: '2', date_debut: '2011-12-20', date_fin: '2026-12-19' },
  { finess_et: '440000271', niveau: 'autorisee', nature: 'AMM', activite: 'QA001', activite_libelle: 'Médecine', etat: 'A', statut: '1' },
  { finess_et: '440000271', niveau: 'exercee', nature: 'AMM', activite: 'QA003', activite_libelle: 'Obstétrique', etat: 'I', statut: '1' },
];

test('une ligne d\'activité devient une autorisation lisible, et les autorisations se regroupent par activité', () => {
  assert.equal(soinDeLigne(LIGNES_ACTIVITES[0]), 'chir');
  assert.equal(soinDeLigne(LIGNES_ACTIVITES[3]), 'urg');
  assert.equal(soinDeLigne(LIGNES_ACTIVITES[4]), null, 'une autre activité soumise à autorisation n\'est pas une grande activité de soins');
  assert.equal(soinDeLigne(LIGNES_ACTIVITES[5]), null, 'seules les activités exercées comptent');
  const a = autorisationDeLigne(LIGNES_ACTIVITES[0]);
  assert.deepEqual([a.activite, a.objet, a.formes, a.debut, a.fin, a.attente], ['Chirurgie', 'Adultes, Urologie', ['Hospitalisation ambulatoire'], '2024-11-28', '2031-11-30', false], 'les « Pas de… » disparaissent');
  assert.equal(autorisationDeLigne(LIGNES_ACTIVITES[3]).formes.length, 0, 'le caractère saisonnier n\'est pas un mode de prise en charge');
  assert.equal(autorisationDeLigne(LIGNES_ACTIVITES[4]).attente, true);

  const groupes = regrouperAutorisations(LIGNES_ACTIVITES.slice(0, 5).map(autorisationDeLigne));
  assert.deepEqual(groupes.map((g) => g.genre + ':' + g.activite + ':' + g.lignes.length), ['soins:Chirurgie:2', "soins:Médecine d'urgence:1", 'autres:Lactarium:1'], 'les activités de soins d\'abord, les plus fournies en tête');
  assert.deepEqual(groupes[0].lignes[0], { objet: 'Adultes, Urologie', formes: ['Hospitalisation ambulatoire', 'Hospitalisation à temps complet'], debut: '2024-11-28', fin: '2031-11-30', appareils: 0, attente: false }, 'les deux modes de prise en charge d\'une même pratique sont réunis');
});

test('un établissement en activité garde son identité, sa position et sa famille', () => {
  const e = etablissementDeLigne(etab(HOPITAL), ['med', 'chir']);
  assert.deepEqual([e.finess, e.nom, e.adresse, e.latitude, e.longitude, e.famille, e.positionCalculee, e.maj], ['440000271', 'CHU DE NANTES SITE HOTEL DIEU', '1 PL ALEXIS RICORDEAU', 47.2117, -1.5536, 0, false, '2026-10-02']);
  assert.equal(FAMILLES[e.famille].cle, 'hopital');
  assert.equal(etablissementDeLigne(etab(ANNEXE)).latitude, null, 'pas de position inventée');
  assert.equal(etablissementDeLigne(etab(ANNEXE)).nom, 'AMP BIO CHU NANTES', 'le nom court quand le nom long manque');
  assert.equal(etablissementDeLigne(etab(PHARMACIE)).positionCalculee, true);
  assert.equal(etablissementDeLigne(etab(FERME)), null);
  assert.equal(FAMILLES[etablissementDeLigne(etab(PHARMACIE)).famille].cle, 'pharmacie');
  assert.equal(FAMILLES[etablissementDeLigne(etab(EHPAD)).famille].cle, 'age');
  assert.equal(FAMILLES[rangFamille({ categorie: '365', categorieLibelle: '', domaine: 'SAN', secteur: 'privé lucratif', soins: [] })].cle, 'clinique');
  assert.equal(FAMILLES[rangFamille({ categorie: '999', categorieLibelle: 'Service', domaine: 'SOC', secteur: '', soins: [] })].cle, 'social');
  assert.deepEqual(decouper('a;"b;c";"d ""e"""', ';'), ['a', 'b;c', 'd "e"']);
});

function valeurs(dossier) {
  const lignes = ['annee,finess,finess_type,key,value_boolean,value_string,value_integer,value_float,missing_value,value_date',
    '2023,440000271,geo,certification_ref_2021_decision,,,2,,,', '2023,440000271,geo,certification_ref_2021_date_decision,,,,,,2023-11-08', '2023,440000271,geo,certification_ref_2021_score_chapitre_1,,,,97.388,,',
    '2024,440000271,geo,score_all_rea_ajust,,,,70.1,,', '2025,440000271,geo,score_all_rea_ajust,,,,74.56,,', '2025,440000271,geo,score_ajust_esatis_type_48h,,,,73.82,,', '2025,440000271,geo,nb_rep_score_all_rea_ajust,,,2048,,,', '2025,440000271,geo,score_repas_rea_ajust,,,,58.43,,',
    '2024,440000271,geo,mco_dpa_pcd_2018-pcd_resultat,,,,98.0,,', '2024,440000271,geo,mco_dpa_pcd_2018-pcd_moyenne_nationale,,,,88.6,,', '2024,440000271,geo,ssr_dpa_pcd_2021-pcd_resultat,,,,,Non concerné,',
    '2024,440000271,geo,mco_lit_mco,,,618,,,', '2024,440000271,geo,mco_sejhc_mco,,,37607,,,', '2024,440000271,geo,mco_lit_obs,,,0,,,', '2024,440000271,geo,perinat_autor,,TYPE2,,,,', '2024,440000271,geo,perinat_sejacc,,,2953,,,', '2024,440000271,geo,perinat_sejces,,,623,,,',
    '2024,440000271,geo,variable_inutile,,"une, virgule",,,,', '2025,440012345,geo,autre_variable,,,1,,,'];
  const chemin = join(dossier, 'valeurs.csv'); writeFileSync(chemin, lignes.join('\n') + '\n'); return chemin;
}

test('la base de la HAS donne, par établissement, la dernière valeur de chaque variable utile', async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'atlas-'));
  const lues = await lireValeurs(valeurs(dossier));
  assert.deepEqual([...lues.keys()], ['440000271'], 'un établissement sans variable utile n\'est pas gardé');
  assert.deepEqual(lues.get('440000271').get('score_all_rea_ajust'), { annee: '2025', valeur: '74.56' }, 'l\'année la plus récente l\'emporte');
  assert.equal(lues.get('440000271').has('ssr_dpa_pcd_2021-pcd_resultat'), false, 'une valeur manquante n\'est pas une valeur');
  assert.ok(VARIABLES.has('mco_lit_mco') && !VARIABLES.has('variable_inutile'));

  const q = qualiteDe(lues.get('440000271'));
  assert.deepEqual(q.certification, { decision: 'Certifié', date: '2023-11-08', chapitres: [['Le patient', 97.388]] });
  assert.deepEqual(q.satisfaction, [{ nom: 'Hospitalisation de plus de 48 heures', annee: '2025', note: 74.56, region: null, france: 73.82, reponses: 2048, recommandent: null, detail: [['Repas', 58.43]] }]);
  assert.deepEqual(q.indicateurs.map((i) => [i.nom, i.resultat, i.france]), [['Évaluation et prise en charge de la douleur', 98, 88.6]]);
  assert.deepEqual(q.activite, { annee: '2024', lignes: [['Ensemble', 618, null, 37607, null]], journees: null, maternite: { type: '2', accouchements: 2953, cesariennes: 623, ivg: null } }, 'une ligne à zéro partout n\'est pas affichée');
  assert.equal(qualiteDe(undefined), null);
  assert.equal(qualiteDe(new Map()), null);
});

test('la construction écrit la France, un fichier par département, les fiches détaillées et la recherche', async () => {
  const entree = mkdtempSync(join(tmpdir(), 'atlas-finess-')); const sortie = join(mkdtempSync(join(tmpdir(), 'atlas-site-')), 'donnees');
  writeFileSync(join(entree, 'etablissements.csv'), '﻿' + [ETABLISSEMENTS.join(';'), ...[HOPITAL, ANNEXE, PHARMACIE, EHPAD, FERME].map((e) => ligne(ETABLISSEMENTS, e))].join('\n') + '\n');
  writeFileSync(join(entree, 'activites.csv'), '﻿' + [ACTIVITES.join(';'), ...LIGNES_ACTIVITES.map((a) => ligne(ACTIVITES, a))].join('\n') + '\n');
  writeFileSync(join(entree, 'structures-resume.json'), JSON.stringify({ generatedAt: '2026-11-01T03:04:54Z' }));
  const france = await construire({ finess: entree, has: valeurs(entree), sortie });

  assert.deepEqual([france.etablissements, france.fiches, france.sansPosition, france.instantane, france.qualite], [4, 1, 1, '2026-11-01', true]);
  assert.deepEqual(france.departements.map((d) => [d.code, d.nom, d.n, d.territoire]), [['44', 'Loire-Atlantique', 3, 0], ['974', 'La Réunion', 1, 1]]);
  const loire = france.departements[0];
  assert.deepEqual(loire.familles.map((n, i) => (n ? FAMILLES[i].cle + n : '')).filter(Boolean), ['hopital2', 'pharmacie1']);
  assert.ok(loire.boite[0] <= 47.21 && loire.boite[2] >= 47.2117 && loire.boite[1] <= -1.56 && loire.boite[3] >= -1.5536, 'l\'emprise contient les établissements placés');

  const departement = JSON.parse(readFileSync(join(sortie, 'departements', '44.json'), 'utf8'));
  const c = Object.fromEntries(departement.colonnes.map((n, i) => [n, i]));
  const hopital = departement.lignes.find((l) => l[c.finess] === '440000271');
  assert.deepEqual([hopital[c.nom], hopital[c.soins], hopital[c.detail], hopital[c.latitude]], ['CHU DE NANTES SITE HOTEL DIEU', 'chir urg', 1, 47.2117]);
  assert.deepEqual(departement.lignes.find((l) => l[c.finess] === '440012345')[c.detail], 0, 'une pharmacie sans autorisation n\'a pas de fiche détaillée');
  assert.equal(departement.lignes.some((l) => l[c.finess] === '440099999'), false, 'un établissement fermé n\'est pas dans l\'atlas');

  assert.deepEqual(readdirSync(join(sortie, 'fiches', '44')), ['440000271.json']);
  assert.equal(existsSync(join(sortie, 'fiches', '974')), false);
  const fiche = JSON.parse(readFileSync(join(sortie, 'fiches', '44', '440000271.json'), 'utf8'));
  assert.deepEqual([fiche.siret, fiche.ouverture, fiche.ejFiness, fiche.maj], ['26440013600012', '1967-01-01', '440000289', '2026-10-02']);
  assert.deepEqual(fiche.autorisations.map((g) => g.activite), ['Chirurgie', "Médecine d'urgence", 'Lactarium']);
  assert.deepEqual(fiche.rattaches, [{ finess: '440044428', nom: 'AMP BIO CHU NANTES', commune: 'NANTES CEDEX 1', departement: '44' }]);
  assert.equal(fiche.qualite.certification.decision, 'Certifié');

  const recherche = JSON.parse(readFileSync(join(sortie, 'recherche.json'), 'utf8'));
  assert.deepEqual(recherche.map((l) => l[0]), ['440000271'], 'la recherche nationale porte sur les établissements de soins placés sur la carte');
});

test('les outils de la page : noms, dates, périodes, écarts, recherche, départements visibles', () => {
  assert.equal(O.titre('CHU DE NANTES SITE HOTEL DIEU'), 'CHU de Nantes Site Hotel Dieu');
  assert.equal(O.titre("EHPAD L'AIR DU TEMPS"), "EHPAD l'Air du Temps");
  assert.equal(O.telephone('0387553131'), '03 87 55 31 31');
  assert.equal(O.finess('570026682'), '57 002 668 2');
  assert.equal(O.date('2012-05-24'), '24 mai 2012');
  assert.equal(O.date('2026-11-01'), '1er novembre 2026');
  assert.equal(O.nombre(37607).replace(/\s/g, ' '), '37 607');
  assert.equal(O.note(74.56), '74,6');
  assert.deepEqual(O.periode('2024-11-28', '2031-11-30', '2026-11-25'), { texte: '2024 à 2031', depassee: false });
  assert.deepEqual(O.periode('2007-02-20', '2023-03-19', '2026-11-25'), { texte: '2007 à 2023', depassee: true });
  assert.deepEqual(O.periode('2013-03-29', '', '2026-11-25'), { texte: 'depuis 2013', depassee: false });
  assert.equal(O.forme('Hospitalisation à temps complet'), 'hospitalisation complète');
  assert.deepEqual(O.ecart(81.4, 79.64), { sens: 'plus', texte: '1,8 point au-dessus de la moyenne nationale' });
  assert.deepEqual(O.ecart(78, 83.7), { sens: 'moins', texte: '5,7 points en dessous de la moyenne nationale' });
  assert.deepEqual(O.ecart(74.56, 73.82), { sens: 'egal', texte: 'Dans la moyenne nationale' });
  assert.equal(O.ecart(74, null), null);
  assert.ok(Math.abs(O.km(49.0843, 6.2424, 49.1193, 6.1757) - 6.2) < 0.3);

  const fiche = (nom, commune, extra, rang) => ({ nom, cle: O.simple(nom + ' ' + commune + ' ' + extra), cleNom: O.simple(nom + ' ' + commune), rang });
  const fiches = [fiche('HOPITAL DE JOUR YUTZ', 'YUTZ', 'CHR METZ-THIONVILLE', 0), fiche('HOPITAL BEL AIR', 'THIONVILLE', '', 0), fiche('PHARMACIE DE THIONVILLE', 'THIONVILLE', '', 5), fiche('CLINIQUE SAINTE-ÉLISABETH', 'THIONVILLE', '', 1)];
  assert.deepEqual(O.chercher(fiches, 'thionville hop', 8).map((f) => f.nom), ['HOPITAL BEL AIR', 'HOPITAL DE JOUR YUTZ'], 'le nom et la commune pèsent plus que l\'entité juridique');
  assert.deepEqual(O.chercher(fiches, 'elisabeth', 8).map((f) => f.nom), ['CLINIQUE SAINTE-ÉLISABETH'], 'sans accents');
  assert.deepEqual(O.chercher(fiches, 'thionville', 2).length, 2);
  assert.deepEqual(O.chercher(fiches, '  ', 8), []);

  const departements = [{ code: '57', boite: [48.6, 5.9, 49.5, 7.5] }, { code: '974', boite: [-21.4, 55.2, -20.8, 55.8] }, { code: '986', boite: null }];
  assert.deepEqual(O.departementsVisibles(departements, [49, 6, 49.2, 6.4]).map((d) => d.code), ['57']);
  assert.deepEqual(O.departementsVisibles(departements, [-22, 55, -20, 56]).map((d) => d.code), ['974']);
  assert.deepEqual(O.departementsVisibles(departements, [0, 0, 1, 1]), []);
});
