// Run with: npm test
// Stands up a throwaway HTTP server and checks the multipart body we actually send.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { uploadToEreader } from './upload.js';

// Start a server that parses the incoming multipart request back into fields.
async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    return await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// Reads the request with the platform's own multipart parser, so we assert on
// what a real server would see rather than on our own formatting.
function captureRequest(received) {
  return (req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const body = Buffer.concat(chunks);
      const form = await new Response(body, {
        headers: { 'content-type': req.headers['content-type'] },
      }).formData();
      received.contentType = req.headers['content-type'];
      received.url = req.url;
      received.method = req.method;
      received.fields = {};
      for (const [name, value] of form.entries()) {
        received.fields[name] =
          typeof value === 'string'
            ? value
            : { filename: value.name, type: value.type, text: await value.text() };
      }
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
    });
  };
}

test('sends key, file and enabled toggles as multipart/form-data', async () => {
  const received = {};
  const result = await withServer(captureRequest(received), (baseUrl) =>
    uploadToEreader({
      baseUrl,
      key: 'ABC123',
      filename: 'my book.epub',
      data: new TextEncoder().encode('EPUB-BYTES'),
      contentType: 'application/epub+zip',
      settings: { kepubify: true, kindlegen: false, pdfcropmargins: true },
    }),
  );

  assert.equal(result, 'ok');
  assert.equal(received.method, 'POST');
  assert.equal(received.url, '/upload');
  assert.match(received.contentType, /^multipart\/form-data; boundary=/);

  assert.equal(received.fields.key, 'ABC123');
  assert.deepEqual(received.fields.file, {
    filename: 'my book.epub',
    type: 'application/epub+zip',
    text: 'EPUB-BYTES',
  });

  // Only enabled toggles are present, as HTML checkboxes behave.
  assert.equal(received.fields.kepubify, 'on');
  assert.equal(received.fields.pdfcropmargins, 'on');
  assert.ok(!('kindlegen' in received.fields), 'disabled toggle must be omitted');
});

test('omits every toggle when all are off', async () => {
  const received = {};
  await withServer(captureRequest(received), (baseUrl) =>
    uploadToEreader({
      baseUrl,
      key: 'XYZ',
      filename: 'a.pdf',
      data: new Uint8Array([1, 2, 3]),
      settings: { kepubify: false, kindlegen: false, pdfcropmargins: false },
    }),
  );

  assert.deepEqual(Object.keys(received.fields).sort(), ['file', 'key']);
  assert.equal(received.fields.file.type, 'application/octet-stream');
});

test('throws with the status code when the server rejects the upload', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(500);
      res.end('nope');
    },
    async (baseUrl) => {
      await assert.rejects(
        uploadToEreader({
          baseUrl,
          key: 'ABC',
          filename: 'a.epub',
          data: new Uint8Array([0]),
        }),
        /send2ereader returned 500/,
      );
    },
  );
});
