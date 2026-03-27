// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// jsdom (Jest) may not provide TextEncoder/TextDecoder globals, but libp2p protocol code uses them.
// Provide Node's implementations for tests.
import { TextDecoder, TextEncoder } from 'util';

if (globalThis.TextEncoder == null) globalThis.TextEncoder = TextEncoder;
if (globalThis.TextDecoder == null) globalThis.TextDecoder = TextDecoder;
