function Headers(options) {
  this.APP_ID = options.appId || null;
  this.APP_TYPE = options.appType || 'extension'; // extension or probe
  this.OS_ID = options.osId || 'linux';
  this.HEADER_OID = options.headerOid || 'clientHeader';
  this.DEV_ID = options.devId || 'node_js_lib';

  this.PROTO_VERSION = "1.0";
  this.RPC_PGP_NAMESPACE = 'pgp_extension_plugin';
  this.RPC_AUTH_CLIENT_NAMESPACE = 'auth_client_plugin';
  this.RPC_GET_PASS_PHRASE_METHOD = 'get_pass_phrase';
  this.RPC_GET_PUBLIC_KEY_METHOD = 'get_users_public_pgp_keys';
  this.RPC_PROCESS_AUTH_METHOD = 'process_auth';
  this.RPC_CHECK_USER_EXISTS_METHOD = 'check_user_exists';

  this.REQUEST_HEADER = {
    protoVer: this.PROTO_VERSION,
    seq: 0,
    oid: this.HEADER_OID,
    appId: this.APP_ID,
    appType: this.APP_TYPE,
    osId: this.OS_ID,
    devId: this.DEV_ID
  };

  this.RPC_REQUEST = {
    msg: {
      oid: 'rpcReq',
      onBehalfOf: 'STRING_USER_EMAIL',
      namespace: 'ONE OF constant namespaces',
      call: 'STRING_METHOD_NAME',
      data: {
        keys: [],
        values: []
      }
    },
    header: this.REQUEST_HEADER
  };

/*  this.REGISTRATION_REQUEST = {
    msg: {
      oid: "clientHello",
      secret: "STRING_VALUE"
    },
    header: this.REQUEST_HEADER
  };*/

  this.ACK_REQUEST = {
    msg: {
      oid: 'ack'
    },
    header: this.REQUEST_HEADER // + token
  };

  this.NOP_REQUEST = {
    msg: {
      oid: 'nop'
    },
    header: this.REQUEST_HEADER // + token = refresh_token
  };

  this.REGULAR_REQUEST = {
    msg: {
      oid: "clientHello"
    },
    header: this.REQUEST_HEADER

  };

  this.REGULAR_DIGEST_REQUEST = {
    msg: {
      oid: "auth",
      key: "STRING"
    },
    header: this.REQUEST_HEADER
  };

  this.BYE_REQUEST = {
    msg: {
      oid: "bye"
    },
    header: this.REQUEST_HEADER
  };

  this.RESOURCES_REQUEST = {
    msg: {
      oid: "resources",
      data: []
    },
    header: this.REQUEST_HEADER
  };

  this.TRY_REQUEST = {
    msg: {
      oid: "probe",
      probeData: {
        oid: "",
        samples: ""
      },
      probeId: 0,
      probeStatus: ""
    },
    header: this.REQUEST_HEADER
  };

  this.CANCEL_TRY_REQUEST = {
    msg: {
      oid: "probe",
      probeStatus: "canceled"
    },
    header: this.REQUEST_HEADER
  };

}

/**
 * Generates handshake request.
 * @param {string=} secret - user defined secret
 * @returns {string}
 */
Headers.prototype.get_handshake_request = function () {
  return JSON.stringify(this.REGULAR_REQUEST);
};

Headers.prototype.get_ack_request = function (token) {
  var request = this.ACK_REQUEST;
  request.header.token = token;
  return JSON.stringify(request);
};

/**
 * Generates digest request.
 * @param {string} key - digest.
 * @param {string} token
 * @returns {string}
 */
Headers.prototype.get_digest_request = function (key, token) {
  var request = this.REGULAR_DIGEST_REQUEST;

  request.msg.key = key;
  request.header = this.get_header_string(token);

  return JSON.stringify(request);
};

/**
 * Generates custom request based on request type.
 * @param {string} request type.
 * @param {string} token
 * @returns {string}
 */
Headers.prototype.get_custom_request = function (request, token) {
  request.header.token = token;
  return JSON.stringify(request);
};

Headers.prototype.get_nop_request = function (token) {
  var request = this.NOP_REQUEST;
  request.header.token = token;
  return JSON.stringify(request);
};

/**
 * Increases socket requests counter.
 */
Headers.prototype.increase_request_counter = function () {
  this.REQUEST_HEADER.seq += 2;
};

/**
 * Generates header for digest.
 * @param {string} token
 * @returns {string}
 */
Headers.prototype.get_header_string = function (token) {
  var header = this.REQUEST_HEADER;

  /* order is important! */
  var result = {
    oid: header.oid,
    seq: header.seq,
    protoVer: header.protoVer,
    appType: header.appType,
    appId: header.appId,
    osId: header.osId,
    devId: header.devId,
    token: token
  };

  return result;
};

/**
 * Generates RPC request with given data dictionary.
 * @param {string} token
 * @param {string} method - RPC method type (name).
 * @param {string} onBehalfOf - current user email.
 * @param {Object} keyValueDict - RPC method input values
 * @returns {string}
 */
Headers.prototype.get_rpc_request = function (token, method, onBehalfOf, keyValueDict) {
  var request = this.RPC_REQUEST;
  request.header.token = token;
  request.msg.call = method;
  request.msg.onBehalfOf = onBehalfOf;
  request.msg.call = this.RPC_PGP_NAMESPACE;
  request.msg.data = {
    keys: [],
    values: []
  };
  for (var key in keyValueDict) {
    if (keyValueDict.hasOwnProperty(key)) {
      request.msg.data.keys.push(key);
      request.msg.data.values.push(keyValueDict[key]);
    }
  }
  return JSON.stringify(request);
};

Headers.prototype.get_rpc_auth_request = function (token, onBehalfOf, keyValueDict) {
  var request = this.RPC_REQUEST;
  request.header.token = token;
  request.msg.namespace = this.RPC_AUTH_CLIENT_NAMESPACE;
  request.msg.call = this.RPC_PROCESS_AUTH_METHOD;
  request.msg.onBehalfOf = onBehalfOf;
  request.msg.data = {
    keys: [],
    values: []
  };
  for (var key in keyValueDict) {
    if (keyValueDict.hasOwnProperty(key)) {
      request.msg.data.keys.push(key);
      request.msg.data.values.push(keyValueDict[key]);
    }
  }
  return JSON.stringify(request);
};

Headers.prototype.get_rpc_check_user_exists_request = function (token, client_key, keyValueDict) {
  var request = this.RPC_REQUEST;
  request.header.token = token;
  request.msg.namespace = this.RPC_AUTH_CLIENT_NAMESPACE;
  request.msg.call = this.RPC_CHECK_USER_EXISTS_METHOD;
  request.msg.onBehalfOf = client_key;
  request.msg.data = {
    keys: [],
    values: []
  };
  for (var key in keyValueDict) {
    if (keyValueDict.hasOwnProperty(key)) {
      request.msg.data.keys.push(key);
      request.msg.data.values.push(keyValueDict[key]);
    }
  }
  return JSON.stringify(request);
};

Headers.prototype.get_rpc_resources_request = function(token, resources) {
  var request = this.RESOURCES_REQUEST;
  request.header.token = token;
  request.msg.data = resources;

  return JSON.stringify(request);
};

Headers.prototype.get_rpc_try_request = function(token, result) {
  var request = this.TRY_REQUEST;
  request.header.token = token;
  request.msg.probeData.oid = "touchIdSamples";
  request.msg.probeData.samples = result;
  request.msg.probeId = 0;
  request.msg.probeStatus = 'success';

  return JSON.stringify(request);
};

module.exports = Headers;