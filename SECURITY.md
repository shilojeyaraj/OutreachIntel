# Security Policy

## Supported versions

This project is pre-1.0 — only the latest `main` branch receives security updates.

| Version | Supported |
| ------- | --------- |
| `main`  | ✅        |
| < 0.x   | ❌        |

## Reporting a vulnerability

**Please do not file a public GitHub issue for security problems.**

Report vulnerabilities privately by emailing **shilo@coincidencelabs.com** with:

- A clear description of the vulnerability
- Steps to reproduce (or a minimal proof of concept)
- The impact you've observed or expect
- Any suggested remediation

We aim to respond within **3 business days** and to have a fix or disclosure plan within **30 days** for confirmed reports.

## Scope

In scope:

- The Next.js app in this repo (`app/`, `components/`, `lib/`).
- The `/api/outreach` route — including input validation, secret handling, and SSRF / prompt-injection concerns.

Out of scope:

- Vulnerabilities in third-party services (OpenRouter, Apify, Vercel) — report directly to those vendors.
- Social engineering, physical access, or denial-of-service via high request volume.

## Safe-harbor

We will not pursue legal action against researchers who:

1. Make a good-faith effort to avoid privacy violations, data destruction, and service interruption.
2. Report the issue privately as described above before public disclosure.
3. Give us a reasonable window (≥ 30 days) to remediate.

Thank you for helping keep this project safe.
