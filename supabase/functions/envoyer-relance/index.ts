import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";

  try {
    const body = await req.json();
    const { prenom, nom, email } = body;

    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { name: "QalioFlex", email: "olivier@exsenco.fr" },
        to: [{ email: email || "olivier.senet@prospactive.com", name: `${prenom || "Test"} ${nom || ""}` }],
        subject: "[QalioFlex] Test relance",
        textContent: `Bonjour ${prenom || "Test"}, ceci est un test de relance QalioFlex.`,
      }),
    });

    const rb = await r.text();

    // Toujours 200 pour voir la réponse
    return new Response(
      JSON.stringify({ brevo_status: r.status, brevo_ok: r.ok, brevo_body: rb, api_key_present: BREVO_API_KEY.length > 0 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ crash: String(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
