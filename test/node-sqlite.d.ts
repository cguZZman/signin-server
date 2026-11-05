// The part of Node's built-in SQLite used by the tests (there are no Node types here).
declare module 'node:sqlite' {
	export class DatabaseSync {
		constructor(path: string);
		prepare(sql: string): { all(...bindings: unknown[]): Record<string, unknown>[] };
	}
}
