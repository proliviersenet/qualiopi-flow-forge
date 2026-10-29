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

export type EvalType = "chaud" | "formateur" | "froid" | "acquis";

export interface EvalTypeDef {
  key: EvalType;
  icon: string;
  label: string;
  desc: string;
}

// "acquis" (ajouté 05/10/2026, référentiel V10 — indicateur 33, nouveau) : seul type
// qui n'est PAS une notation de satisfaction 0-4. C'est un QCM à bonnes/mauvaises
// réponses qui mesure réellement ce que le stagiaire a retenu de la formation,
// distinct par nature des 3 autres (chaud/formateur/froid = ressenti). Stocké et
// transporté par le même mécanisme (token public, evaluation_questions,
// evaluation-public) mais avec une forme de données différente — cf. FormationDetail.tsx,
// EvaluationPublic.tsx et evaluation-public/index.ts qui testent `et.key === "acquis"`
// pour brancher sur l'UI/logique QCM plutôt que sur la notation par étoiles.
export const EVAL_TYPES: EvalTypeDef[] = [
  { key: "chaud", icon: "🔥", label: "Évaluation à chaud", desc: "Envoyée au stagiaire juste après la fin de la formation." },
  { key: "formateur", icon: "🧑‍🏫", label: "Évaluation du formateur", desc: "Porte spécifiquement sur l'animateur de la formation." },
  { key: "froid", icon: "📈", label: "Évaluation à froid (J+90)", desc: "Envoyée environ 90 jours après la formation, mesure l'impact sur le poste." },
  { key: "acquis", icon: "🎯", label: "Évaluation des acquis", desc: "QCM de connaissances noté automatiquement — mesure réelle de l'acquisition pédagogique (indicateur 33), distincte de la satisfaction." },
];

// Forme d'une question QCM pour le type "acquis". Stockée dans la même colonne
// jsonb `evaluation_questions.questions` que les questions texte libre des 3 autres
// types (chaud/formateur/froid = string[]) — ce fichier centralise donc aussi la
// forme attendue pour éviter toute divergence entre generer-questions-evaluation
// (écrit), FormationDetail.tsx (édite), evaluation-public (lit, calcule le score) et
// EvaluationPublic.tsx (affiche, sans la bonne réponse avant soumission).
export interface QcmQuestion {
  texte: string;
  options: string[]; // toujours 4 entrées
  reponse_correcte: number; // index 0-3 dans options — ne JAMAIS envoyer ce champ à la page publique avant soumission
}

// Version envoyée à la page publique AVANT soumission : jamais reponse_correcte.
export interface QcmQuestionPublique {
  texte: string;
  options: string[];
}

export const estQuestionQcmValide = (q: unknown): q is QcmQuestion => {
  if (!q || typeof q !== "object") return false;
  const c = q as Record<string, unknown>;
  return (
    typeof c.texte === "string" && c.texte.trim() !== "" &&
    Array.isArray(c.options) && c.options.length === 4 && c.options.every(o => typeof o === "string" && o.trim() !== "") &&
    typeof c.reponse_correcte === "number" && c.reponse_correcte >= 0 && c.reponse_correcte <= 3
  );
};
