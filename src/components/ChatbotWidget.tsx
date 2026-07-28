import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { X, Send, Loader2 } from "lucide-react";
import qualiosAvatar from "@/assets/qualios.png";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Pos {
  x: number;
  y: number;
}

const STORAGE_KEY = "qf_chatbot_conversation_id";
const POSITION_KEY = "qf_chatbot_position";
const BUTTON_SIZE = 56;
const MARGIN = 16;
const PANEL_WIDTH = 340;
const PANEL_HEIGHT = 520;

const clampPos = (pos: Pos): Pos => ({
  x: Math.min(Math.max(pos.x, MARGIN), window.innerWidth - BUTTON_SIZE - MARGIN),
  y: Math.min(Math.max(pos.y, MARGIN), window.innerHeight - BUTTON_SIZE - MARGIN),
});

const getDefaultPos = (): Pos =>
  clampPos({ x: window.innerWidth - BUTTON_SIZE - 20, y: window.innerHeight - BUTTON_SIZE - 20 });

const loadSavedPos = (): Pos => {
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    if (raw) return clampPos(JSON.parse(raw));
  } catch {
    // position invalide en storage : on ignore et on retombe sur la position par défaut
  }
  return getDefaultPos();
};

const ChatbotWidget = () => {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showHelpBubble, setShowHelpBubble] = useState(false);
  const [pos, setPos] = useState<Pos>(loadSavedPos);
  const scrollRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    openRef.current = open;
  }, [open]);

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

  // Repositionne le widget si la fenêtre est redimensionnée, pour qu'il reste
  // toujours visible et cliquable à l'écran.
  useEffect(() => {
    const onResize = () => setPos((p) => clampPos(p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Petite bulle "Besoin d'aide ?" : une 1ère fois 5s après la connexion, une 2e
  // fois 2 min après, puis une dernière fois 5 min après — et plus jamais ensuite,
  // pour rester discret. N'apparaît pas si le chat est déjà ouvert à ce moment-là.
  useEffect(() => {
    if (!visible) { setShowHelpBubble(false); return; }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = (delay: number) => {
      timers.push(setTimeout(() => {
        if (openRef.current) return;
        setShowHelpBubble(true);
        timers.push(setTimeout(() => setShowHelpBubble(false), 7000));
      }, delay));
    };
    schedule(5000); // 5 secondes après la connexion
    schedule(2 * 60 * 1000); // 2 minutes après
    schedule(5 * 60 * 1000); // 5 minutes après (dernière relance)
    return () => timers.forEach(clearTimeout);
  }, [visible]);

  useEffect(() => {
    if (open) setShowHelpBubble(false);
  }, [open]);

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

  // Glisser-déposer du widget (souris + tactile) : le bouton (et la bulle d'aide)
  // peuvent être déplacés n'importe où dans la fenêtre pour ne jamais gêner la
  // lecture ou le clic sur le contenu de la page. La position est mémorisée.
  useEffect(() => {
    const handleMove = (clientX: number, clientY: number) => {
      if (!draggingRef.current) return;
      movedRef.current = true;
      setPos(clampPos({ x: clientX - dragOffsetRef.current.x, y: clientY - dragOffsetRef.current.y }));
    };
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) handleMove(t.clientX, t.clientY);
    };
    const onRelease = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setPos((p) => {
        try { localStorage.setItem(POSITION_KEY, JSON.stringify(p)); } catch { /* ignore */ }
        return p;
      });
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onRelease);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onRelease);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onRelease);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onRelease);
    };
  }, []);

  const startDrag = (clientX: number, clientY: number) => {
    draggingRef.current = true;
    movedRef.current = false;
    dragOffsetRef.current = { x: clientX - pos.x, y: clientY - pos.y };
  };

  const handleToggle = () => {
    if (movedRef.current) { movedRef.current = false; return; } // c'était un glissé, pas un clic
    setShowHelpBubble(false);
    setOpen((o) => !o);
  };

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

  // Le panneau de chat et la bulle d'aide s'ouvrent du côté où il y a de la
  // place (haut/bas, gauche/droite) pour ne jamais sortir de l'écran, quelle
  // que soit la position du bouton une fois déplacé.
  const nearRightEdge = pos.x + BUTTON_SIZE / 2 > window.innerWidth / 2;
  const nearBottomEdge = pos.y + PANEL_HEIGHT + BUTTON_SIZE + MARGIN > window.innerHeight;

  const panelStyle: React.CSSProperties = {
    position: "fixed",
    ...(nearRightEdge
      ? { right: Math.max(MARGIN, window.innerWidth - pos.x - BUTTON_SIZE) }
      : { left: pos.x }),
    ...(nearBottomEdge
      ? { bottom: Math.max(MARGIN, window.innerHeight - pos.y + 12) }
      : { top: pos.y + BUTTON_SIZE + 12 }),
  };

  return (
    <>
      {open && (
        <div
          style={panelStyle}
          className="z-50 w-[340px] sm:w-[380px] h-[520px] max-h-[70vh] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
        >
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

      <div style={{ position: "fixed", left: pos.x, top: pos.y }} className="z-50">
        {showHelpBubble && !open && (
          <button
            onClick={() => { setShowHelpBubble(false); setOpen(true); }}
            className={`absolute bg-white shadow-xl border border-gray-100 rounded-2xl px-4 py-2.5 text-sm font-medium text-gray-700 whitespace-nowrap animate-in fade-in slide-in-from-bottom-2 ${
              nearBottomEdge ? "top-16 rounded-tr-sm" : "bottom-16 rounded-br-sm"
            } ${nearRightEdge ? "right-0" : "left-0"}`}
          >
            Besoin d'aide ? 👋
          </button>
        )}

        <button
          onMouseDown={(e) => startDrag(e.clientX, e.clientY)}
          onTouchStart={(e) => { const t = e.touches[0]; if (t) startDrag(t.clientX, t.clientY); }}
          onClick={handleToggle}
          className="w-14 h-14 rounded-full shadow-xl flex items-center justify-center bg-white hover:scale-105 transition-transform overflow-hidden cursor-grab active:cursor-grabbing touch-none"
          aria-label="Ouvrir Qualios, l'assistant QalioFlex (glisser pour déplacer)"
        >
          {open ? <X size={22} style={{ color: "#25245e" }} /> : <img src={qualiosAvatar} alt="Qualios" className="w-full h-full object-contain p-1" />}
        </button>
      </div>
    </>
  );
};

export default ChatbotWidget;
