import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
 
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
 
// La feuille d'émargement est un document STRUCTURÉ (tableau de présence) plutôt
// que rédactionnel : contrairement au livret d'accueil, on ne passe pas par Claude
// pour rédiger un texte — on construit directement le tableau à partir des dates
// de session et de la liste des stagiaires. Plus fiable pour un document légal
// dont la structure est imposée par le référentiel Qualiopi.
 
const formatDateFr = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
 
// Génère la liste des dates (jours) entre date_debut et date_fin inclus.
const listeJours = (dateDebut: string, dateFin: string): string[] => {
  const jours: string[] = [];
  const d = new Date(dateDebut + "T00:00:00");
  const fin = new Date(dateFin + "T00:00:00");
  if (isNaN(d.getTime()) || isNaN(fin.getTime()) || d > fin) return [dateDebut];
  while (d <= fin) {
    jours.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return jours;
};
 
// Correctif du 04/11/2026 (dates multiples / demi-journées — voir la table
// additive session_dates créée côté base). Un "jour" de feuille d'émargement
// porte désormais aussi l'info matin/après-midi à faire apparaître, pour une
// session positionnée sur des demi-journées plutôt que des journées entières.
type JourEmargement = { date: string; matin: boolean; apresMidi: boolean };
 
// Construit la liste des jours à partir de session_dates quand la session en
// a (dates/demi-journées choisies une à une à l'affectation) ; sinon retombe
// STRICTEMENT sur le comportement historique (listeJours sur date_debut →
// date_fin, journée complète) pour ne rien changer sur les sessions déjà
// créées avant ce correctif.
const construireJours = (
  sessionDates: { date: string; creneau: string }[],
  dateDebut: string,
  dateFin: string,
): JourEmargement[] => {
  if (sessionDates.length === 0) {
    return listeJours(dateDebut, dateFin).map((date) => ({ date, matin: true, apresMidi: true }));
  }
  const parJour = new Map<string, JourEmargement>();
  for (const sd of sessionDates) {
    const existant = parJour.get(sd.date) || { date: sd.date, matin: false, apresMidi: false };
    if (sd.creneau === "journee") { existant.matin = true; existant.apresMidi = true; }
    else if (sd.creneau === "matin") existant.matin = true;
    else if (sd.creneau === "apres_midi") existant.apresMidi = true;
    parJour.set(sd.date, existant);
  }
  return Array.from(parJour.values()).sort((a, b) => a.date.localeCompare(b.date));
};
 
const esc = (s: string | null | undefined) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
 
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
 
  try {
    const { session_id } = await req.json();
    console.log("generer-emargement: démarrage pour session_id =", session_id);
    if (!session_id) throw new Error("session_id requis");
 
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
 
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
 
    const { data: session, error: sErr } = await supabase
      .from("sessions")
      .select(`
        id, formation_id, client_id, date_debut, date_fin, lieu,
        formation:formation_id ( titre, organismes ( raison_sociale, nda, siret, adresse, telephone, email_contact, logo_url ) ),
        client:client_id ( raison_sociale )
      `)
      .eq("id", session_id)
      .single();
 
    if (sErr || !session) throw new Error("Session introuvable : " + sErr?.message);
    const s = session as Record<string, unknown>;
    const formation = s.formation as Record<string, unknown>;
    const org = (formation?.organismes as Record<string, string>) || {};
    const client = (s.client as Record<string, string>) || {};
 
    const { data: stagiairesData } = await supabase
      .from("stagiaires")
      .select("nom, prenom")
      .eq("session_id", session_id)
      .order("nom");
    const stagiaires = (stagiairesData as { nom: string; prenom: string }[]) || [];
    console.log("generer-emargement: stagiaires trouvés =", stagiaires.length);
 
    // Dates/demi-journées choisies une à une à l'affectation (voir
    // construireJours ci-dessus) — absent pour toute session créée avant ce
    // correctif, auquel cas on retombe sur l'ancien calendrier continu.
    const { data: sessionDatesData } = await supabase
      .from("session_dates")
      .select("date, creneau")
      .eq("session_id", session_id);
    const sessionDates = (sessionDatesData as { date: string; creneau: string }[]) || [];
 
    const dateDebut = String(s.date_debut || "");
    const dateFin = String(s.date_fin || dateDebut);
    const jours = construireJours(sessionDates, dateDebut, dateFin);
 
    // "du X au Y" reste la formulation par défaut (comportement historique,
    // toutes les sessions créées avant ce correctif) — uniquement quand les
    // jours couvrent effectivement une plage continue de journées complètes.
    // Pour des dates/demi-journées choisies une à une (chantier du 04/11/2026),
    // on énumère plutôt chaque date précisément : "du X au Y" serait trompeur
    // sur une formation étalée avec des jours sans formation entre deux dates.
    const continuEtComplet =
      jours.every((j) => j.matin && j.apresMidi) &&
      jours.length === listeJours(dateDebut, dateFin).length;
    const descriptionDates = continuEtComplet
      ? `du ${formatDateFr(dateDebut)} au ${formatDateFr(dateFin)}`
      : jours
          .map((j) => `${formatDateFr(j.date)}${!j.matin || !j.apresMidi ? ` (${j.matin ? "matin" : "après-midi"})` : ""}`)
          .join(", ");
 
    const tableJour = (jour: JourEmargement) => `
      <div class="jour-bloc">
        <h2>${esc(formatDateFr(jour.date))}${!jour.matin || !jour.apresMidi ? ` (${jour.matin ? "matin" : "après-midi"})` : ""}</h2>
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Prénom</th>
              ${jour.matin ? "<th>Signature matin</th>" : ""}
              ${jour.apresMidi ? "<th>Signature après-midi</th>" : ""}
            </tr>
          </thead>
          <tbody>
            ${stagiaires.length > 0
              ? stagiaires.map(st => `
                <tr>
                  <td>${esc(st.nom)}</td>
                  <td>${esc(st.prenom)}</td>
                  ${jour.matin ? '<td class="signature-cell"></td>' : ""}
                  ${jour.apresMidi ? '<td class="signature-cell"></td>' : ""}
                </tr>`).join("")
              : `<tr><td colspan="${1 + 1 + (jour.matin ? 1 : 0) + (jour.apresMidi ? 1 : 0)}" class="vide">Aucun stagiaire importé pour cette session</td></tr>`
            }
            <tr class="ligne-formateur">
              <td colspan="2"><em>Signature du formateur</em></td>
              ${jour.matin ? '<td class="signature-cell"></td>' : ""}
              ${jour.apresMidi ? '<td class="signature-cell"></td>' : ""}
            </tr>
          </tbody>
        </table>
      </div>`;
 
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Feuille d'émargement — ${esc(formation?.titre as string)}</title>
<style>
  body { font-family: Arial, sans-serif; color: #1a1a2e; padding: 24px; max-width: 900px; margin: 0 auto; }
  .header { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid #25245e; padding-bottom: 16px; margin-bottom: 20px; }
  .header img { height: 56px; max-width: 140px; object-fit: contain; }
  .header h1 { font-size: 16pt; color: #25245e; margin: 0; }
  .header p { font-size: 9pt; color: #666; margin: 2px 0 0; }
  .infos { background: #f8f8fc; border-radius: 6px; padding: 12px 16px; margin-bottom: 24px; font-size: 10pt; }
  .infos p { margin: 3px 0; }
  .jour-bloc { margin-bottom: 28px; page-break-inside: avoid; }
  .jour-bloc h2 { font-size: 12pt; color: #25245e; text-transform: capitalize; border-bottom: 1px solid #eee; padding-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; font-size: 10pt; margin-top: 8px; }
  th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; }
  th { background: #25245e; color: #fff; font-size: 9pt; }
  .signature-cell { width: 28%; height: 42px; }
  .ligne-formateur td { background: #fafafa; }
  .vide { text-align: center; color: #999; font-style: italic; }
  .footer { margin-top: 30px; font-size: 8pt; color: #999; text-align: center; }
  .no-print { text-align: center; margin: 20px 0; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <div class="header">
    ${org.logo_url ? `<img src="${esc(org.logo_url)}" alt="Logo" />` : ""}
    <div>
      <h1>${esc(org.raison_sociale || "")}</h1>
      <p>${org.nda ? `NDA : ${esc(org.nda)}` : ""}${org.siret ? ` — SIRET : ${esc(org.siret)}` : ""}</p>
      <p>${esc(org.adresse || "")}${org.telephone ? ` — ${esc(org.telephone)}` : ""}${org.email_contact ? ` — ${esc(org.email_contact)}` : ""}</p>
    </div>
  </div>
 
  <div class="infos">
    <p><strong>Feuille d'émargement</strong></p>
    <p>Formation : <strong>${esc(formation?.titre as string)}</strong></p>
    <p>Client : ${esc(client.raison_sociale || "")}</p>
    <p>Dates : ${esc(descriptionDates)}</p>
    <p>Lieu : ${esc(String(s.lieu || "non précisé"))}</p>
  </div>
 
  ${jours.map(tableJour).join("")}
 
  <div class="no-print">
    <button onclick="window.print()" style="background:#25245e;color:#fff;border:none;padding:10px 20px;border-radius:6px;font-weight:bold;cursor:pointer;">🖨️ Imprimer / Enregistrer en PDF</button>
  </div>
  <div class="footer">Document généré par QualioFlex — ${esc(org.raison_sociale || "")}</div>
</body>
</html>`;
 
    // IMPORTANT : pas de .upsert(onConflict:"session_id,type") — l'index unique sur
    // (session_id, type) est PARTIEL (WHERE session_id IS NOT NULL) et PostgREST ne
    // sait pas l'utiliser comme cible ON CONFLICT (erreur 42P10, avalée jusqu'ici par
    // un simple console.error qui ne faisait jamais échouer la requête). SELECT puis
    // INSERT/UPDATE explicite à la place.
    const { data: existingDoc } = await supabase
      .from("documents_formation")
      .select("id")
      .eq("session_id", session_id)
      .eq("type", "emargement")
      .maybeSingle();
 
    const docPayload = {
      formation_id: s.formation_id,
      session_id,
      type: "emargement",
      nom_fichier: `emargement_${session_id}.html`,
      genere_par: "auto",
      contenu_html: html,
      updated_at: new Date().toISOString(),
    };
 
    const { error: saveErr } = existingDoc
      ? await supabase.from("documents_formation").update(docPayload).eq("id", existingDoc.id)
      : await supabase.from("documents_formation").insert(docPayload);
 
    if (saveErr) {
      console.error("generer-emargement: erreur sauvegarde:", saveErr.message);
      throw new Error("Échec de la sauvegarde de l'émargement : " + saveErr.message);
    }
 
    return new Response(
      JSON.stringify({ success: true, contenu_html: html }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
 
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("generer-emargement: ERREUR FATALE:", msg, err instanceof Error ? err.stack : "");
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
