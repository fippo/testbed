/* Interop testing using apprtc.appspot.com using selenium
 * Copyright (c) 2016, Philipp Hancke
 */

function WebRTCClient(driver) {
  this.driver = driver;
}

WebRTCClient.prototype.create = function(pcConfig, keygenAlgorithm) {
  // TODO: brutal hack
  if (keygenAlgorithm) {
    return this.driver.executeAsyncScript(function(pcConfig, keygenAlgorithm) {
      var callback = arguments[arguments.length - 1];

      if (RTCPeerConnection.generateCertificate) {
        RTCPeerConnection.generateCertificate(keygenAlgorithm)
        .then(function(cert) {
          if (!pcConfig) {
            pcConfig = {
              iceServers: []
            };
          }
          pcConfig.certificates = [cert];
          window.pc = new RTCPeerConnection(pcConfig);
          callback();
        })
        .catch(function(err) {
          callback(err);
        });
      } else {
        window.pc = new RTCPeerConnection(pcConfig);
        callback();
      }
    }, pcConfig, keygenAlgorithm);
  }
  this.driver.executeScript(function(pcConfig) {
    window.pc = new RTCPeerConnection(pcConfig);
  }, pcConfig);
};

WebRTCClient.prototype.generateCertificate = function(keygenAlgorithm) {
  return this.driver.executeAsyncScript(function(keygenAlgorithm) {
    var callback = arguments[arguments.length - 1];
    RTCPeerConnection.generateCertificate(keygenAlgorithm)
    .then(function(cert) {
      callback(cert);
    })
    .catch(function(err) {
      callback(err);
    });
  }, keygenAlgorithm);
};

WebRTCClient.prototype.getUserMedia = function(constraints) {
  return this.driver.executeAsyncScript(function(constraints) {
    var callback = arguments[arguments.length - 1];

    navigator.mediaDevices.getUserMedia(constraints)
    .then(function(stream) {
      window.localstream = stream;
      callback();
    })
    .catch(function(err) {
      callback(err);
    });
  }, constraints || {audio: true, video: true});
};

WebRTCClient.prototype.addStream = function() {
  return this.driver.executeScript(function() {
    pc.addStream(localstream);
  });
};

WebRTCClient.prototype.createDataChannel = function(label, dict) {
  return this.driver.executeScript(function(label, dict) {
    pc.createDataChannel(label, dict);
  }, label, dict);
}

WebRTCClient.prototype.createOffer = function(offerOptions) {
  return this.driver.executeAsyncScript(function(offerOptions) {
    var callback = arguments[arguments.length - 1];

    pc.createOffer(offerOptions)
    .then(function(offer) {
      callback(offer);
    })
    .catch(function(err) {
      callback(err);
    });
  }, offerOptions);
};

WebRTCClient.prototype.createAnswer = function() {
  return this.driver.executeAsyncScript(function() {
    var callback = arguments[arguments.length - 1];

    return pc.createAnswer()
    .then(function(answer) {
      callback(answer);
    })
    .catch(function(err) {
      callback(err);
    });
  });
};

// resolves with non-trickle description including candidates.
WebRTCClient.prototype.setLocalDescription = function(desc) {
  return this.driver.executeAsyncScript(function(desc) {
    var callback = arguments[arguments.length - 1];

    pc.onicecandidate = function(event) {
      if (!event.candidate) {
        // since Chrome does not include a=end-of-candidates...
        var desc = {
          type: pc.localDescription.type,
          sdp: pc.localDescription.sdp
        };
        if (desc.sdp.indexOf('\r\na=end-of-candidates\r\n') === -1) {
          var parts = desc.sdp.split('\r\nm=').map(function(part, index) {
            return (index > 0 ? 'm=' + part : part).trim() + '\r\n';
          });
          for (var i = 1; i < parts.length; i++) {
            parts[i] += 'a=end-of-candidates\r\n';
          }
          desc.sdp = parts.join('');
        }

        callback(desc);
      }
    };

    pc.setLocalDescription(new RTCSessionDescription(desc))
    .catch(function(err) {
      callback(err);
    });
  }, desc);
};

// TODO: should this return id of media element and create one
//      for each stream?
WebRTCClient.prototype.setRemoteDescription = function(desc) {
  return this.driver.executeAsyncScript(function(desc) {
    var callback = arguments[arguments.length - 1];

    pc.onaddstream = function(event) {
      var video = document.createElement('video');
      video.autoplay = true;
      video.srcObject = event.stream;
      document.body.appendChild(video);
    };
    pc.setRemoteDescription(new RTCSessionDescription(desc))
    .then(function() {
      callback();
    })
    .catch(function(err) {
      callback(err);
    });
  }, desc);
};

WebRTCClient.prototype.waitForIceConnectionStateChange = function() {
  return this.driver.executeAsyncScript(function() {
    var callback = arguments[arguments.length - 1];

    var isConnectedOrFailed = function() {
      var state = pc.iceConnectionState;
      if (state === 'connected' || state === 'completed' ||
          state === 'failed') {
        callback(state);
        return true;
      }
    };
    if (!isConnectedOrFailed()) {
      pc.addEventListener('iceconnectionstatechange', isConnectedOrFailed);
    }
  });
};

WebRTCClient.prototype.getStats = function() {
  return this.driver.executeAsyncScript(function(constraints) {
    var callback = arguments[arguments.length - 1];

    pc.getStats(null)
    .then(function(stats) {
      callback(stats.entries ?  [... stats.entries()] : stats);
    });
  })
  .then(function(stats) {
    if (Array.isArray(stats)) {
      return new Map(stats);
    }
    return entries;
  });
};

WebRTCClient.prototype.waitForAudio = function(silence) {
  return this.driver.executeAsyncScript(function(silence) {
    var callback = arguments[arguments.length - 1];

    var remoteStream = pc.getRemoteStreams()[0];

    var ac = new AudioContext();
    var analyser = ac.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0;
    var fftBins = new Uint8Array(analyser.frequencyBinCount);
    var sourceNode = ac.createMediaStreamSource(new MediaStream([remoteStream.getAudioTracks()[0]]));
    sourceNode.connect(analyser);
    function poll() {
      analyser.getByteFrequencyData(fftBins);
      var sum = fftBins.reduce((a, b) => a + b);
      if ((silence && sum === 0) || (!silence && sum > 0)) {
        ac.close()
        .then(() => {
          callback();
        });
      } else {
        requestAnimationFrame(poll);
      }
    }
    setTimeout(poll, 500);
  }, silence);
};

module.exports = WebRTCClient;
