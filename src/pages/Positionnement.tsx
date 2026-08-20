import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { extractFunctionErrorMessage } from "@/lib/functionsError";

interface QuestionnaireData {
  type: "avant" | "apres";
  deja_complete: boolean;
  stagiaire_prenom: string;
  stagiaire_nom: string;
  formation_titre: string;
  organisme_raison_sociale: string;
  organisme_logo_url: string;
  competences: string[];
  objectifs: string[];
  consentement_email: boolean | null;
  consentement_sms: boolean | null;
}

// Page PUBLIQUE — accessible sans compte via un lien à token unique envoyé par
// email/SMS au stagiaire (voir envoyer-relance). Toute la logique d'autorisation
// passe par l'Edge Function positionnement-public (le token fait office de clé).
const Positionnement = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<QuestionnaireData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [competencesNotes, setCompetencesNotes] = useState<Record<string, number>>({});
  const [objectifsNotes, setObjectifsNotes] = useState<Record<string, number>>({});
  // Consentement RGPD opt-in email/SMS : null tant que le stagiaire n'a pas fait
  // de choix explicite (ni "j'accepte", ni "je refuse") — on ne présume jamais.
  const [consentEmail, setConsentEmail] = useState<boolean | null>(null);
  const [consentSms, setConsentSms] = useState<boolean | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: res, error: err } = await supabase.functions.invoke("positionnement-public", {
        body: { token, action: "get" },
      });
      if (err || res?.error) {
        setError(res?.error || (err ? await extractFunctionErrorMessage(err, "Lien invalide.") : "Lien invalide."));
        setLoading(false);
        return;
      }
      const resData = res as QuestionnaireData;
      setData(resData);
      // Pré-remplit avec un choix déjà exprimé précédemment (le stagiaire reste
      // libre de le modifier avant d'envoyer à nouveau).
      if (resData.consentement_email !== null) setConsentEmail(resData.consentement_email);
      if (resData.consentement_sms !== null) setConsentSms(resData.consentement_sms);
      setLoading(false);
    };
    if (token) load();
  }, [token]);

  const noter = (
    listType: "competences" | "objectifs",
    libelle: string,
    note: number
  ) => {
    if (listType === "competences") setCompetencesNotes(prev => ({ ...prev, [libelle]: note }));
    else setObjectifsNotes(prev => ({ ...prev, [libelle]: note }));
  };

  const handleSubmit = async () => {
    if (!data) return;
    if (consentEmail === null || consentSms === null) {
      setError("Merci d'indiquer vos préférences de contact (email et SMS) avant d'envoyer.");
      return;
    }
    const totalItems = data.competences.length + data.objectifs.length;
    const totalReponses = Object.keys(competencesNotes).length + Object.keys(objectifsNotes).length;
    if (totalReponses < totalItems) {
      setError("Merci de noter tous les éléments avant d'envoyer.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const { data: res, error: err } = await supabase.functions.invoke("positionnement-public", {
      body: {
        token, action: "submit",
        competences_notes: competencesNotes, objectifs_notes: objectifsNotes,
        consentement_email: consentEmail, consentement_sms: consentSms,
      },
    });
    setSubmitting(false);
    if (err || res?.error) {
      setError(res?.error || (err ? await extractFunctionErrorMessage(err, "Erreur lors de l'envoi.") : "Erreur lors de l'envoi."));
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
          <p className="text-gray-500 text-sm">Votre questionnaire a bien été enregistré.</p>
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
            <h1 className="text-xl font-bold" style={{ color: "#25245e" }}>
              Questionnaire de positionnement {data.type === "avant" ? "avant" : "après"} formation
            </h1>
            <p className="text-sm text-gray-500">{data.formation_titre}</p>
          </div>
        </div>

        <Card className="mb-4">
          <CardContent className="pt-5 text-sm text-gray-600">
            <p>Bonjour <strong>{data.stagiaire_prenom} {data.stagiaire_nom}</strong>,</p>
            <p className="mt-2">
              Merci d'attribuer une note sur chacun des critères ci-dessous, 0 correspondant à une non maîtrise, 4 à une totale maîtrise.
            </p>
          </CardContent>
        </Card>

        {/* Consentement RGPD opt-in email/SMS — choix explicite requis (accepter OU
            refuser), jamais présélectionné, avant tout envoi ultérieur au stagiaire. */}
        <Card className="mb-4">
          <CardContent className="pt-5">
            <h2 className="font-semibold mb-1" style={{ color: "#25245e" }}>Vos préférences de contact</h2>
            <p className="text-xs text-gray-500 mb-4">
              Conformément au RGPD, nous avons besoin de votre accord pour vous contacter par email et/ou SMS
              dans le cadre de cette formation (rappels, questionnaires, attestation...). Vous pouvez modifier
              ce choix à tout moment auprès de votre formateur.
            </p>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-700 mb-2">✉️ Emails de {data.organisme_raison_sociale || "l'organisme de formation"}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConsentEmail(true)}
                    className={`px-4 py-2 rounded text-sm font-semibold border ${consentEmail === true ? "text-white" : "text-gray-500 border-gray-200"}`}
                    style={consentEmail === true ? { background: "#22c55e", borderColor: "#22c55e" } : {}}
                  >
                    ✅ J'accepte
                  </button>
                  <button
                    onClick={() => setConsentEmail(false)}
                    className={`px-4 py-2 rounded text-sm font-semibold border ${consentEmail === false ? "text-white" : "text-gray-500 border-gray-200"}`}
                    style={consentEmail === false ? { background: "#dc3545", borderColor: "#dc3545" } : {}}
                  >
                    ❌ Je refuse
                  </button>
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-700 mb-2">📱 SMS de {data.organisme_raison_sociale || "l'organisme de formation"}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConsentSms(true)}
                    className={`px-4 py-2 rounded text-sm font-semibold border ${consentSms === true ? "text-white" : "text-gray-500 border-gray-200"}`}
                    style={consentSms === true ? { background: "#22c55e", borderColor: "#22c55e" } : {}}
                  >
                    ✅ J'accepte
                  </button>
                  <button
                    onClick={() => setConsentSms(false)}
                    className={`px-4 py-2 rounded text-sm font-semibold border ${consentSms === false ? "text-white" : "text-gray-500 border-gray-200"}`}
                    style={consentSms === false ? { background: "#dc3545", borderColor: "#dc3545" } : {}}
                  >
                    ❌ Je refuse
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {data.competences.length > 0 && (
          <Card className="mb-4">
            <CardContent className="pt-5">
              <h2 className="font-semibold mb-3" style={{ color: "#25245e" }}>Compétences</h2>
              <div className="space-y-3">
                {data.competences.map((c) => (
                  <div key={c} className="border-b border-gray-50 pb-3">
                    <p className="text-sm text-gray-700 mb-2">{c}</p>
                    <div className="flex gap-2">
                      {rateScale.map(n => (
                        <button
                          key={n}
                          onClick={() => noter("competences", c, n)}
                          className={`w-9 h-9 rounded-full text-sm font-bold border ${competencesNotes[c] === n ? "text-white" : "text-gray-500 border-gray-200"}`}
                          style={competencesNotes[c] === n ? { background: "#f2901e", borderColor: "#f2901e" } : {}}
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

        {data.objectifs.length > 0 && (
          <Card className="mb-4">
            <CardContent className="pt-5">
              <h2 className="font-semibold mb-3" style={{ color: "#25245e" }}>Objectifs de la formation</h2>
              <div className="space-y-3">
                {data.objectifs.map((o) => (
                  <div key={o} className="border-b border-gray-50 pb-3">
                    <p className="text-sm text-gray-700 mb-2">{o}</p>
                    <div className="flex gap-2">
                      {rateScale.map(n => (
                        <button
                          key={n}
                          onClick={() => noter("objectifs", o, n)}
                          className={`w-9 h-9 rounded-full text-sm font-bold border ${objectifsNotes[o] === n ? "text-white" : "text-gray-500 border-gray-200"}`}
                          style={objectifsNotes[o] === n ? { background: "#f2901e", borderColor: "#f2901e" } : {}}
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

export default Positionnement;
