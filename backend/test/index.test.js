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

function memoryDocuments(store = new Map()) {
  return {
    store,
    async send(command) {
      const input = command.input;
      if (input.Item) {
        store.set(input.Item.clientId, input.Item);
        return {};
      }
      const key = input.Key.clientId;
      if (input.UpdateExpression) {
        const current = store.get(key)?.generations || 0;
        if (current >= input.ExpressionAttributeValues[':limit']) {
          const error = new Error('quota');
          error.name = 'ConditionalCheckFailedException';
          throw error;
        }
        store.set(key, { generations: current + input.ExpressionAttributeValues[':one'] });
        return {};
      }
      return { Item: store.get(key) };
    }
  };
}

test('stores and reloads a shared workspace', async () => {
  const previous = process.env.STATE_TABLE_NAME;
  process.env.STATE_TABLE_NAME = 'taskops-state';
  try {
    const documents = memoryDocuments();
    const handler = createHandler({ send: async () => { throw new Error('bedrock should not be called'); } }, { documents });
    const saved = await handler({
      httpMethod: 'PUT',
      resource: '/state',
      requestContext: { identity: { apiKeyId: 'key1' } },
      body: JSON.stringify({
        tasks: [{ id: 'task-1', title: 'Shared workflow', description: 'Keep both clients aligned', steps: [{ id: 's1', text: 'Do the first step', done: true }] }],
        profile: { name: 'Ava' }
      })
    });
    const loaded = await handler({
      httpMethod: 'GET',
      resource: '/state',
      requestContext: { identity: { apiKeyId: 'key1' } }
    });
    const savedBody = JSON.parse(saved.body);
    const loadedBody = JSON.parse(loaded.body);

    assert.equal(saved.statusCode, 200);
    assert.equal(loaded.statusCode, 200);
    assert.equal(loadedBody.initialized, true);
    assert.equal(loadedBody.profile.name, 'Ava');
    assert.equal(loadedBody.tasks[0].title, 'Shared workflow');
    assert.equal(loadedBody.tasks[0].steps[0].done, true);
    assert.equal(loadedBody.revision, savedBody.revision);

    const kept = await handler({
      httpMethod: 'PUT',
      resource: '/state',
      requestContext: { identity: { apiKeyId: 'key1' } },
      body: JSON.stringify({ tasks: savedBody.tasks })
    });
    assert.equal(JSON.parse(kept.body).profile.name, 'Ava');
  } finally {
    if (previous == null) delete process.env.STATE_TABLE_NAME;
    else process.env.STATE_TABLE_NAME = previous;
  }
});

test('rejects an invalid workspace before writing', async () => {
  const previous = process.env.STATE_TABLE_NAME;
  process.env.STATE_TABLE_NAME = 'taskops-state';
  try {
    let called = false;
    const documents = { send: async () => { called = true; return {}; } };
    const response = await createHandler({ send: async () => ({}) }, { documents })({
      httpMethod: 'PUT',
      resource: '/state',
      body: JSON.stringify({ tasks: [{ title: 'Missing id' }] })
    });
    assert.equal(response.statusCode, 400);
    assert.equal(JSON.parse(response.body).error.code, 'INVALID_REQUEST');
    assert.equal(called, false);
  } finally {
    if (previous == null) delete process.env.STATE_TABLE_NAME;
    else process.env.STATE_TABLE_NAME = previous;
  }
});

test('stops workflow generation after the daily quota', async () => {
  const previous = process.env.STATE_TABLE_NAME;
  process.env.STATE_TABLE_NAME = 'taskops-state';
  try {
    const day = new Date().toISOString().slice(0, 10);
    const documents = memoryDocuments(new Map([[`local#gen#${day}`, { generations: 1000000 }]]));
    const response = await createHandler({ send: async () => { throw new Error('should not call bedrock'); } }, { documents })(event({
      goal: 'Plan a project launch'
    }));
    assert.equal(response.statusCode, 429);
    assert.equal(JSON.parse(response.body).error.code, 'GENERATION_QUOTA');
  } finally {
    if (previous == null) delete process.env.STATE_TABLE_NAME;
    else process.env.STATE_TABLE_NAME = previous;
  }
});

test('creates a Jira epic and child tasks from a workflow', async () => {
  const previous = process.env.JIRA_SECRET_ARN;
  process.env.JIRA_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:jira';
  try {
    const calls = [];
    const secrets = {
      async send() {
        return {
          SecretString: JSON.stringify({
            baseUrl: 'https://example.atlassian.net',
            email: 'dev@example.com',
            apiToken: 'token',
            projectKey: 'task'
          })
        };
      }
    };
    const fetchImpl = async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body), authorization: options.headers.Authorization });
      return {
        ok: true,
        async json() { return { key: calls.length === 1 ? 'TASK-1' : `TASK-${calls.length}` }; }
      };
    };
    const response = await createHandler({ send: async () => ({}) }, { secrets, fetch: fetchImpl })({
      httpMethod: 'POST',
      resource: '/workflow/jira',
      body: JSON.stringify({
        title: 'Prepare the report',
        description: 'Research and draft it.',
        steps: ['Collect sources', 'Draft the report']
      })
    });
    const body = JSON.parse(response.body);

    assert.equal(response.statusCode, 201);
    assert.equal(body.epic.key, 'TASK-1');
    assert.equal(body.epic.url, 'https://example.atlassian.net/browse/TASK-1');
    assert.equal(body.issues.length, 2);
    assert.equal(calls[0].body.fields.issuetype.name, 'Epic');
    assert.equal(calls[1].body.fields.parent.key, 'TASK-1');
    assert.equal(calls[0].body.fields.project.key, 'TASK');
    assert.match(calls[0].authorization, /^Basic /);
  } finally {
    if (previous == null) delete process.env.JIRA_SECRET_ARN;
    else process.env.JIRA_SECRET_ARN = previous;
  }
});

test('does not call Jira when the secret is still a placeholder', async () => {
  const previous = process.env.JIRA_SECRET_ARN;
  process.env.JIRA_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:jira';
  try {
    let called = false;
    const response = await createHandler({ send: async () => ({}) }, {
      secrets: { send: async () => ({ SecretString: '{"baseUrl":"","email":"","apiToken":"generated","projectKey":""}' }) },
      fetch: async () => { called = true; return { ok: true, json: async () => ({}) }; }
    })({
      httpMethod: 'POST',
      resource: '/workflow/jira',
      body: JSON.stringify({ title: 'Prepare the report', steps: ['Collect sources'] })
    });
    assert.equal(response.statusCode, 503);
    assert.equal(JSON.parse(response.body).error.code, 'JIRA_NOT_CONFIGURED');
    assert.equal(called, false);
  } finally {
    if (previous == null) delete process.env.JIRA_SECRET_ARN;
    else process.env.JIRA_SECRET_ARN = previous;
  }
});
