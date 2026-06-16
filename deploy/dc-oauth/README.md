# dc.hhhl.cc App Auth bridge

This directory contains the reproducible deployment files for the
dc.hhhl.cc App Auth bridge used by the `Universe Federation` custom OAuth
provider.

The bridge runs outside the `new-api` container as a systemd service and is
reached from the container through:

```env
DC_OAUTH_BRIDGE_URL=http://172.18.0.1:18092
```

Do not commit real App Auth secrets. Put them in `/etc/new-api/dc-oauth.env`.

## Files

- `server.js`: OAuth-like bridge that maps New API generic OAuth endpoints to
  Sharkey/Misskey App Auth.
- `run.sh`: service launcher; reads `/etc/new-api/dc-oauth.env` when present.
- `newapi-dc-oauth.service`: systemd unit template.
- `dc-oauth.env.example`: required environment variables without secrets.
- `upsert-provider.postgres.sql`: PostgreSQL provider/trigger template.

## Install

```bash
install -d -m 700 /opt/newapi-dc-oauth
install -m 644 deploy/dc-oauth/server.js /opt/newapi-dc-oauth/server.js
install -m 755 deploy/dc-oauth/run.sh /opt/newapi-dc-oauth/run.sh
install -m 644 deploy/dc-oauth/newapi-dc-oauth.service /etc/systemd/system/newapi-dc-oauth.service
install -m 600 deploy/dc-oauth/dc-oauth.env.example /etc/new-api/dc-oauth.env
```

Edit `/etc/new-api/dc-oauth.env` and set `APP_SECRET` to the App Auth secret
created on dc.hhhl.cc. Then:

```bash
systemctl daemon-reload
systemctl enable --now newapi-dc-oauth
```

Apply `upsert-provider.postgres.sql` to the New API PostgreSQL database after
replacing the public base URL/client secret placeholders if needed.
