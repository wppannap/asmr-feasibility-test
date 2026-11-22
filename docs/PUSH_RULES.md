# PUSH BLOCK (run at the end of every task)

A. Preconditions: `verify_web_data.py` shows 0 failed and the `web/` leak scan passes (skip only if this task changed no file under `web/` and no script that feeds it). Otherwise do NOT push; report why.

B. Identity: `git config user.name` and `git config user.email` must match the author of the last commit on the `publish` branch; do not change them. Never add "Co-authored-by", "Generated with" or any Cursor/AI attribution to commit messages or trailers.

C. Hook: ensure `.git/hooks/commit-msg` exists, is executable, and contains:

```sh
#!/bin/sh
sed -i.bak '/^[Cc]o-[Aa]uthored-[Bb]y:/d' "$1" && rm -f "$1.bak"
```

D. Safety scan before staging: list tracked files and the files about to be added. Refuse to stage and tell me if any of these appear: `.env`; any raw data under `data/` containing comment text, channel ids or creator hashes (`yt_comments_sample*`, `yt_master*`, `yt_channel*`, `douyin_trial/`, `tiktok_trial/`, MediaCrawler outputs); files > 5 MB; strings matching `AIza` or other API-key patterns. Print repo visibility if `gh` is available. Do not rewrite history; if raw files are already in history, report their paths and stop.

E. If `web/data` changed, regenerate `config/DATA_FREEZE.md` first. Commit with a short imperative message of your own (no trailers), run `git log -1 --format=full`, and show that `git log -1 --format=%B | grep -ic co-authored` prints 0. Push with a normal `git push` to the existing `publish` branch (no `--force`). Print commit hash, branch, remote URL and the Pages URL.
