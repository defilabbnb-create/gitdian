export const HEALTH_THRESHOLDS = {
  deepCoverage: {
    warning: 0.05,
    critical: 0.02,
  },
  homepageUnsafeRate: {
    warning: 0.1,
    critical: 0.2,
  },
  incompleteRate: {
    warning: 0.8,
    critical: 0.9,
  },
  deepQueueSize: {
    warning: 1_000,
    critical: 2_000,
  },
  badTemplateCount: {
    warning: 1,
    critical: 5,
  },
};
