import { createServer } from 'http';
import { randomBytes } from 'crypto';
import open from 'open';
import { getBaseUrl, AUTH_CALLBACK_PORT } from '../constants.js';

export interface AuthResult {
  apiKey: string;
  organizationId: string;
  organizationName: string;
  email: string;
}

const CALLBACK_PATH = '/callback';
const TIMEOUT_MS = 5 * 60 * 1000;

const SUCCESS_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>AgentInSync</title></head>
<body style="font-family:sans-serif;text-align:center;padding:3rem">
<h1>&#x2713; Authorized</h1>
<p>You can close this tab and return to your terminal.</p>
</body>
</html>`;

export interface AuthCallbackServerOptions {
  state: string;
  onSuccess: (result: AuthResult) => void;
  onError: (error: Error) => void;
}

export function createAuthCallbackServer({ state, onSuccess, onError }: AuthCallbackServerOptions) {
  return createServer((req, res) => {
    const url = new URL(req.url || '', `http://localhost:${AUTH_CALLBACK_PORT}`);

    if (req.method !== 'GET' || url.pathname !== CALLBACK_PATH) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const returnedState = url.searchParams.get('state');
    if (returnedState !== state) {
      res.writeHead(400);
      res.end('Invalid state');
      onError(new Error('Invalid state parameter in auth callback'));
      return;
    }

    const apiKey = url.searchParams.get('apiKey');
    const organizationId = url.searchParams.get('organizationId');
    const organizationName = url.searchParams.get('organizationName');
    const email = url.searchParams.get('email');

    if (!apiKey || !organizationId || !organizationName || !email) {
      res.writeHead(400);
      res.end('Missing credentials');
      onError(new Error('Incomplete authentication response'));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(SUCCESS_HTML);
    onSuccess({ apiKey, organizationId, organizationName, email });
  });
}

export async function authenticateWithBrowser(): Promise<AuthResult> {
  const state = randomBytes(32).toString('base64url');

  return new Promise((resolve, reject) => {
    const server = createAuthCallbackServer({
      state,
      onSuccess: result => {
        server.close();
        resolve(result);
      },
      onError: error => {
        server.close();
        reject(error);
      },
    });

    server.listen(AUTH_CALLBACK_PORT, () => {
      const callbackUrl = `http://localhost:${AUTH_CALLBACK_PORT}${CALLBACK_PATH}`;
      const authUrl = `${getBaseUrl()}/cli-auth?state=${encodeURIComponent(state)}&callback=${encodeURIComponent(callbackUrl)}`;
      open(authUrl);
    });

    server.on('error', err => {
      reject(err);
    });

    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Authentication timed out. Please try again.'));
    }, TIMEOUT_MS);
    timeout.unref();
  });
}
