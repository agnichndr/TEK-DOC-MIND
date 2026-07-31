import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_SKILLS_MARKDOWN_LENGTH,
  projectAgentInputSchema,
} from "../types/agent.ts";

const validAgent = {
  name: "Documentation reviewer",
  description: "Reviews documentation changes.",
  connector: "openai" as const,
  model: "provider/model-v1",
  outputMode: "single" as const,
  outputType: "text" as const,
  skillsMarkdown: "# Review skills\n\n- Check accuracy\n- Explain findings",
};

test("accepts a project agent with bounded Markdown skills", () => {
  const result = projectAgentInputSchema.safeParse(validAgent);
  assert.equal(result.success, true);
});

test("requires a supported connector, model, and non-empty skills document", () => {
  assert.equal(
    projectAgentInputSchema.safeParse({ ...validAgent, connector: "other" }).success,
    false,
  );
  assert.equal(
    projectAgentInputSchema.safeParse({ ...validAgent, model: "bad model" }).success,
    false,
  );
  assert.equal(
    projectAgentInputSchema.safeParse({ ...validAgent, skillsMarkdown: "" }).success,
    false,
  );
});

test("rejects oversized skills Markdown", () => {
  assert.equal(
    projectAgentInputSchema.safeParse({
      ...validAgent,
      skillsMarkdown: "x".repeat(MAX_SKILLS_MARKDOWN_LENGTH + 1),
    }).success,
    false,
  );
});

test("requires supported output behavior and output type values", () => {
  assert.equal(
    projectAgentInputSchema.safeParse({ ...validAgent, outputMode: "batch" }).success,
    false,
  );
  assert.equal(
    projectAgentInputSchema.safeParse({ ...validAgent, outputType: "audio" }).success,
    false,
  );
  assert.equal(
    projectAgentInputSchema.safeParse({
      ...validAgent,
      outputMode: "multiple",
      outputType: "image",
    }).success,
    true,
  );
});
