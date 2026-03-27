import { toString } from 'uint8arrays/to-string';

const seed = crypto.getRandomValues(new Uint8Array(32));
const base64 = Buffer.from(seed).toString('base64');
console.log('SEED=' + base64);
