export function setupConfigurationFingerprint(value: unknown): string {
  return JSON.stringify(value);
}

export function hasSetupConfigurationChanged(openingFingerprint: string, currentFingerprint: string): boolean {
  return openingFingerprint !== currentFingerprint;
}
