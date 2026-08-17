
import { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Info, ArrowRight, RotateCcw } from 'lucide-react';

interface DashboardCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  description?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  /**
   * Chemin vers une page de détail réelle (ex: "/formations"). Si renseigné,
   * une flèche apparaît sur la carte et l'amène directement à cette page.
   * Prioritaire sur `detail` si les deux sont fournis.
   */
  to?: string;
  /**
   * Explication de l'indicateur (calcul, source des données). Si `to` n'est
   * pas fourni, un bouton "i" fait pivoter la carte pour afficher ce texte
   * au dos, plutôt que de renvoyer vers une page.
   */
  detail?: string;
}

const DashboardCard = ({
  title,
  value,
  icon,
  description,
  trend,
  trendValue,
  to,
  detail,
}: DashboardCardProps) => {
  const [flipped, setFlipped] = useState(false);

  const frontFace = (
    <Card
      style={{ backfaceVisibility: 'hidden' }}
      className="h-full"
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="flex items-center gap-2">
          {icon && <div className="h-4 w-4 text-muted-foreground">{icon}</div>}
          {to && (
            <Link
              to={to}
              aria-label={`Voir le détail : ${title}`}
              title="Voir le détail"
              className="text-muted-foreground hover:text-exsenco-blue transition-colors"
            >
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
          {!to && detail && (
            <button
              type="button"
              aria-label={`En savoir plus sur ${title}`}
              title="En savoir plus"
              onClick={() => setFlipped(true)}
              className="text-muted-foreground hover:text-exsenco-blue transition-colors"
            >
              <Info className="h-4 w-4" />
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {(description || trend) && (
          <div className="flex items-center space-x-2">
            {trend && (
              <span
                className={`text-xs ${
                  trend === 'up'
                    ? 'text-green-500'
                    : trend === 'down'
                    ? 'text-red-500'
                    : 'text-gray-500'
                }`}
              >
                {trend === 'up' && '↑ '}
                {trend === 'down' && '↓ '}
                {trendValue}
              </span>
            )}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );

  // Pas de flip disponible (ni lien, ni explication) : carte simple, inchangée.
  if (!detail) {
    return to ? frontFace : (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {icon && <div className="h-4 w-4 text-muted-foreground">{icon}</div>}
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{value}</div>
          {(description || trend) && (
            <div className="flex items-center space-x-2">
              {trend && (
                <span
                  className={`text-xs ${
                    trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-gray-500'
                  }`}
                >
                  {trend === 'up' && '↑ '}
                  {trend === 'down' && '↓ '}
                  {trendValue}
                </span>
              )}
              {description && <p className="text-xs text-muted-foreground">{description}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div style={{ perspective: '1200px' }} className="h-full">
      <div
        style={{
          position: 'relative',
          height: '100%',
          transformStyle: 'preserve-3d',
          transition: 'transform 0.5s',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {frontFace}

        {/* Dos de la carte : explication de l'indicateur */}
        <Card
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
          className="bg-exsenco-blue/5 border-exsenco-blue/20"
        >
          <CardContent className="p-4 h-full flex flex-col justify-between">
            <div>
              <p className="text-xs font-medium text-exsenco-blue mb-1">{title}</p>
              <p className="text-xs text-gray-600 leading-relaxed">{detail}</p>
            </div>
            <button
              type="button"
              aria-label="Revenir à l'indicateur"
              onClick={() => setFlipped(false)}
              className="self-end mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-exsenco-blue transition-colors"
            >
              <RotateCcw className="h-3 w-3" /> Retour
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardCard;
