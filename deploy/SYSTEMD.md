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

The production task queue runs `worker/plan-worker.cjs` in a separate systemd service. One service process runs two concurrent task loops, each with its own persistent `infra-cli serve` client; a failure or restart in one solver lane cannot attach its protocol output to the other lane's active request. Its working directory must be the active release's `.next/standalone` directory so `@next/env` loads the same sealed `.env.local` and `.env.production.local` snapshots as the website. The deployment helper injects `APP_RELEASE_SHA` and `PLAN_TASK_QUEUE_ENABLED=1`, restarts the website and worker together, and accepts the release only after `/api/health` reports a fresh heartbeat from that exact SHA.

Keep the worker unit root-owned, run it as the same non-root application user, and grant writes only to the environment's `/var/lib/arknights-infra*` persistent directory. Install both environment-specific units and reload systemd before installing deployment helper contract v5. Do not start the worker against an older release that has no `worker/plan-worker.cjs`; the first successful v5 deployment enables it.
