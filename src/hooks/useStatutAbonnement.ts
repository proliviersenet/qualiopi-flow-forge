import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Chantier facturation, lot 2 (12/11/2026) : statut d'abonnement de
// l'organisme du formateur connecté, calculé côté base par la fonction
// mon_statut_abonnement() (interrupteur de facturation, exemption
// ambassadeur, statut Stripe synchronisé par le webhook).
//
// acces_requis = true uniquement quand la facturation est activée pour cet
// organisme ET qu'aucun abonnement n'est en cours ET que le compte n'est pas
// exempté. Tant que l'interrupteur global est coupé (bêta), il vaut toujours
// false : aucun formateur n'est concerné.

export type StatutAbonnement = {
  organisme_id: string | null;
  facturation_active: boolean;
  statut: "aucun" | "essai" | "actif" | "impaye" | "coupe" | "resiliation_programmee" | "resilie" | "suspendu" | "exempte";
  type_compte?: "standard" | "super_ambassadeur";
  fin_essai?: string | null;
  resiliation_effective_le?: string | null;
  coupure_prevue_le?: string | null;
  a_un_moyen_de_paiement?: boolean;
  acces_requis: boolean;
};

export const useStatutAbonnement = () => {
  const { session, loading: authLoading } = useAuth();
  const [statut, setStatut] = useState<StatutAbonnement | null>(null);
  const [loading, setLoading] = useState(true);

  const role = session?.user?.user_metadata?.role;

  const rafraichir = useCallback(async (): Promise<StatutAbonnement | null> => {
    if (!session || role === "client") {
      setStatut(null);
      setLoading(false);
      return null;
    }
    const { data, error } = await supabase.rpc("mon_statut_abonnement");
    setLoading(false);
    if (error) {
      // Par prudence, une erreur de lecture ne bloque jamais l'accès.
      console.error("mon_statut_abonnement:", error);
      setStatut(null);
      return null;
    }
    setStatut(data as StatutAbonnement);
    return data as StatutAbonnement;
  }, [session, role]);

  useEffect(() => {
    if (authLoading) return;
    rafraichir();
  }, [authLoading, rafraichir]);

  return { statut, loading: loading || authLoading, rafraichir };
};
