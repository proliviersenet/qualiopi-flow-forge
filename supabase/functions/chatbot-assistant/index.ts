import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { KNOWLEDGE_BASE, ONBOARDING_STEPS_FORMATEUR, ONBOARDING_STEPS_CLIENT } from "./knowledge-base.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ESCALADE_RE = /\[ESCALADE:?\s*([^\]]*)\]\s*$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { message, conversation_id } = await req.json();
    if (!message || typeof message !== "string") throw new Error("message requis");

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");

    // Client "identité" : respecte le JWT de l'appelant, sert uniquement à savoir QUI pose la question.
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // Important : getUser() sans argument s'appuie sur la session interne du client (vide ici),
    // PAS sur le header global — il faut lui passer explicitement le JWT de l'appelant.
    const { data: { user }, error: userErr } = await authClient.auth.getUser(jwt);
    if (userErr || !user) throw new Error("Utilisateur non authentifié");

    // Client "service" : accès complet en base pour lire/écrire les conversations (RLS gérée ici, pas par Postgres).
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const isClient = user.user_metadata?.role === "client";
    let organismeId: string | null = null;
    let clientId: string | null = null;
    let organisme: Record<string, unknown> | null = null;
    let contextInfo = "";

    if (isClient) {
      const { data: clientRow } = await supabase
        .from("clients")
        .select("id, organisme_id, raison_sociale, onboarding_complete")
        .eq("contact_email", user.email)
        .single();
      if (!clientRow) throw new Error("Fiche client introuvable pour cet utilisateur");
      clientId = clientRow.id as string;
      organismeId = clientRow.organisme_id as string;
      contextInfo = `L'utilisateur est un CLIENT (entreprise "${clientRow.raison_sociale ?? "—"}"), il consulte son Espace client.`;
    } else {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organisme_id, nom_complet")
        .eq("id", user.id)
        .single();
      if (!profile?.organisme_id) throw new Error("Profil formateur introuvable ou organisme non configuré");
      organismeId = profile.organisme_id as string;

      const { data: org } = await supabase
        .from("organismes")
        .select("raison_sociale, siret, nda, forme_juridique")
        .eq("id", organismeId)
        .single();
      organisme = org ?? null;

      const [{ count: nbFormations }, { count: nbClients }] = await Promise.all([
        supabase.from("formations").select("*", { count: "exact", head: true }).eq("organisme_id", organismeId),
        supabase.from("clients").select("*", { count: "exact", head: true }).eq("organisme_id", organismeId),
      ]);

      const profilIncomplet = !organisme?.siret || !organisme?.nda;
      contextInfo = `L'utilisateur est un FORMATEUR (${profile.nom_complet ?? user.email}) de l'organisme "${organisme?.raison_sociale ?? "—"}". ` +
        `Profil organisme ${profilIncomplet ? "INCOMPLET (SIRET ou NDA manquant)" : "complet"}. ` +
        `${nbFormations ?? 0} formation(s) créée(s), ${nbClients ?? 0} client(s) créé(s) — ` +
        `${(nbFormations ?? 0) === 0 && (nbClients ?? 0) === 0 ? "c'est un tout nouvel utilisateur, priorité à l'on-boarding." : "utilisateur déjà actif, réponds directement à sa question sans repartir de zéro."}`;
    }

    // Récupérer ou créer la conversation
    let convId = conversation_id as string | undefined;
    if (convId) {
      const { data: conv } = await supabase
        .from("chatbot_conversations")
        .select("id, user_id")
        .eq("id", convId)
        .single();
      if (!conv || conv.user_id !== user.id) convId = undefined; // conversation invalide ou pas la sienne
    }
    if (!convId) {
      const { data: newConv, error: convErr } = await supabase
        .from("chatbot_conversations")
        .insert({
          organisme_id: organismeId,
          user_id: user.id,
          role_context: isClient ? "client" : "formateur",
          client_id: clientId,
        })
        .select("id")
        .single();
      if (convErr || !newConv) throw new Error("Impossible de créer la conversation: " + convErr?.message);
      convId = newConv.id as string;
    }

    // Historique (20 derniers messages) pour donner du contexte à Qualios
    const { data: history } = await supabase
      .from("chatbot_messages")
      .select("role, content")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true })
      .limit(20);

    // Sauvegarder le message utilisateur
    await supabase.from("chatbot_messages").insert({ conversation_id: convId, role: "user", content: message });

    const steps = isClient ? ONBOARDING_STEPS_CLIENT : ONBOARDING_STEPS_FORMATEUR;
    const systemPrompt = `Tu es Qualios, l'assistant IA de QalioFlex : un chatbot de support niveau 1 (SAV) et
d'accompagnement à la prise en main (on-boarding), intégré directement dans l'application QalioFlex utilisée par des
organismes de formation professionnelle (formateurs) et leurs clients (entreprises). Ton identité visuelle est un
petit phénix mignon aux couleurs de QalioFlex (indigo et orange) : tu incarnes un assistant sympathique, rassurant
et un peu malicieux, jamais froid ni robotique.

${KNOWLEDGE_BASE}

## Contexte de cette conversation
${contextInfo}

Étapes d'on-boarding typiques pour ce profil (à mentionner UNIQUEMENT si pertinent, jamais en liste imposée) :
${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

## Ton et format de réponse
- Toujours en français.
- Tu peux te présenter comme "Qualios" au tout début d'une conversation, mais ne répète pas ton nom à chaque
  message — reste naturel, comme un collègue qu'on connaît déjà.
- Ton professionnel mais accessible et chaleureux, direct, pas de jargon inutile — comme un collègue qui
  connaît l'appli par cœur, pas comme un robot de FAQ.
- Réponses COURTES et synthétiques (quelques phrases, façon message plutôt qu'article). Pas de longues listes
  à puces sauf si vraiment nécessaire pour une procédure en plusieurs étapes.
- Tu peux utiliser 1 emoji maximum si ça sert la clarté, jamais plus.
- IMPORTANT : n'utilise JAMAIS de syntaxe markdown (pas d'astérisques **gras**, pas de dièses #titre, pas de
  tirets de liste -). L'interface affiche du texte brut : écris en phrases normales, avec des numéros suivis
  d'un point (1. 2. 3.) si une procédure en plusieurs étapes est vraiment nécessaire.
- Ne mentionne jamais que tu es "Claude" ou un modèle d'IA générique : tu es "Qualios, l'assistant QalioFlex".

## Escalade vers Olivier (niveau 2)
Si la question sort de ce que tu sais avec certitude d'après cette base de connaissance, ou concerne :
facturation/abonnement/résiliation, un bug technique précis à corriger, une garantie juridique sur la
conformité Qualiopi, ou toute demande sensible — réponds quand même brièvement et avec empathie, PUIS termine
ta réponse par une ligne strictement au format : [ESCALADE: raison très courte]
N'utilise ce tag QUE quand une intervention humaine est vraiment nécessaire — pas pour une simple question
sur le fonctionnement de l'app à laquelle la base de connaissance répond déjà.`;

    const messages = [
      ...((history ?? []) as { role: string; content: string }[]).map(h => ({ role: h.role, content: h.content })),
      { role: "user", content: message },
    ];

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 700,
        system: systemPrompt,
        messages,
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      throw new Error(`Claude API error: ${err}`);
    }

    const claudeData = await claudeRes.json();
    let reply: string = claudeData.content?.[0]?.text || "Désolé, je n'ai pas pu générer de réponse.";

    let escalated = false;
    const m = reply.match(ESCALADE_RE);
    if (m) {
      escalated = true;
      const raison = (m[1] || "non précisée").trim();
      reply = reply.replace(ESCALADE_RE, "").trim();
      reply += "\n\n📩 Je transmets ta question à Olivier, il revient vers toi rapidement par email.";

      await supabase.from("chatbot_conversations").update({ statut: "escaladee", updated_at: new Date().toISOString() }).eq("id", convId);

      if (BREVO_API_KEY) {
        const qui = isClient
          ? `Client — ${user.email}`
          : `Formateur — ${user.email}`;
        const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#25245e;padding:20px 30px;border-radius:8px 8px 0 0;">
    <h1 style="color:#fff;margin:0;font-size:18px;">QalioFlex — Escalade Qualios (chatbot SAV)</h1>
  </div>
  <div style="background:#fff;border:1px solid #eee;padding:24px;border-radius:0 0 8px 8px;">
    <p><strong>${qui}</strong></p>
    <p><strong>Raison :</strong> ${raison}</p>
    <p><strong>Dernier message :</strong> ${message}</p>
    <p><strong>Réponse de Qualios :</strong> ${reply}</p>
    <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
    <p style="font-size:12px;color:#888;">Conversation #${convId}</p>
  </div>
</body></html>`;
        try {
          await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({
              sender: { name: "QalioFlex — Qualios (chatbot SAV)", email: "olivier@exsenco.fr" },
              to: [{ email: "olivier@exsenco.fr", name: "Olivier" }],
              subject: `[QalioFlex] Escalade Qualios — ${qui}`,
              htmlContent: html,
            }),
          });
        } catch (mailErr) {
          console.error("Erreur envoi email escalade:", mailErr);
        }
      }
    }

    await supabase.from("chatbot_messages").insert({ conversation_id: convId, role: "assistant", content: reply });
    await supabase.from("chatbot_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);

    return new Response(
      JSON.stringify({ reply, conversation_id: convId, escalated }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
