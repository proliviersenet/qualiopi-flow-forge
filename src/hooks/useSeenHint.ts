import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Mémorise, par utilisateur connecté, si une popup d'aide contextuelle donnée
// (tour de bienvenue, aide BPF, aide préparation d'audit...) a déjà été vue —
// via la table générique `ui_hints_seen` (user_id, hint_key). Une fois vue,
// elle ne se réaffiche plus jamais automatiquement.
//
// `seen` vaut `null` tant que l'état n'est pas encore chargé (pour éviter un
// flash d'affichage avant qu'on sache si le hint a déjà été vu), puis `true`
// ou `false`.
//
// On utilise getSession() (lecture locale, quasi instantanée) plutôt que
// getUser() (qui force un aller-retour réseau de revalidation à chaque appel)
// pour éviter de multiplier les appels d'authentification concurrents au
// chargement d'une page — plusieurs composants (widget de chat, checklist
// d'onboarding, popups d'aide) vérifient chacun la session de leur côté.
export const useSeenHint = (hintKey: string | null) => {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    if (!hintKey) return;
    let cancelled = false;

    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { if (!cancelled) setSeen(true); return; } // pas connecté : ne rien afficher
      const { data } = await supabase
        .from("ui_hints_seen")
        .select("hint_key")
        .eq("user_id", user.id)
        .eq("hint_key", hintKey)
        .maybeSingle();
      if (!cancelled) setSeen(!!data);
    };

    load();
    return () => { cancelled = true; };
  }, [hintKey]);

  const markSeen = useCallback(async () => {
    if (!hintKey) return;
    setSeen(true);
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;
    await supabase.from("ui_hints_seen").upsert({ user_id: user.id, hint_key: hintKey });
  }, [hintKey]);

  return { seen, markSeen };
};
