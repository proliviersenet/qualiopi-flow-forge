-- Cron quotidien pour la nouvelle Edge Function alerte-avant-formation.
--
-- Convention vérifiée EN DIRECT le 31/07/2026 (select jobid, jobname, schedule,
-- command from cron.job order by jobid, exécuté par Claude en lecture seule)
-- sur les 2 jobs les plus proches de celui-ci (relance-documents-quotidien,
-- relance-eval-froid-quotidien) : PAS de Vault, PAS d'en-tête apikey/Authorization
-- Bearer — juste 'Content-Type' + 'x-cron-secret' avec la valeur du secret
-- CRON_SECRET écrite EN CLAIR dans la commande cron.schedule (comme les 4 jobs
-- existants, tous créés à la main depuis le SQL Editor, sans migration associée
-- — cf. CONTEXT.md). On reproduit ici exactement la même convention plutôt que
-- d'en introduire une 5e différente.
--
-- Horaire : pg_cron s'exécute en UTC par défaut. 6h30 UTC = 8h30 heure d'été
-- Paris (UTC+2) — juste après relance-documents-quotidien (6h15 UTC) et
-- relance-eval-froid-quotidien / relance-eval-formateur-auto-quotidien (6h00 UTC).

select cron.schedule(
  'alerte-avant-formation-quotidien',
  '30 6 * * *',
  $$
  select net.http_post(
    url := 'https://cvgosywcwqmsegdgjpqp.supabase.co/functions/v1/alerte-avant-formation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '3abe2780ee7c5970a43a6c345ab262c3f11ac621570032d77f442b7ece81b3b1'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
