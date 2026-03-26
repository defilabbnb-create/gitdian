export type WebBuildInfo = {
  gitSha: string;
  buildTime: string;
  environment: string;
};

function readBuildValue(value: string | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

export function getWebBuildInfo(): WebBuildInfo {
  return {
    gitSha: readBuildValue(process.env.NEXT_PUBLIC_BUILD_GIT_SHA, 'unknown'),
    buildTime: readBuildValue(
      process.env.NEXT_PUBLIC_BUILD_TIME,
      'unknown build time',
    ),
    environment: readBuildValue(
      process.env.NEXT_PUBLIC_BUILD_ENVIRONMENT,
      'unknown environment',
    ),
  };
}
