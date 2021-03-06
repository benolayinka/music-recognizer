var AudioContext = window.AudioContext || window.webkitAudioContext;
var audioContext; //new audio context to help us record

window.requestAnimFrame = (function(){
              return  window.requestAnimationFrame       ||
                      window.webkitRequestAnimationFrame ||
                      window.mozRequestAnimationFrame    ||
                      function(callback, element){
                        window.setTimeout(callback, 1000 / 60);
                      };
            })();

var AudioContext = window.AudioContext || window.webkitAudioContext;
var audioContext = new AudioContext();

var master = audioContext.createGain();
master.gain.value = 1;

function Track(name, element) {

  	this.name = name;
    this.element = element;

  	this.dbs = -99; //hack
	this.smoothing = 0.95;
	this.smooth = 0;
	this.sampleSize = 1024;

	this.input = null;
	this.output = null;

	this.audioplaying = false;

	//var e = document.createElement("div");
	var e = this.element
	e.track = this;

	var label = document.createElement("label");
	label.innerText = "Audio input source: ";
	e.appendChild(label)

	var source = document.createElement("select");
	this.source = source;
	source.onchange = this.start.bind(this);
	e.appendChild(source);

	e.appendChild(document.createElement("br"));

	var vis = document.createElement("label");
	vis.innerText = "Visualizer: ";
	e.appendChild(vis)

	var graph = document.createElement("select");
	var option = document.createElement('option');
	option.text = "Time";
	option.value = 1;
	graph.appendChild(option);
	option = document.createElement('option');
	option.text = "Frequency";
	option.value = 0;
	graph.appendChild(option);
	e.appendChild(graph);
	this.vis = graph;

	e.appendChild(document.createElement("br"));

	var mon = document.createElement("label");
	mon.innerText = "Monitor: ";
	e.appendChild(mon)

	var monitor = document.createElement("input");
	monitor.type = "checkbox";
	monitor.onchange = this.monitor.bind(this);
	this.monitor = monitor
	e.appendChild(monitor)

	var canvas = document.createElement("canvas");
	canvas.className = "visualizer";
	canvas.width = 512;
	canvas.height = 256;
	this.canvas = canvas;
	this.ctx = canvas.getContext("2d");
	e.appendChild(canvas);

	e.appendChild(document.createElement("br"));

	var db = document.createElement("canvas");
	db.className = "db";
	db.width = 512;
	db.height = 50;
	this.db = db;
	this.dbx = db.getContext("2d");
	e.appendChild(db);

	var dialLow = document.createElement("input");
	dialLow.type = "text";
	dialLow.classList.add(this.name + 'dialLow');
	dialLow.value = 66;
	this.dialLow = dialLow;
	var dialMid = document.createElement("input");
	dialMid.type = "text";
	dialMid.classList.add(this.name + 'dialMid');
	dialMid.value = 66;
	this.dialMid = dialMid;
	var dialHigh = document.createElement("input");
	dialHigh.type = "text";
	dialHigh.classList.add(this.name + 'dialHigh');
	dialHigh.value = 66;
	this.dialHigh = dialHigh;
	var dialFilter = document.createElement("input");
	dialFilter.type = "text";
	dialFilter.classList.add(this.name + 'dialFilter');
	dialFilter.value = 0;
	this.dialFilter = dialFilter;
	
	e.appendChild(dialLow);
	e.appendChild(dialMid);
	e.appendChild(dialHigh);
	e.appendChild(dialFilter);

	$("." + this.name + "dialLow").knob(
		{'min':0,
		 'max':127,
	    'width':100,
	    'height':100,
	    'fgColor':'#00FF00',
	    'angleOffset':-125, 
	    'angleArc':250,
	    'displayInput':true,
	    'cursor':20,
	    'skin':'tron',
	    'change' : this.lowEQ.bind(this)
	    	}
		).val(66).trigger('change');
		    
	
	$("." + this.name + "dialMid").knob(
		{'min':0,
		 'max':127,
		    'width':100,
		    'height':100,
		    'fgColor':'#0000FF',
		    'angleOffset':-125,
		    'angleArc':250, 
		    'displayInput':true,
		    'cursor':20,
		    'skin':'tron',
		    'change' : this.midEQ.bind(this)
		    }
		    ).val(66).trigger('change');

	$("." + this.name + "dialHigh").knob(
		{'min':0,
		 'max':127,
		    'width':100,
		    'height':100,
		    'fgColor':'#FE2E2E',
		    'angleOffset':-125, 
		    'angleArc':250,
		    'displayInput':true,
		    'cursor':20,
		    'skin':'tron',
		    'change' : this.highEQ.bind(this)
		    }
		    ).val(66).trigger('change');

	$("." + this.name + "dialFilter").knob(
		{'min':0,
		 'max':127,
		    'width':100,
		    'height':100,
		    'fgColor':'#000000',
		    'angleOffset':-125, 
		    'angleArc':250,
		    'displayInput':true,
		    'cursor':20,
		    'skin':'tron',
		    'change' : this.filterEQ.bind(this)
		    }
		    ).val(0).trigger('change');
	
	navigator.mediaDevices.enumerateDevices().then(this.gotDevices.bind(this));
}

Track.prototype.lowEQ = function(val) {
	this.low.gain.value = (val - 64)/2
  }

Track.prototype.midEQ = function(val) {
	this.mid.gain.value = (val - 64)/2
  }

Track.prototype.highEQ = function(val) {
	this.high.gain.value = (val - 64)/2
  }

Track.prototype.filterEQ = function(val) {
	var log = 10000*( Math.pow(2,((val/127.0*4)-1)) - 0.5)/7.5;
	this.filter.frequency.value = log;
	console.log('filter changed to ' + log)
}

Track.prototype.start = function() {
	if (window.stream) {
    window.stream.getTracks().forEach(track => {
      track.stop();
    });
  }

  const audioSource1 = this.source.value;
  const constraints1 = {
    audio: {deviceId: audioSource1 ? {exact: audioSource1} : undefined},
    video: false
  };

  navigator.mediaDevices.getUserMedia(constraints1).then(this.startStream.bind(this));
}

Track.prototype.startStream = function(stream) {

		this.input = audioContext.createMediaStreamSource(stream);

		this.setupAudioNodes();

		this.audioPlaying = true;

	    var onaudio = function (track) {
	        // get the Time Domain data for this sample
	        this.analyserNode.getFloatTimeDomainData(this.amplitudeArray);
	        this.analyserNode.getByteFrequencyData(this.frequencyArray);
	        // draw the display if the audio is playing
	        if (this.vis.value == 1) {
	            requestAnimFrame(this.drawTimeDomain.bind(this));
	            requestAnimFrame(this.drawdb.bind(this));
	        }
	        else {
	        	requestAnimFrame(this.drawFrequencyDomain.bind(this));
	            requestAnimFrame(this.drawdb.bind(this));
	        }
	    }

	    // trigger the audio analysis and draw the results
	    this.javascriptNode.onaudioprocess = onaudio.bind(this);
	}

Track.prototype.setupAudioNodes = function() {

	this.low = audioContext.createBiquadFilter();
	this.low.type = "lowshelf";
	this.low.frequency.value = 320.0;
	this.low.gain.value = 0.0;

	this.mid = audioContext.createBiquadFilter();
	this.mid.type = "peaking";
	this.mid.frequency.value = 1000.0;
	this.mid.Q.value = 0.5;
	this.mid.gain.value = 0.0;

	this.high = audioContext.createBiquadFilter();
	this.high.type = "highshelf";
	this.high.frequency.value = 3200.0;
	this.high.gain.value = 0.0;

	this.filter = audioContext.createBiquadFilter();
	this.filter.frequency.value = 0.0;
	this.filter.Q.value = 13;
	this.filter.type = "highpass"

	this.gainNode = audioContext.createGain();
	this.gainNode.gain.value = 0;

    this.analyserNode   = audioContext.createAnalyser();
    this.analyserNode.fftSize = this.sampleSize;

    this.javascriptNode = audioContext.createScriptProcessor(this.sampleSize, 1, 1);

    // Create the array for the data values
    this.amplitudeArray = new Float32Array(this.analyserNode.frequencyBinCount);
    this.frequencyArray = new Uint8Array(this.analyserNode.frequencyBinCount);
    // Now connect the nodes together
    this.input.connect(this.low);
    this.low.connect(this.mid);
    this.mid.connect(this.high);
    this.high.connect(this.filter);
    this.filter.connect(this.analyserNode);
    this.analyserNode.connect(this.javascriptNode);
    this.javascriptNode.connect(audioContext.destination);

    this.filter.connect(this.gainNode);
    this.gainNode.connect(audioContext.destination)

	this.output = this.filter;
	this.output.connect(master);

    if(this.monitor.checked){
    	this.gainNode.gain.setValueAtTime(1, audioContext.currentTime);
    }
    else {
    	this.gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    }
}

Track.prototype.monitor = function() {
	if(this.monitor.checked){
    	this.gainNode.gain.setValueAtTime(1, audioContext.currentTime);
    }
    else {
    	this.gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    }
}

Track.prototype.gotDevices = function(deviceInfos) {
  // Handles being called several times to update labels. Preserve values.
  const selectors = [this.source]
  const values = selectors.map(select => select.value);
  selectors.forEach(select => {
    while (select.firstChild) {
      select.removeChild(select.firstChild);
    }
  });
  for(item in selectors){
	  for (let i = 0; i !== deviceInfos.length; ++i) {
	    const deviceInfo = deviceInfos[i];
	    const option = document.createElement('option');
	    option.value = deviceInfo.deviceId;
	    if (deviceInfo.kind === 'audioinput') {
	      option.text = deviceInfo.label || `microphone ${selectors[item].length + 1}`;
	      selectors[item].appendChild(option);
	    } else {
	      console.log('Some other kind of source/device: ', deviceInfo);
	    }
	}
  }
  selectors.forEach((select, selectorIndex) => {
    if (Array.prototype.slice.call(select.childNodes).some(n => n.value === values[selectorIndex])) {
      select.value = values[selectorIndex];
    }
  });
}

Track.prototype.clearCanvas = function() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
}

Track.prototype.drawTimeDomain = function() {
	this.clearCanvas();
	for (var i = 0; i < this.amplitudeArray.length; i++) {
        var value = this.amplitudeArray[i]/2 + 0.5; //convert [-1 1] float to [0 to 1]
        var y = this.canvas.height - (this.canvas.height * value) - 1;
        this.ctx.fillStyle = '#008000';
        this.ctx.fillRect(i, y, 2, 2);
    }
}

Track.prototype.drawFrequencyDomain = function() {
	this.clearCanvas();
	for (var i = 0; i < this.frequencyArray.length; i++) {
        var value = this.frequencyArray[i]/256; //convert [-1 1] float to [0 to 1]
        var y = this.canvas.height - (this.canvas.height * value) - 1;
        this.ctx.fillStyle = '#FB3005';
        this.ctx.fillRect(i, y, 2, 2);
    }
}

Track.prototype.cleardb = function() {
    this.dbx.clearRect(0, 0, this.db.width, this.db.height);
}


Track.prototype.drawdb = function() {
	this.cleardb();
	var sum = 0;
	var value = 0;
	for (var i = 0; i < this.amplitudeArray.length; i++) {
        value = this.amplitudeArray[i];
        sum += value * value;
    	}

    // ... then take the square root of the sum.
    var rms =  Math.sqrt(sum / this.amplitudeArray.length);
    this.smooth = Math.max(rms, this.smoothing*this.smooth);
    dbs = Math.log10(this.smooth);
    var gradient=this.dbx.createLinearGradient(0,0,600,0);
	gradient.addColorStop(0,"green");
	gradient.addColorStop(0.6,"orange");
	gradient.addColorStop(0.8,"red");
    this.dbx.fillStyle = gradient;
    this.dbx.fillRect(0, 0, this.db.width+dbs*this.db.width, this.db.height);
}

function gotDevices(deviceInfos) {
  // Handles being called several times to update labels. Preserve values.
  const values = selectors.map(select => select.value);
  selectors.forEach(select => {
    while (select.firstChild) {
      select.removeChild(select.firstChild);
    }
  });
  for(item in selectors){
	  for (let i = 0; i !== deviceInfos.length; ++i) {
	    const deviceInfo = deviceInfos[i];
	    const option = document.createElement('option');
	    option.value = deviceInfo.deviceId;
	    if (deviceInfo.kind === 'audioinput') {
	      option.text = deviceInfo.label || `microphone ${selectors[item].length + 1}`;
	      selectors[item].appendChild(option);
	    } else {
	      console.log('Some other kind of source/device: ', deviceInfo);
	    }
	}
  }
  selectors.forEach((select, selectorIndex) => {
    if (Array.prototype.slice.call(select.childNodes).some(n => n.value === values[selectorIndex])) {
      select.value = values[selectorIndex];
    }
  });
}