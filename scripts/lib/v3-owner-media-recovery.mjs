/** Owner-authorized, manual-only legacy public media recovery.
 * Proof comes from GitHub's authenticated API, never from a self-reported login.
 * No network calls occur from the pure authorization checks or CI tests.
 */
export const OWNER_REPOSITORY = 'solarissongcontest/solarisstudio';
export const OWNER_LOGIN = 'solarissongcontest';
export const OWNER_METHOD = 'verified-github-repository-owner';

export async function verifyRepositoryOwner(githubToken, fetcher = fetch) {
  if (!githubToken || typeof githubToken !== 'string') {
    throw Error('A protected GitHub owner token is required');
  }
  const headers = {
    Authorization: 'Bearer ' + githubToken,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'solaris-v3-manual-media-recovery',
  };
  const load = async url => {
    const response = await fetcher(url, {headers, signal: AbortSignal.timeout(10000)});
    if (!response?.ok) throw Error('GitHub owner authentication unavailable');
    return response.json();
  };
  const user = await load('https://api.github.com/user');
  const repo = await load('https://api.github.com/repos/' + OWNER_REPOSITORY);
  if (user?.login !== OWNER_LOGIN || repo?.full_name !== OWNER_REPOSITORY ||
      repo?.owner?.login !== OWNER_LOGIN || repo?.permissions?.admin !== true) {
    throw Error('Authenticated GitHub identity is not the Solaris repository owner');
  }
  return {
    github_login: user.login,
    repository: repo.full_name,
    repository_admin: true,
    verified_at: new Date().toISOString(),
  };
}

export function assertOwnerAuthorization(approval, ownerProof, now = new Date()) {
  const auth = approval?.owner_authorization;
  if (!auth) return false;
  if (auth.method !== OWNER_METHOD || auth.github_login !== OWNER_LOGIN ||
      auth.repository !== OWNER_REPOSITORY || auth.decision !== 'APPROVE_VERIFIED_LEGACY_PUBLIC_IMAGES_ONLY' ||
      approval.operator !== OWNER_LOGIN || !ownerProof ||
      ownerProof.github_login !== OWNER_LOGIN || ownerProof.repository !== OWNER_REPOSITORY ||
      ownerProof.repository_admin !== true) {
    throw Error('Verified Solaris owner authorization missing');
  }
  const approved = Date.parse(auth.approved_at || '');
  const verified = Date.parse(ownerProof.verified_at || '');
  const t = now.getTime();
  if (!Number.isFinite(approved) || approved > t + 60000 || t - approved > 24*60*60*1000 ||
      !Number.isFinite(verified) || verified > t + 60000 || t - verified > 10*60*1000) {
    throw Error('Solaris owner approval or identity verification expired');
  }
  return true;
}
