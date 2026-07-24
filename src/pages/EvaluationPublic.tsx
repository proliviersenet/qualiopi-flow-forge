import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

interface EvaluationData {
  type: "chaud" | "formateur" | "froid";
  titre_questionnaire: string;
  deja_complete: boolean;
  stagiaire_prenom: string;
  stagiaire_nom: string;
  formation_titre: string;
  organisme_raison_sociale: string;
  organisme_logo_url: string;
  questions: string[];
}

// Page PUBLIQUE — accessible sans compte via un lien à token unique (généré
// depuis StagiairesList.tsx). Toute la logique d'autorisation passe par
// l'Edge Function evaluation-public (le token fait office de clé), sur le
// même principe que Positionnement.tsx. Un seul composant pour les 3 types
// d'évaluation (chaud / formateur / froid) — le token détermine lequel.
const EvaluationPublic = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<EvaluationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [notes, setNotes] = useState<Record<string, number>>({});
  const [commentaire, setCommentaire] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data: res, error: err } = await supabase.functions.invoke("evaluation-public", {
        body: { token, action: "get" },
      });
      if (err || res?.error) {
        setError(res?.error || err?.message || "Lien invalide.");
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

  const handleSubmit = async () => {
    if (!data) return;
    if (Object.keys(notes).length < data.questions.length) {
      setError("Merci de noter tous les éléments avant d'envoyer.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const { data: res, error: err } = await supabase.functions.invoke("evaluation-public", {
      body: {
        token, action: "submit",
        reponses: { notes, commentaire: commentaire.trim() || null },
      },
    });
    setSubmitting(false);
    if (err || res?.error) {
      setError(res?.error || err?.message || "Erreur lors de l'envoi.");
      return;
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

  if (data.deja_complete || submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="max-w-md w-full"><CardContent className="pt-6 text-center">
          <p className="text-4xl mb-3">✅</p>
          <h1 className="text-lg font-bold mb-1" style={{ color: "#25245e" }}>Merci {data.stagiaire_prenom} !</h1>
          <p className="text-gray-500 text-sm">Votre évaluation a bien été enregistrée.</p>
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
            <p>Bonjour <strong>{data.stagiaire_prenom} {data.stagiaire_nom}</strong>,</p>
            <p className="mt-2">
              Merci d'attribuer une note sur chacun des critères ci-dessous, 0 correspondant à un désaccord total, 4 à un accord total.
            </p>
          </CardContent>
        </Card>

        {data.questions.length > 0 && (
          <Card className="mb-4">
            <CardContent className="pt-5">
              <div className="space-y-3">
                {data.questions.map((q) => (
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
