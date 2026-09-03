import { Transform, type TransformCallback, type Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createDeflateRaw } from "node:zlib";
import type { FileHandle } from "node:fs/promises";

export interface ZipArchiveEntry {
  kind: "directory" | "file";
  archivePath: string;
  sizeBytes: number;
  modifiedAtMs: number;
}

export interface OpenedZipFile {
  handle: FileHandle;
  sizeBytes: number;
}

interface CentralDirectoryEntry {
  name: Buffer;
  flags: number;
  method: number;
  dosTime: number;
  dosDate: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  externalAttributes: number;
}

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < CRC_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[index] = value >>> 0;
}

function updateCrc32(current: number, chunk: Buffer): number {
  let value = current;
  for (const byte of chunk) {
    value = CRC_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  }
  return value >>> 0;
}

function dosDateTime(value: number): { date: number; time: number } {
  const date = new Date(value);
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

function localHeader(entry: {
  name: Buffer;
  flags: number;
  method: number;
  dosTime: number;
  dosDate: number;
  crc32?: number;
  compressedSize?: number;
  uncompressedSize?: number;
}): Buffer {
  const header = Buffer.alloc(30 + entry.name.length);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(entry.flags, 6);
  header.writeUInt16LE(entry.method, 8);
  header.writeUInt16LE(entry.dosTime, 10);
  header.writeUInt16LE(entry.dosDate, 12);
  header.writeUInt32LE(entry.crc32 ?? 0, 14);
  header.writeUInt32LE(entry.compressedSize ?? 0, 18);
  header.writeUInt32LE(entry.uncompressedSize ?? 0, 22);
  header.writeUInt16LE(entry.name.length, 26);
  header.writeUInt16LE(0, 28);
  entry.name.copy(header, 30);
  return header;
}

function dataDescriptor(crc32: number, compressedSize: number, uncompressedSize: number): Buffer {
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(crc32, 4);
  descriptor.writeUInt32LE(compressedSize, 8);
  descriptor.writeUInt32LE(uncompressedSize, 12);
  return descriptor;
}

function centralHeader(entry: CentralDirectoryEntry): Buffer {
  const header = Buffer.alloc(46 + entry.name.length);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(0x031e, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(entry.flags, 8);
  header.writeUInt16LE(entry.method, 10);
  header.writeUInt16LE(entry.dosTime, 12);
  header.writeUInt16LE(entry.dosDate, 14);
  header.writeUInt32LE(entry.crc32, 16);
  header.writeUInt32LE(entry.compressedSize, 20);
  header.writeUInt32LE(entry.uncompressedSize, 24);
  header.writeUInt16LE(entry.name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(entry.externalAttributes, 38);
  header.writeUInt32LE(entry.localHeaderOffset, 42);
  entry.name.copy(header, 46);
  return header;
}

function endOfCentralDirectory(entryCount: number, centralSize: number, centralOffset: number): Buffer {
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0);
  footer.writeUInt16LE(0, 4);
  footer.writeUInt16LE(0, 6);
  footer.writeUInt16LE(entryCount, 8);
  footer.writeUInt16LE(entryCount, 10);
  footer.writeUInt32LE(centralSize, 12);
  footer.writeUInt32LE(centralOffset, 16);
  footer.writeUInt16LE(0, 20);
  return footer;
}

async function writeChunk(destination: Writable, chunk: Buffer): Promise<void> {
  if (destination.destroyed || !destination.writable) {
    throw new Error("다운로드 연결이 종료되었습니다.");
  }
  if (destination.write(chunk)) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      destination.off("drain", onDrain);
      destination.off("error", onError);
      destination.off("close", onClose);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new Error("다운로드 연결이 종료되었습니다."));
    };
    destination.once("drain", onDrain);
    destination.once("error", onError);
    destination.once("close", onClose);
  });
}

export async function streamZipArchive(options: {
  entries: readonly ZipArchiveEntry[];
  destination: Writable;
  openFile: (entry: ZipArchiveEntry) => Promise<OpenedZipFile>;
}): Promise<void> {
  const centralEntries: CentralDirectoryEntry[] = [];
  let offset = 0;

  async function write(chunk: Buffer) {
    await writeChunk(options.destination, chunk);
    offset += chunk.length;
  }

  for (const entry of options.entries) {
    const archivePath = entry.kind === "directory"
      ? `${entry.archivePath.replace(/\/+$/, "")}/`
      : entry.archivePath;
    const name = Buffer.from(archivePath, "utf8");
    if (name.length === 0 || name.length > 0xffff) {
      throw new Error("ZIP 안의 경로가 너무 깁니다.");
    }
    const timestamp = dosDateTime(entry.modifiedAtMs);
    const localHeaderOffset = offset;

    if (entry.kind === "directory") {
      const flags = 0x0800;
      await write(localHeader({
        name,
        flags,
        method: 0,
        dosTime: timestamp.time,
        dosDate: timestamp.date,
      }));
      centralEntries.push({
        name,
        flags,
        method: 0,
        dosTime: timestamp.time,
        dosDate: timestamp.date,
        crc32: 0,
        compressedSize: 0,
        uncompressedSize: 0,
        localHeaderOffset,
        externalAttributes: 0x10,
      });
      continue;
    }

    const flags = 0x0808;
    await write(localHeader({
      name,
      flags,
      method: 8,
      dosTime: timestamp.time,
      dosDate: timestamp.date,
    }));

    const opened = await options.openFile(entry);
    let crc = 0xffffffff;
    let uncompressedSize = 0;
    let compressedSize = 0;
    const crcCounter = new Transform({
      transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
        crc = updateCrc32(crc, chunk);
        uncompressedSize += chunk.length;
        callback(null, chunk);
      },
    });
    const compressedCounter = new Transform({
      transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
        compressedSize += chunk.length;
        callback(null, chunk);
      },
    });

    try {
      await pipeline(
        opened.handle.createReadStream({ autoClose: true }),
        crcCounter,
        createDeflateRaw({ level: 6 }),
        compressedCounter,
        options.destination,
        { end: false },
      );
    } catch (error) {
      await opened.handle.close().catch(() => undefined);
      throw error;
    }

    if (uncompressedSize !== opened.sizeBytes || uncompressedSize !== entry.sizeBytes) {
      throw new Error("압축하는 동안 파일이 변경되었습니다.");
    }
    offset += compressedSize;
    const finalizedCrc = (crc ^ 0xffffffff) >>> 0;
    await write(dataDescriptor(finalizedCrc, compressedSize, uncompressedSize));
    centralEntries.push({
      name,
      flags,
      method: 8,
      dosTime: timestamp.time,
      dosDate: timestamp.date,
      crc32: finalizedCrc,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      externalAttributes: 0,
    });
  }

  const centralOffset = offset;
  for (const entry of centralEntries) {
    await write(centralHeader(entry));
  }
  const centralSize = offset - centralOffset;
  await write(endOfCentralDirectory(centralEntries.length, centralSize, centralOffset));
}
