/* webrtc interop testing using using selenium 
 * Copyright (c) 2016, Philipp Hancke
 */

var os = require('os');
var test = require('tape');
var buildDriver = require('./webdriver').buildDriver;
var getTestpage = require('./webdriver').getTestpage;
var WebRTCClient = require('./webrtcclient');

function interop(t, browserA, browserB, preferredAudioCodec) {
  var driverA = buildDriver(browserA);
  var driverB = buildDriver(browserB);

  var clientA = new WebRTCClient(driverA);
  var clientB = new WebRTCClient(driverB);

  getTestpage(driverA)
  .then(() => getTestpage(driverB))
  .then(() => clientA.create())
  .then(() => clientB.create())
  .then(() => clientA.createDataChannel('somechannel'))
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
  .then(() => Promise.all([driverA.quit(), driverB.quit()])
  .then(() => {
    t.end();
  }))
  .catch(err => {
    t.fail(err);
  });
}

test('Chrome-Firefox', t => {
  interop(t, 'chrome', 'firefox');
});

test('Firefox-Chrome', t => {
  interop(t, 'firefox', 'chrome');
});
