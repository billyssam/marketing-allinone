export const MIN_EXTENSION_VERSION = '0.5.2';
export function compatibleExtension(version?: string): boolean {
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) return false;
  const actual = version.split('.').map(Number), minimum = MIN_EXTENSION_VERSION.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (actual[i] !== minimum[i]) return actual[i] > minimum[i];
  }
  return true;
}
