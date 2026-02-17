/**
 * Response wrapper — decorates the raw Node ServerResponse with helpers.
 */

export function wrapResponse(res) {
  /** Set status code (chainable). */
  res.status = function (code) {
    res.statusCode = code;
    return res;
  };

  /** Send JSON response. */
  res.json = function (data, statusCode) {
    if (statusCode !== undefined) res.statusCode = statusCode;
    const body = JSON.stringify(data);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Length', Buffer.byteLength(body));
    res.end(body);
  };

  /** Send text/HTML response. */
  res.send = function (data, statusCode) {
    if (statusCode !== undefined) res.statusCode = statusCode;
    const body = typeof data === 'string' ? data : String(data);
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    }
    res.setHeader('Content-Length', Buffer.byteLength(body));
    res.end(body);
  };

  /** Redirect. */
  res.redirect = function (url, code = 302) {
    res.statusCode = code;
    res.setHeader('Location', url);
    res.end();
  };

  /** Set a single header (chainable). */
  res.set = function (name, value) {
    res.setHeader(name, value);
    return res;
  };

  return res;
}
