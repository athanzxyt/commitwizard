You are building a globally-installable CLI tool named `commitwizard`.

Goal
- Users can run `commitwizard` in ANY git repo.
- It should launch an interactive wizard that generates a Conventional Commit message and executes `git commit`.
- It must also support an optional flag that opens an interactive “stage files” picker where users can choose which files to stage using arrow keys and Enter to toggle selection.

Tech constraints
- Use Node.js (ESM) and publishable as an npm global CLI.
- Use `inquirer` (or @inquirer/*) for prompts, and `execa` for running git commands.
- Use a temp file + `git commit -F <file>` so multi-line messages are preserved.
- Make code robust and user-friendly (clear errors, handles not-a-git-repo, etc.)
- Provide complete code (all files) and exact install/run instructions.

CLI spec
1) Command name: `commitwizard`
2) Options:
   - `--pick` (or `-p`): open file staging picker before the commit wizard
   - `--dry-run`: show the commit message and git commands but do not run them
3) When run without `--pick`:
   - If no staged changes exist, ask: “No staged changes found. Stage all changes (git add -A)?” (yes/no)
4) When run with `--pick`:
   - Show an interactive checklist of changed files (both staged and unstaged changes):
     - Use arrow keys to navigate
     - Use Space or Enter to toggle selection (checked/unchecked)
     - Confirm selection to stage exactly those files
   - Implementation details:
     - Get file status via `git status --porcelain`
     - Parse the output (handle renames and spaces)
     - Present choices with status prefixes like "M  src/index.js" / "?? newfile.txt"
     - On confirm, stage selected files:
       - For untracked files: `git add -- <file>`
       - For modified/deleted/renamed: `git add -- <file>` (and ensure deletions are staged properly)
     - If user selects nothing, don’t stage anything and continue (but if nothing staged, warn and allow abort)
5) Commit wizard prompts (Conventional Commits):
   - Choose type from:
     build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test
   - Input optional scope
   - Input required short description (validate: non-empty; recommend <=72 chars; no trailing period)
   - Ask if breaking change (yes/no)
     - If yes: add `!` after type/scope and prompt for breaking change details -> add `BREAKING CHANGE: ...` footer
   - Ask for optional body (open editor prompt; user can save/close; empty allowed)
   - Ask for optional issue refs (comma-separated, e.g. #123, #456) -> add footer `Refs: #123, #456`
   - Ask for optional closes (comma-separated, e.g. #123) -> add footer lines `Closes #123`
   - Ask toggles:
     - `--amend`?
     - `--signoff`?
     - `--no-verify`?
   - Show a preview of the final message and ask confirm “Run git commit now?”
6) Compose commit message:
   - Header: `<type>(<scope>)!: <description>` where scope and ! are optional
   - Body separated by blank line if provided
   - Footer separated by blank line if provided
7) Then execute:
   - `git commit -F <tempfile>` plus optional `--amend`, `--signoff`, `--no-verify`
   - Use stdio inherit for git commands so user sees output.

Repo structure output required
- Provide a complete project with:
  - package.json with `"bin": { "commitwizard": "./bin/commitwizard.js" }` and `"type": "module"`
  - bin/commitwizard.js with shebang `#!/usr/bin/env node`
  - README.md with:
    - Install: `npm i -g commitwizard` and local dev: `npm link`
    - Usage examples: `commitwizard`, `commitwizard --pick`, `commitwizard --dry-run`, `commitwizard -p`
    - Notes about requirements (git must be installed, run inside a repo)

Implementation details / edge cases
- If not inside a git repo, print a clean message and exit 1.
- If `git status --porcelain` returns nothing (no changes), warn and exit.
- Handle paths with spaces and rename syntax `R  old -> new` from porcelain output.
- Use `--` in git add to avoid path injection issues: `git add -- <path>`
- Be careful not to stage everything when using `--pick`; stage only selected files.
- Make staging picker list human-friendly:
  - label should include status and path
  - value should be the file path(s) to stage (for renames use new path)
- Keep code readable and well-commented.

Deliverables
- Output all file contents (package.json, bin/commitwizard.js, README.md)
- Make sure the code runs as-is with Node 18+.
