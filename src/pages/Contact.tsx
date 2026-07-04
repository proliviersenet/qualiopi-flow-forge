import { useState } from "react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const Contact = () => {
  const { toast } = useToast();
  const [form, setForm] = useState({ nom: "", email: "", sujet: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nom || !form.email || !form.message) {
      toast({
        title: "Champs manquants",
        description: "Merci de renseigner votre nom, email et message.",
        variant: "destructive",
      });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast({ title: "Email invalide", description: "Vérifiez votre adresse email.", variant: "destructive" });
      return;
    }

    setSending(true);

    try {
      // Envoi via Formspree (gratuit, 50 messages/mois, zéro backend, zéro clé API)
      // ⚠️ Remplacer YOUR_FORM_ID par l'ID de votre formulaire Formspree
      const res = await fetch("https://formspree.io/f/YOUR_FORM_ID", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          nom: form.nom,
          email: form.email,
          sujet: form.sujet || "(sans objet)",
          message: form.message,
          _subject: `[QalioFlex] ${form.sujet || "Nouveau message"}`,
        }),
      });

      if (res.ok) {
        setSent(true);
        setForm({ nom: "", email: "", sujet: "", message: "" });
      } else {
        throw new Error("Erreur serveur");
      }
    } catch {
      // Fallback mailto si Formspree non configuré
      const body = `Nom : ${form.nom}\nEmail : ${form.email}\n\n${form.message}`;
      window.location.href = `mailto:olivier.senet@prospactive.com?subject=${encodeURIComponent("[QalioFlex] " + (form.sujet || "Contact"))}&body=${encodeURIComponent(body)}`;
      toast({
        title: "Client mail ouvert",
        description: "Le formulaire d'envoi automatique n'est pas encore configuré — votre client mail a été ouvert en alternative.",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header user={{ name: "", email: "", profileImage: "" }} onLogout={() => {}} />
      <main className="flex-grow bg-gray-50 py-12">
        <div className="container mx-auto px-4 max-w-2xl">
          <Link to="/" className="text-exsenco-blue hover:text-blue-800 text-sm">&larr; Retour</Link>
          <h1 className="text-3xl font-bold mt-4 mb-2" style={{ color: "#25245e" }}>Nous contacter</h1>
          <p className="text-gray-500 mb-8">Une question, un bug, une suggestion ? On répond sous 24h ouvrées.</p>

          {sent ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
              <p className="text-3xl mb-3">✅</p>
              <h2 className="text-xl font-bold text-green-800 mb-2">Message envoyé !</h2>
              <p className="text-green-700 text-sm mb-4">Merci {form.nom || ""}. On vous répond dans les 24h ouvrées.</p>
              <button
                onClick={() => setSent(false)}
                className="text-sm text-green-600 hover:underline"
              >
                Envoyer un autre message
              </button>
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-8">
              <div className="md:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Nom <span className="text-red-500">*</span></Label>
                      <Input name="nom" value={form.nom} onChange={handleChange} placeholder="Prénom Nom" />
                    </div>
                    <div className="space-y-2">
                      <Label>Email <span className="text-red-500">*</span></Label>
                      <Input name="email" type="email" value={form.email} onChange={handleChange} placeholder="vous@exemple.fr" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Sujet</Label>
                    <Input name="sujet" value={form.sujet} onChange={handleChange} placeholder="Ex : Question sur le BPF" />
                  </div>
                  <div className="space-y-2">
                    <Label>Message <span className="text-red-500">*</span></Label>
                    <Textarea name="message" value={form.message} onChange={handleChange} placeholder="Décrivez votre demande..." rows={5} />
                  </div>
                  <Button
                    type="submit"
                    disabled={sending}
                    style={{ background: "#f2901e", color: "#fff" }}
                    className="font-bold w-full"
                  >
                    {sending ? "Envoi en cours..." : "Envoyer le message"}
                  </Button>
                </form>
              </div>

              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <p className="text-xs text-gray-400 uppercase font-semibold mb-2">Email direct</p>
                  <a href="mailto:olivier.senet@prospactive.com" className="text-exsenco-blue hover:underline text-sm break-all">
                    olivier.senet@prospactive.com
                  </a>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <p className="text-xs text-gray-400 uppercase font-semibold mb-2">Téléphone</p>
                  <a href="tel:+33607467409" className="text-exsenco-blue hover:underline text-sm">
                    06 07 46 74 09
                  </a>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <p className="text-xs text-gray-400 uppercase font-semibold mb-2">Éditeur</p>
                  <p className="text-sm text-gray-600">
                    SARL EXSENCO<br />
                    80 rue du Nouveau Bois<br />
                    37550 Saint-Avertin
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Délai de réponse</p>
                  <p className="text-sm font-semibold" style={{ color: "#25245e" }}>⏱ 24h ouvrées</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Contact;
