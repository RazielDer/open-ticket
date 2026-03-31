import * as sqlite3 from "sqlite3"

export interface SqliteRunResult {
    lastID: number
    changes: number
}

export class TranscriptSqliteDatabase {
    readonly filepath: string
    readonly connection: sqlite3.Database

    constructor(filepath: string) {
        this.filepath = filepath
        this.connection = new sqlite3.Database(filepath, (error) => {
            if (error) throw error
        })
    }

    async init() {
        await this.exec("PRAGMA journal_mode=WAL;")
        await this.exec("PRAGMA synchronous=NORMAL;")
        await this.exec("PRAGMA busy_timeout=5000;")
        await this.exec("PRAGMA foreign_keys=ON;")
    }

    async exec(sql: string): Promise<void> {
        return await new Promise<void>((resolve, reject) => {
            this.connection.exec(sql, (error) => {
                if (error) reject(error)
                else resolve()
            })
        })
    }

    async run(sql: string, params: unknown[] = []): Promise<SqliteRunResult> {
        return await new Promise<SqliteRunResult>((resolve, reject) => {
            this.connection.run(sql, params, function (this: sqlite3.RunResult, error) {
                if (error) reject(error)
                else resolve({ lastID: this.lastID, changes: this.changes })
            })
        })
    }

    async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
        return await new Promise<T | undefined>((resolve, reject) => {
            this.connection.get(sql, params, (error, row: T | undefined) => {
                if (error) reject(error)
                else resolve(row)
            })
        })
    }

    async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
        return await new Promise<T[]>((resolve, reject) => {
            this.connection.all(sql, params, (error, rows: T[] | undefined) => {
                if (error) reject(error)
                else resolve(rows ?? [])
            })
        })
    }

    async close() {
        await new Promise<void>((resolve, reject) => {
            this.connection.close((error) => {
                if (error) reject(error)
                else resolve()
            })
        })
    }
}
