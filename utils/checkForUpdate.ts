import Constants from 'expo-constants';

const REPO = 'abdulhaseeb549/groupmate';

export type UpdateCheckResult =
  | { status: 'up_to_date'; currentBuild: number }
  | { status: 'update_available'; currentBuild: number; latestBuild: number; downloadUrl: string; releaseUrl: string }
  | { status: 'unknown'; message: string };

/**
 * Compares this install's baked-in build number (embedded into app.json's
 * extra.buildNumber by .github/workflows/build-apk.yml at CI build time)
 * against GitHub's latest release tag ("build-N"). A dev/Expo Go run has no
 * baked-in number, so it reads as 'unknown' rather than falsely "up to
 * date" — build numbers only mean anything for the installed APK.
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const currentBuild = Number(Constants.expoConfig?.extra?.buildNumber ?? 0);
  if (currentBuild === 0) {
    return { status: 'unknown', message: 'Build numbers only apply to the installed APK, not this dev session.' };
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (!res.ok) {
      return { status: 'unknown', message: 'Could not reach GitHub to check for updates.' };
    }
    const data = await res.json();
    const match = /^build-(\d+)$/.exec(data.tag_name ?? '');
    const latestBuild = match ? Number(match[1]) : 0;
    const asset = ((data.assets ?? []) as { name: string; browser_download_url: string }[]).find((a) =>
      a.name.endsWith('.apk')
    );

    if (!asset || latestBuild <= currentBuild) {
      return { status: 'up_to_date', currentBuild };
    }
    return {
      status: 'update_available',
      currentBuild,
      latestBuild,
      downloadUrl: asset.browser_download_url,
      releaseUrl: data.html_url,
    };
  } catch {
    return { status: 'unknown', message: 'Could not reach GitHub to check for updates.' };
  }
}
