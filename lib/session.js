var common = require('./common');
var base64url = require("base64url");
var NamedCurves = require("./keys/ecdsa/ecdsa_curve");

var Ref = common.Ref;
var RefArray = common.RefArray;
var CKI = common.CKI;
var ERROR = common.ERROR;
var Type = common.Type;
var Enums = common.Enums;
var Utils = common.Utils;
var Debug = common.Debug;

var SessionObject = require('./session_object');
var MechanismInfo = require('./mechanism_info')
var Digest = require('./digest');
var Sign = require('./sign');
var Verify = require('./verify');
var Encrypt = require('./encrypt');
var Decrypt = require('./decrypt');
var Key = require('./keys/key');

//Keys
var Rsa = require('./keys/rsa/rsa');
var Ecdsa = require('./keys/ecdsa/ecdsa');
var Aes = require('./keys/aes/aes');

function Session(slotInfo) {
    Object.defineProperty(this, "cki", {
        writable: true,
        enumerable: false
    })
    Object.defineProperty(this, "handle", {
        writable: true,
        enumerable: false
    })
    Object.defineProperty(this, "slotInfo", {
        writable: true,
        enumerable: false
    })
    this.cki = slotInfo.cki;
    this.slotInfo = slotInfo;
    this.handle = null;
}

Session.prototype.isStarted = function isStarted() {
    return !Type.isNull(this.handle);
}

Session.prototype.isLogged = function isLogged() {
    return this.logged == true;
}

Session.prototype.stop = function () {
    if (!Type.isNull(this.handle)) {
        Debug("C_CloseSession");
        var res = this.cki.C_CloseSession(this.handle);
        Utils.check_cki_res(res, "C_CloseSession");
        this.handle = null;
    }
    this.slotInfo.session = false;
}

Session.prototype.getInfo = function () {
    if (!this.isStarted()) {
        throw new Error(Utils.printf(ERROR.SESSION_NOT_STARTED));
    }
    var info = new CKI.CK_SESSION_INFO();
    Debug('C_CloseSession');
    var res = this.cki.C_GetSessionInfo(this.handle, info.ref());
    Utils.check_cki_res(res, "C_GetSessionInfo");
    return {
        slotID: info.slotID,
        state: info.state,
        flags: info.flags,
        ulDeviceError: info.ulDeviceError,
        "type": "sessionInfo"
    };
}

Session.prototype.login = function (pin, utype) {
    if (Type.isUndefined(utype)) {
        utype = CKI.CKU_USER;
    }
    if (pin && !Type.isString(pin))
        throw new TypeError(Utils.printf(ERROR.TYPE, 1, "String"));

    if (!this.isStarted())
        throw new Error(Utils.printf(ERROR.SESSION_NOT_STARTED));
    pin = pin ? pin : null;
    var pinLen = pin ? pin.length : 0;
    //Loggout if session is logged
    if (this.isLogged()) {
        this.logout();
    }
    Debug('C_Login');
    var res = this.cki.C_Login(this.handle, utype, pin, pinLen);
    Utils.check_cki_res(res, "C_Login");
    this.logged = true;
}

Session.prototype.logout = function () {
    if (!this.isStarted())
        throw new Error(Utils.printf(ERROR.SESSION_NOT_STARTED));
    Debug('C_Logout');
    var res = this.cki.C_Logout(this.handle);
    Utils.check_cki_res(res, "C_Logout");
    this.logged = false;
}

Session.start = function (slotInfo, flags) {
    var session = new Session(slotInfo);
    session.start(flags);
    return session;
}

Session.prototype.start = function (flags) {
    if (Type.isNull(this.handle)) {
        if (Type.isUndefined(flags))
            flags = CKI.CKF_SERIAL_SESSION;
        var $sessionID = Ref.alloc(CKI.CK_SESSION_HANDLE);
        Debug("C_OpenSession");
        var res = this.cki.C_OpenSession(this.slotInfo.handle, flags, null, null, $sessionID);
        Utils.check_cki_res(res, "C_OpenSession");
        this.handle = Ref.deref($sessionID)
        this.slotInfo.session = this;
    }
}

Session.prototype.destroyObject = function DestroyObject(obj) {
    if (Type.isEmpty(obj))
        throw new Error(Utils.printf(ERROR.REQUIRED, 1));

    Debug("C_DestroyObject");
    var res = this.cki.C_DestroyObject(this.handle, obj.handle);
    Utils.check_cki_res(res, "C_DestroyObject");
}

Session.prototype.findObjects = function () {
    if (!this.isStarted())
        throw new Error(Utils.printf(ERROR.SESSION_NOT_STARTED));
    var hSession = this.handle;
    //CK_OBJECT_HANDLE hObject;
    //CK_ULONG ulObjectCount;
    var $hObject = Ref.alloc(CKI.CK_OBJECT_HANDLE);
    var $pulCount = Ref.alloc(CKI.CK_ULONG);
    //CK_RV rv;
	
    Debug("C_FindObjectsInit");
    var res = this.cki.C_FindObjectsInit(hSession, null, 0);
    Utils.check_cki_res(res, "C_FindObjectsInit");
    var objects = [];
    while (1) {
        Debug("C_FindObjects");
        res = this.cki.C_FindObjects(hSession, $hObject, 1, $pulCount);
        Utils.check_cki_res(res, "C_FindObjects");
        var pulCount = Ref.deref($pulCount);
        var hObject = Ref.deref($hObject);
        if (res !== 0 || pulCount == 0)
            break;
        objects.push(new SessionObject(this, hObject));
    }

    Debug("C_FindObjectsFinal");
    res = this.cki.C_FindObjectsFinal(hSession);
    Utils.check_cki_res(res, "C_FindObjectsInit");
    return objects;
}

Session.prototype.createDigest = function createDigest(algName) {
    var digest = new Digest(this);
    digest.init(algName);
    return digest;
}

Session.prototype.createSign = function createSign(algName, key) {

    var sign = new Sign(this);
    sign.init(algName, key);
    return sign;
}

Session.prototype.createVerify = function createVerify(algName, key) {
    var verify = new Verify(this);
    verify.init(algName, key);
    return verify;
}

Session.prototype.createEncrypt = function createEncrypt(algName, key) {
    var encrypt = new Encrypt(this);
    encrypt.init(algName, key);
    return encrypt;
}

Session.prototype.createDecrypt = function createDecrypt(algName, key) {
    var decrypt = new Decrypt(this);
    decrypt.init(algName, key);
    return decrypt;
}

/* Random number generation */

function _random(fnName, hSession, buf, len) {
    if (!buf)
        buf = new Buffer(len);
    Debug(fnName);
    var res = this.cki[fnName](this.handle, buf, buf.length);
    Utils.check_cki_res(res, fnName);
    return buf;
}

/**
 * Mixes additional seed material into the token's random number generator
 */
Session.prototype.seedRandom = function SeedRandom(buf) {
    return _random.call(this, "C_SeedRandom", this.handle, buf, buf.length);
};

/**
 * Generates random or pseudo-random data
 */
Session.prototype.generateRandom = function GenerateRandom(len) {
    return _random.call(this, "C_GenerateRandom", this.handle, null, len);
};

function getMechanismByName(algName) {
    if (!Type.isString(algName))
        throw new TypeError(Utils.printf(ERROR.TYPE, 1, "String"));
    algName = algName.toUpperCase();
    if (algName in Enums.Mechanism)
        return Enums.Mechanism[algName];
    throw new Error("Unknown algorithm name in use");
}

/* Key management */
Session.prototype.generateKey = function GenerateKey(algName, obj) {
    var mech = MechanismInfo.create(algName);

    var buf = object_to_template(obj);
    var bufLen = Object.keys(obj).length;

    var $hObject = Ref.alloc(CKI.CK_ULONG);

    Debug('C_GenerateKey');
    var res = this.cki.C_GenerateKey(this.handle, mech.ref(), buf, bufLen, $hObject);
    Utils.check_cki_res(res, 'C_GenerateKey');

    var hObject = Ref.deref($hObject);
    //TODO: Return SymmetricKey
    return new Key(this, hObject);
}

Session.prototype.generateKeyPair = function GenerateKeyPair(algName, pukParams, prkParams) {
    var mech = MechanismInfo.create(algName);

    //public key template
    var bufPuk = object_to_template(pukParams);
    var bufPukLen = Object.keys(pukParams).length;
	
    //private key template
    var bufPrk = object_to_template(prkParams);
    var bufPrkLen = Object.keys(prkParams).length;

    var $hPuk = Ref.alloc(CKI.CK_ULONG);
    var $hPrk = Ref.alloc(CKI.CK_ULONG);

    Debug('C_GenerateKeyPair');
    var res = this.cki.C_GenerateKeyPair(this.handle, mech.ref(), bufPuk, bufPukLen, bufPrk, bufPrkLen, $hPuk, $hPrk);
    Utils.check_cki_res(res, 'C_GenerateKeyPair');

    var hPuk = Ref.deref($hPuk);
    var hPrk = Ref.deref($hPrk);
    //TODO: Return AsymmetricKey
    return {
        "public": new Key(this, hPuk),
        "private": new Key(this, hPrk)
    }
}

Session.prototype.deriveKey = function deriveKey(alg, key, template) {
    var mech = MechanismInfo.create(alg);

    var pTemplate = object_to_template(template);
    var ulAttributeCount = Object.keys(template).length;

    var $hKey = Ref.alloc(CKI.CK_ULONG);

    Debug('C_DeriveKey');
    var res = this.cki.C_DeriveKey(this.handle, mech.ref(), key.handle, pTemplate, ulAttributeCount, $hKey);
    Utils.check_cki_res(res, 'C_DeriveKey');

    var hKey = Ref.deref($hKey);
    var new_key = new Key(this, hKey);
    return new_key;
}

function attribute_create(t, v, l) {
    return (new CKI.CK_ATTRIBUTE({ type: t, pValue: v, ulValueLen: l })).ref()
}

function object_to_template(obj) {
    if (!Type.isObject(obj))
        throw new TypeError(Utils.printf(ERROR.TYPE, 1, "Object"));
    var tpl = [];
    for (var i in obj) {
        var at = Enums.Attribute[i];
        if (at) {
            if (!Type.isEmpty(at.v) && at.t) {
                var val = prepare_value_in(i, at, obj[i]);
                var attr = attribute_create(at.v, val, val.length);
                tpl.push(attr);
            }
            else
                throw new TypeError(Utils.printf('"%1" attribute is not supported', i));
        }
        else
            throw new Error(Utils.printf('"%1" attribute is not founded', i));
    }
    if (!tpl.length)
        throw new Error('Template hasn\'t got any attributes');
    return Buffer.concat(tpl);
}

function prepare_value_in(an, at, v) {
    var buf;
    switch (at.t) {
        case "ulong":
            if (!Type.isNumber(v))
                throw new TypeError(Utils.printf(ERROR.TYPE, 3, "Number"));
            var s = Utils.size_of(at.t);
            buf = new Buffer(s);
            if (s == 8)
                buf.writeUInt64LE(v, 0);
            else
                buf.writeUInt32LE(v, 0);
            break;
        case "bool":
            buf = new Buffer([v == 1]);
            break;
        case "utf8":
            if (!Type.isString(v))
                throw new TypeError(Utils.printf(ERROR.TYPE, 3, "String"));
            buf = new Buffer(v, 'utf8');
            break;
        case "array":
            if (!Buffer.isBuffer(v))
                throw new TypeError(Utils.printf(ERROR.TYPE, 3, "Buffer"));
            buf = v;
            break;
        case "date":
            throw new Error('Not supported in this implementation');
            break;
        default:
            throw new TypeError(Utils.printf("Unknown type '%1' in enum Attribute value '%2'.", at.t, an));
    }
    return buf;
}

//Crypto operations
/**
 * Creates signature for data
 */
Session.prototype.sign = function sign(key, alg, data) {
    var signer = this.createSign(alg, key);
    signer.update(data);
    return signer.final();
}

/**
 * Verifies signature for data
 */
Session.prototype.verify = function verify(key, alg, signature, data) {
    var verifier = this.createVerify(alg, key);
    verifier.update(data);
    return verifier.final(signature);
}

/**
 * Encrypt data
 */
Session.prototype.encrypt = function encrypt(key, alg, data) {
    var cipher = this.createEncrypt(alg, key);
    var msg = new Buffer(0);
    msg = Buffer.concat([msg, cipher.update(data)]);
    msg = Buffer.concat([msg, cipher.final()]);
    return msg;
}

/**
 * Decrypt data
 */
Session.prototype.decrypt = function decrypt(key, alg, data) {
    var decipher = this.createDecrypt(alg, key);
    var msg = new Buffer(0);
    msg = Buffer.concat([msg, decipher.update(data)]);
    msg = Buffer.concat([msg, decipher.final()]);
    return msg;
}

/**
 * Wraps key
 * @param alg the wrapping algorithm
 * @param wkey wrapping key
 * @param key key to be wrapped
 */
Session.prototype.wrapKey = function wrapKey(wkey, alg, key) {
    var hSession = this.handle;
    var pMechanism = MechanismInfo.create(alg);
    var hWrappingKey = wkey.handle;
    var hKey = key.handle;

    var pWrappedKey = new Buffer(1024);
    var pulWrappedKeyLen = Ref.alloc(CKI.CK_ULONG);

    Debug('C_WrapKey');
    var res = this.cki.C_WrapKey(hSession, pMechanism.ref(), hWrappingKey, hKey, pWrappedKey, pulWrappedKeyLen);
    Utils.check_cki_res(res, 'C_WrapKey');

    var ulWrappedKeyLen = pulWrappedKeyLen.deref();
    return pWrappedKey.slice(0, ulWrappedKeyLen);
}

/**
 * Unwraps key
 * @param alg the unwrapping algorithm
 * @param ukey unwrapping key
 * @param obj template
 * @param data encoded data
 */
Session.prototype.unwrapKey = function unwrapKey(ukey, alg, obj, data) {
    var hSession = this.handle;
    var pMechanism = MechanismInfo.create(alg);
    var hUnwrappingKey = ukey.handle;
    var pWrappedKey = data;
    var ulWrappedKeyLen = data.length;
    var pTemplate = object_to_template(obj);
    var ulAttributeCount = Object.keys(obj).length;
    var phKey = Ref.alloc(CKI.CK_ULONG);

    Debug('C_UnwrapKey');
    var res = this.cki.C_UnwrapKey(hSession, pMechanism.ref(), hUnwrappingKey, pWrappedKey, ulWrappedKeyLen, pTemplate, ulAttributeCount, phKey);
    Utils.check_cki_res(res, 'C_UnwrapKey');

    var hKey = phKey.deref();
    return new Key(this, hKey);
}

Session.prototype.generate = function generate(keyType, algorithm, props) {
    //prepare keyType
    var _keyType = null;
    if (Type.isString(keyType)) {
        keyType = keyType.toUpperCase();
        if (!(keyType in Enums.KeyType))
            throw new Error("Unknown algorithm name '" + keyType + "'");
        _keyType = Enums.KeyType[keyType];
    }
    var key = null;
    switch (_keyType) {
        case Enums.KeyType.RSA:
            key = Rsa.generate(this, algorithm, props);
            break;
        case Enums.KeyType.AES:
            key = Aes.generate(this, algorithm, props);
            break;
        case Enums.KeyType.ECDSA:
            key = Ecdsa.generate(this, algorithm, props);
            break;
        default:
            throw new Error("Algorithm '" + Enums.KeyType.getText(_keyType) + "' is not supported in current version");
    }
    return key;
}

/**
 * key: Key
 * keyType: number | string "private", "public", "secret"
 * usage: string[] 
 */
Session.prototype.export = function _export(key, keyType, usage) {
    if (!keyType) throw new TypeError("Paramter 'keyType' is required");
    // check keyType
    var type = key.getClass();
    switch (keyType) {
        case Enums.ObjectClass.PrivateKey:
        case "private":
            if (type !== Enums.ObjectClass.PrivateKey)
                throw new Error("Key must be PrivateKey");
            break;
        case Enums.ObjectClass.PublicKey:
        case "public":
            if (type !== Enums.ObjectClass.PublicKey)
                throw new Error("Key must be PublicKey");
            break;
        case Enums.ObjectClass.SecretKey:
        case "secret":
            if (type !== Enums.ObjectClass.SecretKey)
                throw new Error("Key must be SecretKey");
            break;
        default:
            throw new TypeError(`Unknown key type '${keyType}'`);
    }
    keyType = type;
    
    //check usage
    if (!usage) throw new TypeError("Parameter 'usage' is required");
    if (!Array.isArray(usage)) usage = [usage];

    var alg = key.getType();
    switch (alg) {
        case Enums.KeyType.RSA:
            return exportJwkRsa(key, keyType, usage);
        case Enums.KeyType.EC:
            return exportJwkEc(key, keyType, usage);
        case Enums.KeyType.AES:
            return exportJwkAes(key, keyType, usage);
        default:
            throw new Error(`Unknown key algorithm in use '${alg}'`);
    }
}

function checkUsage(key, usage) {
    switch (usage) {
        case "sign":
            return key.isSign();
        case "verify":
            return key.isVerify();
        case "encrypt":
            return key.isEncrypt();
        case "decrypt":
            return key.isDecrypt();
        default:
            throw new Error(`Unknown key usage '${usage}'`);
    }
}

function getUsage(usage, item) {
    if (usage.indexOf(item) !== -1)
        return true;
    return false;
}

function exportJwkRsa(key, type, usage) {
    var jwk = {
        kty: "RSA"
    };

    jwk.e = base64url(key.getBinaryAttribute(CKI.CKA_PUBLIC_EXPONENT), "binary");
    jwk.n = base64url(key.getBinaryAttribute(CKI.CKA_MODULUS), "binary");
    if (type == Enums.ObjectClass.PublicKey) {
        // export public key
        if (getUsage(usage, "verify")) {
            jwk.use = "sig";
        }
        else if (getUsage(usage, "encrypt")) {
            jwk.use = "enc";
        }
        else {
            throw new Error("Key doesn't have allowed key usage");
        }
    }
    else {
        // export private key
        jwk.key_ops = [];
        if (getUsage(usage, "sign")) {
            jwk.key_ops.push("sign");
        }
        else if (getUsage(usage, "decrypt")) {
            jwk.key_ops.push("decrypt");
        }

        jwk.d = base64url(key.getBinaryAttribute(CKI.CKA_PRIVATE_EXPONENT), "binary");
        jwk.p = base64url(key.getBinaryAttribute(CKI.CKA_PRIME_1), "binary");
        jwk.q = base64url(key.getBinaryAttribute(CKI.CKA_PRIME_2), "binary");
        jwk.dp = base64url(key.getBinaryAttribute(CKI.CKA_EXPONENT_1), "binary");
        jwk.dq = base64url(key.getBinaryAttribute(CKI.CKA_EXPONENT_2), "binary");
        jwk.qi = base64url(key.getBinaryAttribute(CKI.CKA_COEFFICIENT), "binary");
    }

    return jwk;
}

function exportJwkAes(key, type, usage) {
    var jwk = {
        kty: "oct"
    };

    if (type == Enums.ObjectClass.SecretKey) {
        jwk.key_ops = [];        
        if (getUsage(usage, "verify")) {
            jwk.key_ops.push("verify");
        }
        if (getUsage(usage, "sign")) {
            jwk.key_ops.push("sign");
        }
        if (getUsage(usage, "encrypt")) {
            jwk.key_ops.push("encrypt");
        }
        if (getUsage(usage, "decrypt")) {
            jwk.key_ops.push("decrypt");
        }
        
        jwk.k = base64url(key.getBinaryAttribute(CKI.CKA_VALUE), "binary");
    }
    else{
        throw new TypeError("Parameter type must be Secret");
    }

    return jwk;
}

function asn1DecodeLength(buffer, index) {
    var buf = buffer[index],
        len = buf & 0x7F;
    if (len == buf)
        return { length: len, size: 1 };
    if (len > 6)
        throw "no reason to use Int10, as it would be a huge buffer anyways";
    if (len === 0)
        return { length: null, size: 1 }; // undefined
    buf = 0;
    for (var i = 0; i < len; ++i)
        buf = (buf * 256) + buffer[index++];
    return { length: len, size: index - 1 };
}

function exportJwkEc(key, type, usage) {
    var jwk = {
        kty: "EC"
    };

    var group = key.getBinaryAttribute(CKI.CKA_EC_PARAMS).toString("hex");

    var namedCurve = NamedCurves.getValue(group);
    var namedCurveSize = namedCurve.size >> 3;
    if (!namedCurve)
        throw new Error("Named curve is not found");
    switch (namedCurve.name) {
        case "secp192r1":
            namedCurve = "P-192";
            break;
        case "secp256r1":
            namedCurve = "P-256";
            break;
        case "secp384r1":
            namedCurve = "P-384";
            break;
        case "secp521r1":
            namedCurve = "P-521";
            break;
        default:
            throw new Error(`Unknown namedCurve '${namedCurve.name}'`);
    }

    jwk.crv = namedCurve;
    
    /*
     * An uncompressed EC point may be in either of two formats.
     * First try the OCTET STRING encoding:
     * 04 <length> 04 <X-coordinate> <Y-coordinate>
     *
     * Otherwise try the raw encoding:
     * 04 <X-coordinate> <Y-coordinate>
     */

    if (type === Enums.ObjectClass.PublicKey) {

        var point = key.getBinaryAttribute(CKI.CKA_EC_POINT);
        // check point
        if (point[0] !== 4)
            throw new Error(`Wrong ASN1 EC_PONT tag value`);

        var len = asn1DecodeLength(point, 1);

        var start = 1 + len.size;
        if (point[start] === 4) {
            //uncompressed EC
            start++;
        }

        if (len.length && len.length === (namedCurveSize * 2 + 1)) {
            jwk.x = base64url(point.slice(start, start + namedCurveSize), "binary");
            jwk.y = base64url(point.slice(start + namedCurveSize), "binary");
        }
        else {
            throw new Error("Wrong EC_POINT size");
        }
    }

    if (type == Enums.ObjectClass.PublicKey) {
        // export public key
        if (getUsage(usage, "verify")) {
            jwk.use = "sig";
        }
        else if (getUsage(usage, "encrypt")) {
            jwk.use = "enc";
        }
        else {
            throw new Error("Key doesn't have allowed key usage");
        }
    }
    else {
        // export private key
        jwk.key_ops = [];
        if (getUsage(usage, "sign")) {
            jwk.key_ops.push("sign");
        }
        else if (getUsage(usage, "decrypt")) {
            jwk.key_ops.push("decrypt");
        }

        jwk.d = base64url(key.getBinaryAttribute(CKI.CKA_VALUE), "binary");
    }

    return jwk;
}

module.exports = Session;