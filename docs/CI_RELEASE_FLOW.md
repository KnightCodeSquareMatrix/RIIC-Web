# CI and release flow

The public repository deliberately separates code review from release verification.

| Event | Automated work | Deployment |
| --- | --- | --- |
| Pull request to `develop` | None; contributors provide local test evidence | Never |
| Pull request to `main` | Release-branch and `develop` ancestry policy only | Never |
| Push/merge to `develop` | Changed-path classification, then parallel static, database, build, four-shard Chromium, and browser-boundary checks | Development after `quality` passes |
| Push/merge to `main` | The same post-merge gate | Production after `quality` and Environment approval |
| Nightly/manual compatibility run | Full WebKit suite | Never for the scheduled event |

The release build is immutable within one workflow run. `Build release once` creates the solver-free standalone archive and uploads it with a one-day retention period. The deploy job downloads and validates that exact archive; it must not install dependencies or rebuild the application.

For runtime changes, the latency target from branch push to a development deployment, or to the start of a production health observation, is 6–7 minutes. Production then deliberately observes 20 successful health samples over 300 seconds in the root-owned deployment helper. That observation occurs after the new release is already serving traffic, so it is reported separately from time-to-online. Human Environment approval wait time is also excluded from automation latency.

Documentation-only pushes skip build, browser checks, and deployment. Test/tooling-only pushes run the relevant checks but do not deploy unless a release workflow itself changed.
