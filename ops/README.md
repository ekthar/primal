# Primal ops scripts

Operator scripts for the production VM. None of these are wired into the app
build — they're intended to be installed once on the host and invoked by an
admin or by `systemd`.

| Script                          | Purpose                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `scripts/primal-deploy`         | Pull main, install deps, run migrations, restart `primal-api`.                            |
| `scripts/primal-reset-db`       | Wipe all application data while preserving admin user logins.                             |
| `scripts/primal-backup`         | `pg_dump` to `/var/backups/primal`, optional S3 upload, retention prune.                  |
| `systemd/primal-backup.service` | Oneshot unit that runs `primal-backup`.                                                   |
| `systemd/primal-backup.timer`   | Calendar timer that fires the service nightly at 02:30 UTC.                               |

## One-time install on the VM

```bash
sudo install -m 0755 ops/scripts/primal-deploy   /usr/local/bin/primal-deploy
sudo install -m 0755 ops/scripts/primal-reset-db /usr/local/bin/primal-reset-db
sudo install -m 0755 ops/scripts/primal-backup   /usr/local/bin/primal-backup

sudo install -m 0644 ops/systemd/primal-backup.service /etc/systemd/system/primal-backup.service
sudo install -m 0644 ops/systemd/primal-backup.timer   /etc/systemd/system/primal-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now primal-backup.timer
```

After install:

```bash
# verify the timer is armed
systemctl list-timers | grep primal-backup

# run a backup right now to confirm it works
sudo /usr/local/bin/primal-backup
ls -lh /var/backups/primal/
```

## Environment variables (read from `/etc/primal/api.env`)

The env file must contain only `KEY=VALUE` entries, with no shell commands. Use
quotes for values containing spaces or angle brackets, for example
`RESEND_FROM="Primal <no-reply@example.com>"`.

| Variable                         | Purpose                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `DATABASE_URL`                   | Used by `primal-reset-db` and `primal-backup`.                                            |
| `PRIMAL_BACKUP_S3_BUCKET`        | If set, `primal-backup` also uploads to `s3://<bucket>/<host>/<file>`. Optional.          |
| `PRIMAL_BACKUP_RETENTION_DAYS`   | Override retention (default 14).                                                          |

## Resetting the database

`primal-reset-db` refuses to run without `--yes`. It wraps the wipe in a single
transaction with a guard that rolls back if there are zero admin users — so you
cannot lock yourself out by accident.

```bash
sudo primal-reset-db --yes
sudo systemctl restart primal-api
```
