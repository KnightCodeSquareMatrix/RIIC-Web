# Frontend Serve Guide

The Next server keeps one `infra-cli serve` process alive instead of spawning a CLI process for every layout.

## Transport

Start the worker once:

```bash
infra-cli serve
```

- stdin: one JSON request per line.
- stdout: one JSON response per line.
- stderr: logs only; never parse stderr as protocol output.

## Capability gate

Before choosing a plan method, send:

```json
{"id":1,"method":"ping","params":{}}
```

The frontend uses `plan.compute` when both version fields match the supported contract:

```json
{
  "id": 1,
  "ok": true,
  "result": {
    "pong": true,
    "protocol_version": 1,
    "plan_schema_version": 3,
    "plan_contract_sha256": "<diagnostic-schema-fingerprint>",
    "solver_executable_sha256": "<running-executable-fingerprint>"
  }
}
```

`plan_contract_sha256` and `solver_executable_sha256` are diagnostic identities, not capability switches. In particular, LF and CRLF copies of the same schema may have different byte hashes without changing compatibility. Missing or different schema hashes therefore do not select the legacy route. A genuinely missing or mismatched `protocol_version` or `plan_schema_version` keeps using the legacy `plan` method for runtime compatibility.

Deployment health is intentionally stricter than runtime routing when `INFRA_CLI_EXPECTED_SHA256` is configured. In that mode the server pins CLI selection to the packaged platform binary in `bin/`, requires both current versions, and requires the Worker fingerprint to match that artifact. A version or executable mismatch makes `plannerReady` false so the release runner rolls back; `INFRA_CLI_PATH` and a persisted active CLI cannot silently replace the verified artifact. Local or unmanaged environments may omit the expected hash, retain normal CLI candidate selection, and keep a legacy Worker available. The contract hash is recorded but never compared against a frontend constant.

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
3. Write one request line and match the response by `id`.
4. Persist the request, response, stdout, stderr, profile, MAA, rotation, and debug bundle.
5. If the process exits while a request is active, restart it and retry the active request once.

## Public API boundary

The CLI response is an internal transport object. It must never be returned directly from a Next.js route handler.

`src/server/infra.ts` may retain CLI paths, commands, stdout, stderr, serve requests/responses, the ping observation and run-directory metadata for local diagnostics. Feedback looks up that exact private run by diagnostic ID and copies its solver observation into private `meta.json`; old or missing runs use `solver: null`. `src/server/public-plan.ts` is the required boundary before `/api/plan`: it constructs a new allowlisted DTO containing profile, MAA, rotation, duration, an opaque diagnostic ID and, when supplied by the current Worker, optional `trainingRoom` and `trainingAdvice` values parsed through their own strict public contracts. Training-room operators remain outside `maa.plans[*].rooms`, so MAA downloads never contain a training room or its occupants. Rotation is rebuilt through `src/rotation-result.ts`; only the selected profile, daily summary, normalized shifts, team state, weighted efficiency and normalized room efficiency are public. Raw `efficiencies`, assignments, solver identities and future unknown Worker or training fields are not forwarded in production.

The server appends diagnostic values under `data.debug` only when `BETA_DEBUG_TOOLS_ENABLED=1` and that `/api/plan` request explicitly carries `?beta=1`. The query parameter cannot override a disabled server switch or the production deployment policy, while an ordinary development request remains limited to the core allowlist plus the two optional training fields even when the server switch is enabled. Public contract tests recursively reject internal field names in production responses, and the v5 browser persistence layer strips `data.debug` even in a debug session.

Do not extend the public DTO by spreading an internal result:

```ts
// Incorrect: leaks new internal fields automatically.
return NextResponse.json({ success: true, data: { ...internalResult } });

// Correct: construct the allowlist through the boundary mapper.
return successResponse(toPublicPlanData(internalResult, labels, requestId), requestId);
```
