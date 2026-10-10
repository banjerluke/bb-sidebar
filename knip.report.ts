import config, { sdkPeerDependencies } from "./knip";

// Informational audit. Expected to exit 1 until SB-8 prunes dependencies and exports.
export default { ...config, ignoreDependencies: sdkPeerDependencies, ignoreIssues: {} };
