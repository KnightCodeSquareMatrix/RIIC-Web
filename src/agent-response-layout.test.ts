import assert from "node:assert/strict";
import test from "node:test";
import type { UIMessage } from "ai";
import { buildAgentDisplayTurns, hasActiveAgentContent } from "./agent-response-layout.ts";

const user: UIMessage = { id: "question", role: "user", parts: [{ type: "text", text: "你好" }] };
const assistant = (parts: UIMessage["parts"] = []): UIMessage => ({ id: "answer", role: "assistant", parts });

test("waiting, empty stream and populated response keep the same response key", () => {
  for (const messages of [[user], [user, assistant()], [user, assistant([{ type: "text", text: "你好", state: "streaming" }])]]) {
    const turns = buildAgentDisplayTurns(messages, true);
    assert.equal(turns.length, 2);
    assert.equal(turns[1].key, "response:question");
    assert.equal(turns[1].kind === "response" && turns[1].pending, true);
  }
  assert.equal(buildAgentDisplayTurns([user, assistant()], false).length, 1);
  assert.equal(buildAgentDisplayTurns([user, assistant([{ type: "reasoning", text: "", state: "done" }])], false).length, 1);
});

test("empty text keeps the loader; thinking, visible text and active tools replace it", () => {
  assert.equal(hasActiveAgentContent(assistant([{ type: "text", text: " \n", state: "streaming" }])), false);
  assert.equal(hasActiveAgentContent(assistant([{ type: "reasoning", text: "", state: "streaming" }])), true);
  assert.equal(hasActiveAgentContent(assistant([{ type: "text", text: "答复", state: "streaming" }])), true);
  assert.equal(hasActiveAgentContent(assistant([{ type: "text", text: "答复", state: "done" }])), false);
  assert.equal(hasActiveAgentContent(assistant([{ type: "tool-diagnose_account", toolCallId: "tool", state: "input-available", input: {} }])), true);
  assert.equal(hasActiveAgentContent(assistant([{ type: "tool-diagnose_account", toolCallId: "tool", state: "output-available", input: {}, output: {} }])), false);
});

test("consecutive assistant messages share a turn; later questions have separate stable turns", () => {
  const first = assistant([{ type: "text", text: "已查询", state: "done" }]);
  const second = { ...assistant([{ type: "text", text: "结论", state: "done" }]), id: "answer-2" };
  const turns = buildAgentDisplayTurns([user, first, second, { ...user, id: "question-2" }], true);
  assert.deepEqual(turns.map((turn) => turn.key), ["question", "response:question", "question-2", "response:question-2"]);
  assert.equal(turns[1].kind === "response" && turns[1].messages.length, 2);
  assert.equal(turns[1].kind === "response" && turns[1].pending, false);
  assert.equal(turns[3].kind === "response" && turns[3].pending, true);
});
