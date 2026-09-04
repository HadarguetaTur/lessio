Before starting work:
1. Read `docs/README.md` — the index of what every doc in this repo is for.
2. Read `docs/sprint-roadmap.md`. It names the current sprint; read that sprint's
   `docs/sprint-<n>-scope.md` for the detailed source of truth. Never assume a
   sprint number — the roadmap is what says which one is live.
3. Check the roadmap before building anything. Do not rebuild completed work.
4. Read `docs/decisions.md` before changing architecture. Those decisions are
   closed; reopening one needs a reason, not an oversight.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
