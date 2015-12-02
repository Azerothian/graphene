#!/usr/bin/env node

var debug = require('debug')('commander');
var fs = require('fs');
var readline = require('readline');
var pkcs11 = require('../lib');
var Module = pkcs11.Module;
var Enums = pkcs11.Enums;
var RSA = pkcs11.RSA;
var AES = pkcs11.AES;

var common = require("../lib/common.js");

var CAPTION_UNDERLINE = "==============================";

var MODULE_NOTE = "all commands require you to first load the PKCS #11 module";
var MODULE_EXAMPLE = "> module load -l {/path/to/pkcs11/lib/name.so} -n {LibName}";

var NOTE = MODULE_NOTE + "\n\n    Example:\n\n      " + MODULE_EXAMPLE;
var NOTE_SESSION = "all commands require you to first load the PKCS #11 module and log in." + "\n\n" +
  "    Example:" + "\n\n" +
  "      " + MODULE_EXAMPLE + "\n" +
  "      > slot open --slot 0 --pin {YourPIN}";

var ERROR_MODULE_NOT_INITIALIZED = "Module is not initialized\n\n" +
  "Note:\n" +
  "  " + MODULE_NOTE + "\n\n" +
  "Example:\n" +
  "  " + MODULE_EXAMPLE;

var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

var commander = require('../lib/commander/command');

commander.on("error", function (e) {
  console.log();
  console.log("Error:", e.message);
  debug(e.stack);
  if (e.command && e.command.print) {
    console.log();
    e.command.print("usage");
    e.command.print("commands");
    e.command.print("example");
  }

  rl.prompt();
});

/* ==========
   Helpers
   ==========*/   
/**
 * Prints caption to stdout with underline
 * 
 * View:
 * <name>
 * ===================================
 */
function print_caption(name) {
  console.log();
  console.log(name);
  console.log(CAPTION_UNDERLINE);
}

/**
 * Checks module was initialized
 */
function check_module() {
  if (!mod)
    throw new Error(ERROR_MODULE_NOT_INITIALIZED);
}

/**
 * Checks input file path. Throw exception if file is not exist
 */
function check_file(v) {
  debug("Check file exists " + v);
  if (!fs.existsSync(v) || !fs.statSync(v).isFile())
    throw new Error('File is not found');
  return v;
}

/**
 * Adds symbols to String, default symbol is white space
 * @param s Source string value
 * @param size Final size of string
 * @param c Padding char. Optional. Default is ' '
 * @param d Padding direction. Boolean value which set left o right direction. False - right padding, true - left padding. Optional. Default false
 */
function pud(s, size, c, d) {
  if (!c) c = " ";
  var res, pad = "";
  if (typeof s !== "string")
    s = new String(s);
  if (s.length < size) {
    for (var i = 0; i < (size - s.length); i++)
      pad += c;
  }
  if (!d) {
    res = s + pad;
  }
  else {
    res = pad + s;
  }
  return res;
}

/**
 * Adds padding from left
 */
function lpud(s, size, c) {
  return pud(s, size, c, true);
}

/**
 * Adds padding from right
 */
function rpud(s, size, c) {
  return pud(s, size, c, false);
}
/**
 * Prints Boolean. X - true, ' ' - false
 */
function print_bool(v) {
  return v ? 'x' : ' ';
}

/**
 * Class Timer.
 */
function Timer() {
  this.beginAt = null;
  this.endAt = null;
  this.time = 0;
}

/**
 * Starts timer
 */
Timer.prototype.start = function start() {
  if (!this.beginAt)
    this.beginAt = new Date();
};

/**
 * Stops timer
 */
Timer.prototype.stop = function stop() {
  if (this.beginAt && !this.endAt) {
    this.endAt = new Date();
    this.time = this.endAt.getTime() - this.beginAt.getTime();
  }
};
  
/* ==========
   ?
   ==========*/
commander.createCommand("?", "output usage information")
  .on("call", function (v) {
    console.log();
    console.log("  Commands:");
    for (var i in commander._commands) {
      var cmd = commander._commands[i];
      console.log("    " + pud(cmd._name, 10) + cmd._description);
    }
    console.log();
    console.log(print_module_note());
    console.log();
  });
  
/* ==========
   exit
   ==========*/
commander.createCommand("exit", "exit from the application")
  .on("call", function (v) {
    console.log();
    console.log("Thanks for using");
    console.log();
    rl.close();
    rl.prompt = function () { };
  });
  
/* ==========
   Module
   ==========*/
var mod;
var cmdModule = commander.createCommand("module", {
  description: "load and retrieve information from the PKCS#11 module",
  note: MODULE_NOTE,
  example: MODULE_EXAMPLE
})
  .on("call", function (cmd) {
    this.help();
  });

function print_module_note() {
  var msg = "  Note:" + "\n";
  msg += "    all commands require you to first load the PKCS #11 module" + "\n\n";
  msg += "      > module load -l /path/to/pkcs11/lib/name.so -n LibName";
  return msg;
}

function print_module_info() {
  print_caption("Module info");
  console.log("  Library:", mod.lib);
  console.log("  Name:", mod.name);
  console.log("  Description:", mod.description);
  console.log("  Cryptoki version:", mod.cryptokiVersion);
  console.log();
}

/**
 * load
 */
var cmdModuleInit = cmdModule.command("load", {
  description: "loads a specified PKCS#11 module",
  example: MODULE_EXAMPLE
})
  .option('name', {
    description: 'Name of module',
    isRequired: true
  })
  .option('lib', {
    description: 'Path to library',
    set: check_file,
    isRequired: true
  })
  .on("call", function (cmd) {
    mod = Module.load(cmd.lib, cmd.name);
    mod.initialize();
    print_module_info();
  });

/**
 * info
 */
var cmdModuleInfo = cmdModule.command("info", {
  description: "returns info about Module",
  note: NOTE
})
  .on("call", function (cmd) {
    check_module();
    print_module_info();
  });

function print_slot(slot) {
  print_module_info();
}

function get_slot_list() {
  check_module();
  slots = mod.getSlots(true); //with token present
}

var slots = null;

/**
 * Global options
 */
var option_slot = {
  description: "Slot index in Module",
  set: function (v) {
    check_module();
    if (!slots)
      get_slot_list();
    var slot = slots[v];
    if (!slot)
      throw new Error("Can not find Slot by index '" + v + "'");
    return slot;
  },
  isRequired: true
};

var option_pin = {
  description: "The PIN for the slot",
  type: "pin"
};

/* ==========
   Slot
   ==========*/
var cmdSlot = commander.createCommand("slot", {
  description: "open a session to a slot and work with its contents",
  note: NOTE,
})
  .on("call", function () {
    this.help();
  });
    
/**
 * list
 */
var cmdSlotList = cmdSlot.command("list", {
  description: "enumerates the available slots",
  note: NOTE
})
  .on("call", function () {
    get_slot_list();
    print_caption("Slot list");
    console.log("Slot count:", slots.length);
    console.log();
    for (var i in slots) {
      var slot = slots[i];
      print_slot(slot);
    }
  });

function print_alg_info(slot, algName) {
  var algList = slot.mechanismList;
  //find alg
  var alg = null;
  for (var i in algList) {
    var item = algList[i];
    if (item.name == algName) {
      alg = item;
      break;
    }
  }
  if (!alg)
    throw new Error("Unsupported algorithm in use");
  var PADDING_1 = 25;
  print_caption("Algorithm info");
  console.log("  %s%s", rpud("Name:", PADDING_1), alg.name);
  console.log("  %s%s", rpud("Min key size:", PADDING_1), alg.minKeySize);
  console.log("  %s%s", rpud("Max key size:", PADDING_1), alg.maxKeySize);
  console.log("  %s%s", rpud("Is hardware:", PADDING_1), alg.isHardware());
  console.log("  %s%s", rpud("Is encrypt:", PADDING_1), alg.isEncrypt());
  console.log("  %s%s", rpud("Is decrypt:", PADDING_1), alg.isDecrypt());
  console.log("  %s%s", rpud("Is digest:", PADDING_1), alg.isDigest());
  console.log("  %s%s", rpud("Is sign:", PADDING_1), alg.isSign());
  console.log("  %s%s", rpud("Is sign recover:", PADDING_1), alg.isSignRecover());
  console.log("  %s%s", rpud("Is verify:", PADDING_1), alg.isVerify());
  console.log("  %s%s", rpud("Is verify recover:", PADDING_1), alg.isVerifyRecover());
  console.log("  %s%s", rpud("Is generate key:", PADDING_1), alg.isGenerateKey());
  console.log("  %s%s", rpud("Is generate key pair:", PADDING_1), alg.isGenerateKeyPair());
  console.log("  %s%s", rpud("Is wrap key:", PADDING_1), alg.isWrap());
  console.log("  %s%s", rpud("Is unwrap key:", PADDING_1), alg.isUnwrap());
  console.log("  %s%s", rpud("Is derive key:", PADDING_1), alg.isDerive());
  console.log("  %s%s", rpud("Is extension:", PADDING_1), alg.isExtension());
  console.log();
}
    
/**
 * info
 */
var cmdSlotInfo = cmdSlot.command("info", {
  description: "returns information about a specific slot",
  note: NOTE,
  example: "Returns an info about slot" + "\n\n" +
  "      > slot info -s 0\n\n" +
  "    Returns an info about algorithm of selected slot" + "\n\n" +
  "      > slot info -s 0 -a SHA1"
})
  .option('slot', option_slot)
  .option('alg', {
    description: "Algorithm name",
  })
  .on("call", function (cmd) {
    if (cmd.alg) {
      if (cmd.alg in Enums.Mechanism) {
        print_alg_info(cmd.slot, cmd.alg);
      }
      else
        throw new Error("Unknown Algorithm name in use");
    }
    else {
      print_slot(cmd.slot);
    }
  });

function print_slot_algs_header() {
  var TEMPLATE = "| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |";
  console.log(TEMPLATE, rpud("Algorithm name", 25), "h", "s", "v", "e", "d", "w", "u", "g", "D", "E");
  console.log(TEMPLATE.replace(/\s/g, "-"), rpud("", 25, '-'), "-", "-", "-", "-", "-", "-", "-", "-", "-", "-");
}

function print_slot_algs_row(alg) {
  var TEMPLATE = "| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |";
  console.log(TEMPLATE,
    rpud(alg.name, 25),
    print_bool(alg.isDigest()),
    print_bool(alg.isSign() || alg.isSignRecover()),
    print_bool(alg.isVerify() || alg.isVerifyRecover()),
    print_bool(alg.isEncrypt()),
    print_bool(alg.isDecrypt()),
    print_bool(alg.isWrap()),
    print_bool(alg.isUnwrap()),
    print_bool(alg.isGenerateKey() || alg.isGenerateKeyPair()),
    print_bool(alg.isDerive()),
    print_bool(alg.isExtension())
    );
}
   
/**
 * algs
 */
var cmdSlotCiphers = cmdSlot.command("algs", {
  description: "enumerates the supported algorithms",
  note: NOTE,
  example: "Returns a list of mechanisms which can be used with C_DigestInit, C_SignInit\n  and C_VerifyInit" + "\n\n" +
  "  > slot algs -s 0 -f hsv"
})
  .option('slot', option_slot)
  .option('flags', {
    description: "Optional. Flags specifying mechanism capabilities. Default is 'a'" + "\n" +
    "    a - all mechanisms in PKCS11" + "\n" +
    "    h - mechanism can be used with C_DigestInit" + "\n" +
    "    s - mechanism can be used with C_SignInit" + "\n" +
    "    v - mechanism can be used with C_VerifyInit" + "\n" +
    "    e - mechanism can be used with C_EncryptInit" + "\n" +
    "    d - mechanism can be used with C_DecryptInit" + "\n" +
    "    w - mechanism can be used with C_WrapKey" + "\n" +
    "    u - mechanism can be used with C_UnwrapKey" + "\n" +
    "    g - mechanism can be used with C_GenerateKey or C_GenerateKeyPair" + "\n" +
    "    D - mechanism can be used with C_DeriveKey" + "\n" +
    "    E - true if there is an extension",
    value: "a"
  })
  .on("call", function (cmd) {
    var lAlg = cmd.slot.mechanismList;

    console.log();
    print_slot_algs_header();
    for (var i in lAlg) {
      var alg = lAlg[i];
      var f = cmd.flags;
      var d = false;
      if (!d && f.indexOf("a") >= 0)
        d = true;
      if (!d && f.indexOf("h") >= 0 && alg.isDigest())
        d = true;
      if (!d && f.indexOf("s") >= 0 && alg.isSign())
        d = true;
      if (!d && f.indexOf("v") >= 0 && alg.isVerify())
        d = true;
      if (!d && f.indexOf("e") >= 0 && alg.isEncrypt())
        d = true;
      if (!d && f.indexOf("d") >= 0 && alg.isDecrypt())
        d = true;
      if (!d && f.indexOf("w") >= 0 && alg.isWrap())
        d = true;
      if (!d && f.indexOf("u") >= 0 && alg.isUnwrap())
        d = true;
      if (!d && f.indexOf("g") >= 0 && (alg.isGenerateKey() || alg.isGenerateKeyPair))
        d = true;
      if (!d)
        continue;
      print_slot_algs_row(alg);
    }
    console.log();
    console.log("%s algorithm(s) in list", lAlg.length);
    console.log();
  });

var session = null;

var cmdSlotOpen = cmdSlot.command("open", {
  description: "open a session to a slot",
  note: NOTE
})
  .option('slot', option_slot)
  .option('pin', option_pin)
  .on("call", function (cmd) {
    if (session && session.isLogged()) {
      session.logout();
      session.stop();
    }
    session = cmd.slot.session;
    session.start();
    session.login(cmd.pin);
    console.log();
    console.log("Session is started");
    console.log();
  });

var cmdSlotStop = cmdSlot.command("stop", {
  description: "close the open session",
  note: NOTE
})
  .on("call", function (cmd) {
    if (session && session.isLogged()) {
      session.logout();
      session.stop();
    }
    session = null;
    console.log();
    console.log("Session is stopped");
    console.log();
  });

function check_session() {
  if (!(session && session.isLogged())) {
    var error = new Error("Session is not opened" + "\n\n" +
      "  " + NOTE_SESSION);
    throw error;
  }
}
  
/* ==========
   object
   ==========*/
var cmdObject = commander.createCommand("object", {
  description: "manage objects on the device",
  note: NOTE_SESSION
})
  .on('call', function () {
    this.help();
  });

function print_object_info(obj) {
  var TEMPLATE = '| %s | %s |';
  var COL_1 = 10;
  var COL_2 = 25;
  console.log(TEMPLATE, rpud("Name", COL_1), rpud("Value", COL_2));
  console.log(TEMPLATE.replace(/\s/g, '-'), rpud("", COL_1, "-"), rpud("", COL_2, "-"));
  console.log(TEMPLATE, rpud("ID", COL_1), rpud(obj.handle, COL_2));
  console.log(TEMPLATE, rpud("Class", COL_1), rpud(Enums.ObjectClass.getText(obj.getClass()), COL_2));
  console.log(TEMPLATE, rpud("Label", COL_1), rpud(obj.getLabel(), COL_2));
  console.log(TEMPLATE, rpud("Token", COL_1), rpud(obj.isToken(), COL_2));
  console.log(TEMPLATE, rpud("Private", COL_1), rpud(obj.isPrivate(), COL_2));
  console.log(TEMPLATE, rpud("Modifiable", COL_1), rpud(obj.isModifiable(), COL_2));
}

function print_object_header() {
  console.log("| %s | %s | %s | %s | %s | %s |", rpud("ID", 4), rpud("Class", 10), rpud("Label", 25), rpud("Token", 4), rpud("Private", 4), rpud("Modifiable", 4));
  console.log("|%s|%s|%s|%s|%s|%s|", rpud("", 6, "-"), rpud("", 12, "-"), rpud("", 27, "-"), rpud("", 7, "-"), rpud("", 9, "-"), rpud("", 12, "-"));
}

function print_object_row(obj) {
  console.log(
    "| %s | %s | %s | %s | %s | %s |",
    rpud(obj.handle, 4),
    rpud(Enums.ObjectClass.getText(obj.getClass()), 10),
    rpud(obj.getLabel(), 25),
    rpud(obj.isToken(), 5),
    rpud(obj.isPrivate(), 7),
    rpud(obj.isModifiable(), 10));
}

var cmdObjectList = cmdObject.command("list", {
  description: "enumerates the objects in a given slot",
  note: NOTE_SESSION,
  example: "> object list"
})
  .option("type", {
    description: "Type of object (key, cert)"
  })
  .on("call", function (cmd) {
    check_session();
    var objList = session.findObjects();
    console.log();
    print_object_header();
    for (var i in objList) {
      var obj = objList[i];
      print_object_row(obj);
    }
    console.log();
    console.log("%s object(s) in list", objList.length);
    console.log();
  });

var cmdObjectDelete = cmdObject.command("delete", {
  description: "delete an object from a slot",
  note: NOTE_SESSION,
  example: "Removes Object from Slot by object's ID 1\n      > object delete --obj 1"
})
  .option("obj", {
    description: "Identificator of object",
    isRequired: true
  })
  .on("call", function (cmd) {
    check_session();
    var objList = session.findObjects();
    if (cmd.obj == "all") {
      rl.question("Do you really want to remove ALL objects (Y/N)?", function (answer) {
        if (answer && answer.toLowerCase() == "y") {
          for (var i in objList) {
            session.destroyObject(objList[i]);
          }
          console.log();
          console.log("All Objects were successfully removed");
          console.log();
        }
        rl.prompt();
      });
    }
    else {
      var obj = null;
      for (var i in objList) {
        var item = objList[i];
        if (item.handle == cmd.obj) {
          obj = item;
          break;
        }
      }
      if (!obj)
        throw new Error("Object by ID '" + cmd.obj + "' is not found");
      print_caption("Object info");
      print_object_info(obj);
      console.log();
      rl.question("Do you really want to remove this object (Y/N)?", function (answer) {
        if (answer && answer.toLowerCase() == "y") {
          session.destroyObject(obj);
          console.log();
          console.log("Object was successfully removed");
          console.log();
        }
        rl.prompt();
      });
    }
  });

var cmdObjectInfo = cmdObject.command("info", {
  description: "returns information about a object",
  note: NOTE_SESSION,
  example: "Return info about Object of Slot by ID 1\n      > object info --obj 1"
})
  .option("obj", {
    description: "Identificator of object",
    isRequired: true
  })
  .on("call", function (cmd) {
    check_session();
    var objList = session.findObjects();
    var obj = null;
    for (var i in objList) {
      var item = objList[i];
      if (item.handle == cmd.obj) {
        obj = item;
        break;
      }
    }
    if (!obj)
      throw new Error("Object by ID '" + cmd.obj + "' is not found");
    console.log();
    print_object_info(obj);
    console.log();
  });
  
/* ==========
   Hash
   ==========*/
var cmdHash = commander.createCommand("hash", {
  description: "compute a hash for a given file",
  note: NOTE_SESSION
})
  .option('alg', {
    description: 'the algorithm to hash the file with. Default SHA1.' + '\n\n' +
    pud('', 14) + 'to get list of supported algoriphms use command' + '\n\n' +
    pud('', 16) + '> slot algs -s {num} -f h' + '\n',
    value: "sha1"
  })
  .option('in', {
    description: 'the file to hash',
    set: check_file,
    isRequired: true
  })
  .on("call", function (cmd) {
    check_session();
    var rs = fs.createReadStream(cmd.in);
    var digest = session.createDigest(cmd.alg);
    rs.on('data', function (chunk) {
      digest.update(chunk);
    });
    rs.on('end', function () {
      var hash = digest.final();
      console.log(hash.toString('hex'));
      session.logout();
      session.stop();
    });
  });
   
/* ==========
   Test
   ==========*/
function gen_AES(session, len) {
  return session.generateAes({
    length: len || 128,
    keyUsages: ["sign", "verify", "encrypt", "decrypt", "wrapKey", "unwrapKey"]
  });
}

function gen_RSA(session, size, exp) {
  return session.generateRsa({
    modulusLength: size || 1024,
    publicExponent: exp || 3,
    keyUsages: ["sign", "verify", "encrypt", "decrypt", "wrapKey", "unwrapKey"]
  });
}

function gen_ECDSA(session, name, hexOid) {
		var _keys = session.generateKeyPair("ECDSA_KEY_PAIR_GEN", {
    "token": true,
    "keyType": Enums.KeyType.ECDSA,
    "label": name,
    "private": true,
    "verify": true,
    "wrap": false,
    "encrypt": false,
    "paramsEC": new Buffer(hexOid, "hex")
		}, {
      "token": true,
      "private": true,
      "keyType": Enums.KeyType.ECDSA,
      "label": name,
      "sensitive": true,
      "decrypt": false,
      "sign": true,
      "unwrap": false,
    });
		return { privateKey: _keys.private, publicKey: _keys.public };
}

var gen = {
  rsa: {
    "1024": gen_RSA_1024,
    "2048": gen_RSA_2048,
    "4096": gen_RSA_4096,
  },
  ecdsa: {
    "secp192r1": gen_ECDSA_secp192r1,
    "secp256r1": gen_ECDSA_secp256r1,
    "secp384r1": gen_ECDSA_secp384r1,
    "secp256k1": gen_ECDSA_secp256k1,
    "brainpoolP192r1": gen_ECDSA_brainpoolP192r1,
    "brainpoolP224r1": gen_ECDSA_brainpoolP224r1,
    "brainpoolP256r1": gen_ECDSA_brainpoolP256r1,
    "brainpoolP320r1": gen_ECDSA_brainpoolP320r1
  },
  aes: {
    "128": gen_AES_128,
    "192": gen_AES_192,
    "256": gen_AES_256,
    "cbc128": gen_AES_128,
    "cbc192": gen_AES_192,
    "cbc256": gen_AES_256,
    "gcm128": gen_AES_128,
    "gcm192": gen_AES_192,
    "gcm256": gen_AES_256,
  }
};

function gen_RSA_1024(session) {
  return gen_RSA(session, 1024);
}

function gen_RSA_2048(session) {
  return gen_RSA(session, 2048);
}

function gen_RSA_4096(session) {
  return gen_RSA(session, 4096);
}

function gen_ECDSA_secp192r1(session) {
  return gen_ECDSA(session, "test ECDSA-secp192r1", "06082A8648CE3D030101");
}

function gen_ECDSA_secp256r1(session) {
  return gen_ECDSA(session, "test ECDSA-secp256r1", "06082A8648CE3D030107");
}

function gen_ECDSA_secp384r1(session) {
  return gen_ECDSA(session, "test ECDSA-secp384r1", "06052B81040022");
}

function gen_ECDSA_secp256k1(session) {
  return gen_ECDSA(session, "test ECDSA-secp256k1", "06052B8104000A");
}

function gen_ECDSA_brainpoolP192r1(session) {
  return gen_ECDSA(session, "test ECDSA-brainpoolP192r1", "06052B8104000A");
}

function gen_ECDSA_brainpoolP224r1(session) {
  return gen_ECDSA(session, "test ECDSA-brainpoolP224r1", "06092B2403030208010105");
}

function gen_ECDSA_brainpoolP256r1(session) {
  return gen_ECDSA(session, "test ECDSA-brainpoolP256r1", "06092B2403030208010107");
}

function gen_ECDSA_brainpoolP320r1(session) {
  return gen_ECDSA(session, "test ECDSA-brainpoolP320r1", "06092B2403030208010109");
}

function gen_AES_128(session) {
  return gen_AES(session, 128);
}
function gen_AES_192(session) {
  return gen_AES(session, 192);
}
function gen_AES_256(session) {
  return gen_AES(session, 256);
}

var BUF_SIZE_DEFAULT = 1024;
var BUF_SIZE = 1024;
var BUF_STEP = BUF_SIZE;
var BUF = new Buffer(BUF_STEP);

function test_sign_operation(session, buf, key, algName) {
  var sig = session.createSign(algName, key.key || key.privateKey);
  for (var i = 1; i <= BUF_SIZE; i = i + BUF_STEP) {
		  sig.update(buf);
  }
  var res = sig.final();
  return res;
}

function test_verify_operation(session, buf, key, algName, sig) {
  var verify = session.createVerify(algName, key.key || key.publicKey);
  for (var i = 1; i <= BUF_SIZE; i = i + BUF_STEP) {
		  verify.update(buf);
  }
  var res = verify.final(sig);
  return res;
}

function test_encrypt_operation(session, buf, key, alg) {
  var enc = session.createEncrypt(alg, key.key || key.publicKey);
  var msg = new Buffer(0);
  for (var i = 1; i <= BUF_SIZE; i = i + BUF_STEP) {
		  msg = Buffer.concat([msg, enc.update(buf)]);
  }
  msg = Buffer.concat([msg, enc.final()]);
  return msg;
}

function test_decrypt_operation(session, key, alg, message) {
  var decMsg = new Buffer(0);
  var dec = session.createDecrypt(alg, key.key || key.piblicKey);
  //for (var i = 1; i <= BUF_SIZE; i = i + BUF_STEP) {
  decMsg = Buffer.concat([decMsg, dec.update(message)]);
  //}
  decMsg = Buffer.concat([decMsg, dec.final()]);
  return decMsg;
}

function test_sign(session, cmd, prefix, postfix, signAlg) {
  try {
    var alg = prefix + "-" + postfix;
    if (cmd.alg == "all" || cmd.alg == prefix || cmd.alg == alg) {
      var tGen = new Timer();
      tGen.start();
      var key = gen[prefix][postfix](session);
      tGen.stop();
      debug("Key generation:", alg.toUpperCase(), tGen.time + "ms");
      //create buffer
      try {
        var buf = new Buffer(BUF_SIZE);
        var t1 = new Timer();
        var sig = null;
        /**
         * TODO: We need to determine why the first call to the device is so much slower, 
         * it may be the FFI initialization. For now we will exclude this one call from results.
         */
        test_sign_operation(session, buf, key, signAlg);
        t1.start();
        for (var i = 0; i < cmd.it; i++)
          sig = test_sign_operation(session, buf, key, signAlg);
        t1.stop();

        var t2 = new Timer();
        t2.start();
        for (var i = 0; i < cmd.it; i++) {
          test_verify_operation(session, buf, key, signAlg, sig);
        }
        t2.stop();

        var r1 = Math.round((t1.time / cmd.it) * 1000) / 1000 + "ms";
        var r2 = Math.round((t2.time / cmd.it) * 1000) / 1000 + "ms";
        var rs1 = Math.round((1000 / (t1.time / cmd.it)) * 1000) / 1000;
        var rs2 = Math.round((1000 / (t2.time / cmd.it)) * 1000) / 1000;
        print_test_sign_row(alg, r1, r2, rs1, rs2);
      } catch (e) {
        if (key.key)
          session.destroyObject(key.key);
        else {
          session.destroyObject(key.privateKey);
          session.destroyObject(key.publicKey);
        }
        throw e;
      }
      if (key.key)
        session.destroyObject(key.key);
      else {
        session.destroyObject(key.privateKey);
        session.destroyObject(key.publicKey);
      }
    }
    return true;
  }
  catch (e) {
    debug("%s-%s\n  %s", prefix, postfix, e.message);
  }
  return false;
}

function test_enc(session, cmd, prefix, postfix, encAlg) {
  try {
    var alg = prefix + "-" + postfix;
    if (cmd.alg == "all" || cmd.alg == prefix || cmd.alg == alg) {
      var tGen = new Timer();
      tGen.start();
      var key = gen[prefix][postfix](session);
      tGen.stop();
      debug("Key generation:", alg.toUpperCase(), tGen.time + "ms");
      try {
        var t1 = new Timer();
        //create buffer
        var buf = new Buffer(BUF_SIZE);
        var enc = null;
        /**
         * TODO: We need to determine why the first call to the device is so much slower, 
         * it may be the FFI initialization. For now we will exclude this one call from results.
         */
        
        test_encrypt_operation(session, buf, key, encAlg);
        t1.start();
        for (var i = 0; i < cmd.it; i++)
          enc = test_encrypt_operation(session, buf, key, encAlg);
        t1.stop();

        var t2 = new Timer();
        t2.start();
        var msg = null;
        for (var i = 0; i < cmd.it; i++) {
          msg = test_decrypt_operation(session, key, encAlg, enc);
        }
        t2.stop();

        var r1 = Math.round((t1.time / cmd.it) * 1000) / 1000 + "ms";
        var r2 = Math.round((t2.time / cmd.it) * 1000) / 1000 + "ms";
        var rs1 = Math.round((1000 / (t1.time / cmd.it)) * 1000) / 1000;
        var rs2 = Math.round((1000 / (t2.time / cmd.it)) * 1000) / 1000;
        print_test_sign_row(alg, r1, r2, rs1, rs2);
      } catch (e) {
        if (key.key)
          session.destroyObject(key.key);
        else {
          session.destroyObject(key.privateKey);
          session.destroyObject(key.publicKey);
        }
        throw e;
      }
      if (key.key)
        session.destroyObject(key.key);
      else {
        session.destroyObject(key.privateKey);
        session.destroyObject(key.publicKey);
      }
    }
    return true;
  }
  catch (e) {
    debug("%s-%s\n  %s", prefix, postfix, e.message);
    debug(e.stack);
  }
  return false;
}

function print_test_sign_header() {
  console.log("| %s | %s | %s | %s | %s |", rpud("Algorithm", 25), lpud("Sign", 8), lpud("Verify", 8), lpud("Sign/s", 9), lpud("Verify/s", 9));
  console.log("|%s|%s:|%s:|%s:|%s:|", rpud("", 27, "-"), rpud("", 9, "-"), rpud("", 9, "-"), rpud("", 10, "-"), rpud("", 10, "-"));
}

function print_test_enc_header() {
  console.log("| %s | %s | %s | %s | %s |", rpud("Algorithm", 25), lpud("Encrypt", 8), lpud("Decrypt", 8), lpud("Encrypt/s", 9), lpud("Decrypt/s", 9));
  console.log("|%s|%s:|%s:|%s-:|%s-:|", rpud("", 27, "-"), rpud("", 9, "-"), rpud("", 9, "-"), rpud("", 9, "-"), rpud("", 9, "-"));
}

function print_test_sign_row(alg, t1, t2, ts1, ts2) {
  console.log("| %s | %s | %s | %s | %s |", rpud(alg.toUpperCase(), 25), lpud(t1, 8), lpud(t2, 8), lpud(ts1, 9), lpud(ts2, 9));
}

var cmdTest = commander.createCommand("test", {
  description: "benchmark device performance for common algorithms",
  note: NOTE_SESSION
})
  .on("call", function (cmd) {
    this.help();
  });

function check_sign_algs(alg) {
  var list = ["all", "rsa", "rsa-1024", "rsa-2048", "rsa-4096", "ecdsa", "ecdsa-secp192r1", "ecdsa-secp256r1", "ecdsa-secp384r1", "ecdsa-secp256k1",
    "ecdsa-brainpoolP192r1", "ecdsa-brainpoolP224r1", "ecdsa-brainpoolP256r1", "ecdsa-brainpoolP320r1"];
  return list.indexOf(alg) !== -1;
}
function check_enc_algs(alg) {
  var list = ["all", "aes", "aes-cbc128", "aes-cbc192", "aes-cbc256", "aes-gcm128", "aes-gcm192", "aes-gcm256"];
  return list.indexOf(alg) !== -1;
}

function check_gen_algs(alg) {
  return check_sign_algs(alg) || ["aes", "aes-128", "aes-192", "aes-256"].indexOf(alg) !== -1;
}

function generate_iv(session, block_size) {
  var iv = session.generateRandom(block_size);
  if (iv.length !== block_size)
    throw new Error("IV has different size from block_size");
  return iv;
}

function build_gcm_params(iv) {
  return new AES.AesGCMParams(iv);
}

/**
 * enc
 */
var cmdTestEnc = cmdTest.command("enc", {
  description: "test encryption and decryption performance" + "\n\n" +
  pud("", 10) + "    Supported algorithms:\n" +
  pud("", 10) + "      aes, aes-cbc128, aes-cbc192, aes-cbc256" + "\n" +
  pud("", 10) + "      aes-gcm128, aes-gcm192, aes-gcm256" + "\n",
  note: NOTE_SESSION,
  example: "> test enc --alg aes -it 100"
})
  .option('buf', {
    description: 'Buffer size (bytes)',
    set: function (v) {
      var _v = +v;
      if (!_v)
        throw new TypeError("Parameter --buf must be Number (min 1024)");
      return _v;
    },
    value: BUF_SIZE_DEFAULT
  })
  .option('it', {
    description: 'Sets number of iterations. Default 1',
    set: function (v) {
      var res = +v;
      if (!Number.isInteger(res))
        throw new TypeError("Parameter --it must be number");
      if (res <= 0)
        throw new TypeError("Parameter --it must be more then 0");
      return res;
    },
    value: 1
  })
  .option('alg', {
    description: 'Algorithm name',
    isRequired: true
  })
  .on("call", function (cmd) {
    check_session();
    if (!check_enc_algs(cmd.alg)) {
      var error = new Error("No such algorithm");
      throw error;
    }
    console.log();
    print_test_enc_header();
    var AES_CBC_PARAMS = {
      name: "AES_CBC_PAD",
      params: new Buffer([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
    };
    var AES_GCM_PARAMS = {
      name: "AES_GCM",
      params: build_gcm_params(generate_iv(session, 16))
    };
    test_enc(session, cmd, "aes", "cbc128", AES_CBC_PARAMS);
    test_enc(session, cmd, "aes", "cbc192", AES_CBC_PARAMS);
    test_enc(session, cmd, "aes", "cbc256", AES_CBC_PARAMS);
    test_enc(session, cmd, "aes", "gcm128", AES_GCM_PARAMS);
    test_enc(session, cmd, "aes", "gcm192", AES_GCM_PARAMS);
    test_enc(session, cmd, "aes", "gcm256", AES_GCM_PARAMS);
    console.log();
  });
  
/**
 * sign
 */
var cmdTestSign = cmdTest.command("sign", {
  description: "test sign and verification performance" + "\n\n" +
  pud("", 10) + "    Supported algorithms:\n" +
  pud("", 10) + "      rsa, rsa-1024, rsa-2048, rsa-4096" + "\n" +
  pud("", 10) + "      ecdsa, ecdsa-secp192r1, ecdsa-secp256r1, ecdsa-secp384r1," + "\n" +
  pud("", 10) + "      ecdsa-secp256k1, ecdsa-brainpoolP192r1, ecdsa-brainpoolP224r1," + "\n" +
  pud("", 10) + "      ecdsa-brainpoolP256r1, ecdsa-brainpoolP320r1" + "\n",
  note: NOTE_SESSION,
  example: "> test sign --alg rsa-1024 --it 60"
})
  .option('buf', {
    description: 'Buffer size (bytes)',
    set: function (v) {
      var _v = +v;
      if (!_v)
        throw new TypeError("Parameter --buf must be Number (min 1024)");
      return _v;
    },
    value: BUF_SIZE_DEFAULT
  })
  .option('it', {
    description: 'Sets number of iterations. Default 1',
    set: function (v) {
      var res = +v;
      if (!Number.isInteger(res))
        throw new TypeError("Parameter --it must be number");
      if (res <= 0)
        throw new TypeError("Parameter --it must be more then 0");
      return res;
    },
    value: 1
  })
  .option('alg', {
    description: 'Algorithm name',
    isRequired: true
  })
  .on("call", function (cmd) {
    check_session();
    if (!check_sign_algs(cmd.alg)) {
      var error = new Error("No such algorithm");
      throw error;
    }
    console.log();
    print_test_sign_header();
    test_sign(session, cmd, "rsa", "1024", "SHA1_RSA_PKCS");
    test_sign(session, cmd, "rsa", "2048", "SHA1_RSA_PKCS");
    test_sign(session, cmd, "rsa", "4096", "SHA1_RSA_PKCS");
    test_sign(session, cmd, "ecdsa", "secp192r1", "ECDSA_SHA256");
    test_sign(session, cmd, "ecdsa", "secp256r1", "ECDSA_SHA256");
    test_sign(session, cmd, "ecdsa", "secp384r1", "ECDSA_SHA256");
    test_sign(session, cmd, "ecdsa", "secp256k1", "ECDSA_SHA256");
    test_sign(session, cmd, "ecdsa", "brainpoolP192r1", "ECDSA_SHA256");
    test_sign(session, cmd, "ecdsa", "brainpoolP224r1", "ECDSA_SHA256");
    test_sign(session, cmd, "ecdsa", "brainpoolP256r1", "ECDSA_SHA256");
    test_sign(session, cmd, "ecdsa", "brainpoolP320r1", "ECDSA_SHA256");
    console.log();
  });

function test_gen(session, cmd, prefix, postfix) {
  try {
    var alg = prefix + "-" + postfix;
    if (cmd.alg == "all" || cmd.alg == prefix || cmd.alg == alg) {
      var time = 0;
      for (var i = 0; i < cmd.it; i++) {
        var tGen = new Timer();
        tGen.start();
        var key = gen[prefix][postfix](session);
        tGen.stop();
        time += tGen.time;
        if (key.privateKey) {
          session.destroyObject(key.privateKey);
          session.destroyObject(key.publicKey);
        }
        else {
          session.destroyObject(key.key);
        }
      }
      var t1 = Math.round((time / cmd.it) * 1000) / 1000 + "ms";
      var t2 = Math.round((1000 / (time / cmd.it)) * 1000) / 1000;
      print_test_gen_row(alg, t1, t2);
      return true;
    }
    return false;
  }
  catch (e) {
    debug("%s-%s\n  %s", prefix, postfix, e.message);
  }
  return false;
}

function print_test_gen_header() {
  var TEMPLATE = '| %s | %s | %s |';
  console.log(TEMPLATE, rpud("Algorithm", 25), lpud("Generate", 8), lpud("Generate/s", 10));
  console.log('|-%s-|-%s:|-%s:|'.replace(/\s/g, "-"), rpud("", 25, "-"), lpud("", 8, "-"), lpud("", 10, "-"));
}

function print_test_gen_row(alg, t1, t2) {
  var TEMPLATE = '| %s | %s | %s |';
  console.log(TEMPLATE, rpud(alg.toUpperCase(), 25), lpud(t1, 8), lpud(t2, 10));
}
    
/**
 * gen
 */
var cmdTestGen = cmdTest.command("gen", {
  description: "test key generation performance" + "\n\n" +
  pud("", 10) + "    Supported algorithms:\n" +
  pud("", 10) + "      rsa, rsa-1024, rsa-2048, rsa-4096" + "\n" +
  pud("", 10) + "      ecdsa, ecdsa-secp192r1, ecdsa-secp256r1, ecdsa-secp384r1," + "\n" +
  pud("", 10) + "      ecdsa-secp256k1, ecdsa-brainpoolP192r1, ecdsa-brainpoolP224r1," + "\n" +
  pud("", 10) + "      ecdsa-brainpoolP256r1, ecdsa-brainpoolP320r1" + "\n" +
  pud("", 10) + "      aes, aes-cbc128, aes-cbc192, aes-cbc256",
  note: NOTE_SESSION,
  example: "> test gen --alg rsa-1024 --it 2"
})
  .option('it', {
    description: 'Sets number of iterations. Default 1',
    set: function (v) {
      var res = +v;
      if (!Number.isInteger(res))
        throw new TypeError("Parameter --it must be number");
      if (res <= 0)
        throw new TypeError("Parameter --it must be more then 0");
      return res;
    },
    value: 1
  })
  .option('alg', {
    description: 'Algorithm name',
    isRequired: true
  })
  .on("call", function (cmd) {
    check_session();
    if (!check_gen_algs(cmd.alg)) {
      var error = new Error("No such algorithm");
      throw error;
    }
    console.log();
    print_test_gen_header();
    //sign
    test_gen(session, cmd, "rsa", "1024");
    test_gen(session, cmd, "rsa", "2048");
    test_gen(session, cmd, "rsa", "4096");
    test_gen(session, cmd, "ecdsa", "secp192r1");
    test_gen(session, cmd, "ecdsa", "secp256r1");
    test_gen(session, cmd, "ecdsa", "secp384r1");
    test_gen(session, cmd, "ecdsa", "secp256k1");
    test_gen(session, cmd, "ecdsa", "brainpoolP192r1");
    test_gen(session, cmd, "ecdsa", "brainpoolP224r1");
    test_gen(session, cmd, "ecdsa", "brainpoolP256r1");
    test_gen(session, cmd, "ecdsa", "brainpoolP320r1");
    //enc
    test_gen(session, cmd, "aes", "128");
    test_gen(session, cmd, "aes", "192");
    test_gen(session, cmd, "aes", "256");
    console.log();
  });

//Read line
rl.on("line", function (cmd) {
  commander.parse(cmd);
  rl.prompt();
});
rl.prompt();