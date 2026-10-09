-- SECURITY: public.admin_members(pin) was SECURITY DEFINER and executable by
-- anon, returning every fan's name + email + town to anyone holding a PIN that
-- had been printed in the public repo. Staff HQ already falls back to the
-- server-side list-members function (service key). Applied to production
-- 2026-10-09. Reversible: grant execute ... to anon — but don't.
revoke execute on function public.admin_members(text) from public, anon, authenticated;
