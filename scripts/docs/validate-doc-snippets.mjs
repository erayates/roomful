import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const sourceRoot = path.join(repoRoot, 'docs', 'getting-started');
const snippetsRoot = path.join(repoRoot, '.tmp', 'docs-snippets');
const tscConfigPath = path.join(snippetsRoot, 'tsconfig.json');

await validateDocSnippets();

async function validateDocSnippets() {
  await fs.rm(snippetsRoot, { force: true, recursive: true });
  await fs.mkdir(snippetsRoot, { recursive: true });

  const markdownFiles = await listMarkdownFiles(sourceRoot);
  const writeOperations = [];

  for (const filePath of markdownFiles) {
    const relativePath = path.relative(sourceRoot, filePath);
    const markdown = await fs.readFile(filePath, 'utf8');
    const snippets = extractSnippets(markdown);

    snippets.forEach((snippet, index) => {
      const extension = snippet.language === 'tsx' ? 'tsx' : 'ts';
      const basename = relativePath.replaceAll(path.sep, '-').replace(/\.(md|mdx)$/u, '');
      const outputPath = path.join(snippetsRoot, `${basename}-${String(index + 1)}.${extension}`);
      const shim = createShim(snippet.code);
      writeOperations.push(fs.writeFile(outputPath, `${shim}${snippet.code.trim()}\n`, 'utf8'));
    });
  }

  await Promise.all(writeOperations);
  await fs.writeFile(
    tscConfigPath,
    JSON.stringify(
      {
        extends: toPosixPath(
          path.relative(snippetsRoot, path.join(repoRoot, 'tsconfig.base.json')),
        ),
        compilerOptions: {
          jsx: 'react-jsx',
          jsxImportSource: 'react',
          noEmit: true,
          noUnusedLocals: false,
          noUnusedParameters: false,
          rootDir: '.',
        },
        include: ['./*.ts', './*.tsx'],
      },
      null,
      2,
    ),
    'utf8',
  );

  await runCommand('pnpm', ['exec', 'tsc', '--noEmit', '-p', tscConfigPath], repoRoot);
}

function createShim(code) {
  const lines = ['export {};'];

  if (/\bcreateRoom\b/u.test(code) && !/from '@flockjs\/core'/u.test(code)) {
    lines.push("import { createRoom } from '@flockjs/core';");
  }

  if (/\broom\b/u.test(code) && !/\b(?:const|let|var)\s+room\b/u.test(code)) {
    if (!lines.some((line) => line.includes('createRoom'))) {
      lines.push("import { createRoom } from '@flockjs/core';");
    }
    lines.push('declare const room: ReturnType<typeof createRoom>;');
  }

  if (/\bunsubscribe\b/u.test(code) && !/\b(?:const|let|var)\s+unsubscribe\b/u.test(code)) {
    lines.push('declare const unsubscribe: () => void;');
  }

  if (
    /\bgetRelayToken\b/u.test(code) &&
    !/\b(?:const|let|var|function)\s+getRelayToken\b/u.test(code)
  ) {
    lines.push('declare function getRelayToken(): Promise<string>;');
  }

  return `${lines.join('\n')}\n`;
}

function extractSnippets(markdown) {
  const snippets = [];
  const pattern = /```(ts|tsx)\n([\s\S]*?)```/gu;

  for (const match of markdown.matchAll(pattern)) {
    const language = match[1];
    const code = match[2];
    if (!language || !code) {
      continue;
    }

    snippets.push({ code, language });
  }

  return snippets;
}

async function listMarkdownFiles(directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && /\.(md|mdx)$/u.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function runCommand(command, args, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === 'win32',
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(new Error(`${command} exited with code ${String(code)}.`));
    });
  });
}

function toPosixPath(value) {
  return value.split(path.sep).join(path.posix.sep);
}
