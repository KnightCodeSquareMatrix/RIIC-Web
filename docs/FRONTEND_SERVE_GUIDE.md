# Frontend Serve Guide

The Next server keeps one `infra-cli serve` process alive instead of spawning a CLI process for every layout.

## Transport

Start the worker once:

```bash
infra-cli serve
```

- stdin: one JSON request per line.
- stdout: mixed logs and NDJSON responses. A line is a response only when it is a JSON object whose `id` matches the active request and whose `ok` value is a boolean. Plain text, malformed JSON, JSON logs, unknown request IDs and response-shaped objects with a non-boolean `ok` remain stdout logs.
- stderr: logs only; never parse stderr as protocol output or copy stdout noise into it.

The frontend sends one request at a time so unstructured stage logs have an unambiguous owner. It preserves the raw stdout and stderr emitted during that request, including the final protocol response in stdout. Parsing accepts split chunks, partial lines, LF or CRLF, and a log plus response delivered in one chunk. Each stream is capped at 8 MiB; after overflow, the oldest content is removed, an explicit truncation marker is prepended, and the newest output is retained. A retry after Worker restart starts fresh stream captures, and late events from the old process are ignored.

## Capability gate

Before choosing a plan method, send:

```json
{"id":1,"method":"ping","params":{}}
```

The frontend uses `plan.compute` when `protocol_version` matches and `supported_plan_schema_versions` contains the website contract version:

```json
{
  "id": 1,
  "ok": true,
  "result": {
    "pong": true,
    "protocol_version": 1,
    "plan_schema_version": 4,
    "supported_plan_schema_versions": [1, 2, 3, 4],
    "plan_contract_sha256": "<diagnostic-schema-fingerprint>",
    "solver_executable_sha256": "<running-executable-fingerprint>"
  }
}
```

`plan_contract_sha256` and `solver_executable_sha256` are diagnostic identities, not capability switches. In particular, LF and CRLF copies of the same schema may have different byte hashes without changing compatibility. Missing or different schema hashes therefore do not select the legacy route. A genuinely missing or mismatched `protocol_version`, or a supported-schema list that omits v3, keeps using the legacy `plan` method for runtime compatibility. `plan_schema_version` reports the Worker's current schema but does not override an explicit v3 entry in the supported list.

Capability negotiation is by membership: a Worker advertising `supported_plan_schema_versions: [1, 2, 3, 4]` still receives the website's v3 request. The website continues to send `fiammetta_enable`; it does not send the v4 `assert_invariants` option used by internal Check workflows.

Deployment health is intentionally stricter than runtime routing when `INFRA_CLI_EXPECTED_SHA256` is configured. In that mode the server pins CLI selection to the packaged platform binary in `bin/`, requires the current protocol plus v3 support, and requires the Worker fingerprint to match that artifact. A version or executable mismatch makes `plannerReady` false so the release runner rolls back; `INFRA_CLI_PATH` and a persisted active CLI cannot silently replace the verified artifact. Local or unmanaged environments may omit the expected hash, retain normal CLI candidate selection, and keep a legacy Worker available. The contract hash is recorded but never compared against a frontend constant.

Solver contract smoke tests require the private solver binary and are maintained outside this public repository. Public unit and E2E suites use fixtures and mock API responses; they do not download, execute, or depend on a solver artifact.

## `plan.compute` v1

The request contains the complete layout and operbox inline:

```json
{
  "id": 2,
  "method": "plan.compute",
  "params": {
    "schema_version": 3,
    "layout": {
      "template": "243",
      "drone_cap": 235,
      "scenario": {},
      "rooms": []
    },
    "operbox": [],
    "labels": {
      "layout": "243",
      "operbox": "Current Box"
    },
    "options": {
      "rotation": "abc_12_6_6",
      "top": 20,
      "system_preferences": {},
      "maa_title": "My schedule"
    }
  }
}
```

The actual request must contain 1–64 rooms and 1–1000 operators. Room IDs, operator IDs, and operator names must be non-empty and unique. Browser imports, Skland schedule snapshots, and restored v5 or migrated legacy sessions are normalized to one planner-facing record per operator name before the request is built. The public `/api/plan` boundary still rejects any remaining duplicate IDs or names instead of rewriting an arbitrary API payload.

Successful responses contain all outputs inline:

```json
{
  "id": 2,
  "ok": true,
  "elapsed_ms": 123,
  "result": {
    "schema_version": 3,
    "profile": {},
    "rotation": {
      "profile": "abc_12_6_6",
      "daily": {},
      "shifts": []
    },
    "maa": {},
    "training_room": {
      "schema_version": 1,
      "shifts": [
        { "trainee": "Operator A", "trainer": "Operator B" },
        { "trainee": null, "trainer": "Operator C" },
        { "trainee": null, "trainer": null }
      ]
    }
  }
}
```

The frontend validates `schema_version`, `profile`, `rotation.shifts`, and `maa` before marking the run successful. `training_room` is optional for compatibility with older Workers. When present, it must use schema version 1, contain exactly one entry per `maa.plans` shift, and provide both `trainee` and `trainer` as trimmed names or `null`. A name may not exceed 80 characters, occupy both training positions, or also appear in an explicit MAA room in the same shift. It then persists the inline profile and MAA values into the run directory so debug bundle paths always refer to real files.

Newer Workers may include `rotation.shifts[].assignment` and `rotation.shifts[].notes` in an otherwise valid v3 response. They are accepted as private transport details but are not part of the normalized public rotation DTO; schedule presentation and MAA export continue to use the normalized rotation and `maa` payload.

Error responses use the normal serve envelope:

```json
{"id":2,"ok":false,"elapsed_ms":3,"error":{"code":"PLAN_FAILED","stage":"plan.compute","message":"..."}}
```

## Legacy `plan`

Workers that do not pass the capability gate continue to receive path-based requests:

```json
{"id":3,"method":"plan","params":{"layout":"tmp/layout.json","operbox":"tmp/operbox.json","profile_out":"tmp/profile.json","maa_out":"tmp/maa.json","output_dir":"tmp/shifts","rotation":"abc_12_6_6","top":20,"maa_title":"My schedule"}}
```

All paths are selected by the frontend. After a successful response, the frontend reads `profile_out`, `maa_out`, and `team_shift_*.json` from the run directory.

## Lifecycle

1. Start one Worker on demand.
2. Ping it before a solve, record the version and diagnostic fingerprints, and select `plan.compute` or legacy `plan` from the version fields only.
3. Write one request line and accept only a JSON object with the matching `id` and a boolean `ok`; retain the stdout/stderr text in that request's capped private capture.
4. Persist the request, response, per-request stdout, per-request stderr, profile, MAA, rotation, and debug bundle.
5. If the process exits while a request is active, restart it and retry the active request once.

## Public API boundary

The CLI response is an internal transport object. It must never be returned directly from a Next.js route handler.

`src/server/infra.ts` may retain CLI paths, commands, stdout, stderr, serve requests/responses, the ping observation and run-directory metadata for local diagnostics. Feedback looks up that exact private run by diagnostic ID and copies its solver observation into private `meta.json`; old or missing runs use `solver: null`. `src/server/public-plan.ts` is the required boundary before `/api/plan`: it constructs a new allowlisted DTO containing profile, MAA, rotation, duration, an opaque diagnostic ID and, when supplied by the current Worker, optional `trainingRoom` and `trainingAdvice` values parsed through their own strict public contracts. Training-room operators remain outside `maa.plans[*].rooms`, so MAA downloads never contain a training room or its occupants. Rotation is rebuilt through `src/rotation-result.ts`; only the selected profile, daily summary, normalized shifts, team state, weighted efficiency and normalized room efficiency are public. Raw `efficiencies`, assignments, solver identities and future unknown Worker or training fields are not forwarded in production.

The persisted `stdout.txt`, `stderr.txt`, `result.json` and `debug-bundle.json` are private diagnostic artifacts. Ordinary API responses, plan history and browser persistence must not contain these logs. Log wording is not a stable protocol: frontend code must not infer Worker capability, progress or solver stage from log text.

The server appends diagnostic values under `data.debug` only when `BETA_DEBUG_TOOLS_ENABLED=1` and that `/api/plan` request explicitly carries `?beta=1`. The query parameter cannot override a disabled server switch or the production deployment policy, while an ordinary development request remains limited to the core allowlist plus the two optional training fields even when the server switch is enabled. Public contract tests recursively reject internal field names in production responses, and the v5 browser persistence layer strips `data.debug` even in a debug session.

Do not extend the public DTO by spreading an internal result:

```ts
// Incorrect: leaks new internal fields automatically.
return NextResponse.json({ success: true, data: { ...internalResult } });

// Correct: construct the allowlist through the boundary mapper.
return successResponse(toPublicPlanData(internalResult, labels, requestId), requestId);
```
