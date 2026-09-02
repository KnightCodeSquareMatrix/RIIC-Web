# systemd runtime settings

Next.js owns `SIGINT` and `SIGTERM` so that it can stop accepting new requests and drain in-flight requests before exiting. Its standalone server exits with status `130` or `143` after that graceful shutdown.

Install [`next-graceful-exit.conf`](./next-graceful-exit.conf) as a drop-in for every website service, then reload systemd:

```bash
sudo install -D -o root -g root -m 0644 \
  deploy/next-graceful-exit.conf \
  /etc/systemd/system/<website-service>.service.d/next-graceful-exit.conf
sudo systemctl daemon-reload
```

The drop-in only classifies Next.js's documented signal exit statuses as successful. It does not change restart policy, stop timeout, or service state. Do not add application-level signal handlers that terminate the shared solver before Next.js has drained in-flight HTTP requests.

The production task queue runs `worker/plan-worker.cjs` in a separate systemd service. One central dispatcher feeds four persistent `infra-cli serve` solver lanes with two bounded task slots per lane. Each solver client still serializes `plan.compute`, while the sibling slot can prepare the next request or finish cache and database work so the solver is not left idle between tasks. At most eight tasks are claimed by this Worker process, while at most four solver computations run concurrently. PostgreSQL `NOTIFY` wakes the dispatcher immediately; a latched wake signal closes the empty-claim-to-wait race, failed LISTEN connections reconnect automatically, and a two-second timer remains as a low-frequency safety poll throughout. Full diagnostic files are expanded once from durable run envelopes by two background finalizers; transient database confirmation failures retry only that confirmation, continue on a slow recovery interval after the initial backoff is exhausted, and use durable expanded/finalized/failed markers for phase-aware restart recovery. Malformed envelopes are quarantined immediately, while a run row still missing after ten minutes is treated as a crash orphan; retrying stops at the seven-day private-record retention boundary. Finalizers and the bounded background timing-update set receive a 30-second shutdown drain budget. A failure or restart in one solver lane cannot attach its protocol output to another lane's active request. Before publishing its first heartbeat, the Worker starts and pings all four lane clients, so deployment readiness fails closed if the host cannot start the configured solver capacity. Its working directory must be the active release's `.next/standalone` directory so `@next/env` loads the same sealed `.env.local` and `.env.production.local` snapshots as the website. The deployment helper injects `APP_RELEASE_SHA` and `PLAN_TASK_QUEUE_ENABLED=1`, restarts the website and worker together, and accepts the release only after `/api/health` reports a fresh heartbeat from that exact SHA and remains healthy throughout the post-activation observation window.

Keep the worker unit root-owned, run it as the same non-root application user, and grant writes only to the environment's `/var/lib/arknights-infra*` persistent directory. Install both environment-specific units and reload systemd before installing deployment helper contract v6. Contract v6 keeps the previous release available during a five-minute production observation window and rolls back if internal or public health fails. Do not start the worker against an older release that has no `worker/plan-worker.cjs`; the first successful v5 deployment enables it.
