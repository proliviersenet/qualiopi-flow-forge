import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { extractFunctionErrorMessage } from "@/lib/functionsError";

interface QuestionQcmPublique {
  texte: string;
  options: string[];
}

interface EvaluationData {
  type: "chaud" | "formateur" | "froid" | "acquis";
  titre_questionnaire: string;
  deja_complete: boolean;
  score_deja_obtenu?: number | null;
  destinataire_prenom: string;
  destinataire_nom: string;
  formation_titre: string;
  organisme_raison_sociale: string;
  organisme_logo_url: string;
  // "acquis" (indicateur 33) : questions = QuestionQcmPublique[] (QCM, jamais la bonne
  // réponse avant soumission). Les 3 autres types : questions = string[] (affirmations
  // notées 0-4). Voir src/lib/documentTypes.ts pour la forme QcmQuestion complète
  // (côté formateur, avec reponse_correcte).
  questions: string[] | QuestionQcmPublique[];
}

// Page PUBLIQUE — accessible sans compte via un lien à token unique (généré
// depuis StagiairesList.tsx pour les stagiaires, ou automatiquement pour les
// clients — module de notation des formateurs). Toute la logique
// d'autorisation passe par l'Edge Function evaluation-public (le token fait
// office de clé), sur le même principe que Positionnement.tsx. Un seul
// composant pour les 3 types d'évaluation stagiaire (chaud / formateur /
// froid) ET pour l'évaluation du formateur remplie par le client — le token
// détermine lequel, et les champs destinataire_prenom/nom sont génériques
// pour couvrir les deux cas.
const EvaluationPublic = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<EvaluationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [notes, setNotes] = useState<Record<string, number>>({});
  const [commentaire, setCommentaire] = useState("");
  // "acquis" (indicateur 33) — réponses au QCM : index de question -> index d'option choisie.
  const [reponsesQcm, setReponsesQcm] = useState<Record<number, number>>({});
  const [resultatAcquis, setResultatAcquis] = useState<{
    score: number;
    corrections: { texte: string; bonne_reponse: number; reponse_stagiaire: number | null; correct: boolean }[];
  } | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: res, error: err } = await supabase.functions.invoke("evaluation-public", {
        body: { token, action: "get" },
      });
      if (err || res?.error) {
        setError(res?.error || (err ? await extractFunctionErrorMessage(err, "Lien invalide.") : "Lien invalide."));
        setLoading(false);
        return;
      }
      setData(res as EvaluationData);
      setLoading(false);
    };
    if (token) load();
  }, [token]);

  const noter = (question: string, note: number) => {
    setNotes(prev => ({ ...prev, [question]: note }));
  };

  const choisirReponseQcm = (index: number, optionIndex: number) => {
    setReponsesQcm(prev => ({ ...prev, [index]: optionIndex }));
  };

  const handleSubmit = async () => {
    if (!data) return;
    const estAcquis = data.type === "acquis";

    if (estAcquis) {
      if (Object.keys(reponsesQcm).length < data.questions.length) {
        setError("Merci de répondre à toutes les questions avant d'envoyer.");
        return;
      }
    } else if (Object.keys(notes).length < data.questions.length) {
      setError("Merci de noter tous les éléments avant d'envoyer.");
      return;
    }

    setError(null);
    setSubmitting(true);
    const { data: res, error: err } = await supabase.functions.invoke("evaluation-public", {
      body: {
        token, action: "submit",
        reponses: estAcquis ? { reponses: reponsesQcm } : { notes, commentaire: commentaire.trim() || null },
      },
    });
    setSubmitting(false);
    if (err || res?.error) {
      setError(res?.error || (err ? await extractFunctionErrorMessage(err, "Erreur lors de l'envoi.") : "Erreur lors de l'envoi."));
      return;
    }
    if (estAcquis && typeof res?.score === "number") {
      setResultatAcquis({ score: res.score, corrections: res.corrections || [] });
    }
    setSubmitted(true);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-400">Chargement...</p></div>;
  }

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="max-w-md w-full"><CardContent className="pt-6 text-center">
          <p className="text-4xl mb-3">⚠️</p>
          <p className="text-gray-600">{error}</p>
        </CardContent></Card>
      </div>
    );
  }

  if (!data) return null;

  const estAcquis = data.type === "acquis";
  // Score à afficher sur l'écran de remerciement : celui qu'on vient de calculer
  // (juste soumis) ou celui déjà enregistré en base (lien rouvert après coup).
  const scoreAffiche = resultatAcquis?.score ?? data.score_deja_obtenu ?? null;

  if (data.deja_complete || submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
        <Card className="max-w-md w-full"><CardContent className="pt-6 text-center">
          <p className="text-4xl mb-3">✅</p>
          <h1 className="text-lg font-bold mb-1" style={{ color: "#25245e" }}>Merci {data.destinataire_prenom} !</h1>
          <p className="text-gray-500 text-sm">
            {estAcquis ? "Votre QCM a bien été enregistré." : "Votre évaluation a bien été enregistrée."}
          </p>
          {estAcquis && scoreAffiche !== null && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-3xl font-bold" style={{ color: "#f2901e" }}>{scoreAffiche}%</p>
              <p className="text-xs text-gray-400 mt-1">de bonnes réponses</p>
            </div>
          )}
          {estAcquis && resultatAcquis && resultatAcquis.corrections.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100 text-left space-y-2">
              <p className="text-xs font-semibold text-gray-500 mb-2">Corrigé :</p>
              {resultatAcquis.corrections.map((c, i) => (
                <div key={i} className="text-xs flex gap-2 items-start">
                  <span>{c.correct ? "✅" : "❌"}</span>
                  <span className="text-gray-600">{c.texte}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>
      </div>
    );
  }

  const rateScale = [0, 1, 2, 3, 4];

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          {data.organisme_logo_url && <img src={data.organisme_logo_url} alt="Logo" className="h-12 max-w-[120px] object-contain bg-white rounded p-1" />}
          <div>
            <h1 className="text-xl font-bold" style={{ color: "#25245e" }}>{data.titre_questionnaire}</h1>
            <p className="text-sm text-gray-500">{data.formation_titre}</p>
          </div>
        </div>

        <Card className="mb-4">
          <CardContent className="pt-5 text-sm text-gray-600">
            <p>Bonjour <strong>{data.destinataire_prenom} {data.destinataire_nom}</strong>,</p>
            <p className="mt-2">
              {estAcquis
                ? "Ce questionnaire vérifie ce que vous avez retenu de la formation — une seule bonne réponse par question. Votre score vous sera communiqué immédiatement."
                : "Merci d'attribuer une note sur chacun des critères ci-dessous, 0 correspondant à un désaccord total, 4 à un accord total."}
            </p>
          </CardContent>
        </Card>

        {data.questions.length > 0 && estAcquis && (
          <Card className="mb-4">
            <CardContent className="pt-5">
              <div className="space-y-5">
                {(data.questions as QuestionQcmPublique[]).map((q, i) => (
                  <div key={i} className="border-b border-gray-50 pb-4 last:border-b-0">
                    <p className="text-sm font-medium text-gray-700 mb-2">{i + 1}. {q.texte}</p>
                    <div className="space-y-2">
                      {q.options.map((opt, oi) => (
                        <button
                          key={oi}
                          onClick={() => choisirReponseQcm(i, oi)}
                          className={`w-full text-left text-sm px-3 py-2 rounded-lg border ${reponsesQcm[i] === oi ? "text-white" : "text-gray-600 border-gray-200 hover:border-gray-300"}`}
                          style={reponsesQcm[i] === oi ? { background: "#25245e", borderColor: "#25245e" } : {}}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {data.questions.length > 0 && !estAcquis && (
          <Card className="mb-4">
            <CardContent className="pt-5">
              <div className="space-y-3">
                {(data.questions as string[]).map((q) => (
                  <div key={q} className="border-b border-gray-50 pb-3">
                    <p className="text-sm text-gray-700 mb-2">{q}</p>
                    <div className="flex gap-2">
                      {rateScale.map(n => (
                        <button
                          key={n}
                          onClick={() => noter(q, n)}
                          className={`w-9 h-9 rounded-full text-sm font-bold border ${notes[q] === n ? "text-white" : "text-gray-500 border-gray-200"}`}
                          style={notes[q] === n ? { background: "#f2901e", borderColor: "#f2901e" } : {}}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {!estAcquis && (
          <Card className="mb-4">
            <CardContent className="pt-5">
              <h2 className="font-semibold mb-2" style={{ color: "#25245e" }}>Commentaire (facultatif)</h2>
              <Textarea
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                placeholder="Une remarque, une suggestion ?"
                rows={3}
              />
            </CardContent>
          </Card>
        )}

        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full font-bold"
          style={{ background: "#25245e", color: "#fff" }}
        >
          {submitting ? "Envoi..." : "Envoyer mes réponses"}
        </Button>

        <p className="text-center text-xs text-gray-400 mt-4">{data.organisme_raison_sociale}</p>
      </div>
    </div>
  );
};

export default EvaluationPublic;
