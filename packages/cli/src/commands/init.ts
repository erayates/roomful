import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { RoomfulCliRuntime } from '../cli.js';

const INIT_HELP = `Usage: roomful init [dir] [options]

Scaffold a new Roomful project with:
  - package.json
  - tsconfig.json
  - src/index.ts (basic room example)

Options:
  --name <name>       Package name (default: directory name)
  --template <name>   Starter template (react-app, vue-app, svelte-app, solid-app,
                      angular-app, core-vanilla, cursors-react, next-auth)
  --list-templates    List available templates
  --help, -h          Show this help message
`;

const TEMPLATES_DIR = new URL('../../../smoke/templates/', import.meta.url);

const AVAILABLE_TEMPLATES = [
  'angular-app',
  'core-vanilla',
  'cursors-react',
  'next-auth',
  'react-app',
  'solid-app',
  'svelte-app',
  'vue-app',
];

interface InitOptions {
  name: string | undefined;
  template: string | undefined;
}

function parseInitArgs(args: string[]): { dir: string; options: InitOptions } | { error: string } {
  let dir = '.';
  const options: InitOptions = { name: undefined, template: undefined };
  let i = 0;

  while (i < args.length) {
    const arg = args[i] ?? '';
    if (arg === '--help' || arg === '-h') {
      return { dir: '.', options: { name: undefined, template: undefined } };
    }
    if (arg === '--list-templates') {
      return { dir: '.', options: { name: undefined, template: '__list__' } };
    }
    if (arg === '--template' && i + 1 < args.length) {
      options.template = args[i + 1];
      i += 2;
      continue;
    }
    if (arg.startsWith('--template=')) {
      options.template = arg.slice('--template='.length);
      i += 1;
      continue;
    }
    if (arg === '--name' && i + 1 < args.length) {
      options.name = args[i + 1];
      i += 2;
      continue;
    }
    if (arg.startsWith('--name=')) {
      options.name = arg.slice('--name='.length);
      i += 1;
      continue;
    }
    if (!arg.startsWith('-')) {
      dir = arg;
      i += 1;
      continue;
    }
    return { error: `Unknown option: ${arg}` };
  }

  return { dir, options };
}

function scaffoldPackageJson(targetDir: string, name: string): void {
  const pkg = {
    name,
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'tsc && vite build',
      preview: 'vite preview',
    },
    dependencies: {
      '@roomful/core': '^2.0.0',
    },
    devDependencies: {
      typescript: '^5.0.0',
      vite: '^5.0.0',
    },
  };

  writeFileSync(join(targetDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
}

function scaffoldTsconfig(targetDir: string): void {
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      outDir: 'dist',
      rootDir: 'src',
    },
    include: ['src'],
  };

  writeFileSync(join(targetDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2) + '\n');
}

function scaffoldIndexHtml(targetDir: string, name: string): void {
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/index.ts"></script>
  </body>
</html>
`;

  writeFileSync(join(targetDir, 'index.html'), html);
}

function scaffoldSrcIndex(targetDir: string): void {
  const srcDir = join(targetDir, 'src');
  mkdirSync(srcDir, { recursive: true });

  const indexTs = `import { createRoom } from '@roomful/core';

const room = createRoom('my-first-room', {
  presence: { name: 'User', color: '#4F46E5' },
});

await room.connect();

const presence = room.usePresence();
presence.subscribe((peers) => {
  console.log('Peers in room:', peers.length);
});

console.log('Roomful connected as', room.peerId);

window.addEventListener('beforeunload', () => {
  void room.disconnect();
});
`;

  writeFileSync(join(srcDir, 'index.ts'), indexTs);
}

function scaffoldFromTemplate(
  targetDir: string,
  templateName: string,
  packageName: string,
): boolean {
  const templateDir = new URL(templateName + '/', TEMPLATES_DIR);

  try {
    const dir = new URL('.', templateDir).pathname;
    readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }

  // Copy package.template.json → package.json
  const pkgSrc = new URL('package.template.json', templateDir);
  try {
    const raw = readFileSync(pkgSrc, 'utf8');
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    parsed.name = packageName;
    writeFileSync(join(targetDir, 'package.json'), JSON.stringify(parsed, null, 2) + '\n');
  } catch {
    return false;
  }

  // Copy known config files
  for (const file of ['tsconfig.json', 'vite.config.ts', 'svelte.config.js', 'index.html']) {
    try {
      const src = new URL(file, templateDir);
      const content = readFileSync(src, 'utf8');
      writeFileSync(join(targetDir, file), content);
    } catch {
      // optional file, skip
    }
  }

  // Copy src/ directory recursively
  const srcDir = join(targetDir, 'src');
  mkdirSync(srcDir, { recursive: true });

  const templateSrc = new URL('src/', templateDir);
  try {
    const srcFiles = readdirSync(templateSrc);
    for (const file of srcFiles) {
      const content = readFileSync(new URL(file, templateSrc), 'utf8');
      writeFileSync(join(srcDir, file), content);
    }
  } catch {
    // no src directory
  }

  return true;
}

export function runInit(args: string[], runtime: RoomfulCliRuntime): number {
  if (args.includes('--help') || args.includes('-h')) {
    runtime.stdout.write(INIT_HELP);
    return 0;
  }

  const parsed = parseInitArgs(args);

  if ('error' in parsed) {
    runtime.stderr.write(`${parsed.error}\n`);
    return 1;
  }

  // Handle --list-templates
  if (parsed.options.template === '__list__') {
    runtime.stdout.write('Available templates:\n');
    for (const tpl of AVAILABLE_TEMPLATES) {
      runtime.stdout.write(`  ${tpl}\n`);
    }
    return 0;
  }

  const dir = parsed.dir;
  const isCurrentDir = dir === '.';
  const dirName = isCurrentDir
    ? 'roomful-project'
    : (dir.split(/[/\\]/).pop() ?? 'roomful-project');
  const packageName = parsed.options.name ?? dirName;

  try {
    mkdirSync(dir, { recursive: true });

    // If a template is specified, scaffold from it
    if (parsed.options.template) {
      if (!AVAILABLE_TEMPLATES.includes(parsed.options.template)) {
        runtime.stderr.write(
          `Unknown template "${parsed.options.template}". Use --list-templates to see available options.\n`,
        );
        return 1;
      }

      const ok = scaffoldFromTemplate(dir, parsed.options.template, packageName);
      if (!ok) {
        runtime.stderr.write(`Failed to scaffold template "${parsed.options.template}".\n`);
        return 1;
      }

      runtime.stdout.write(
        `Roomful project scaffolded from "${parsed.options.template}" in ${dir}\n\n` +
          `Next steps:\n` +
          `  cd ${dir}\n` +
          `  npm install\n` +
          `  npm run dev\n`,
      );
      return 0;
    }

    // Default: scaffold minimal project
    scaffoldPackageJson(dir, packageName);
    scaffoldTsconfig(dir);
    scaffoldIndexHtml(dir, packageName);
    scaffoldSrcIndex(dir);

    runtime.stdout.write(
      `Roomful project scaffolded in ${dir}\n\n` +
        `Next steps:\n` +
        `  cd ${dir}\n` +
        `  npm install\n` +
        `  npm run dev\n`,
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    runtime.stderr.write(`Failed to scaffold project: ${message}\n`);
    return 1;
  }
}
