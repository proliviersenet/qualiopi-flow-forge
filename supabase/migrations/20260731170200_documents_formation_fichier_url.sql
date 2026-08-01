-- Correctif audit du 31/07 (point non bloquant #62) : jusqu'ici QalioFlex ne
-- savait que GÉNÉRER les documents (contenu_html). Certains formateurs ont déjà
-- leur convention/devis (rédigés hors QalioFlex, ou déjà signés) — on leur
-- permet désormais de les importer tels quels (PDF/Word), stockés dans le
-- bucket documents-qualiopi et référencés ici, plutôt que de forcer une
-- régénération automatique qui écraserait leur propre document.

alter table public.documents_formation
  add column if not exists fichier_url text;

comment on column public.documents_formation.fichier_url is
  'URL du fichier importé tel quel par le formateur (convention/devis déjà existants), en alternative à contenu_html (document généré automatiquement par QalioFlex). Utilisé quand la formation est en document_mode = ''import''.';
