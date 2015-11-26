var common = require('../../common');
var util = require('util');
var KeyUtil = require('../util');

var RSA = require('./rsa');
var RsaOAEPParams = require('./rsa_oaep_params');

var CKI = common.CKI;
var Enums = common.Enums;
var Type = common.Type;

function RsaOAEP(key, params) {
	if (key) {
		Object.defineProperty(this, "session", {
			get: function () {
				return key.session;
			}
		})
		this.privateKey = key.privateKey;
		this.publicKey = key.publicKey;
		this.params = params || new RsaOAEPParams();
	}
	else
		throw new Error("RsaOAEP.constructor: Constructor must have 2 params (rsaKey, params)");
}
util.inherits(RsaOAEP, RSA);

RsaOAEP.prototype.encrypt = function encrypt(data) {
	return this.session.encrypt(this.publicKey, { name: "RSA_PKCS_OAEP", params: this.params.toCKI() }, data);
}

RsaOAEP.prototype.decrypt = function encrypt(data) {
	return this.session.encrypt(this.privateKey, { name: "RSA_PKCS_OAEP", params: this.params.toCKI() }, data);
}

module.exports = RsaOAEP;