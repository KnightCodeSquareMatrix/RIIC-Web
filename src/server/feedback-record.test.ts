import assert from "node:assert/strict";
import test from "node:test";

import type { FeedbackRequest } from "../types.ts";
import { feedbackDirectoryGroup, toStoredFeedbackIssue } from "./feedback-record.ts";

test("performance feedback stores no arbitrary room attribution", () => {
  const request: FeedbackRequest = {
    kind: "performance_issue",
    diagnosticId: "diag-performance",
    note: "The solver took longer than expected.",
    consent: true,
  };

  assert.equal(feedbackDirectoryGroup(request), "performance");
  assert.deepEqual(toStoredFeedbackIssue(request), {
    type: "performance_issue",
    diagnosticId: "diag-performance",
    note: "The solver took longer than expected.",
    consent: true,
  });
});

test("room feedback reconstructs the storage whitelist", () => {
  const request = {
    diagnosticId: "diag-room",
    room: {
      id: "trade_1",
      title: "Trading Post 1",
      group: "trading",
      operators: ["Operator A"],
      debugBundle: { private: true },
    },
    note: "Unexpected assignment.",
    consent: true,
  } as unknown as FeedbackRequest;

  assert.equal(feedbackDirectoryGroup(request), "trading");
  assert.deepEqual(toStoredFeedbackIssue(request), {
    type: "room_issue",
    diagnosticId: "diag-room",
    room: {
      id: "trade_1",
      title: "Trading Post 1",
      group: "trading",
      operators: ["Operator A"],
    },
    note: "Unexpected assignment.",
    consent: true,
  });
});
