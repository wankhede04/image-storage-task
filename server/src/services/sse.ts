import { Response } from 'express';

interface SSEClient {
  id: string;
  res: Response;
}

const clients = new Map<string, SSEClient>();

export function addClient(id: string, res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send a heartbeat comment immediately so the connection is confirmed
  res.write(': connected\n\n');

  clients.set(id, { id, res });

  res.on('close', () => {
    clients.delete(id);
  });
}

export function broadcast(data: Record<string, unknown>): void {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of clients.values()) {
    client.res.write(payload);
  }
}

// Heartbeat every 25s to prevent proxy/browser timeouts
setInterval(() => {
  for (const client of clients.values()) {
    client.res.write(': heartbeat\n\n');
  }
}, 25_000);
