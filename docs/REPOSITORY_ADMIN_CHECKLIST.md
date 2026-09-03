# Public repository administration checklist

This checklist contains GitHub repository settings only. It deliberately excludes credentials, hostnames, private helper source, server topology, and operational commands.

Only the personal-repository owner, `KnightCodeSquareMatrix`, can complete the admin-only steps. `yeyouchuan` remains a normal collaborator for code, pull requests, and reviews.

## Before the initial push

- [ ] Create the new `KnightCodeSquareMatrix/RIIC-Web` repository without importing old history.
- [ ] Invite `yeyouchuan` as a normal collaborator.
- [ ] Disable GitHub Actions in the new repository.
- [ ] Confirm the prepared public commit has no parent and that its tree passes `npm run check:public-repository`.
- [ ] Push that one commit explicitly to `main` and `develop`; do not use `--mirror`, `--all`, or push tags.

## Branch and Actions policy

- [ ] Set `main` as the default branch.
- [ ] Protect both `main` and `develop`: require at least one approval, resolved conversations, and block force pushes and deletion. Do not require post-merge `quality` as a PR status.
- [ ] On `main` only, require the lightweight `Release branch only` status so ordinary feature PRs cannot bypass the release lane.
- [ ] Require CODEOWNER review for the sensitive paths listed in `.github/CODEOWNERS`.
- [ ] Do not routinely bypass protection as repository owner.
- [ ] Keep the default `GITHUB_TOKEN` permission read-only.
- [ ] Allow GitHub Actions to create pull requests so the narrowly scoped asset-sync workflow can update `develop`.
- [ ] Enable private vulnerability reporting and the relevant GitHub security checks.

Ordinary pull requests do not run the post-merge quality workflow. A separate lightweight policy rejects every pull request to `main` unless its head is a `release/**` branch in this same repository. By default, that head commit must already be reachable from `develop`; a maintainer-applied `direct-main-release` label may explicitly waive only the ancestry check. External and ordinary feature PRs target `develop`. Every push produced by a merge into `develop` or `main` runs the full parallel quality gate before deployment.

## Deployment configuration

Create repository variable:

- `DEPLOY_AUTOMATION_ENABLED=0`

Keep it at exactly `0` throughout initialization and preflight.

Create `development` and `production` Environments. Enter these secrets separately in each Environment:

- `DEPLOY_HOST`
- `DEPLOY_SSH_USER`
- `DEPLOY_SSH_PRIVATE_KEY`
- `DEPLOY_SSH_KNOWN_HOSTS`
- `DEPLOY_PUBLIC_HEALTH_URL`

Enter these non-sensitive variables separately in each Environment:

- `DEPLOY_APP_ROOT`
- `DEPLOY_SERVICE`
- `DEPLOY_RUN_USER`
- `DEPLOY_INTERNAL_PORT`
- `DEPLOY_DEBUG_TOOLS_ENABLED`
- `DEPLOY_RATE_LIMIT_ENABLED`
- `DEPLOY_APPROVED_SOLVER_SHA256`

Do not copy values out of old GitHub secrets; re-enter them from the owner-controlled secure store. In particular, the development health URL is an Environment secret, never a repository variable or committed value.

Restrict `development` to `develop`. Restrict `production` to `main` and require `KnightCodeSquareMatrix` as reviewer.

## Enablement checkpoints

- [ ] Re-enable Actions only after branch protection and both Environments are configured.
- [ ] Manually run full CI on `main` and `develop`; the deploy job must be skipped while the repository variable is `0`.
- [ ] Run `Deployment preflight` in `baseline` mode for a read-only report of the installed deploy helper contract and available disk space; root-only solver details remain hidden in this mode.
- [ ] After private server maintenance, rerun preflight in `cutover-ready` mode.

Set `DEPLOY_APPROVED_SOLVER_SHA256` to the independently verified digest of the approved shared solver for each Environment. The cutover-ready preflight requires a root-owned `shared/bin` solver and independent SHA-256 sidecar, verifies the Environment-approved digest, and compares both with the solver's Worker `ping` fingerprint. Prepare those private server assets from the owner-controlled release record; never derive and trust a digest solely from a runtime-user-writable file.
- [ ] Disable automatic deployment in the old private repository before setting the public repository variable to `1`.
- [ ] Change `deploy/PUBLIC_DEPLOYMENT_SOURCE` in a PR to `public-automation-v1` and merge it to `develop`. This path is intentionally classified as deploy-required.
- [ ] Complete development acceptance, then create a same-repository `release/develop-to-main-YYYYMMDD` PR.
- [ ] After merging the reviewed release PR, approve the production Environment only when the post-merge `quality` job has passed.

Do not delete old releases, helper binaries, or Git-cache backups until both environments have been stable for at least seven days.
