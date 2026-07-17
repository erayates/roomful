import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_OWNER = 'erayates';
const DEFAULT_REPO = 'roomful';
const DEFAULT_DOCS_URL = 'https://docs.roomful.dev';
const DEFAULT_DEMO_URL = 'https://demo.roomful.dev';
const DEFAULT_DOCKER_REPOSITORY = 'erayatesdev/roomful';

function readArgs(argv) {
  const args = {
    demoUrl: DEFAULT_DEMO_URL,
    dockerRepository: DEFAULT_DOCKER_REPOSITORY,
    dockerTag: undefined,
    docsUrl: DEFAULT_DOCS_URL,
    githubOwner: DEFAULT_OWNER,
    githubRepo: DEFAULT_REPO,
    tag: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--demo-url') {
      args.demoUrl = argv[index + 1] ?? args.demoUrl;
      index += 1;
      continue;
    }
    if (arg === '--docker-repository') {
      args.dockerRepository = argv[index + 1] ?? args.dockerRepository;
      index += 1;
      continue;
    }
    if (arg === '--docker-tag') {
      args.dockerTag = argv[index + 1] ?? args.dockerTag;
      index += 1;
      continue;
    }
    if (arg === '--docs-url') {
      args.docsUrl = argv[index + 1] ?? args.docsUrl;
      index += 1;
      continue;
    }
    if (arg === '--github-owner') {
      args.githubOwner = argv[index + 1] ?? args.githubOwner;
      index += 1;
      continue;
    }
    if (arg === '--github-repo') {
      args.githubRepo = argv[index + 1] ?? args.githubRepo;
      index += 1;
      continue;
    }
    if (arg === '--tag') {
      args.tag = argv[index + 1] ?? args.tag;
      index += 1;
    }
  }

  return args;
}

function getPublicPackages() {
  return readdirSync('packages', { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join('packages', entry.name, 'package.json'))
    .filter((packageJsonPath) => existsSync(packageJsonPath))
    .map((packageJsonPath) => {
      const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      return {
        name: manifest.name,
        version: manifest.version,
        private: manifest.private === true,
      };
    })
    .filter((manifest) => manifest.name?.startsWith('@roomful/') && !manifest.private)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function releaseTagFromPackages(packages) {
  const core = packages.find((packageInfo) => packageInfo.name === '@roomful/core');
  if (!core) {
    throw new Error('Cannot infer release tag because @roomful/core was not found.');
  }
  return `v${core.version}`;
}

function dockerTagFromReleaseTag(tag) {
  return tag.startsWith('v') ? tag.slice(1) : tag;
}

async function checkUrl(label, url) {
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        'user-agent': 'roomful-public-release-verifier',
      },
      redirect: 'follow',
    });
    return {
      label,
      ok: response.ok,
      status: response.status,
      target: url,
    };
  } catch (error) {
    return {
      label,
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
      target: url,
    };
  }
}

async function checkNpmPackage(packageInfo) {
  const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(packageInfo.name)}`;
  try {
    const response = await fetch(registryUrl, {
      headers: {
        accept: 'application/json',
        'user-agent': 'roomful-public-release-verifier',
      },
    });
    if (!response.ok) {
      return {
        label: `npm ${packageInfo.name}@${packageInfo.version}`,
        ok: false,
        status: response.status,
        target: registryUrl,
      };
    }
    const body = await response.json();
    return {
      label: `npm ${packageInfo.name}@${packageInfo.version}`,
      ok: Boolean(body.versions?.[packageInfo.version]),
      status: response.status,
      target: registryUrl,
    };
  } catch (error) {
    return {
      label: `npm ${packageInfo.name}@${packageInfo.version}`,
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
      target: registryUrl,
    };
  }
}

async function checkGithubRelease(args, tag) {
  const url = `https://api.github.com/repos/${args.githubOwner}/${args.githubRepo}/releases/tags/${encodeURIComponent(tag)}`;
  return checkUrl(`GitHub Release ${tag}`, url);
}

async function checkDockerTag(args, dockerTag) {
  const [namespace, repository] = args.dockerRepository.split('/');
  const url = `https://hub.docker.com/v2/repositories/${namespace}/${repository}/tags/${encodeURIComponent(dockerTag)}`;
  return checkUrl(`Docker image ${args.dockerRepository}:${dockerTag}`, url);
}

function printResult(result) {
  const status = result.ok ? 'OK' : 'FAIL';
  const details = result.status === undefined ? (result.reason ?? '') : `HTTP ${result.status}`;
  console.log(`${status} ${result.label} ${details}`.trim());
  console.log(`    ${result.target}`);
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const packages = getPublicPackages();
  const tag = args.tag ?? releaseTagFromPackages(packages);
  const dockerTag = args.dockerTag ?? dockerTagFromReleaseTag(tag);

  const checks = [
    ...(await Promise.all(packages.map((packageInfo) => checkNpmPackage(packageInfo)))),
    await checkGithubRelease(args, tag),
    await checkDockerTag(args, dockerTag),
    await checkUrl('docs site', args.docsUrl),
    await checkUrl('demo site', args.demoUrl),
  ];

  for (const result of checks) {
    printResult(result);
  }

  const failed = checks.filter((result) => !result.ok);
  if (failed.length > 0) {
    console.error(`Public release verification failed: ${failed.length} check(s).`);
    process.exitCode = 1;
    return;
  }

  console.log('Public release verification passed.');
}

await main();
