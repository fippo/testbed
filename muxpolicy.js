/* webrtc interop testing using using selenium
 * Copyright (c) 2016, Philipp Hancke
 */

const os = require('os');
const test = require('tape');
const buildDriver = require('./webdriver').buildDriver;
const getTestpage = require('./webdriver').getTestpage;
const WebRTCClient = require('./webrtcclient');
const SDPUtils = require('sdp');

const TIMEOUT = 30000;
function waitNVideosExist(driver, n) {
    return driver.wait(() => {
        return driver.executeScript(n => document.querySelectorAll('video').length === n, n);
    }, TIMEOUT);
}

function waitAllVideosHaveEnoughData(driver) {
    return driver.wait(() => {
        return driver.executeScript(() => {
            var videos = document.querySelectorAll('video');
            var ready = 0;
            for (var i = 0; i < videos.length; i++) {
                if (videos[i].readyState >= videos[i].HAVE_ENOUGH_DATA) {
                    ready++;
                }
            }
            return ready === videos.length;
        });
    }, TIMEOUT);
}

// Edge Webdriver resolves quit slightly too early, wait a bit.
function maybeWaitForEdge(browserA, browserB) {
    if (browserA === 'MicrosoftEdge' || browserB === 'MicrosoftEdge') {
        return new Promise(resolve => {
            setTimeout(resolve, 2000);
        });
    }
    return Promise.resolve();
}

function video(t, browserA, browserB, rtcpMuxPolicy) {
  const driverA = buildDriver(browserA);
  const driverB = buildDriver(browserB);

  const clientA = new WebRTCClient(driverA);
  const clientB = new WebRTCClient(driverB);

  return Promise.all([getTestpage(driverA), getTestpage(driverB)])
  .then(() => Promise.all([clientA.create({rtcpMuxPolicy}), clientB.create({rtcpMuxPolicy})]))
  .then(() => {
    return clientA.getUserMedia({audio: true, video: true});
  })
  .then((stream) => {
    t.pass('got user media');
    return clientA.addStream(stream);
  })
  .then(() => {
    return clientA.createOffer();
  })
  .then(offer => {
    t.pass('created offer');
    return clientA.setLocalDescription(offer);
  })
  .then(offerWithCandidates => {
    t.pass('offer ready to signal');
    // TODO: assert no candidates with component=2 when using require.
    return clientB.setRemoteDescription(offerWithCandidates);
  })
  .then(() => {
    return clientB.createAnswer();
  })
  .then(answer => {
    t.pass('created answer');
    return clientB.setLocalDescription(answer); // modify answer here?
  })
  .then(answerWithCandidates => {
    t.pass('answer ready to signal');
    return clientA.setRemoteDescription(answerWithCandidates);
  })
  .then(() => {
    // wait for the iceConnectionState to become either connected/completed
    // or failed.
    return clientA.waitForIceConnectionStateChange();
  })
  .then(iceConnectionState => {
    t.ok(iceConnectionState !== 'failed', 'ICE connection is established');
  })
  /*
   * here is where the fun starts. getStats etc
   * or simply checking the readyState of all videos...
   */
  .then(() => {
    return waitNVideosExist(driverB, 1);
  })
  .then(() => {
    return waitAllVideosHaveEnoughData(driverB);
  })
  .then(() => {
    return Promise.all([driverA.quit(), driverB.quit()])
    .then(() => {
      t.end();
    });
  })
  .then(() => {
    return maybeWaitForEdge(browserA, browserB);
  })
  .catch(err => {
    t.fail(err);
  });
}

test('Chrome-Chrome, rtcpMuxPolicy negotiate', (t) => {
  video(t, 'chrome', 'chrome', 'negotiate');
});

test('Chrome-Chrome, rtcpMuxPolicy require', (t) => {
  video(t, 'chrome', 'chrome', 'require');
});
