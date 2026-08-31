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
