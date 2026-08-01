-- Cron mensuel pour la nouvelle Edge Function archiver-formations-surveillance
-- (point non bloquant #60 : archivage automatique 18 mois après le dernier
-- audit de surveillance Qualiopi). Un contrôle quotidien serait inutile ici —
-- la fenêtre se joue en mois, pas en jours — donc cadence mensuelle, alignée
-- sur celle de la veille documentaire Qualiopi (veille-qualiopi-log, tâche
-- planifiée mensuelle existante).
--
-- Même convention que les crons existants (alerte-avant-formation, cf.
-- 20260731093100_cron_alerte_avant_formation.sql) : pas de Vault, juste
-- 'Content-Type' + 'x-cron-secret' avec la valeur en clair du secret
-- CRON_SECRET déjà configuré côté Edge Functions (secret partagé, pas de
-- nouveau secret à créer).
--
-- Horaire : le 1er de chaque mois à 7h00 UTC (9h00 heure d'été Paris), juste
-- après les autres crons quotidiens du matin (6h00-6h30 UTC).

select cron.schedule(
  'archiver-formations-surveillance-mensuel',
  '0 7 1 * *',
  $$
  select net.http_post(
    url := 'https://cvgosywcwqmsegdgjpqp.supabase.co/functions/v1/archiver-formations-surveillance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '3abe2780ee7c5970a43a6c345ab262c3f11ac621570032d77f442b7ece81b3b1'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
