// Lecture de la « Base sur la qualité et la sécurité des soins » de la Haute Autorité de santé
// (fichier valeurs.csv, Licence Ouverte) : certification, satisfaction des patients, indicateurs
// de qualité et chiffres d'activité, pour chaque établissement.

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

import { decouper } from './finess.mjs';

const DECISIONS = { 1: 'Certifié avec mention', 2: 'Certifié', 3: 'Certifié sous conditions', 4: 'Non certifié' };

// Satisfaction des patients (e-Satis) : note, moyennes de comparaison, nombre de réponses, part qui recommande.
const SATISFACTION = [
  { nom: 'Hospitalisation de plus de 48 heures', note: 'score_all_rea_ajust', region: 'score_ajust_esatis_region_48h', france: 'score_ajust_esatis_type_48h', reponses: 'nb_rep_score_all_rea_ajust', recommandent: 'taux_reco_brut_48h',
    detail: [['Prise en charge par les infirmiers et aides-soignants', 'score_pecinf_rea_ajust'], ['Prise en charge par les médecins et chirurgiens', 'score_pecmed_rea_ajust'], ['Accueil', 'score_accueil_rea_ajust'], ['Chambre', 'score_chambre_rea_ajust'], ['Organisation de la sortie', 'score_sortie_rea_ajust'], ['Repas', 'score_repas_rea_ajust']] },
  { nom: 'Chirurgie ambulatoire', note: 'score_all_ajust_ca', region: 'score_ajust_esatis_region_ca', france: 'score_ajust_esatis_type_ca', reponses: 'nb_rep_score_all_ajust_ca', recommandent: 'taux_reco_brut_ca',
    detail: [['Avant l\'hospitalisation', 'score_avh_ajust'], ['Accueil le jour de l\'hospitalisation', 'score_acc_ajust'], ['Prise en charge', 'score_pec_ajust'], ['Chambre et collation', 'score_cer_ajust'], ['Sortie et retour à domicile', 'score_ovs_ajust']] },
  { nom: 'Soins de réadaptation', note: 'score_all_ssr_ajust', region: 'score_ajust_esatis_region_ssr', france: 'score_ajust_esatis_type_ssr', reponses: 'nb_rep_score_all_ssr_ajust', recommandent: 'taux_reco_brut_ssr',
    detail: [['Accueil', 'score_accueil_ssr_ajust'], ['Prise en charge', 'score_pec_ssr_ajust'], ['Lieu de vie', 'score_lieu_ssr_ajust'], ['Repas', 'score_repas_ssr_ajust'], ['Organisation de la sortie', 'score_sortie_ssr_ajust']] },
];

// Indicateurs de qualité des soins mesurés dans les dossiers : résultat et moyennes de comparaison.
const INDICATEURS = [
  { nom: 'Évaluation et prise en charge de la douleur', champ: 'médecine, chirurgie, obstétrique', resultat: 'mco_dpa_pcd_2018-pcd_resultat', region: 'mco_dpa_pcd_2018-pcd_moyenne_regionale', france: 'mco_dpa_pcd_2018-pcd_moyenne_nationale' },
  { nom: 'Qualité de la lettre de liaison à la sortie', champ: 'médecine, chirurgie, obstétrique', resultat: 'mco_dpa_qls_2021-qls_resultat', region: 'mco_dpa_qls_2021-qls_moyenne_regionale', france: 'mco_dpa_qls_2021-qls_moyenne_nationale' },
  { nom: 'Antibiothérapie de 7 jours ou moins pour une infection respiratoire basse', champ: 'médecine, chirurgie, obstétrique', resultat: 'mco_ias_atbir_2022-atbir_res', region: 'mco_ias_atbir_2022-atbir_moy_reg', france: 'mco_ias_atbir_2022-atbir_moy_nat' },
  { nom: 'Évaluation et prise en charge de la douleur', champ: 'soins de réadaptation', resultat: 'ssr_dpa_pcd_2021-pcd_resultat', region: 'ssr_dpa_pcd_2021-pcd_moyenne_regionale', france: 'ssr_dpa_pcd_2021-pcd_moyenne_nationale' },
  { nom: 'Qualité de la lettre de liaison à la sortie', champ: 'soins de réadaptation', resultat: 'ssr_dpa_qls_2018-qls_resultat', region: 'ssr_dpa_qls_2018-qls_moyenne_regionale', france: 'ssr_dpa_qls_2018-qls_moyenne_nationale' },
  { nom: 'Consommation de solutions hydro-alcooliques (hygiène des mains)', champ: 'tout l\'établissement', resultat: 'tch_ias_icshav4_2021-icsha_v4_resultat', region: 'tch_ias_icshav4_2021-icsha_v4_moyenne_regionale', france: 'tch_ias_icshav4_2021-icsha_v4_moyenne_nationale' },
];

// Statistique annuelle des établissements : lits, places, séjours.
const ACTIVITE = [['Médecine', 'med'], ['Chirurgie', 'chi'], ['Obstétrique', 'obs'], ['Ensemble', 'mco']];
const CHAMPS_ACTIVITE = ['mco_lit_', 'mco_pla_', 'mco_sejhc_', 'mco_sej0_'];

const CERTIFICATION = ['certification_ref_2021_decision', 'certification_ref_2021_date_decision', 'certification_ref_2021_score_chapitre_1', 'certification_ref_2021_score_chapitre_2', 'certification_ref_2021_score_chapitre_3'];
const MATERNITE = ['perinat_autor', 'perinat_sejacc', 'perinat_sejces', 'perinat_ivg', 'mco_jou_mco'];

/** Toutes les variables de la base dont l'atlas a besoin. */
export const VARIABLES = new Set([
  ...CERTIFICATION, ...MATERNITE,
  ...SATISFACTION.flatMap((s) => [s.note, s.region, s.france, s.reponses, s.recommandent, ...s.detail.map((d) => d[1])]),
  ...INDICATEURS.flatMap((i) => [i.resultat, i.region, i.france]),
  ...ACTIVITE.flatMap(([, suffixe]) => CHAMPS_ACTIVITE.map((c) => c + suffixe)),
]);

/**
 * Lit valeurs.csv et garde, pour chaque établissement et chaque variable utile, la valeur de l'année la plus récente.
 * @returns {Promise<Map<string, Map<string, { annee: string, valeur: string }>>>}
 */
export async function lireValeurs(chemin, variables = VARIABLES) {
  const parFiness = new Map(); let entete = true;
  for await (const ligne of createInterface({ input: createReadStream(chemin), crlfDelay: Infinity })) {
    if (entete) { entete = false; continue; }
    if (!ligne) continue;
    // annee, finess, finess_type, key, value_boolean, value_string, value_integer, value_float, missing_value, value_date
    const x = ligne.includes('"') ? decouper(ligne, ',') : ligne.split(',');
    if (!variables.has(x[3])) continue;
    const valeur = x[4] || x[5] || x[6] || x[7] || x[9];
    if (!valeur) continue;
    if (!parFiness.has(x[1])) parFiness.set(x[1], new Map());
    const connues = parFiness.get(x[1]); const connue = connues.get(x[3]);
    if (!connue || x[0] >= connue.annee) connues.set(x[3], { annee: x[0], valeur });
  }
  return parFiness;
}

/** Met en forme les valeurs d'un établissement pour sa fiche. Ne rend que les rubriques qui ont des données. */
export function qualiteDe(valeurs) {
  if (!valeurs) return null;
  const texte = (k) => valeurs.get(k)?.valeur ?? null;
  const nombre = (k) => { const v = texte(k); const n = v === null ? NaN : Number(v); return Number.isFinite(n) ? n : null; };
  const annee = (k) => valeurs.get(k)?.annee ?? null;
  const q = {};

  const decision = DECISIONS[texte('certification_ref_2021_decision')];
  if (decision) {
    q.certification = { decision, date: (texte('certification_ref_2021_date_decision') || '').slice(0, 10),
      chapitres: [['Le patient', nombre('certification_ref_2021_score_chapitre_1')], ['Les équipes de soins', nombre('certification_ref_2021_score_chapitre_2')], ["L'établissement", nombre('certification_ref_2021_score_chapitre_3')]].filter((c) => c[1] !== null) };
  }

  const satisfaction = SATISFACTION.filter((s) => nombre(s.note) !== null).map((s) => ({ nom: s.nom, annee: annee(s.note), note: nombre(s.note), region: nombre(s.region), france: nombre(s.france), reponses: nombre(s.reponses), recommandent: nombre(s.recommandent),
    detail: s.detail.map(([nom, k]) => [nom, nombre(k)]).filter((d) => d[1] !== null) }));
  if (satisfaction.length) q.satisfaction = satisfaction;

  const indicateurs = INDICATEURS.filter((i) => nombre(i.resultat) !== null).map((i) => ({ nom: i.nom, champ: i.champ, annee: annee(i.resultat), resultat: nombre(i.resultat), region: nombre(i.region), france: nombre(i.france) }));
  if (indicateurs.length) q.indicateurs = indicateurs;

  const lignes = ACTIVITE.map(([nom, suffixe]) => [nom, ...CHAMPS_ACTIVITE.map((c) => nombre(c + suffixe))]).filter((l) => l.slice(1).some((v) => v !== null && v > 0));
  if (lignes.length) {
    q.activite = { annee: annee('mco_lit_mco') ?? annee('mco_sejhc_mco'), lignes, journees: nombre('mco_jou_mco') };
    if (nombre('perinat_sejacc')) q.activite.maternite = { type: (texte('perinat_autor') || '').replace(/^TYPE/, ''), accouchements: nombre('perinat_sejacc'), cesariennes: nombre('perinat_sejces'), ivg: nombre('perinat_ivg') };
  }
  return Object.keys(q).length ? q : null;
}
