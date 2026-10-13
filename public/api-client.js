export async function api(path, options = {}, fetchImpl = fetch) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetchImpl(path, {
    ...options,
    credentials: "same-origin",
    headers
  });
  let data = null;
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data?.error || "No se pudo completar la solicitud");
  return data;
}

