-- Correctif audit du 31/07 (point non bloquant #60) : Qualiopi impose de ne pas
-- laisser des formations "publiées" sans revue depuis le dernier audit de
-- surveillance. On ajoute la date du dernier audit de surveillance sur
-- l'organisme (saisie manuelle par le formateur, page Profil), et une bascule
-- automatique (Edge Function archiver-formations-surveillance, appelée par une
-- tâche planifiée mensuelle) archive les formations non mises à jour depuis
-- cette date, 18 mois après celle-ci.

alter table public.organismes
  add column if not exists date_dernier_audit_surveillance date;

comment on column public.organismes.date_dernier_audit_surveillance is
  'Date du dernier audit de surveillance Qualiopi passé par l''organisme. Sert de référence pour l''archivage automatique (18 mois après cette date) des formations non mises à jour depuis.';
