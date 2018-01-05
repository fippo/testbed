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

function countFrames(driver, interval_, numberOfSamples_) {
    return driver.executeAsyncScript(function(interval, numberOfSamples) {
        const callback = arguments[arguments.length - 1];
        const samples = [];
        const remoteVideo = document.querySelector('#remote-video');
        const intervalId = setInterval(() => {
            samples.push([Date.now(), remoteVideo.webkitDecodedFrameCount || remoteVideo.mozPaintedFrames]);
            if (samples.length === numberOfSamples) {
                clearInterval(intervalId);
                callback(samples);
            }
        }, interval);
    }, interval_, numberOfSamples_);
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

function frameCount(t, browserA, browserB, queryString) {
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
  .then(() => countFrames(driverA, 500, 10)
    .then(samples => {
      console.log('counted frames', samples);
    }))
  .then(() => Promise.all([driverA.quit(), driverB.quit()]))
  .then(() => maybeWaitForEdge(browserA, browserB))
  .then(() => {
    t.end();
  });
}

test('Chrome-Chrome', t => {
  frameCount(t, 'chrome', 'chrome')
});
