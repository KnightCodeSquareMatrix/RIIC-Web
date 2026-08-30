const ignoreCloudWorkspace = () => {};

export function useAccountCloudWorkspace(input: unknown) {
  void input;
  return {
    cloudWorkspaceData: null,
    applyWorkspace: ignoreCloudWorkspace,
    refreshCloudData: ignoreCloudWorkspace,
    syncElement: null,
  };
}
