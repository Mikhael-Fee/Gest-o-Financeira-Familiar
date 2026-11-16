import type { Readable } from "node:stream";
export function sealStream(source: Readable, destination: string, keyFile: string): Promise<void>;
export function sealFile(source: string, destination: string, keyFile: string): Promise<void>;
export function openBackup(source: string, destination: string, keyFile: string): Promise<void>;
export function createLocalBackup(destination: string, keyFile: string): Promise<void>;
