/*jslint node:true, vars:true, bitwise:true, unparam:true */
/*jshint unused:true */

var noble = require('noble');

var h = 0;
var found = false;
var myPeripheral;
var peripheralName = "Find Me";

var mraa = require('mraa');

var myDigitalPin = new mraa.Gpio(4);
myDigitalPin.dir(mraa.DIR_OUT);


// BIOMIO
var fs = require('fs');
var BiomioNode = require('biomio-node');
var config = require('./config');

try {
  var privateKey = fs.readFileSync(__dirname + "/private.key").toString();
} catch (e) {
  console.error('Can\'t find/read file "private.key"!');
  process.exit(1);
}


var options = {
  gateURL: config.gateURL,
  appId: config.appId,
  appKey: privateKey,
  appType: 'extension',

  /* optional parameters */
  osId: 'linux',
  headerOid: 'clientHeader',
  devId: 'node_js_lib'
}

var userToken = 'user@gmail.com'; // for now we use end user's email

var conn = new BiomioNode(userToken, options, function() {
	 console.info('Ready!');
});

// BIOMIO


noble.on('stateChange', scan);

function scan(state){
  if (state === 'poweredOn') {
    noble.startScanning();
    console.log("Started scanning...");   
  } else {
    noble.stopScanning();
    console.log("Is Bluetooth on?");
  }
}

noble.on('discover', discoverPeripherals);

function discoverPeripherals(peripheral) {
  if(peripheral.advertisement.localName == peripheralName){
    console.log("found my device");
  
    noble.stopScanning();

    myPeripheral = peripheral;
    peripheral.connect(explorePeripheral);
  }
}

function explorePeripheral(error) {
  console.log("connected to "+myPeripheral.advertisement.localName);
  if (h == 0) h = setInterval(updateRSSI, 60);
  myPeripheral.on('disconnect', disconnectPeripheral);
}

function updateRSSI(){
    myPeripheral.updateRssi(function(error, rssi){
    if(rssi < 0 && -rssi < 30 && !found) {
        console.log("FOUND! RSSI: "+rssi);
        
        // <-- BIOMIO
      
        /* check if user already registered */
        conn.user_exists(function(exists) {
          console.info('user exists ', exists);

          if (exists) {

            try {

              /** call RPC method "run_auth" */
              conn.run_auth(function (result) {
                /* callback will be called few times: in_progress, completed */

                if (result.status === 'completed') {
                  console.log('Authentication is successful');
		  myDigitalPin.write(1);
		  setTimeout(function(){myDigitalPin.write(0);}, 2000);
                }

              });

            } catch(ex) {
              console.warn('EXCEPTION: ', ex);
            }

          } else {
            console.log('User is not found!');
          }

        });
      
      // <-- BIOMIO
      
        
        found = true;
    }
    else if(-rssi > 50 && found) {
        console.log("LOST! RSSI: "+rssi);
        found = false;
    }
  });
}

function disconnectPeripheral(){
      console.log('peripheral disconneted');
      if(h != 0) {
        clearInterval(h);
        h = 0;
      }
      noble.startScanning();
}


