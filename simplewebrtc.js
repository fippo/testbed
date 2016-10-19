/* Interop testing using apprtc.appspot.com using selenium
 * Copyright (c) 2016, Philipp Hancke
 * This work has been sponsored by the International Multimedia
 * Teleconferencing Consortium in preparation for the
 * SuperOp! 2016 event.
 */

const test = require('tape');
const fs = require('fs');
const os = require('os');
const webdriver = require('selenium-webdriver');
const buildDriver = require('./webdriver').buildDriver;

const TIMEOUT = 30000;
function waitNPeerConnectionsExist(driver, n) {
    return driver.wait(function() {
        return driver.executeScript(function(n) {
            return webrtc.getPeers().length === n;
        }, n);
    }, TIMEOUT);
}

function waitAllPeerConnectionsConnected(driver) {
    return driver.wait(function() {
        return driver.executeScript(function() {
            var peers = webrtc.getPeers();
            var states = [];
            peers.forEach(function(peer) {
                console.log(peer, peer.pc);
                states.push(peer.pc.iceConnectionState);
            });
            return states.length === states.filter((s) => s === 'connected' || s === 'completed').length;
        });
    }, TIMEOUT);
}

function waitNVideosExist(driver, n) {
    return driver.wait(function() {
        return driver.executeScript(function(n) {
            return document.querySelectorAll('video').length === n;
        }, n);
    }, TIMEOUT);
}

function waitAllVideosHaveEnoughData(driver) {
    return driver.wait(function() {
        return driver.executeScript(function() {
            var videos = document.querySelectorAll('video');
            var ready = 0;
            for (var i = 0; i < videos.length; i++) {
                if (videos[i].readyState >= videos[i].HAVE_ENOUGH_DATA) {
                    ready++;
                }
            }
            return ready === videos.length;
        });
    }, TIMEOUT);
}


// Helper function for basic interop test.
function interop(t, browserA, browserB) {
  var driverA = buildDriver(browserA, {h264: true});
  var driverB = buildDriver(browserB, {h264: true});

  var baseURL = 'https://simplewebrtc.com/video?';
  var roomName = 'interop-' + Math.random().toString(36).substr(2, 10);

  driverA.manage().timeouts().setScriptTimeout(TIMEOUT);

  return driverA.get(baseURL + roomName)
  .then(function() {
    return driverB.get(baseURL + roomName);
  })
  .then(function() {
    t.pass('joined room');
    return waitNPeerConnectionsExist(driverA, 1);
  })
  .then(function() {
    t.pass('peerconnections exist');
    return waitAllPeerConnectionsConnected(driverA);
  })
  .then(function() {
    t.pass('peerconnections connected or completed');
    return waitNVideosExist(driverA, 2);
  })
  .then(function() {
    t.pass('videos exist');
    return waitAllVideosHaveEnoughData(driverA);
  })
  .then(function() {
    t.pass('videos are in HAVE_ENOUGH_DATA state');
  })
  .then(function() {
    return Promise.all([driverA.quit(), driverB.quit()])
  })
  .then(function() {
    // Edge's Webdriver seems to require some time to shut down?
    if (browserA === 'MicrosoftEdge' || browserB === 'MicrosoftEdge') {
      return new Promise(function(resolve) {
        setTimeout(resolve, 2000);
      });
    }
  })
  .then(function() {
    t.end();
  });
}

test('Chrome-Chrome', function(t) {
  interop(t, 'chrome', 'chrome')
});

// geckodriver does not find Firefox binary on Win10?
test('Firefox-Firefox', {skip: os.platform() === 'win32'}, function(t) {
  interop(t, 'firefox', 'firefox')
});

test('Chrome-Firefox', {skip: os.platform() === 'win32'}, function(t) {
  interop(t, 'chrome', 'firefox')
});

test('Firefox-Chrome', {skip: os.platform() === 'win32'}, function(t) {
  interop(t, 'firefox', 'chrome')
});

/*
test('Edge-Edge', {skip: os.platform() !== 'win32'}, function(t) {
  interop(t, 'MicrosoftEdge', 'MicrosoftEdge')
});
*/

test('Chrome-Edge', {skip: os.platform() !== 'win32'}, function(t) {
  interop(t, 'chrome', 'MicrosoftEdge')
});

test('Edge-Chrome', {skip: os.platform() !== 'win32'}, function(t) {
  interop(t, 'MicrosoftEdge', 'chrome')
});
