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

The production task queue runs `worker/plan-worker.cjs` in a separate systemd service. One service process runs three concurrent task loops, each with its own persistent `infra-cli serve` client; a failure or restart in one solver lane cannot attach its protocol output to another lane's active request. Before publishing its first heartbeat, the Worker starts and pings all three lane clients, so deployment readiness fails closed if the host cannot start the configured solver capacity. Its working directory must be the active release's `.next/standalone` directory so `@next/env` loads the same sealed `.env.local` and `.env.production.local` snapshots as the website. The deployment helper injects `APP_RELEASE_SHA` and `PLAN_TASK_QUEUE_ENABLED=1`, restarts the website and worker together, and accepts the release only after `/api/health` remains healthy throughout the post-activation observation window.

Keep the worker unit root-owned, run it as the same non-root application user, and grant writes only to the environment's `/var/lib/arknights-infra*` persistent directory. Install both environment-specific units and reload systemd before installing deployment helper contract v6. Contract v6 keeps the previous release available during a five-minute production observation window and rolls back if internal or public health fails. Do not start the worker against an older release that has no `worker/plan-worker.cjs`; the first successful v5 deployment enables it.
