# Changelog

All notable changes to RIIC-Web are documented in this file.

## [0.3.0] - 2026-09-02

### Added

- Personal planning can now use four solver lanes in parallel, with one prepared task behind each active computation so available CPU capacity is used continuously.
- The persistent queue now admits up to 1,000 active tasks, reserves up to 600 slots for new accounts, and places overflow candidates in a bounded random-selection ring.

### Changed

- Queued tasks now wake workers through database notifications, while a low-frequency safety poll keeps recovery reliable after connection failures.
- Queue progress polling uses status-aware intervals and estimates wait time from observed worker service time, reducing unnecessary requests without making progress feel stale.
- Cache hits can complete immediately without waiting for another solver lease, and each solver process reuses its verified capability information.
- Diagnostic processing now runs in the background, resumes safely after restarts, and quarantines malformed or crash-orphaned records instead of leaving them in an endless retry loop.
- Administrator metrics now distinguish solver compute time, Worker overhead, queue wait, and cache-backed results.

### Fixed

- Worker notification connections now reconnect after initial handshake or socket failures without leaving the queue asleep.
- Queue schema upgrades now serialize concurrent migrations and build admission indexes online, avoiding conflicting deploys and unnecessary scheduling downtime.
- Artifact completion no longer becomes permanently pending when database confirmation is temporarily unavailable or a process crashes before its run record is created.

## [0.2.4] - 2026-09-02

### Changed

- Daily production details no longer show the solver-total estimate disclaimer; solver totals and the natural/drone estimate rows remain unchanged.

### Fixed

- Deleting all Skland data no longer runs unrelated global private-record maintenance, preventing maintenance failures from surfacing as `AIC-SYS-5000` before account cleanup.
- Successful all-data deletion now resolves the account store with the verified website user, removes every persisted Skland binding for that user, and clears the browser account state.

### For contributors

- `package.json` and `package-lock.json` record release `0.2.4`.
- Account-data deletion has direct route-level and private-artifact regression coverage.

## [0.2.3] - 2026-09-02

### Changed

- Plan results no longer repeat the same training advice in the compact details view; the dedicated training section remains available.

### Fixed

- Skland imports now show the correct operator count when Amiya has multiple forms.
- A delayed Skland restore no longer overwrites a MAA operator box imported while the restore is still in progress, while existing Skland boxes continue to refresh normally.

### For contributors

- `package.json` and `package-lock.json` record release `0.2.3`.

## [0.2.2] - 2026-09-01

### Changed

- The production plan worker now runs three isolated solver lanes, balancing queue throughput against the host CPU headroom required by the website and health checks.
- Standalone releases now synchronize their staged file tree with checksum-based rsync reuse before rebuilding and verifying the canonical archive on the server.
- Deployment helper contract v6 keeps production activation inside a five-minute observation transaction and automatically rolls back on delayed internal or public health failures.

### For contributors

- `package.json` and `package-lock.json` record release `0.2.2`.

## [0.2.1] - 2026-09-01

### Changed

- The production plan worker now runs four isolated persistent solver lanes instead of two, doubling task execution capacity while keeping per-lane protocol output isolated.
- Queue ETA calculations now use the four-lane execution capacity.
- Deployment readiness now starts and pings every configured solver lane before the task worker publishes its first heartbeat.

### For contributors

- `package.json` and `package-lock.json` record release `0.2.1`.

## [0.2.0] - 2026-09-01

### Added

- Authenticated plans can now wait in a persistent candidate ring when the 1,000-task global limit or 600-new-account limit is reached, then enter the active queue through random eligible selection as capacity becomes available.
- The plan worker now runs two isolated persistent solver lanes and reports candidate, pending, and running counts in administrator metrics.
- Queue responses now include actionable retry timing for account, network, and full-candidate-ring limits, with visible countdowns and continuous low-frequency progress polling.

### Changed

- Plan admission now enforces 100 active accounts per network, 10 starts per account and 200 starts per network in ten minutes, plus a bounded 2,000-task candidate ring.
- Plans submitted at the same instant now keep stable queue positions, while a dedicated account-history index keeps admission checks fast as the queue grows.

### Fixed

- Expired running tasks now release their account reservation and clear encrypted task input instead of permanently blocking later submissions.
- Candidate promotion skips networks already at their active-account limit, and buffered cancellations scrub encrypted payloads before releasing the reservation.
- Candidate and pending tasks remain visibly queued while automatic polling continues, without exceeding the production JavaScript budget.

### For contributors

- `package.json` is now the repository's version source and records release `0.2.0`.
