// Multipart upload to a send2ereader instance.
// Kept in its own module so the core upload path is testable without Telegram.

/**
 * POST a file to `${baseUrl}/upload` as multipart/form-data.
 *
 * @param {object} opts
 * @param {string} opts.baseUrl        send2ereader base URL, e.g. https://send.djazz.se
 * @param {string} opts.key            the key shown on the ereader
 * @param {string} opts.filename       original file name (extension matters to the server)
 * @param {Uint8Array|ArrayBuffer} opts.data  file bytes
 * @param {string} [opts.contentType]  MIME type; defaults to application/octet-stream
 * @param {object} [opts.settings]     { kepubify, kindlegen, pdfcropmargins } booleans
 * @returns {Promise<string>} the response body on success
 * @throws {Error} on a non-2xx response or a network failure
 */
export async function uploadToEreader({
  baseUrl,
  key,
  filename,
  data,
  contentType = 'application/octet-stream',
  settings = {},
}) {
  const form = new FormData();
  form.append('key', key);
  form.append('file', new Blob([data], { type: contentType }), filename);

  // send2ereader reads these as HTML checkboxes: present means on, absent means off.
  if (settings.kepubify) form.append('kepubify', 'on');
  if (settings.kindlegen) form.append('kindlegen', 'on');
  if (settings.pdfcropmargins) form.append('pdfcropmargins', 'on');

  const res = await fetch(`${baseUrl}/upload`, { method: 'POST', body: form });
  const body = await res.text();

  if (!res.ok) {
    throw new Error(`send2ereader returned ${res.status} ${res.statusText}`);
  }
  return body;
}
