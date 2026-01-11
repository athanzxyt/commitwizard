#!/usr/bin/env node

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import inquirer from 'inquirer';
import { execa } from 'execa';

const COMMIT_TYPES = [
  'build',
  'chore',
  'ci',
  'docs',
  'feat',
  'fix',
  'perf',
  'refactor',
  'revert',
  'style',
  'test'
];

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    pick: args.includes('--pick') || args.includes('-p'),
    dryRun: args.includes('--dry-run')
  };
}

async function ensureGitRepo() {
  try {
    await execa('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'pipe' });
  } catch (err) {
    console.error('Error: not inside a git repository.');
    process.exitCode = 1;
    throw err;
  }
}

async function getStatusLines() {
  const { stdout } = await execa('git', ['status', '--porcelain']);
  return stdout.split('\n').filter(Boolean);
}

async function getStagedFiles() {
  const { stdout } = await execa('git', ['diff', '--cached', '--name-only']);
  return stdout.split('\n').filter(Boolean);
}

function parsePorcelain(lines) {
  return lines.map((line) => {
    const status = line.slice(0, 3);
    const rawPath = line.slice(3).trim();
    const renameParts = rawPath.includes('->') ? rawPath.split('->') : null;
    const pathToStage = renameParts ? renameParts[1].trim() : rawPath;
    const label = `${status.trim()} ${rawPath}`.trim();
    return { label, path: pathToStage };
  });
}

async function stageAllChanges() {
  await execa('git', ['add', '-A'], { stdio: 'inherit' });
}

async function stagePaths(paths) {
  for (const filePath of paths) {
    await execa('git', ['add', '--', filePath], { stdio: 'inherit' });
  }
}

function parseCommaList(input) {
  if (!input) return [];
  return input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildCommitMessage({
  type,
  scope,
  description,
  body,
  breakingDetails,
  refs,
  closes
}) {
  const headerScope = scope ? `(${scope})` : '';
  const breakingMark = breakingDetails ? '!' : '';
  const header = `${type}${headerScope}${breakingMark}: ${description}`;

  const sections = [header];
  if (body) {
    sections.push(body.trim());
  }

  const footers = [];
  if (breakingDetails) {
    footers.push(`BREAKING CHANGE: ${breakingDetails.trim()}`);
  }
  if (refs.length) {
    footers.push(`Refs: ${refs.join(', ')}`);
  }
  if (closes.length) {
    closes.forEach((item) => footers.push(`Closes ${item}`));
  }
  if (footers.length) {
    sections.push(footers.join('\n'));
  }

  return sections.join('\n\n');
}

function showPreview(message, flags) {
  console.log('\n--- Commit message preview ---');
  console.log(message);
  console.log('------------------------------');
  if (flags.length) {
    console.log(`Flags: ${flags.join(' ')}`);
  }
  console.log('');
}

async function promptCommitDetails() {
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'type',
      message: 'Select commit type',
      choices: COMMIT_TYPES
    },
    {
      type: 'input',
      name: 'scope',
      message: 'Optional scope (leave empty for none)'
    },
    {
      type: 'input',
      name: 'description',
      message: 'Short description',
      validate: (value) => {
        if (!value || !value.trim()) {
          return 'Description is required.';
        }
        if (value.length > 72) {
          return 'Recommended to stay within 72 characters.';
        }
        if (value.endsWith('.')) {
          return 'Please omit trailing period.';
        }
        return true;
      }
    },
    {
      type: 'confirm',
      name: 'breaking',
      message: 'Is this a breaking change?',
      default: false
    },
    {
      type: 'input',
      name: 'breakingDetails',
      message: 'Describe the breaking change',
      when: (answers) => answers.breaking,
      validate: (value) => (value && value.trim() ? true : 'Details are required for breaking changes.')
    },
    {
      type: 'confirm',
      name: 'wantsBody',
      message: 'Add a detailed body? (opens editor)',
      default: false
    },
    {
      type: 'editor',
      name: 'body',
      message: 'Body (save & close to keep, empty to skip)',
      waitUserInput: true,
      when: (answers) => answers.wantsBody
    },
    {
      type: 'input',
      name: 'refs',
      message: 'Optional issue refs (comma-separated, e.g. #123, #456)'
    },
    {
      type: 'input',
      name: 'closes',
      message: 'Optional closes (comma-separated, e.g. #123)'
    },
    {
      type: 'confirm',
      name: 'amend',
      message: 'Use --amend?',
      default: false
    },
    {
      type: 'confirm',
      name: 'signoff',
      message: 'Use --signoff?',
      default: false
    },
    {
      type: 'confirm',
      name: 'noVerify',
      message: 'Use --no-verify?',
      default: false
    },
    {
      type: 'confirm',
      name: 'confirmCommit',
      message: 'Run git commit now?',
      default: true
    }
  ]);

  const refs = parseCommaList(answers.refs);
  const closes = parseCommaList(answers.closes).map((entry) => (entry.startsWith('#') ? entry : `#${entry}`));

  return {
    type: answers.type,
    scope: answers.scope.trim() || '',
    description: answers.description.trim(),
    body: answers.body ? answers.body.trim() : '',
    breakingDetails: answers.breaking ? answers.breakingDetails : '',
    refs,
    closes,
    flags: [
      answers.amend ? '--amend' : null,
      answers.signoff ? '--signoff' : null,
      answers.noVerify ? '--no-verify' : null
    ].filter(Boolean),
    confirmCommit: answers.confirmCommit
  };
}

async function writeTempMessage(content) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'commitwizard-'));
  const filePath = path.join(dir, 'COMMIT_MESSAGE.txt');
  await fs.writeFile(filePath, content, 'utf8');
  return { dir, filePath };
}

async function cleanupTemp(dir) {
  await fs.rm(dir, { recursive: true, force: true });
}

async function runCommit(message, flags, { dryRun }) {
  const { dir, filePath } = await writeTempMessage(message);
  const args = ['commit', '-F', filePath, ...flags];

  if (dryRun) {
    console.log('Dry run - would execute:');
    console.log(`git ${args.join(' ')}`);
    console.log('\nCommit message:\n');
    console.log(message);
    await cleanupTemp(dir);
    return;
  }

  try {
    await execa('git', args, { stdio: 'inherit' });
  } finally {
    await cleanupTemp(dir);
  }
}

async function promptStageAllIfNeeded() {
  const staged = await getStagedFiles();
  if (staged.length > 0) return;

  const lines = await getStatusLines();
  if (!lines.length) {
    console.log('No changes to commit.');
    process.exit(0);
  }

  const { stageAll } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'stageAll',
      message: 'No staged changes found. Stage all changes (git add -A)?',
      default: true
    }
  ]);

  if (!stageAll) {
    console.log('Nothing staged. Aborting.');
    process.exit(0);
  }

  await stageAllChanges();
}

async function promptPickerAndStage() {
  const lines = await getStatusLines();
  if (!lines.length) {
    console.log('No changes to pick from.');
    process.exit(0);
  }

  const choices = parsePorcelain(lines).map((item) => ({
    name: item.label,
    value: item.path
  }));

  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message: 'Select files to stage (Space/Enter to toggle)',
      choices,
      loop: false,
      pageSize: 15
    }
  ]);

  if (selected.length) {
    await stagePaths(selected);
  } else {
    const staged = await getStagedFiles();
    if (!staged.length) {
      const { continueWithout } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'continueWithout',
          message: 'No files selected and nothing staged. Continue anyway?',
          default: false
        }
      ]);

      if (!continueWithout) {
        console.log('Aborting.');
        process.exit(0);
      }
    }
  }
}

async function ensureStagedChanges() {
  const staged = await getStagedFiles();
  if (!staged.length) {
    console.log('No staged changes detected. Stage files and try again.');
    process.exit(0);
  }
}

async function main() {
  const options = parseArgs();

  try {
    await ensureGitRepo();

    if (options.pick) {
      await promptPickerAndStage();
    } else {
      await promptStageAllIfNeeded();
    }

    await ensureStagedChanges();

    const commitDetails = await promptCommitDetails();
    const message = buildCommitMessage(commitDetails);

    showPreview(message, commitDetails.flags);

    if (!commitDetails.confirmCommit) {
      console.log('Commit cancelled.');
      return;
    }

    await runCommit(message, commitDetails.flags, { dryRun: options.dryRun });
  } catch (err) {
    // execa already prints stderr; add friendly message
    if (!process.exitCode) {
      process.exitCode = 1;
    }
    console.error(err.shortMessage || err.message || err);
  }
}

main();
