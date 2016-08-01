import * as pkcs11 from "pkcs11js";
import * as core from "../../core";
import {MechanismEnum} from "../../mech";
import {RsaMgf} from "./mgf";
import {IParams, MechParams} from "../params";

export class RsaOaepParams implements IParams {

    hashAlgorithm: MechanismEnum;
    mgf: RsaMgf;
    source: number = 1;
    sourceData: Buffer;

    type = MechParams.RsaOAEP;


    constructor(hashAlg: MechanismEnum = MechanismEnum.SHA1, mgf: RsaMgf = RsaMgf.MGF1_SHA1, sourceData: Buffer = null) {
        this.hashAlgorithm = hashAlg;
        this.mgf = mgf;
        this.sourceData = sourceData || null;
    }

    toCKI(): pkcs11.RsaOAEP {
        return {
            hashAlg: this.hashAlgorithm,
            mgf: this.mgf,
            source: this.source,
            sourceData: this.sourceData,
            type: this.type
        };
    }
}