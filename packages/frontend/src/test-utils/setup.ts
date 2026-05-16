/// <reference types="vitest/globals" />
import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { server } from './msw-handlers';

expect.extend(matchers);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
