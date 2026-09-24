# EnvironmentSensor

## Deploying the website

[`website/`](website) is deployed to GitHub Pages by
[`.github/workflows/deploy-website.yml`](.github/workflows/deploy-website.yml)
on every push to `main` that touches `website/` or `shared-ui/` (or
manually via Actions → Deploy website to GitHub Pages → Run workflow). Two
one-time steps in this repo's GitHub settings are required before it can
succeed — see [`website/README.md`](website/README.md#deploying-to-github-pages)
for more on why.

1. **Add the two required repo secrets** — Settings → Secrets and
   variables → Actions → New repository secret:
   - `VITE_SUPABASE_URL` — e.g. `https://xxxx.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` — the project's anon/public key (safe to
     expose in the built client bundle — access is enforced by Supabase
     Row Level Security, not by keeping this key secret; see
     `website/README.md`)

2. **Enable Pages** — Settings → Pages → Source: **GitHub Actions** (not
   "Deploy from a branch" — the workflow uses `actions/deploy-pages`,
   which requires this source mode).

Once both are set, the site is live at:

```
https://the-notorious-pcb.github.io/EnvironmentSensor/
```