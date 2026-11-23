# Backups

Every Sunday, `.github/workflows/backup.yml` makes one encrypted backup of everything needed to bring the
site back after data loss or a bad change. Backups are kept for 90 days.

Every other night (since 2026-11-23) it also makes a smaller one: every table and member account, without the
uploaded pictures, kept 14 days. So at most one day of data can be lost. Names end in `-full` or `-data`.

| Part | Where it lives | In the weekly backup |
|---|---|---|
| Website code and pages | GitHub (this repository) | Already safe in git |
| Every database table (listings, events, news, subscribers, reviews, outreach, ...) | Supabase | Yes, `data.json.gz` |
| Member accounts (ids, emails) | Supabase Auth | Yes, in `data.json.gz` (passwords are never readable: members reset them after a restore) |
| Uploaded pictures (listing, event and memorial photos) | Supabase Storage | Yes, `storage/` |
| Database structure (tables, security rules, functions) | Supabase | Yes, `schema.sql`, once `SUPABASE_DB_URL` is set |

## One-time setup

1. Pick a long passphrase and keep it in your password manager. Without it a backup cannot be opened.
2. Set it as a GitHub secret (in the Sophia_Commons folder): `gh secret set BACKUP_PASSPHRASE`
3. Optional, for the database structure: Supabase dashboard > Connect > "Session pooler" connection string
   (with the database password filled in), then `gh secret set SUPABASE_DB_URL`
4. Run it once by hand: GitHub > Actions > "Nightly backup (encrypted)" > Run workflow.

## Opening a backup

1. GitHub > Actions > "Nightly backup (encrypted)" > pick a run > Artifacts > download it, and unzip.
2. Decrypt and unpack:
   ```
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in sophia-commons-backup-DATE.tar.gz.enc | tar -xzf - -C restore/
   ```
3. Check it: `gunzip -c restore/data.json.gz | python3 -c "import json,sys; print(json.load(sys.stdin)['counts'])"`

## Bringing the site back

- **One table or a few rows lost:** take those rows from `data.json.gz` and insert them again (ask Claude).
- **Pictures lost:** upload the files in `storage/<bucket>/` to the same bucket and path.
- **Whole database lost:** create the structure from `schema.sql` (or the files in `backend/migrations/`),
  load the tables from `data.json.gz`, then the pictures. Members sign in again with "forgot password".
- **Website files:** redeploy from git with `./deploy.sh`.
