#!/usr/bin/env node

/* eslint-disable no-console, @typescript-eslint/no-unsafe-member-access */

import { createInterface } from 'node:readline';

const TEMPLATES: readonly string[] = [
  'react-app',
  'vue-app',
  'svelte-app',
  'solid-app',
  'angular-app',
  'core-vanilla',
] as const;

async function ask(question: string, defaultVal?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(defaultVal ? `${question} [${defaultVal}]: ` : `${question}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultVal || '');
    });
  });
}

async function main(): Promise<void> {
  console.log('\n  Roomful App Creator\n');

  const name = await ask('Project name', 'my-roomful-app');

  console.log('\nAvailable templates:');
  TEMPLATES.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
  const tplIndex = await ask('Template', '1');
  const tpl = TEMPLATES[parseInt(tplIndex, 10) - 1] ?? TEMPLATES[0];

  const installDeps = (await ask('Install dependencies?', 'Y')).toLowerCase() === 'y';

  console.log(`\nScaffolding "${name}" from "${tpl}" template...`);
  console.log(`Install deps: ${installDeps ? 'yes' : 'no'}`);
  console.log('\nDone! Run:');
  console.log(`  cd ${name}`);
  if (installDeps) console.log('  npm install');
  console.log('  npm run dev\n');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
