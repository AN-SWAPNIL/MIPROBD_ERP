// This source tree is the real ERP. Mock UI/auth lives only on prototype.
export const foundationMode = true;
export const demoMode = false;
export const workspacePath = (path: string) => foundationMode ? path.replace(/^\/app(?=\/|$)/, "/backend") : path;
