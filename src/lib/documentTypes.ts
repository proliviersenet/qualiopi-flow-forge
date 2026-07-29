// Source de vérité UNIQUE pour le vocabulaire des questionnaires/évaluations stagiaire
// (chaud / formateur / à froid). Avant ce fichier, la même liste était recopiée à
// l'identique dans StagiairesList.tsx (EVAL_TYPES_LIST) ET FormationDetail.tsx
// (EVAL_TYPES) — deux copies qui pouvaient diverger si l'une était modifiée sans
// l'autre (audit vocabulaire, juillet 2026).
//
// Reste volontairement HORS de ce fichier (pas unifié pour l'instant, cf. audit) :
// - Les libellés de `documents_formation.type` (support/programme/livret/emargement/
//   devis/convention/attestation/trame_pedagogique/devis_generique) : mécanisme de
//   stockage différent (table dédiée, pas des colonnes stagiaires), pas de risque de
//   divergence identifié — laissé tel quel.
// - Les phrases d'action de l'edge function `envoyer-relance` (motifAction) : ce sont
//   des tournures verbales pour le corps d'email ("signer votre..."), pas des libellés
//   d'UI — la ré-écrire ne changerait d'ailleurs rien tant que la fonction n'est pas
//   redéployée (aucun accès Supabase CLI/token dans l'environnement de dev). Les CLÉS
//   (chaud/formateur/froid/etc.) déjà utilisées dans ce fichier restent les mêmes que
//   ci-dessous, donc pas de rupture — juste une 2e copie des libellés, acceptée pour
//   l'instant.
// - Le vocabulaire de statut (`doc_*` = envoye/signe/erreur vs `signatures.statut` =
//   en_attente/signe/refuse/expire) : unifier ça toucherait des données déjà en base,
//   ça nécessite une vraie migration SQL — pas fait ici.

export type EvalType = "chaud" | "formateur" | "froid";

export interface EvalTypeDef {
  key: EvalType;
  icon: string;
  label: string;
  desc: string;
}

export const EVAL_TYPES: EvalTypeDef[] = [
  { key: "chaud", icon: "🔥", label: "Évaluation à chaud", desc: "Envoyée au stagiaire juste après la fin de la formation." },
  { key: "formateur", icon: "🧑‍🏫", label: "Évaluation du formateur", desc: "Porte spécifiquement sur l'animateur de la formation." },
  { key: "froid", icon: "📈", label: "Évaluation à froid (J+90)", desc: "Envoyée environ 90 jours après la formation, mesure l'impact sur le poste." },
];
