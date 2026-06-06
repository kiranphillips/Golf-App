
REVOKE EXECUTE ON FUNCTION public.find_group_by_code(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.request_join_by_code(text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.approve_join_request(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.randomize_fourballs(uuid, int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.find_group_by_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_join_by_code(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_join_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.randomize_fourballs(uuid, int) TO authenticated;
