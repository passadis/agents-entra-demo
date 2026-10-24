# Contributing to Aegean Agent Operations

Contributions to documentation, accessibility, agent behavior, governance controls, tests, and Azure deployment tooling are welcome. Read the [operating manual](docs/operating-manual.md) to understand the demo and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Choose the right channel

- Search existing issues before opening a bug report or feature request. Use the repository's issue forms and provide a small, reproducible example.
- Discuss substantial architecture, identity, permissions, or deployment changes in an issue before implementing them.
- Report suspected vulnerabilities privately using [SECURITY.md](SECURITY.md). Do not disclose an authorization bypass or credential in a public issue or pull request.

## Understand the two runtimes

The current application uses Python, FastAPI, Microsoft Agent Framework, and Foundry model inference. Its code is in `backend/`, its UI is in `agentic-public/`, and its tests are in `test_agentic/`. Start with [framework architecture and maintenance](docs/agentic-upgrade.md).

The original Node fixture demo remains in `src/` and `public/`, with tests in `test/`. Running `npm start` launches that older runtime. State clearly which runtime your change affects.

## Make a change

1. Fork the repository and create a focused branch from the current default branch.
2. Make the smallest coherent change and update relevant documentation. Keep synthetic business data clearly identified as synthetic.
3. Run checks appropriate to the affected files. Add or adjust meaningful tests for behavior changes, especially authorization, approvals, and persistence.
4. Open a pull request describing the problem, resulting behavior, validation, and any material limitations. Link the relevant issue when one exists.

Use the pinned dependencies in `requirements.txt` for the Python environment. The maintenance guide covers setup; do not assume that a local developer environment has live Azure access.

### Validation

For Python backend changes, with the development environment installed:

```powershell
.\.venv\Scripts\python.exe -m pytest test_agentic -q
```

For changes to the legacy Node runtime, use Node.js 24+:

```powershell
npm run check
npm test
```

For infrastructure changes, compile the relevant Bicep file with `az bicep build --file <path>`. Describe any deployment impact and required grants. Infrastructure validation does not require applying it to the shared demo.

For documentation changes, check relative links, instructions, and Markdown formatting. For UI changes, include screenshots at relevant screen sizes with sensitive information removed.

State which checks you ran and which you did not. Scripted model responses, mocked Entra dependencies, and local screenshots do not prove successful live inference or token exchange.

## Preserve the governance boundaries

- Keep identity binding and tool authorization on the server. Model prompts, names, and peer reports must not grant authority.
- Preserve regional isolation, request authority, spending limits, sponsor-bound exact-request approvals, lifecycle rechecks, and duplicate-order protection.
- Keep raw tokens, credentials, and private framework checkpoints out of browser responses and public logs.
- Explain whether a control is application policy or native Entra configuration. Do not label synthetic commerce as an external purchase.

## Protect local and cloud resources

Never commit secrets, `.env` files, private keys, credential caches, identity-state files, or private tenant data. Files and directories beginning with `local_` are ignored for local work; ignoring a file does not remove previously committed data. Redact logs and screenshots before sharing them.

Tests and contributions must use synthetic data and resources you are authorized to access. A pull request does not authorize provisioning, changing grants, or deploying to the shared application. Describe deployment steps for maintainer review; do not run them against the public demo.

## Licensing

This project is distributed under the [MIT License](LICENSE). By submitting a contribution, you agree to license your contribution under that license. Preserve applicable third-party copyright and license notices; the project license does not replace licenses for dependencies or externally sourced materials.
