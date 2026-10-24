# Security policy

## Scope and maintained versions

Security fixes are considered for the current default branch. There is no commitment to backport fixes to older commits or historical deployment packages. The repository includes a current Python agent application and a legacy Node fixture demo; identify the affected runtime in your report.

This is an educational identity and governance demo using synthetic business data. Its live Entra identities, authentication, model access, and Azure resources still require careful handling. A synthetic purchase does not make an authorization bypass harmless.

## Report a vulnerability privately

Do not publish vulnerabilities, exploit instructions, secrets, tokens, or sensitive logs in public issues or pull requests.

1. Open the repository's [Security advisories](https://github.com/passadis/agents-entra-demo/security/advisories) page and choose **Report a vulnerability**, if available.
2. If private vulnerability reporting is unavailable, use a private contact method listed on the [repository owner's profile](https://github.com/passadis) or linked website. If no private method is listed, open an issue asking only for a private security contact, without vulnerability details.
3. Keep the report private while maintainers investigate and coordinate disclosure.

Do not send security reports to Microsoft merely because the project uses Azure. This policy covers this repository; vulnerabilities in Microsoft products should go through Microsoft's own reporting process.

## What to include

- Affected component, runtime, branch or commit, and dependency versions when relevant.
- Expected and observed behavior, prerequisites, and a minimal reproduction using synthetic data.
- Potential impact, including identity substitution, regional access, approval bypass, token exposure, or repeated purchases.
- Redacted logs or evidence and any proposed mitigation.

Never include a usable access token, client secret, private key, or another person's private information. If a credential has been exposed, revoke or rotate it in the affected environment promptly; removing it from a screenshot or later commit is insufficient.

## Safe research

Use your own authorized test environment and accounts. Do not probe the shared deployed application, access another tenant's data, change directory grants, create paid resources, or disrupt services without explicit permission from their owner. This policy does not authorize testing third-party services or provide a bug bounty or legal safe harbor.

## Handling reports

The maintainer will assess reports on a best-effort basis and coordinate any fix and disclosure with the reporter. No response or remediation deadline is guaranteed. Avoid public disclosure of an unresolved issue until a coordinated disclosure plan is agreed.

## Repository setting

Adding this file does not enable GitHub private vulnerability reporting. The repository owner must enable that feature separately in repository security settings if it is not already enabled. See [GitHub's setup instructions](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configuring-private-vulnerability-reporting-for-a-repository).
