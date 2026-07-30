import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

// Suivi des conversations chatbot escaladées (juillet 2026) — jusqu'ici, une
// escalade (déclenchée par Qualios via le tag [ESCALADE: raison] détecté dans
// supabase/functions/chatbot-assistant/index.ts) n'était visible qu'en base
// (statut "escaladee" sur chatbot_conversations) ou par l'email envoyé à
// Olivier. Cet écran donne une vraie liste consultable et permet de marquer
// une conversation comme traitée (statut "fermee", valeur jusqu'ici jamais
// utilisée ailleurs dans le code — réservée à cet usage).
//
// Le rôle de l'auteur de la conversation (role_context) conditionne comment on
// affiche "qui a posé la question" :
//   - "client"    → on rejoint la table clients (raison_sociale / contact_nom).
//   - "formateur" → la table profiles est protégée par une RLS "auth.uid() = id"
//     (un formateur ne peut pas lire le profil d'un autre), donc pas de jointure
//     possible : on affiche "Vous" si c'est le compte connecté, sinon un libellé
//     générique (cas d'un organisme à plusieurs comptes formateur).
interface ConversationRow {
  id: string;
  role_context: "client" | "formateur";
  client_id: string | null;
  user_id: string;
  statut: "ouverte" | "escaladee" | "fermee";
  created_at: string;
  updated_at: string;
  clientNom: string | null;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

const ChatbotEscalades = () => {
  const navigate = useNavigate();
  const { session: authSession, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [tab, setTab] = useState<"escaladee" | "fermee">("escaladee");
  const [openConv, setOpenConv] = useState<ConversationRow | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [closing, setClosing] = useState(false);

  const loadConversations = async (organismeId: string) => {
    const { data, error } = await supabase
      .from("chatbot_conversations")
      .select(`
        id, role_context, client_id, user_id, statut, created_at, updated_at,
        clients:client_id ( raison_sociale, contact_nom )
      `)
      .eq("organisme_id", organismeId)
      .in("statut", ["escaladee", "fermee"])
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Erreur chargement conversations escaladées:", error);
      setConversations([]);
      return;
    }

    const rows: ConversationRow[] = (data || []).map((c: Record<string, unknown>) => {
      const client = c.clients as Record<string, unknown> | null;
      return {
        id: c.id as string,
        role_context: c.role_context as "client" | "formateur",
        client_id: c.client_id as string | null,
        user_id: c.user_id as string,
        statut: c.statut as "ouverte" | "escaladee" | "fermee",
        created_at: c.created_at as string,
        updated_at: c.updated_at as string,
        clientNom: client ? ((client.raison_sociale as string) || (client.contact_nom as string) || null) : null,
      };
    });
    setConversations(rows);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!authSession) { navigate("/login"); return; }
    if (authSession.user.user_metadata?.role === "client") { navigate("/espace-client"); return; }

    const init = async () => {
      try {
        setUser({
          name: authSession.user.user_metadata?.nom_complet || authSession.user.email || "",
          email: authSession.user.email || "",
          profileImage: "",
        });

        const { data: profile } = await supabase
          .from("profiles")
          .select("organisme_id")
          .eq("id", authSession.user.id)
          .single();

        if (!profile?.organisme_id) { setLoading(false); return; }
        await loadConversations(profile.organisme_id as string);
      } catch (err) {
        console.error("Erreur init ChatbotEscalades:", err);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [authSession, authLoading, navigate]);

  const authorLabel = (c: ConversationRow) => {
    if (c.role_context === "client") return c.clientNom || "Client";
    if (c.user_id === authSession?.user.id) return "Vous (formateur)";
    return "Formateur de votre organisme";
  };

  const openConversation = async (c: ConversationRow) => {
    setOpenConv(c);
    setMessages([]);
    setMessagesLoading(true);
    const { data, error } = await supabase
      .from("chatbot_messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", c.id)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("Erreur chargement messages:", error);
    } else {
      setMessages((data || []) as Message[]);
    }
    setMessagesLoading(false);
  };

  const marquerTraitee = async () => {
    if (!openConv) return;
    setClosing(true);
    const { error } = await supabase
      .from("chatbot_conversations")
      .update({ statut: "fermee", updated_at: new Date().toISOString() })
      .eq("id", openConv.id);
    setClosing(false);
    if (error) {
      toast({
        title: "Impossible de marquer comme traité",
        description: "Une politique de base de données (RLS) doit être ajoutée pour autoriser cette action — voir CONTEXT.md.",
        variant: "destructive",
      });
      console.error("Erreur marquage traité:", error);
      return;
    }
    toast({ title: "Conversation marquée comme traitée" });
    setOpenConv(null);
    setConversations((prev) => prev.filter((c) => c.id !== openConv.id));
  };

  const filtered = conversations.filter((c) => c.statut === tab);

  return (
    <div className="flex flex-col min-h-screen">
      <Header user={user || { name: "", email: "", profileImage: "" }} onLogout={handleLogout} />
      <main className="flex-grow bg-gray-50 py-6">
        <div className="container mx-auto px-4">
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#25245e" }}>💬 Conversations escaladées</h1>
          <p className="text-sm text-gray-500 mb-6">
            Questions posées à Qualios (chatbot) qui ont nécessité une intervention humaine. Vous recevez aussi un
            email pour chaque escalade — cette page permet de garder une trace et de suivre le traitement.
          </p>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "escaladee" | "fermee")} className="mb-4">
            <TabsList>
              <TabsTrigger value="escaladee">
                À traiter {conversations.filter((c) => c.statut === "escaladee").length > 0 && `(${conversations.filter((c) => c.statut === "escaladee").length})`}
              </TabsTrigger>
              <TabsTrigger value="fermee">Traitées</TabsTrigger>
            </TabsList>
          </Tabs>

          {loading ? (
            <p className="text-gray-400">Chargement...</p>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-gray-500">
                {tab === "escaladee"
                  ? "Aucune conversation escaladée en attente. 🎉"
                  : "Aucune conversation traitée pour l'instant."}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((c) => (
                <Card key={c.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openConversation(c)}>
                  <CardContent className="pt-4 pb-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-800 truncate">{authorLabel(c)}</span>
                        <Badge variant={c.role_context === "client" ? "secondary" : "outline"} className="text-xs">
                          {c.role_context === "client" ? "client" : "formateur"}
                        </Badge>
                        {c.statut === "escaladee" ? (
                          <Badge className="text-xs" style={{ background: "#f2901e", color: "#fff" }}>escaladée</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">traitée</Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">
                        {new Date(c.updated_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openConversation(c); }}>
                      Voir la conversation
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />

      <Dialog open={!!openConv} onOpenChange={(v) => { if (!v) setOpenConv(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{openConv ? authorLabel(openConv) : ""}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 py-2">
            {messagesLoading ? (
              <p className="text-sm text-gray-400">Chargement des messages...</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-gray-400">Aucun message trouvé pour cette conversation.</p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      m.role === "user" ? "bg-[#25245e] text-white" : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            {openConv?.statut === "escaladee" && (
              <Button onClick={marquerTraitee} disabled={closing} style={{ background: "#25245e", color: "#fff" }}>
                {closing ? "..." : "Marquer comme traité"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatbotEscalades;
