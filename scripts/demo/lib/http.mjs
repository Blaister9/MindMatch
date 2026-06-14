export async function requestJson(url, { method = "GET", token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg = json?.error || json?.message || res.statusText;
    throw new Error(`${method} ${url} -> ${res.status} ${msg}`);
  }
  return json;
}

export async function requestText(url) {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return text;
}
