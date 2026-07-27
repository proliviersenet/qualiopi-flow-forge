import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

interface EmargementData {
  prenom: string;
  nom: string;
  formation_titre: string;
  date_debut: string | null;
  date_fin: string | null;
  lieu: string | null;
  deja_signe: boolean;
  questionnaire_avant_complete: boolean;
}

const formatDate = (d: string | null) => {
  if (!d) return null;
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
};

// Page PUBLIQUE — accessible sans compte via un lien à token unique (généré
// depuis StagiairesList.tsx / envoyer-relance). Toute la logique
// d'autorisation passe par l'Edge Function emargement-public (le token fait
// office de clé), sur le même principe que Positionnement.tsx /
// EvaluationPublic.tsx. Chantier 5 : le questionnaire avant formation doit
// être complété avant de pouvoir signer (le backend re-vérifie cette règle,
// ce contrôle côté page n'est qu'un affichage anticipé).
const EmargementPublic = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<EmargementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [nomSignataire, setNomSignataire] = useState("");
  const [certifie, setCertifie] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: res, error: err } = await supabase.functions.invoke("emargement-public", {
        body: { token, action: "get" },
      });
      if (err || res?.error) {
        setError(res?.error || err?.message || "Lien invalide.");
        setLoading(false);
        return;
      }
      const d = res as EmargementData;
      setData(d);
      setNomSignataire(`${d.prenom} ${d.nom}`.trim());
      setLoading(false);
    };
    if (token) load();
  }, [token]);

  const handleSubmit = async () => {
    if (!certifie) {
      setError("Merci de cocher la case de certification avant de signer.");
      return;
    }
    if (!nomSignataire.trim()) {
      setError("Merci de saisir votre nom.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const { data: res, error: err } = await supabase.functions.invoke("emargement-public", {
      body: { token, action: "submit", nom_signataire: nomSignataire.trim() },
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

  if (data.deja_signe || submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="max-w-md w-full"><CardContent className="pt-6 text-center">
          <p className="text-4xl mb-3">✅</p>
          <h1 className="text-lg font-bold mb-1" style={{ color: "#25245e" }}>Merci {data.prenom} !</h1>
          <p className="text-gray-500 text-sm">Votre émargement a bien été enregistré.</p>
        </CardContent></Card>
      </div>
    );
  }

  if (!data.questionnaire_avant_complete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="max-w-md w-full"><CardContent className="pt-6 text-center">
          <p className="text-4xl mb-3">📋</p>
          <h1 className="text-lg font-bold mb-1" style={{ color: "#25245e" }}>Une étape avant l'émargement</h1>
          <p className="text-gray-500 text-sm">
            Le questionnaire de positionnement avant formation doit d'abord être complété.
            Vous avez normalement reçu un lien dédié — n'hésitez pas à contacter votre formateur si besoin.
          </p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold" style={{ color: "#25245e" }}>✍️ Feuille d'émargement</h1>
          <p className="text-sm text-gray-500">{data.formation_titre}</p>
        </div>

        <Card className="mb-4">
          <CardContent className="pt-5 text-sm text-gray-600 space-y-1">
            <p>Bonjour <strong>{data.prenom} {data.nom}</strong>,</p>
            {(data.date_debut || data.date_fin) && (
              <p>
                Session du <strong>{formatDate(data.date_debut) ?? "?"}</strong> au{" "}
                <strong>{formatDate(data.date_fin) ?? "?"}</strong>
              </p>
            )}
            {data.lieu && <p>Lieu : <strong>{data.lieu}</strong></p>}
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardContent className="pt-5 space-y-4">
            <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={certifie}
                onChange={(e) => setCertifie(e.target.checked)}
                className="mt-1"
              />
              <span>Je certifie avoir suivi l'intégralité de cette formation aux dates et lieu indiqués ci-dessus.</span>
            </label>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Nom et prénom (valeur de signature)</label>
              <Input value={nomSignataire} onChange={(e) => setNomSignataire(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full font-bold"
          style={{ background: "#25245e", color: "#fff" }}
        >
          {submitting ? "Envoi..." : "Signer l'émargement"}
        </Button>
      </div>
    </div>
  );
};

export default EmargementPublic;
