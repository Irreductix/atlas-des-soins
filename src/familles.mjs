// Familles d'établissements affichées sur la carte, de la plus structurante à la plus courante.
// Un établissement appartient à la première famille dont le test réussit.

export const FAMILLES = [
  { cle: 'hopital', nom: 'Hôpitaux publics', test: (e) => ['101', '355', '106'].includes(e.categorie) },
  { cle: 'clinique', nom: 'Cliniques et soins privés', test: (e) => ['365', '128', '129', '122', '109', '362', '131', '127'].includes(e.categorie) || (e.soins.length > 0 && e.secteur !== 'public') },
  { cle: 'psy', nom: 'Psychiatrie', test: (e) => ['292', '156', '425', '430', '444', '412', '161', '366'].includes(e.categorie) },
  { cle: 'ville', nom: 'Centres et maisons de santé', test: (e) => ['124', '603', '604', '142', '143', '438', '439', '125', '130', '289'].includes(e.categorie) },
  { cle: 'labo', nom: 'Laboratoires', test: (e) => e.categorie === '611' },
  { cle: 'pharmacie', nom: 'Pharmacies', test: (e) => e.categorie === '620' },
  { cle: 'age', nom: 'Personnes âgées', test: (e) => ['500', '501', '502', '202', '207', '381', '362'].includes(e.categorie) },
  { cle: 'handicap', nom: 'Handicap', test: (e) => e.domaine === 'SOC' && /handicap|IME|ESAT|MAS\b|FAM\b|SESSAD|SAVS|SAMSAH|déficien|Polyhandicap|Foyer de vie|Foyer d'Accueil Médicalisé|Maison d'Accueil Spécialisée|Institut|Aide par le Travail|Education Spéciale/i.test(e.categorieLibelle) },
  { cle: 'social', nom: 'Social et médico-social', test: (e) => e.domaine === 'SOC' },
  { cle: 'autre', nom: 'Autres structures sanitaires', test: () => true },
];

/** Rang de la famille d'un établissement dans FAMILLES. */
export function rangFamille(etablissement) {
  return FAMILLES.findIndex((f) => f.test(etablissement));
}
