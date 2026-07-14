import { PGlite } from '../../../../../OneDrive/Documents/hackathon-project/VERIBUS/node_modules/@electric-sql/pglite/dist/index.js';
import fs from 'node:fs';
import path from 'node:path';

async function run() {
  try {
    const root = process.cwd();
    const pgliteWasmPath = path.resolve(root, 'node_modules/@electric-sql/pglite/dist/pglite.wasm');
    const initdbWasmPath = path.resolve(root, 'node_modules/@electric-sql/pglite/dist/initdb.wasm');
    const pgliteDataPath = path.resolve(root, 'node_modules/@electric-sql/pglite/dist/pglite.data');

    console.log('1. Reading pglite.wasm...');
    const pgliteWasmBuf = fs.readFileSync(pgliteWasmPath);
    console.log('   pglite.wasm read. Size:', pgliteWasmBuf.length);

    console.log('2. Reading initdb.wasm...');
    const initdbWasmBuf = fs.readFileSync(initdbWasmPath);
    console.log('   initdb.wasm read. Size:', initdbWasmBuf.length);

    console.log('3. Reading pglite.data...');
    const pgliteDataBuf = fs.readFileSync(pgliteDataPath);
    console.log('   pglite.data read. Size:', pgliteDataBuf.length);

    console.log('4. Compiling pglite.wasm...');
    const wasmModule = await WebAssembly.compile(pgliteWasmBuf);
    console.log('   pglite.wasm compiled.');

    console.log('5. Compiling initdb.wasm...');
    const initdbWasmModule = await WebAssembly.compile(initdbWasmBuf);
    console.log('   initdb.wasm compiled.');

    console.log('6. Instantiating PGlite...');
    const db = new PGlite({
      wasmModule,
      initdbWasmModule,
      fsBundle: new Blob([pgliteDataBuf])
    });
    console.log('   PGlite instantiated.');

    console.log('7. Running test query...');
    const res = await db.query('SELECT 1 + 1 as sum');
    console.log('   Query result:', res.rows);
    
    console.log('8. Closing database...');
    await db.close();
    console.log('   Database closed successfully.');
  } catch (err) {
    console.error('   Error occurred:', err);
  }
}

run();
