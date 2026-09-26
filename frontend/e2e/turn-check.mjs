/**
 * Does a real browser allocate a TURN relay using the credentials the app serves?
 *
 * The earlier coturn check proved the credentials are valid at the TURN protocol level.
 * This proves the other half of the chain: that the ICE configuration the app returns
 * from /join actually reaches the browser and that the browser can use it. A `relay`
 * candidate can only be gathered after a successful, authenticated TURN Allocate - so
 * one appearing is the browser confirming the credentials worked.
 */
import { chromium } from 'playwright';

const [,, token, sessionApi] = process.argv;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:5199/');

const result = await page.evaluate(async ([tok, api]) => {
  const join = await fetch(`${api}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}` },
  }).then((r) => r.json());
  const iceServers = join?.data?.iceServers ?? [];

  const pc = new RTCPeerConnection({ iceServers });
  const kinds = new Set();
  const raw = [];
  pc.onicecandidate = (e) => {
    if (e.candidate?.candidate) {
      raw.push(e.candidate.candidate);
      const m = /typ (\w+)/.exec(e.candidate.candidate);
      if (m) kinds.add(m[1]);
    }
  };
  pc.addTransceiver('video', { direction: 'recvonly' });
  await pc.setLocalDescription(await pc.createOffer());
  await new Promise((r) => setTimeout(r, 9000));
  pc.close();
  return { iceServers, candidateTypes: [...kinds], sample: raw.slice(0, 6) };
}, [token, sessionApi]);

console.log('  ICE config served to the browser:');
for (const s of result.iceServers) {
  console.log(`    ${JSON.stringify(s.urls)}${s.username ? ' (with credentials)' : ''}`);
}
console.log('  candidate types gathered:', result.candidateTypes.join(', ') || 'none');
const relay = result.candidateTypes.includes('relay');
console.log(`  ${relay ? 'ok  ' : 'FAIL'} the browser allocated a TURN relay candidate`);
result.sample.forEach((c) => console.log('    ', c.slice(0, 90)));
await browser.close();
process.exit(relay ? 0 : 1);
