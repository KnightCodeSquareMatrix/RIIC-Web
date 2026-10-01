import assert from "node:assert/strict";
import test from "node:test";
import catalogue from "./generated/arkntools/operator-catalog.json" with { type: "json" };
import { findOperatorMentions, MAX_OPERATOR_PORTRAITS } from "./agent-operator-mentions.ts";
import { prepareAgentMarkdown, type InlineToken, type MarkdownNode } from "./agent-markdown.ts";

function tokens(nodes: MarkdownNode<InlineToken[]>[]): InlineToken[] {
  return nodes.flatMap((node) => {
    if (node.kind === "code" || node.kind === "rule") return [];
    if (node.kind === "table") return [...node.headers.flat(), ...node.rows.flat(2)];
    if (node.kind === "ol" || node.kind === "ul") return node.items.flat();
    return node.text;
  });
}
const mentions = (content: string, streaming = false, previousParts: string[] = []) => tokens(prepareAgentMarkdown(content, streaming, previousParts)).flatMap((token) => token.mentions);

test("full names win over prefixes and aliases share an operator identity", () => {
  assert.deepEqual(findOperatorMentions("红云、红、阿米娅（近卫）、阿米娅、假干员").map((item) => item.name), ["红云", "红", "阿米娅"]);
  const matched = findOperatorMentions("建议优先培养能天使，再部署银灰。");
  assert.deepEqual(matched.map((item) => item.name), ["能天使", "银灰"]);
  assert.equal(matched[0].start, 6);
  assert.equal(matched[0].end, 9);
  assert.ok(matched.every((item) => item.portrait.startsWith("/images/operator-portraits/") && item.portrait.includes("?v=")));
});

test("short names and Latin boundaries avoid ordinary words", () => {
  assert.deepEqual(findOperatorMentions("今年有空闲，红色和夕阳，爬山时看白雪，给医生留言，四月份。Windows HTTP THRM-EXTRA").map((item) => item.name), []);
  assert.deepEqual(findOperatorMentions("红、年、令、山、W、12F、THRM-EX").map((item) => item.name), ["红", "年", "令", "山", "W", "12F", "THRM-EX"]);
  assert.deepEqual(mentions("**红**的作用；培养银灰到精二；推荐红云，阿米娅。").map((item) => item.name), ["红", "银灰", "红云", "阿米娅"]);
  assert.equal(mentions("**红色**很漂亮；**今年**有空闲。").length, 0);
});

test("Markdown excludes code and links without consuming their first occurrence", () => {
  const content = "`能天使` [银灰](https://example.test/阿米娅) https://example.test/红云\n\n```text\n可露希尔\n```\n\n能天使、银灰、阿米娅、红云、可露希尔。";
  assert.deepEqual(mentions(content).map((item) => item.name), ["能天使", "银灰", "阿米娅", "红云", "可露希尔"]);
  const nodes = prepareAgentMarkdown(content);
  assert.equal(nodes.find((node) => node.kind === "code")?.text, "可露希尔");
  assert.equal(tokens(nodes).find((token) => token.kind === "link")?.href, "https://example.test/%E9%98%BF%E7%B1%B3%E5%A8%85");
  assert.equal(mentions("[能天使](javascript:alert) [银灰](/images/x)").length, 0);
});

test("blocks, formats and tool-separated parts share one cap and first occurrence", () => {
  const content = "# 能天使\n\n> 银灰\n\n- 阿米娅\n- 红云\n\n| 干员 | 备注 |\n| --- | --- |\n| 可露希尔 | 能天使 |\n\n**红**，阿米娅。";
  assert.deepEqual(mentions(content).map((item) => item.name), ["能天使", "银灰", "阿米娅", "红云", "可露希尔", "红"]);
  assert.deepEqual(mentions(content, false, ["能天使。", "银灰，阿米娅（医疗）。"]).map((item) => item.name), ["红云", "可露希尔", "红"]);
  const allNames = catalogue.map((operator) => operator.name).join("、");
  assert.equal(mentions(allNames).length, MAX_OPERATOR_PORTRAITS);
  assert.equal(mentions(allNames, false, [allNames]).length, 0);
});

test("streaming waits for a closed block and never treats a trailing newline as a blank line", () => {
  for (const content of ["能天", "能天使", "能天使\n", "能天使\n继续说明"]) assert.equal(mentions(content, true).length, 0);
  assert.deepEqual(mentions("能天使\n\n银灰", true).map((item) => item.name), ["能天使"]);
  assert.deepEqual(mentions("能天使\n\n银灰", false).map((item) => item.name), ["能天使", "银灰"]);
  assert.equal(mentions("- 能天使\n", true).length, 0);
  assert.equal(mentions("- 能天使\n\n", true).length, 1);
});

test("source text and cached results are unaffected by per-message deduplication", () => {
  const content = "能天使，能天使；阿米娅（近卫）。";
  const first = prepareAgentMarkdown(content);
  assert.equal(tokens(first).map((token) => token.text).join(""), content);
  assert.equal(mentions(content, false, [content]).length, 0);
  assert.equal(mentions(content).length, 2);
  assert.deepEqual(prepareAgentMarkdown(content), first);
  assert.equal(findOperatorMentions("能天使，".repeat(10_000)).length, 1);
});
