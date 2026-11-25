// L'atlas des soins : carte de France des établissements, fiche détaillée, recherche.
// Les données sont des fichiers statiques : france.json d'abord, puis un fichier par département regardé.
(function () {
  'use strict';
  const O = window.AtlasOutils;
  const { echapper, titre } = O;
  const $ = (id) => document.getElementById(id);
  // Une teinte franche par famille, choisies pour se distinguer entre elles sur le fond sombre : or, ivoire, violet, bleu, turquoise, vert, orange, rose, puis deux gris pour le reste.
  const COULEURS = ['#eda809', '#faf2e6', '#a98bff', '#4da3ff', '#3fd0d4', '#35c46a', '#ff9455', '#f06fb0', '#8f9bb3', '#5c6475'];
  const RAYONS = [8.5, 6.5, 5, 4.5, 4, 3.5, 4, 4, 3.5, 3.5];
  const ZOOM_POINTS = 9; // en dessous, une bulle par département
  const AUJOURDHUI = new Date().toISOString().slice(0, 10);

  let france = null; let recherche = null;
  const departements = new Map(); // code -> { etat, etablissements, couche }
  const actives = new Set(); // familles affichées
  let choisi = null;

  const lire = async (chemin) => { const r = await fetch(chemin); if (!r.ok) throw new Error(chemin + ' : ' + r.status); return r.json(); };

  const carte = L.map('carte', { zoomControl: false, preferCanvas: true, minZoom: 3 }).setView([46.6, 2.4], 6);
  L.control.zoom({ position: 'bottomright' }).addTo(carte);
  // Le Plan IGN porte ses noms de lieux dans l'image. De loin, on affiche les images du niveau de zoom précédent,
  // agrandies : seules les villes importantes y sont nommées. De près, les images normales, avec tous les noms.
  const PLAN = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
  const SOURCES = 'Fond de carte : Plan IGN, <a href="https://geoservices.ign.fr/">IGN</a> · Données : FINESS (ANS), HAS';
  L.tileLayer(PLAN, { minZoom: 3, maxZoom: 12, tileSize: 512, zoomOffset: -1, className: 'fond', attribution: SOURCES }).addTo(carte);
  L.tileLayer(PLAN, { minZoom: 13, maxZoom: 18, className: 'fond', attribution: SOURCES }).addTo(carte);
  const coucheBulles = L.layerGroup().addTo(carte);
  const couchePoints = L.layerGroup().addTo(carte);

  // ---- Départements : bulles de loin, points de près ----

  function bulles() {
    coucheBulles.clearLayers();
    for (const d of france.departements) {
      if (!d.centre) continue;
      const n = d.familles.reduce((s, x, i) => s + (actives.has(i) ? x : 0), 0);
      if (!n) continue;
      const taille = Math.round(20 + 7 * Math.log10(n + 1));
      const marque = L.marker(d.centre, { icon: L.divIcon({ className: '', iconSize: [taille, taille], html: '<div class="bulle" style="width:' + taille + 'px;height:' + taille + 'px">' + (n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + 'k' : n) + '</div>' }), keyboard: false });
      marque.bindTooltip(echapper(d.nom) + ' : ' + O.nombre(n) + ' établissements', { direction: 'top' });
      marque.on('click', () => voirDepartement(d));
      marque.addTo(coucheBulles);
    }
  }

  function voirDepartement(d) {
    // Le zoom se calcule avant de bouger : pendant l'animation, la carte annonce encore l'ancien zoom et l'ancien centre.
    const emprise = L.latLngBounds([d.boite[0], d.boite[1]], [d.boite[2], d.boite[3]]);
    const zoom = Math.max(ZOOM_POINTS, Math.min(13, carte.getBoundsZoom(emprise, false, [20, 20])));
    carte.setView(emprise.getCenter(), zoom);
  }

  async function charger(code) {
    let d = departements.get(code);
    if (d) return d.pret;
    d = { etablissements: [], couche: L.layerGroup() };
    departements.set(code, d);
    d.pret = lire('donnees/departements/' + code + '.json').then((brut) => {
      const c = Object.fromEntries(brut.colonnes.map((nom, i) => [nom, i]));
      d.etablissements = brut.lignes.map((l) => ({ finess: l[c.finess], nom: l[c.nom], famille: l[c.famille], categorie: l[c.categorieLibelle], secteur: l[c.secteur], adresse: l[c.adresse], codePostal: l[c.codePostal], commune: l[c.commune],
        latitude: l[c.latitude], longitude: l[c.longitude], telephone: l[c.telephone], ej: l[c.ej], ejStatut: l[c.ejStatut], ght: l[c.ght], ghtRole: l[c.ghtRole], soins: l[c.soins] ? l[c.soins].split(' ') : [], detail: l[c.detail] === 1, departement: code }));
      // Les familles les plus courantes d'abord : les hôpitaux restent dessinés au-dessus.
      for (const e of d.etablissements.slice().reverse()) {
        if (e.latitude === null) continue;
        e.point = L.circleMarker([e.latitude, e.longitude], { radius: RAYONS[e.famille], color: '#10131a', weight: 1.3, fillColor: COULEURS[e.famille], fillOpacity: 1 });
        e.point.bindTooltip(echapper(titre(e.nom)), { direction: 'top', offset: [0, -RAYONS[e.famille]] });
        e.point.on('click', () => ouvrir(e));
      }
      return d;
    }).catch((erreur) => { departements.delete(code); throw erreur; });
    return d.pret;
  }

  function dessiner(d) {
    d.couche.clearLayers();
    for (const e of d.etablissements) if (e.point && actives.has(e.famille)) e.point.addTo(d.couche);
  }

  async function rafraichir() {
    if (!france) return;
    const loin = carte.getZoom() < ZOOM_POINTS;
    if (loin) { if (!carte.hasLayer(coucheBulles)) carte.addLayer(coucheBulles); couchePoints.clearLayers(); etat(); return; }
    carte.removeLayer(coucheBulles);
    const b = carte.getBounds().pad(0.15);
    const visibles = O.departementsVisibles(france.departements, [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]);
    const codes = new Set(visibles.map((d) => d.code));
    for (const [code, d] of departements) if (!codes.has(code) && couchePoints.hasLayer(d.couche)) couchePoints.removeLayer(d.couche);
    await Promise.all(visibles.map(async (v) => {
      try { const d = await charger(v.code); if (carte.getZoom() >= ZOOM_POINTS && !couchePoints.hasLayer(d.couche)) { dessiner(d); couchePoints.addLayer(d.couche); } } catch (e) { /* un département illisible ne bloque pas les autres */ }
    }));
    etat(visibles);
  }

  function etat(visibles) {
    const resume = $('resume');
    if (!visibles) { resume.textContent = O.nombre(france.etablissements) + ' établissements en activité. Zoomez ou cliquez sur un département pour les voir.'; return; }
    const n = visibles.reduce((s, d) => s + d.familles.reduce((t, x, i) => t + (actives.has(i) ? x : 0), 0), 0);
    resume.textContent = visibles.length === 1 ? visibles[0].nom + ' : ' + O.nombre(n) + ' établissements affichés.' : visibles.length + ' départements à l\'écran, ' + O.nombre(n) + ' établissements affichés.';
  }

  // ---- Fiche ----

  function bloc(nom, valeur, o) {
    o = o || {};
    const e = O.ecart(valeur, o.france);
    return '<div class="note' + (o.petite ? ' petite' : '') + '"><div class="haut"><span class="quoi">' + echapper(nom) + (o.precision ? '<small>' + o.precision + '</small>' : '') + '</span><span class="chiffre">' + O.note(valeur) + '<small>/ 100</small></span></div>'
      + '<div class="barre"><i style="width:' + Math.max(0, Math.min(100, valeur)) + '%"></i>' + (o.france != null ? '<u style="left:' + Math.max(0, Math.min(100, o.france)) + '%" title="Moyenne nationale"></u>' : '') + '</div>'
      + (e ? '<div class="bas"><span class="ecart ' + e.sens + '">' + e.texte + '</span><span>France ' + O.note(o.france) + (o.region != null ? ' · région ' + O.note(o.region) : '') + '</span></div>' : '') + '</div>';
  }

  function autorisations(groupes) {
    return groupes.map((g) => '<details class="groupe"><summary>' + echapper(g.activite) + ' <small>' + g.lignes.length + (g.lignes.length > 1 ? ' autorisations' : ' autorisation') + '</small></summary><table><thead><tr><th>Ce qui est autorisé</th><th class="periode">Période</th></tr></thead><tbody>'
      + g.lignes.map((l) => { const p = O.periode(l.debut, l.fin, AUJOURDHUI); return '<tr><td>' + echapper(l.objet || 'Toute l\'activité') + (l.appareils ? ' (' + l.appareils + ' appareils)' : '')
        + (l.formes.length ? '<br><span class="prise">en ' + l.formes.map(O.forme).map(echapper).join(' et en ') + '</span>' : '') + (l.attente ? '<br><span class="prise">autorisée mais pas encore mise en œuvre</span>' : '')
        + '</td><td class="periode">' + p.texte + (p.depassee ? '<br><span class="depasse">échéance passée dans le répertoire</span>' : '') + '</td></tr>'; }).join('') + '</tbody></table></details>').join('');
  }

  function qualite(q) {
    let h = '';
    if (q.activite) {
      const a = q.activite; const m = a.maternite;
      h += '<section><h2>Activité' + (a.annee ? ' en ' + a.annee : '') + '</h2><p class="chapeau">Lits, places et séjours déclarés par l\'établissement dans la statistique annuelle des établissements de santé.</p>'
        + '<table><thead><tr><th></th><th class="nb">Lits</th><th class="nb">Places de jour</th><th class="nb">Séjours complets</th><th class="nb">Séjours de moins d\'un jour</th></tr></thead><tbody>'
        + a.lignes.map((l) => '<tr><td>' + (l[0] === 'Ensemble' ? '<b>Ensemble</b>' : l[0]) + '</td>' + l.slice(1).map((x) => '<td class="nb">' + O.nombre(x) + '</td>').join('') + '</tr>').join('') + '</tbody></table>'
        + (m ? '<p class="sous-titre">Maternité</p><dl>' + (m.type ? '<dt>Niveau</dt><dd>Type ' + echapper(m.type) + '</dd>' : '') + '<dt>Accouchements</dt><dd class="chiffres">' + O.nombre(m.accouchements) + (m.cesariennes ? ', dont ' + O.nombre(m.cesariennes) + ' par césarienne (' + Math.round(100 * m.cesariennes / m.accouchements) + ' %)' : '') + '</dd>' + (m.ivg ? '<dt>IVG</dt><dd class="chiffres">' + O.nombre(m.ivg) + '</dd>' : '') + '</dl>' : '') + '</section>';
    }
    if (q.certification) {
      const c = q.certification;
      h += '<section><h2>Certification</h2><p class="chapeau">Tous les quatre ans, la Haute Autorité de santé évalue chaque établissement sur place et rend une décision.</p><div class="verdict"><span class="sceau">' + echapper(c.decision) + '</span>' + (c.date ? '<small>Décision du ' + O.date(c.date) + '</small>' : '') + '</div>'
        + c.chapitres.map((x) => bloc(x[0], x[1], { petite: true })).join('') + '</section>';
    }
    if (q.satisfaction) {
      h += '<section><h2>Satisfaction des patients</h2><p class="chapeau">Notes données par les patients eux-mêmes après leur séjour, dans l\'enquête nationale e-Satis.</p>'
        + q.satisfaction.map((s) => bloc(s.nom, s.note, { france: s.france, region: s.region, precision: (s.reponses ? O.nombre(s.reponses) + ' réponses' : '') + (s.recommandent != null ? ' · ' + O.note(s.recommandent) + ' % recommandent certainement l\'établissement' : '') + (s.annee ? ' · ' + s.annee : '') })
          + (s.detail.length ? '<details class="groupe"><summary>Le détail <small>' + s.detail.length + ' notes</small></summary>' + s.detail.map((d) => bloc(d[0], d[1], { petite: true })).join('') + '</details>' : '')).join('')
        + '<p class="legende-jauge">Le trait blanc sur la barre marque la moyenne nationale des établissements de même catégorie.</p></section>';
    }
    if (q.indicateurs) {
      h += '<section><h2>Indicateurs de qualité des soins</h2><p class="chapeau">Mesurés par la Haute Autorité de santé dans les dossiers des patients. Plus le résultat est élevé, mieux la pratique est appliquée.</p>'
        + q.indicateurs.map((i) => bloc(i.nom, i.resultat, { france: i.france, region: i.region, precision: echapper(i.champ) + (i.annee ? ' · mesure de ' + i.annee : '') })).join('') + '</section>';
    }
    return h;
  }

  async function ouvrir(e, sansHistorique) {
    if (choisi && choisi.point) choisi.point.setStyle({ color: '#10131a', weight: 1.3, radius: RAYONS[choisi.famille] });
    choisi = e; if (e.point) { e.point.setStyle({ color: '#faf2e6', weight: 3, radius: RAYONS[e.famille] + 3 }); e.point.bringToFront(); }
    let detail = null;
    if (e.detail) { try { detail = await lire('donnees/fiches/' + e.departement + '/' + e.finess + '.json'); } catch (erreur) { detail = null; } }
    if (choisi !== e) return;
    const soins = e.soins.map((s) => france.soins[s] || s);
    const famille = france.familles[e.famille].nom;
    const phrase = (e.secteur ? 'Établissement ' + e.secteur : 'Établissement') + (e.ej && titre(e.ej) !== titre(e.nom) ? ' de l\'entité ' + titre(e.ej) : '')
      + (e.ght ? ', ' + (e.ghtRole === 'S' ? 'établissement support' : 'membre') + ' du groupement hospitalier de territoire ' + e.ght : '') + '.'
      + (soins.length ? ' Il exerce ' + soins.length + (soins.length > 1 ? ' grandes activités' : ' grande activité') + ' de soins.' : '');

    let gauche = '<section><h2>Identité et coordonnées</h2><dl><dt>Adresse</dt><dd>' + echapper(titre(e.adresse)) + (e.adresse ? ', ' : '') + echapper(e.codePostal) + ' ' + echapper(titre(e.commune)) + '</dd>'
      + (e.telephone ? '<dt>Téléphone</dt><dd class="chiffres">' + O.telephone(e.telephone) + '</dd>' : '') + '<dt>Numéro FINESS</dt><dd class="chiffres">' + O.finess(e.finess) + '</dd>'
      + (detail && detail.siret ? '<dt>SIRET</dt><dd class="chiffres">' + echapper(detail.siret) + '</dd>' : '')
      + (e.ej ? '<dt>Entité juridique</dt><dd>' + echapper(titre(e.ej)) + (detail && detail.ejFiness ? ' <span class="chiffres">(FINESS ' + O.finess(detail.ejFiness) + ')</span>' : '') + (e.ejStatut ? '<br>' + echapper(e.ejStatut) : '') + '</dd>' : '')
      + (detail && detail.ouverture ? '<dt>Ouverture</dt><dd>' + O.date(detail.ouverture) + '</dd>' : '')
      + (e.ght ? '<dt>Groupement</dt><dd>GHT ' + echapper(e.ght) + (e.ghtRole === 'S' ? ', dont il est l\'établissement support' : '') + '</dd>' : '')
      + (e.latitude === null ? '<dt>Position</dt><dd>absente du répertoire</dd>' : detail && detail.positionCalculee ? '<dt>Position</dt><dd>calculée d\'après les coordonnées du répertoire</dd>' : '') + '</dl></section>';
    if (soins.length) gauche += '<section><h2>Activités de soins</h2><p class="chapeau">Les grandes activités réellement exercées sur ce site, d\'après ses autorisations en vigueur.</p><p>' + echapper(soins.join(', ').replace(/^./, (c) => c.toUpperCase())) + '.</p></section>';
    if (detail && detail.autorisations) {
      const desSoins = detail.autorisations.filter((g) => g.genre === 'soins'); const autres = detail.autorisations.filter((g) => g.genre !== 'soins');
      const replis = detail.autorisations.length > 3 ? '<p class="replis"><button type="button" data-tout="1">Tout déplier</button> · <button type="button" data-tout="0">Tout replier</button></p>' : '';
      if (desSoins.length) gauche += '<section><h2>Autorisations d\'activités de soins</h2><p class="chapeau">Un établissement ne peut exercer une activité de soins que si l\'agence régionale de santé l\'y autorise, pour une durée limitée. Dépliez une activité pour voir ce que chaque autorisation couvre, le mode de prise en charge et sa période.</p>' + replis + autorisations(desSoins) + '</section>';
      if (autres.length) gauche += '<section><h2>' + (desSoins.length ? 'Autres activités autorisées ou déclarées' : 'Activités autorisées ou déclarées') + '</h2>' + (desSoins.length ? '' : replis) + autorisations(autres) + '</section>';
    }
    if (detail && detail.rattaches) gauche += '<section><h2>Structures rattachées</h2><p class="chapeau">Les structures en activité que le répertoire rattache à ce site.</p><ul class="simple">' + detail.rattaches.map((r) => '<li><button type="button" data-voir="' + r.departement + '/' + r.finess + '">' + echapper(titre(r.nom)) + '</button> <small>· ' + echapper(titre(r.commune)) + '</small></li>').join('') + '</ul></section>';

    const d = departements.get(e.departement);
    if (d && e.latitude !== null) {
      const voisins = d.etablissements.filter((x) => x !== e && x.latitude !== null && x.soins.length).map((x) => ({ x, km: O.km(e.latitude, e.longitude, x.latitude, x.longitude) })).sort((a, b) => a.km - b.km).slice(0, 5);
      if (voisins.length) gauche += '<section><h2>Établissements de soins les plus proches</h2><p class="chapeau">Dans le même département.</p><ul class="simple">' + voisins.map(({ x, km }) => '<li><button type="button" data-voir="' + x.departement + '/' + x.finess + '">' + echapper(titre(x.nom)) + '</button> <small>· ' + km.toFixed(1).replace('.', ',') + ' km · ' + echapper(x.soins.map((s) => france.soins[s] || s).join(', ')) + '</small></li>').join('') + '</ul></section>';
    }
    const droite = detail && detail.qualite ? qualite(detail.qualite) : '';

    const fiche = $('fiche');
    fiche.className = 'fiche';
    fiche.innerHTML = '<button class="fermer" type="button">Fermer</button><div class="entete"><p class="genre">' + echapper(e.categorie || famille) + '</p><h1 id="nom">' + echapper(titre(e.nom)) + '</h1><p class="resume">' + echapper(phrase) + '</p></div>'
      + '<div class="corps' + (droite ? '' : ' seule') + '"><div class="col">' + gauche + '</div>' + (droite ? '<div class="col">' + droite + '</div>' : '') + '</div>'
      + '<div class="pied">Sources : répertoire FINESS, Agence du numérique en santé, instantané du ' + O.date(france.instantane) + (detail && detail.maj ? ' (fiche mise à jour par la source le ' + O.date(detail.maj) + ')' : '') + '.'
      + (droite ? ' Activité, certification, satisfaction et indicateurs : base sur la qualité et la sécurité des soins, Haute Autorité de santé.' : '') + ' Les intitulés sont ceux des sources. <a href="#a-propos">En savoir plus</a></div>';
    $('voile').classList.add('ouvert'); $('voile').scrollTop = 0;
    fiche.querySelector('.fermer').focus();
    if (!sansHistorique) history.replaceState(null, '', '#' + e.departement + '/' + e.finess);
    document.title = titre(e.nom) + ' · L\'atlas des soins';
  }

  function fermer() {
    $('voile').classList.remove('ouvert');
    if (choisi && choisi.point) choisi.point.setStyle({ color: '#10131a', weight: 1.3, radius: RAYONS[choisi.famille] });
    choisi = null; history.replaceState(null, '', location.pathname + location.search);
    document.title = 'L\'atlas des soins';
  }

  /** Ouvre l'établissement « département/finess » : charge son département, centre la carte, affiche la fiche. */
  async function voir(reference, centrer) {
    const [code, numero] = reference.split('/');
    if (!france.departements.some((d) => d.code === code)) return;
    const d = await charger(code);
    const e = d.etablissements.find((x) => x.finess === numero);
    if (!e) return;
    if (!actives.has(e.famille)) { actives.add(e.famille); const coche = document.querySelector('.legende input[data-famille="' + e.famille + '"]'); if (coche) coche.checked = true; bulles(); }
    if (centrer && e.latitude !== null) carte.setView([e.latitude, e.longitude], Math.max(carte.getZoom(), 14), { animate: false });
    await rafraichir();
    ouvrir(e);
  }

  function propos() {
    const fiche = $('fiche');
    fiche.className = 'fiche propos';
    fiche.innerHTML = '<button class="fermer" type="button">Fermer</button><div class="entete"><p class="genre">À propos</p><h1 id="nom">L\'atlas des soins</h1><p class="resume">La carte des établissements de santé, sociaux et médico-sociaux de France, avec une fiche pour chacun. Un outil libre du collectif Irréductix.</p></div><div class="corps">'
      + '<section><h2>D\'où viennent les données</h2><ul><li><b>Les établissements, leurs autorisations et leur position</b> : répertoire FINESS, publié par l\'Agence du numérique en santé sous Licence Ouverte 2.0, converti par <a href="https://github.com/Irreductix/referentiels-sante">referentiels-sante</a>. Instantané du ' + O.date(france.instantane) + '.</li>'
      + '<li><b>L\'activité, la certification, la satisfaction des patients et les indicateurs de qualité</b> : base sur la qualité et la sécurité des soins de la Haute Autorité de santé, sous Licence Ouverte 2.0.</li><li><b>Le fond de carte</b> : Plan IGN, Institut national de l\'information géographique et forestière.</li></ul></section>'
      + '<section><h2>Ce qu\'il faut savoir</h2><ul><li>L\'atlas recopie les sources sans les corriger. Une erreur vue ici vient presque toujours du répertoire : c\'est à l\'établissement ou à son agence régionale de santé de la faire rectifier.</li>'
      + '<li>Une note ne résume pas un établissement. Les indicateurs se lisent avec leur moyenne nationale, et un petit nombre de réponses rend une note de satisfaction fragile.</li>'
      + '<li>Quand le répertoire ne donne pas la latitude et la longitude d\'une adresse mais seulement ses coordonnées planes, la position est calculée ; la fiche le dit.</li>'
      + '<li>' + O.nombre(france.sansPosition) + ' établissements n\'ont aucune position dans le répertoire : ils se trouvent par la recherche de leur département, pas sur la carte.</li>'
      + '<li>La Polynésie française et la Nouvelle-Calédonie ne figurent pas dans le répertoire FINESS.</li></ul></section>'
      + '<section><h2>Vie privée</h2><p>La page ne dépose aucun cookie et n\'envoie rien : les données sont des fichiers que votre navigateur télécharge, et la recherche se fait sur votre appareil. Seules les images du fond de carte sont demandées à l\'IGN.</p></section>'
      + '<section><h2>Participer</h2><p>Le code est libre (licence MIT) : <a href="https://github.com/Irreductix/atlas-des-soins">github.com/Irreductix/atlas-des-soins</a>. Une donnée mal présentée, une rubrique qui manque : écrivez à <a href="mailto:contact@irreductix.fr">contact@irreductix.fr</a> ou ouvrez un ticket.</p></section>'
      + '</div><div class="pied">Données mises à jour le ' + O.date(france.genere) + '.</div>';
    $('voile').classList.add('ouvert'); $('voile').scrollTop = 0;
    fiche.querySelector('.fermer').focus();
  }

  $('fiche').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('fermer')) fermer();
    else if (b.dataset.tout) for (const d of b.closest('section').querySelectorAll('details.groupe')) d.open = b.dataset.tout === '1';
    else if (b.dataset.voir) voir(b.dataset.voir, true);
  });
  $('voile').addEventListener('click', (e) => { if (e.target.id === 'voile') fermer(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('voile').classList.contains('ouvert')) fermer(); });
  window.addEventListener('hashchange', route);
  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h === 'a-propos') propos();
    else if (/^[0-9AB]{2,3}\/\d{9}$/.test(h)) voir(h, true);
  }

  // ---- Recherche ----

  const champ = $('recherche'); const liste = $('resultats'); let rang = -1; let attente = null;
  const preparer = (nom, commune, extra) => ({ cle: O.simple(nom + ' ' + commune + ' ' + (extra || '')), cleNom: O.simple(nom + ' ' + commune) });
  async function indexNational() {
    if (!recherche) recherche = lire('donnees/recherche.json').then((lignes) => lignes.map((l) => Object.assign({ reference: l[3] + '/' + l[0], nom: l[1], commune: l[2], famille: l[4], rang: l[4], sousTitre: france.familles[l[4]].nom }, preparer(l[1], l[2], l[0]))));
    return recherche;
  }
  async function chercher() {
    const saisie = champ.value;
    if (!O.simple(saisie).trim()) { liste.hidden = true; return; }
    const national = await indexNational();
    if (champ.value !== saisie) return;
    // Les établissements de soins de toute la France, puis tous ceux des départements déjà affichés.
    const connus = new Set(national.map((f) => f.reference)); const locaux = [];
    for (const d of departements.values()) for (const e of d.etablissements) { const reference = e.departement + '/' + e.finess; if (connus.has(reference)) continue; if (!e.recherche) e.recherche = Object.assign({ reference, nom: e.nom, commune: e.commune, famille: e.famille, rang: 20 + e.famille, sousTitre: e.categorie || france.familles[e.famille].nom }, preparer(e.nom, e.commune, e.finess + ' ' + e.ej + ' ' + e.codePostal)); locaux.push(e.recherche); }
    const trouves = O.chercher(national.concat(locaux), saisie, 8);
    rang = trouves.length ? 0 : -1;
    liste.innerHTML = trouves.length ? trouves.map((f, i) => '<li role="option" data-voir="' + f.reference + '" aria-selected="' + (i === 0) + '"><span class="signe" style="background:' + COULEURS[f.famille] + '"></span><span class="texte"><b>' + echapper(titre(f.nom)) + '</b><small>' + echapper(titre(f.commune)) + ' · ' + echapper(f.sousTitre) + '</small></span></li>').join('')
      : '<li class="rien">Aucun établissement de soins ne porte ce nom. Les pharmacies, laboratoires et structures sociales se cherchent une fois leur département affiché.</li>';
    liste.hidden = false;
  }
  function aller(reference) { liste.hidden = true; champ.value = ''; champ.blur(); voir(reference, true); }
  champ.addEventListener('input', () => { clearTimeout(attente); attente = setTimeout(chercher, 120); });
  champ.addEventListener('focus', chercher);
  champ.addEventListener('keydown', (e) => {
    const options = [...liste.querySelectorAll('li[data-voir]')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!options.length) return; rang = (rang + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length; options.forEach((o, i) => o.setAttribute('aria-selected', String(i === rang))); options[rang].scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter' && options[rang]) aller(options[rang].dataset.voir);
    else if (e.key === 'Escape') { liste.hidden = true; e.stopPropagation(); }
  });
  liste.addEventListener('mousedown', (e) => { const li = e.target.closest('li[data-voir]'); if (li) { e.preventDefault(); aller(li.dataset.voir); } });
  document.addEventListener('click', (e) => { if (!e.target.closest('.recherche')) liste.hidden = true; });

  // ---- Démarrage ----

  lire('donnees/france.json').then((f) => {
    france = f;
    // Au départ, les lieux de soins ; le social et le médico-social s'ajoutent d'une coche.
    france.familles.forEach((x, i) => { if (!['age', 'handicap', 'social'].includes(x.cle)) actives.add(i); });
    const totaux = france.departements.reduce((s, d) => d.familles.map((n, i) => n + (s[i] || 0)), []);
    $('familles').innerHTML = france.familles.map((x, i) => '<label><input type="checkbox"' + (actives.has(i) ? ' checked' : '') + ' data-famille="' + i + '"><span class="signe" style="background:' + COULEURS[i] + '"></span>' + echapper(x.nom) + '<span class="n">' + O.nombre(totaux[i]) + '</span></label>').join('');
    for (const c of document.querySelectorAll('.legende input')) c.addEventListener('change', () => {
      const i = Number(c.dataset.famille); if (c.checked) actives.add(i); else actives.delete(i);
      bulles(); for (const d of departements.values()) if (couchePoints.hasLayer(d.couche)) dessiner(d); rafraichir();
    });
    $('territoires').innerHTML = '<button type="button" data-territoire="">Hexagone</button>' + france.departements.filter((d) => d.territoire && d.boite && d.n > 5).map((d) => '<button type="button" data-territoire="' + d.code + '">' + echapper(d.nom) + '</button>').join('');
    $('territoires').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; if (!b.dataset.territoire) carte.setView([46.6, 2.4], 6); else voirDepartement(france.departements.find((d) => d.code === b.dataset.territoire)); });
    $('replier').addEventListener('click', () => $('legende').classList.toggle('repliee'));
    bulles(); carte.on('moveend', rafraichir); rafraichir(); route();
  }).catch(() => { $('resume').textContent = 'Les données de l\'atlas n\'ont pas pu être chargées.'; });
})();
