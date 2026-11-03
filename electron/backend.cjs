const path = require('node:path');
let api, server, stopping = false;
const send = message => process.parentPort.postMessage(message);
async function stop() {
  if (stopping) return;
  stopping = true;
  try { if (server) await api.stopPosServer(server); send({ type: 'stopped' }); process.exit(0); }
  catch { send({ type: 'shutdown-error' }); process.exit(1); }
}
process.parentPort.on('message', async ({ data }) => {
  if (data?.type === 'stop') { await stop(); return; }
  if (data?.type !== 'setup-owner' || !api || stopping) return;
  try {
    api.provisionInitialOwner(data.owner);
    send({ type: 'setup-result', id: data.id, ok: true });
  } catch (error) { send({ type: 'setup-result', id: data.id, ok: false, error: error.message }); }
});
(async () => {
  api = require(path.join(__dirname, '..', 'dist-server', 'server.cjs'));
  server = await api.startPosServer();
  send({ type: 'ready', setupRequired: api.needsInitialOwner() });
})().catch(error => { send({ type: 'startup-error', code: error.code, error: error.message }); process.exit(1); });
