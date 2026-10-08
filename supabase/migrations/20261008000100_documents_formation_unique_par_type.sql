-- Retour terrain Olivier (07/10/2026) : la trame pédagogique générée
-- "disparaissait" quelques instants après sa génération. Cause racine :
-- generer-trame/index.ts faisait un .upsert(..., {onConflict:
-- "formation_id,type"}) sur documents_formation, mais cette table n'a jamais
-- eu d'index unique sur (formation_id, type) — seulement sa clé primaire id.
-- Postgres rejetait donc la cible ON CONFLICT ; l'erreur était seulement
-- loguée côté serveur (jamais renvoyée au front), si bien que la fonction
-- répondait quand même success:true avec la trame en HTML, affichée en local
-- côté React — mais rien n'était réellement persisté en base. Le code
-- (commentaires de FormationDetail.tsx et de generer-trame) supposait depuis
-- longtemps qu'un tel index existait ; il n'avait en réalité jamais été créé.
--
-- Corrigé ici en deux temps : l'index manquant est ajouté (permet aussi de
-- repasser plus tard sur un simple upsert si besoin), et generer-trame /
-- FormationDetail.tsx sont corrigés pour faire un select puis insert/update
-- explicite, à l'identique du pattern déjà utilisé par uploadDocument().
--
-- Partiel (WHERE session_id IS NULL) : documents_formation sert aussi à des
-- documents rattachés à une session précise, qui peuvent légitimement
-- partager le même (formation_id, type) qu'un document "formation-level".

create unique index if not exists documents_formation_formation_id_type_session_null_key
  on public.documents_formation (formation_id, type)
  where session_id is null;
