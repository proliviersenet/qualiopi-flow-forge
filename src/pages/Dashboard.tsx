import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import DashboardCard from '@/components/DashboardCard';
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts";

const COLORS = ['#4CAF50', '#8BC34A', '#FFC107', '#FF9800', '#F44336'];

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [organisme, setOrganisme] = useState<Record<string, unknown> | null>(null);
  const [stats, setStats] = useState({
    formations: 0,
    sessions: 0,
    beneficiaires: 0,
    tauxSatisfaction: 0,
    documentsEnAttente: 0,
    relancesEnAttente: 0,
    questionnairesEnAttente: 0,
    indicateursOk: 0,
  });
  const [sessionsRecentes, setSessionsRecentes] = useState<Record<string, unknown>[]>([]);
  const [satisfactionData, setSatisfactionData] = useState<{ name: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      // Vérifier la session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate('/login'); return; }

      const u = session.user;
      setUser({ name: u.user_metadata?.nom_complet || u.email || '', email: u.email || '', profileImage: '' });

      // Récupérer le profil + organisme
      const { data: profile } = await supabase
        .from('profiles')
        .select('*, organisme_id')
        .eq('id', u.id)
        .single();

      if (profile?.organisme_id) {
        const { data: org } = await supabase
          .from('organismes')
          .select('*')
          .eq('id', profile.organisme_id)
          .single();
        setOrganisme(org);

        // Stats formations
        const { count: nbFormations } = await supabase
          .from('formations')
          .select('*', { count: 'exact', head: true })
          .eq('organisme_id', profile.organisme_id)
          .eq('statut', 'publie');

        // Stats sessions
        const { data: sessions } = await supabase
          .from('sessions')
          .select('id, statut, date_debut, date_fin, formations(titre)')
          .eq('formations.organisme_id', profile.organisme_id)
          .order('date_debut', { ascending: false })
          .limit(5);

        const { count: nbSessions } = await supabase
          .from('sessions')
          .select('*', { count: 'exact', head: true })
          .eq('statut', 'terminee');

        // Stats bénéficiaires
        const { count: nbBenef } = await supabase
          .from('beneficiaires')
          .select('*', { count: 'exact', head: true })
          .eq('organisme_id', profile.organisme_id);

        // Documents en attente de signature
        const { count: nbDocs } = await supabase
          .from('signatures')
          .select('*', { count: 'exact', head: true })
          .eq('statut', 'en_attente');

        // Relances en attente
        const { count: nbRelances } = await supabase
          .from('relances')
          .select('*', { count: 'exact', head: true })
          .eq('statut', 'planifiee')
          .lte('echeance', new Date().toISOString());

        // Questionnaires non complétés
        const { count: nbQuestionnaires } = await supabase
          .from('enquetes_preformation')
          .select('*', { count: 'exact', head: true })
          .eq('complete', false);

        // Indicateurs Qualiopi OK
        const { count: nbIndicateurs } = await supabase
          .from('checklist_items')
          .select('*', { count: 'exact', head: true })
          .eq('organisme_id', profile.organisme_id)
          .eq('statut', 'ok');

        // Taux de satisfaction (moyenne des notes)
        const { data: evals } = await supabase
          .from('evaluations_formations')
          .select('note_globale');
        const notes = (evals || []).map(e => e.note_globale).filter(Boolean);
        const tauxSat = notes.length > 0
          ? Math.round((notes.reduce((a: number, b: number) => a + b, 0) / notes.length / 5) * 100)
          : 0;

        setStats({
          formations: nbFormations || 0,
          sessions: nbSessions || 0,
          beneficiaires: nbBenef || 0,
          tauxSatisfaction: tauxSat,
          documentsEnAttente: nbDocs || 0,
          relancesEnAttente: nbRelances || 0,
          questionnairesEnAttente: nbQuestionnaires || 0,
          indicateursOk: nbIndicateurs || 0,
        });

        setSessionsRecentes((sessions || []) as Record<string, unknown>[]);

        // Données satisfaction pour graphique
        if (notes.length > 0) {
          const tranches = [0, 0, 0, 0, 0];
          notes.forEach((n: number) => {
            const idx = Math.min(4, Math.floor((n / 5) * 5));
            tranches[4 - idx]++;
          });
          setSatisfactionData([
            { name: 'Très satisfait', value: tranches[0] },
            { name: 'Satisfait', value: tranches[1] },
            { name: 'Neutre', value: tranches[2] },
            { name: 'Insatisfait', value: tranches[3] },
            { name: 'Très insatisfait', value: tranches[4] },
          ].filter(d => d.value > 0));
        }
      }
      setLoading(false);
    };
    init();
  }, [navigate]);

  const statsData = [
    {
      title: "Formations publiées",
      value: loading ? "..." : String(stats.formations),
      icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>,
      trend: "up" as "up",
      trendValue: "Actives"
    },
    {
      title: "Bénéficiaires",
      value: loading ? "..." : String(stats.beneficiaires),
      icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>,
      trend: "up" as "up",
      trendValue: "Total inscrits"
    },
    {
      title: "Sessions terminées",
      value: loading ? "..." : String(stats.sessions),
      icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
      trend: "neutral" as "neutral",
      trendValue: "Clôturées"
    },
    {
      title: "Taux de satisfaction",
      value: loading ? "..." : stats.tauxSatisfaction > 0 ? `${stats.tauxSatisfaction}%` : "—",
      icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" /></svg>,
      trend: "up" as "up",
      trendValue: "Évaluations reçues"
    },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <Header user={user || { name: '', email: '', profileImage: '' }} />
      <main className="flex-grow bg-gray-50 py-6">
        <div className="container mx-auto px-4">

          {/* En-tête avec nom organisme */}
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Tableau de bord</h1>
              {organisme && (
                <p className="text-gray-500 mt-1">
                  {organisme.raison_sociale as string} — NDA {organisme.nda as string || 'Non renseigné'}
                </p>
              )}
            </div>
          </div>

          {/* Alertes actions requises */}
          {!loading && (stats.documentsEnAttente > 0 || stats.relancesEnAttente > 0 || stats.questionnairesEnAttente > 0) && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="font-medium text-amber-800 mb-2">Actions requises</p>
              <div className="flex flex-wrap gap-3 text-sm text-amber-700">
                {stats.documentsEnAttente > 0 && <span>✍️ {stats.documentsEnAttente} document(s) en attente de signature</span>}
                {stats.relancesEnAttente > 0 && <span>📧 {stats.relancesEnAttente} relance(s) à envoyer</span>}
                {stats.questionnairesEnAttente > 0 && <span>📋 {stats.questionnairesEnAttente} questionnaire(s) non complété(s)</span>}
              </div>
            </div>
          )}

          {/* Cartes stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {statsData.map((stat, index) => (
              <DashboardCard key={index} title={stat.title} value={stat.value} icon={stat.icon} trend={stat.trend} trendValue={stat.trendValue} />
            ))}
          </div>

          <Tabs defaultValue="vue-generale" className="w-full">
            <TabsList>
              <TabsTrigger value="vue-generale">Vue générale</TabsTrigger>
              <TabsTrigger value="sessions">Sessions récentes</TabsTrigger>
              <TabsTrigger value="conformite">Conformité Qualiopi</TabsTrigger>
            </TabsList>

            <TabsContent value="vue-generale" className="space-y-6 mt-6">
              {satisfactionData.length > 0 ? (
                <Card className="p-6">
                  <h3 className="text-lg font-medium mb-4">Satisfaction des bénéficiaires</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={satisfactionData} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} outerRadius={80} dataKey="value">
                          {satisfactionData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <Tooltip /><Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              ) : (
                <Card className="p-6 text-center text-gray-500">
                  <p className="text-4xl mb-3">📊</p>
                  <p className="font-medium">Aucune donnée de satisfaction pour l'instant</p>
                  <p className="text-sm mt-1">Les graphiques s'alimenteront automatiquement après vos premières sessions.</p>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="sessions" className="mt-6">
              <Card className="p-6">
                <h3 className="text-lg font-medium mb-4">Sessions récentes</h3>
                {sessionsRecentes.length > 0 ? (
                  <div className="space-y-3">
                    {sessionsRecentes.map((s: Record<string, unknown>) => (
                      <div key={s.id as string} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-sm">{(s.formations as Record<string, string>)?.titre || 'Formation'}</p>
                          <p className="text-xs text-gray-500">{s.date_debut as string} → {s.date_fin as string}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          s.statut === 'terminee' ? 'bg-green-100 text-green-700' :
                          s.statut === 'en_cours' ? 'bg-exsenco-orange-light text-exsenco-blue' :
                          'bg-gray-100 text-gray-600'
                        }`}>{s.statut as string}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">Aucune session pour l'instant. <a href="/formations/creation" className="text-exsenco-blue hover:underline">Créer votre première formation</a></p>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="conformite" className="mt-6">
              <Card className="p-6">
                <h3 className="text-lg font-medium mb-2">Conformité Qualiopi</h3>
                <p className="text-sm text-gray-500 mb-4">Indicateurs validés dans votre checklist</p>
                <div className="flex items-center gap-4">
                  <div className="text-4xl font-bold text-exsenco-blue">{stats.indicateursOk}</div>
                  <div className="text-gray-500 text-sm">indicateurs validés<br />sur 32 au référentiel</div>
                  <div className="flex-1 bg-gray-200 rounded-full h-3">
                    <div className="bg-exsenco-blue h-3 rounded-full transition-all" style={{ width: `${(stats.indicateursOk / 32) * 100}%` }}></div>
                  </div>
                  <div className="text-sm font-medium">{Math.round((stats.indicateursOk / 32) * 100)}%</div>
                </div>
                {stats.indicateursOk === 0 && (
                  <p className="text-sm text-gray-500 mt-4">La checklist se complète automatiquement au fur et à mesure de votre activité.</p>
                )}
              </Card>
            </TabsContent>
          </Tabs>

        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Dashboard;
