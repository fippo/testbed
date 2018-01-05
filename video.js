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

function video(t, browserA, browserB, preferredVideoCodec) {
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

    var sections = SDPUtils.splitSections(offer.sdp);
    var codecs = SDPUtils.parseRtpParameters(sections[2]).codecs;
    var pt;
    for (var i = 0; i < codecs.length; i++) {
      if (codecs[i].name === preferredVideoCodec) {
        pt = codecs[i].payloadType;
        var lines = sections[2].split('\r\n');
        mLine = lines.shift().split(' ');
        // remove PT from current pos.
        mLine.splice(mLine.indexOf(pt.toString()), 1);
        mLine.splice(3, 0, pt); // insert at first pos.
        mLine = mLine.join(' ');
        lines.unshift(mLine);
        sections[2] = lines.join('\r\n');
        offer.sdp = sections.join('');
        break;
      }
    }
    t.ok(pt !== undefined, 'preferred video codec ' + preferredVideoCodec +
        ' with PT ' + pt);

    return clientA.setLocalDescription(offer);
  })
  .then(offerWithCandidates => {
    t.pass('offer ready to signal');

    // this was fixed into Chrome 51 with https://bugs.chromium.org/p/chromium/issues/detail?id=591971
    if (offerWithCandidates.sdp.indexOf('a=rtpmap:107 H264') !== -1 &&
        offerWithCandidates.sdp.indexOf('a=fmtp:107') === -1) {
      var sections = SDPUtils.splitSections(offerWithCandidates.sdp);
      var lines = SDPUtils.splitLines(sections[2]);
      var idx = lines.indexOf('a=rtpmap:107 H264/90000');
      lines.splice(idx + 1, 0, 'a=fmtp:107 profile-level-id=42e01f;level-asymmetry-allowed=1;packetization-mode=1');
      sections[2] = lines.join('\r\n');
      offerWithCandidates.sdp = sections.join('') + '\r\n';
    }

    return clientB.setRemoteDescription(offerWithCandidates);
  })
  .then(() => clientB.createAnswer())
  .then(answer => {
    t.pass('created answer');
    return clientB.setLocalDescription(answer); // modify answer here?
  })
  .then(answerWithCandidates => {
    t.pass('answer ready to signal');

    // this was fixed into Chrome 51 with https://bugs.chromium.org/p/chromium/issues/detail?id=591971
    if (answerWithCandidates.sdp.indexOf('a=rtpmap:126 H264') !== -1 &&
        answerWithCandidates.sdp.indexOf('a=fmtp:126') === -1) {
      var sections = SDPUtils.splitSections(answerWithCandidates.sdp);
      var lines = SDPUtils.splitLines(sections[2]);
      var idx = lines.indexOf('a=rtpmap:126 H264/90000');
      lines.splice(idx + 1, 0, 'a=fmtp:126 profile-level-id=42e01f;level-asymmetry-allowed=1;packetization-mode=1');
      sections[2] = lines.join('\r\n');
      answerWithCandidates.sdp = sections.join('') + '\r\n';
    }

    if (preferredVideoCodec) {
      var sections = SDPUtils.splitSections(answerWithCandidates.sdp);
      var codecs = SDPUtils.parseRtpParameters(sections[2]).codecs;
      t.ok(codecs[0].name === preferredVideoCodec, 'preferredVideoCodec is used');
    }

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

test('Chrome-Chrome, VP8', t => {
  video(t, 'chrome', 'chrome', 'VP8');
});

test('Chrome-Firefox, VP8', t => {
  video(t, 'chrome', 'firefox', 'VP8');
});

test('Firefox-Firefox, VP8', t => {
  video(t, 'firefox', 'firefox', 'VP8');
});

test('Firefox-Chrome, VP8', t => {
  video(t, 'firefox', 'chrome', 'VP8');
});

test('Chrome-Chrome, VP9', t => {
  video(t, 'chrome', 'chrome', 'VP9');
});

test('Firefox-Firefox, VP9', t => {
  video(t, 'firefox', 'firefox', 'VP9');
});

test('Firefox-Chrome, VP9', t => {
  video(t, 'firefox', 'chrome', 'VP9');
});

test('Chrome-Firefox, VP9', t => {
  video(t, 'chrome', 'firefox', 'VP9');
});

// H264 interop requires Chrome 50+ and a Firefox
// profile pre-seeded with the right binary,
test('Chrome-Chrome, H264', t => {
  video(t, 'chrome', 'chrome', 'H264');
});

test('Firefox-Firefox, H264', t => {
  video(t, 'firefox', 'firefox', 'H264');
});

test('Chrome-Firefox, H264', t => {
  video(t, 'chrome', 'firefox', 'H264');
});

test('Firefox-Chrome, H264', t => {
  video(t, 'firefox', 'chrome', 'H264');
});

test('Edge-Chrome', {skip: os.platform() !== 'win32'}, t => {
  video(t, 'MicrosoftEdge', 'chrome', 'H264');
});

test('Chrome-Edge', {skip: os.platform() !== 'win32'}, t => {
  video(t, 'chrome', 'MicrosoftEdge', 'H264');
});

test('Edge-Firefox', {skip: os.platform() !== 'win32'}, t => {
  video(t, 'MicrosoftEdge', 'firefox', 'H264');
});

test('Firefox-Edge', {skip: os.platform() !== 'win32'}, t => {
  video(t, 'firefox', 'MicrosoftEdge', 'H264');
});

// VP8 is available since Edge 15014
test('Edge-Chrome VP8', {skip: os.platform() !== 'win32'}, t => {
  video(t, 'MicrosoftEdge', 'chrome', 'VP8');
});

test('Edge-Firefox VP8', {skip: os.platform() !== 'win32'}, t => {
  video(t, 'MicrosoftEdge', 'firefox', 'VP8');
});
/*
test('Edge-Edge', {skip: os.platform() !== 'win32'}, function (t) {
  video(t, 'MicrosoftEdge', 'MicrosoftEdge', 'H264');
});
*/
