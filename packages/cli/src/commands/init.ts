import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { RoomfulCliRuntime } from '../cli.js';

const INIT_HELP = `Usage: roomful init [dir]

Scaffold a new Roomful project with:
  - package.json
  - tsconfig.json
  - src/index.ts (basic room example)

Options:
  --name <name>   Package name (default: directory name)
  --help, -h      Show this help message
`;

interface InitOptions {
  name: string | undefined;
}

function parseInitArgs(args: string[]): { dir: string; options: InitOptions } | { error: string } {
  let dir = '.';
  const options: InitOptions = { name: undefined };
  let i = 0;

  while (i < args.length) {
    const arg = args[i] ?? '';
    if (arg === '--help' || arg === '-h') {
      return { dir: '.', options: { name: undefined } };
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

  const dir = parsed.dir;
  const isCurrentDir = dir === '.';
  const dirName = isCurrentDir
    ? 'roomful-project'
    : dir.split(/[/\\]/).pop() ?? 'roomful-project';
  const packageName = parsed.options.name ?? dirName;

  try {
    mkdirSync(dir, { recursive: true });

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
