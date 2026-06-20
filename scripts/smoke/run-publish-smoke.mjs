import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, '..', '..');
const smokeRoot = path.join(workspaceRoot, '.smoke');
const tarballRoot = path.join(smokeRoot, 'tarballs');
const workdirRoot = path.join(smokeRoot, 'workdirs');
const templateRoot = path.join(workspaceRoot, 'smoke', 'templates');

const publicPackages = [
  { name: '@roomful/core', dir: 'packages/core' },
  { name: '@roomful/react', dir: 'packages/react' },
  { name: '@roomful/vue', dir: 'packages/vue' },
  { name: '@roomful/svelte', dir: 'packages/svelte' },
  { name: '@roomful/cursors', dir: 'packages/cursors' },
  { name: '@roomful/devtools', dir: 'packages/devtools' },
  { name: '@roomful/relay', dir: 'packages/relay' },
];

const smokeProjects = [
  { name: 'core-vanilla', templateDir: 'core-vanilla' },
  { name: 'react-app', templateDir: 'react-app' },
  { name: 'vue-app', templateDir: 'vue-app' },
  { name: 'svelte-app', templateDir: 'svelte-app' },
  { name: 'cursors-react', templateDir: 'cursors-react' },
  { name: 'devtools-import', templateDir: 'devtools-import' },
];

const selectedNames = process.argv.slice(2);
const selectedProjects =
  selectedNames.length === 0
    ? smokeProjects
    : smokeProjects.filter((project) => {
        return selectedNames.includes(project.name);
      });

if (selectedProjects.length === 0) {
  throw new Error(
    `No smoke projects matched. Known projects: ${smokeProjects.map((project) => project.name).join(', ')}`,
  );
}

const unknownSelections = selectedNames.filter((name) => {
  return !smokeProjects.some((project) => project.name === name);
});

if (unknownSelections.length > 0) {
  throw new Error(`Unknown smoke projects: ${unknownSelections.join(', ')}`);
}

rmSync(smokeRoot, { force: true, recursive: true });
mkdirSync(tarballRoot, { recursive: true });
mkdirSync(workdirRoot, { recursive: true });

process.stdout.write(`Packing ${publicPackages.length} public packages...\n`);
const tarballMap = new Map(
  publicPackages.map((packageDefinition) => {
    return [packageDefinition.name, packPublicPackage(packageDefinition)];
  }),
);

for (const project of selectedProjects) {
  runSmokeProject(project, tarballMap);
}

process.stdout.write(
  `Publish smoke passed for: ${selectedProjects.map((project) => project.name).join(', ')}\n`,
);

function packPublicPackage(packageDefinition) {
  const cwd = path.join(workspaceRoot, packageDefinition.dir);
  const localPackRoot = path.join(cwd, '.smoke', 'pack');
  process.stdout.write(`- packing ${packageDefinition.name}\n`);
  rmSync(localPackRoot, { force: true, recursive: true });
  mkdirSync(localPackRoot, { recursive: true });

  try {
    const report = runCommand('pnpm', ['pack', '--json', '--pack-destination', localPackRoot], {
      captureOutput: true,
      cwd,
    });
    const parsedReport = JSON.parse(report);
    const normalizedReport = Array.isArray(parsedReport) ? parsedReport[0] : parsedReport;

    if (!normalizedReport || typeof normalizedReport.filename !== 'string') {
      throw new Error(`Unable to read tarball filename for ${packageDefinition.name}.`);
    }

    const tarballPath = path.join(tarballRoot, path.basename(normalizedReport.filename));
    cpSync(normalizedReport.filename, tarballPath);

    return tarballPath;
  } finally {
    rmSync(localPackRoot, { force: true, recursive: true });
  }
}

function runSmokeProject(project, tarballMap) {
  const templateDir = path.join(templateRoot, project.templateDir);
  const workdir = path.join(workdirRoot, project.name);

  process.stdout.write(`\nRunning smoke project ${project.name}...\n`);
  cpSync(templateDir, workdir, { recursive: true });

  const templatePackagePath = path.join(workdir, 'package.template.json');
  const packageJson = JSON.parse(readFileSync(templatePackagePath, 'utf8'));
  rewriteDependencyGroup(packageJson.dependencies, tarballMap, workdir);
  rewriteDependencyGroup(packageJson.devDependencies, tarballMap, workdir);
  writeFileSync(path.join(workdir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
  rmSync(templatePackagePath);

  runCommand('npm', ['install', '--no-audit', '--no-fund'], { cwd: workdir });
  runCommand('npm', ['run', 'validate'], { cwd: workdir });
}

function rewriteDependencyGroup(group, tarballMap, workdir) {
  if (!group || typeof group !== 'object') {
    return;
  }

  for (const dependencyName of Object.keys(group)) {
    const tarballPath = tarballMap.get(dependencyName);
    if (!tarballPath) {
      continue;
    }

    group[dependencyName] = `file:${toPosixPath(path.relative(workdir, tarballPath))}`;
  }
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function runCommand(command, args, options) {
  const invocation = resolveCommandInvocation(command);
  const execOptions = {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: options.captureOutput === true ? 'pipe' : 'inherit',
  };

  return execFileSync(invocation.executable, [...invocation.args, ...args], execOptions);
}

function resolveCommandInvocation(command) {
  if (process.platform !== 'win32') {
    return {
      args: [],
      executable: command,
    };
  }

  if (command === 'npm') {
    return {
      args: [resolvePackageManagerCli('npm', 'npm-cli.js')],
      executable: process.execPath,
    };
  }

  if (command === 'pnpm') {
    return {
      args: [resolvePackageManagerCli('pnpm', 'pnpm.cjs')],
      executable: process.execPath,
    };
  }

  return {
    args: [],
    executable: command,
  };
}

function resolvePackageManagerCli(packageName, cliFilename) {
  const bundledCliPath = path.join(
    path.dirname(process.execPath),
    'node_modules',
    packageName,
    'bin',
    cliFilename,
  );
  if (existsSync(bundledCliPath)) {
    return bundledCliPath;
  }

  const pathEntries = (process.env.Path ?? process.env.PATH ?? '').split(';');
  for (const pathEntry of pathEntries) {
    if (pathEntry.length === 0) {
      continue;
    }

    const globalCliPath = path.join(pathEntry, 'node_modules', packageName, 'bin', cliFilename);
    if (existsSync(globalCliPath)) {
      return globalCliPath;
    }
  }

  throw new Error(`Unable to locate the ${packageName} CLI entrypoint.`);
}
