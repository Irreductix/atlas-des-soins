// Fonctions de mise en forme de l'atlas, sans accès à la page : testées à part.
(function (global) {
  'use strict';

  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const SIGLES = /\b(Chr|Chu|Ch|Chs|Chi|Chic|Ehpad|Ssr|Smr|Had|Cmp|Cattp|Lbm|Ght|Sa|Sas|Udm|Amp|Dpn|Ime|Esat|Mas|Fam|Ssiad|Usld|Irm|Hdj|Aphp|Hcl|Ccas|Cias|Csapa|Cegidd|Selas|Selarl|Sel|Sarl|Snc|Scm)\b/g;
  const PETITS = / (De|Du|Des|La|Le|Les|Et|En|Sur|Aux|Au|Pour|Par|Sous|À|A) /g;

  function echapper(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  /** Le répertoire écrit les noms en capitales : on les rend lisibles sans toucher aux sigles. */
  function titre(s) {
    return String(s || '').toLowerCase()
      .replace(/(^|[\s'\-(/])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase())
      .replace(SIGLES, (m) => m.toUpperCase())
      .replace(PETITS, (m) => m.toLowerCase())
      .replace(/ (D|L)'/g, (m) => m.toLowerCase());
  }

  function telephone(t) {
    return t && /^\d{10}$/.test(t) ? t.replace(/(\d\d)(?=\d)/g, '$1 ') : t || '';
  }

  function finess(f) {
    return f && f.length === 9 ? f.slice(0, 2) + ' ' + f.slice(2, 5) + ' ' + f.slice(5, 8) + ' ' + f.slice(8) : f || '';
  }

  function date(iso) {
    const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso || '');
    return m ? (m[3] === '01' ? '1er' : String(Number(m[3]))) + ' ' + MOIS[Number(m[2]) - 1] + ' ' + m[1] : '';
  }

  function nombre(n) {
    return n == null ? '' : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function note(n) {
    return n == null ? '' : n.toFixed(1).replace('.', ',');
  }

  /** Période d'une autorisation, et si son échéance est passée à la date donnée (AAAA-MM-JJ). */
  function periode(debut, fin, aujourdhui) {
    const de = (debut || '').slice(0, 4); const a = (fin || '').slice(0, 4);
    return { texte: a ? (de ? de + ' à ' + a : "jusqu'en " + a) : de ? 'depuis ' + de : '', depassee: Boolean(fin) && fin < aujourdhui };
  }

  function forme(f) {
    return f.replace('Hospitalisation complète (24 heures consécutives ou plus)', 'hospitalisation complète').replace('Hospitalisation à temps complet', 'hospitalisation complète')
      .replace('Hospitalisation à temps partiel de jour ou de nuit', 'hospitalisation de jour ou de nuit').replace('Hospitalisation ambulatoire', 'ambulatoire').replace('Chirurgie ambulatoire', 'ambulatoire').replace(/^Hospitalisation/, 'hospitalisation');
  }

  /** Écart d'une note à la moyenne nationale, en clair. */
  function ecart(valeur, france) {
    if (valeur == null || france == null) return null;
    const e = valeur - france;
    if (Math.abs(e) < 1) return { sens: 'egal', texte: 'Dans la moyenne nationale' };
    return { sens: e > 0 ? 'plus' : 'moins', texte: note(Math.abs(e)) + (Math.abs(e) >= 2 ? ' points ' : ' point ') + (e > 0 ? 'au-dessus' : 'en dessous') + ' de la moyenne nationale' };
  }

  /** Texte ramené à des minuscules sans accents, pour la recherche. */
  function simple(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  /** Distance en kilomètres entre deux points donnés en degrés. */
  function km(la1, lo1, la2, lo2) {
    const r = Math.PI / 180;
    const x = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(x));
  }

  /** Les départements dont l'emprise [sud, ouest, nord, est] touche la vue. */
  function departementsVisibles(departements, vue) {
    return departements.filter((d) => d.boite && d.boite[0] <= vue[2] && d.boite[2] >= vue[0] && d.boite[1] <= vue[3] && d.boite[3] >= vue[1]);
  }

  /**
   * Cherche dans une liste de fiches { nom, commune, cle, cleNom, rang } : tous les mots doivent être présents,
   * ceux dont le nom ou la commune les porte passent d'abord, puis l'ordre des familles.
   */
  function chercher(fiches, saisie, maximum) {
    const mots = simple(saisie).split(/\s+/).filter(Boolean);
    if (!mots.length) return [];
    const trouves = [];
    for (const f of fiches) {
      if (!mots.every((m) => f.cle.includes(m))) continue;
      trouves.push({ f, poids: mots.filter((m) => f.cleNom.includes(m)).length });
    }
    return trouves.sort((a, b) => b.poids - a.poids || a.f.rang - b.f.rang).slice(0, maximum || 8).map((x) => x.f);
  }

  global.AtlasOutils = { echapper, titre, telephone, finess, date, nombre, note, periode, forme, ecart, simple, km, departementsVisibles, chercher };
})(typeof window !== 'undefined' ? window : globalThis);
