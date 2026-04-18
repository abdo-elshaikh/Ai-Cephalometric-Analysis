import { IMAGE_BASE_URL } from '../api/api';

function encodePathPreservingSlashes(pathname: string) {
  return pathname
    .split('/')
    .map((seg) => {
      if (seg === '') return '';
      try {
        return encodeURIComponent(decodeURIComponent(seg));
      } catch {
        return encodeURIComponent(seg);
      }
    })
    .join('/');
}

export function toPublicUrl(pathOrUrl: string) {
  const raw = (pathOrUrl ?? '').toString();
  if (!raw) return raw;

  // Absolute URL: encode its pathname safely
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      u.pathname = encodePathPreservingSlashes(u.pathname);
      return u.toString();
    } catch {
      return raw;
    }
  }

  // Relative path: join to API host and encode
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  const u = new URL(normalized, IMAGE_BASE_URL);
  u.pathname = encodePathPreservingSlashes(u.pathname);
  return u.toString();
}

