import { Axiom } from '@axiomhq/js';

const AXIOM_TOKEN = process.env.AXIOM_TOKEN;
const AXIOM_DATASET = process.env.AXIOM_DATASET ?? 'agent-in-sync';
const AXIOM_ORG_ID = process.env.AXIOM_ORG_ID;

let axiomClient: Axiom | null = null;

export function getAxiomClient(): Axiom | null {
  if (!AXIOM_TOKEN) {
    return null;
  }

  if (!axiomClient) {
    axiomClient = new Axiom({
      token: AXIOM_TOKEN,
      orgId: AXIOM_ORG_ID,
    });
  }

  return axiomClient;
}

export function getDataset(): string {
  return AXIOM_DATASET;
}

export function isAxiomEnabled(): boolean {
  return !!AXIOM_TOKEN;
}

export async function flushAxiom(): Promise<void> {
  const client = getAxiomClient();
  if (client) {
    await client.flush();
  }
}
