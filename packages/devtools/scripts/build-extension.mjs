import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

const ICON_SIZES = [16, 32, 48, 128];
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageDirectory = path.dirname(scriptDirectory);
const assetsDirectory = path.join(packageDirectory, 'assets');
const distDirectory = path.join(packageDirectory, 'dist');
const extensionAssetsDirectory = path.join(assetsDirectory, 'extension');
const extensionRuntimeDirectory = path.join(distDirectory, 'extension');
const iconOutputDirectory = path.join(distDirectory, 'icons');
const browserArtifactsDirectory = path.join(distDirectory, 'browser');

function createCrcTable() {
  const table = new Uint32Array(256);

  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
}

const crcTable = createCrcTable();

function computeCrc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(computeCrc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function interpolateChannel(start, end, ratio) {
  return Math.round(start + (end - start) * ratio);
}

function drawIconPixel(size, x, y) {
  const gradientRatio = (x + y) / Math.max(1, (size - 1) * 2);
  let red = interpolateChannel(18, 234, gradientRatio);
  let green = interpolateChannel(35, 116, gradientRatio);
  let blue = interpolateChannel(46, 82, gradientRatio);

  const unit = size / 8;
  const center = (size - 1) / 2;
  const dx = x - center;
  const dy = y - center;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const outerRadius = size * 0.47;
  const ringThickness = Math.max(1, size * 0.07);

  if (distance >= outerRadius - ringThickness && distance <= outerRadius) {
    red = 255;
    green = 244;
    blue = 225;
  }

  const letterF =
    (x >= unit * 2 && x <= unit * 3.05 && y >= unit * 1.45 && y <= unit * 6.45) ||
    (x >= unit * 2 && x <= unit * 5.7 && y >= unit * 1.45 && y <= unit * 2.55) ||
    (x >= unit * 2 && x <= unit * 4.85 && y >= unit * 3.45 && y <= unit * 4.55);

  if (letterF) {
    red = 255;
    green = 252;
    blue = 246;
  }

  return [red, green, blue, 255];
}

function createPng(size) {
  const bytesPerRow = size * 4 + 1;
  const raw = Buffer.alloc(bytesPerRow * size);

  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * bytesPerRow;
    raw[rowOffset] = 0;

    for (let x = 0; x < size; x += 1) {
      const [red, green, blue, alpha] = drawIconPixel(size, x, y);
      const pixelOffset = rowOffset + 1 + x * 4;
      raw[pixelOffset] = red;
      raw[pixelOffset + 1] = green;
      raw[pixelOffset + 2] = blue;
      raw[pixelOffset + 3] = alpha;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    PNG_SIGNATURE,
    createChunk('IHDR', header),
    createChunk('IDAT', deflateSync(raw)),
    createChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function copyDirectory(sourceDirectory, targetDirectory) {
  await mkdir(targetDirectory, { recursive: true });
  const entries = await readdir(sourceDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDirectory, entry.name);
    const targetPath = path.join(targetDirectory, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }

    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
  }
}

async function copyPackagedDist(sourceDirectory, targetDirectory) {
  await mkdir(targetDirectory, { recursive: true });
  const entries = await readdir(sourceDirectory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === 'browser') {
      continue;
    }

    const sourcePath = path.join(sourceDirectory, entry.name);
    const targetPath = path.join(targetDirectory, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }

    await copyFile(sourcePath, targetPath);
  }
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyStaticAssets() {
  await copyDirectory(extensionAssetsDirectory, extensionRuntimeDirectory);

  const listingSourceDirectory = path.join(assetsDirectory, 'listings');
  const listingTargetDirectory = path.join(browserArtifactsDirectory, 'listings');
  await copyDirectory(listingSourceDirectory, listingTargetDirectory);
}

async function writeGeneratedIcons() {
  await mkdir(iconOutputDirectory, { recursive: true });

  for (const size of ICON_SIZES) {
    const iconPath = path.join(iconOutputDirectory, `icon-${String(size)}.png`);
    await writeFile(iconPath, createPng(size));
  }
}

async function readPackageVersion() {
  const packageJsonPath = path.join(packageDirectory, 'package.json');
  const packageJsonContent = await readFile(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonContent);
  return typeof packageJson.version === 'string' && packageJson.version.length > 0
    ? packageJson.version
    : '0.0.0';
}

function zipDirectory(sourceDirectory, archiveFileName) {
  if (process.platform === 'win32') {
    const command = `Compress-Archive -Path * -DestinationPath './${archiveFileName.replaceAll("'", "''")}' -Force`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
      cwd: sourceDirectory,
      stdio: 'pipe',
    });

    return result.status === 0;
  }

  const result = spawnSync('zip', ['-r', archiveFileName, '.'], {
    cwd: sourceDirectory,
    stdio: 'pipe',
  });
  return result.status === 0;
}

async function buildBrowserArtifacts(version) {
  const manifestModulePath = path.join(distDirectory, 'extension', 'manifest.js');
  const manifestModule = await import(`${pathToFileURL(manifestModulePath).href}?t=${Date.now()}`);
  const { createExtensionManifest } = manifestModule;

  for (const browser of ['chrome', 'firefox']) {
    const targetDirectory = path.join(browserArtifactsDirectory, browser);
    await rm(targetDirectory, { force: true, recursive: true });
    await copyPackagedDist(distDirectory, targetDirectory);

    const manifest = createExtensionManifest(browser, version);
    await writeFile(
      path.join(targetDirectory, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    const temporaryArchiveFileName = `roomful-devtools-${browser}.zip`;
    const temporaryArchivePath = path.join(targetDirectory, temporaryArchiveFileName);
    const archivePath = path.join(browserArtifactsDirectory, `roomful-devtools-${browser}.zip`);
    await rm(temporaryArchivePath, { force: true, recursive: false });
    if (
      !(await fileExists(targetDirectory)) ||
      !zipDirectory(targetDirectory, temporaryArchiveFileName)
    ) {
      console.warn(
        `Skipping the ${browser} DevTools zip artifact: the 'zip' tool is unavailable on this platform. The build continues without it.`,
      );
      continue;
    }

    await copyFile(temporaryArchivePath, archivePath);
    await rm(temporaryArchivePath, { force: true, recursive: false });
  }
}

async function main() {
  const manifestModulePath = path.join(distDirectory, 'extension', 'manifest.js');
  if (!(await fileExists(manifestModulePath))) {
    console.error('Expected compiled extension sources in dist/. Run tsc before packaging.');
    process.exitCode = 1;
    return;
  }

  await rm(browserArtifactsDirectory, { force: true, recursive: true });
  await copyStaticAssets();
  await writeGeneratedIcons();

  const version = await readPackageVersion();
  await buildBrowserArtifacts(version);
}

await main();
