import { DEFAULT_PHOTO_TYPE_OPTIONS, PhotoTypeOption } from '../constants/photoTypes';

async function parseJson(response: Response) {
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}

async function expectOk(response: Response) {
  if (response.ok) return parseJson(response);
  const payload = await parseJson(response).catch(() => undefined);
  throw new Error(payload?.error || `Photo type request failed (${response.status})`);
}

export async function listPublicPhotoTypes(fetchImpl: typeof fetch = fetch): Promise<PhotoTypeOption[]> {
  try {
    const payload = await expectOk(await fetchImpl('/api/photo-types'));
    return Array.isArray(payload) && payload.length ? payload : DEFAULT_PHOTO_TYPE_OPTIONS;
  } catch {
    return DEFAULT_PHOTO_TYPE_OPTIONS;
  }
}
