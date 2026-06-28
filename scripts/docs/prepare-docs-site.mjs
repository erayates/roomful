import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const docsSourceRoot = path.join(repoRoot, 'docs');
const docsAppRoot = path.join(repoRoot, 'apps', 'docs');
const docsContentRoot = path.join(docsAppRoot, 'src', 'content', 'docs');
const templatesRoot = path.join(docsAppRoot, 'templates');
const githubRepositoryUrl = 'https://github.com/erayates/roomful';
const archivedVersionSlug = 'v1-0';

const narrativeOrder = {
  'getting-started/installation': 1,
  'getting-started/quickstart': 2,
  'getting-started/rooms-and-transports': 3,
  'reference/index': 1,
  'reference/core-api': 2,
  'reference/engines-presence': 3,
  'reference/engines-cursors': 4,
  'reference/engines-state-awareness-events': 5,
  'reference/adapters-react': 6,
  'reference/adapters-vue': 7,
  'reference/adapters-svelte': 8,
  'reference/advanced': 9,
  'reference/ui-components': 10,
  'reference/devtools-debugging': 11,
  'reference/performance': 12,
  'reference/types': 13,
  'recipes/collaborative-editor': 1,
  'recipes/multiplayer-canvas': 2,
  'recipes/live-voting': 3,
  'recipes/presence-aware-navigation': 4,
  'project/repository-structure': 1,
  'project/development-setup': 2,
  'project/code-conventions': 3,
  'project/roomful-code-quality-guidelines': 4,
  'project/webrtc-validation': 5,
  'project/release-process': 6,
  'project/labeling-and-triage': 7,
  'project/execution-plan': 8,
  'project/style-guide': 9,
};

const apiPackages = [
  {
    slug: 'core',
    packageName: '@roomful/core',
    entryPoint: 'packages/core/src/index.ts',
    order: 2,
    tsconfig: 'packages/core/tsconfig.json',
  },
  {
    slug: 'react',
    packageName: '@roomful/react',
    entryPoint: 'packages/react/src/index.ts',
    order: 3,
    tsconfig: 'packages/react/tsconfig.json',
  },
  {
    slug: 'vue',
    packageName: '@roomful/vue',
    entryPoint: 'packages/vue/src/index.ts',
    order: 4,
    tsconfig: 'packages/vue/tsconfig.json',
  },
  {
    slug: 'svelte',
    packageName: '@roomful/svelte',
    entryPoint: 'packages/svelte/src/index.ts',
    order: 5,
    tsconfig: 'packages/svelte/tsconfig.json',
  },
  {
    slug: 'cursors',
    packageName: '@roomful/cursors',
    entryPoint: 'packages/cursors/src/index.ts',
    order: 6,
    tsconfig: 'packages/cursors/tsconfig.json',
  },
  {
    slug: 'relay',
    packageName: '@roomful/relay',
    entryPoint: 'packages/relay/src/index.ts',
    order: 7,
    tsconfig: 'packages/relay/tsconfig.json',
  },
  {
    slug: 'devtools',
    packageName: '@roomful/devtools',
    entryPoint: 'packages/devtools/src/index.ts',
    order: 8,
    tsconfig: 'packages/devtools/tsconfig.json',
  },
];

await prepareDocsSite();

async function prepareDocsSite() {
  await fs.mkdir(docsContentRoot, { recursive: true });
  await clearCurrentDocs();
  await writeTemplate('index.mdx', 'index.mdx');
  await writeTemplate('community.mdx', path.posix.join('community', 'index.mdx'));
  await writeTemplate('playground.mdx', path.posix.join('playground', 'index.mdx'));
  await writeTemplate('api-index.mdx', path.posix.join('api', 'index.mdx'));
  await generateNarrativeDocs();
  await generateApiDocs();
  await generateVersionedSnapshot(archivedVersionSlug);
}

async function clearCurrentDocs() {
  const entries = await fs.readdir(docsContentRoot, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    await fs.rm(path.join(docsContentRoot, entry.name), { force: true, recursive: true });
  }
}

async function writeTemplate(templateName, outputRelativePath) {
  const content = await fs.readFile(path.join(templatesRoot, templateName), 'utf8');
  const outputPath = path.join(docsContentRoot, outputRelativePath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${content.trim()}\n`, 'utf8');
}

async function generateNarrativeDocs() {
  const markdownFiles = await listMarkdownFiles(docsSourceRoot);

  for (const sourcePath of markdownFiles) {
    const relativeSourcePath = toPosixPath(path.relative(docsSourceRoot, sourcePath));

    if (relativeSourcePath === 'README.md') {
      continue;
    }

    const targetRelativePath = mapDocsSourceToTarget(relativeSourcePath);
    const source = await fs.readFile(sourcePath, 'utf8');
    const fallbackTitle = createFallbackTitle(relativeSourcePath);
    const { body, title } = extractHeadingAndDescription(source, fallbackTitle);
    const rewrittenBody = normalizeMdxFriendlyMarkdown(
      rewriteMarkdownLinks(body, relativeSourcePath, targetRelativePath),
    );
    const frontmatter = createFrontmatter({
      title,
      description: extractDescription(rewrittenBody),
      order: narrativeOrder[stripMarkdownExtension(targetRelativePath)],
      editUrl: `${githubRepositoryUrl}/edit/main/docs/${relativeSourcePath}`,
    });

    const outputPath = path.join(docsContentRoot, targetRelativePath);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${frontmatter}${rewrittenBody.trim()}\n`, 'utf8');
  }
}

async function generateApiDocs() {
  for (const pkg of apiPackages) {
    const outputDir = path.join(docsContentRoot, 'api', pkg.slug);
    await fs.rm(outputDir, { force: true, recursive: true });
    await fs.mkdir(outputDir, { recursive: true });

    await runTypeDoc(pkg.entryPoint, outputDir, pkg.tsconfig);

    const files = await listMarkdownFiles(outputDir);
    for (const filePath of files) {
      const relativePath = toPosixPath(path.relative(outputDir, filePath));
      const raw = await fs.readFile(filePath, 'utf8');
      const sanitized = sanitizeApiMarkdown(raw);
      const { title } = extractHeadingAndDescription(sanitized, pkg.packageName);
      const frontmatter = createFrontmatter({
        title: relativePath === 'index.md' ? pkg.packageName : title,
        description:
          relativePath === 'index.md'
            ? `Generated API reference for ${pkg.packageName}.`
            : `Generated API reference page for ${pkg.packageName}: ${stripMarkdownArtifacts(title)}.`,
        order: relativePath === 'index.md' ? pkg.order : undefined,
        editUrl: false,
      });
      await fs.writeFile(filePath, `${frontmatter}${sanitized.trim()}\n`, 'utf8');
    }
  }
}

async function generateVersionedSnapshot(versionSlug) {
  const snapshotRoot = path.join(docsContentRoot, versionSlug);
  await fs.rm(snapshotRoot, { force: true, recursive: true });
  await fs.mkdir(snapshotRoot, { recursive: true });

  const entries = await fs.readdir(docsContentRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === versionSlug) {
      continue;
    }

    await copyVersionedEntry(entry, versionSlug, '', snapshotRoot);
  }
}

async function copyVersionedEntry(entry, versionSlug, parentRelativePath, snapshotRoot) {
  const sourcePath = path.join(docsContentRoot, parentRelativePath, entry.name);
  const targetPath = path.join(snapshotRoot, parentRelativePath, entry.name);
  const relativePath = toPosixPath(path.posix.join(parentRelativePath, entry.name));

  if (entry.isDirectory()) {
    await fs.mkdir(targetPath, { recursive: true });
    const nestedEntries = await fs.readdir(sourcePath, { withFileTypes: true });
    for (const nestedEntry of nestedEntries) {
      await copyVersionedEntry(nestedEntry, versionSlug, relativePath, snapshotRoot);
    }
    return;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  if (/\.(md|mdx)$/u.test(entry.name)) {
    const source = await fs.readFile(sourcePath, 'utf8');
    await fs.writeFile(
      targetPath,
      `${transformVersionedMarkdown(source, relativePath, versionSlug).trim()}\n`,
      'utf8',
    );
    return;
  }

  await fs.copyFile(sourcePath, targetPath);
}

function transformVersionedMarkdown(markdown, relativePath, versionSlug) {
  return markdown
    .replace(/(\]\()\/(?!\/)/gu, `$1/${versionSlug}/`)
    .replace(/^(\s*link:\s*)\/(?!\/)/gmu, `$1/${versionSlug}/`)
    .replace(/^(\s*(?:file|dark|light):\s*)(\.\.\/[^\s]+)/gmu, (_match, prefix, assetPath) => {
      return `${prefix}../${assetPath}`;
    })
    .replace(/(from\s+['"])(\.\.\/[^'"]+)(['"])/gu, (_match, start, importPath, end) => {
      return `${start}../${importPath}${end}`;
    });
}

function createFrontmatter({ title, description, editUrl, order }) {
  const lines = ['---', `title: ${quoteYaml(title)}`];

  if (description) {
    lines.push(`description: ${quoteYaml(description)}`);
  }

  if (typeof editUrl === 'boolean') {
    lines.push(`editUrl: ${String(editUrl)}`);
  } else {
    lines.push(`editUrl: ${quoteYaml(editUrl)}`);
  }

  if (typeof order === 'number') {
    lines.push('sidebar:');
    lines.push(`  order: ${String(order)}`);
  }

  lines.push('---', '');
  return `${lines.join('\n')}\n`;
}

function extractHeadingAndDescription(markdown, fallbackTitle) {
  const normalized = markdown.replaceAll('\r\n', '\n');
  const lines = normalized.split('\n');
  let title = fallbackTitle;
  let bodyStart = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
    if (line?.startsWith('# ')) {
      title = line.slice(2).trim();
      bodyStart = index + 1;
      break;
    }
  }

  const body = lines.slice(bodyStart).join('\n').trim();

  return {
    body,
    description: extractDescription(body),
    title,
  };
}

function extractDescription(markdown) {
  const lines = markdown.split('\n');
  const descriptionParts = [];
  let inFence = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inFence = !inFence;
      continue;
    }

    if (inFence || trimmed.length === 0 || trimmed.startsWith('#')) {
      if (descriptionParts.length > 0) {
        break;
      }
      continue;
    }

    if (trimmed.startsWith('Audience:')) {
      continue;
    }

    descriptionParts.push(
      trimmed.replace(/<(https?:\/\/[^>]+)>/gu, '$1').replace(/\[([^\]]+)\]\(([^)]+)\)/gu, '$1'),
    );
    if (descriptionParts.join(' ').length > 160) {
      break;
    }
  }

  return descriptionParts.join(' ').trim();
}

function rewriteMarkdownLinks(markdown, sourceRelativePath, targetRelativePath) {
  return markdown.replace(
    /\[([^\]]+)\]\(([^)\s]+)([^)]*)\)/gu,
    (fullMatch, text, rawTarget, suffix) => {
      if (
        rawTarget.startsWith('#') ||
        rawTarget.startsWith('http://') ||
        rawTarget.startsWith('https://') ||
        rawTarget.startsWith('mailto:')
      ) {
        return fullMatch;
      }

      const [targetPath, hash = ''] = rawTarget.split('#');
      if (!targetPath || !/\.(md|mdx)$/u.test(targetPath)) {
        return fullMatch;
      }

      const resolvedSourcePath = path.posix.normalize(
        path.posix.join(path.posix.dirname(sourceRelativePath), targetPath),
      );

      if (resolvedSourcePath.startsWith('../')) {
        const repoRelativePath = path.posix.normalize(
          path.posix.join(path.posix.dirname(`docs/${sourceRelativePath}`), targetPath),
        );
        const githubUrl = `${githubRepositoryUrl}/blob/main/${repoRelativePath}`;
        return `[${text}](${githubUrl}${hash ? `#${hash}` : ''}${suffix})`;
      }

      const docsTargetPath = mapDocsSourceToTarget(resolvedSourcePath);
      const routePath = toRoutePath(docsTargetPath);
      const currentRoute = toRoutePath(targetRelativePath);
      const relativeRoute = toPosixPath(path.posix.relative(currentRoute, routePath)) || './';

      return `[${text}](${relativeRoute}${hash ? `#${hash}` : ''}${suffix})`;
    },
  );
}

function mapDocsSourceToTarget(relativeSourcePath) {
  if (relativeSourcePath === 'STYLE_GUIDE.md') {
    return path.posix.join('project', 'style-guide.md');
  }

  if (path.posix.basename(relativeSourcePath) === 'README.md') {
    return path.posix.join(path.posix.dirname(relativeSourcePath), 'index.md');
  }

  return relativeSourcePath;
}

function createFallbackTitle(relativePath) {
  return stripMarkdownExtension(path.posix.basename(relativePath))
    .split(/[-_]/u)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function stripMarkdownExtension(value) {
  return value.replace(/\.(md|mdx)$/u, '');
}

function stripMarkdownArtifacts(value) {
  return value.replace(/[`*_]/gu, '').trim();
}

function toRoutePath(targetRelativePath) {
  const stripped = stripMarkdownExtension(targetRelativePath);
  if (stripped === 'index') {
    return '.';
  }

  return stripped.endsWith('/index') ? stripped.slice(0, -'/index'.length) : stripped;
}

function sanitizeApiMarkdown(markdown) {
  return markdown
    .replaceAll('\r\n', '\n')
    .replace(/^\[[^\n]+\]\([^)]+\)\s*\/[^\n]*\n+/u, '')
    .replace(/^\*\*\*\n+/u, '')
    .trim();
}

function normalizeMdxFriendlyMarkdown(markdown) {
  const lines = markdown.split('\n');
  const normalizedLines = [];
  let inFence = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inFence = !inFence;
      normalizedLines.push(line);
      continue;
    }

    if (inFence) {
      normalizedLines.push(line);
      continue;
    }

    const withNormalizedAutolinks = line.replace(/<(https?:\/\/[^>]+)>/gu, '[$1]($1)');
    const segments = withNormalizedAutolinks.split('`');
    const escaped = segments
      .map((segment, index) => (index % 2 === 0 ? segment.replace(/</gu, '&lt;') : segment))
      .join('`');
    normalizedLines.push(escaped);
  }

  return normalizedLines.join('\n');
}

function quoteYaml(value) {
  return JSON.stringify(value);
}

async function runTypeDoc(entryPoint, outputDir, tsconfig) {
  await runCommand(
    'pnpm',
    [
      'exec',
      'typedoc',
      '--plugin',
      'typedoc-plugin-markdown',
      '--logLevel',
      'Error',
      '--excludeInternal',
      'true',
      '--validation.notExported',
      'false',
      '--validation.invalidLink',
      'false',
      '--validation.invalidPath',
      'false',
      '--validation.rewrittenLink',
      'false',
      '--validation.unusedMergeModuleWith',
      'false',
      '--entryFileName',
      'index.md',
      '--readme',
      'none',
      '--tsconfig',
      toPosixPath(path.join(repoRoot, tsconfig)),
      '--entryPoints',
      toPosixPath(path.join(repoRoot, entryPoint)),
      '--out',
      toPosixPath(outputDir),
    ],
    repoRoot,
  );
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
