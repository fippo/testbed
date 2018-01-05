/* webrtc interop testing using using selenium 
 * Copyright (c) 2016, Philipp Hancke
 */

var os = require('os');
var test = require('tape');
var buildDriver = require('./webdriver').buildDriver;
var WebRTCClient = require('./webrtcclient');

function dtls(t, browserA, browserB, preferredAudioCodec) {
  var driverA = buildDriver(browserA);
  var driverB = buildDriver(browserB);

  var clientA = new WebRTCClient(driverA);
  var clientB = new WebRTCClient(driverB);

  // static page with adapter shim
  driverA.get('https://fippo.github.io/adapter/testpage.html')
  .then(() => driverB.get('https://fippo.github.io/adapter/testpage.html'))
  .then(() => clientA.create(null, {
    name: 'ECDSA',
    namedCurve: 'P-256'
  }))
  .then(() => clientB.create(null, {
    name: 'ECDSA',
    namedCurve: 'P-256'
  }))
  .then(() => clientA.getUserMedia({audio: true}))
  .then((stream) => {
    t.pass('got user media');
    return clientA.addStream(stream);
  })
  .then(() => clientA.createOffer())
  .then(offer => {
    t.pass('created offer');
    return clientA.setLocalDescription(offer); // modify offer here?
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
  /*
   * here is where the fun starts. getStats etc
   */
  .then(() => {
    if (browserA !== 'MicrosoftEdge') {
      return clientA.getStats();
    } else {
      return clientB.getStats();
    }
  })
  .then(stats => {
    console.log(stats);
  })
  .then(() => Promise.all([driverA.quit(), driverB.quit()])
  .then(() => {
    t.end();
  }))
  .catch(err => {
    t.fail(err);
  });
}

test('Chrome-Edge', {skip: os.platform() !== 'win32'}, t => {
  dtls(t, 'chrome', 'MicrosoftEdge');
});

test('Chrome-Firefox', t => {
  dtls(t, 'chrome', 'firefox');
});

test('Firefox-Chrome', t => {
  dtls(t, 'firefox', 'chrome');
});

test('Edge-Chrome', {skip: os.platform() !== 'win32'}, t => {
  dtls(t, 'MicrosoftEdge', 'chrome');
});
