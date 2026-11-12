import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { zipSync, strToU8 } from "https://esm.sh/fflate@0.8.2";
import { create as createJWT, getNumericDate } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

// Chantier facturation — export des données payant (12/11/2026).
// Fabrique l'archive ZIP complète d'un organisme (données CSV + JSON, documents
// générés, fichiers déposés, conventions signées DocuSign en PDF avec
// certificat, preuves d'audit horodatées par session), la dépose dans le
// bucket privé exports-donnees, génère un lien signé valable 30 jours et
// l'envoie par email (Brevo) au formateur.
//
// Déclenchée par stripe-webhook après paiement (ou manuellement par Olivier),
// jamais depuis le navigateur : protégée par x-cron-secret.
// Entrée : { "export_id": "<uuid>" } — la ligne public.exports doit exister.
// Idempotente : un export déjà "envoye" n'est pas refait sauf {"forcer": true}.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const BREVO_SENDER_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL") || "olivier@exsenco.fr";
const ADMIN_EMAIL = "olivier@exsenco.fr";

const DOCUSIGN_BASE_URL = Deno.env.get("DOCUSIGN_BASE_URL") ?? "https://demo.docusign.net";
const DOCUSIGN_AUTH_URL = Deno.env.get("DOCUSIGN_AUTH_URL") ?? "https://account-d.docusign.com";
const DOCUSIGN_INTEGRATION_KEY = Deno.env.get("DOCUSIGN_INTEGRATION_KEY") ?? "";
const DOCUSIGN_API_ACCOUNT_ID = Deno.env.get("DOCUSIGN_API_ACCOUNT_ID") ?? "";
const DOCUSIGN_USER_ID = Deno.env.get("DOCUSIGN_USER_ID") ?? "";
const DOCUSIGN_PRIVATE_KEY = Deno.env.get("DOCUSIGN_PRIVATE_KEY") ?? "";

const BUCKET_EXPORTS = "exports-donnees";
const BUCKETS_DOCUMENTS = ["documents-qualiopi", "documents-qualiopi-support"];
const DUREE_LIEN_SECONDES = 30 * 24 * 3600;

type Ligne = Record<string, unknown>;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

// ───────────────────────── utilitaires ─────────────────────────

// Colonnes jamais exportées : jetons d'accès publics, secrets, contenus HTML
// volumineux (exportés à part comme fichiers).
const COLONNE_EXCLUE = /token|secret|password|mot_de_passe/i;

function nettoyer(lignes: Ligne[], exclureHtml = true): Ligne[] {
  return lignes.map((l) => {
    const o: Ligne = {};
    for (const [k, v] of Object.entries(l)) {
      if (COLONNE_EXCLUE.test(k)) continue;
      if (exclureHtml && k === "contenu_html") continue;
      o[k] = v;
    }
    return o;
  });
}

function versCsv(lignes: Ligne[]): string {
  if (!lignes.length) return "﻿";
  const colonnes = Array.from(new Set(lignes.flatMap((l) => Object.keys(l))));
  const cellule = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const corps = lignes.map((l) => colonnes.map((c) => cellule(l[c])).join(";"));
  return "﻿" + [colonnes.join(";"), ...corps].join("\r\n");
}

function slug(s: unknown, max = 40): string {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "")
    .slice(0, max) || "sans-nom";
}

function echapper(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function dateFr(iso: unknown, avecHeure = true): string {
  if (!iso) return "—";
  const d = new Date(String(iso));
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric",
    ...(avecHeure ? { hour: "2-digit", minute: "2-digit", second: "2-digit" } : {}),
  });
}

function pageHtml(titre: string, corps: string): string {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>${echapper(titre)}</title>
<style>body{font-family:Arial,sans-serif;color:#222;max-width:1100px;margin:24px auto;padding:0 16px}
h1,h2{color:#25245e}table{border-collapse:collapse;width:100%;font-size:13px;margin:12px 0}
th,td{border:1px solid #ddd;padding:6px;text-align:left;vertical-align:top}th{background:#f2f2f6}
.muted{color:#818284;font-size:12px}a{color:#25245e}.ok{color:#1a7f37}.ko{color:#b42318}</style>
</head><body>${corps}</body></html>`;
}

function enveloppeDocument(titre: string, html: string): string {
  return /<html[\s>]/i.test(html) ? html : pageHtml(titre, html);
}

async function chargerPar(admin: SupabaseClient, table: string, colonne: string, ids: string[], select = "*"): Promise<Ligne[]> {
  if (!ids.length) return [];
  const resultats: Ligne[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await admin.from(table).select(select).in(colonne, ids.slice(i, i + 150));
    if (error) throw new Error(`Lecture ${table} : ${error.message}`);
    resultats.push(...((data ?? []) as Ligne[]));
  }
  return resultats;
}

const ids = (lignes: Ligne[], cle = "id") =>
  Array.from(new Set(lignes.map((l) => l[cle]).filter(Boolean) as string[]));

// ───────────────────────── fichiers déposés ─────────────────────────

async function telechargerFichier(admin: SupabaseClient, urlOuChemin: string): Promise<Uint8Array | null> {
  const prefixe = `${SUPABASE_URL}/storage/v1/object/public/`;
  let candidats: { bucket: string; chemin: string }[] = [];
  if (urlOuChemin.startsWith(prefixe)) {
    const reste = decodeURIComponent(urlOuChemin.slice(prefixe.length));
    const [bucket, ...chemin] = reste.split("/");
    candidats = [{ bucket, chemin: chemin.join("/") }];
  } else if (!/^https?:\/\//.test(urlOuChemin)) {
    candidats = BUCKETS_DOCUMENTS.map((bucket) => ({ bucket, chemin: urlOuChemin.replace(/^\//, "") }));
  } else {
    const r = await fetch(urlOuChemin);
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  }
  for (const c of candidats) {
    const { data } = await admin.storage.from(c.bucket).download(c.chemin);
    if (data) return new Uint8Array(await data.arrayBuffer());
  }
  return null;
}

// ───────────────────────── DocuSign ─────────────────────────

let jetonDocusign: string | null = null;

async function docusignJeton(): Promise<string> {
  if (jetonDocusign) return jetonDocusign;
  const pem = DOCUSIGN_PRIVATE_KEY
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/, "")
    .replace(/-----END (RSA )?PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const cle = await crypto.subtle.importKey(
    "pkcs8", Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const assertion = await createJWT(
    { alg: "RS256", typ: "JWT" },
    {
      iss: DOCUSIGN_INTEGRATION_KEY, sub: DOCUSIGN_USER_ID, aud: new URL(DOCUSIGN_AUTH_URL).hostname,
      iat: getNumericDate(0), exp: getNumericDate(3600), scope: "signature impersonation",
    },
    cle,
  );
  const r = await fetch(`${DOCUSIGN_AUTH_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!r.ok) throw new Error(`Authentification DocuSign refusée (${r.status})`);
  jetonDocusign = (await r.json()).access_token;
  return jetonDocusign!;
}

async function conventionSignee(envelopeId: string): Promise<{ statut: string; pdf: Uint8Array | null; signee_le?: string }> {
  const jeton = await docusignJeton();
  const base = `${DOCUSIGN_BASE_URL}/restapi/v2.1/accounts/${DOCUSIGN_API_ACCOUNT_ID}/envelopes/${envelopeId}`;
  const e = await fetch(base, { headers: { Authorization: `Bearer ${jeton}` } });
  if (!e.ok) return { statut: `introuvable (${e.status})`, pdf: null };
  const env = await e.json();
  if (env.status !== "completed") return { statut: env.status ?? "inconnu", pdf: null };
  const d = await fetch(`${base}/documents/combined?certificate=true`, { headers: { Authorization: `Bearer ${jeton}` } });
  if (!d.ok) return { statut: `signée, PDF indisponible (${d.status})`, pdf: null };
  return { statut: "completed", pdf: new Uint8Array(await d.arrayBuffer()), signee_le: env.completedDateTime };
}

// ───────────────────────── email ─────────────────────────

async function envoyerEmail(to: string, sujet: string, html: string): Promise<boolean> {
  if (!BREVO_API_KEY) { console.error("BREVO_API_KEY manquant"); return false; }
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: { name: "QualioFlex by ExSenCo", email: BREVO_SENDER_EMAIL },
      to: [{ email: to }],
      subject: sujet,
      htmlContent: html,
    }),
  });
  if (!r.ok) console.error("Erreur Brevo:", await r.text());
  return r.ok;
}

function emailMarque(titre: string, corps: string): string {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f8;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f8;padding:40px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#25245e;padding:32px 40px;"><h1 style="margin:0;color:#fff;font-size:24px;">QualioFlex</h1>
<p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">by ExSenCo</p></td></tr>
<tr><td style="padding:40px;"><h2 style="color:#25245e;font-size:20px;margin:0 0 16px;">${titre}</h2>${corps}</td></tr>
<tr><td style="background:#f5f5f8;padding:20px 40px;border-top:1px solid #eee;"><p style="margin:0;color:#999;font-size:12px;">
QualioFlex by SARL EXSENCO · 80 rue du Nouveau Bois, 37550 Saint-Avertin<br>
<a href="https://qualioflex.fr" style="color:#25245e;">qualioflex.fr</a></p></td></tr>
</table></td></tr></table></body></html>`;
}

// ───────────────────────── fabrication de l'archive ─────────────────────────

async function fabriquerArchive(admin: SupabaseClient, organismeId: string) {
  const fichiers: Record<string, Uint8Array> = {};
  const ajouter = (chemin: string, contenu: string | Uint8Array) => {
    fichiers[chemin] = typeof contenu === "string" ? strToU8(contenu) : contenu;
  };
  const avertissements: string[] = [];

  const { data: organisme, error: orgErr } = await admin.from("organismes").select("*").eq("id", organismeId).single();
  if (orgErr || !organisme) throw new Error("Organisme introuvable");

  // Données rattachées directement à l'organisme
  const parOrganisme = [
    "formations", "clients", "beneficiaires", "bpf", "checklist_items", "corrections_questionnaires",
    "derogations_qualiopi", "evaluations_formateurs", "invitations_clients", "preaudits",
    "questionnaires_types", "suivi_formation_formateur", "factures", "sessions_facturables",
    "abonnements_organismes",
  ];
  const donnees: Record<string, Ligne[]> = {};
  for (const t of parOrganisme) donnees[t] = await chargerPar(admin, t, "organisme_id", [organismeId]);
  donnees["profils"] = await chargerPar(admin, "profiles", "organisme_id", [organismeId], "id, nom_complet, email, role, created_at");
  donnees["competences_formateur"] = organisme.owner_user_id
    ? await chargerPar(admin, "competences_formateurs", "formateur_user_id", [organisme.owner_user_id as string])
    : [];

  // Formations → sessions → stagiaires → documents → signatures
  const formationIds = ids(donnees.formations);
  donnees.sessions = await chargerPar(admin, "sessions", "formation_id", formationIds);
  for (const t of ["documents_formation", "enquetes_preformation", "evaluation_questions", "formation_competences"]) {
    donnees[t] = await chargerPar(admin, t, "formation_id", formationIds);
  }
  const sessionIds = ids(donnees.sessions);
  for (const t of ["session_dates", "stagiaires", "documents", "evaluations_formations", "evaluations_formateur_clients", "participations"]) {
    donnees[t] = await chargerPar(admin, t, "session_id", sessionIds);
  }
  donnees.sous_traitance = await chargerPar(admin, "sessions_sous_traitance", "session_id", sessionIds,
    "id, session_id, organisme_sous_traitant_id, email_invite, statut, created_at, updated_at");
  donnees.relances = await chargerPar(admin, "relances", "participation_id", ids(donnees.participations));
  donnees.consentements = await chargerPar(admin, "consentements_log", "stagiaire_id", ids(donnees.stagiaires));
  donnees.signatures = await chargerPar(admin, "signatures", "document_id", ids(donnees.documents_formation));

  // Index utiles
  const formationParId = new Map(donnees.formations.map((f) => [f.id as string, f]));
  const clientParId = new Map(donnees.clients.map((c) => [c.id as string, c]));
  const sessionParId = new Map(donnees.sessions.map((s) => [s.id as string, s]));
  const stagiaireParId = new Map(donnees.stagiaires.map((s) => [s.id as string, s]));
  const docParId = new Map(donnees.documents_formation.map((d) => [d.id as string, d]));
  const dossierSession = (s: Ligne) =>
    `${s.date_debut ?? "sans-date"}_${slug(formationParId.get(s.formation_id as string)?.titre, 30)}_${slug(clientParId.get(s.client_id as string)?.raison_sociale, 25)}_${String(s.id).slice(0, 8)}`;

  // 1. Données tabulaires (CSV pour Excel + JSON complet)
  ajouter("donnees/organisme.csv", versCsv(nettoyer([organisme as Ligne])));
  const comptes: Record<string, number> = {};
  for (const [nom, lignes] of Object.entries(donnees)) {
    comptes[nom] = lignes.length;
    if (lignes.length) ajouter(`donnees/${nom}.csv`, versCsv(nettoyer(lignes)));
  }
  ajouter("donnees/export-complet.json", JSON.stringify({
    genere_le: new Date().toISOString(),
    organisme: nettoyer([organisme as Ligne])[0],
    ...Object.fromEntries(Object.entries(donnees).map(([k, v]) => [k, nettoyer(v)])),
  }, null, 2));

  // 2. Documents générés (HTML) et fichiers déposés
  let nbDocuments = 0;
  for (const d of donnees.documents_formation) {
    const session = d.session_id ? sessionParId.get(d.session_id as string) : null;
    const dossier = session
      ? `documents/sessions/${dossierSession(session)}`
      : `documents/formations/${slug(formationParId.get(d.formation_id as string)?.titre, 50)}`;
    const stag = d.stagiaire_id ? stagiaireParId.get(d.stagiaire_id as string) : null;
    const base = `${d.type}${stag ? "_" + slug(`${stag.nom}-${stag.prenom}`, 30) : ""}_${String(d.id).slice(0, 8)}`;
    if (d.contenu_html) {
      ajouter(`${dossier}/${base}.html`, enveloppeDocument(String(d.type), String(d.contenu_html)));
      nbDocuments++;
    }
    const source = (d.fichier_url || d.url) as string | null;
    if (source) {
      try {
        const contenu = await telechargerFichier(admin, source);
        if (contenu) {
          const nom = String(d.nom_fichier || `${base}.pdf`).replace(/[\\/:*?"<>|]/g, "_");
          ajouter(`${dossier}/${nom}`, contenu);
          nbDocuments++;
        } else avertissements.push(`Fichier introuvable : ${d.nom_fichier || source}`);
      } catch (e) {
        avertissements.push(`Fichier non récupéré : ${d.nom_fichier || source} (${(e as Error).message})`);
      }
    }
  }

  // 3. Conventions signées (DocuSign) : PDF + certificat de signature
  const recapSignatures: { session: string; document: string; statut: string; signee_le?: string; fichier?: string }[] = [];
  for (const sig of donnees.signatures) {
    const doc = docParId.get(sig.document_id as string);
    const session = doc?.session_id ? sessionParId.get(doc.session_id as string) : null;
    const libelleSession = session ? dossierSession(session) : "hors-session";
    const ligne = { session: libelleSession, document: String(doc?.type ?? "document"), statut: String(sig.statut) };
    if (sig.provider !== "docusign" || !sig.provider_signature_request_id) {
      recapSignatures.push(ligne);
      continue;
    }
    try {
      const r = await conventionSignee(String(sig.provider_signature_request_id));
      if (r.pdf) {
        const chemin = `conventions-signees/${libelleSession}/${ligne.document}_signee_${String(sig.provider_signature_request_id).slice(0, 8)}.pdf`;
        ajouter(chemin, r.pdf);
        recapSignatures.push({ ...ligne, statut: "signée", signee_le: r.signee_le, fichier: chemin });
      } else {
        recapSignatures.push({ ...ligne, statut: r.statut === "completed" ? "signée" : `non signée (${r.statut})` });
      }
    } catch (e) {
      recapSignatures.push({ ...ligne, statut: `vérification impossible (${(e as Error).message})` });
      avertissements.push(`DocuSign : ${(e as Error).message}`);
    }
  }

  // 4. Preuves d'audit horodatées par session (journal des modifications)
  const pagesPreuves: { session: Ligne; chemin: string; nbEvenements: number }[] = [];
  const elementsSuivis: string[] = [
    ...sessionIds, ...ids(donnees.stagiaires), ...ids(donnees.documents_formation), ...ids(donnees.signatures),
  ];
  const journal = await chargerPar(admin, "journal_modifications", "enregistrement_id", elementsSuivis,
    "table_source, operation, enregistrement_id, ancien_contenu, nouveau_contenu, modifie_le");
  const sessionDeLElement = (j: Ligne): string | null => {
    const id = j.enregistrement_id as string;
    if (sessionParId.has(id)) return id;
    if (stagiaireParId.has(id)) return stagiaireParId.get(id)!.session_id as string;
    if (docParId.has(id)) return (docParId.get(id)!.session_id as string) ?? null;
    const sig = donnees.signatures.find((s) => s.id === id);
    if (sig) return (docParId.get(sig.document_id as string)?.session_id as string) ?? null;
    return null;
  };
  const libelleElement = (j: Ligne): string => {
    const c = (j.nouveau_contenu ?? j.ancien_contenu ?? {}) as Ligne;
    switch (j.table_source) {
      case "stagiaires": return `Stagiaire ${c.prenom ?? ""} ${c.nom ?? ""}`.trim();
      case "documents_formation": return `Document : ${c.type ?? ""}`;
      case "signatures": return `Signature électronique (${c.provider ?? ""})`;
      case "sessions": return "Session";
      default: return String(j.table_source);
    }
  };
  const IGNORE_DIFF = new Set(["updated_at", "contenu_html"]);
  const changements = (j: Ligne): string => {
    if (j.operation === "INSERT") return "Création";
    if (j.operation === "DELETE") return "Suppression";
    const a = (j.ancien_contenu ?? {}) as Ligne, n = (j.nouveau_contenu ?? {}) as Ligne;
    const diffs = Object.keys(n).filter((k) => !IGNORE_DIFF.has(k) && !COLONNE_EXCLUE.test(k)
      && JSON.stringify(a[k]) !== JSON.stringify(n[k]));
    return diffs.map((k) => {
      const v = n[k];
      const s = typeof v === "object" && v !== null ? "(réponses enregistrées)" : String(v ?? "vide");
      return `${k} → ${s.length > 80 ? s.slice(0, 80) + "…" : s}`;
    }).join("<br>") || "Mise à jour";
  };
  const etapesStagiaire: [string, string][] = [
    ["Livret d'accueil", "doc_livret_envoye_le"],
    ["Questionnaire de positionnement", "doc_questionnaire_avant_envoye_le"],
    ["Émargement envoyé", "doc_emargement_envoye_le"],
    ["Émargement signé", "doc_emargement_signe_le"],
    ["Évaluation à chaud", "doc_evaluation_chaud_envoye_le"],
    ["Évaluation des acquis", "doc_evaluation_acquis_envoye_le"],
    ["Évaluation du formateur", "doc_evaluation_formateur_envoye_le"],
    ["Évaluation à froid", "doc_evaluation_froid_envoye_le"],
    ["Attestation", "doc_attestation_envoye_le"],
  ];
  for (const s of donnees.sessions) {
    const evts = journal.filter((j) => sessionDeLElement(j) === s.id)
      .sort((x, y) => String(x.modifie_le).localeCompare(String(y.modifie_le)));
    const stagiairesSession = donnees.stagiaires.filter((st) => st.session_id === s.id);
    const f = formationParId.get(s.formation_id as string);
    const c = clientParId.get(s.client_id as string);
    const tableauStagiaires = stagiairesSession.length
      ? `<table><tr><th>Stagiaire</th>${etapesStagiaire.map(([l]) => `<th>${l}</th>`).join("")}</tr>${
        stagiairesSession.map((st) => `<tr><td>${echapper(`${st.prenom ?? ""} ${st.nom ?? ""}`)}</td>${
          etapesStagiaire.map(([, col]) => `<td>${st[col] ? dateFr(st[col]) : '<span class="ko">non envoyé / en attente</span>'}</td>`).join("")
        }</tr>`).join("")}</table>`
      : "<p class='muted'>Aucun stagiaire enregistré.</p>";
    const signaturesSession = recapSignatures.filter((r) => r.session === dossierSession(s));
    const corps = `<h1>Preuve d'audit Qualiopi</h1>
<p><strong>Formation :</strong> ${echapper(f?.titre)}<br><strong>Client :</strong> ${echapper(c?.raison_sociale)}<br>
<strong>Dates :</strong> ${dateFr(s.date_debut, false)} → ${dateFr(s.date_fin, false)}<br><strong>Statut :</strong> ${echapper(s.statut)}</p>
<h2>Étapes par stagiaire</h2>${tableauStagiaires}
<h2>Conventions et signatures</h2>${signaturesSession.length
      ? `<table><tr><th>Document</th><th>Statut</th><th>Signé le</th></tr>${signaturesSession.map((r) =>
        `<tr><td>${echapper(r.document)}</td><td>${echapper(r.statut)}</td><td>${dateFr(r.signee_le)}</td></tr>`).join("")}</table>`
      : "<p class='muted'>Aucune signature électronique pour cette session.</p>"}
<h2>Journal horodaté (${evts.length} événements)</h2>${evts.length
      ? `<table><tr><th>Date et heure (Paris)</th><th>Élément</th><th>Changement</th></tr>${evts.map((j) =>
        `<tr><td>${dateFr(j.modifie_le)}</td><td>${echapper(libelleElement(j))}</td><td>${changements(j)}</td></tr>`).join("")}</table>`
      : "<p class='muted'>Aucun événement journalisé (le journal horodaté couvre ces éléments depuis novembre 2026).</p>"}
<p class="muted">Généré par QualioFlex le ${dateFr(new Date().toISOString())}. Horodatage issu du journal d'audit de la plateforme.</p>`;
    const chemin = `preuves-audit/${dossierSession(s)}.html`;
    ajouter(chemin, pageHtml(`Preuve d'audit — ${f?.titre ?? ""}`, corps));
    pagesPreuves.push({ session: s, chemin, nbEvenements: evts.length });
  }

  // 5. Sommaire
  const nbConventionsSignees = recapSignatures.filter((r) => r.fichier).length;
  const sommaire = `<h1>Export de vos données QualioFlex</h1>
<p><strong>${echapper(organisme.raison_sociale)}</strong> — SIRET ${echapper(organisme.siret)} — NDA ${echapper(organisme.nda)}<br>
<span class="muted">Export généré le ${dateFr(new Date().toISOString())}</span></p>
<h2>Contenu</h2><ul>
<li><strong>donnees/</strong> : vos données en tableaux CSV (ouvrables dans Excel) et un fichier JSON complet.</li>
<li><strong>documents/</strong> : ${nbDocuments} document(s) — livrets, conventions, devis, émargements, attestations, trames (fichiers HTML à ouvrir dans un navigateur ; Fichier → Imprimer → Enregistrer en PDF), programmes et supports déposés.</li>
<li><strong>conventions-signees/</strong> : ${nbConventionsSignees} convention(s) signée(s) électroniquement, en PDF avec certificat de signature DocuSign.</li>
<li><strong>preuves-audit/</strong> : une page horodatée par session, à présenter à votre auditeur Qualiopi.</li></ul>
<h2>Sessions (${pagesPreuves.length})</h2>${pagesPreuves.length ? `<table><tr><th>Date</th><th>Formation</th><th>Client</th><th>Preuve d'audit</th></tr>${
    pagesPreuves.map((p) => `<tr><td>${dateFr(p.session.date_debut, false)}</td><td>${echapper(formationParId.get(p.session.formation_id as string)?.titre)}</td><td>${echapper(clientParId.get(p.session.client_id as string)?.raison_sociale)}</td><td><a href="${p.chemin}">Ouvrir</a> (${p.nbEvenements} événements)</td></tr>`).join("")}</table>` : "<p class='muted'>Aucune session.</p>"}
<h2>Tableaux de données</h2><table><tr><th>Fichier</th><th>Lignes</th></tr>${
    Object.entries(comptes).filter(([, n]) => n > 0).map(([k, n]) => `<tr><td><a href="donnees/${k}.csv">${k}.csv</a></td><td>${n}</td></tr>`).join("")}</table>
${recapSignatures.length ? `<h2>Signatures électroniques</h2><table><tr><th>Session</th><th>Document</th><th>Statut</th></tr>${
    recapSignatures.map((r) => `<tr><td>${echapper(r.session)}</td><td>${echapper(r.document)}</td><td>${echapper(r.statut)}</td></tr>`).join("")}</table>` : ""}
${avertissements.length ? `<h2>Points d'attention</h2><ul>${avertissements.map((a) => `<li>${echapper(a)}</li>`).join("")}</ul>` : ""}
<p class="muted">Les jetons d'accès des liens envoyés aux stagiaires sont volontairement exclus de l'export.
Conservez cette archive : elle constitue la trace de votre activité de formation sur QualioFlex.</p>`;
  ajouter("LISEZMOI.html", pageHtml("Export QualioFlex", sommaire));

  const zip = zipSync(fichiers, { level: 6 });
  return {
    zip,
    organisme,
    statistiques: {
      fichiers: Object.keys(fichiers).length,
      sessions: pagesPreuves.length,
      documents: nbDocuments,
      conventions_signees: nbConventionsSignees,
      tables: comptes,
      avertissements,
    },
  };
}

// ───────────────────────── point d'entrée ─────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  if (!CRON_SECRET || (req.headers.get("x-cron-secret") ?? "") !== CRON_SECRET) return json({ error: "Non autorisé" }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { export_id, forcer } = await req.json().catch(() => ({}));
  if (!export_id) return json({ error: "export_id requis" }, 400);

  const { data: exp, error } = await admin.from("exports").select("*").eq("id", export_id).single();
  if (error || !exp) return json({ error: "Export introuvable" }, 404);
  if (exp.statut === "envoye" && !forcer) return json({ success: true, deja_envoye: true });

  await admin.from("exports").update({ statut: "en_cours", erreur: null, updated_at: new Date().toISOString() }).eq("id", export_id);

  try {
    const { zip, organisme, statistiques } = await fabriquerArchive(admin, exp.organisme_id);
    const nomFichier = `QualioFlex_export_${slug(organisme.raison_sociale, 40)}_${new Date().toISOString().slice(0, 10)}.zip`;
    const chemin = `${exp.organisme_id}/${export_id}.zip`;

    const { error: upErr } = await admin.storage.from(BUCKET_EXPORTS)
      .upload(chemin, zip, { contentType: "application/zip", upsert: true });
    if (upErr) throw new Error(`Dépôt de l'archive impossible : ${upErr.message}`);

    const { data: lien, error: lienErr } = await admin.storage.from(BUCKET_EXPORTS)
      .createSignedUrl(chemin, DUREE_LIEN_SECONDES, { download: nomFichier });
    if (lienErr || !lien) throw new Error(`Lien de téléchargement impossible : ${lienErr?.message}`);
    const expireLe = new Date(Date.now() + DUREE_LIEN_SECONDES * 1000);

    await admin.from("exports").update({
      statut: "pret", chemin, taille_octets: zip.byteLength, lien_expire_le: expireLe.toISOString(),
      statistiques, updated_at: new Date().toISOString(),
    }).eq("id", export_id);

    const destinataire = (exp.email_destinataire as string) || (organisme.email_contact as string);
    const tailleMo = (zip.byteLength / 1024 / 1024).toFixed(1);
    const envoye = destinataire ? await envoyerEmail(
      destinataire,
      "[QualioFlex] Votre export de données est prêt",
      emailMarque("Votre export de données est prêt", `
<p style="color:#555;line-height:1.6;margin:0 0 16px;">Bonjour,</p>
<p style="color:#555;line-height:1.6;margin:0 0 16px;">L'export complet des données de <strong>${echapper(organisme.raison_sociale)}</strong> est prêt
(${statistiques.sessions} session(s), ${statistiques.documents} document(s), ${statistiques.conventions_signees} convention(s) signée(s), ${tailleMo} Mo).</p>
<p style="color:#555;line-height:1.6;margin:0 0 24px;">Le lien ci-dessous est personnel et valable jusqu'au <strong>${dateFr(expireLe.toISOString(), false)}</strong>.
Téléchargez l'archive et conservez-la : elle contient vos preuves d'audit Qualiopi.</p>
<table cellpadding="0" cellspacing="0"><tr><td style="background:#f2901e;border-radius:6px;">
<a href="${lien.signedUrl}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;">Télécharger mon export →</a>
</td></tr></table>
<p style="color:#999;font-size:12px;line-height:1.6;margin:24px 0 0;">Ouvrez d'abord le fichier LISEZMOI.html : il présente le contenu de l'archive.</p>`),
    ) : false;

    await admin.from("exports").update({
      statut: envoye ? "envoye" : "pret",
      envoye_le: envoye ? new Date().toISOString() : null,
      erreur: envoye ? null : "Archive prête mais email non envoyé",
      updated_at: new Date().toISOString(),
    }).eq("id", export_id);

    if (!envoye) {
      await envoyerEmail(ADMIN_EMAIL, `[QualioFlex] Export prêt mais email non envoyé — ${organisme.raison_sociale}`,
        emailMarque("Export à transmettre manuellement", `<p>L'export ${export_id} est prêt mais l'email au client n'est pas parti (destinataire : ${echapper(destinataire || "aucun")}).</p>
<p><a href="${lien.signedUrl}">Lien de téléchargement (30 jours)</a></p>`));
    }
    return json({ success: true, export_id, envoye, taille_octets: zip.byteLength, statistiques });
  } catch (e) {
    const message = (e as Error).message;
    console.error("generer-export-donnees:", e);
    await admin.from("exports").update({ statut: "erreur", erreur: message, updated_at: new Date().toISOString() }).eq("id", export_id);
    await envoyerEmail(ADMIN_EMAIL, "[QualioFlex] Échec d'un export de données payé",
      emailMarque("Export en échec", `<p>L'export <strong>${export_id}</strong> (organisme ${exp.organisme_id}) a échoué :</p><p>${echapper(message)}</p>
<p>Le client a payé : relance la génération une fois le problème corrigé.</p>`));
    return json({ error: message }, 500);
  }
});
