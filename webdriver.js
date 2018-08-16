const os = require('os');
const fs = require('fs');

const webdriver = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const firefox = require('selenium-webdriver/firefox');
const edge = require('selenium-webdriver/edge');
const safari = require('selenium-webdriver/safari');

const grid = process.env.SELENIUM_SERVER;

// setup path for webdriver binaries
if (os.platform() === 'win32') {
  process.env.PATH += ';C:\\Program Files (x86)\\Microsoft Web Driver\\';
  // FIXME: not sure why node_modules\.bin\ is not enough
  process.env.PATH += ';' + process.cwd() +
      '\\node_modules\\chromedriver\\lib\\chromedriver\\';
  process.env.PATH += ';' + process.cwd() +
      '\\node_modules\\geckodriver';
} else {
  process.env.PATH += ':node_modules/.bin';
}

function buildDriver(browser, options) {
  // Firefox options.
  let profile;
  options = options || {};
  if (options.firefoxprofile) {
    profile = new firefox.Profile(options.firefoxprofile);
    if (typeof options.h264 === 'string') {
      profile.setPreference('media.gmp-gmpopenh264.version', options.h264); // openh264
    } else if (options.h264 !== false) {
      profile.setPreference('media.gmp-gmpopenh264.version', '1.6'); // openh264
    }
  } else if (options.h264) {
    // contains gmp-gmpopenh264/1.6 which may contain openh264 binary.
    profile = new firefox.Profile('h264profile');
    profile.setPreference('media.gmp-gmpopenh264.version', '1.6'); // openh264
  } else {
    profile = new firefox.Profile();
  }
  profile.setAcceptUntrustedCerts(true);

  // note: interoperable with Chrome only in FF46+
  //profile.setPreference('media.peerconnection.video.vp9_enabled', true);

  profile.setPreference('media.navigator.streams.fake', true);
  profile.setPreference('media.navigator.permission.disabled', true);
  profile.setPreference('xpinstall.signatures.required', false);
  if (options.disableFirefoxWebRTC) {
    profile.setPreference('media.peerconnection.enabled', false);
  }

  if (options.devices && options.devices.extension) {
    profile.addExtension(options.devices.extension);
  }

  const firefoxOptions = new firefox.Options()
      .setProfile(profile);
  let firefoxPath;
  if (options.firefoxpath) {
      firefoxPath = options.firefoxpath;
  } else if (!grid) {
    if (os.platform() == 'linux' && options.bver) {
      firefoxPath = 'browsers/bin/firefox-' + options.bver;
    }
  }
  const firefoxBinary = new firefox.Binary(firefoxPath);
  if (options.headless) {
    firefoxBinary.addArguments('-headless');
  }
  firefoxOptions.setBinary(firefoxBinary);

  // Chrome options.
  let chromeOptions = new chrome.Options()
      // .setChromeBinaryPath('/usr/bin/google-chrome-beta')
      .addArguments('enable-features=WebRTC-H264WithOpenH264FFmpeg')
      .addArguments('allow-file-access-from-files')
      .addArguments('allow-insecure-localhost')
      .addArguments('use-fake-device-for-media-stream')
      .addArguments('disable-translate')
      .addArguments('no-process-singleton-dialog')
      // .addArguments('disable-dev-shm-usage')
      .addArguments('mute-audio');
  if (options.experimental !== false) {
    chromeOptions.addArguments('enable-experimental-web-platform-features');
  }
  if (options.headless) {
    chromeOptions.addArguments('headless');
    chromeOptions.addArguments('disable-gpu');
  }
  if (options.noSandbox) {
    chromeOptions.addArguments('no-sandbox');
  }
  if (options.chromeFlags) {
    options.chromeFlags.forEach((flag) => chromeOptions.addArguments(flag));
  }
  // ensure chrome.runtime is visible.
  chromeOptions.excludeSwitches('test-type');

  if (options.android) {
    chromeOptions = chromeOptions.androidChrome();
  } else if (options.chromepath) {
    chromeOptions.setChromeBinaryPath(options.chromepath);
  } else if (!grid && os.platform() === 'linux' && options.bver) {
    chromeOptions.setChromeBinaryPath('browsers/bin/chrome-' + options.bver);
  }

  if (!options.devices || options.headless || options.android) {
    // GUM doesn't work in headless mode so we need this. See 
    // https://bugs.chromium.org/p/chromium/issues/detail?id=776649
    chromeOptions.addArguments('use-fake-ui-for-media-stream');
  } else {
    // see https://bugs.chromium.org/p/chromium/issues/detail?id=459532#c22
    const domain = 'https://' + (options.devices.domain || 'localhost') + ':' + (options.devices.port || 443) + ',*';
    const exceptions = {
      media_stream_mic: {},
      media_stream_camera: {}
    };

    exceptions.media_stream_mic[domain] = {
      last_used: Date.now(),
      setting: options.devices.audio ? 1 : 2 // 0: ask, 1: allow, 2: denied
    };
    exceptions.media_stream_camera[domain] = {
      last_used: Date.now(),
      setting: options.devices.video ? 1 : 2
    };

    chromeOptions.setUserPreferences({
      profile: {
        content_settings: {
          exceptions: exceptions
        }
      }
    });
  }

  if (options.devices) {
    if (options.devices.screen) {
      chromeOptions.addArguments('auto-select-desktop-capture-source=' + options.devices.screen);
    }
    if (options.devices.extension) {
      chromeOptions.addArguments('load-extension=' + options.devices.extension);
    }
  }

  const edgeOptions = new edge.Options();

  const safariOptions = new safari.Options();
  safariOptions.setTechnologyPreview(options.bver === 'unstable');

  const loggingPreferences = new webdriver.logging.Preferences();
  if (options.browserLogging) {
    loggingPreferences.setLevel(webdriver.logging.Type.BROWSER, webdriver.logging.Level.ALL);
  }

  let driver = new webdriver.Builder()
      .setFirefoxOptions(firefoxOptions)
      .setChromeOptions(chromeOptions)
      .setEdgeOptions(edgeOptions)
      .setSafariOptions(safariOptions)
      .setLoggingPrefs(loggingPreferences)
      .forBrowser(browser);
  if (browser === 'chrome') {
    driver.getCapabilities().set('goog:chromeOptions', chromeOptions);
  }
  if (browser === 'firefox') {
    driver.getCapabilities().set('moz:firefoxOptions', firefoxOptions);
  }
  if (options.server === true) {
    driver = driver.usingServer('http://localhost:4444/wd/hub/');
  } else if (options.server) {
    driver = driver.usingServer(options.server);
  } else if (options.server !== false && process.env.SELENIUM_SERVER) {
    driver = driver.usingServer(process.env.SELENIUM_SERVER);
  }

  if (browser === 'firefox') {
    driver.getCapabilities().set('marionette', true);
    driver.getCapabilities().set('acceptInsecureCerts', true);
  }
  if (options.applicationName) {
    driver.getCapabilities().set('applicationName', options.applicationName);
  }
  driver = driver.build();

  // Set global executeAsyncScript() timeout (default is 0) to allow async
  // callbacks to be caught in tests.
  driver.manage().timeouts().setScriptTimeout(5 * 1000);

  return driver;
}

// static page that includes adapter.js 
function getTestpage(driver) {
    return driver.get('https://fippo.github.io/adapter/empty.html')
    .then(() => {
        driver.executeScript(fs.readFileSync('node_modules/webrtc-adapter/out/adapter.js').toString());
    });
}

module.exports = {
  buildDriver: buildDriver,
  getTestpage: getTestpage,
};
