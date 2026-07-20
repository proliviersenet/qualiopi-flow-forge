import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

interface Stagiaire {
  id: string;
  nom: string;
  prenom: string;
  email_pro: string;
  telephone: string;
  // Flow documentaire — à étendre quand les docs seront générés
  doc_convention?: string | null;
  doc_programme?: string | null;
  doc_emargement?: string | null;
  doc_attestation?: string | null;
}

const docStatus = (val: string | null | undefined) => {
  if (!val) return { label: "En attente", color: "bg-gray-100 text-gray-400" };
  if (val === "envoye") return { label: "Envoyé", color: "bg-blue-100 text-blue-600" };
  if (val === "signe") return { label: "Signé ✓", color: "bg-green-100 text-green-700" };
  if (val === "erreur") return { label: "Erreur ⚠️", color: "bg-red-100 text-red-600" };
  return { label: val, color: "bg-gray-100 text-gray-500" };
};

const StagiairesList = ({ sessionId }: { sessionId: string }) => {
  const [stagiaires, setStagiaires] = useState<Stagiaire[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("stagiaires")
        .select("*")
        .eq("session_id", sessionId)
        .order("nom");
      setStagiaires((data as Stagiaire[]) || []);
      setLoading(false);
    };
    fetch();
  }, [sessionId]);

  if (loading) return <p className="text-xs text-gray-400">Chargement des stagiaires...</p>;
  if (stagiaires.length === 0) return null;

  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-3">
        👥 Stagiaires ({stagiaires.length})
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2 pr-4 text-gray-500 font-medium">Nom</th>
              <th className="text-left py-2 pr-4 text-gray-500 font-medium">Prénom</th>
              <th className="text-left py-2 pr-4 text-gray-500 font-medium">Email</th>
              <th className="text-left py-2 pr-4 text-gray-500 font-medium">Mobile</th>
              <th className="text-left py-2 pr-2 text-gray-500 font-medium">Convention</th>
              <th className="text-left py-2 pr-2 text-gray-500 font-medium">Émargement</th>
              <th className="text-left py-2 text-gray-500 font-medium">Attestation</th>
            </tr>
          </thead>
          <tbody>
            {stagiaires.map((s) => {
              const convention = docStatus(s.doc_convention);
              const emargement = docStatus(s.doc_emargement);
              const attestation = docStatus(s.doc_attestation);
              const allSigned = s.doc_convention === "signe" && s.doc_emargement === "signe" && s.doc_attestation === "signe";

              return (
                <tr key={s.id} className={`border-b border-gray-50 ${allSigned ? "bg-green-50" : ""}`}>
                  <td className="py-2 pr-4 font-medium text-gray-800">{s.nom}</td>
                  <td className="py-2 pr-4 text-gray-700">{s.prenom}</td>
                  <td className="py-2 pr-4 text-gray-500">{s.email_pro || "—"}</td>
                  <td className="py-2 pr-4 text-gray-500">{s.telephone || "—"}</td>
                  <td className="py-2 pr-2">
                    <Badge className={`text-xs px-1.5 py-0.5 ${convention.color}`}>{convention.label}</Badge>
                  </td>
                  <td className="py-2 pr-2">
                    <Badge className={`text-xs px-1.5 py-0.5 ${emargement.color}`}>{emargement.label}</Badge>
                  </td>
                  <td className="py-2">
                    <Badge className={`text-xs px-1.5 py-0.5 ${attestation.color}`}>{attestation.label}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Résumé avancement */}
      <div className="mt-3 flex gap-3 text-xs text-gray-500">
        <span>⏳ En attente : {stagiaires.filter(s => !s.doc_convention).length}</span>
        <span>📤 Envoyés : {stagiaires.filter(s => s.doc_convention === "envoye").length}</span>
        <span>✅ Complets : {stagiaires.filter(s => s.doc_convention === "signe" && s.doc_emargement === "signe" && s.doc_attestation === "signe").length}</span>
      </div>
    </div>
  );
};

export default StagiairesList;
