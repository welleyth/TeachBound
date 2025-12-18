import { render, screen } from '@testing-library/react';

// Disable P2P in tests even if `.env` is present.
process.env.REACT_APP_P2P_SIGNALING_ADDR = '';
process.env.REACT_APP_P2P_HOST = '';

// libp2p is ESM-only and not needed for the React component unit test.
// Mock the P2P module so Jest doesn't try to resolve libp2p in Node.
jest.mock('./p2p/startP2P', () => ({
  addP2PEventListener: () => () => {},
  getP2PNode: () => null,
  publishP2PEvent: () => ({}),
  scheduleStopP2P: () => {},
  startP2P: () =>
    Promise.resolve({
      peerId: { toString: () => 'test-peer' },
      getConnections: () => []
    })
}));

// Canvas relies on HTMLCanvasElement.getContext which is not implemented in jsdom by default.
jest.mock('./Canvas', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef(() => <div data-testid="canvas" />)
  };
});

import App from './App';

test('renders Teach Bound header', () => {
  render(<App />);
  expect(screen.getByText(/teach bound/i)).toBeInTheDocument();
});
