/* webrtc interop testing using using selenium
 * Copyright (c) 2016, Philipp Hancke
 */

var test = require('tape');
var buildDriver = require('./webdriver').buildDriver;
var getTestpage = require('./webdriver').getTestpage;
var WebRTCClient = require('./webrtcclient');
var SDPUtils = require('sdp');

// add MSIDs the other party understands.
function mangle(sdp) {
  var mediaSections = SDPUtils.splitSections(sdp);
  for (var i = 1; i < mediaSections.length; i++) {
    var parts;
    var ssrclines = SDPUtils.matchPrefix(mediaSections[i], 'a=ssrc');
    var chromeMsid = ssrclines.filter(line => line.split(' ')[1].indexOf('msid:') === 0);
    var cnames = ssrclines.filter(line => line.split(' ')[1].indexOf('cname:') === 0);
    var specMsid = SDPUtils.matchPrefix(mediaSections[i], 'a=msid:');
    if (!specMsid.length && chromeMsid.length > 0) {
      parts = chromeMsid[0].split(' ');
      parts.shift();
      mediaSections[i] += 'a=' + parts.join(' ') + '\r\n';
    } else if (specMsid.length > 0 && cnames.length && !chromeMsid.length) {
      mediaSections[i] += cnames[0].split(' ', 1)[0] + ' ' +
          specMsid[0].substr(2) + '\r\n';
    }
  }
  return mediaSections.join('');
}

// we use addStream twice and pretend to be a single stream to
// work around FF bugs.
function replaceSecondStreamId(sdp) {
  var mediaSections = SDPUtils.splitSections(sdp);

  var firstMsid = SDPUtils.matchPrefix(mediaSections[1], 'a=msid:')[0]
      .split(' ')[0].substr(7);
  var secondMsid = SDPUtils.matchPrefix(mediaSections[2], 'a=msid:')[0]
      .split(' ')[0].substr(7);

  return sdp.replace(new RegExp(secondMsid, 'g'), firstMsid);
}

function upgrade(t, browserA, browserB) {
  var driverA = buildDriver(browserA);
  var driverB = buildDriver(browserB);

  var clientA = new WebRTCClient(driverA);
  var clientB = new WebRTCClient(driverB);

  getTestpage(driverA)
  .then(() => getTestpage(driverB))
  .then(() => clientA.create())
  .then(() => clientB.create())
  .then(() => clientA.getUserMedia({audio: true, video: false}))
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

    // mangle interoperable msids.
    offerWithCandidates.sdp = mangle(offerWithCandidates.sdp);

    return clientB.setRemoteDescription(offerWithCandidates);
  })
  .then(() => clientB.createAnswer())
  .then(answer => {
    t.pass('created answer');
    return clientB.setLocalDescription(answer); // modify answer here?
  })
  .then(answerWithCandidates => {
    t.pass('answer ready to signal');

    // mangle interoperable msids.
    answerWithCandidates.sdp = mangle(answerWithCandidates.sdp);

    return clientA.setRemoteDescription(answerWithCandidates);
  })
  .then(() => // wait for the iceConnectionState to become either connected/completed
  // or failed.
  clientA.waitForIceConnectionStateChange())
  .then(iceConnectionState => {
    t.ok(iceConnectionState !== 'failed', 'ICE connection is established');
  })
  .then(() => {
    driverA.sleep(3000);
    return clientA.getUserMedia({audio: false, video: true});
  })
  .then(() => {
    t.pass('got user media');
    return clientA.addStream();
  })
  .then(() => clientA.createOffer())
  .then(offer => {
    t.pass('created offer');
    return clientA.setLocalDescription(offer);
  })
  .then(offerWithCandidates => {
    t.pass('offer ready to signal');

    // mangle interoperable msids.
    offerWithCandidates.sdp = mangle(offerWithCandidates.sdp);

    // we mangle it so it looks like adding to the stream at B.
    offerWithCandidates.sdp = replaceSecondStreamId(offerWithCandidates.sdp);

    return clientB.setRemoteDescription(offerWithCandidates);
  })
  .then(() => clientB.createAnswer())
  .then(answer => {
    t.pass('created answer');
    return clientB.setLocalDescription(answer); // modify answer here?
  })
  .then(answerWithCandidates => {
    t.pass('answer ready to signal');

    // mangle interoperable msids.
    answerWithCandidates.sdp = mangle(answerWithCandidates.sdp);

    return clientA.setRemoteDescription(answerWithCandidates);
  })
  .then(() => {
    driverA.sleep(3000);
  })
  .then(() => Promise.all([driverA.quit(), driverB.quit()])
  .then(() => {
    t.end();
  }))
  .catch(err => {
    t.fail(err);
  });
}

test('Chrome-Chrome', t => {
  upgrade(t, 'chrome', 'chrome');
});

test('Firefox-Firefox', t => {
  upgrade(t, 'firefox', 'firefox');
});

test('Chrome-Firefox', t => {
  upgrade(t, 'chrome', 'firefox');
});

test('Firefox-Chrome', t => {
  upgrade(t, 'firefox', 'chrome');
});
