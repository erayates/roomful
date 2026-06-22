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

// Roomful mark, normalized 0..1 — two multiplayer cursors in the teal "room".
const CREAM_CURSOR = [
  [0.328, 0.344],
  [0.528, 0.789],
  [0.586, 0.609],
  [0.766, 0.539],
];
const AMBER_CURSOR = [
  [0.641, 0.258],
  [0.747, 0.494],
  [0.777, 0.399],
  [0.873, 0.361],
];

function pointInPolygon(px, py, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function drawIconPixel(size, x, y) {
  const max = Math.max(1, size - 1);

  // Rounded-square mask → transparent outside the corners.
  const cornerRadius = size * 0.234;
  const cornerX = Math.min(x, max - x);
  const cornerY = Math.min(y, max - y);
  if (cornerX < cornerRadius && cornerY < cornerRadius) {
    const dx = cornerRadius - cornerX;
    const dy = cornerRadius - cornerY;
    if (dx * dx + dy * dy > cornerRadius * cornerRadius) {
      return [0, 0, 0, 0];
    }
  }

  const nx = x / max;
  const ny = y / max;

  // Cream cursor sits in front of the amber teammate cursor.
  if (pointInPolygon(nx, ny, CREAM_CURSOR)) {
    return [251, 247, 236, 255];
  }
  if (pointInPolygon(nx, ny, AMBER_CURSOR)) {
    return [251, 191, 36, 255];
  }

  // Teal "room" gradient — bright top-left to deep bottom-right.
  const gradientRatio = (x + y) / (max * 2);
  const red = interpolateChannel(33, 10, gradientRatio);
  const green = interpolateChannel(205, 84, gradientRatio);
  const blue = interpolateChannel(182, 76, gradientRatio);

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
