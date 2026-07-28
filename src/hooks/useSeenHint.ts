import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Mémorise, par utilisateur connecté, si une popup d'aide contextuelle donnée
// (tour de bienvenue, aide BPF, aide préparation d'audit...) a déjà été vue —
// via la table générique `ui_hints_seen` (user_id, hint_key). Une fois vue,
// elle ne se réaffiche plus jamais automatiquement.
//
// `seen` vaut `null` tant que l'état n'est pas encore chargé (pour éviter un
// flash d'affichage avant qu'on sache si le hint a déjà été vu), puis `true`
// ou `false`.
//
// L'utilisateur vient du contexte d'authentification partagé (AuthContext) —
// une seule vérification de session pour toute l'appli — plutôt que d'un
// nouvel appel réseau indépendant à chaque composant qui utilise ce hook.
export const useSeenHint = (hintKey: string | null) => {
  const { user } = useAuth();
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    if (!hintKey) return;
    if (!user) { setSeen(true); return; } // pas connecté : ne rien afficher
    let cancelled = false;

    const load = async () => {
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
  }, [hintKey, user]);

  const markSeen = useCallback(async () => {
    if (!hintKey) return;
    setSeen(true);
    if (!user) return;
    await supabase.from("ui_hints_seen").upsert({ user_id: user.id, hint_key: hintKey });
  }, [hintKey, user]);

  return { seen, markSeen };
};
