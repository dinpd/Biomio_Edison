/**
 * Holds information about current client. Has functionality to check if client exists
 * and to run authentication for this client.
 */
var StateMachine = require('javascript-state-machine');
var logger = require('./logger_impl');
var internal_state_machine = require('./internal_state_machine');

var STATE_INITIALIZE = 'initialize_state',
    STATE_READY = 'ready_state',
    STATE_RPC_CALL_AUTH = 'rpc_call_auth_state',
    STATE_RPC_CALL_USER_CHECK = 'rpc_call_user_check',
    STATE_FINISH = 'finish_state';

function ClientInterface(client_key, options, ready_callback) {

    internal_state_machine.init(options);

    this._client_key = client_key;
    this._ready_callback = ready_callback;

    this._on_behalf_of = null;
    this._status = null;
    this._result = false;
    this._msg = null;
    this._timeout = null;

    this._client_callback = null;
    this._state_machine = StateMachine.create({
        initial: 'none',
        events: [
            {name: '_initialize', from: 'none', to: STATE_INITIALIZE},
            {
                name: '_ready',
                from: [STATE_INITIALIZE, STATE_RPC_CALL_AUTH, STATE_RPC_CALL_USER_CHECK],
                to: STATE_READY
            },
            {name: '_rpc_auth', from: STATE_READY, to: STATE_RPC_CALL_AUTH},
            {name: '_check_user', from: STATE_READY, to: STATE_RPC_CALL_USER_CHECK},
            {name: '_finish', from: '*', to: STATE_FINISH}
        ],
        callbacks: {
            on_initialize: this._onInitialize,
            on_ready: this._onReady,
            on_rpc_auth: this._onRpcCallAuth,
            on_check_user: this._onCheckUser,
            on_finish: this._onFinish
        }
    });
    this._state_machine._initialize('Initializing internal state machine.', this);
}

ClientInterface.prototype._onInitialize = function (event, from, to, msg, self) {
    if (typeof  msg != 'undefined' && msg) {
        logger.log('info', msg);
    } else {
        logger.log('info', 'Initializing internal state machine.');
    }
    if (!internal_state_machine.is_ready()) {
        internal_state_machine.add_ready_callback(self._get_internal_ready_callback());
        if (internal_state_machine.is_disconnected()) {
            internal_state_machine.connect('Initializing socket connection...');
        }
    } else {
        self._get_internal_ready_callback()();
    }
};

ClientInterface.prototype._get_internal_ready_callback = function () {
    var self = this;
    return function (error) {
        if (typeof error != 'undefined' && error) {
            logger.log('error', 'Error during initialization: ', error.error);
            self._state_machine._finish('Error during initialization: ' + error.error);
        } else {
            self._state_machine._ready('Client interface is ready.', self);
        }
    };
};

ClientInterface.prototype._onReady = function (event, from, to, msg, self) {
    logger.log('info', msg);
    if (from == STATE_INITIALIZE) {
        setTimeout(self._ready_callback, 1);
    }
};

ClientInterface.prototype._onRpcCallAuth = function (event, from, to, msg, self) {
    logger.log('info', msg);
    internal_state_machine.run_verification(self._on_behalf_of);
};

ClientInterface.prototype._onCheckUser = function (event, from, to, msg, self) {
    logger.log('info', msg);
    internal_state_machine.check_if_user_exists(self._client_key, self._get_rpc_response_callback());
};

ClientInterface.prototype._onFinish = function (event, from, to, msg, self) {
    logger.log('info', msg);
    internal_state_machine.unsubscribe_from_responses(self._on_behalf_of);
};

ClientInterface.prototype._get_rpc_response_callback = function () {
    var self = this;
    return function (response) {
        logger.log('info', 'Received RPC response: ', response);
        var result = false;
        var switch_to_ready = true;
        if ('error' in response) {
            self._result = false;
            self._status = 'error';
            self._timout = null;
            self._msg = response.error;
            if (self._client_callback != null) {
                if (self._state_machine.is(STATE_RPC_CALL_USER_CHECK)) {
                    setTimeout(function () {
                        self._client_callback(false, response.error);
                    }, 1);
                } else {
                    setTimeout(function () {
                        self._client_callback(self.get_current_status());
                    }, 1);
                }
            }
            self._state_machine._finish('Received error from internal state machine: ' + response.error, self);
        } else if (self._state_machine.is(STATE_RPC_CALL_USER_CHECK)) {
            var temp_res = {};
            for (var i = 0; i < response.keys.length; i++) {
                temp_res[response.keys[i]] = response.values[i];
            }
            if (temp_res.hasOwnProperty('exists') && temp_res.hasOwnProperty('email')) {
                if (temp_res.exists) {
                    self._on_behalf_of = temp_res.email;
                    internal_state_machine.subscribe_for_responses(self._on_behalf_of, self._get_rpc_response_callback());
                    result = true;
                } else {
                    result = false;
                }
            }
        } else if (self._state_machine.is(STATE_RPC_CALL_AUTH)) {
            if (response.keys.indexOf('error') != -1) {
                self._result = false;
                self._status = 'error';
                self._msg = response.values[0];
                self._timeout = null;
            } else if (response.status == 'inprogress') {
                self._status = 'in_progress';
                self._timeout = response.values[1];
                self._msg = response.values[0];
                self._result = false;
            } else {
                self._result = true;
                self._status = 'completed';
                self._timeout = null;
                self._msg = 'Authentication was successful';
            }
            if (self._status == 'in_progress') {
                switch_to_ready = false;
            }
            result = self.get_current_status();
        }
        if (switch_to_ready) {
            self._state_machine._ready('Finished RPC processing, becoming READY.', self);
        }
        if (self._client_callback != null) {
            setTimeout(function () {
                self._client_callback(result);
            }, 1);
        }
    };
};


ClientInterface.prototype.user_exists = function (response_callback) {
    if (typeof response_callback != 'undefined' && response_callback) {
        this._client_callback = response_callback;
    } else {
        this._client_callback = null;
    }
    if (this._validate_state()) {
        this._state_machine._check_user('Check if user - ' + this._client_key + ' exists.', this);
    }
};

ClientInterface.prototype.run_auth = function (response_callback) {
    if (typeof response_callback != 'undefined' && response_callback) {
        this._client_callback = response_callback;
    } else {
        this._client_callback = null;
    }
    if (this._validate_state()) {
        if (this._on_behalf_of == null) {
            this._status = 'not_exists';
            this._result = false;
            this._msg = 'It is required to check if user exists first.';
            this._timeout = null;
            if (this._client_callback != null) {
                var self = this;
                setTimeout(function () {
                    self._client_callback(self.get_current_status());
                }, 1);
            }
        } else {
            this._state_machine._rpc_auth('Running authentication on behalf of - ' + this._on_behalf_of, this);
        }
    }
};

ClientInterface.prototype._validate_state = function () {
    if (this._state_machine.is(STATE_FINISH)) {
        logger.log('error', 'Client interface is not initialized. See logs.');
        this._result = false;
        this._status = 'error';
        this._timeout = null;
        this._msg = 'Client interface is not initialized. See logs. Try to re-initialize.';
        if (this._client_callback != null) {
            var self = this;
            setTimeout(function () {
                self._client_callback(false, 'Client interface is not initialized. See logs. Try to re-initialize.');
            }, 1);
        }
        return false;
    }
    return true;
};

ClientInterface.prototype.get_current_status = function () {
    return {
        result: this._result,
        status: this._status,
        msg: this._msg,
        timeout: this._timeout
    };
};

ClientInterface.prototype.finish = function(){
    this._state_machine._finish('Client interactions finalized.', this);
};

module.exports = ClientInterface;
