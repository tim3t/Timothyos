# pstack in TimothyOS

Lauren Tan's pstack (MIT, `LICENSE` here, copyright Lauren Tan), copied from the Claude Code tree of the official source so it loads in cloud sessions, which don't load plugins. Approved by Timothy on 16 Nov 2026.

- **Source:** https://github.com/cursor/plugins, `harness/pstack/claude-code/`, commit `bf0c7cd80abdbf7fe47b634978a7d1b4071f71a7` (14 Nov 2026), pstack 0.15.42. The upstream README is `README-upstream.md`.
- **Where it went:** `.claude/skills/` (52 skills), `.claude/agents/` (`poteto-agent`, `comment-sicko`), `.claude/docs/harness/claude-code.md` (the adapter the skills link to) and `.claude/docs/guide/` (the guide's text; its images are left out).
- **Left out:** `statechart`, `create-formal-verification-skill`, `maintain-formal-verification-skill` (TLA+ tooling that installs Java; about 4 MB), `make-bot-ui` (binds every network interface and installs software with sudo), `typescript-best-practices` (no TypeScript here), `ketchup-video`, and the guide's images. Plugin hooks and settings are not copied: nothing runs on its own.
- **Changed here:** a "TimothyOS overrides" section at the top of `skills/poteto-mode/SKILL.md` and `skills/automate-me/SKILL.md`, and an "In TimothyOS" section at the end of the adapter. Nothing else is edited.
- **Updating:** clone `cursor/plugins` at a newer commit, copy the same set over, put the three local sections back, update the commit above, and read the diff before committing. Never copy hooks or `settings.json` from upstream without asking Timothy.
