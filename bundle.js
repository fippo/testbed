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

function video(t, browserA, browserB, bundlePolicy) {
  const driverA = buildDriver(browserA);
  const driverB = buildDriver(browserB);

  const clientA = new WebRTCClient(driverA);
  const clientB = new WebRTCClient(driverB);

  return Promise.all([getTestpage(driverA), getTestpage(driverB)])
  .then(() => Promise.all([clientA.create({bundlePolicy}), clientB.create({bundlePolicy})]))
  .then(() => {
    return clientA.getUserMedia({audio: false, video: true});
  })
  .then((stream) => {
    t.pass('got user media');
    return clientA.addStream(stream);
  })
  .then(() => {
    return clientA.createOffer({offerToReceiveAudio: true});
  })
  .then(offer => {
    t.pass('created offer');
    return clientA.setLocalDescription(offer);
  })
  .then(offerWithCandidates => {
    t.pass('offer ready to signal');
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

test('Chrome-Firefox, max-bundle fail', (t) => {
  video(t, 'chrome', 'firefox', 'max-bundle');
});
