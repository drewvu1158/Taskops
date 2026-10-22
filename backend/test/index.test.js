import assert from 'node:assert/strict';
import test from 'node:test';
import { createHandler, parseWorkflow } from '../src/index.js';

const validWorkflow = {
  title: 'Prepare Renewable Energy Report',
  category: 'research',
  tools: ['Google Scholar', 'Zotero'],
  steps: [
    'Define the report scope and submission criteria',
    'Identify authoritative primary and secondary sources',
    'Collect evidence on major renewable energy technologies',
    'Compare findings and record complete citations',
    'Create an outline tied to the report requirements',
    'Draft the report using evidence from the selected sources',
    'Review claims, citations, structure, and formatting'
  ]
};

function event(body) {
  return { httpMethod: 'POST', body: JSON.stringify(body) };
}

test('sends a validated goal through Bedrock Converse and returns TaskOps data', async () => {
  let commandInput;
  const bedrock = {
    async send(command) {
      commandInput = command.input;
      return {
        output: { message: { content: [{ text: JSON.stringify(validWorkflow) }] } },
        usage: { inputTokens: 112, outputTokens: 241 }
      };
    }
  };

  const response = await createHandler(bedrock)(event({
    goal: 'Research renewable energy and prepare a five-page report.',
    category: 'research'
  }));
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(body.workflow, validWorkflow);
  assert.deepEqual(body.usage, { inputTokens: 112, outputTokens: 241 });
  assert.equal(commandInput.modelId, 'us.amazon.nova-2-lite-v1:0');
  assert.equal(commandInput.inferenceConfig.maxTokens, 1200);
  assert.match(commandInput.messages[0].content[0].text, /renewable energy/);
});

test('rejects invalid input before invoking Bedrock', async () => {
  let called = false;
  const response = await createHandler({ send: async () => { called = true; } })(event({ goal: '  ' }));
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 400);
  assert.equal(body.error.code, 'INVALID_REQUEST');
  assert.equal(called, false);
});

test('rejects malformed model output', async () => {
  const bedrock = { send: async () => ({ output: { message: { content: [{ text: '{"title":"Incomplete"}' }] } } }) };
  const response = await createHandler(bedrock)(event({ goal: 'Plan a project launch' }), { awsRequestId: 'test-request' });
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 502);
  assert.equal(body.error.code, 'MODEL_RESPONSE_INVALID');
});

test('normalizes fenced JSON without accepting duplicate steps', () => {
  assert.deepEqual(parseWorkflow(`\`\`\`json\n${JSON.stringify(validWorkflow)}\n\`\`\``), validWorkflow);
  assert.throws(() => parseWorkflow(JSON.stringify({
    ...validWorkflow,
    steps: [validWorkflow.steps[0], validWorkflow.steps[0], ...validWorkflow.steps.slice(2)]
  })), /duplicate steps/);
});
