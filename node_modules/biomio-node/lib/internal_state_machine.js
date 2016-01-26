var StateMachine = require("javascript-state-machine");
var Promise = require("bluebird");
var socket_client = require("./websocket_impl");
var logger = require("./logger_impl");
var options;

var STATE_DISCONNECTED = 'disconnected',
  STATE_CONNECTED = 'connected',
  STATE_REGISTRATION_HANDSHAKE = 'registration',
  STATE_REGULAR_HANDSHAKE = 'regular_handshake',
  STATE_READY = 'state_ready';

var subscribed_callbacks = {};

var temp_keys_subscriptions = {};

var ready_callbacks = [];
var lost_connection_callbacks = [];

var pending_requests = {};


/**
 * Handles state machine 'connected' state.
 * @param event
 * @param from
 * @param to
 * @param {string} msg to print inside console.
 */
var onConnect = function (event, from, to, msg) {
  logger.log('info', msg);
  socket_client.initialize_connection(message_listener, error_callback, close_callback);
};

var onRegister = function (event, from, to, msg) {
  logger.log('info', msg);
  socket_client.send_ack_request();
  state_machine.ready('Handshake successful, going to READY.');
};

var onHandshake = function (event, from, to, msg) {
  logger.log('info', msg);
  socket_client.send_digest_request();
  state_machine.ready('Handshake successful, going to READY.');
};

var onReady = function (event, from, to, msg) {
  console.info('onReady');
  logger.log('info', msg);
  socket_client.start_connection_loops();
  for (var i = 0; i < ready_callbacks.length; i++) {
    var ready_callback = ready_callbacks[i];
    setTimeout(ready_callback, 1);
  }
  ready_callbacks = [];
  var curr_pending_requests = pending_requests;
  pending_requests = {};
  for (var pending_request in curr_pending_requests) {
    if (curr_pending_requests.hasOwnProperty(pending_request)) {
      curr_pending_requests[pending_request](pending_request);
      //if(curr_pending_requests[pending_request] == 'check_user'){
      //    state_machine.check_if_user_exists(pending_request);
      //}else{
      //    state_machine.run_verification(pending_request);
      //}
    }
  }
};

var onDisconnect = function (event, from, to, msg) {
  logger.log('info', msg);
  socket_client.reset_connection_data();
  for (var i = 0; i < lost_connection_callbacks.length; i++) {
    var lost_connection_callback = lost_connection_callbacks[i];
    setTimeout(lost_connection_callback, 1);
  }
  lost_connection_callbacks = [];
};

var state_machine = StateMachine.create({
  initial: STATE_DISCONNECTED,
  events: [
    {name: 'connect', from: STATE_DISCONNECTED, to: STATE_CONNECTED},
    {name: 'register', from: STATE_CONNECTED, to: STATE_REGISTRATION_HANDSHAKE},
    {name: 'handshake', from: STATE_CONNECTED, to: STATE_REGULAR_HANDSHAKE},
    {
      name: 'ready',
      from: [STATE_REGISTRATION_HANDSHAKE, STATE_REGULAR_HANDSHAKE],
      to: STATE_READY
    },
    {name: 'disconnect', from: '*', to: STATE_DISCONNECTED}
  ],
  callbacks: {
    onconnect: onConnect,
    onregister: onRegister,
    onhandshake: onHandshake,
    onready: onReady,
    ondisconnect: onDisconnect
  }
});

state_machine.add_lost_connection_callback = function (lost_connection_callback) {
  lost_connection_callbacks.push(lost_connection_callback);
};

state_machine.subscribe_for_responses = function (on_behalf_of, callback) {
  subscribed_callbacks[on_behalf_of] = callback;
};

state_machine.unsubscribe_from_responses = function (on_behalf_of) {
  logger.log('info', 'Unsubscribing client from response callbacks: ', on_behalf_of);
  delete subscribed_callbacks[on_behalf_of];
};

state_machine.is_ready = function () {
  return state_machine.is(STATE_READY);
};

state_machine.is_disconnected = function () {
  return state_machine.is(STATE_DISCONNECTED);
};

state_machine.add_ready_callback = function (callback) {
  ready_callbacks.push(callback);
};

state_machine.check_if_user_exists = function (client_key, temp_callback) {
  pending_requests[client_key] = state_machine.check_if_user_exists;
  if (typeof temp_callback != 'undefined' && temp_callback) {
    temp_keys_subscriptions[client_key] = temp_callback;
  }
  socket_client.send_check_user_request(client_key);
};

state_machine.run_verification = function (on_behalf_of) {
  pending_requests[on_behalf_of] = state_machine.run_verification;
  socket_client.send_rpc_auth_request(on_behalf_of);
};

state_machine.init = function (opt) {
  options = opt
  socket_client.init(opt);
}

module.exports = state_machine;

var message_listener = function (message) {
  var parsed_message = JSON.parse(message);
  logger.log('info', 'Parsed message - ', parsed_message);

  switch (parsed_message.msg.oid) {
    case 'bye':
      logger.log('info', 'Received BYE message from server.');
      var disc_msg = 'Unknown reason.';
      if (parsed_message.hasOwnProperty('status')) {
        disc_msg = parsed_message.status;
      }

      state_machine.disconnect('Server sent bye, reason: ' + disc_msg);
      if (disc_msg.indexOf('Invalid token') != -1) {
        state_machine.connect('Re-initializing socket connection due to invalid token error.');
      }

      break;
    case 'nop':
      socket_client.set_nop_tokens(parsed_message);
      break;
    case 'getResources':
      socket_client.send_rpc_resources_request();
      break;
    case 'try':
      var policy = parsed_message.msg.policy.condition;
      var resource = parsed_message.msg.resource;

      if (typeof options.onTry === 'function') {

        /** parse policy and requested resources */
        switch(policy) {
          case 'all':
          case 'any':
            Promise.map(resource, function(item) {
              return options.onTry(item);
            }).then(function(result) {
              console.log("done", result);
              // result = [...]

              socket_client.send_rpc_try_request(result);
            });
            break;
          default:
            throw Error('Policy: ' + policy + ' is not recognized!');
        }

      } else {
        throw Error('onTry callback is not specified!');
      }

      break;
    default:
      if (state_machine.is(STATE_CONNECTED)) {
        socket_client.set_connection_data(parsed_message);
        if ('key' in parsed_message.msg) {
          state_machine.register('App was registered, sending ack.');
        } else {
          state_machine.handshake('Sending digest.');
        }

        //state_machine.handshake('Sending digest.');
      } else if (state_machine.is(STATE_READY)) {
        if (parsed_message.msg.oid == 'rpcResp') {
          var response = parsed_message.msg.data;
          response.status = parsed_message.msg['rpcStatus'];
          var on_behalf_of = parsed_message.msg['onBehalfOf'];
          if (pending_requests.hasOwnProperty(on_behalf_of)) {
            delete pending_requests[on_behalf_of];
          }
          if (subscribed_callbacks.hasOwnProperty(on_behalf_of)) {
            subscribed_callbacks[on_behalf_of](response);
          } else if (temp_keys_subscriptions.hasOwnProperty(on_behalf_of)) {
            temp_keys_subscriptions[on_behalf_of](response);
            delete temp_keys_subscriptions[on_behalf_of];
          }
        }
      }
  }

};

var error_callback = function (error) {
  var disc_msg = 'Socket connection closed.';
  if (typeof error != 'undefined' && error) {
    disc_msg = 'Socket error! - ' + error.toString();
  }
  for (var subscribed_key in subscribed_callbacks) {
    if (subscribed_callbacks.hasOwnProperty(subscribed_key)) {
      subscribed_callbacks[subscribed_key]({error: disc_msg});
    }
  }
  subscribed_callbacks = {};
  for (var temp_key in temp_keys_subscriptions) {
    if (temp_keys_subscriptions.hasOwnProperty(temp_key)) {
      temp_keys_subscriptions[temp_key]({error: disc_msg});
    }
  }
  temp_keys_subscriptions = {};
  for (var i = 0; i < ready_callbacks.length; i++) {
    ready_callbacks[i]({error: disc_msg});
  }
  ready_callbacks = [];
  state_machine.disconnect(disc_msg);
};

var close_callback = function () {
  if (!state_machine.is(STATE_DISCONNECTED)) {
    state_machine.disconnect('Socket connection was closed becoming DISCONNECTED.');
  }
};