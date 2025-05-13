
import { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import DashboardCard from '@/components/DashboardCard';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";

const mockUser = {
  name: "Jean Dupont",
  email: "jean@formationpro.fr",
  profileImage: "",
};

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState("vue-generale");

  // Données pour les statistiques
  const statsData = [
    {
      title: "Formations actives",
      value: "12",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      ),
      trend: "up" as "up",
      trendValue: "+2 ce mois"
    },
    {
      title: "Apprenants actifs",
      value: "145",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      ),
      trend: "up" as "up",
      trendValue: "+23 ce mois"
    },
    {
      title: "Sessions terminées",
      value: "38",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      trend: "neutral" as "neutral",
      trendValue: "Même nombre"
    },
    {
      title: "Taux de satisfaction",
      value: "91%",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
        </svg>
      ),
      trend: "up" as "up",
      trendValue: "+2% ce mois"
    },
  ];

  // Données pour les graphiques
  const monthlyData = [
    { name: 'Jan', formateurs: 4, apprenants: 24 },
    { name: 'Fév', formateurs: 3, apprenants: 18 },
    { name: 'Mar', formateurs: 5, apprenants: 30 },
    { name: 'Avr', formateurs: 6, apprenants: 36 },
    { name: 'Mai', formateurs: 8, apprenants: 48 },
    { name: 'Juin', formateurs: 7, apprenants: 42 },
    { name: 'Juil', formateurs: 9, apprenants: 54 },
    { name: 'Août', formateurs: 8, apprenants: 48 },
    { name: 'Sep', formateurs: 10, apprenants: 60 },
    { name: 'Oct', formateurs: 12, apprenants: 72 },
    { name: 'Nov', formateurs: 11, apprenants: 66 },
    { name: 'Déc', formateurs: 13, apprenants: 78 },
  ];

  const satisfactionData = [
    { name: 'Très satisfait', value: 68 },
    { name: 'Satisfait', value: 23 },
    { name: 'Neutre', value: 5 },
    { name: 'Insatisfait', value: 3 },
    { name: 'Très insatisfait', value: 1 },
  ];

  const COLORS = ['#4CAF50', '#8BC34A', '#FFC107', '#FF9800', '#F44336'];

  return (
    <div className="flex flex-col min-h-screen">
      <Header user={mockUser} />
      
      <main className="flex-grow bg-gray-50 py-6">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Tableau de bord</h1>
            <div className="flex items-center mt-4 md:mt-0">
              <span className="text-gray-500 mr-2">Période:</span>
              <select className="border rounded-md bg-white px-3 py-1 text-sm">
                <option>30 derniers jours</option>
                <option>3 derniers mois</option>
                <option>6 derniers mois</option>
                <option>12 derniers mois</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {statsData.map((stat, index) => (
              <DashboardCard
                key={index}
                title={stat.title}
                value={stat.value}
                icon={stat.icon}
                trend={stat.trend}
                trendValue={stat.trendValue}
              />
            ))}
          </div>

          <Tabs 
            defaultValue="vue-generale" 
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList>
              <TabsTrigger value="vue-generale">Vue générale</TabsTrigger>
              <TabsTrigger value="formations">Formations</TabsTrigger>
              <TabsTrigger value="evaluations">Évaluations</TabsTrigger>
            </TabsList>
            
            <TabsContent value="vue-generale" className="space-y-6 mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="p-6">
                  <h3 className="text-lg font-medium mb-4">Croissance mensuelle</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="formateurs" name="Formateurs" fill="#3B82F6" />
                        <Bar dataKey="apprenants" name="Apprenants" fill="#60A5FA" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                
                <Card className="p-6">
                  <h3 className="text-lg font-medium mb-4">Satisfaction des apprenants</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={satisfactionData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {satisfactionData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
            </TabsContent>
            
            <TabsContent value="formations" className="mt-6">
              <Card className="p-6">
                <h3 className="text-lg font-medium mb-4">Aperçu des formations</h3>
                <p className="text-gray-500">Statistiques et données sur vos formations.</p>
              </Card>
            </TabsContent>
            
            <TabsContent value="evaluations" className="mt-6">
              <Card className="p-6">
                <h3 className="text-lg font-medium mb-4">Résultats des évaluations</h3>
                <p className="text-gray-500">Analyses des résultats d'évaluations des apprenants.</p>
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
