import { FunctionsHttpError } from "@supabase/supabase-js";

// Bug corrigé le 20/08/2026 : sur toutes les pages publiques à token
// (positionnement, évaluation, émargement, support, livret, attestation), quand
// l'Edge Function renvoie un statut non-2xx avec un corps JSON {error: "message
// clair pour le stagiaire"}, supabase-js ne lit PAS ce corps automatiquement —
// `data` reste null et `error` est une FunctionsHttpError dont le message par
// défaut est le générique "Edge Function returned a non-2xx status code", pas le
// message métier qu'on a pris soin d'écrire côté Edge Function (ex. "Lien
// invalide ou expiré.", "Le livret n'est pas encore disponible..."). Ce helper
// va chercher le vrai message dans le corps de la réponse HTTP (err.context),
// avec repli sur un message générique si le corps n'est pas du JSON exploitable.
export async function extractFunctionErrorMessage(
  err: unknown,
  fallback = "Une erreur est survenue."
): Promise<string> {
  if (err instanceof FunctionsHttpError) {
    try {
      const body = await err.context.clone().json();
      if (body?.error) return body.error as string;
    } catch {
      // Corps non-JSON, vide, ou déjà consommé : on retombe sur le message générique.
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
