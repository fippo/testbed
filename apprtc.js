/* Interop testing using apprtc.appspot.com using selenium
 * Copyright (c) 2016, Philipp Hancke
 */
const test = require('tape');
const fs = require('fs');
const webdriver = require('selenium-webdriver');
const buildDriver = require('./webdriver').buildDriver;

const TIMEOUT = 30000;
// in apprtc this step is moot since it creates the PC
// even if there is no other client.
function waitNPeerConnectionsExist(driver) {
    return driver.wait(() => driver.executeScript(
      () => appController && appController.call_ && appController.call_.pcClient_ && appController.call_.pcClient_.pc_
    ), TIMEOUT);
}

function waitAllPeerConnectionsConnected(driver) {
    return driver.wait(() => driver.executeScript(() => {
        var state = appController.call_.pcClient_.pc_.iceConnectionState;
        return state === 'connected' || state === 'completed';
    }), TIMEOUT);
}

// moot since apprtc always used three videos
function waitNVideosExist(driver) {
    return driver.wait(() => driver.executeScript(() => document.querySelectorAll('video').length === 3, n), TIMEOUT);
}

// apprtc uses remote-video
function waitAllVideosHaveEnoughData(driver) {
    return driver.wait(() => driver.executeScript(() => {
        var video = document.querySelector('#remote-video');
        return video.readyState >= video.HAVE_ENOUGH_DATA;
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

// Helper function for basic interop test.
// see https://apprtc.appspot.com/params.html for queryString options (outdated...)
function interop(t, browserA, browserB, queryString) {
  var driverA = buildDriver(browserA, {h264: true});
  var driverB;

  var baseURL = 'https://appr.tc/';

  return driverA.get(baseURL + (queryString || ''))
  .then(() => {
    t.pass('page loaded');
    return driverA.findElement(webdriver.By.id('join-button')).click();
  })
  .then(() => // wait for URL to change to /r/some-id
  driverA.wait(() => driverA.getCurrentUrl()
      .then(url => url.indexOf(baseURL + 'r/') === 0), 10000, 'Did not join room for 10s'))
  .then(() => {
    t.pass('joined room');
    return driverA.getCurrentUrl();
  })
  .then(url => {
    //
    driverB = buildDriver(browserB, {h264: true});
    return driverB.get(url);
  })
  .then(() => driverB.findElement(webdriver.By.id('confirm-join-button')).click())
  .then(() => {
    t.pass('second browser joined');
    // Show the info box.
    //return driverA.executeScript('appController.infoBox_.showInfoDiv();');
  })
  .then(() => waitNPeerConnectionsExist(driverA))
  .then(() => waitNPeerConnectionsExist(driverB))
  .then(() => waitAllPeerConnectionsConnected(driverA))
  .then(() => waitAllPeerConnectionsConnected(driverB))
  .then(() => {
    t.pass('videos exist');
    return waitAllVideosHaveEnoughData(driverA);
  })
  .then(() => {
    t.pass('videos exist');
    return waitAllVideosHaveEnoughData(driverB);
  })
  .then(() => {
    t.pass('videos are in HAVE_ENOUGH_DATA state');
  })
  .then(() => Promise.all([driverA.quit(), driverB.quit()]))
  .then(() => maybeWaitForEdge(browserA, browserB))
  .then(() => {
    t.end();
  });
}

test('Chrome-Chrome', t => {
  interop(t, 'chrome', 'chrome')
});

test('Chrome-Firefox', t => {
  interop(t, 'chrome', 'firefox')
});

test('Firefox-Chrome', t => {
  interop(t, 'firefox', 'chrome')
});

test('Firefox-Firefox', t => {
  interop(t, 'firefox', 'firefox')
});

// unclear how to evaluate audio-only
/*
test('Chrome-Chrome, audio-only', function(t) {
  interop(t, 'chrome', 'chrome', '?audio=true&video=false')
});
*/

test('Chrome-Chrome, icetransports=relay', t => {
  interop(t, 'chrome', 'chrome', '?it=relay')
});

test('Firefox-Firefox, H264', t => {
  interop(t, 'firefox', 'firefox', '?vsc=H264&vrc=H264')
});

test('Chrome-Chrome, H264', t => {
  interop(t, 'chrome', 'chrome', '?vsc=H264&vrc=H264')
});

test('Chrome-Firefox, H264', t => {
  interop(t, 'chrome', 'firefox', '?vsc=H264&vrc=H264')
});

test('Firefox-Chrome, H264', t => {
  interop(t, 'firefox', 'chrome', '?vsc=H264&vrc=H264')
});

test('Chrome-Chrome, VP8', t => {
  interop(t, 'chrome', 'chrome', '?vsc=VP8&vrc=VP8')
});

test('Chrome-Chrome, VP9', t => {
  interop(t, 'chrome', 'chrome', '?vsc=VP9&vrc=VP9')
});

test('Firefox-Firefox, VP9', t => {
  interop(t, 'firefox', 'firefox', '?vsc=VP9&vrc=VP9')
});

test('Chrome-Firefox, VP9', t => {
  interop(t, 'chrome', 'firefox', '?vsc=VP9&vrc=VP9')
});

test('Firefox-Chrome, VP9', t => {
  interop(t, 'firefox', 'chrome', '?vsc=VP9&vrc=VP9')
});
