import { open, stat, mkdir, writeFile, unlink, rmdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const maximumFileBytes = 8 * 1024 * 1024;
const maximumCombinedBytes = 64 * 1024 * 1024;
const chunkBytes = 7 * 1024 * 1024;

async function splitSave(sourceArgument) {
  if (!sourceArgument) {
    throw new Error('用法：node miniapp/scripts/split-save.mjs "存档文件路径"');
  }

  const sourcePath = resolve(sourceArgument);
  const sourceStat = await stat(sourcePath);
  if (!sourceStat.isFile()) throw new Error('指定路径不是文件。');
  if (!sourcePath.toLowerCase().endsWith('.sl2')) throw new Error('请选择 .sl2 存档文件。');
  if (sourceStat.size <= maximumFileBytes) {
    throw new Error('此文件不超过 8 MiB，可直接在小程序中导入，无需切片。');
  }
  if (sourceStat.size > maximumCombinedBytes) {
    throw new Error('此文件超过小程序当前 64 MiB 的端内拼接上限。');
  }

  const outputDirectory = `${sourcePath}.parts`;
  const partCount = Math.ceil(sourceStat.size / chunkBytes);
  const digits = Math.max(3, String(partCount).length);
  const createdFiles = [];
  let directoryCreated = false;
  let sourceHandle;

  try {
    await mkdir(outputDirectory);
    directoryCreated = true;
    sourceHandle = await open(sourcePath, 'r');

    let position = 0;
    for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
      const length = Math.min(chunkBytes, sourceStat.size - position);
      const chunk = Buffer.allocUnsafe(length);
      let filled = 0;

      while (filled < length) {
        const { bytesRead } = await sourceHandle.read(chunk, filled, length - filled, position + filled);
        if (bytesRead === 0) throw new Error('读取存档时遇到意外的文件结尾；原文件未修改。');
        filled += bytesRead;
      }

      const partName = `${basename(sourcePath)}.${String(partNumber).padStart(digits, '0')}-of-${String(partCount).padStart(digits, '0')}.part`;
      const partPath = join(outputDirectory, partName);
      createdFiles.push(partPath);
      await writeFile(partPath, chunk, { flag: 'wx' });
      position += length;
    }

    const finalStat = await sourceHandle.stat();
    if (finalStat.size !== sourceStat.size) throw new Error('切片期间原存档大小发生变化；请确认游戏已关闭后重试。');

    console.log(`已生成 ${partCount} 个分片，每片最多 7 MiB。`);
    console.log(`分片目录：${outputDirectory}`);
    console.log('原存档未修改、未上传。请在小程序选择“导入存档分片”，并一次选中该目录内全部 .part 文件。');
  } catch (error) {
    for (const filePath of createdFiles) await unlink(filePath).catch(() => {});
    if (directoryCreated) await rmdir(outputDirectory).catch(() => {});
    throw error;
  } finally {
    await sourceHandle?.close().catch(() => {});
  }
}

splitSave(process.argv[2]).catch(error => {
  console.error(`切片失败：${error.message}`);
  process.exitCode = 1;
});
