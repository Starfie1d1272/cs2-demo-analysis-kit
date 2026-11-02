import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Capture once, before generated build output can change the working tree. */
export function readBuildInfo(root, { versionSync = 'skipped', releaseTag = '', candidateTag = '' } = {}) {
  const releaseVersion = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(releaseVersion)) {
    throw new Error('Desktop release version must be canonical x.y.z');
  }
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  let buildRevision = null;
  let buildDirty = null;
  try {
    // A source archive nested in an unrelated repository is not this repository.
    if (resolve(git('rev-parse', '--show-toplevel')) === resolve(root)) {
      buildRevision = git('rev-parse', 'HEAD');
      buildDirty = git('status', '--porcelain', '--untracked-files=normal') !== '';
    }
  } catch { /* Archives without Git retain explicit unknown provenance. */ }
  if (releaseTag && candidateTag) throw new Error('Release and candidate tags are mutually exclusive');
  if (releaseTag) {
    if (releaseTag !== `v${releaseVersion}` || !buildRevision || buildDirty !== false ||
        git('rev-parse', `refs/tags/${releaseTag}^{commit}`) !== buildRevision) {
      throw new Error('Release package requires matching vX.Y.Z tag, manifest and clean Git checkout');
    }
  }
  if (candidateTag) {
    if (!new RegExp(`^v${releaseVersion.replaceAll('.', '\\.')}\\-rc\\.[1-9]\\d*$`).test(candidateTag) ||
        !buildRevision || buildDirty !== false ||
        git('rev-parse', `refs/tags/${candidateTag}^{commit}`) !== buildRevision) {
      throw new Error('Candidate package requires matching vX.Y.Z-rc.N tag, manifest and clean Git checkout');
    }
  }
  const packageMode = releaseTag ? 'release' : candidateTag ? 'candidate' : 'ad-hoc';
  const artifactId = packageMode === 'release' ? releaseVersion :
    packageMode === 'candidate' ? candidateTag.slice(1) :
    `${releaseVersion}-build-${buildRevision?.slice(0, 12) ?? 'unknown'}${buildDirty === true ? '-dirty' : ''}`;
  return { releaseVersion, buildRevision, buildDirty, versionSync, packageMode, artifactId, ...(candidateTag ? { candidateTag } : {}) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(readBuildInfo(process.cwd(), {
      versionSync: process.env.PACKAGE_SKIP_VERSION_SYNC === '1' ? 'skipped' : 'enabled',
      releaseTag: process.env.PACKAGE_RELEASE_TAG ?? '',
      candidateTag: process.env.PACKAGE_CANDIDATE_TAG ?? '',
    })));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
