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
    return driver.wait(() => driver.executeScript(n => document.querySelectorAll('video').length === n, n), TIMEOUT);
}

function waitAllVideosHaveEnoughData(driver) {
    return driver.wait(() => driver.executeScript(() => {
        const videos = document.querySelectorAll('video');
        let ready = 0;
        for (let i = 0; i < videos.length; i++) {
            if (videos[i].readyState >= videos[i].HAVE_ENOUGH_DATA) {
                ready++;
            }
        }
        return ready === videos.length;
    }), TIMEOUT);
}

// Edge Webdriver resolves quit slightly too early, wait a bit.
function maybeWaitForEdge(browserA, browserB, browserC, browserD) {
    if (browserA === 'MicrosoftEdge' || browserB === 'MicrosoftEdge') {
        return new Promise(resolve => {
            setTimeout(resolve, 2000);
        });
    }
    return Promise.resolve();
}

// Chrome simulcast-munging.
function mungeChromeSimulcast(sdp, numberOfSimulcastLayers) {
    let cname;
    let msid;
    const sections = SDPUtils.splitSections(sdp);
    SDPUtils.matchPrefix(sections[1], 'a=ssrc:').forEach(line => {
        const media = SDPUtils.parseSsrcMedia(line);
        if (media.attribute === 'cname') {
            cname = media.value;
        } else if (media.attribute === 'msid') {
            msid = media.value;
        }
    });

    const fidGroup = SDPUtils.matchPrefix(sections[1], 'a=ssrc-group:FID ')[0].substr(17);
    const lines = sections[1].trim().split('\r\n').filter(line => {
        return line.indexOf('a=ssrc:') !== 0 && line.indexOf('a=ssrc-group:') !== 0;
    });
    const simSSRCs = [];
    const [videoSSRC1, rtxSSRC1] = fidGroup.split(' ').map(ssrc => parseInt(ssrc, 10));
    lines.push('a=ssrc:' + videoSSRC1 + ' cname:' + cname);
    lines.push('a=ssrc:' + videoSSRC1 + ' msid:' + msid);
    lines.push('a=ssrc:' + rtxSSRC1 + ' cname:' + cname);
    lines.push('a=ssrc:' + rtxSSRC1 + ' msid:' + msid);
    lines.push('a=ssrc-group:FID ' + videoSSRC1 + ' ' + rtxSSRC1);
    simSSRCs.push(videoSSRC1);

    if (numberOfSimulcastLayers >= 2) {
        const videoSSRC2 = videoSSRC1 + 1;
        const rtxSSRC2 = videoSSRC1 + 2;
        lines.push('a=ssrc:' + videoSSRC2 + ' cname:' + cname);
        lines.push('a=ssrc:' + videoSSRC2 + ' msid:' + msid);
        lines.push('a=ssrc:' + rtxSSRC2 + ' cname:' + cname);
        lines.push('a=ssrc:' + rtxSSRC2 + ' msid:' + msid);
        lines.push('a=ssrc-group:FID ' + videoSSRC2 + ' ' + rtxSSRC2);
        simSSRCs.push(videoSSRC2);
    }

    if (numberOfSimulcastLayers >= 3) {
        const videoSSRC3 = videoSSRC1 + 3;
        const rtxSSRC3 = videoSSRC1 + 4;
        lines.push('a=ssrc:' + videoSSRC3 + ' cname:' + cname);
        lines.push('a=ssrc:' + videoSSRC3 + ' msid:' + msid);
        lines.push('a=ssrc:' + rtxSSRC3 + ' cname:' + cname);
        lines.push('a=ssrc:' + rtxSSRC3 + ' msid:' + msid);
        lines.push('a=ssrc-group:FID ' + videoSSRC3 + ' ' + rtxSSRC3);
        simSSRCs.push(videoSSRC3);
    }

    lines.push('a=ssrc-group:SIM ' + simSSRCs.join(' '));
    sections[1] = lines.join('\r\n') + '\r\n';
    return sections.join('');
}

// Splits the three ssrcs of simulcast into three different tracks/m-lines.
function splitSimulcast(sdp) {
    const sections = SDPUtils.splitSections(sdp);
    const candidates = SDPUtils.matchPrefix(sections[1], 'a=candidate:');
    const dtls = SDPUtils.getDtlsParameters(sections[1], sections[0]);
    const ice = SDPUtils.getIceParameters(sections[1], sections[0]);
    const rtpParameters = SDPUtils.parseRtpParameters(sections[1]);

    // unified plan things.
    rtpParameters.headerExtensions = rtpParameters.headerExtensions.filter(ext => {
        return ext.uri !== 'urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id' &&
            ext.uri !== 'urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id' &&
            ext.uri !== 'urn:ietf:params:rtp-hdrext:sdes:mid';
    });
    sdp = 'v=0\r\n' +
      'o=mozilla...THIS_IS_SDPARTA-61.0 8324701712193024513 0 IN IP4 0.0.0.0\r\n' +
      's=-\r\n' +
      't=0 0\r\n' +
      'a=fingerprint:' + dtls.fingerprints[0].algorithm + ' ' + dtls.fingerprints[0].value + '\r\n' +
      'a=ice-ufrag:' + ice.usernameFragment + '\r\n' +
      'a=ice-pwd:' + ice.password + '\r\n' +
      'a=group:BUNDLE 0 1\r\n' +
      'a=msid-semantic:WMS *\r\n';
    // rtpParameters.codecs = rtpParameters.codecs.filter(c => c.payloadType === 98 || c.payloadType === 99);
    const codecs = SDPUtils.writeRtpDescription('video', rtpParameters);

    const fidGroups = SDPUtils.matchPrefix(sections[1], 'a=ssrc-group:FID ');
    if (fidGroups.length > 0) {
      const [videoSSRC1, rtxSSRC1] = fidGroups[0].substr(17).split(' ').map(ssrc => parseInt(ssrc, 10));
      sdp += codecs +
          'a=setup:actpass\r\n' +
          'a=mid:0\r\n' +
          'a=msid:low low\r\n' +
          'a=ssrc:' + videoSSRC1 + ' cname:something\r\n';
          'a=ssrc:' + rtxSSRC1 + ' cname:something\r\n' +
          'a=ssrc-group:FID ' + videoSSRC1 + ' ' + rtxSSRC1 + '\r\n';
      candidates.forEach(c => sdp += c + '\r\n');
    }
    if (fidGroups.length > 1) {
      const [videoSSRC2, rtxSSRC2] = fidGroups[1].substr(17).split(' ').map(ssrc => parseInt(ssrc, 10));
      sdp += codecs +
          'a=setup:actpass\r\n' +
          'a=mid:1\r\n' +
          'a=msid:mid mid\r\n' +
          'a=ssrc:' + videoSSRC2 + ' cname:something\r\n' +
          'a=ssrc:' + rtxSSRC2 + ' cname:something\r\n' +
          'a=ssrc-group:FID ' + videoSSRC2 + ' ' + rtxSSRC2 + '\r\n';
    }
    if (fidGroups.length > 2) {
      const [videoSSRC3, rtxSSRC3] = fidGroups[2].substr(17).split(' ').map(ssrc => parseInt(ssrc, 10));
      sdp += codecs +
          'a=setup:actpass\r\n' +
          'a=mid:2\r\n' +
          'a=msid:hi hi\r\n' +
          'a=ssrc:' + videoSSRC3 + ' cname:something\r\n' +
          'a=ssrc:' + rtxSSRC3 + ' cname:something\r\n' +
          'a=ssrc-group:FID ' + videoSSRC3 + ' ' + rtxSSRC3 + '\r\n';
    }
	return sdp;
}

// Merges the three m-lіnes into a single one.
function mergeSimulcast(sdp) {
	const sections = SDPUtils.splitSections(sdp);
    const candidates = SDPUtils.matchPrefix(sections[1], 'a=candidate:');
    const dtls = SDPUtils.getDtlsParameters(sections[1], sections[0]);
    const ice = SDPUtils.getIceParameters(sections[1], sections[0]);
    const rtpParameters = SDPUtils.parseRtpParameters(sections[1]);
    sdp = 'v=0\r\n' +
      'o=mozilla...THIS_IS_SDPARTA-61.0 8324701712193024513 0 IN IP4 0.0.0.0\r\n' +
      's=-\r\n' +
      't=0 0\r\n' +
      'a=fingerprint:' + dtls.fingerprints[0].algorithm + ' ' + dtls.fingerprints[0].value + '\r\n' +
      'a=ice-ufrag:' + ice.usernameFragment + '\r\n' +
      'a=ice-pwd:' + ice.password + '\r\n' +
      'a=group:BUNDLE 0\r\n' +
      'a=msid-semantic:WMS *\r\n';
    const codecs = SDPUtils.writeRtpDescription('video', rtpParameters);
    sdp += codecs;
    candidates.forEach(c => sdp += c + '\r\n');
    return sdp;
}

function simulcast(t, browserA, browserB, numberOfLayers) {
  const driverA = buildDriver(browserA);
  const driverB = buildDriver(browserB);

  const clientA = new WebRTCClient(driverA);
  const clientB = new WebRTCClient(driverB);

  getTestpage(driverA)
  .then(() => getTestpage(driverB))
  .then(() => clientA.create())
  .then(() => clientB.create())
  .then(() => clientA.getUserMedia({audio: false, video: true}))
  .then((stream) => {
    t.pass('got user media');
    return clientA.addStream(stream);
  })
  .then(() => clientA.createOffer())
  .then(offer => {
    t.pass('created offer');
    if (browserA === 'chrome' || browserA === 'safari') {
      offer.sdp = mungeChromeSimulcast(offer.sdp, numberOfLayers);
    }
    return clientA.setLocalDescription(offer);
  })
  .then(offerWithCandidates => {
    t.pass('offer ready to signal');
    offerWithCandidates.sdp = splitSimulcast(offerWithCandidates.sdp);

    return clientB.setRemoteDescription(offerWithCandidates);
  })
  .then(() => clientB.createAnswer())
  .then(answer => {
    t.pass('created answer');
    return clientB.setLocalDescription(answer); // modify answer here?
  })
  .then(answerWithCandidates => {
    t.pass('answer ready to signal');
    answerWithCandidates.sdp = mergeSimulcast(answerWithCandidates.sdp);
    return clientA.setRemoteDescription(answerWithCandidates);
  })
  // wait for the iceConnectionState to become either connected/completed
  // or failed.
  .then(() => clientA.waitForIceConnectionStateChange())
  .then(iceConnectionState => {
    t.ok(iceConnectionState !== 'failed', 'ICE connection is established');
  })
  .then(() => waitNVideosExist(driverB, numberOfLayers))
  .then(() => waitAllVideosHaveEnoughData(driverB))
  .then(() => driverA.sleep(5000)) // wait a bit since its nice.
  .then(() => Promise.all([driverA.quit(), driverB.quit()])
  .then(() => maybeWaitForEdge(browserA, browserB))
  .then(() => {
    t.end();
  }))
  .catch(err => {
    t.fail(err);
  });
}

test('Chrome-Firefox, VP8', t => {
  simulcast(t, 'chrome', 'firefox', 2);
});
