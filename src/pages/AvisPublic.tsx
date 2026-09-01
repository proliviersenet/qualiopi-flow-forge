import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

// Page PUBLIQUE — module de notation des formateurs (juillet 2026). Vitrine
// partageable de la note d'un organisme (lien à mettre dans une fiche Google
// My Business, une bio de réseau social, etc.), et point central pour
// récupérer le widget (image SVG) à coller sur un site web. Aucune donnée
// personnelle affichée — uniquement la moyenne et le nombre d'avis, calculés
// côté serveur par l'Edge Function publique badge-formateur.
const BADGE_FUNCTION_URL = "https://cvgosywcwqmsegdgjpqp.supabase.co/functions/v1/badge-formateur";

interface AvisData {
  moyenne: number | null;
  nbAvis: number;
  raisonSociale: string;
}

const AvisPublic = () => {
  const { organismeId } = useParams<{ organismeId: string }>();
  const { toast } = useToast();
  const [data, setData] = useState<AvisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${BADGE_FUNCTION_URL}?org=${organismeId}&format=json`);
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error || "Organisme introuvable.");
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur de chargement.");
      } finally {
        setLoading(false);
      }
    };
    if (organismeId) load();
  }, [organismeId]);

  const imageUrl = `${BADGE_FUNCTION_URL}?org=${organismeId}`;
  const pageUrl = `https://qualioflex.fr/avis/${organismeId}`;
  const imgSnippet = `<img src="${imageUrl}" alt="Note formateur" width="280" height="90" />`;

  const copier = (texte: string, label: string) => {
    navigator.clipboard.writeText(texte);
    toast({ title: "Copié !", description: `${label} copié dans le presse-papiers.` });
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-400">Chargement...</p></div>;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="max-w-md w-full"><CardContent className="pt-6 text-center">
          <p className="text-4xl mb-3">⚠️</p>
          <p className="text-gray-600">{error || "Page introuvable."}</p>
        </CardContent></Card>
      </div>
    );
  }

  const etoilesPleines = data.moyenne !== null ? Math.round(data.moyenne) : 0;

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto">
        <Card className="mb-6">
          <CardContent className="pt-8 pb-8 text-center">
            <p className="text-sm text-gray-500 mb-1">{data.raisonSociale}</p>
            <h1 className="text-lg font-bold mb-4" style={{ color: "#25245e" }}>Note du formateur</h1>
            <div className="flex justify-center gap-1 mb-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="text-3xl" style={{ color: i < etoilesPleines ? "#f2901e" : "#e2e2e2" }}>★</span>
              ))}
            </div>
            <p className="text-4xl font-bold mb-1" style={{ color: "#25245e" }}>
              {data.moyenne !== null ? data.moyenne.toFixed(1) : "—"} <span className="text-lg text-gray-400">/ 5</span>
            </p>
            <p className="text-sm text-gray-500">{data.nbAvis > 0 ? `Basé sur ${data.nbAvis} avis (stagiaires et clients)` : "Pas encore d'avis"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h2 className="font-semibold mb-3" style={{ color: "#25245e" }}>📎 Widget à coller sur votre site</h2>
            <p className="text-xs text-gray-500 mb-3">Collez ce code HTML n'importe où sur votre site pour afficher votre note, mise à jour automatiquement.</p>
            <div className="bg-gray-50 border rounded p-3 mb-2 text-xs font-mono break-all text-gray-600">{imgSnippet}</div>
            <Button size="sm" variant="outline" className="w-full mb-4" onClick={() => copier(imgSnippet, "Le code d'intégration")}>
              Copier le code
            </Button>

            <h2 className="font-semibold mb-3" style={{ color: "#25245e" }}>🖼️ Image seule (pour Google My Business, réseaux sociaux)</h2>
            <p className="text-xs text-gray-500 mb-3">Téléchargez ou copiez ce lien direct vers l'image — utilisable comme photo sur votre fiche GMB ou dans un post.</p>
            <div className="bg-gray-50 border rounded p-3 mb-2 text-xs font-mono break-all text-gray-600">{imageUrl}</div>
            <Button size="sm" variant="outline" className="w-full mb-4" onClick={() => copier(imageUrl, "Le lien de l'image")}>
              Copier le lien de l'image
            </Button>

            <h2 className="font-semibold mb-3" style={{ color: "#25245e" }}>🔗 Lien de cette page</h2>
            <p className="text-xs text-gray-500 mb-3">À mettre dans votre bio de réseau social ou en lien complémentaire sur votre fiche Google.</p>
            <div className="bg-gray-50 border rounded p-3 mb-2 text-xs font-mono break-all text-gray-600">{pageUrl}</div>
            <Button size="sm" variant="outline" className="w-full" onClick={() => copier(pageUrl, "Le lien de la page")}>
              Copier le lien
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400 mt-6">Propulsé par QualioFlex</p>
      </div>
    </div>
  );
};

export default AvisPublic;
