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
  const drivers = [driverA, driverB];

  var clientA = new WebRTCClient(driverA);
  var clientB = new WebRTCClient(driverB);
  const clients = [clientA, clientB];

  return Promise.all(drivers.map((driver) => getTestpage(driver)))
  .then(() => Promise.all(clients.map((client) => client.create({sdpSemantics: 'unified-plan'}))))
  .then(() => clientA.enumerateDevices())
  .then((devicesA) => {
    const videoDevices = devicesA.filter(d => d.kind === 'videoinput');
    t.ok(videoDevices.length === 2, 'has two video devices');
    return Promise.all([
      clientA.getUserMedia({audio: true, video: {deviceId: videoDevices[0].deviceId}}),
      clientA.getUserMedia({audio: false, video: videoDevices[1] ? {deviceId: videoDevices[1].deviceId} : true}),
    ])
  })
  .then((streams) => Promise.all(streams.map(stream => Promise.all(stream.getTracks().map(t => clientA.addTrack(t, stream))))))
  .then(() => clientA.createOffer())
  .then((offer) => {
    const sections = SDPUtils.splitSections(offer.sdp);
    t.ok(sections.length === 4, 'offer contains a session part and three mediaSections');
    t.ok(SDPUtils.getKind(sections[1]) === 'audio', 'first mediaSection is audio');
    t.ok(SDPUtils.getKind(sections[2]) === 'video', 'second mediaSection is video');
    t.ok(SDPUtils.getKind(sections[3]) === 'video', 'third mediaSection is video');

    return clientA.setLocalDescription(offer);
  })
  .then(offerWithCandidates => clientB.setRemoteDescription(offerWithCandidates))
  .then(() => clientB.createAnswer())
  .then(answer => {
    const sections = SDPUtils.splitSections(answer.sdp);
    t.ok(sections.length === 4, 'answer contains a session part and three mediaSections');
    t.ok(SDPUtils.getKind(sections[1]) === 'audio', 'first mediaSection is audio');
    t.ok(SDPUtils.getKind(sections[2]) === 'video', 'second mediaSection is video');
    t.ok(SDPUtils.getKind(sections[3]) === 'video', 'third mediaSection is video');
    return clientB.setLocalDescription(answer);
  })
  .then(answerWithCandidates => clientA.setRemoteDescription(answerWithCandidates))
  .then(() => clientA.waitForIceConnectionStateChange())
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

test('Chrome-Firefox', t => {
  video(t, 'chrome', 'firefox');
});

test('Firefox-Chrome', t => {
  video(t, 'chrome', 'firefox');
});
