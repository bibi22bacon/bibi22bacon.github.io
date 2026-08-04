# AGENTS.md

## Cursor Cloud specific instructions

This repo is a **Jekyll static site** using the [Chirpy] theme (a personal blog / GitHub Pages site). There is no backend or database — the only "service" is the local Jekyll dev server. Ruby 3.2 + Bundler are already installed in the environment, and gems are installed locally under `vendor/bundle` (Bundler is configured via `.bundle/config` with `BUNDLE_PATH: vendor/bundle`).

### Static assets submodule
CSS/JS libraries live in the `assets/lib` git submodule ([chirpy-static-assets]). It must be initialized or the site will render unstyled / with broken assets. The startup update script runs `git submodule update --init --recursive`; run it manually if `assets/lib` is empty.

### Run the dev server
Use the repo helper or Jekyll directly. Inside a container you must pass `--force_polling` for live-reload (the helper `tools/run.sh` does this automatically when it detects Docker):

```bash
bundle exec jekyll s -H 0.0.0.0 -P 4000 --force_polling
# or: bash tools/run.sh -H 0.0.0.0
```

The site is served at `http://127.0.0.1:4000/`.

### Build + test (lint)
`tools/test.sh` builds the site in production mode and runs `html-proofer` (link/image/script validation) — this mirrors the `Build and Deploy` GitHub Actions workflow:

```bash
bash tools/test.sh
```

### Gotchas
- **Future-dated posts are silently skipped.** Jekyll will not publish a post in `_posts/` whose front-matter `date` is later than the current time (you'll see a `Skipping: ... has a future date` warning). Give new posts a date/time at or before "now", or run the server with `--future`.
- Posts go in `_posts/` named `YYYY-MM-DD-title.md`; their public URL is `/posts/<title>/`.
- Bundler is configured for a local `vendor/bundle` path; do not run `bundle` with `sudo`.

[Chirpy]: https://github.com/cotes2020/jekyll-theme-chirpy
[chirpy-static-assets]: https://github.com/cotes2020/chirpy-static-assets
