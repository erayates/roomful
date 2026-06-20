import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const publicPackages = [
  'packages/core',
  'packages/react',
  'packages/vue',
  'packages/svelte',
  'packages/cursors',
  'packages/devtools',
  'packages/relay',
];

const disallowedPackPatterns = [
  /^\.turbo\//,
  /^coverage\//,
  /^integration\//,
  /^src\//,
  /^stories\//,
  /^test-d\//,
  /^\.storybook\//,
  /\.bench\.[cm]?[jt]sx?(\.map)?$/,
  /\.integration\.helper\.[cm]?[jt]sx?(\.map)?$/,
  /\.test\.[cm]?[jt]sx?$/,
  /^tsconfig(\.[^.]+)?\.json$/,
];

for (const packageDir of publicPackages) {
  verifyPackageTypes(packageDir);
}

function verifyPackageTypes(packageDir) {
  const absolutePackageDir = path.join(workspaceRoot, packageDir);
  const packageJsonPath = path.join(absolutePackageDir, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const packedFiles = readPackedFiles(absolutePackageDir);
  const packedPaths = new Set(
    packedFiles.map((file) => {
      return file.path;
    }),
  );

  assertPackedPathExists(
    packageJson.name,
    packedPaths,
    normalizePackPath(packageJson.types),
    'types',
  );

  const exportTypes = packageJson.exports?.['.']?.types;
  if (typeof exportTypes !== 'string') {
    throw new Error(`${packageJson.name} must define exports["."].types.`);
  }

  assertPackedPathExists(
    packageJson.name,
    packedPaths,
    normalizePackPath(exportTypes),
    'exports["."].types',
  );

  if (typeof packageJson.main === 'string') {
    assertPackedPathExists(
      packageJson.name,
      packedPaths,
      normalizePackPath(packageJson.main),
      'main',
    );
  }

  const exportImport = packageJson.exports?.['.']?.import;
  if (typeof exportImport === 'string') {
    assertPackedPathExists(
      packageJson.name,
      packedPaths,
      normalizePackPath(exportImport),
      'exports["."].import',
    );
  }

  const disallowedFiles = packedFiles
    .map((file) => {
      return file.path;
    })
    .filter((filePath) => {
      return disallowedPackPatterns.some((pattern) => {
        return pattern.test(filePath);
      });
    });

  if (disallowedFiles.length > 0) {
    throw new Error(
      `${packageJson.name} tarball contains unexpected files: ${disallowedFiles.join(', ')}.`,
    );
  }

  process.stdout.write(`${packageJson.name}: tarball entrypoints verified\n`);
}

function assertPackedPathExists(packageName, packedPaths, expectedPath, fieldName) {
  if (expectedPath === null) {
    throw new Error(`${packageName} must declare ${fieldName}.`);
  }

  if (!packedPaths.has(expectedPath)) {
    throw new Error(`${packageName} package tarball is missing ${expectedPath} for ${fieldName}.`);
  }
}

function normalizePackPath(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return null;
  }

  return filePath.startsWith('./') ? filePath.slice(2) : filePath;
}

function readPackedFiles(packageDir) {
  const tempRoot = path.join(packageDir, '.pack-verifier');
  mkdirSync(tempRoot, { recursive: true });
  const tempDir = mkdtempSync(path.join(tempRoot, 'run-'));

  try {
    const report = runPnpmPack(packageDir, tempDir);
    const normalizedReport = Array.isArray(report) ? report[0] : report;

    if (!normalizedReport || !Array.isArray(normalizedReport.files)) {
      throw new Error(`Unable to read pnpm pack report for ${packageDir}.`);
    }

    return normalizedReport.files;
  } finally {
    rmSync(tempRoot, { force: true, recursive: true });
  }
}

function runPnpmPack(cwd, packDestination) {
  const output = execFileSync(
    process.platform === 'win32' ? process.execPath : 'pnpm',
    [
      ...(process.platform === 'win32' ? [resolvePnpmCli()] : []),
      'pack',
      '--json',
      '--pack-destination',
      packDestination,
    ],
    {
      cwd,
      encoding: 'utf8',
    },
  );

  return JSON.parse(output);
}

function resolvePnpmCli() {
  if (process.platform !== 'win32') {
    throw new Error('resolvePnpmCli() should only be used on Windows.');
  }

  const bundledCliPath = path.join(
    path.dirname(process.execPath),
    'node_modules',
    'pnpm',
    'bin',
    'pnpm.cjs',
  );
  if (existsSync(bundledCliPath)) {
    return bundledCliPath;
  }

  const pathEntries = (process.env.Path ?? process.env.PATH ?? '').split(';');
  for (const pathEntry of pathEntries) {
    if (pathEntry.length === 0) {
      continue;
    }

    const globalCliPath = path.join(pathEntry, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
    if (existsSync(globalCliPath)) {
      return globalCliPath;
    }
  }

  throw new Error('Unable to locate the pnpm CLI entrypoint.');
}
