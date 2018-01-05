/* Interop testing using apprtc.appspot.com using selenium
 * Copyright (c) 2016, Philipp Hancke
 */

function MediaStream() {
    this.tracks = [];
    this.id = 0;
}

MediaStream.prototype.getTracks = function() {
    return this.tracks;
}

MediaStream.prototype.getAudioTracks = function() {
    return this.tracks.filter(t => t.kind === 'audio');
}

MediaStream.prototype.getVideoTracks = function() {
    return this.tracks.filter(t => t.kind === 'video');
}

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
        .then(cert => {
          if (!pcConfig) {
            pcConfig = {
              iceServers: []
            };
          }
          pcConfig.certificates = [cert];
          window.pc = new RTCPeerConnection(pcConfig);
          callback();
        })
        .catch(err => {
          callback(err);
        });
      } else {
        window.pc = new RTCPeerConnection(pcConfig);
        callback();
      }
    }, pcConfig, keygenAlgorithm);
  }
  this.driver.executeScript(pcConfig => {
    window.pc = new RTCPeerConnection(pcConfig);
  }, pcConfig);
};

WebRTCClient.prototype.generateCertificate = function(keygenAlgorithm) {
  return this.driver.executeAsyncScript(function(keygenAlgorithm) {
    var callback = arguments[arguments.length - 1];
    RTCPeerConnection.generateCertificate(keygenAlgorithm)
    .then(cert => {
      callback(cert);
    })
    .catch(err => {
      callback(err);
    });
  }, keygenAlgorithm);
};

WebRTCClient.prototype.enumerateDevices = function() {
  return this.driver.executeAsyncScript(() => {
    var callback = arguments[arguments.length - 1];

    navigator.mediaDevices.enumerateDevices()
    .then((devices) => {
      return devices.map((device) => {
        return {
          deviceId: device.deviceId,
          kind: device.kind,
          label: device.label,
          groupId: device.groupId,
        };
      });
    })
    .then((devices) => {
      callback(devices);
    });
  });
};
WebRTCClient.prototype.getUserMedia = function(constraints) {
  return this.driver.executeAsyncScript(function(constraints) {
    var callback = arguments[arguments.length - 1];

    if (!window.localStreams) {
      window.localStreams = {};
    }

    navigator.mediaDevices.getUserMedia(constraints)
    .then((stream) => {
      window.localstream = stream;
      window.localStreams[stream.id] = stream;
      callback({id: stream.id, tracks: stream.getTracks().map((t) => {return {id: t.id, kind: t.kind};})});
    })
    .catch(err => {
      callback(err);
    });
  }, constraints || {audio: true, video: true})
  .then((streamObj) => {
    var stream = new MediaStream();
    stream.id = streamObj.id;
    stream.tracks = streamObj.tracks;
    return stream;
  });
};

WebRTCClient.prototype.addStream = function(stream) {
  return this.driver.executeScript((stream) => {
    pc.addStream(stream ? localStreams[stream.id] : localstream);
  }, stream);
};

WebRTCClient.prototype.addTrack = function(track, stream) {
  return this.driver.executeScript((track, stream) => {
    stream = localStreams[stream.id];
    track = stream.getTracks().find(t => t.id === track.id);
    pc.addTrack(track, stream);
  }, track, stream);
}

WebRTCClient.prototype.createDataChannel = function(label, dict) {
  return this.driver.executeScript((label, dict) => {
    pc.createDataChannel(label, dict);
  }, label, dict);
}

WebRTCClient.prototype.createOffer = function(offerOptions) {
  return this.driver.executeAsyncScript(function(offerOptions) {
    var callback = arguments[arguments.length - 1];

    pc.createOffer(offerOptions)
    .then(offer => {
      callback(offer);
    })
    .catch(err => {
      callback(err);
    });
  }, offerOptions);
};

WebRTCClient.prototype.createAnswer = function() {
  return this.driver.executeAsyncScript(function() {
    var callback = arguments[arguments.length - 1];

    return pc.createAnswer()
    .then(answer => {
      callback(answer);
    })
    .catch(err => {
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
          var parts = desc.sdp.split('\r\nm=').map((part, index) => (index > 0 ? 'm=' + part : part).trim() + '\r\n');
          for (var i = 1; i < parts.length; i++) {
            parts[i] += 'a=end-of-candidates\r\n';
          }
          desc.sdp = parts.join('');
        }

        callback(desc);
      }
    };

    pc.setLocalDescription(new RTCSessionDescription(desc))
    .catch(err => {
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
    .then(() => {
      callback();
    })
    .catch(err => {
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
    .then(stats => {
      callback(stats.entries ?  [... stats.entries()] : stats);
    });
  })
  .then(stats => {
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
