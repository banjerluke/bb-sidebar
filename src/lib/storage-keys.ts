// Lower priorities are evicted first. Existing keys and versions are durable.
export const STORAGE_KEYS = {
  // Runtime start stamps for duration labels.
  workingSince: { key: "bb-sidebar:working-since:v1", evictionPriority: 10 },
  // Last RPC inbox order.
  inboxOrder: { key: "bb-sidebar:inbox-order-cache:v1", evictionPriority: 20 },
  // Last RPC section header order.
  sectionOrder: { key: "bb-sidebar:section-order-cache:v1", evictionPriority: 21 },
  // Last RPC lifecycle rows.
  lifecycle: { key: "bb-sidebar:lifecycle-cache:v1", evictionPriority: 30 },
  // Expanded child parent IDs.
  childExpansion: { key: "bb-sidebar:child-expansion:v1", evictionPriority: 40 },
  // Collapsed project IDs.
  projectCollapse: { key: "bb-sidebar:project-collapse:v1", evictionPriority: 50 },
  // Collapsed section IDs.
  sectionCollapse: { key: "bb-sidebar:section-collapse:v1", evictionPriority: 51 },
  // Whether the empty-sections footer is open.
  emptySectionsExpanded: { key: "bb-sidebar:empty-sections-expanded:v1", evictionPriority: 56 },
  // Selected projects in this window's session storage; empty means all.
  projectScope: { key: "bb-sidebar:project-scope:v1", evictionPriority: 85 },
  // Project shortcuts saved on this device, in pin order.
  pinnedProjects: { key: "bb-sidebar:pinned-projects:v1", evictionPriority: 90 },
  environmentCollapse: { key: "bb-sidebar:environment-collapse:v1", evictionPriority: 55 },
  environmentGrouping: { key: "bb-sidebar:environment-grouping:v1", evictionPriority: 71 },
  // Shelf disclosure booleans.
  shelfExpansion: { key: "bb-sidebar:shelf-expansion:v1", evictionPriority: 60 },
  // Read-only legacy Active sort mode, superseded by activeView.
  activeSort: { key: "bb-sidebar:active-sort:v1", evictionPriority: 70 },
  // Active shelf grouping and order.
  activeView: { key: "bb-sidebar:active-view:v1", evictionPriority: 72 },
  // Last RPC sidebar settings.
  settings: { key: "bb-sidebar:settings-cache:v1", evictionPriority: 80 },
  // Read-only legacy project grouping migration.
  activeGrouping: { key: "bb-sidebar:active-grouping:v1", evictionPriority: 65 },
  // Machine selected for port links on this device.
  portLinkHost: { key: "bb-sidebar:port-link-host:v1", evictionPriority: 75 },
} as const;

export const PLUGIN_STORAGE_KEYS = Object.values(STORAGE_KEYS)
  .sort((a, b) => a.evictionPriority - b.evictionPriority)
  .map(({ key }) => key);
