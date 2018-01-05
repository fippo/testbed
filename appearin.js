const test = require('tape');
const os = require('os');

const webdriver = require('selenium-webdriver');
const buildDriver = require('./webdriver').buildDriver;

const TIMEOUT = 30000;

function waitNPeerConnectionsExist(driver, n) {
    return driver.wait(() => driver.executeScript(n => {
        var RTCManager = angular.element(document.body).injector().get('RoomService')._currentRtcManager;
        return RTCManager && Object.keys(RTCManager.peerConnections).length === n;
    }, n), TIMEOUT, 'Timed out waiting for N peerconnections to exist');
}

function waitAllPeerConnectionsConnected(driver) {
    return driver.wait(() => driver.executeScript(() => {
        var RTCManager = angular.element(document.body).injector().get('RoomService')._currentRtcManager;

        var states = [];
        Object.keys(RTCManager.peerConnections).forEach(id => {
            var connection = RTCManager.peerConnections[id];
            states.push(connection.pc.iceConnectionState);
        });
        return states.length === states.filter((s) => s === 'connected' || s === 'completed').length;
    }), TIMEOUT, 'Timed out waiting for N peerconnections to be connected');
}

function waitNVideosExist(driver, n) {
    return driver.wait(() => driver.executeScript(n => document.querySelectorAll('.video-wrapper video').length === n, n), TIMEOUT, 'Timed out waiting for N videos to exist');
}

function waitAllVideosHaveEnoughData(driver) {
    return driver.wait(() => driver.executeScript(() => {
        var videos = document.querySelectorAll('.video-wrapper video');
        var ready = 0;
        for (var i = 0; i < videos.length; i++) {
            if (videos[i].readyState >= videos[i].HAVE_ENOUGH_DATA) {
                ready++;
            }
        }
        return ready === videos.length;
    }), TIMEOUT, 'Timed out waiting for N video to HAVE_ENOUGH_DATA');
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

function interop(browserA, browserB, t) {
  var driverA = buildDriver(browserA, {h264: true, bver: browserA === 'safari' ? 'TechnologyPreview' : 'beta'});
  var driverB = buildDriver(browserB, {h264: true, bver: browserB === 'safari' ? 'TechnologyPreview' : 'beta'});

  var baseURL = 'https://appear.in/';
  var roomName = 'automated-testing-' + Math.random().toString(36).substr(2, 10);
  var url = baseURL + roomName;

  driverA.manage().timeouts().setScriptTimeout(TIMEOUT);

  return driverA.get(url)
  .then(() => driverB.get(baseURL + roomName))
  .then(() => // check that we have a peerconnection
  waitNPeerConnectionsExist(driverA, 1))
  .then(() => {
    t.pass('peerconnections exist');
  })
  .then(() => // wait for the ice connection state change to connected/completed.
  waitAllPeerConnectionsConnected(driverA))
  .then(() => {
    t.pass('all ice connections connected');
  })
  .then(() => waitNVideosExist(driverA, 2))
  .then(() => {
    t.pass('have all video elements');
  })
  .then(() => waitAllVideosHaveEnoughData(driverA))
  .then(() => {
    t.pass('all videos have ENOUGH_DATA');
  })
  .then(() => waitNVideosExist(driverB, 2))
  .then(() => {
    t.pass('have all video elements');
  })
  .then(() => waitAllVideosHaveEnoughData(driverB))
  .then(() => {
    t.pass('all videos have ENOUGH_DATA');
  })
  .then(() => Promise.all([driverA.quit(), driverB.quit()]))
  .then(() => maybeWaitForEdge(browserA, browserB))
  .then(() => {
    t.end();
  })
  .catch(e => {
    t.fail(e);
  });
}

const SELENIUM_SERVER = process.env.SELENIUM_SERVER;

test('Chrome-Chrome', t => {
    interop('chrome', 'chrome', t);
});

test('Firefox-Firefox', t => {
    interop('firefox', 'firefox', t);
});

test('Chrome-Firefox', t => {
    interop('chrome', 'firefox', t);
});

test('Firefox-Chrome', t => {
    interop('firefox', 'chrome', t);
});

test('Edge-Chrome', {skip: !SELENIUM_SERVER && os.platform() !== 'win32'}, t => {
    interop('MicrosoftEdge', 'chrome', t);
});

test('Safari-Chrome', {skip: !SELENIUM_SERVER && os.platform() !== 'darwin'}, t => {
    interop('safari', 'chrome', t);
});

test('Chrome-Safari', {skip: !SELENIUM_SERVER && os.platform() !== 'darwin'}, t => {
    interop('safari', 'chrome', t);
});

test('Firefox-Safari', {skip: !SELENIUM_SERVER && os.platform() !== 'darwin'}, t => {
    interop('firefox', 'safari', t);
});

test('Safari-Firefox', {skip: !SELENIUM_SERVER && os.platform() !== 'darwin'}, t => {
    interop('safari', 'firefox', t);
});

test('Edge-Safari', {skip: !SELENIUM_SERVER}, t => {
    interop('MicrosoftEdge', 'safari', t);
});

test('Safari-Edge', {skip: !SELENIUM_SERVER}, t => {
    interop('safari', 'MicrosoftEdge', t);
});
