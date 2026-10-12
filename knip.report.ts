import config, { sdkPeerDependencies } from "./knip";

// Informational audit. Expected to exit 1 while deferred unused exports and types remain.
export default { ...config, ignoreDependencies: sdkPeerDependencies, ignoreIssues: {} };
