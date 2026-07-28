import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { X, Send, Loader2 } from "lucide-react";
import qualiosAvatar from "@/assets/qualios.png";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const STORAGE_KEY = "qf_chatbot_conversation_id";

const ChatbotWidget = () => {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Le widget ne s'affiche que pour les utilisateurs connectés (formateur ou client) —
  // pas sur les pages publiques/marketing, pour rester léger et pertinent.
  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setVisible(!!session);
    };
    check();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setVisible(!!session);
      if (!session) { setOpen(false); setMessages([]); setConversationId(null); }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Reprise d'une conversation existante (continuité entre deux visites)
  useEffect(() => {
    if (!open || messages.length > 0) return;
    const savedId = localStorage.getItem(STORAGE_KEY);
    if (!savedId) return;
    (async () => {
      const { data } = await supabase
        .from("chatbot_messages")
        .select("role, content")
        .eq("conversation_id", savedId)
        .order("created_at", { ascending: true })
        .limit(50);
      if (data && data.length > 0) {
        setMessages(data as ChatMessage[]);
        setConversationId(savedId);
      }
    })();
  }, [open, messages.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("chatbot-assistant", {
        body: { message: text, conversation_id: conversationId },
      });
      if (error) throw error;

      setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
      if (data.conversation_id) {
        setConversationId(data.conversation_id);
        localStorage.setItem(STORAGE_KEY, data.conversation_id);
      }
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Désolé, une erreur est survenue. Réessaie dans un instant, ou écris directement à olivier@exsenco.fr.",
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div className="mb-3 w-[340px] sm:w-[380px] h-[520px] max-h-[70vh] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3" style={{ background: "#25245e" }}>
            <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0">
              <img src={qualiosAvatar} alt="Qualios" className="w-full h-full object-contain" />
            </div>
            <div className="flex-1">
              <p className="text-white font-semibold text-sm">Qualios</p>
              <p className="text-white/60 text-xs">Assistant QalioFlex · réponse en quelques secondes</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white">
              <X size={18} />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
            {messages.length === 0 && !loading && (
              <div className="text-sm text-gray-500 px-2 py-4">
                👋 Salut ! Je suis Qualios, l'assistant QalioFlex. Pose-moi une question sur l'appli, ou dis-moi ce que
                tu cherches à faire — je t'aide à démarrer.
              </div>
            )}
            <div className="space-y-2">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                      m.role === "user" ? "text-white" : "bg-gray-100 text-gray-900"
                    }`}
                    style={m.role === "user" ? { background: "#25245e" } : undefined}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-500 flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" /> Qualios réfléchit...
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-gray-200 p-2 flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Écris ta question..."
              rows={1}
              className="flex-1 resize-none border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#25245e] max-h-24"
            />
            <Button size="icon" onClick={send} disabled={loading || !input.trim()} style={{ background: "#f2901e" }}>
              <Send size={16} />
            </Button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        className="w-14 h-14 rounded-full shadow-xl flex items-center justify-center bg-white hover:scale-105 transition-transform overflow-hidden"
        aria-label="Ouvrir Qualios, l'assistant QalioFlex"
      >
        {open ? <X size={22} style={{ color: "#25245e" }} /> : <img src={qualiosAvatar} alt="Qualios" className="w-full h-full object-contain p-1" />}
      </button>
    </div>
  );
};

export default ChatbotWidget;
