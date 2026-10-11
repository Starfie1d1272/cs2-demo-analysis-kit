import path from 'node:path';

export function portablePath(file) { return file.replaceAll('\\', '/'); }
export function isTestFile(file) {
  const parts = portablePath(file).split('/');
  return parts.includes('__tests__') || /\.test(?:\.|$)|^test-fixtures(?:\.|$)/.test(parts.at(-1));
}
export function isWithin(directory, file, paths = path) {
  const relative = paths.relative(directory, file);
  return relative === '' || (!paths.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + paths.sep));
}
export function isPublishableFile(file) {
  const normalized = portablePath(file);
  return !normalized.split('/').includes('src') && !isTestFile(normalized) && !/\.tsbuildinfo$|\.map$/.test(normalized);
}
