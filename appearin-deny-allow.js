"use strict";

const webdriver = require('selenium-webdriver');
const buildDriver = require('./webdriver').buildDriver;

const TIMEOUT = 30000;

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

function denyAllow(browser) {
    console.log("getUserMedia deny-allow test", browser);
    const baseUrl = "https://appear.in/";
    const url = baseUrl + "/automated-testing-" + Math.random().toString(36).substr(2, 10);

    // assumes https://github.com/fippo/dynamic-getUserMedia was cloned into current directory
    const driver = buildDriver(browser, {
        devices: {
            domain: "appear.in",
            extension: "dynamic-getUserMedia",
            audio: true,
            video: true,
        }
    });
    const drivers = [driver];

    return driver.get(baseUrl)
    .then(() => {
        return driver.executeScript(() => {
            localStorage.returningVisitorStore = "true";
            sessionStorage.__getUserMediaAudioError = "NotAllowedError";
        });
    })
    .then(() => driver.get(url))
    .then(() => driver.sleep(3000)) // here one would make assertions that the error page is shown
    .then(() => {
        return driver.executeScript(() => {
            delete sessionStorage.__getUserMediaAudioError;
        });
    })
    .then(() => waitNVideosExist(driver, 1))
    .then(() => waitAllVideosHaveEnoughData(driver))
    .then(() => driver.sleep(3000)) // wait a bit.
    .then(() => driver.quit());
}

Promise.resolve()
.then(() => denyAllow("chrome"))
.then(() => denyAllow("firefox"))
.catch((e) => {
    console.error("FAIL", e);
    process.exit(1);
});

