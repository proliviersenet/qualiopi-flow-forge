// ============================================================================
// QUALIFLOW — Edge Function Webhook DocuSign
// Fichier a deployer dans : supabase/functions/docusign-webhook/index.ts
// Recoit les notifications DocuSign (signe, refuse, expire) et met a jour
// automatiquement la table signatures + documents + checklist Qualiopi.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Mapping des statuts DocuSign vers nos statuts internes
// (cf. contrainte signatures_statut_check dans schema_qualiflow_v2.sql)
const STATUT_MAP: Record<string, string> = {
  sent: "en_attente",
  delivered: "en_attente",
  completed: "signe",
  declined: "refuse",
  voided: "expire",
};

serve(async (req: Request) => {
  try {
    const payload = await req.json();

    const envelopeId: string | undefined = payload?.data?.envelopeId ?? payload?.envelopeId;
    const docusignStatus: string | undefined =
      payload?.data?.envelopeSummary?.status ?? payload?.status;

    if (!envelopeId || !docusignStatus) {
      return new Response(
        JSON.stringify({ error: "Payload webhook incomplet" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const statutInterne = STATUT_MAP[docusignStatus] ?? "en_attente";

    // 1. Mise a jour de la signature
    const { data: signatureRow, error: sigError } = await supabase
      .from("signatures")
      .update({ statut: statutInterne, updated_at: new Date().toISOString() })
      .eq("provider_signature_request_id", envelopeId)
      .select("document_id")
      .single();

    if (sigError) throw new Error(`Erreur mise a jour signature: ${sigError.message}`);

    // 2. Si signe, on met aussi le document a "pret" (preuve disponible pour audit)
    if (statutInterne === "signe" && signatureRow?.document_id) {
      const { error: docError } = await supabase
        .from("documents")
        .update({ statut: "pret", updated_at: new Date().toISOString() })
        .eq("id", signatureRow.document_id);

      if (docError) throw new Error(`Erreur mise a jour document: ${docError.message}`);

      // 3. Verifie si la session peut etre debloquee (tous documents signes)
      const { data: doc } = await supabase
        .from("documents")
        .select("session_id")
        .eq("id", signatureRow.document_id)
        .single();

      if (doc?.session_id) {
        const { data: docsRestants } = await supabase
          .from("documents")
          .select("id, statut, type")
          .eq("session_id", doc.session_id)
          .in("type", ["convention", "emargement", "attestation"]);

        const tousComplets = docsRestants?.every((d) => d.statut === "pret") ?? false;

        if (tousComplets) {
          await supabase
            .from("sessions")
            .update({ cloture_bloquee: false, updated_at: new Date().toISOString() })
            .eq("id", doc.session_id);
        }
      }
    }

    // 4. Si refuse ou expire, on log pour relance manuelle du formateur
    if (statutInterne === "refuse" || statutInterne === "expire") {
      await supabase.from("api_logs").insert({
        source: "yousign", // valeur generique de log, le champ provider reel est dans signatures
        endpoint: "docusign-webhook",
        payload: { envelope_id: envelopeId, statut: docusignStatus },
        status_code: 200,
      });
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erreur docusign-webhook:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erreur inconnue" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
