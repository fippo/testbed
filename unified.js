/* webrtc interop testing using using selenium
 * unified plan interop test
 * Copyright (c) 2018, Philipp Hancke
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
  .then(() => clientA.enumerateDevices())
  .then((devicesA) => {
    const videoDevices = devicesA.filter(d => d.kind === 'videoinput');
    t.ok(videoDevices.length === 2, 'has two video devices');
    return Promise.all([
      clientA.getUserMedia({audio: true, video: {deviceId: videoDevices[0].deviceId}}),
      clientA.getUserMedia({audio: false, video: {deviceId: videoDevices[1].deviceId}}),
    ])
  })
  .then((streams) => {
    t.pass('got user media');
    return Promise.all(streams.map(stream => stream.getTracks().forEach(t => clientA.addTrack(t, stream))));
  })
  .then(() => clientA.createOffer())
  .then(offer => {
    t.pass('created offer');
    return clientA.setLocalDescription(offer);
  })
  .then(offerWithCandidates => {
    t.pass('offer ready to signal');
    return clientB.setRemoteDescription(offerWithCandidates);
  })
  .then(() => clientB.createAnswer())
  .then(answer => {
    t.pass('created answer');
    return clientB.setLocalDescription(answer); // modify answer here?
  })
  .then(answerWithCandidates => {
    t.pass('answer ready to signal');
    return clientA.setRemoteDescription(answerWithCandidates);
  })
  .then(() => // wait for the iceConnectionState to become either connected/completed
  // or failed.
  clientA.waitForIceConnectionStateChange())
  .then(iceConnectionState => {
    t.ok(iceConnectionState !== 'failed', 'ICE connection is established');
  })
  .then(() => waitNVideosExist(driverB, 2))
  .then(() => waitAllVideosHaveEnoughData(driverB))
  .then(() => Promise.all([driverA.quit(), driverB.quit()]))
  .then(() => t.end())
  .then(() => maybeWaitForEdge(browserA, browserB))
  .catch(err => {
    t.fail(err);
  });
}

test('Firefox-Firefox', (t) => {
  video(t, 'firefox', 'firefox');
});

test('Edge-Firefox', {skip: os.platform() !== 'win32'}, t => {
  video(t, 'MicrosoftEdge', 'Firefox');
});

test('Edge-Firefox', {skip: os.platform() !== 'win32'}, t => {
  video(t, 'Firefox', 'MicrosoftEdge');
});
