# commitwiz

Interactive git commit wizard with Conventional Commit prompts, optional staging picker, and a git-style alias `git wiz`.

## Install

- `npm i -g commitwiz`
- For local development: `npm install` then `npm link`

Requires Node 18+ and git available in `PATH`.

## Usage

- `commitwiz` — run the commit wizard (prompts to stage all if nothing staged)
- `commitwiz --pick` / `commitwiz -p` — pick files to stage before the wizard
- `commitwiz --dry-run` — preview commit message/command without running git commit
- `git wiz` / `git wiz -p` — same as above via git-style alias

Run inside a git repository with pending changes. The wizard:

- Uses `inquirer` for prompts and `execa` for git commands
- Builds Conventional Commit headers, optional scope, optional body (you can skip the editor), breaking change footer, refs, and closes footers
- Executes `git commit -F <tempfile>` automatically after the preview (no extra flags)

## Author

- Athan Zhang (<dev@athan.sh>)
