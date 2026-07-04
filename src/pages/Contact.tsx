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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nom || !form.email || !form.message) {
      toast({ title: "Champs manquants", description: "Merci de remplir tous les champs obligatoires.", variant: "destructive" });
      return;
    }
    setSending(true);
    // Envoi via mailto (Stripe/email service à brancher plus tard)
    window.location.href = `mailto:olivier.senet@prospactive.com?subject=${encodeURIComponent("[QalioFlex] " + form.sujet)}&body=${encodeURIComponent(`Nom : ${form.nom}\nEmail : ${form.email}\n\n${form.message}`)}`;
    setTimeout(() => {
      setSending(false);
      toast({ title: "Message prêt", description: "Votre client mail s'est ouvert avec le message pré-rempli." });
      setForm({ nom: "", email: "", sujet: "", message: "" });
    }, 1000);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header user={{ name: "", email: "", profileImage: "" }} onLogout={() => {}} />
      <main className="flex-grow bg-gray-50 py-12">
        <div className="container mx-auto px-4 max-w-2xl">
          <Link to="/" className="text-exsenco-blue hover:text-blue-800 text-sm">&larr; Retour</Link>
          <h1 className="text-3xl font-bold mt-4 mb-2" style={{ color: "#25245e" }}>Nous contacter</h1>
          <p className="text-gray-500 mb-8">Une question, un bug, une suggestion ? On vous répond sous 24h ouvrées.</p>

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
                  <Input name="sujet" value={form.sujet} onChange={handleChange} placeholder="Ex : Bug sur la page BPF" />
                </div>
                <div className="space-y-2">
                  <Label>Message <span className="text-red-500">*</span></Label>
                  <Textarea name="message" value={form.message} onChange={handleChange} placeholder="Décrivez votre demande..." rows={5} />
                </div>
                <Button type="submit" disabled={sending} style={{ background: "#f2901e", color: "#fff" }} className="font-bold w-full">
                  {sending ? "Ouverture du client mail..." : "Envoyer le message"}
                </Button>
              </form>
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs text-gray-400 uppercase font-semibold mb-2">Email direct</p>
                <a href="mailto:olivier.senet@prospactive.com" className="text-exsenco-blue hover:underline text-sm break-all">olivier.senet@prospactive.com</a>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs text-gray-400 uppercase font-semibold mb-2">Téléphone</p>
                <a href="tel:+33607467409" className="text-exsenco-blue hover:underline text-sm">06 07 46 74 09</a>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs text-gray-400 uppercase font-semibold mb-2">Éditeur</p>
                <p className="text-sm text-gray-600">SASU EXSENCO<br />80 rue du Nouveau Bois<br />37550 Saint-Avertin</p>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Contact;
