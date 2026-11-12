revoke execute on function public.fn_est_membre_organisme(uuid) from public, anon;
grant execute on function public.fn_est_membre_organisme(uuid) to authenticated, service_role;
