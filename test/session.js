var assert = require('assert');
var config = require("./config.json");
var graphene = require("../build/graphene");

var TEST_MESSAGE = "Test message for crypto oprations";

var Module = graphene.Module;

describe("Session", function() {
    var mod, slot, session;

    before(function() {
        mod = Module.load(config.init.lib, config.init.libName);
        mod.initialize();
        slot = mod.getSlots(0);
    });

    after(function() {
        if (session)
            session.logout();
        mod.finalize();
    });

    it("login/logout", function() {
        var session = slot.open();
        assert.throws(function() {
            session.login("WrongPin");
        }, Error);
        session.login(config.init.pin);
        session.logout();
    });

    it("create", function() {
        // create new session for current test
        session = slot.open();
        session.login(config.init.pin);

        var objs = session.find();
        assert.equal(objs.length, 0, "Wrong init objs length");

        session.create({
            class: graphene.ObjectClass.PUBLIC_KEY,
            keyType: graphene.KeyType.RSA,
            wrap: true,
            modulus: new Buffer(1024/8),
            publicExponent: new Buffer([1, 0, 1])
        });

        var obj = session.create({
            class: graphene.ObjectClass.DATA,
            application: "application",
            objectId: new Buffer("objectId"),
            value: new Buffer("value")
        });

        var data = obj.toType();
        assert.equal(data.application, "application");
        assert.equal(data.objectId.toString(), "objectId");
        assert.equal(data.value.toString(), "value");
        assert.equal(data.class, 0);

        objs = session.find();
        assert.equal(objs.length, 2, "Wrong objs length");
    });

    it("copy", function() {

        session.clear();
        var objs = session.find();
        assert.equal(objs.length, 0, "Wrong init objs length");

        var obj = session.generateKey("AES_KEY_GEN", {
            keyType: graphene.KeyType.AES,
            label: "label",
            valueLen: 256/8,
            extractable: false,
            sensitive: false,
            encrypt: true
        });

        // test objs length
        objs = session.find();
        assert.equal(objs.length, 1, "Wrong objs length");

        var objCopy = session.copy(
            obj,
            {
                label: "copy of key"
            }
        );

        // test objs length
        objs = session.find();
        assert.equal(objs.length, 2, "Wrong objs length");
    });

    it("find", function() {
        var count = session.find().length;

        session.create({
            class: graphene.ObjectClass.DATA,
            application: "testFind",
            objectId: new Buffer("objectId"),
            value: new Buffer("1")
        });
        session.create({
            class: graphene.ObjectClass.DATA,
            application: "testFind",
            objectId: new Buffer("objectId"),
            value: new Buffer("2")
        });
        session.create({
            class: graphene.ObjectClass.DATA,
            application: "testFind",
            objectId: new Buffer("objectId"),
            value: new Buffer("3")
        });
        assert.equal(session.find().length, count + 3);
        var objs = session.find({
            application: "testFind"
        });
        assert.equal(objs.length, 3);
        assert.equal(objs.items(0).toType().value.toString(), "1");
        assert.equal(objs.items(1).toType().value.toString(), "2");
        assert.equal(objs.items(2).toType().value.toString(), "3");
    });

    it("destroy by template", function() {
        var count = session.find().length;

        session.create({
            class: graphene.ObjectClass.DATA,
            label: "destroy",
            application: "application",
            objectId: new Buffer("objectId"),
            value: new Buffer("1")
        });
        session.create({
            class: graphene.ObjectClass.DATA,
            label: "destroy",
            application: "application",
            objectId: new Buffer("objectId"),
            value: new Buffer("2")
        });

        assert.equal(session.find().length, count + 2);

        session.destroy({ label: "destroy" });

        assert.equal(session.find().length, count);

    });

    it("destroy by object", function() {
        var count = session.find().length;

        var obj = session.create({
            class: graphene.ObjectClass.DATA,
            label: "destroy",
            application: "application",
            objectId: new Buffer("objectId"),
            value: new Buffer("1")
        });
        session.create({
            class: graphene.ObjectClass.DATA,
            label: "destroy",
            application: "application",
            objectId: new Buffer("objectId"),
            value: new Buffer("2")
        });

        assert.equal(session.find().length, count + 2);

        session.destroy(obj);

        assert.equal(session.find().length, count + 1);

    });

    it("clear", function() {
        assert.equal(session.find().length !== 0, true);

        session.clear();

        assert.equal(session.find().length === 0, true);

    });

    it("generate key AES", function() {
        var keylen = 256 / 8;
        var key = session.generateKey("AES_KEY_GEN", {
            keyType: graphene.KeyType.AES,
            label: "label",
            valueLen: keylen,
            extractable: true,
            encrypt: true
        });
        assert.equal(!key.checkValue, false);
        assert.equal(key.encrypt, true);
        assert.equal(key.getAttribute("value").value.length, keylen);
    });

    it("generate key pair RSA", function() {
        var keys = session.generateKeyPair(graphene.KeyGenMechanism.RSA, {
            keyType: graphene.KeyType.RSA,
            encrypt: true,
            modulusBits: 1024,
            publicExponent: new Buffer([3])
        },
            {
                keyType: graphene.KeyType.RSA,
                decrypt: true
            });
        assert.equal(!keys, false);
        assert.equal(keys.publicKey.class, graphene.ObjectClass.PUBLIC_KEY);
        assert.equal(keys.privateKey.class, graphene.ObjectClass.PRIVATE_KEY);
    });

    it("getObject wrong handle", function() {
        assert.equal(!session.getObject(-1), true);
    });

    it("getObject", function() {
        var obj;
        session.find(function(o) {
            obj = o;
            return false; // exit on first element
        });
        assert.equal(!session.getObject(obj.handle), false);
    });

    function test_sign(alg, key1, key2) {
        var sign = session.createSign(alg, key1);
        sign.update(TEST_MESSAGE);
        sign.update(TEST_MESSAGE);
        var signature = sign.final();
        assert.equal(!!signature.length, true);

        var verify = session.createVerify(alg, key2);
        verify.update(TEST_MESSAGE);
        verify.update(TEST_MESSAGE);
        assert.equal(verify.final(signature), true);
    }

    it("sign/verify RSA", function() {
        var keys = session.generateKeyPair(graphene.KeyGenMechanism.RSA, {
            keyType: graphene.KeyType.RSA,
            verify: true,
            modulusBits: 1024,
            publicExponent: new Buffer([3])
        },
            {
                keyType: graphene.KeyType.RSA,
                sign: true,
            });

        test_sign(graphene.MechanismEnum.SHA1_RSA_PKCS, keys.privateKey, keys.publicKey);
    });

});
