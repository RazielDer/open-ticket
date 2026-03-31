"use strict"

const fs = require("fs")
const { PassThrough } = require("stream")

const CRC_TABLE = (() => {
    const table = new Uint32Array(256)
    for (let index = 0; index < 256; index++) {
        let value = index
        for (let bit = 0; bit < 8; bit++) {
            value = (value & 1) == 1 ? (0xEDB88320 ^ (value >>> 1)) >>> 0 : value >>> 1
        }
        table[index] = value >>> 0
    }
    return table
})()

function crc32(buffer) {
    let crc = 0xFFFFFFFF
    for (const byte of buffer) {
        crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8)
    }
    return (crc ^ 0xFFFFFFFF) >>> 0
}

function normalizeZipPath(metadataPath) {
    return String(metadataPath || "")
        .replaceAll("\\", "/")
        .replace(/^\/+/, "")
}

function toDosDateTime(value) {
    const date = value instanceof Date ? value : new Date(value)
    const safe = Number.isFinite(date.getTime()) ? date : new Date()

    const dosDate = ((Math.max(1980, safe.getFullYear()) - 1980) << 9)
        | ((safe.getMonth() + 1) << 5)
        | safe.getDate()
    const dosTime = (safe.getHours() << 11)
        | (safe.getMinutes() << 5)
        | Math.floor(safe.getSeconds() / 2)

    return {
        date: dosDate & 0xFFFF,
        time: dosTime & 0xFFFF
    }
}

function createLocalFileHeader(fileName, data, modifiedAt) {
    const fileNameBuffer = Buffer.from(normalizeZipPath(fileName), "utf8")
    const { date, time } = toDosDateTime(modifiedAt)
    const header = Buffer.alloc(30 + fileNameBuffer.length)

    header.writeUInt32LE(0x04034B50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(0, 6)
    header.writeUInt16LE(0, 8)
    header.writeUInt16LE(time, 10)
    header.writeUInt16LE(date, 12)
    header.writeUInt32LE(crc32(data), 14)
    header.writeUInt32LE(data.length, 18)
    header.writeUInt32LE(data.length, 22)
    header.writeUInt16LE(fileNameBuffer.length, 26)
    header.writeUInt16LE(0, 28)
    fileNameBuffer.copy(header, 30)

    return header
}

function createCentralDirectoryHeader(fileName, data, modifiedAt, localHeaderOffset) {
    const fileNameBuffer = Buffer.from(normalizeZipPath(fileName), "utf8")
    const { date, time } = toDosDateTime(modifiedAt)
    const header = Buffer.alloc(46 + fileNameBuffer.length)

    header.writeUInt32LE(0x02014B50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(20, 6)
    header.writeUInt16LE(0, 8)
    header.writeUInt16LE(0, 10)
    header.writeUInt16LE(time, 12)
    header.writeUInt16LE(date, 14)
    header.writeUInt32LE(crc32(data), 16)
    header.writeUInt32LE(data.length, 20)
    header.writeUInt32LE(data.length, 24)
    header.writeUInt16LE(fileNameBuffer.length, 28)
    header.writeUInt16LE(0, 30)
    header.writeUInt16LE(0, 32)
    header.writeUInt16LE(0, 34)
    header.writeUInt16LE(0, 36)
    header.writeUInt32LE(0, 38)
    header.writeUInt32LE(localHeaderOffset, 42)
    fileNameBuffer.copy(header, 46)

    return header
}

async function writeChunk(stream, buffer) {
    if (!buffer || buffer.length == 0) return
    await new Promise((resolve, reject) => {
        stream.write(buffer, (error) => error ? reject(error) : resolve())
    })
}

class ZipFile {
    constructor() {
        this.entries = []
        this.outputStream = new PassThrough()
    }

    addBuffer(buffer, metadataPath) {
        this.entries.push({
            fileName: normalizeZipPath(metadataPath),
            data: Buffer.from(buffer),
            modifiedAt: new Date()
        })
    }

    addFile(realPath, metadataPath) {
        const stats = fs.statSync(realPath)
        this.entries.push({
            fileName: normalizeZipPath(metadataPath),
            filePath: realPath,
            modifiedAt: stats.mtime
        })
    }

    end() {
        void this.writeArchive()
    }

    async writeArchive() {
        try {
            const centralDirectory = []
            let offset = 0

            for (const entry of this.entries) {
                const data = entry.data ?? await fs.promises.readFile(entry.filePath)
                const localHeader = createLocalFileHeader(entry.fileName, data, entry.modifiedAt)
                const centralHeader = createCentralDirectoryHeader(entry.fileName, data, entry.modifiedAt, offset)

                await writeChunk(this.outputStream, localHeader)
                await writeChunk(this.outputStream, data)
                centralDirectory.push(centralHeader)
                offset += localHeader.length + data.length
            }

            const centralDirectoryOffset = offset
            for (const entry of centralDirectory) {
                await writeChunk(this.outputStream, entry)
                offset += entry.length
            }

            const endOfCentralDirectory = Buffer.alloc(22)
            endOfCentralDirectory.writeUInt32LE(0x06054B50, 0)
            endOfCentralDirectory.writeUInt16LE(0, 4)
            endOfCentralDirectory.writeUInt16LE(0, 6)
            endOfCentralDirectory.writeUInt16LE(centralDirectory.length, 8)
            endOfCentralDirectory.writeUInt16LE(centralDirectory.length, 10)
            endOfCentralDirectory.writeUInt32LE(offset - centralDirectoryOffset, 12)
            endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16)
            endOfCentralDirectory.writeUInt16LE(0, 20)

            await new Promise((resolve, reject) => {
                this.outputStream.end(endOfCentralDirectory, (error) => error ? reject(error) : resolve())
            })
        } catch (error) {
            this.outputStream.emit("error", error)
            this.outputStream.end()
        }
    }
}

module.exports = {
    ZipFile
}
