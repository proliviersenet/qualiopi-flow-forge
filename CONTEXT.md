# CONTEXT.md — QalioFlex

> Fichier de contexte à coller à la racine du repo, à donner à n'importe quelle session Claude (web, Claude Code, etc.) pour reprendre le projet sans perte d'information.
> Dernière mise à jour : 30 juin 2026

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
| Formations | ✅ CRUD branché Supabase — **bouton logout fixé le 30/06** |
| Clients | ✅ CRUD + autocomplétion SIRET — **bouton logout fixé le 30/06** |
| Documents | ✅ Liste avec statut signatures DocuSign — **bouton logout fixé le 30/06** |
| FormationCreation | ❌ Encore statique (maquette Lovable), pas branchée Supabase |
| Module BPF | ❌ Existe en base (table `bpf`) mais pas de page réelle |
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

### 🔧 Bouton "Se déconnecter" inactif (résolu le 30/06/2026)
**Symptôme** : clic sur "Se déconnecter" dans le menu utilisateur (Header) ne faisait rien.

**Diagnostic** : le composant `Header.tsx` attend une prop `onLogout: () => void`, appelée par le bouton (`onClick={onLogout}`). Cette prop n'était **jamais transmise** par les pages parentes (`Dashboard.tsx`, `Clients.tsx`, `Documents.tsx`, `Formations.tsx`) — `<Header user={...} />` sans `onLogout`. Le clic appelait donc `undefined()`, silencieusement ignoré par React.

**Fix appliqué** (commit `21832f6`, poussé sur `main`) : ajout dans chaque page concernée d'une fonction `handleLogout` qui appelle `supabase.auth.signOut()` puis `navigate('/login')`, et passage de cette fonction en prop au `<Header>`.

**Statut** : ✅ Poussé sur GitHub, déploiement Vercel automatique déclenché. À reconfirmer en prod après déploiement.

---

## 8. Roadmap — ce qu'il reste à faire (par priorité)

1. ~~Vérifier l'email reset password via Brevo~~ ✅ Fait
2. **Tester le flux complet** inscription → session → documents → questionnaires (en cours — inscription et login validés, reste session/documents/questionnaires)
3. Affiner la charte graphique — bouton "Inscription" du header en orange feu (`#f2901e`)
4. Brancher **FormationCreation.tsx** sur Supabase (encore statique/Lovable)
5. Brancher le **module BPF** et le **pré-audit** en pages réelles (edge function déjà prête pour le pré-audit)
6. Réactiver la **confirmation email** avant lancement public (actuellement désactivée volontairement pour les tests)
7. Rédiger les **CGV/CGU**
8. Intégrer **Stripe** pour la facturation (roadmap V2)

### Roadmap V2 (pivot)
- Formateurs portés sous certification Qualiopi ExSenCo
- Ouverture aux organismes de formation multi-formateurs
- Infrastructure déjà anticipée : colonne `role` dans `profiles`

---

## 9. Notes pour reprendre une session (Claude Code ou autre)

- Le repo est cloné via HTTPS ; pour pousser du code, un **Personal Access Token GitHub** (scope `repo`) est nécessaire si pas d'auth Git déjà configurée sur la machine. Ne jamais laisser de token en clair dans une conversation au-delà de son usage immédiat — le révoquer juste après usage.
- Les secrets Supabase (clés API, DocuSign, etc.) ne sont **jamais** à redemander ou ressaisir en conversation — ils sont déjà configurés côté Supabase Edge Functions.
- Toujours vérifier l'état réel d'une page avant de la considérer "branchée" — plusieurs pages listées comme "✅ branchées" peuvent quand même contenir des bugs ponctuels (cf. §7, bouton logout).
