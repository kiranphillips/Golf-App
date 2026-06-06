
CREATE OR REPLACE FUNCTION public.create_group_safe(_name text, _kicker text DEFAULT NULL)
RETURNS TABLE(id uuid, invite_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _code text;
  _gid uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  _code := upper(substring(md5(random()::text || clock_timestamp()::text) for 6));
  INSERT INTO public.groups(name, kicker, owner_id, invite_code)
  VALUES (_name, _kicker, _uid, _code)
  RETURNING groups.id INTO _gid;

  INSERT INTO public.group_members(group_id, user_id, role)
  VALUES (_gid, _uid, 'admin')
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT _gid, _code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_group_safe(text, text) TO authenticated;
