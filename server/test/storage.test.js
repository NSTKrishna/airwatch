// Attachment bytes in object storage: with ATTACHMENT_STORAGE=s3 the row keeps only the key,
// the bucket holds the metadata-stripped image, and every visibility rule still applies
// because the API serves the bytes itself.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { PNG, complaintForm, startStack } from './helpers/stack.js';
import { startFakeS3 } from './helpers/fakeS3.js';

const BUCKET = 'airwatch-test-evidence';
let stack; let api; let prisma; let tokens; let s3;
const ctx = {};

before(async () => {
  s3 = await startFakeS3(BUCKET);
  stack = await startStack({
    ATTACHMENT_STORAGE: 's3', S3_BUCKET: BUCKET, S3_REGION: 'ap-south-1', S3_ENDPOINT: s3.url, S3_FORCE_PATH_STYLE: 'true',
    AWS_ACCESS_KEY_ID: 'test-only', AWS_SECRET_ACCESS_KEY: 'test-only', AWS_MAX_ATTEMPTS: '1', AWS_EC2_METADATA_DISABLED: 'true',
  });
  ({ api, prisma, tokens } = stack);
});
after(async () => {
  await stack?.close();
  await s3?.close();
});

test('readiness reports the object store and whether it answers', async () => {
  const ready = await api('GET', '/health/ready');
  assert.equal(ready.status, 200);
  assert.equal(ready.body.attachmentStorage, 's3');
  assert.equal(ready.body.attachmentStorageReady, true);
});

test('a report photograph is stored in the bucket, not in the row', async () => {
  const site = stack.siteIn(0);
  const created = await api('POST', '/complaints', {
    token: tokens.citizen,
    form: complaintForm({ projectCode: site.project.code, description: 'Dust blowing across the road from an uncovered debris pile.' }),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  ctx.complaint = created.body.complaint;

  const [row] = await prisma.attachment.findMany({ where: { complaintId: ctx.complaint.id } });
  assert.equal(row.data, null);
  assert.match(row.storageKey, /^attachments\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);
  assert.equal(s3.objects.size, 1);
  assert.equal(s3.objects.get(row.storageKey).type, 'image/png');
  ctx.row = row;

  const own = await api('GET', `/attachments/${row.id}`, { token: tokens.citizen });
  assert.equal(own.status, 200);
  assert.equal(own.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(own.body), s3.objects.get(row.storageKey).body);
  assert.deepEqual(Buffer.from(own.body), PNG);
});

test('the public rules still decide who is served a stored photograph', async () => {
  const url = `/public/attachments/${ctx.row.id}`;
  assert.equal((await api('GET', url)).status, 404, 'not public before the desk has looked at the report');
  const officer = { token: tokens.officer };
  assert.equal((await api('POST', `/municipal/complaints/${ctx.complaint.id}/status`, { ...officer, json: { status: 'UNDER_REVIEW' } })).status, 200);
  const shown = await api('GET', url);
  assert.equal(shown.status, 200);
  assert.deepEqual(Buffer.from(shown.body), PNG);
  assert.equal((await api('POST', `/municipal/complaints/${ctx.complaint.id}/visibility`, { ...officer, json: { hidden: true, reason: 'Shows a face' } })).status, 200);
  assert.equal((await api('GET', url)).status, 404, 'hidden reports stop being served');
});

test('inspection evidence and follow-up photographs take the same path', async () => {
  const officer = { token: tokens.officer };
  const before = s3.objects.size;
  await api('POST', `/municipal/complaints/${ctx.complaint.id}/visibility`, { ...officer, json: { hidden: false } });
  const evidence = new FormData();
  evidence.append('files', new Blob([PNG], { type: 'image/png' }), 'inspection.png');
  assert.equal((await api('POST', `/municipal/complaints/${ctx.complaint.id}/evidence`, { ...officer, form: evidence })).status, 201);
  const followUp = new FormData();
  followUp.append('kind', 'STILL_UNRESOLVED');
  followUp.append('note', 'Still dusty this morning.');
  followUp.append('photos', new Blob([PNG], { type: 'image/png' }), 'site.png');
  const added = await api('POST', `/complaints/reports/${ctx.complaint.reference}/follow-ups`, { token: tokens.citizen, form: followUp });
  assert.equal(added.status, 201, JSON.stringify(added.body));
  assert.equal(s3.objects.size, before + 2);
  assert.equal(await prisma.attachment.count({ where: { data: { not: null } } }), 0);
});

test('nothing is left in the bucket when the database write fails', async () => {
  const { withStoredAttachments } = await import('../src/lib/storage.js');
  const before = s3.objects.size;
  const rows = [{ filename: 'a.png', mimeType: 'image/png', sizeBytes: PNG.length, data: PNG }];
  await assert.rejects(withStoredAttachments(rows, async (stored) => {
    assert.equal(s3.objects.size, before + 1);
    assert.equal(stored[0].data, null);
    throw new Error('database write failed');
  }), /database write failed/);
  assert.equal(s3.objects.size, before);
});

test('a report is refused, and nothing recorded, when the bucket cannot be written', async () => {
  const count = await prisma.complaint.count();
  s3.state.failPuts = true;
  try {
    const failed = await api('POST', '/complaints', {
      token: tokens.citizen,
      form: complaintForm({ projectCode: stack.siteIn(1).project.code, description: 'Dust from demolition work with no water spraying.' }),
    });
    assert.equal(failed.status, 500);
  } finally {
    s3.state.failPuts = false;
  }
  assert.equal(await prisma.complaint.count(), count);
});
