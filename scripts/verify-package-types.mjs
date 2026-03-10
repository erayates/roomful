import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

for (const packageDir of publicPackages) {
  verifyPackageTypes(packageDir);
}

function verifyPackageTypes(packageDir) {
  const absolutePackageDir = path.join(workspaceRoot, packageDir);
  const packageJsonPath = path.join(absolutePackageDir, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const exportTypes = packageJson.exports?.['.']?.types;

  if (packageJson.types !== 'dist/index.d.ts') {
    throw new Error(
      `${packageJson.name} must set "types" to "dist/index.d.ts" (received ${JSON.stringify(packageJson.types)}).`,
    );
  }

  if (exportTypes !== './dist/index.d.ts') {
    throw new Error(
      `${packageJson.name} must set exports["."].types to "./dist/index.d.ts" (received ${JSON.stringify(exportTypes)}).`,
    );
  }

  const packReport = JSON.parse(runNpmPack(absolutePackageDir));
  const packedFiles = packReport[0]?.files ?? [];
  const hasDeclarationBundle = packedFiles.some((file) => file.path === 'dist/index.d.ts');

  if (!hasDeclarationBundle) {
    throw new Error(`${packageJson.name} package tarball is missing dist/index.d.ts.`);
  }

  process.stdout.write(`${packageJson.name}: dist/index.d.ts verified\n`);
}

function runNpmPack(cwd) {
  if (process.platform === 'win32') {
    return execFileSync(
      process.env.ComSpec ?? 'cmd.exe',
      ['/d', '/s', '/c', 'npm pack --json --dry-run'],
      {
        cwd,
        encoding: 'utf8',
      },
    );
  }

  return execFileSync('npm', ['pack', '--json', '--dry-run'], {
    cwd,
    encoding: 'utf8',
  });
}
