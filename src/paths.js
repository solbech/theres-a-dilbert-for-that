// Archive paths for macOS, Linux and Windows. Pure logic, shared by the page and tools/check-paths.mjs.
// A Windows path has a drive (C:\Dilbert) or a server (\\NAS\Public\Dilbert). Forward slashes after a drive also work.
const isWindows = (path) => /^[a-z]:([\\/]|$)/i.test(path) || path.startsWith('\\\\');

export const cleanRoot = (path) => path.replace(isWindows(path) ? /[\\/]+$/ : /\/+$/, '');

// file is always relative with forward slashes, as in data.js and archive-index.js.
export const joinPath = (root, file) => (isWindows(root) ? `${root}\\${file.replaceAll('/', '\\')}` : `${root}/${file}`);

// Filenames can hold %, # and control characters, so each path segment is encoded.
export const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

export function fileUrl(path) {
  if (!isWindows(path)) return `file://${encodePath(path)}`;
  const slashed = path.replaceAll('\\', '/');
  if (slashed.startsWith('//')) return `file://${encodePath(slashed.slice(2))}`;
  return `file:///${slashed.slice(0, 2)}${encodePath(slashed.slice(2))}`; // the colon after the drive stays as it is
}

// The folder holding a file:// page, from location.host and location.pathname.
export function folderOf(host, pathname) {
  const folder = decodeURIComponent(pathname).replace(/\/[^/]*$/, '');
  if (host) return `\\\\${host}${folder.replaceAll('/', '\\')}`;
  return /^\/[a-z]:/i.test(folder) ? folder.slice(1).replaceAll('/', '\\') : folder;
}
