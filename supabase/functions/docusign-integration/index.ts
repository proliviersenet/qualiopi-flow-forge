// ============================================================================
// QUALIFLOW — Edge Function DocuSign
// Fichier a deployer dans : supabase/functions/docusign-integration/index.ts
// Deploiement : supabase functions deploy docusign-integration
//
// Variables d'environnement requises (Supabase Dashboard > Edge Functions > Secrets) :
//   DOCUSIGN_INTEGRATION_KEY   = dbc125da-0b6b-46d8-aa3e-ff348aafe9da
//   DOCUSIGN_API_ACCOUNT_ID    = a5d1bca6-d904-41b5-ba57-13e33b0ca01f
//   DOCUSIGN_USER_ID           = e484eee4-d3ee-4557-8c9d-a9f504b9e9d4
//   DOCUSIGN_PRIVATE_KEY       = (la cle privee RSA complete, avec les lignes
//                                 -----BEGIN RSA PRIVATE KEY----- ... -----END...)
//   DOCUSIGN_BASE_URL          = https://demo.docusign.net  (sandbox)
//                                 -> deviendra https://eu.docusign.net en production
//   DOCUSIGN_AUTH_URL          = https://account-d.docusign.com (sandbox)
//                                 -> deviendra https://account.docusign.com en production
//   SUPABASE_SERVICE_ROLE_KEY  = (la cle secrete sb_secret_... mise de cote precedemment)
//   SUPABASE_URL               = https://cvgosywcwqmsegdgjpqp.supabase.co
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create as createJWT, getNumericDate } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DOCUSIGN_BASE_URL = Deno.env.get("DOCUSIGN_BASE_URL") ?? "https://demo.docusign.net";
const DOCUSIGN_AUTH_URL = Deno.env.get("DOCUSIGN_AUTH_URL") ?? "https://account-d.docusign.com";
const INTEGRATION_KEY = Deno.env.get("DOCUSIGN_INTEGRATION_KEY")!;
const API_ACCOUNT_ID = Deno.env.get("DOCUSIGN_API_ACCOUNT_ID")!;
const IMPERSONATED_USER_ID = Deno.env.get("DOCUSIGN_USER_ID")!;
const PRIVATE_KEY_PEM = Deno.env.get("DOCUSIGN_PRIVATE_KEY")!;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ----------------------------------------------------------------------------
// 1. Authentification JWT -> obtention d'un access_token DocuSign
// ----------------------------------------------------------------------------
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/, "")
    .replace(/-----END (RSA )?PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function getDocuSignAccessToken(): Promise<string> {
  const key = await importPrivateKey(PRIVATE_KEY_PEM);

  const jwt = await createJWT(
    { alg: "RS256", typ: "JWT" },
    {
      iss: INTEGRATION_KEY,
      sub: IMPERSONATED_USER_ID,
      aud: new URL(DOCUSIGN_AUTH_URL).hostname,
      iat: getNumericDate(0),
      exp: getNumericDate(3600),
      scope: "signature impersonation",
    },
    key
  );

  const resp = await fetch(`${DOCUSIGN_AUTH_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Echec auth DocuSign: ${resp.status} ${errText}`);
  }

  const data = await resp.json();
  return data.access_token;
}

// ----------------------------------------------------------------------------
// 2. Envoi d'un document pour signature (enveloppe DocuSign)
// ----------------------------------------------------------------------------
interface SignerInput {
  nom: string;
  email: string;
  ordre: number; // ordre de signature (1 = signe en premier)
  ancre?: string; // texte-ancre optionnel dans le PDF pour ce signataire (plusieurs zones de signature distinctes ; défaut "/signature/")
}

async function envoyerPourSignature(params: {
  accessToken: string;
  pdfBase64: string;
  nomDocument: string;
  signataires: SignerInput[];
  documentId: string; // notre id interne, pour le webhook de retour
}): Promise<{ envelopeId: string }> {
  const { accessToken, pdfBase64, nomDocument, signataires, documentId } = params;

  const signers = signataires.map((s) => ({
    email: s.email,
    name: s.nom,
    recipientId: String(s.ordre),
    routingOrder: String(s.ordre),
    tabs: {
      signHereTabs: [
        {
          anchorString: s.ancre || "/signature/",
          anchorUnits: "pixels",
          anchorXOffset: "0",
          anchorYOffset: "0",
        },
      ],
    },
  }));

  const envelope = {
    emailSubject: `QualiFlow — Signature requise : ${nomDocument}`,
    documents: [
      {
        documentBase64: pdfBase64,
        name: nomDocument,
        fileExtension: "pdf",
        documentId: "1",
      },
    ],
    recipients: { signers },
    status: "sent",
    // Webhook de notification : DocuSign appellera notre fonction a chaque
    // changement de statut (envoye, signe, refuse, expire)
    eventNotification: {
      url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/docusign-webhook`,
      requireAcknowledgment: "true",
      envelopeEvents: [
        { envelopeEventStatusCode: "sent" },
        { envelopeEventStatusCode: "delivered" },
        { envelopeEventStatusCode: "completed" },
        { envelopeEventStatusCode: "declined" },
        { envelopeEventStatusCode: "voided" },
      ],
    },
  };

  const resp = await fetch(
    `${DOCUSIGN_BASE_URL}/restapi/v2.1/accounts/${API_ACCOUNT_ID}/envelopes`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(envelope),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Echec envoi enveloppe DocuSign: ${resp.status} ${errText}`);
  }

  const data = await resp.json();
  return { envelopeId: data.envelopeId };
}

// ----------------------------------------------------------------------------
// 3. Point d'entree HTTP de la fonction
// ----------------------------------------------------------------------------
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { document_id, pdf_base64, nom_document, signataires } = await req.json();

    if (!document_id || !pdf_base64 || !signataires?.length) {
      return new Response(
        JSON.stringify({ error: "Parametres manquants : document_id, pdf_base64, signataires" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = await getDocuSignAccessToken();

    const { envelopeId } = await envoyerPourSignature({
      accessToken,
      pdfBase64: pdf_base64,
      nomDocument: nom_document ?? "Document Qualiopi",
      signataires,
      documentId: document_id,
    });

    // Enregistrement dans la table signatures (cf. schema_qualiflow_v2.sql)
    const { error: dbError } = await supabase.from("signatures").insert({
      document_id,
      provider: "docusign",
      statut: "en_attente",
      signers: signataires,
      provider_signature_request_id: envelopeId,
    });

    if (dbError) throw new Error(`Erreur enregistrement signature: ${dbError.message}`);

    return new Response(
      JSON.stringify({ success: true, envelope_id: envelopeId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Erreur docusign-integration:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erreur inconnue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
