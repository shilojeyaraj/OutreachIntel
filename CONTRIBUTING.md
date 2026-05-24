# Contributing to ColdReach Intel

Thanks for your interest! This doc covers the branching, commit, and PR conventions we use.

## Quick start

```bash
git clone https://github.com/shilojeyaraj/OutreachIntel
cd coldreach-intel
make install      # or: npm ci
cp .env.local.example .env.local
# add your OPENROUTER_API_KEY (and optionally APIFY_API_TOKEN)
make run          # http://localhost:3000
```

## Branching strategy

We use a lightweight trunk-based flow:

- `main` is always deployable.
- Feature branches: `feat/<short-name>` (e.g. `feat/twitter-grounding`).
- Bugfix branches: `fix/<short-name>`.
- Chore / docs / refactor: `chore/<...>`, `docs/<...>`, `refactor/<...>`.

Rebase your branch onto `main` before opening a PR — we prefer a linear history.

## Commit messages — Conventional Commits

We follow [Conventional Commits](https://www.conventionalcommits.org/) so the changelog and release notes can be generated automatically.

```
<type>(<optional scope>): <short summary>

<optional body>

<optional footer(s)>
```

**Types:**

| Type       | Use for                                              |
| ---------- | ---------------------------------------------------- |
| `feat`     | A new user-facing feature                            |
| `fix`      | A bug fix                                            |
| `docs`     | Docs only                                            |
| `refactor` | Code change that does not add a feature or fix a bug |
| `perf`     | Performance improvement                              |
| `test`     | Adding or fixing tests                               |
| `build`    | Changes to build config, dependencies, or tooling    |
| `ci`       | Changes to CI workflows                              |
| `chore`    | Routine tasks, version bumps                         |

**Breaking changes:** add a `!` after the type (e.g. `feat!:`) or a `BREAKING CHANGE:` footer.

**Examples:**

```
feat(api): expose linkedin_url in outreach response
fix(parser): handle unescaped inner quotes in model output
chore(deps): bump next to 14.2.33
```

## Pull request process

1. Open a PR against `main` once your branch is ready.
2. Fill in the PR template (the checklist isn't a formality — it catches real regressions).
3. CI must be green: lint, typecheck, tests, build.
4. At least one approving review for changes outside `docs/`.
5. Squash-merge by default. The squash commit message should follow Conventional Commits.

## Local checks before pushing

```bash
make lint
make typecheck
make test
```

`husky` runs `lint-staged` on commit, which auto-formats and lints only the files you touched. If it fails, fix the underlying issue rather than passing `--no-verify`.

## Adding a dependency

- Prefer the smallest dependency that does the job.
- For dev-only tooling, install with `--save-dev` so it doesn't bloat the production bundle.
- Update `package.json` and `package-lock.json` in the same commit.

## Reporting bugs / requesting features

Use the issue templates in [`.github/ISSUE_TEMPLATE`](./.github/ISSUE_TEMPLATE/). Be specific: paste the failing input, the actual vs expected output, and your environment.
