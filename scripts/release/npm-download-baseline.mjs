import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_RANGE = 'last-week';
const DEFAULT_OUTPUT_DIR = 'docs/project/release-artifacts';

function readArgs(argv) {
  const args = {
    allowUnpublished: false,
    outputDir: DEFAULT_OUTPUT_DIR,
    range: DEFAULT_RANGE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--allow-unpublished') {
      args.allowUnpublished = true;
      continue;
    }
    if (arg === '--output-dir') {
      args.outputDir = argv[index + 1] ?? args.outputDir;
      index += 1;
      continue;
    }
    if (arg === '--range') {
      args.range = argv[index + 1] ?? args.range;
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
    .filter((manifest) => manifest.name?.startsWith('@flockjs/') && !manifest.private)
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function fetchDownloadPoint(packageName, range) {
  const encodedPackageName = packageName.replace('/', '%2F');
  const url = `https://api.npmjs.org/downloads/point/${range}/${encodedPackageName}`;
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'flockjs-release-baseline',
    },
  });

  if (!response.ok) {
    return {
      downloads: null,
      ok: false,
      status: response.status,
      statusText: response.statusText,
      url,
    };
  }

  const body = await response.json();
  return {
    downloads: Number(body.downloads ?? 0),
    end: body.end,
    ok: true,
    package: body.package,
    start: body.start,
    url,
  };
}

function renderMarkdown(report) {
  const lines = [
    `# npm Downloads Baseline`,
    '',
    `Generated: ${report.generatedAt}`,
    `Range: ${report.range}`,
    `Total downloads: ${report.totalDownloads}`,
    '',
    '| Package | Version | Downloads | Window | Status |',
    '| --- | ---: | ---: | --- | --- |',
  ];

  for (const item of report.packages) {
    const window = item.start && item.end ? `${item.start} to ${item.end}` : 'unavailable';
    const downloads = item.downloads === null ? 'n/a' : String(item.downloads);
    const status = item.ok ? 'ok' : `failed (${item.status ?? 'unknown'})`;
    lines.push(`| \`${item.name}\` | \`${item.version}\` | ${downloads} | ${window} | ${status} |`);
  }

  lines.push('');
  lines.push('Use this file as the launch baseline before comparing post-launch weekly downloads.');
  lines.push('');

  return `${lines.join('\n')}`;
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const packages = getPublicPackages();
  const generatedAt = new Date().toISOString();

  const results = [];
  for (const packageInfo of packages) {
    const result = await fetchDownloadPoint(packageInfo.name, args.range);
    results.push({ ...packageInfo, ...result });
  }

  const report = {
    generatedAt,
    range: args.range,
    totalDownloads: results.reduce(
      (sum, item) => sum + (typeof item.downloads === 'number' ? item.downloads : 0),
      0,
    ),
    packages: results,
  };

  await mkdir(args.outputDir, { recursive: true });
  const stamp = generatedAt.slice(0, 10);
  const jsonPath = join(args.outputDir, `npm-download-baseline-${stamp}.json`);
  const markdownPath = join(args.outputDir, `npm-download-baseline-${stamp}.md`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, renderMarkdown(report));

  const failed = results.filter((item) => !item.ok);
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${markdownPath}`);
  console.log(`Total downloads (${args.range}): ${report.totalDownloads}`);

  if (failed.length > 0 && !args.allowUnpublished) {
    console.error(
      `Failed to read npm download data for: ${failed.map((item) => item.name).join(', ')}`,
    );
    process.exitCode = 1;
  }
}

await main();
