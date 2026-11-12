-- L'index partiel ne peut pas servir de cible ON CONFLICT (upsert du webhook) :
-- remplacé par une contrainte d'unicité classique (les NULL restent autorisés).
drop index if exists public.exports_paiement_unique;
alter table public.exports add constraint exports_paiement_unique unique (paiement_id);
