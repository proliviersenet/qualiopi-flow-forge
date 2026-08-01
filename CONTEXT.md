# CONTEXT.md — QalioFlex

> Fichier de contexte à coller à la racine du repo, à donner à n'importe quelle session Claude (web, Claude Code, etc.) pour reprendre le projet sans perte d'information.
> Dernière mise à jour : 1 juillet 2026 (session 3 — module Formations complet + pages Profil & Paramètres)

---

## 0. Démarrage rapide (à dire à Claude Code en premier message)

```
Lis le fichier CONTEXT.md à la racine du projet pour comprendre 
le contexte complet de QalioFlex avant toute action. 
Préviens-moi de ce que tu as compris avant de commencer à coder.
```

Puis préciser la tâche du jour — voir §8 "Roadmap" pour la liste des priorités à jour. Toujours indiquer explicitement laquelle traiter (ex: "On reprend FormationCreation.tsx, priorité 4 de la roadmap").

⚠️ Après chaque session de travail (correctif, nouvelle fonctionnalité), **mettre à jour ce fichier** : déplacer l'item traité de la roadmap (§8) vers le journal des bugs résolus / fonctionnalités livrées (§7), et ajuster le tableau d'avancement des pages (§5) si besoin. Ça garantit que la prochaine session — ici ou sur Claude Code — reparte sur des infos exactes.

---

## 1. Qui, quoi, pourquoi

**Olivier Senet** — gérant d'**ExSenCo** (SARL)
- SIRET : 892 787 458 00017
- NDA (numéro de déclaration d'activité formateur) : 24370470637
- Adresse : 80 rue du Nouveau Bois, 37550 Saint-Avertin
- Contact : olivier@exsenco.fr / 06 07 46 74 09

**QalioFlex** = SaaS Qualiopi destiné aux formateurs indépendants et organismes de formation, pour gérer la conformité Qualiopi (sessions, documents, signatures, questionnaires, BPF, pré-audits).

---

## 2. Stack technique

| Élément | Détail |
|---|---|
| Frontend | React + TypeScript + Vite + Tailwind + shadcn-ui |
| Repo GitHub | https://github.com/proliviersenet/qualiopi-flow-forge |
| Prod | https://qualioflex.fr (hébergé sur Vercel, déploiement auto sur push `main`) |
| Backend | Supabase EU — projet `cvgosywcwqmsegdgjpqp` |
| URL Supabase | https://cvgosywcwqmsegdgjpqp.supabase.co |
| Clé publique Supabase | `sb_publishable_pGVcNwQvTDsIMu4G-NC43A_K2llTneL` |

### Charte graphique ExSenCo
- Bleu indigo `#25245e` → couleur primaire
- Orange feu `#f2901e` → CTA / boutons d'action
- Gris neutre `#818284` → texte secondaire

---

## 3. Base de données (Supabase, RLS activé sur toutes les tables)

24 tables : `profiles`, `organismes`, `formations`, `clients`, `beneficiaires`, `sessions`, `participations`, `documents`, `signatures`, `relances`, `enquetes_preformation`, `evaluations_formations`, `evaluations_formateurs`, `competences_formateurs`, `checklist_items`, `exports`, `api_logs`, `questionnaires_types`, `suivi_formation_formateur`, `derogations_qualiopi`, `corrections_questionnaires`, `generation_questionnaires_log`, `bpf`, `preaudits`.

> Roadmap V2 : colonne `role` déjà ajoutée dans `profiles` (`formateur_certifie`, `formateur_porte`, `of_complet`, `admin`) en anticipation du pivot multi-formateurs.

---

## 4. Edge Functions déployées (Supabase)

| Fonction | Rôle |
|---|---|
| `docusign-integration` | Signature électronique DocuSign (JWT, sandbox) |
| `docusign-webhook` | Réception des notifications de statut de signature |
| `relances-auto` | Envoi d'emails Brevo selon rétroplanning Qualiopi |
| `generer-questionnaire` | Génération de questionnaires via Claude API |
| `valider-questionnaire` | Sauvegarde des corrections formateur |
| `sirene-proxy` | Proxy vers l'API Annuaire Entreprises (autocomplétion SIRET) |
| `lancer-preaudit` | Pré-audit automatique des 32 indicateurs Qualiopi |

### Secrets configurés côté Supabase
`ANTHROPIC_API_KEY`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` (olivier@exsenco.fr), `BREVO_SENDER_NAME`, `DOCUSIGN_INTEGRATION_KEY`, `DOCUSIGN_API_ACCOUNT_ID`, `DOCUSIGN_USER_ID`, `DOCUSIGN_BASE_URL` (https://demo.docusign.net), `DOCUSIGN_AUTH_URL` (https://account-d.docusign.com), `DOCUSIGN_PRIVATE_KEY`, `SB_SERVICE_ROLE_KEY`, `INSEE_API_TOKEN`.

> ⚠️ Ne jamais redemander ces valeurs en clair dans une conversation — elles sont déjà en place côté Supabase. Si besoin de les vérifier, aller directement dans Supabase → Project Settings → Edge Functions → Secrets.

---

## 5. Pages frontend — état d'avancement

| Page | Statut |
|---|---|
| Register | ✅ Branchée Supabase, autocomplétion SIRET via Annuaire Entreprises fonctionnelle |
| Login | ✅ Branchée Supabase Auth + toggle voir/masquer mot de passe |
| ResetPassword | ✅ Fonctionnel — reset par email via Brevo SMTP (voir §7, problème résolu) |
| Dashboard | ✅ Données réelles (organisme, stats, alertes) — **bouton logout fixé le 30/06** |
| Formations | ✅ CRUD complet — liste, création, détail, modification, toggle brouillon/publié |
| FormationDetail | ✅ Livré le 01/07 — vue complète, toggle statut, lien vers edit |
| FormationEdit | ✅ Livré le 01/07 — formulaire pré-rempli, update Supabase, boutons Brouillon/Publier |
| FormationCreation | ✅ CRUD branché Supabase — formulaire mappé schéma réel, insert réel, boutons Brouillon/Publier |
| Profile | ✅ Livré le 01/07 — édition nom/téléphone, infos organisme (NDA, adresse, ville), SIRET lecture seule |
| Settings | ✅ Livré le 01/07 — changement mot de passe, toggles notifications, zone danger |
| Clients | ✅ CRUD + autocomplétion SIRET — **bouton logout fixé le 30/06** |
| Documents | ✅ Liste avec statut signatures DocuSign — **bouton logout fixé le 30/06** |
| FormationCreation | ✅ CRUD branché Supabase — **formulaire mappé sur le schéma réel, insert réel, boutons Brouillon / Publier, onLogout câblé — livré le 30/06** |
| Module BPF | ✅ Livré le 03/07 — liste, création, édition, validation, répartition thématiques (jsonb). **Export PDF + guide MAF livré le 04/07** |
| Module pré-audit | ❌ Edge function `lancer-preaudit` déployée mais pas de page réelle |

Autres fichiers présents dans `src/pages/` : `Demo.tsx`, `Features.tsx`, `Index.tsx`, `Mockup.tsx`, `NotFound.tsx`.

---

## 6. Comptes de test

| Email | Mot de passe | Rôle |
|---|---|---|
| olivier@exsenco.fr | À changer après reset (était QalioFlex2026!) | Organisme ExSenCo créé en base, NDA 24370470637 |
| do.senet@gmail.com | — | Profil sans organisme (test) |
| olivoa@hotmail.fr | Choisi à l'inscription | Compte test "EMKA Electronique" — inscription via SIRET, créé le 29/06 |

---

## 7. Bugs résolus (journal)

### 🔧 Reset password / Brevo SMTP (résolu le 29/06/2026)
**Symptôme** : email de reset password jamais reçu, erreur "Failed to send password recovery" dans Supabase Auth.

**Diagnostic** (via Supabase → Logs → Auth) : erreur `525 "5.7.1 Unauthorized IP address"` côté Brevo.

**Deux causes cumulées :**
1. Mauvais **username SMTP** dans Supabase → Authentication → SMTP Settings. Il fallait utiliser le login SMTP Brevo (`971f12001@smtp-brevo.com`), pas l'adresse email `olivier@exsenco.fr`.
2. **IP Supabase non autorisée** côté Brevo (Brevo bloque par défaut les IP non whitelistées pour les appels SMTP/API). Fix : Brevo → Settings → Expéditeurs, domaine, IP → IPs dédiées → onglet "Adresses IP non autorisées" → autoriser les IP bloquées (range AWS `52.x.x.x`, utilisées par Supabase).

**Statut** : ✅ Flux complet testé en prod sur qualioflex.fr — reset password → email reçu → connexion OK.

### ✅ FormationCreation.tsx branchée Supabase (livré le 30/06/2026)
**Situation initiale** : page 100% statique (maquette Lovable). Le `handleSubmit` faisait un `setTimeout(1500ms)` pour simuler un appel API, rien n'était sauvegardé en base. `mockUser` codé en dur, pas de session, pas d'`onLogout`.

**Ce qui a été fait (commit `e022df5`)** :
- Schéma de la table `formations` vérifié directement en base (9 colonnes : `titre`*, `objectifs`, `programme`, `modalites`, `prerequis`, `duree`, `tarif`, `document_mode`*, `statut`*)
- Formulaire réécrit et mappé exactement sur ces colonnes
- Récupération de `organisme_id` via `profiles` (même pattern que `Formations.tsx`)
- `supabase.from('formations').insert(...)` réel avec gestion d'erreur via toast
- Deux boutons en step 3 : **Enregistrer en brouillon** (`statut: "draft"`) et **Publier** (`statut: "publie"`)
- `Header` passé avec `onLogout` (cohérence avec le fix du 30/06)
- Garde de session : redirection `/login` si non connecté, écran de chargement intermédiaire

**Statut** : ✅ Poussé sur GitHub (commit `e022df5`), déploiement Vercel automatique déclenché. À tester en prod sur qualioflex.fr.


**Symptôme** : clic sur "Se déconnecter" dans le menu utilisateur (Header) ne faisait rien.

**Diagnostic** : le composant `Header.tsx` attend une prop `onLogout: () => void`, appelée par le bouton (`onClick={onLogout}`). Cette prop n'était **jamais transmise** par les pages parentes (`Dashboard.tsx`, `Clients.tsx`, `Documents.tsx`, `Formations.tsx`) — `<Header user={...} />` sans `onLogout`. Le clic appelait donc `undefined()`, silencieusement ignoré par React.

**Fix appliqué** (commit `21832f6`, poussé sur `main`) : ajout dans chaque page concernée d'une fonction `handleLogout` qui appelle `supabase.auth.signOut()` puis `navigate('/login')`, et passage de cette fonction en prop au `<Header>`.

**Statut** : ✅ Poussé sur GitHub, déploiement Vercel automatique déclenché. À reconfirmer en prod après déploiement.

---

## 8. Roadmap — ce qu'il reste à faire (par priorité)

1. ~~Vérifier l'email reset password via Brevo~~ ✅ Fait
2. **Tester le flux complet** inscription → session → documents → questionnaires (en cours — inscription et login validés, reste session/documents/questionnaires)
3. Affiner la charte graphique — bouton "Inscription" du header en orange feu (`#f2901e`)
4. ~~Brancher **FormationCreation.tsx** sur Supabase~~ ✅ Fait
5. ~~Tester en prod la création d'une formation~~ ✅ OK
6. ~~Module **BPF** — page complète~~ ✅ Livré le 03/07

**Prochaines priorités :**

7. ~~**BPF — export PDF MAF**~~ ✅ Fait le 04/07 — bouton "Télécharger PDF" sur chaque BPF (fonction `imprimerBPF` dans `BPF.tsx`), document imprimable aux couleurs ExSenCo avec Cadres A-D (identification, période, financier, pédagogique) + guide pas-à-pas de déclaration sur le portail MAF (URL, échéance 30 avril, amende jusqu'à 4 500€ en cas de retard).
8. **Module notation formateurs** : notes des formateurs par clients ET stagiaires, avec tableau de bord stats consultable (moyenne, évolution, verbatims). Tables à créer en base : `notations_formateurs` (formation_id, session_id, auteur_type: client|stagiaire, note, commentaire, created_at). Interface : formulaire public (lien envoyé par email) + page stats privée dans l'app.
9. **Pages footer** : CGU, Politique de confidentialité, RGPD, Contact, Centre d'aide, Référentiel Qualiopi
10. **Pré-audit** — page réelle (edge function `lancer-preaudit` déjà prête en base)
11. **Stripe** — abonnement récurrent + paiement ponctuel (frais récupération données)
12. **Factures QalioFlex** — PDF aux couleurs ExSenCo dans espace "Mon compte", déclenchées via webhook Stripe
13. **Historique mots de passe** — edge function `check-password-history` + table `password_history` (dette technique sécurité)

### SEO Exsenco (hors QalioFlex)
Dashboard Notion SEO : https://app.notion.com/p/Dashboard-SEO-Exsenco-37984663690180d4996bc68e523316c7
⚠️ Lien nécessite authentification Notion — à partager en export ou en copiant le contenu si analyse nécessaire.
6. Réactiver la **confirmation email** avant lancement public (actuellement désactivée volontairement pour les tests)
7. Rédiger les **CGV/CGU**
8. Intégrer **Stripe** pour la facturation — deux usages :
   - **Abonnement récurrent** (plan mensuel/annuel formateur)
   - **Paiement ponctuel** 10 € frais récupération données lors suppression de compte (placeholder déjà en place dans Settings.tsx → étape "payment")
   - Stripe retenu vs Lemon Squeezy/Paddle : clients 100% France B2B, TVA autoliquidée, frais Stripe ~1,75€/abo vs ~2,50€ MoR — pas d'avantage fiscal pour un MoR dans ce contexte
   - **Après intégration Stripe** : générer et stocker les **factures d'utilisation QalioFlex** dans l'espace "Mon compte" de chaque formateur (PDF aux couleurs de la charte ExSenCo, mentions légales complètes, téléchargeable pour la comptabilité) — déclenchées via webhook Stripe à chaque paiement réussi

### Roadmap V2 (pivot)
- Formateurs portés sous certification Qualiopi ExSenCo
- Ouverture aux organismes de formation multi-formateurs
- Infrastructure déjà anticipée : colonne `role` dans `profiles`

---

## 9. Notes pour reprendre une session (Claude Code ou autre)

- Le repo est cloné via HTTPS ; pour pousser du code, un **Personal Access Token GitHub** (scope `repo`) est nécessaire si pas d'auth Git déjà configurée sur la machine. Ne jamais laisser de token en clair dans une conversation au-delà de son usage immédiat — le révoquer juste après usage.
- Les secrets Supabase (clés API, DocuSign, etc.) ne sont **jamais** à redemander ou ressaisir en conversation — ils sont déjà configurés côté Supabase Edge Functions.
- Toujours vérifier l'état réel d'une page avant de la considérer "branchée" — plusieurs pages listées comme "✅ branchées" peuvent quand même contenir des bugs ponctuels (cf. §7, bouton logout).

---

## Session 4 — 18 juillet 2026

### ✅ Module invitation client complet
- Edge Function `envoyer-invitation` : email HTML Resend, token 7 jours, anti-spam
- Edge Function `creer-compte-client` : updateUserById si compte existant, création sinon
- Page publique `/invitation/:token` : vérif token → SIREN → compte → 🎉
- Tables créées : `invitations_clients`, `stagiaires`
- DNS OVH configuré, domaine Resend vérifié

### 🔜 Prochain chantier : Espace client distinct

**Problème actuel** : le client voit le même dashboard que le formateur.

**Ce qu'il faut construire :**

#### Détection du rôle au login
- Si `user_metadata.role === "client"` → rediriger vers `/espace-client`
- Si `role === "formateur"` → dashboard actuel

#### Espace client (`/espace-client`) — pages à créer :
1. **Mes sessions** : liste des sessions de formation affectées par le formateur (passées + à venir), avec statut, dates, lieu
2. **Détail session** (`/espace-client/session/:id`) : documents de la formation (convention, programme, devis, livret, questionnaires, émargements, attestation fin de formation) + bouton upload fichier stagiaires
3. **Upload stagiaires** : fichier Excel/CSV avec colonnes `nom`, `prénom`, `téléphone portable`, `email` → parsing → insert dans table `stagiaires` → déclenchement flow Qualiopi automatisé

#### Flow formateur (à coder) :
- Dans la page Clients : **glisser-déposer une formation** du catalogue vers un client → crée une session avec `formation_id` + `client_id`
- Saisir les **dates de formation** (date_debut, date_fin, lieu)
- Le flow documentaire Qualiopi ne se déclenche qu'après upload du fichier stagiaires par le client

#### Logo cliquable (todo rapide)
- Logo QalioFlex dans Header → lien vers `/dashboard` si connecté, `/` sinon


### ✅ Flow client complet validé le 19/07/2026

**Formateur :**
- Invite un client par email → Edge Function `envoyer-invitation` (Resend)
- Voit le client dans sa liste → clique "Voir la fiche"
- Affecte une formation du catalogue avec dates, lieu, lien visio → crée une session

**Client :**
- Reçoit l'email → clique le lien → saisit son SIREN → espace créé via `creer-compte-client`
- Se connecte → redirigé automatiquement vers `/espace-client`
- Voit ses sessions de formation → importe le fichier stagiaires (Excel/CSV)

**RLS ajoutées :**
- `clients_read_own_record` : `contact_email = auth.email()`
- `clients_read_own_sessions` : `client_id in (select id from clients where contact_email = auth.email())`

**Pages créées :**
- `EspaceClient.tsx` : espace client complet (sessions, documents, upload stagiaires)
- `ClientDetail.tsx` : fiche client formateur + dialog affectation formation
- `InvitationClient.tsx` : onboarding client en 3 étapes

**Edge Functions déployées :**
- `envoyer-invitation` : génération token + email Resend
- `creer-compte-client` : création/réactivation compte + insert client en base

### 🔜 Prochaines priorités

1. **Onboarding formateur** : wizard post-inscription (compléter organisme → créer formation → inviter client)
2. **Flow documentaire Qualiopi** : déclenché après upload stagiaires (convention, programme, émargements, attestation)
3. **Module notation** : notes clients + stagiaires avec stats
4. **Pages footer** restantes : tous les liens fonctionnent
5. **Stripe** : abonnement + factures

---

## Flow documentaire Qualiopi complet — défini le 21/07/2026

### Principes
- Pas de convention pour les stagiaires (supprimé du flow)
- Tous les formulaires sont intégrés dans QalioFlex (pas de lien externe)
- Toutes les réponses sont stockées et génèrent une synthèse groupe
- Tous les documents restent accessibles dans la session (formateur + client)
- Gestion manuelle des stagiaires : ajout / modification / suppression possible

### Flow stagiaires (dans l'ordre chronologique)

| # | Étape | Type | Déclencheur | Bloquant | Alerte |
|---|---|---|---|---|---|
| 1 | Livret d'accueil + règlement intérieur | Envoi PDF | Dès création session | Non | — |
| 2 | Questionnaire positionnement AVANT | Form QalioFlex | Dès création session | **OUI** | Formateur + client si manque 2j avant début |
| 3 | Feuilles de présence | Signature Docusign | Pendant la formation | Non | — |
| 4 | Questionnaire positionnement APRÈS | Form QalioFlex | Fin de formation | Non | — |
| 5 | Évaluation à chaud | Form QalioFlex | Fin de formation | Non | — |
| 6 | Évaluation du formateur | Form QalioFlex | Fin de formation | Non | — |
| 7 | Attestation de fin de formation | Envoi PDF | Fin de formation | Non | — |
| 8 | Évaluation à froid | Form QalioFlex | J+90 (3 mois) | Non | Formateur + client si manque 1 semaine après envoi |

### Flow client

| # | Étape | Type | Déclencheur |
|---|---|---|---|
| 1 | Moyens techniques pour la formation | Document formateur | Avant formation |
| 2 | Attestations de fin de formation | PDF | Fin de formation |

### Actions formateur

- Saisie de l'évaluation de la formation par le formateur (dans la session, après formation)

### Architecture technique à construire

**Tables à créer :**
- `questionnaires_templates` : templates par type (positionnement_avant, positionnement_apres, evaluation_chaud, evaluation_formateur, evaluation_froid)
- `reponses_questionnaires` : réponses par stagiaire par session (session_id, stagiaire_id, type, reponses jsonb, completed_at)
- `documents_session` : documents liés à une session (convention, livret, attestation, moyens_techniques, url_storage, type)

**Edge Functions à créer :**
- `declencher-flow-session` : lancée après import stagiaires → envoie livret + questionnaire positionnement avant
- `alerte-avant-formation` : cron quotidien → vérifie sessions commençant dans 2j avec questionnaires manquants
- `alerte-evaluation-froid` : cron → vérifie J+90 avec évaluations froides manquantes

**Intégrations :**
- Docusign : feuilles de présence
- Storage Supabase : stockage des PDFs générés
- Synthèse groupe : agrégation des réponses après 100% de complétion (ou à la demande)

### Priorité de développement

1. Gestion manuelle stagiaires (ajout/modif/suppression) ← **en cours**
2. Fix SMS (format numéro mobile)
3. Livret d'accueil : upload formateur + transmission stagiaires
4. Questionnaire positionnement avant (form intégré + alerte bloquante)
5. Évaluations à chaud, formateur, après
6. Attestation de fin de formation
7. Docusign (feuilles de présence)
8. Évaluation à froid (J+90 + cron alerte)
9. Synthèses groupe
10. Évaluation formateur de sa propre formation

---

## Session 5 — 21 juillet 2026

### ✅ Livré cette session

**Module relances email + SMS (Brevo) :**
- Edge Function `envoyer-relance` : email Brevo (olivier@exsenco.fr) + SMS (numéro court Brevo)
- Motifs complets : livret, questionnaire avant/après, émargement, évaluation chaud/formateur/froid, attestation
- Bouton relance dropdown dans StagiairesList (formateur + client)
- Toast affiche les vrais canaux envoyés (email/SMS) depuis results API
- Fix SMS : URL `/transactionalSMS/send`, format numéro `33XXXXXXXXX`
- Sender ID "QalioFlex" demandé auprès du support Brevo (en attente activation)
- Convention supprimée du flow stagiaires
- Gestion manuelle stagiaires : ajout/modification/suppression inline dans StagiairesList
- Logo QalioFlex cliquable dans tous les emails (lien vers qualioflex.fr)

**Module documents formation (en cours de test) :**
- Profile.tsx : upload logo organisme (PNG/JPG/WebP/SVG) → Storage `documents-qualiopi/logos/{organisme_id}/`
- FormationDetail.tsx : section Documents avec upload support + programme
- Déclenchement auto génération trame quand support ET programme uploadés
- Edge Function `generer-trame` : Claude API génère trame pédagogique complète avec logo + infos légales organisme
- Trame confidentielle (formateur uniquement), visualisable + imprimable PDF
- Table `documents_formation` créée en base
- Storage policies créées

### 🔑 Clés et secrets actifs
- Brevo API : `BREVO_API_KEY` dans Supabase Secrets ✅
- Anthropic API : `ANTHROPIC_API_KEY` dans Supabase Secrets ✅
- GitHub token : à regénérer au début de chaque session (token usage unique)

### 🔜 À tester au démarrage session 6
1. Upload support + programme dans une formation → vérifier génération trame auto
2. Vérifier logo upload dans Profile
3. Vérifier que la trame s'ouvre et s'imprime en PDF avec logo + infos légales

### 🔜 Prochaines priorités (dans l'ordre)
1. **Documents générés** : Convention, Livret d'accueil, Feuille de présence, Attestation de réalisation (HTML→PDF, logo + infos légales auto)
2. **Questionnaires intégrés** : Positionnement avant/après, Évaluation à chaud, Évaluation formateur par stagiaire, Évaluation formation par formateur (forms HTML QalioFlex, stockés en base, synthèse groupe)
3. **Flow auto post-import stagiaires** : envoi livret + questionnaire positionnement avant, alerte bloquante 2j avant formation
4. **Évaluation à froid** J+90 (cron Supabase)
5. **DocuSign** : feuilles de présence
6. **Onboarding formateur** : wizard post-inscription
7. **Stripe** : abonnement + factures
8. **Pages footer** restantes

### 📁 Exemples de documents fournis (dans /mnt/user-data/uploads/)
- Attestation_de_réalisation_de_formation_20210510.docx
- Evaluation_à_chaud_20210316.docx
- Evaluation_de_la_formation_par_le_formateur_20210316.docx
- Evaluation_du_formateur_par_le_stagiaire_20210414.doc
- Feuille_de_présence_.doc
- Questionnaire_de_positionnement_avant_formation.xlsx
- Questionnaire_de_positionnement_après_formation_-_prospection_commerciale.xlsx
- Trame_pédagogique_-_Construire_son_PAC-_20210615.docx
- grille_de_qualification_-_besoin_en_formation_202105.xlsx

---

## Session 6 — 21-27 juillet 2026 (Chantier 5)

### ✅ Livré cette session

**Chantier 5 — Volet A (déjà fait avant compaction) :** génération devis/émargement/évaluations en HTML + PDF.

**Volet B — Relances automatiques :**
- Edge Function `relance-documents-auto` déployée, cron quotidien `relance-documents-quotidien` (6h15) via pg_cron/pg_net
- J+2 relance, J+5 alerte (émargement, évaluation chaud, évaluation froid)
- Testée en prod (statut 200, `{success:true}`)

**Volet C — Bandeau d'alerte session :**
- `StagiairesList.tsx` : bandeau visuel (orange/rouge) listant les documents en attente de signature > 2 jours, au-dessus du radar de synthèse

**Volet D — Convention de formation + signature DocuSign :**
- Edge Function `generer-convention` : génère la convention en HTML (Cerfa-like), pré-remplie avec les stagiaires, seulement si le client a transmis sa liste de stagiaires
- `docusign-integration` : ajout d'un champ `ancre` par signataire pour supporter 2 zones de signature distinctes sur un même document (`/signature_formateur/`, `/signature_client/`)
- `ClientDetail.tsx` (formateur) et `EspaceClient.tsx` (client) : UI génération + envoi signature + statut, conversion HTML→PDF côté client via html2pdf.js (CDN)
- Fix RLS proactif sur la table `signatures` (policy encore basée sur l'ancienne table `documents` — corrigée pour `documents_formation`)

**DocuSign production — Go-Live soumis, en attente de validation DocuSign (30 juillet 2026) :**
• Forfait **Standard** confirmé actif sur le compte production (672336548) → accès API débloqué, le blocage précédent est levé
• Formulaire de mise en production (Go-Live) rempli et signé par Olivier depuis `apps-d.docusign.com/admin/apps-and-keys` (app "QualiFlow-ExSenCo", clé `dbc125da-0b6b-46d8-aa3e-ff348aafe9da`) : CGU acceptées, compte de production "672336548" sélectionné, questionnaire business rempli (usage externe — stagiaires/clients signataires ; description QalioFlex ; lien `https://qualioflex.fr`), Account ID production `a5d1bca6-d904-41b5-ba57-13e33b0ca01f` renseigné, formulaire signé via DocuSign PowerForm
• Statut DocuSign au 30/07 : **"En attente d'approbation"** — délai annoncé par DocuSign jusqu'à 48h de révision
• **Prochaine étape une fois l'approbation reçue** : générer une nouvelle paire de clés RSA spécifique à la prod, faire le JWT consent grant pour cette nouvelle clé, puis mettre à jour les secrets Supabase (`DOCUSIGN_API_ACCOUNT_ID` → `a5d1bca6-d904-41b5-ba57-13e33b0ca01f`, `DOCUSIGN_USER_ID` → `e484eee4-d3ee-4557-8c9d-a9f504b9e9d4`, `DOCUSIGN_BASE_URL` → `https://eu.docusign.net`, `DOCUSIGN_AUTH_URL` → `https://account.docusign.com` à confirmer, `DOCUSIGN_PRIVATE_KEY` → nouvelle clé RSA prod une fois générée), puis tester un vrai envoi de signature en prod
• Repères non-secrets côté compte développeur/sandbox (EXSENCO, id 48719560) : User ID `efa94943-6de2-49a6-9560-b7eda8eadffa`, API Account ID `f2bc363a-6ca2-4323-ada6-87ffe387ce34`, Base URI `https://demo.docusign.net`

**Bug résolu — icônes documents espace client :** signalé "Edge Function returned a non-2xx status code" au clic sur une icône document côté client ; résolu par l'utilisateur lui-même en cours de session (cause exacte non confirmée côté Claude — à surveiller si ça revient).

**Vérifié (déjà fait, doc mise à jour) :** le point roadmap #7 "BPF export PDF MAF" était déjà livré le 04/07 (voir §5 et §8) — première analyse. **Corrigé ensuite** : ce module simplifié ne couvrait qu'environ 15% du vrai Cerfa 10443*17 (comparaison faite avec le BPF 2025 réel d'Olivier, 111 champs extraits du PDF officiel télétransmis DREETS) et incluait un champ non-officiel ("taux_satisfaction"). Voir refonte complète ci-dessous.

**Volet E — Refonte complète du module BPF (Cerfa 10443*17, tous cadres A à H) :**
- Diagnostic : comparaison champ par champ entre l'ancien module BPF et le vrai Cerfa (111 champs AcroForm extraits du BPF 2025 réel d'Olivier via `pypdf`) → gap majeur identifié (Cadre C détaillé, D, E, F détaillé, G, H manquants ou trop simplifiés)
- Migration base de données (`bpf` table) : suppression des colonnes non-officielles (`nb_stagiaires`, `nb_heures_formation`, `ca_formation`, `taux_satisfaction`, `repartition_thematiques`), ajout de toutes les colonnes officielles par cadre (`cadre_c`, `cadre_f1`, `cadre_f3`, `cadre_f4` en jsonb + colonnes scalaires D/E/G/H), + `organismes.forme_juridique`
- Réécriture complète de `BPF.tsx` : formulaire en accordéon couvrant les 8 cadres officiels (A Identification, B Période, C Origine des produits ligne par ligne 1/a-h/2/3-11, D Charges, E Personnes formatrices, F Bilan pédagogique détaillé F-1 à F-4 avec spécialités NSF, G Sous-traitance reçue, H Dirigeant), export PDF entièrement réécrit avec numérotation Cerfa exacte sur chaque ligne + guide MAF pas-à-pas mis à jour
- **Vérifié en conditions réelles** : ré-saisie des vraies données du BPF 2025 d'Olivier (SARL EXSENCO, 17 750€ de produits via contrats avec autres organismes, 3 600€ de charges, 1 personne/123h formatrices, 28 stagiaires confiés par un autre organisme/123h, dirigeant SENET Olivier - Gérant) → totaux calculés en direct dans l'UI et export PDF généré comparés au vrai document : **correspondance exacte** sur tous les montants, cadres et libellés Cerfa
- Déployé en production (commit GitHub direct sur `main`, build Vercel confirmé live sur qualioflex.fr)

### 🔜 Prochaines priorités
1. Finaliser le Go-Live DocuSign production une fois le forfait Standard actif, puis faire le test joint complet (génération convention → PDF → envoi DocuSign → signature → webhook)
2. Décider avec Olivier s'il garde ou supprime le BPF 2025 de test créé pendant la vérification (données réelles, mais créé à titre de validation)
3. Reprendre la roadmap §8 : module notation formateurs, pré-audit (page réelle), pages footer, Stripe, historique mots de passe

## Session 7 — 27 juillet 2026 (Chatbot SAV niveau 1 + On-boarding IA)

### ✅ Livré cette session

**Chatbot assistant IA (SAV niveau 1 + on-boarding) — déployé formateur + client :**
- Décisions validées avec Olivier : 100% IA générative (Claude), déploiement simultané formateur + client, base de connaissance rédigée par Claude à partir des vraies fonctionnalités de l'appli, escalade niveau 2 par email avec résumé de conversation
- Tables `chatbot_conversations` et `chatbot_messages` créées (RLS : chacun voit ses propres conversations, le formateur voit aussi celles de ses clients pour contrôle qualité)
- Edge Function `chatbot-assistant` déployée : identifie l'appelant (formateur ou client) via son rôle, construit un contexte dynamique (organisme, nb formations/clients, profil complet ou non pour un formateur ; fiche entreprise pour un client), appelle l'API Claude (`claude-sonnet-4-6`) avec une base de connaissance complète rédigée à partir des fonctionnalités réelles de QalioFlex
- Détection automatique d'escalade (`[ESCALADE: raison]` dans la réponse du modèle) → email HTML envoyé à olivier@exsenco.fr via Brevo avec résumé de la conversation, statut conversation mis à jour
- Widget `ChatbotWidget.tsx` : bulle flottante bas-droite, visible uniquement pour utilisateurs connectés, historique persistant (localStorage + DB), montée globalement dans `App.tsx` donc disponible sur tout le site sans toucher chaque page
- **Bug trouvé et corrigé en test réel** : `authClient.auth.getUser()` sans argument s'appuie sur la session interne du client Supabase (vide côté edge function) et non sur le header `Authorization` global → toutes les requêtes échouaient en 500 "Utilisateur non authentifié". Fix : passer explicitement le JWT à `getUser(jwt)`.
- **Fix qualité réponses** : consigne ajoutée au system prompt pour bannir la syntaxe markdown (le widget affiche du texte brut, les astérisques `**gras**` s'affichaient tels quels)
- Testé en conditions réelles sur qualioflex.fr (session formateur Olivier) : question fonctionnelle (génération convention) → bonne réponse sans markdown ; question sensible (résiliation abonnement) → escalade déclenchée, statut DB `escaladee` confirmé, email Brevo envoyé sans erreur
- Code source de l'Edge Function poussé sur GitHub (`supabase/functions/chatbot-assistant/`) pour cohérence avec le reste du repo (rappel : déploiement Supabase se fait manuellement via le Dashboard, pas de CI/CD Git)

### 🔜 Prochaines priorités
1. Construire un écran de suivi des conversations escaladées côté formateur (actuellement consultable seulement en base/SQL, RLS déjà prête)
2. Enrichir la base de connaissance au fil de l'eau selon les vraies questions posées par les utilisateurs
3. Reprendre la roadmap §8 : DocuSign Go-Live prod, module notation formateurs, pré-audit (page réelle), pages footer, Stripe

## Session 8 — 31 juillet au 1er août 2026 (Audit complet des 25 étapes du flow)

### Contexte
Consigne d'Olivier : *"on corrige tout, les points bloquant, les points non bloquants, je veux que tout soit propre et fonctionnel. dans la liste établie sur les étapes, je veux que tout soit au vert."* Un audit préalable avait identifié 5 points bloquants et 9 points non bloquants sur les 25 étapes du flow (onboarding → création formation → invitation client → flow Qualiopi auto → fin de formation → BPF/archivage/veille). Cette session traite l'intégralité des 14 points.

### ✅ 5 correctifs bloquants
- **Déclenchement auto du flow Qualiopi après upload stagiaires** : nouvelle Edge Function `declencher-flow-session`, appelée automatiquement après l'import de la liste de stagiaires (au lieu d'un déclenchement manuel oublié)
- **Email au client quand une session lui est affectée** : nouvelle Edge Function `notifier-affectation-session`
- **Email au formateur quand son client crée son compte** : notification ajoutée au flux de création de compte client
- **Extension des relances J+2/J+5 au livret et au questionnaire avant** (jusque-là seuls émargement/évaluations étaient relancés)
- **Verrou serveur du support pédagogique** : le support n'est plus débloqué que côté serveur après signature vérifiée de l'émargement (nouvelle fonction publique `support-public` + route dédiée), plus de dépendance à un état client
- **Alerte bloquante J-2 avant formation** si livret/questionnaire avant formation toujours pas complété : nouvelle Edge Function `alerte-avant-formation` (cron quotidien)

### ✅ 9 points non bloquants
- **#56 BPF auto-rempli** : `BPF.tsx` pré-remplit désormais `nb_sessions`/`nb_formations` depuis les vraies données de sessions au lieu de champs vides à saisir à la main
- **#57 FAQ Aide.tsx** : correction de l'entrée FAQ qui affirmait à tort que la notation des formateurs n'existait pas (le module existe depuis la Session 6)
- **#58 Opt-in RGPD dès le premier email** : le tout premier email envoyé à un stagiaire (motif `livret`, juste après import) mentionne désormais explicitement l'usage des données et l'endroit où ses préférences de contact seront demandées, au lieu d'attendre le questionnaire de positionnement
- **#59 Guidage chatbot Qualios étendu** : ajout de bulles d'aide contextuelles (`HelpPopup`) sur les pages Création formation, Détail client et Espace client
- **#60 Archivage auto 18 mois post-audit de surveillance** : nouveau champ `organismes.date_dernier_audit_surveillance`, nouvelle Edge Function `archiver-formations-surveillance` (cron mensuel) qui archive les formations publiées non mises à jour depuis le dernier audit, une fois 18 mois écoulés ; bannière de statut ajoutée sur `Formations.tsx`
- **#62 Upload manuel convention/devis existants** : nouveau champ `documents_formation.fichier_url` ; un formateur dont la formation est en `document_mode = "import"` peut désormais importer son propre PDF/Word au lieu de forcer une génération automatique qui écraserait son document
- **#63 Nettoyage du code mort** : suppression des Edge Functions `relances-auto` (traitait une table `relances` que plus rien n'alimente depuis la bascule vers les envois en temps réel) et `sirene-proxy` (redondante avec les appels directs déjà en place vers l'API recherche-entreprises.api.gouv.fr dans `Register.tsx`/`Clients.tsx`) ; désactivation du cron horaire qui appelait `relances-auto`

### Déploiement — tout est en production
- **GitHub** : tous les correctifs poussés sur `main` (commits `37ca376` → `766f761`), y compris la suppression effective des deux fichiers morts du repo
- **Supabase Edge Functions** : `declencher-flow-session`, `notifier-affectation-session`, `alerte-avant-formation`, `support-public` déployées ; `archiver-formations-surveillance` déployée (JWT OFF, cron-only via `x-cron-secret`) ; `envoyer-relance` redéployé avec l'opt-in RGPD (JWT resté ON, vérifié avant et après redéploiement) ; `relances-auto` et `sirene-proxy` supprimées du dashboard Supabase
- **Vérifications locales avant chaque push** : `npx eslint` (propre), `npx tsc --noEmit` (mêmes erreurs pré-existantes que sur la base d'origine, liées au stub `types.ts` non typé — non bloquant, déjà accepté en session précédente), `npm run build` (propre)

### ⚠️ Migrations SQL à exécuter par Olivier (Supabase Studio → SQL Editor)
Aucun accès direct à la base depuis le sandbox — à faire manuellement, dans l'ordre :
1. `20260731090500_bucket_prive_support_pedagogique.sql`
2. `20260731093000_relance_documents_livret_questionnaire_avant.sql`
3. `20260731093100_cron_alerte_avant_formation.sql`
4. `20260731170000_archivage_18mois_audit_surveillance.sql`
5. `20260731170100_cron_archiver_formations_surveillance.sql`
6. `20260731170200_documents_formation_fichier_url.sql`
7. `20260731170300_desactivation_cron_relances_auto_mort.sql` (vérifier d'abord le nom exact du job avec `select jobid, jobname, schedule from cron.job order by jobid;`)

Les 3 premières datent de la partie "correctifs bloquants" de cette même session (avant une coupure de session) et n'ont pas été confirmées comme exécutées — à vérifier en premier, sinon les fonctions correspondantes (verrou support pédagogique, relance livret/questionnaire, alerte J-2) tourneront sans effet en base.

### 🔜 Prochaines priorités
1. Olivier : exécuter les 7 migrations SQL ci-dessus dans l'éditeur SQL Supabase Studio
2. Confirmer avec Olivier que les 25 étapes du flow sont bien "au vert" après exécution des migrations (test bout-en-bout recommandé sur un cycle stagiaire complet)
3. Finaliser le Go-Live DocuSign production (voir Session 6)
4. Reprendre la roadmap §8 : module notation formateurs, pré-audit (page réelle), pages footer, Stripe
