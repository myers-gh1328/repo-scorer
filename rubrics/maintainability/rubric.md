# Maintainability Rubric - Draft

**Version:** 0.3-draft

This draft rubric evaluates whether a competent team can keep changing a repository safely, affordably, and with confidence. It is intentionally separate from the AI-readiness rubric.

The score should reflect maintainability evidence in the repository, not whether the code matches a reviewer preference. Prefer concrete signals from files, scripts, tests, docs, CI, configuration, and source structure. Use LLM judgment for quality and fit, but do not require internet access during normal scoring. Time-sensitive freshness checks should use checked-in reference data, with separate skills or reports used to update that data.

## Scoring Principles

- Score contextually. A local CLI, library, desktop app, prototype, production web service, and cloud platform should not have identical expectations.
- Treat not-applicable areas as neutral unless the repo clearly needs the capability.
- Penalize committed secrets and unsafe credential guidance regardless of repo type.
- Penalize password, API-key, token, or client-secret patterns more strongly when the repo targets cloud platforms, Kubernetes, or CI/CD systems that support identity-based auth.
- Do not browse the internet during routine scoring. Use repo-local support matrices for runtime, framework, IaC, action, image, and API freshness.
- Mark unsupported, stale, missing, or uncertain reference data as a confidence limitation rather than guessing.

## Categories

| Category | Weight | What to evaluate |
|---|---:|---|
| Verification coverage | 15 | Unit, integration, API, UI, or end-to-end tests exist where appropriate; tests cover important behavior and are runnable locally with documented commands |
| Build and delivery hygiene | 12 | Build, lint, typecheck, test, CI, and release/deploy workflows are discoverable, repeatable, and aligned with documented commands |
| Runtime and dependency health | 12 | Language runtimes, frameworks, package managers, IaC tooling, providers, images, and core dependencies are supported, intentionally versioned, and not known EOL according to checked-in reference data |
| Repository hygiene | 10 | The repo has expected stack files, lockfiles where appropriate, useful gitignore coverage, generated/cache/build outputs excluded, and safe example config without real secrets |
| Credential and identity hygiene | 10 | Secrets are not committed; password, API-key, token, and client-secret use is isolated and documented; cloud or CI/CD integrations prefer managed identity, workload identity, OIDC, IAM roles, or secret-store references where supported |
| Infrastructure as Code hygiene | 10 | When IaC or deployment configuration is present, infrastructure changes are repeatable, reviewable, validated, version-aware, and safely separated across environments |
| Code organization | 10 | Module boundaries are clear; domain logic is separated from framework glue where practical; file layout is predictable; large files, tangled dependencies, and copy-paste duplication are limited |
| Change safety | 8 | Common changes are localized; APIs, storage, migrations, config, and compatibility risks are handled deliberately; rollback or recovery paths exist for risky changes |
| Operational support | 7 | Logs, errors, health checks, configuration, observability, and debugging instructions are useful enough to operate and troubleshoot the software |
| Documentation and onboarding | 6 | README, setup, architecture, contribution, testing, deployment, and troubleshooting docs exist where useful and match actual files, scripts, and workflows |

## Health Bands

| Score | Status | Interpretation |
|---:|---|---|
| 0-39 | Difficult | The repo is expensive and risky to change because verification, setup, ownership, or key maintenance signals are missing |
| 40-59 | Basic | The repo has some maintainability foundations, but important checks or conventions are incomplete or person-dependent |
| 60-74 | Serviceable | A competent developer can make normal changes with moderate confidence using repo-local commands, tests, and conventions |
| 75-89 | Healthy | The repo supports safe routine change through clear structure, validation, dependency hygiene, and operational practices |
| 90-100 | Durable | The repo is highly maintainable across teams, environments, and time, with strong automation, currency, and safety controls |

## Category Guidance

### Verification Coverage

Look for automated verification appropriate to the repo shape:

- Unit tests for core logic.
- Integration or API tests for service boundaries.
- UI or end-to-end tests for critical user workflows.
- Migration, config, and error-path tests where those are important risks.
- Clear local commands that run the relevant tests.
- Tests that verify behavior rather than only implementation details.

Do not require every test type for every repo. A library may not need UI tests. A UI-heavy product should have at least some flow-level coverage.

### Build and Delivery Hygiene

Look for repeatable build and delivery signals:

- Clear build, lint, typecheck, format, and test commands.
- CI or pipeline workflows that run meaningful checks.
- Documented deploy or release process where applicable.
- Pipeline failures that would be actionable to a maintainer.
- Consistency between README commands, package scripts, Makefiles, and CI.

### Runtime and Dependency Health

Use checked-in reference data for current support status. Evaluate:

- Language runtime versions.
- Framework and package manager versions.
- Lockfiles and version constraints.
- Deprecated or EOL versions.
- Docker base images.
- GitHub Actions and action runtime versions.
- Kubernetes API versions.
- Terraform, OpenTofu, Bicep, Pulumi, CloudFormation/CDK, Helm, and provider versions.

If the reference data is missing or stale, report the limitation and avoid overstating the finding.

### Repository Hygiene

Look for:

- `.gitignore` exists and matches detected stack/languages.
- Generated, cache, build, dependency, local database, and local config outputs are excluded.
- Expected project files exist for detected stacks.
- Lockfiles are present where expected.
- Example env/config files are safe and useful.
- Real `.env`, key, certificate, database, or generated artifacts are not tracked.

### Credential and Identity Hygiene

Evaluate credential patterns relative to context:

- Full credit: platform-native identity or secret-store references are used where supported.
- Partial credit: passwords, API keys, tokens, or client secrets are used only through environment variables, secret stores, or deployment-time variables with safe docs.
- Lower credit: password-based auth is the primary integration pattern where managed identity, workload identity, OIDC, IAM roles, or equivalent platform identity is available.
- Major penalty: hardcoded credentials, checked-in secrets, connection strings with passwords, or docs instructing users to put secrets in tracked files.

Give a smaller penalty for local-only, desktop-only, prototype, or single-user apps when secrets are isolated and ignored by git. Do not penalize unavoidable third-party API keys heavily when they are handled safely.

### Infrastructure as Code Hygiene

Evaluate this category when IaC or deployment configuration is present, or when the repo clearly deploys cloud infrastructure.

Look for:

- Terraform/OpenTofu, Bicep/ARM, Pulumi, CloudFormation/CDK, Helm, Kubernetes manifests, Docker Compose, or deploy workflows.
- Clear environment separation.
- Parameterization instead of hardcoded environment values.
- Secret-store or deployment-time secret references.
- Plan, preview, what-if, diff, lint, format, build, template, or schema validation.
- Terraform/Pulumi state/backend handling.
- Consistent resource naming, tagging, regions, and permissions.
- Review gates for destructive changes.
- Supported IaC tool/provider/API versions according to checked-in reference data.

No IaC in a local-only library or app should be neutral. A cloud app with manual setup docs but no IaC is a maintainability risk.

### Code Organization

Use LLM judgment against repo-local evidence:

- Responsibilities are separated.
- Domain/business logic is not unnecessarily mixed with UI, framework, IO, or config glue.
- File and folder structure is predictable.
- Shared behavior is centralized without excessive abstraction.
- Large files, circular dependencies, and scattered cross-cutting concerns are limited.
- Copy-paste duplication is limited. When the scanner reports `duplicationStatus: measured`, use `duplicationPercentage` (share of duplicated code lines found by jscpd, code files only) and `duplicationTopPairs` (largest clone pairs with file and line ranges) as evidence. Cite specific pairs instead of the percentage alone, and weigh whether the clones are deliberate (tests, fixtures, generated code) or shared behavior that should be centralized. `duplicationStatus: unavailable` means the check could not run and is neutral, not a penalty.

### Change Safety

Look for signs that changes can be made safely:

- Common changes are localized.
- Public APIs, data contracts, schemas, and migrations are versioned or handled deliberately.
- Backward compatibility is considered where needed.
- Error handling is consistent.
- Edge cases are tested or documented.
- Risky changes have rollback, recovery, or rescore/rebuild guidance.

### Operational Support

Look for:

- Useful logs and error messages.
- Health or status endpoints where applicable.
- Config and secret loading that is understandable.
- Observability hooks, metrics, tracing, or monitoring where appropriate.
- Troubleshooting docs for common failures.
- Local debug instructions.

### Documentation and Onboarding

Evaluate whether docs help a new maintainer:

- README explains purpose, setup, run, test, build, and deploy where applicable.
- Architecture or design docs exist for non-trivial systems.
- Contribution and review expectations are clear where multiple people work on the repo.
- Docs match actual scripts, files, and workflows.
- Important decisions are captured in ADRs or equivalent notes.

## Caps and Constraints

Apply caps and band constraints from `rubric.schema.json` where scanner evidence supports them. If scanner evidence is not yet available for a draft-only category, ask the model to identify likely evidence and confidence rather than fabricating deterministic signals.

## Draft Notes

This rubric expects future scanner work for evidence fields such as:

- `hasAutomatedTests`
- `hasGitignore`
- `hasCommittedSecretRisk`
- `hasCloudDeploymentWithoutIac`
- `hasSupportedCoreRuntime`
- `hasIacValidationWhenIacPresent`

It also expects checked-in support matrices for runtime and tooling freshness rather than internet browsing during normal scoring.
