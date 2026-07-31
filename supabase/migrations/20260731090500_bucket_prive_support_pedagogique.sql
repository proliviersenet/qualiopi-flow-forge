-- Correctif audit juillet 2026 : le support pédagogique doit être réellement
-- inaccessible à un stagiaire tant que SON émargement n'est pas signé, pas
-- juste masqué dans l'UI. L'ancien mécanisme (FormationDetail.tsx ligne ~98)
-- utilisait getPublicUrl() sur le bucket "documents-qualiopi", lisible par
-- quiconque possède l'URL, verrou visuel ou pas.
--
-- Le bucket "documents-qualiopi" existant RESTE PUBLIC et INCHANGÉ (logos des
-- organismes affichés sur les pages publiques Positionnement.tsx /
-- EvaluationPublic.tsx, programme, trame...) : on isole uniquement le support
-- pédagogique dans un NOUVEAU bucket privé dédié, pour ne rien casser des flux
-- existants (formateur, client) qui dépendent de l'URL publique stockée en
-- base pour les autres types de documents.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents-qualiopi-support',
  'documents-qualiopi-support',
  false,
  20971520, -- 20 Mo
  array['application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = array['application/pdf'];

-- Aucun accès anonyme/public : seuls les comptes authentifiés (formateur/admin
-- côté back-office, client côté espace-client) peuvent lire/écrire directement
-- ce bucket. Les stagiaires n'ont JAMAIS de session Supabase Auth (accès
-- uniquement par pages publiques à token) : ils ne peuvent donc jamais
-- satisfaire "TO authenticated" et passent obligatoirement par l'Edge Function
-- support-public (clé service_role, qui contourne cette RLS après avoir
-- vérifié le statut d'émargement du stagiaire demandeur).

drop policy if exists "support_prive_lecture_authentifie" on storage.objects;
create policy "support_prive_lecture_authentifie"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'documents-qualiopi-support');

drop policy if exists "support_prive_upload_authentifie" on storage.objects;
create policy "support_prive_upload_authentifie"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'documents-qualiopi-support');

drop policy if exists "support_prive_maj_authentifie" on storage.objects;
create policy "support_prive_maj_authentifie"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'documents-qualiopi-support')
  with check (bucket_id = 'documents-qualiopi-support');

drop policy if exists "support_prive_suppression_authentifie" on storage.objects;
create policy "support_prive_suppression_authentifie"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'documents-qualiopi-support');
