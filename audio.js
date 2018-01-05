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
  .then(() => clientA.getUserMedia({audio: true}))
  .then((stream) => {
    t.pass('got user media');
    return clientA.addStream(stream);
  })
  .then(() => clientA.createOffer())
  .then(offer => {
    t.pass('created offer');

    if (preferredAudioCodec) {
      var sections = SDPUtils.splitSections(offer.sdp);
      var codecs = SDPUtils.parseRtpParameters(sections[1]).codecs;
      var pt;
      for (var i = 0; i < codecs.length; i++) {
        if (codecs[i].name === preferredAudioCodec) {
          pt = codecs[i].payloadType;
          var lines = sections[1].split('\r\n');
          mLine = lines.shift().split(' ');
          // remove PT from current pos.
          mLine.splice(mLine.indexOf(pt.toString()), 1);
          mLine.splice(3, 0, pt); // insert at first pos.
          mLine = mLine.join(' ');
          lines.unshift(mLine);
          sections[1] = lines.join('\r\n');
          offer.sdp = sections.join('');
          break;
        }
      }
      t.ok(pt !== undefined, 'preferred audio codec ' + preferredAudioCodec +
          ' with PT ' + pt);
    }
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
  .then(() => clientA.getStats())
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
  interop(t, 'chrome', 'MicrosoftEdge');
});

test('Edge-Chrome', {skip: os.platform() !== 'win32'}, t => {
  interop(t, 'MicrosoftEdge', 'chrome');
});

test('Firefox-Edge', {skip: os.platform() !== 'win32'}, t => {
  interop(t, 'firefox', 'MicrosoftEdge');
});

test('Edge-Firefox', {skip: os.platform() !== 'win32'}, t => {
  interop(t, 'MicrosoftEdge', 'firefox');
});

test('Chrome-Firefox', t => {
  interop(t, 'chrome', 'firefox');
});

test('Firefox-Chrome', t => {
  interop(t, 'firefox', 'chrome');
});
