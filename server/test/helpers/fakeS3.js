// A minimal in-process stand-in for S3 (path-style PUT, GET, DELETE of objects and HEAD of
// the bucket), enough to exercise the storage adapter without a network or an AWS account.
import http from 'node:http';

export async function startFakeS3(bucket) {
  const objects = new Map();
  const state = { failPuts: false };
  const server = http.createServer((req, res) => {
    const [, name, ...rest] = decodeURIComponent(new URL(req.url, 'http://s3').pathname).split('/');
    const key = rest.join('/');
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (name !== bucket) return res.writeHead(404).end();
      if (req.method === 'HEAD' && !key) return res.writeHead(200).end();
      if (req.method === 'PUT') {
        if (state.failPuts) return res.writeHead(500, { 'content-type': 'application/xml' }).end('<Error><Code>InternalError</Code></Error>');
        objects.set(key, { body: Buffer.concat(chunks), type: req.headers['content-type'] });
        return res.writeHead(200, { etag: '"fake"' }).end();
      }
      const object = objects.get(key);
      if (req.method === 'DELETE') {
        objects.delete(key);
        return res.writeHead(204).end();
      }
      if (req.method === 'GET' && object) return res.writeHead(200, { 'content-type': object.type, 'content-length': object.body.length }).end(object.body);
      return res.writeHead(404, { 'content-type': 'application/xml' }).end('<Error><Code>NoSuchKey</Code></Error>');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    objects,
    state,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
