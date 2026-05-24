# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Jest test infrastructure with unit + integration test stubs (`tests/`).
- GitHub Actions workflows for CI (`ci.yml`) and tagged releases (`release.yml`).
- ESLint + Prettier + EditorConfig + `husky` + `lint-staged` for code quality.
- `CONTRIBUTING.md`, `SECURITY.md`, issue/PR templates, Dependabot config.
- `docs/ARCHITECTURE.md` and `docs/API.md`.
- `Makefile` with common dev tasks.

## [0.1.0] - 2026-05-23

### Added

- Initial Next.js 14 app with OpenRouter + Apify grounded outreach pipeline.
- `/api/outreach` server route, Tailwind UI, robust JSON parser.

[Unreleased]: https://github.com/shilojeyaraj/OutreachIntel/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/shilojeyaraj/OutreachIntel/releases/tag/v0.1.0
