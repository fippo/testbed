/* webrtc interop testing using using selenium
 * Copyright (c) 2016, Philipp Hancke
 */

var os = require('os');
var test = require('tape');
var buildDriver = require('./webdriver').buildDriver;
var getTestpage = require('./webdriver').getTestpage;
var WebRTCClient = require('./webrtcclient');
var SDPUtils = require('sdp');

const TIMEOUT = 30000;
function waitNVideosExist(driver, n) {
    return driver.wait(() => driver.executeScript(n => document.querySelectorAll('video').length === n, n), TIMEOUT);
}

function waitAllVideosHaveEnoughData(driver) {
    return driver.wait(() => driver.executeScript(() => {
        var videos = document.querySelectorAll('video');
        var ready = 0;
        for (var i = 0; i < videos.length; i++) {
            if (videos[i].readyState >= videos[i].HAVE_ENOUGH_DATA) {
                ready++;
            }
        }
        return ready === videos.length;
    }), TIMEOUT);
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

function video(t, browserA, browserB) {
  var driverA = buildDriver(browserA, {h264: true});
  var driverB = buildDriver(browserB, {h264: true});

  var clientA = new WebRTCClient(driverA);
  var clientB = new WebRTCClient(driverB);

  getTestpage(driverA)
  .then(() => getTestpage(driverB))
  .then(() => clientA.create())
  .then(() => clientB.create())
  .then(() => clientA.getUserMedia({audio: true, video: true}))
  .then((stream) => {
    t.pass('got user media');
    return clientA.addStream(stream);
  })
  .then(() => clientA.createOffer())
  .then(offer => {
    t.pass('created offer');
    return clientA.setLocalDescription(offer);
  })
  .then(offerWithCandidates => {
    t.pass('offer ready to signal');
    offerWithCandidates.sdp = offerWithCandidates.sdp.replace(/^a=ssrc:.*$\r\n/gm, '');
    offerWithCandidates.sdp = offerWithCandidates.sdp.replace(/^a=msid-semantic: WMS.*$\r\n/gm, '');
    offerWithCandidates.sdp = offerWithCandidates.sdp.replace(/^a=msid.*$\r\n/gm, '');
    return clientB.setRemoteDescription(offerWithCandidates);
  })
  .then(() => clientB.createAnswer())
  .then(answer => {
    t.pass('created answer');
    return clientB.setLocalDescription(answer); // modify answer here?
  })
  .then(answerWithCandidates => {
    t.pass('answer ready to signal');
    answerWithCandidates.sdp = answerWithCandidates.sdp.replace(/^a=ssrc:.*$\r\n/gm, '');
    answerWithCandidates.sdp = answerWithCandidates.sdp.replace(/^a=msid-semantic: WMS.*$\r\n/gm, '');
    answerWithCandidates.sdp = answerWithCandidates.sdp.replace(/^a=msid.*$\r\n/gm, '');
    return clientA.setRemoteDescription(answerWithCandidates);
  })
  .then(() => // wait for the iceConnectionState to become either connected/completed
  // or failed.
  clientA.waitForIceConnectionStateChange())
  .then(iceConnectionState => {
    t.ok(iceConnectionState !== 'failed', 'ICE connection is established');
  })
  /*
   * here is where the fun starts. getStats etc
   * or simply checking the readyState of all videos...
   */
  .then(() => waitNVideosExist(driverB, 1))
  .then(() => waitAllVideosHaveEnoughData(driverB))
  .then(() => Promise.all([driverA.quit(), driverB.quit()])
  .then(() => {
    t.end();
  }))
  .then(() => maybeWaitForEdge(browserA, browserB))
  .catch(err => {
    t.fail(err);
  });
}

test('Chrome-Chrome', t => {
  video(t, 'chrome', 'chrome');
});

test('Chrome-Firefox', t => {
  video(t, 'chrome', 'firefox');
});

test('Firefox-Firefox', t => {
  video(t, 'firefox', 'firefox');
});

test('Firefox-Chrome', t => {
  video(t, 'firefox', 'chrome');
});

test('Edge-Chrome', {skip: os.platform() !== 'win32'}, t => {
  video(t, 'MicrosoftEdge', 'chrome');
});

test('Chrome-Edge', {skip: os.platform() !== 'win32'}, t => {
  video(t, 'chrome', 'MicrosoftEdge');
});

test('Edge-Firefox', {skip: os.platform() !== 'win32'}, t => {
  video(t, 'MicrosoftEdge', 'firefox');
});

test('Firefox-Edge', {skip: os.platform() !== 'win32'}, t => {
  video(t, 'firefox', 'MicrosoftEdge');
});
