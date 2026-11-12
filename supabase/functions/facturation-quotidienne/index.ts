import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";

// Tâche planifiée quotidienne de la facturation (lot 4, 12/11/2026).
// Appelée par pg_cron (en-tête x-cron-secret), jamais par le navigateur.
//
// 1. Impayés : l'alerte (coupure à J+10) est envoyée par le webhook au premier
//    échec. Ici : relance à J-2 avant la coupure, puis coupure à la date prévue
//    (statut « coupe » → accès limité à la page Abonnement et factures) et
//    email de coupure. Avant de couper, on revérifie l'état chez Stripe (un
//    paiement a pu passer sans que le webhook ait encore été traité).
// 2. Carte bientôt expirée : à partir du 15 du mois, si la carte de
//    l'abonnement expire avant le prochain prélèvement (le 1er), un email
//    invite à la mettre à jour (une fois par mois).
// 3. Animation du parrainage (lot 6) : le 10 de chaque mois, deux relances
//    pour les abonnés actifs (hors Membres Or en pause et quota atteint) :
//    - ceux qui parrainent déjà : leur progression vers le badge suivant ;
//    - ceux qui n'ont jamais parrainé : une incitation (ce qu'ils peuvent gagner).
//
// Recette : body { "maintenant": "2026-12-12T08:00:00Z" } simule une date,
// accepté uniquement avec une clé Stripe de test.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const BREVO_SENDER_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL") || "olivier@exsenco.fr";
const SITE_URL = (Deno.env.get("SITE_URL") || "https://qualioflex.fr").replace(/\/$/, "");
const RELANCE_AVANT_COUPURE_JOURS = 2;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const dateFr = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric" });

const para = (t: string) => `<p style="color:#555;line-height:1.6;margin:0 0 16px;">${t}</p>`;
const bouton = (url: string, texte: string) => `<table cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td style="background:#f2901e;border-radius:6px;">
<a href="${url}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;">${texte}</a>
</td></tr></table>`;

async function envoyerEmail(to: string, sujet: string, titre: string, corps: string) {
  if (!BREVO_API_KEY || !to) return false;
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
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
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ sender: { name: "QualioFlex by ExSenCo", email: BREVO_SENDER_EMAIL }, to: [{ email: to }], subject: sujet, htmlContent: html }),
  });
  if (!r.ok) console.error("facturation-quotidienne: erreur Brevo", await r.text());
  return r.ok;
}

// Emails « festifs » du parrainage (12/11/2026, demande Olivier) : bandeau
// coloré, confettis, grand emoji, ton enjoué. Thèmes : fete (orange QualioFlex),
// argent, or.
const THEMES_FESTIFS: Record<string, { fond: string; texte: string; accent: string }> = {
  fete: { fond: "linear-gradient(135deg,#f2901e 0%,#ffb347 50%,#25245e 100%)", texte: "#ffffff", accent: "#f2901e" },
  argent: { fond: "linear-gradient(135deg,#8e9eab 0%,#eef2f3 50%,#8e9eab 100%)", texte: "#25245e", accent: "#6b7b8c" },
  or: { fond: "linear-gradient(135deg,#b8860b 0%,#ffd700 45%,#fff3b0 60%,#d4a017 100%)", texte: "#3d2b00", accent: "#b8860b" },
};

async function envoyerEmailFestif(to: string, sujet: string, emoji: string, titre: string, corps: string, theme: "fete" | "argent" | "or" = "fete"): Promise<boolean> {
  if (!BREVO_API_KEY || !to) return false;
  const t = THEMES_FESTIFS[theme];
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#fff8ef;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8ef;padding:32px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(37,36,94,0.12);">
<tr><td style="background:#25245e;background-image:${t.fond};padding:28px 40px 32px;text-align:center;">
<p style="margin:0;font-size:22px;letter-spacing:6px;">🎉 ✨ 🎊 ✨ 🎉</p>
<p style="margin:12px 0 4px;font-size:72px;line-height:1;">${emoji}</p>
<h1 style="margin:8px 0 0;color:${t.texte};font-size:26px;line-height:1.3;">${titre}</h1>
<p style="margin:10px 0 0;color:${t.texte};font-size:13px;opacity:0.85;">QualioFlex by ExSenCo</p>
</td></tr>
<tr><td style="padding:36px 40px 28px;font-size:15px;">${corps}</td></tr>
<tr><td style="padding:0 40px 28px;text-align:center;"><p style="margin:0;font-size:20px;letter-spacing:8px;">🎈 🥳 🎈</p></td></tr>
<tr><td style="background:#f5f5f8;padding:18px 40px;border-top:1px solid #eee;"><p style="margin:0;color:#999;font-size:12px;">
QualioFlex by SARL EXSENCO · 80 rue du Nouveau Bois, 37550 Saint-Avertin<br>
<a href="https://qualioflex.fr" style="color:#25245e;">qualioflex.fr</a></p></td></tr>
</table></td></tr></table></body></html>`;
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ sender: { name: "QualioFlex by ExSenCo", email: BREVO_SENDER_EMAIL }, to: [{ email: to }], subject: sujet, htmlContent: html }),
  });
  if (!r.ok) console.error("email festif: erreur Brevo", await r.text());
  return r.ok;
}

// Encadré « récompense » pour les emails festifs
const cadeau = (texte: string, couleur = "#f2901e") =>
  `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td style="background:#fff8ef;border:2px dashed ${couleur};border-radius:12px;padding:18px 20px;text-align:center;color:#25245e;font-size:16px;line-height:1.5;">${texte}</td></tr></table>`;

async function emailOrganisme(admin: SupabaseClient, organismeId: string) {
  const { data: org } = await admin.from("organismes")
    .select("raison_sociale, email_contact, owner_user_id").eq("id", organismeId).single();
  let email = org?.email_contact as string | null;
  if (!email && org?.owner_user_id) {
    const { data: p } = await admin.from("profiles").select("email").eq("id", org.owner_user_id).maybeSingle();
    email = p?.email ?? null;
  }
  return { email: email ?? "", nom: (org?.raison_sociale as string) ?? "votre organisme" };
}

async function premiereFois(admin: SupabaseClient, organismeId: string, type: string, reference: string) {
  const { error } = await admin.from("notifications_abonnement").insert({ organisme_id: organismeId, type, reference, canal: "email" });
  return !error;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "Non autorisé" }, 401);
  if (!STRIPE_SECRET_KEY) return json({ ok: true, ignore: "Stripe non configuré" });

  const body = await req.json().catch(() => ({}));
  const modeTest = /^(sk|rk)_test_/.test(STRIPE_SECRET_KEY);
  const maintenant = modeTest && body?.maintenant ? new Date(body.maintenant) : new Date();
  const seulement: string | null = modeTest ? body?.organisme_id ?? null : null;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
  const bilan = { relances_j2: 0, coupures: 0, coupures_evitees: 0, alertes_carte: 0, relances_parrainage: 0, erreurs: [] as string[] };

  // ─── 1. Impayés : relance J-2 et coupure ───
  let q = admin.from("abonnements_organismes")
    .select("organisme_id, statut, type_compte, stripe_subscription_id, coupure_prevue_le")
    .eq("statut", "impaye").not("coupure_prevue_le", "is", null);
  if (seulement) q = q.eq("organisme_id", seulement);
  const { data: impayes } = await q;

  for (const ab of impayes ?? []) {
    try {
      if (ab.type_compte === "super_ambassadeur") continue;
      const coupure = new Date(ab.coupure_prevue_le);
      const dest = await emailOrganisme(admin, ab.organisme_id);

      if (maintenant >= coupure) {
        // Dernière vérification chez Stripe avant de couper
        if (ab.stripe_subscription_id) {
          const sub = await stripe.subscriptions.retrieve(ab.stripe_subscription_id);
          if (["active", "trialing"].includes(sub.status)) { bilan.coupures_evitees++; continue; }
        }
        await admin.from("abonnements_organismes").update({
          statut: "coupe", coupe_le: maintenant.toISOString(), updated_at: new Date().toISOString(),
        }).eq("organisme_id", ab.organisme_id).eq("statut", "impaye");
        bilan.coupures++;
        if (await premiereFois(admin, ab.organisme_id, "coupure", ab.coupure_prevue_le)) {
          await envoyerEmail(dest.email, "[QualioFlex] Votre accès est suspendu",
            "Votre accès à QualioFlex est suspendu",
            para("Bonjour,") +
            para(`Faute de règlement de votre facture, l'accès de <strong>${dest.nom}</strong> à QualioFlex est suspendu depuis le ${dateFr(maintenant.toISOString())}.`) +
            para("<strong>Vos données sont conservées.</strong> Il suffit de mettre à jour votre carte bancaire pour régler la facture en attente : votre accès est rétabli immédiatement.") +
            bouton(`${SITE_URL}/factures`, "Réactiver mon accès →"));
        }
        continue;
      }

      const relance = new Date(coupure.getTime() - RELANCE_AVANT_COUPURE_JOURS * 86400_000);
      if (maintenant >= relance && await premiereFois(admin, ab.organisme_id, "impaye_relance_j2", ab.coupure_prevue_le)) {
        bilan.relances_j2++;
        await envoyerEmail(dest.email, "[QualioFlex] Rappel : suspension de votre accès dans 2 jours",
          "Votre accès sera suspendu dans 2 jours",
          para("Bonjour,") +
          para(`Votre dernière facture QualioFlex pour <strong>${dest.nom}</strong> n'est toujours pas réglée.`) +
          para(`Sans régularisation, <strong>votre accès sera suspendu le ${dateFr(ab.coupure_prevue_le)}</strong>. Mettez à jour votre carte bancaire en deux minutes : le paiement est relancé automatiquement.`) +
          bouton(`${SITE_URL}/factures`, "Mettre à jour ma carte →"));
      }
    } catch (e) {
      bilan.erreurs.push(`${ab.organisme_id} : ${(e as Error).message}`);
    }
  }

  // ─── 2. Carte qui expire avant le prochain prélèvement ───
  const jourParis = Number(maintenant.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "numeric" }));
  if (jourParis >= 15) {
    // Prochain prélèvement : le 1er du mois suivant
    const prochain = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() + 1, 1));
    const moisRef = prochain.toISOString().slice(0, 7);
    let q2 = admin.from("abonnements_organismes")
      .select("organisme_id, type_compte, stripe_subscription_id")
      .in("statut", ["essai", "actif"]).not("stripe_subscription_id", "is", null);
    if (seulement) q2 = q2.eq("organisme_id", seulement);
    const { data: actifs } = await q2;

    for (const ab of actifs ?? []) {
      try {
        if (ab.type_compte === "super_ambassadeur") continue;
        const sub = await stripe.subscriptions.retrieve(ab.stripe_subscription_id, {
          expand: ["default_payment_method", "customer.invoice_settings.default_payment_method"],
        });
        const pm = (sub.default_payment_method ??
          ((sub.customer as Stripe.Customer)?.invoice_settings?.default_payment_method)) as Stripe.PaymentMethod | null;
        const carte = pm && typeof pm === "object" ? pm.card : null;
        if (!carte) continue;
        // La carte est valable jusqu'au dernier jour de son mois d'expiration
        const finValidite = new Date(Date.UTC(carte.exp_year, carte.exp_month, 1));
        if (finValidite > prochain) continue;
        if (!(await premiereFois(admin, ab.organisme_id, "carte_expiration", moisRef))) continue;
        bilan.alertes_carte++;
        const dest = await emailOrganisme(admin, ab.organisme_id);
        await envoyerEmail(dest.email, "[QualioFlex] Votre carte bancaire arrive à expiration",
          "Votre carte bancaire arrive à expiration",
          para("Bonjour,") +
          para(`La carte bancaire enregistrée pour l'abonnement QualioFlex de <strong>${dest.nom}</strong> (${carte.brand.toUpperCase()} se terminant par ${carte.last4}) expire fin ${String(carte.exp_month).padStart(2, "0")}/${carte.exp_year}.`) +
          para(`Pour éviter un échec de paiement lors du prochain prélèvement, le ${dateFr(prochain.toISOString())}, pensez à la mettre à jour.`) +
          bouton(`${SITE_URL}/factures`, "Mettre à jour ma carte →"));
      } catch (e) {
        bilan.erreurs.push(`${ab.organisme_id} : ${(e as Error).message}`);
      }
    }
  }

  // ─── 3. Relance mensuelle du parrainage ───
  if (jourParis === 10 || body?.forcer_relance_parrainage === true && modeTest) {
    const mois = maintenant.toISOString().slice(0, 7);
    const regle = async (cle: string, defaut: number) =>
      ((await admin.rpc("fn_regle_parrainage", { p_cle: cle })).data as number | null) ?? defaut;
    const [seuilArgent, seuilOr, maxAn] = await Promise.all([regle("seuil_argent", 3), regle("seuil_or", 5), regle("max_filleuls_par_an", 5)]);
    let q3 = admin.from("abonnements_organismes").select("organisme_id").eq("statut", "actif");
    if (seulement) q3 = q3.eq("organisme_id", seulement);
    const { data: abonnes } = await q3;

    for (const ab of abonnes ?? []) {
      try {
        const { data: badges } = await admin.from("badges_parrainage").select("niveau").eq("organisme_id", ab.organisme_id);
        const { data: enPause } = await admin.rpc("fn_parrainage_en_pause_jusqu_au", { p_organisme_id: ab.organisme_id });
        if (enPause) continue; // Membre Or pendant ses sessions offertes
        const { data: annee } = await admin.rpc("fn_parrainages_annee", { p_parrain: ab.organisme_id });
        if ((annee ?? 0) >= maxAn) continue; // quota de l'année atteint : rien à proposer
        if (!(await premiereFois(admin, ab.organisme_id, "parrainage_relance", mois))) continue;

        const { data: code } = await admin.rpc("fn_code_parrainage", { p_organisme_id: ab.organisme_id });
        const { data: siens } = await admin.from("parrainages").select("statut")
          .eq("parrain_organisme_id", ab.organisme_id).neq("statut", "annule");
        const confirmes = (siens ?? []).filter((x) => x.statut === "confirme").length;
        const lien = `${SITE_URL}/register?parrain=${code}`;
        const dest = await emailOrganisme(admin, ab.organisme_id);
        const blocCode = para(`Votre code : <strong style="font-family:monospace;font-size:16px;color:#25245e;">${code}</strong><br>Votre lien d'invitation : <a href="${lien}" style="color:#25245e;">${lien}</a>`);

        if (!(siens ?? []).length) {
          // Jamais parrainé : incitation
          bilan.relances_parrainage++;
          await envoyerEmailFestif(dest.email, "🎁 Et si vos confrères vous offraient des mois de QualioFlex ?",
            "🤝", "Parrainez, gagnez, fêtez !",
            para("Bonjour,") +
            para("Vous connaissez un formateur qui se bat encore avec ses classeurs Qualiopi ? 📚😅 Rendez-lui service… et faites-vous plaisir au passage :") +
            cadeau(`🎁 <strong>1 mois offert pour vous + 1 mois pour lui</strong><br><br>🥈 <strong>${seuilArgent} filleuls</strong> = badge Membre Argent + 1 mois BONUS<br>🥇 <strong>${seuilOr} filleuls</strong> = badge Membre Or + <strong>sessions offertes pendant 1 an</strong>`) +
            para("C'est simple comme un copier-coller : envoyez-lui votre lien, son code s'applique tout seul à l'inscription. ✨") +
            blocCode +
            bouton(`${SITE_URL}/dashboard`, "Je copie mon lien 🔗"));
          continue;
        }
        const argent = (badges ?? []).some((b) => b.niveau === "argent");
        const prochain = argent ? seuilOr : seuilArgent;
        const reste = Math.max(prochain - confirmes, 1);
        const dejaOr = (badges ?? []).some((b) => b.niveau === "or"); // année offerte terminée
        const objectif = dejaOr
          ? "Chaque nouveau filleul vous offre un mois de plus."
          : argent
          ? `Plus que <strong>${reste} filleul${reste > 1 ? "s" : ""}</strong> pour devenir <strong>Membre Or 🥇</strong> : toutes vos sessions offertes pendant un an.`
          : `Plus que <strong>${reste} filleul${reste > 1 ? "s" : ""}</strong> pour devenir <strong>Membre Argent 🥈</strong> et gagner un mois offert supplémentaire.`;
        bilan.relances_parrainage++;
        await envoyerEmailFestif(dest.email, `🚀 ${confirmes} filleul${confirmes > 1 ? "s" : ""} au compteur… on continue ?`,
          dejaOr ? "🥇" : argent ? "🥈" : "🚀", "Votre aventure parrainage continue !",
          para("Bonjour,") +
          para(`Bravo, vous faites déjà partie des formateurs qui font grandir QualioFlex ! 🙌 Petit point d'étape :`) +
          cadeau(`<strong>${confirmes} filleul${confirmes > 1 ? "s" : ""} confirmé${confirmes > 1 ? "s" : ""}</strong>${dejaOr ? " · Membre Or 🥇" : argent ? " · Membre Argent 🥈" : ""}<br><br>${objectif}`) +
          para("Chaque nouveau filleul, c'est <strong>un mois offert pour vous et un pour lui</strong>. Qui sera le prochain ? 😉") +
          blocCode +
          bouton(`${SITE_URL}/dashboard`, "Voir ma progression 🚀"), dejaOr ? "or" : argent ? "argent" : "fete");
      } catch (e) {
        bilan.erreurs.push(`${ab.organisme_id} : ${(e as Error).message}`);
      }
    }
  }

  if (bilan.erreurs.length) console.error("facturation-quotidienne:", bilan.erreurs);
  return json({ ok: true, maintenant: maintenant.toISOString(), ...bilan });
});
