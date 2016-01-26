var fs = require('fs');
var Promise = require("bluebird");
var BiomioNode = require('../');
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
  appType: 'probe', // probe | extension
  onGetResources: function(callback) {
    callback( config.resources );
  },
  onTry: function(data) {
    console.info('onTry ', data);

    //return new Promise(function (resolve, reject) {
    //  resolve(["true"]);
    //});

    return "true";
  },

  /* optional parameters */
  osId: 'linux',
  headerOid: 'clientHeader',
  devId: 'node_js_lib'
}

var userToken = 'biomio.vk.test@gmail.com'; // for now we use email

var conn = new BiomioNode(userToken, options);


/* next interface */

///** init connection to Gate */
//var conn = new BiomioNode({
//  url: config.url,
//  appId: config.appId,
//  appKey: privateKey
//});
//
///** run auth if it's extension app */
//conn.auth(userToken);
//
//conn.on('get-resource', function(req, callback) {
//  callback({});
//});
//
//conn.on('try', function(req, callback) {
//  if(req.interactive) {
//    /* display form */
//
//  } else {
//    var credentials = req.resources;
//    /* check credentials on LDAP server */
//  }
//});
//
//conn.on('auth.result', function(req) {
//  return {};
//});
//
//conn.on('auth.cancel', function(req) {
//  return {};
//});

