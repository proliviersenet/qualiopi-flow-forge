import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Chantier "sous-traitance" (28/08) : appelée par Register.tsx juste après la création
// du compte formateur (auth.signUp + insert organismes + upsert profiles), quand
// l'inscription vient d'un lien d'invitation /register?st=<token>. Rattache la session
// au nouveau compte (statut 'actif') et prévient le formateur qui a sous-traité.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ error: "token requis" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userErr } = await authClient.auth.getUser(jwt);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Utilisateur non authentifié" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: invitation, error: invErr } = await supabase
      .from("sessions_sous_traitance")
      .select("id, session_id, email_invite, organisme_demandeur_id")
      .eq("token", token)
      .eq("statut", "invite")
      .gte("expires_at", new Date().toISOString())
      .single();

    if (invErr || !invitation) {
      return new Response(JSON.stringify({ error: "Invitation invalide ou expirée." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if ((invitation.email_invite || "").toLowerCase() !== (user.email || "").toLowerCase()) {
      return new Response(
        JSON.stringify({ error: "Cette invitation a été envoyée à une autre adresse email." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: monProfil } = await supabase.from("profiles").select("organisme_id").eq("id", user.id).maybeSingle();
    if (!monProfil?.organisme_id) {
      return new Response(JSON.stringify({ error: "Votre espace formateur n'est pas encore complet." }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: updated, error: updErr } = await supabase
      .from("sessions_sous_traitance")
      .update({
        statut: "actif",
        profile_sous_traitant_id: user.id,
        organisme_sous_traitant_id: monProfil.organisme_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invitation.id)
      .select("*, session:session_id(formation:formation_id(titre))")
      .single();
    if (updErr) throw updErr;

    // Notification non bloquante au formateur qui a sous-traité.
    try {
      const { data: orgDemandeur } = await supabase.from("organismes").select("raison_sociale, email_contact").eq("id", invitation.organisme_demandeur_id).maybeSingle();
      const formationTitre = (updated.session as unknown as { formation?: { titre?: string } } | null)?.formation?.titre || "la formation";
      if (orgDemandeur?.email_contact) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "QualioFlex <noreply@qualioflex.fr>",
            to: [orgDemandeur.email_contact],
            subject: `Votre sous-traitant a créé son espace QualioFlex`,
            html: `<p>Le formateur invité pour <strong>${formationTitre}</strong> a créé son espace et a désormais accès à la session.</p>`,
          }),
        });
      }
    } catch (notifErr) {
      console.error("Erreur notification lier-soustraitance (non bloquante):", notifErr);
    }

    return new Response(JSON.stringify({ success: true, sous_traitance: updated }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Erreur lier-soustraitance:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erreur interne" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
