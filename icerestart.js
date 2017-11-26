/* webrtc interop testing using using selenium 
 * Copyright (c) 2016, Philipp Hancke
 * This work has been sponsored by the International Multimedia
 * Teleconferencing Consortium in preparation for the 
 * SuperOp! 2016 event.
 */

var os = require('os');
var test = require('tape');
var buildDriver = require('./webdriver').buildDriver;
var startSelenium = require('./webdriver').startServer;
var WebRTCClient = require('./webrtcclient');

function getTransportAddresses(stats) {
  var localAddress;
  var remoteAddress;
  Object.keys(stats).forEach(function(id) {
    var report = stats[id];
    if (report.googActiveConnection === 'true') {
      var localCandidate = stats[report.localCandidateId];
      var remoteCandidate = stats[report.remoteCandidateId];
      localAddress = localCandidate.ipAddress + ':' +
          localCandidate.portNumber;
      remoteAddress = remoteCandidate.ipAddress + ':' +
          remoteCandidate.portNumber;
    }
  });
  return localAddress + ' ' + remoteAddress;
}

function icerestart(t, browserA, browserB) {
  var driverA = buildDriver(browserA, {server: true});
  var driverB = buildDriver(browserB, {server: true});

  var clientA = new WebRTCClient(driverA);
  var clientB = new WebRTCClient(driverB);

  var oldaddress;
  var newaddress;
  // static page with adapter shim
  driverA.get('https://fippo.github.io/adapter/testpage.html')
  .then(function() {
    return driverB.get('https://fippo.github.io/adapter/testpage.html');
  })
  .then(function() {
    clientA.create();
    return clientA.getUserMedia({video: true});
  })
  .then(function() {
    t.pass('got user media');
    return clientA.addStream();
  })
  .then(function() {
    return clientA.createOffer();
  })
  .then(function(offer) {
    t.pass('created offer');

    return clientA.setLocalDescription(offer);
  })
  .then(function(offerWithCandidates) {
    t.pass('offer ready to signal');

    clientB.create();
    return clientB.setRemoteDescription(offerWithCandidates);
  })
  .then(function() {
    return clientB.createAnswer();
  })
  .then(function(answer) {
    t.pass('created answer');
    return clientB.setLocalDescription(answer); // modify answer here?
  })
  .then(function(answerWithCandidates) {
    t.pass('answer ready to signal');
    return clientA.setRemoteDescription(answerWithCandidates);
  })
  .then(function() {
    // wait for the iceConnectionState to become either connected/completed
    // or failed.
    return clientA.waitForIceConnectionStateChange();
  })
  .then(function(iceConnectionState) {
    t.ok(iceConnectionState !== 'failed', 'ICE connection is established');
  })
  .then(function() {
    return clientA.getStats();
  })
  .then(function(stats) {
    oldaddress = getTransportAddresses(stats);
    return clientA.createOffer({iceRestart: true});
  })
  .then(function(offer) {
    t.pass('created second offer');

    return clientA.setLocalDescription(offer);
  })
  .then(function(offerWithCandidates) {
    t.pass('second offer ready to signal');

    clientB.create();
    return clientB.setRemoteDescription(offerWithCandidates);
  })
  .then(function() {
    return clientB.createAnswer();
  })
  .then(function(answer) {
    t.pass('created second answer');
    return clientB.setLocalDescription(answer); // modify answer here?
  })
  .then(function(answerWithCandidates) {
    t.pass('second answer ready to signal');
    return clientA.setRemoteDescription(answerWithCandidates);
  })
  .then(function() {
    // wait for the iceConnectionState to become either connected/completed
    // or failed.
    return clientA.waitForIceConnectionStateChange();
  })
  .then(function(iceConnectionState) {
    t.ok(iceConnectionState !== 'failed', 'ICE connection is reestablished');
  })
  .then(function() {
    return clientA.getStats();
  })
  .then(function(stats) {
    newaddress = getTransportAddresses(stats);
    t.ok(oldaddress !== newaddress, 'candidate pair used changed');
  })
  .then(function() {
    driverA.quit();
    driverB.quit()
    .then(function() {
      t.end();
    });
  })
  .catch(function(err) {
    t.fail(err);
  });
}

function transfer(t, browserA, browserB, browserC) {
  var driverA = buildDriver(browserA, {server: true});
  var driverB = buildDriver(browserB, {server: true});
  var driverC = buildDriver(browserC, {server: true});

  var clientA = new WebRTCClient(driverA);
  var clientB = new WebRTCClient(driverB);
  var clientC = new WebRTCClient(driverC);

  // static page with adapter shim
  driverA.get('https://fippo.github.io/adapter/testpage.html')
  .then(function() {
    return driverB.get('https://fippo.github.io/adapter/testpage.html');
  })
  .then(function() {
    return driverC.get('https://fippo.github.io/adapter/testpage.html');
  })
  .then(function() {
    clientA.create();
    return clientA.getUserMedia({video: true});
  })
  .then(function() {
    t.pass('got user media');
    return clientA.addStream();
  })
  .then(function() {
    return clientA.createOffer();
  })
  .then(function(offer) {
    t.pass('created offer');

    return clientA.setLocalDescription(offer);
  })
  .then(function(offerWithCandidates) {
    t.pass('offer ready to signal');

    clientB.create();
    return clientB.setRemoteDescription(offerWithCandidates);
  })
  .then(function() {
    return clientB.createAnswer();
  })
  .then(function(answer) {
    t.pass('created answer');
    return clientB.setLocalDescription(answer); // modify answer here?
  })
  .then(function(answerWithCandidates) {
    t.pass('answer ready to signal');
    return clientA.setRemoteDescription(answerWithCandidates);
  })
  .then(function() {
    // wait for the iceConnectionState to become either connected/completed
    // or failed.
    return clientA.waitForIceConnectionStateChange();
  })
  .then(function(iceConnectionState) {
    t.ok(iceConnectionState !== 'failed', 'ICE connection is established');
  })
  .then(function() {
    return clientA.getStats();
  })
  .then(function(stats) {
    return clientA.createOffer({iceRestart: true});
  })
  .then(function(offer) {
    t.pass('created second offer');

    return clientA.setLocalDescription(offer);
  })
  .then(function(offerWithCandidates) {
    t.pass('second offer ready to signal');

    clientC.create();
    return clientC.setRemoteDescription(offerWithCandidates);
  })
  .then(function() {
    return clientC.createAnswer();
  })
  .then(function(answer) {
    t.pass('created second answer');
    return clientC.setLocalDescription(answer); // modify answer here?
  })
  .then(function(answerWithCandidates) {
    t.pass('second answer ready to signal');
    return clientA.setRemoteDescription(answerWithCandidates);
  })
  .then(function() {
    // wait for the iceConnectionState to become either connected/completed
    // or failed.
    return clientA.waitForIceConnectionStateChange();
  })
  .then(function(iceConnectionState) {
    t.ok(iceConnectionState !== 'failed', 'ICE connection is reestablished');
  })
  .then(function() {
    driverA.sleep(3000);
    return clientC.getFrameStats();
  })
  .then(function(frameStats) {
    t.ok(frameStats.numFrames > 0, 'video frames received');
  })
  .then(function() {
    driverA.quit();
    driverB.quit()
    driverC.quit()
    .then(function() {
      t.end();
    });
  })
  .catch(function(err) {
    t.fail(err);
  });
}
startSelenium()
.then(function(server) {
  // start of tests
  test('Restart Chrome-Chrome', function(t) {
    icerestart(t, 'chrome', 'chrome');
  });

  test('Transfer Chrome-Chrome-Chrome', function(t) {
    transfer(t, 'chrome', 'chrome', 'chrome');
  });

  /*
  test('Transfer Chrome-Chrome-Firefox', function(t) {
    transfer(t, 'chrome', 'chrome', 'firefox');
  });
  */

  // must be the last 'test'. Shuts down the selenium server.
  test('shutdown', function(t) {
    server.kill();
    t.end();
  });
})
.catch(function(err) {
  console.error(err);
});
