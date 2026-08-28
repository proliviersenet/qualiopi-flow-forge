import { supabase } from "@/integrations/supabase/client";

// Chantier "superadmin" (28/08) : point d'entrée unique pour enregistrer un bug
// (auto via ErrorBoundary/handler global, ou manuel via SignalerBugButton).
// Insert direct côté client — la table "bugs" a une policy RLS ouverte en
// INSERT pour les utilisateurs authentifiés sur leur propre user_id (voir
// migration superadmin_bugs_abonnements). Best-effort : ne doit jamais faire
// planter l'appelant (en particulier un gestionnaire de crash lui-même).
export async function logBug(params: {
  source: "auto" | "manuel";
  type?: string;
  message: string;
  stack?: string;
}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? null;
    const userEmail = session?.user?.email ?? null;
    const role = (session?.user?.user_metadata?.role as string | undefined) ?? "formateur";

    await supabase.from("bugs").insert({
      source: params.source,
      type: params.type || "non_precise",
      message: params.message.slice(0, 2000),
      stack: params.stack ? params.stack.slice(0, 4000) : null,
      page_url: typeof window !== "undefined" ? window.location.href : null,
      user_id: userId,
      user_email: userEmail,
      role,
    });
  } catch {
    // Silencieux : un échec de log de bug ne doit jamais aggraver le problème initial.
  }
}
