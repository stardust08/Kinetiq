/**
 * A real two-browser consultation, with real WebRTC media flowing.
 *
 * This is the one thing the rest of the test suite cannot do. The unit tests drive the
 * WebRTC hook against doubles; jsdom has no RTCPeerConnection at all. So the parts that
 * only a browser can prove - that an offer and answer actually negotiate, that ICE finds
 * a path, that video frames arrive at the far end - were unverified until this existed.
 *
 * Two independent Chrome contexts, each with a synthetic camera, joining the same
 * consultation. It asserts on `RTCPeerConnection.getStats()` rather than on pixels:
 * `framesDecoded` climbing on the inbound video track is the browser itself reporting
 * that it decoded real frames sent by the other browser.
 *
 * Chrome is driven with:
 *   --use-fake-device-for-media-capture  synthetic camera, so no hardware is needed
 *   --use-fake-ui-for-media-stream       auto-grants permission, so no prompt blocks us
 *
 * Usage (both servers must already be running):
 *   node e2e/browser-consultation.mjs \
 *     --api http://127.0.0.1:8899 --web http://127.0.0.1:5199 \
 *     --clinician-token X --patient-token Y --booking-id Z
 *
 * Exits 0 if every check passed.
 */

import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, value, index, all) => {
    if (value.startsWith('--')) acc.push([value.slice(2), all[index + 1]]);
    return acc;
  }, []),
);

const API = args.api ?? 'http://127.0.0.1:8899';
const WEB = args.web ?? 'http://127.0.0.1:5199';
const CLINICIAN_TOKEN = args['clinician-token'];
const PATIENT_TOKEN = args['patient-token'];
const BOOKING_ID = args['booking-id'];
const CLINICIAN_ID = args['clinician-id'];
const PATIENT_ID = args['patient-id'];

if (!CLINICIAN_TOKEN || !PATIENT_TOKEN || !BOOKING_ID) {
  console.error('missing --clinician-token / --patient-token / --booking-id');
  process.exit(1);
}

const failures = [];
const check = (ok, description, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${description}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(description);
};

/**
 * Replace getUserMedia with a canvas-backed stream.
 *
 * Chrome's `--use-fake-device-for-media-capture` does not work on this machine:
 * getUserMedia never settles - it neither resolves nor rejects - because macOS gates
 * camera access for the Playwright-launched Chrome at the OS level, below the flag. A
 * hanging promise is worse than a rejection and it is what exposed the missing timeout
 * in useVideoCall.
 *
 * So the camera is replaced with a canvas that is actively drawn to, captured at 15fps.
 * Those are real MediaStreamTracks: they are encoded, sent as RTP, and decoded at the
 * far end, so `framesDecoded` climbing still proves the negotiation, the ICE path and
 * the media pipeline. What it does NOT prove is camera acquisition itself - that is
 * covered by the hook's unit tests and by the new media timeout.
 */
const FAKE_MEDIA = () => {
  const makeStream = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    let frame = 0;
    // The canvas must actually change, or the encoder has nothing to send and
    // framesDecoded never moves at the far end.
    const draw = () => {
      frame += 1;
      ctx.fillStyle = `hsl(${(frame * 7) % 360}, 80%, 50%)`;
      ctx.fillRect(0, 0, 320, 240);
      ctx.fillStyle = '#000';
      ctx.font = '28px sans-serif';
      ctx.fillText(String(frame), 20, 130);
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);

    const stream = canvas.captureStream(15);
    try {
      const audio = new AudioContext();
      const destination = audio.createMediaStreamDestination();
      const oscillator = audio.createOscillator();
      oscillator.frequency.value = 220;
      oscillator.connect(destination);
      oscillator.start();
      destination.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    } catch {
      /* video alone is enough for this test */
    }
    return stream;
  };

  navigator.mediaDevices.getUserMedia = async () => makeStream();
  navigator.mediaDevices.getDisplayMedia = async () => makeStream();
};

/** Seed the auth store the way a completed OTP login would, then load the app. */
async function signIn(context, { token, user }) {
  const page = await context.newPage();
  // The store must exist before the app's first render, so it is written on the origin
  // with an init script rather than after navigation.
  await page.addInitScript(
    ([t, u]) => {
      localStorage.setItem('auth_token', t);
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: { user: u, token: t, isAuthenticated: true },
          version: 0,
        }),
      );
    },
    [token, user],
  );
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const text = message.text();
      // React's dev-mode noise is not what this test is about.
      if (!/Download the React DevTools|Future Flag/i.test(text)) {
        console.log(`    [${user.role} console] ${text.slice(0, 200)}`);
      }
    }
  });
  page.on('pageerror', (error) => {
    console.log(`    [${user.role} pageerror] ${String(error).slice(0, 300)}`);
    failures.push(`${user.role} page threw: ${String(error).slice(0, 120)}`);
  });
  return page;
}

/**
 * Read WebRTC stats out of the page.
 *
 * The hook keeps its RTCPeerConnections in a ref, so they are not reachable from the
 * test. Instead RTCPeerConnection is wrapped on the window before the app loads, and
 * every instance it creates is collected. That is the only way to inspect the real
 * connections the application built, rather than ones the test built itself.
 */
const COLLECT_PEERS = () => {
  const Original = window.RTCPeerConnection;
  window.__peers = [];
  window.RTCPeerConnection = function (...a) {
    const pc = new Original(...a);
    window.__peers.push(pc);
    return pc;
  };
  window.RTCPeerConnection.prototype = Original.prototype;
  Object.assign(window.RTCPeerConnection, Original);
};

async function peerReport(page) {
  return page.evaluate(async () => {
    const peers = window.__peers ?? [];
    const out = [];
    for (const pc of peers) {
      const entry = {
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        hasLocalDescription: Boolean(pc.localDescription),
        hasRemoteDescription: Boolean(pc.remoteDescription),
        framesDecoded: 0,
        bytesReceived: 0,
        framesSent: 0,
        selectedCandidatePair: null,
      };
      try {
        const stats = await pc.getStats();
        stats.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            entry.framesDecoded = report.framesDecoded ?? 0;
            entry.bytesReceived = report.bytesReceived ?? 0;
          }
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            entry.framesSent = report.framesSent ?? 0;
          }
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            entry.selectedCandidatePair = `${report.localCandidateId}->${report.remoteCandidateId}`;
          }
        });
      } catch {
        /* a connection still forming has no stats yet */
      }
      out.push(entry);
    }
    return out;
  });
}

const waitFor = async (fn, { timeout = 30000, interval = 500, label = 'condition' } = {}) => {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`timed out waiting for ${label}`);
};

const main = async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      // A synthetic camera and microphone, so no hardware and no prompt.
      '--use-fake-device-for-media-capture',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--allow-running-insecure-content',
    ],
  });

  try {
    const clinicianContext = await browser.newContext({
      permissions: ['camera', 'microphone'],
      ignoreHTTPSErrors: true,
    });
    const patientContext = await browser.newContext({
      permissions: ['camera', 'microphone'],
      ignoreHTTPSErrors: true,
    });
    await clinicianContext.addInitScript(COLLECT_PEERS);
    await patientContext.addInitScript(COLLECT_PEERS);
    await clinicianContext.addInitScript(FAKE_MEDIA);
    await patientContext.addInitScript(FAKE_MEDIA);

    const clinicianPage = await signIn(clinicianContext, {
      token: CLINICIAN_TOKEN,
      user: {
        id: CLINICIAN_ID,
        name: 'Dr Reed',
        phone: '+910000000001',
        role: 'CLINICIAN',
        status: 'ACTIVE',
        sessionCount: 0,
        createdAt: new Date(0).toISOString(),
      },
    });
    const patientPage = await signIn(patientContext, {
      token: PATIENT_TOKEN,
      user: {
        id: PATIENT_ID,
        name: 'Sam Patient',
        phone: '+910000000002',
        role: 'USER',
        status: 'ACTIVE',
        sessionCount: 0,
        createdAt: new Date(0).toISOString(),
      },
    });

    console.log('\n=== 1. role-based routing in a real browser ===');
    // Awaited, not read immediately: the redirect is client-side, so the URL only
    // changes once React has mounted and <Navigate> has run.
    await clinicianPage.goto(`${WEB}/dashboard`);
    const clinicianRouted = await clinicianPage
      .waitForURL(/\/clinician/, { timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    check(
      clinicianRouted,
      'a clinician landing on /dashboard is sent to the clinician area',
      clinicianPage.url().replace(WEB, ''),
    );
    check(
      await clinicianPage.getByRole('heading', { name: 'Your clinic' }).isVisible(),
      'the clinician dashboard renders',
    );

    await patientPage.goto(`${WEB}/admin`);
    const patientBounced = await patientPage
      .waitForURL((url) => !url.pathname.startsWith('/admin'), { timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    check(
      patientBounced,
      'a patient following a link to /admin is redirected away',
      patientPage.url().replace(WEB, ''),
    );

    console.log('\n=== 2. the clinician opens the consultation ===');
    await clinicianPage.goto(`${WEB}/consultation/booking/${BOOKING_ID}`, {
      waitUntil: 'domcontentloaded',
    });
    await clinicianPage.waitForSelector('video', { timeout: 30000 });
    check(true, 'the consultation page mounted and a video element is present');

    const gotCamera = await clinicianPage.evaluate(async () => {
      const video = document.querySelector('video');
      for (let i = 0; i < 40; i += 1) {
        if (video?.srcObject && video.srcObject.getVideoTracks().length > 0) return true;
        await new Promise((r) => setTimeout(r, 250));
      }
      return false;
    });
    check(gotCamera, 'the clinician’s synthetic camera is attached to a tile');

    console.log('\n=== 3. the patient joins the same consultation ===');
    await patientPage.goto(`${WEB}/consultation/booking/${BOOKING_ID}`, {
      waitUntil: 'domcontentloaded',
    });
    await patientPage.waitForSelector('video', { timeout: 30000 });
    check(true, 'the patient page mounted');

    console.log('\n=== 4. WebRTC actually negotiates ===');
    const negotiated = await waitFor(
      async () => {
        const [clin, pat] = await Promise.all([
          peerReport(clinicianPage),
          peerReport(patientPage),
        ]);
        const connected = (report) =>
          report.some(
            (p) => p.connectionState === 'connected' || p.iceConnectionState === 'connected',
          );
        return connected(clin) && connected(pat) ? { clin, pat } : null;
      },
      { timeout: 45000, label: 'both peers to report connected' },
    ).catch(() => null);

    if (!negotiated) {
      const [clin, pat] = await Promise.all([
        peerReport(clinicianPage),
        peerReport(patientPage),
      ]);
      console.log('    clinician peers:', JSON.stringify(clin));
      console.log('    patient peers:  ', JSON.stringify(pat));
      check(false, 'both peers reach a connected ICE state');
    } else {
      check(true, 'both peers reach a connected ICE state');
      check(
        negotiated.clin.some((p) => p.hasLocalDescription && p.hasRemoteDescription),
        'the clinician exchanged both a local and a remote description',
      );
      check(
        negotiated.pat.some((p) => p.hasLocalDescription && p.hasRemoteDescription),
        'the patient exchanged both a local and a remote description',
      );
      check(
        negotiated.clin.some((p) => p.selectedCandidatePair) ||
          negotiated.pat.some((p) => p.selectedCandidatePair),
        'ICE selected a candidate pair',
      );
    }

    console.log('\n=== 5. real video frames cross between the two browsers ===');
    const flowing = await waitFor(
      async () => {
        const [clin, pat] = await Promise.all([
          peerReport(clinicianPage),
          peerReport(patientPage),
        ]);
        const decoded = (report) => Math.max(0, ...report.map((p) => p.framesDecoded));
        const sent = (report) => Math.max(0, ...report.map((p) => p.framesSent));
        const result = {
          clinicianDecoded: decoded(clin),
          patientDecoded: decoded(pat),
          clinicianSent: sent(clin),
          patientSent: sent(pat),
        };
        return result.clinicianDecoded > 0 && result.patientDecoded > 0 ? result : null;
      },
      { timeout: 45000, label: 'video frames to be decoded at both ends' },
    ).catch(() => null);

    if (flowing) {
      check(
        flowing.clinicianDecoded > 0,
        'the clinician decoded video frames sent by the patient',
        `${flowing.clinicianDecoded} frames`,
      );
      check(
        flowing.patientDecoded > 0,
        'the patient decoded video frames sent by the clinician',
        `${flowing.patientDecoded} frames`,
      );
      check(
        flowing.clinicianSent > 0 && flowing.patientSent > 0,
        'both browsers are sending video',
        `clinician sent ${flowing.clinicianSent}, patient sent ${flowing.patientSent}`,
      );
    } else {
      const [clin, pat] = await Promise.all([
        peerReport(clinicianPage),
        peerReport(patientPage),
      ]);
      console.log('    clinician:', JSON.stringify(clin));
      console.log('    patient:  ', JSON.stringify(pat));
      check(false, 'video frames are decoded at both ends');
    }

    console.log('\n=== 6. the screening gate, in the browser ===');
    const patientBodyBefore = await patientPage.textContent('body');
    check(
      /clinician will (start|unlock)|not be able to start|your clinician/i.test(
        patientBodyBefore ?? '',
      ),
      'before unlocking, the patient is told their clinician starts the screening',
    );
    check(
      !/Begin (posture|walking|joint range) screening/i.test(patientBodyBefore ?? ''),
      'the patient has no Begin button before the clinician unlocks one',
    );

    const launcher = clinicianPage.getByRole('button', { name: /^Posture/ });
    const launcherVisible = await launcher.isVisible().catch(() => false);
    check(launcherVisible, 'the clinician sees the screening launcher');

    if (launcherVisible) {
      await launcher.click();
      const beginAppeared = await patientPage
        .getByRole('button', { name: /Begin posture screening/i })
        .waitFor({ state: 'visible', timeout: 20000 })
        .then(() => true)
        .catch(() => false);
      check(
        beginAppeared,
        'unlocking pushes the authorisation to the patient over the socket',
      );

      if (beginAppeared) {
        await patientPage
          .getByRole('button', { name: /Begin posture screening/i })
          .click();
        const reachedCapture = await patientPage
          .waitForURL(/posture-analysis/, { timeout: 20000 })
          .then(() => true)
          .catch(() => false);
        check(reachedCapture, 'the patient is taken to the capture page');
        if (reachedCapture) {
          const banner = await patientPage.textContent('body');
          check(
            /clinician started this screening/i.test(banner ?? ''),
            'the capture page shows that the clinician is supervising',
          );
        }
      }
    }
  } finally {
    await browser.close();
  }

  console.log('');
  if (failures.length) {
    console.log(`${failures.length} check(s) failed:`);
    failures.forEach((f) => console.log(`  - ${f}`));
    return 1;
  }
  console.log('every browser check passed');
  return 0;
};

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error('harness error:', error);
    process.exit(1);
  },
);
