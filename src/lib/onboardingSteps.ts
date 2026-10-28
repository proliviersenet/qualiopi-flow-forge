import { supabase } from "@/integrations/supabase/client";

export interface ChecklistItem {
  /**
   * Identifiant stable de l'étape, qui doit correspondre à l'attribut
   * data-onboarding="<id>" posé sur l'élément réel de l'interface (bouton,
   * champ...) que cette étape désigne. Absent pour les étapes purement
   * informatives (pas d'action concrète à pointer) ou qui n'ont pas
   * d'élément unique à désigner — dans ce cas l'étape reste visible dans la
   * checklist complète (OnboardingChecklist) mais n'est jamais ciblée par
   * les bulles contextuelles (OnboardingSpotlight).
   */
  id?: string;
  label: string;
  href: string;
  /** Étape purement informative (pas de suivi de complétion — pas de coche). */
  info?: boolean;
  done: boolean;
}

// Chargeurs partagés entre le popup de bienvenue (OnboardingChecklist, vue
// d'ensemble avec progression) et les bulles contextuelles pas-à-pas
// (OnboardingSpotlight, une étape à la fois directement sur l'écran
// concerné) — même source de vérité pour ne jamais désynchroniser les deux
// affichages.
export async function loadFormateurItems(userId: string): Promise<ChecklistItem[] | null> {
  const { data: profile } = await supabase.from("profiles").select("organisme_id").eq("id", userId).single();
  if (!profile?.organisme_id) return null;
  const orgId = profile.organisme_id;

  const [{ data: org }, { count: nbFormations }, { count: nbClients }, { data: bpfHint }] = await Promise.all([
    supabase.from("organismes").select("siret, nda, raison_sociale, adresse, logo_url").eq("id", orgId).single(),
    supabase.from("formations").select("*", { count: "exact", head: true }).eq("organisme_id", orgId),
    supabase.from("clients").select("*", { count: "exact", head: true }).eq("organisme_id", orgId),
    supabase.from("ui_hints_seen").select("hint_key").eq("user_id", userId).eq("hint_key", "bpf_intro").maybeSingle(),
  ]);

  return [
    {
      id: "profil-infos",
      label: "Compléter le profil de ton organisme (raison sociale, SIRET, NDA, adresse)",
      href: "/profile",
      done: !!(org?.siret && org?.nda && org?.raison_sociale && org?.adresse),
    },
    { id: "profil-logo", label: "Charger le logo de ton organisme", href: "/profile", done: !!org?.logo_url },
    { id: "creer-formation", label: "Créer ta première formation", href: "/formations/creation", done: (nbFormations ?? 0) > 0 },
    { id: "inviter-client", label: "Inviter ton premier client", href: "/clients", done: (nbClients ?? 0) > 0 },
    { id: "bpf-nav", label: "Découvrir le module BPF (déclaration annuelle DREETS)", href: "/bpf", done: !!bpfHint },
  ];
}

export async function loadClientItems(email: string): Promise<ChecklistItem[] | null> {
  const { data: client } = await supabase.from("clients").select("id").eq("contact_email", email).single();
  if (!client?.id) return null;

  const { data: sessions } = await supabase.from("sessions").select("id").eq("client_id", client.id);
  const sessionIds = (sessions ?? []).map((s: { id: string }) => s.id);

  let hasStagiaires = false;
  let hasSignedConvention = false;

  if (sessionIds.length > 0) {
    const { count } = await supabase
      .from("stagiaires")
      .select("*", { count: "exact", head: true })
      .in("session_id", sessionIds);
    hasStagiaires = (count ?? 0) > 0;

    const { data: docs } = await supabase
      .from("documents_formation")
      .select("id")
      .eq("type", "convention")
      .in("session_id", sessionIds);
    const docIds = (docs ?? []).map((d: { id: string }) => d.id);

    if (docIds.length > 0) {
      const { data: sigs } = await supabase
        .from("signatures")
        .select("statut")
        .in("document_id", docIds)
        .eq("statut", "signe");
      hasSignedConvention = (sigs?.length ?? 0) > 0;
    }
  }

  return [
    // Pas d'id : simple constat (sessions déjà visibles dès qu'elles existent,
    // pas une action à pointer) — reste dans la checklist complète uniquement.
    { label: "Découvrir tes sessions de formation dans ton espace client", href: "/espace-client", done: sessionIds.length > 0 },
    { id: "client-convention", label: "Signer la convention de formation envoyée par ton formateur", href: "/espace-client", done: hasSignedConvention },
    { id: "client-stagiaires-import", label: "Importer la liste de tes stagiaires (prénom, nom, mobile, email)", href: "/espace-client", done: hasStagiaires },
    { label: "Retrouver l'émargement, les évaluations et l'attestation en fin de formation", href: "/espace-client", info: true, done: false },
  ];
}
