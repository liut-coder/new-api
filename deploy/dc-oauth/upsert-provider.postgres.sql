INSERT INTO custom_oauth_providers (
  name, slug, icon, enabled, client_id, client_secret,
  authorization_endpoint, token_endpoint, user_info_endpoint,
  scopes, user_id_field, username_field, display_name_field,
  email_field, well_known, auth_style, created_at, updated_at
) VALUES (
  'Universe Federation',
  'dc.hhhl.cc',
  'https://dc.hhhl.cc/client-assets/about-icon.png?v=uf3',
  TRUE,
  'dc-hhhl-app-auth',
  'replace-with-non-secret-client-secret-placeholder',
  'https://api.886888.best/dc-oauth/authorize',
  'https://api.886888.best/dc-oauth/token',
  'https://api.886888.best/dc-oauth/userinfo',
  'read:account',
  'id',
  'username',
  'name',
  '',
  '',
  0,
  NOW(),
  NOW()
)
ON CONFLICT(slug) DO UPDATE SET
  name=EXCLUDED.name,
  icon=EXCLUDED.icon,
  enabled=EXCLUDED.enabled,
  client_id=EXCLUDED.client_id,
  client_secret=EXCLUDED.client_secret,
  authorization_endpoint=EXCLUDED.authorization_endpoint,
  token_endpoint=EXCLUDED.token_endpoint,
  user_info_endpoint=EXCLUDED.user_info_endpoint,
  scopes=EXCLUDED.scopes,
  user_id_field=EXCLUDED.user_id_field,
  username_field=EXCLUDED.username_field,
  display_name_field=EXCLUDED.display_name_field,
  email_field=EXCLUDED.email_field,
  well_known=EXCLUDED.well_known,
  auth_style=EXCLUDED.auth_style,
  updated_at=NOW();

DROP TRIGGER IF EXISTS trg_no_unbind_dc_hhhl_cc ON user_oauth_bindings;

CREATE OR REPLACE FUNCTION fn_no_unbind_dc_hhhl_cc()
RETURNS trigger AS $$
BEGIN
  IF OLD.provider_id = (SELECT id FROM custom_oauth_providers WHERE slug = 'dc.hhhl.cc' LIMIT 1) THEN
    RAISE EXCEPTION 'dc.hhhl.cc OAuth binding cannot be unbound';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_no_unbind_dc_hhhl_cc
BEFORE DELETE ON user_oauth_bindings
FOR EACH ROW EXECUTE FUNCTION fn_no_unbind_dc_hhhl_cc();
