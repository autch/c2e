(function(root) {

  'use strict';

  var util = require('util');
  
  function Comet2() {
    this.rawMemory = new ArrayBuffer(0x10000 * 2);
    this.rawView = new DataView(this.rawMemory);
    this.addr = 0;
    this.regs = {
      GR: [0, 0, 0, 0, 0, 0, 0, 0],
      PR: 0,
      SP: 0,
      FR: { OF: 0, SF: 0, ZF: 0 }
    };
    this.trapTable = {};
  };

  // ==== "private" methods ====

  Comet2.prototype.getInsn = function(raw) {
    var op = (raw & 0xff00) >> 8;
    var op1 = (raw & 0xf000) >>> 12;
    var op2 = (raw & 0x0f00) >>> 8;
    var r1 =  (raw & 0x00f0) >>> 4;
    var r2 =   raw & 0x000f;
    
    return { "op": op, "op1": op1, "op2": op2,
             "r1": r1, "r2": r2,
             "r": r1, "x": r2 };
  };
  Comet2.prototype.readAddr = function() {
    this.addr = this.read(this.regs.PR++);
  };
  Comet2.prototype.setEffAddr = function(insn) {
    this.addr += (insn.x == 0) ? 0 : this.regs.GR[insn.x];
  };
  Comet2.prototype.readEffAddr = function(insn) {
    this.readAddr();
    this.setEffAddr(insn);
  };
  Comet2.prototype.refEffAddr = function(insn) {
    this.readEffAddr(insn);
    this.addr = this.read(this.addr);
  };
  // Sign EXtend, as in MC6809
  Comet2.prototype.sex = function(v) {
    return (v & 0x8000) ? -((v & 0x7fff) + 1) : v;
  };
  Comet2.prototype.setOFA = function(v) {
    this.regs.FR.OF = ((v < -32768) || (v > 32767)) ? 1 : 0;
  };
  Comet2.prototype.setOFL = function(v) {
    this.regs.FR.OF = (v > 65535) ? 1 : 0;
  };
  Comet2.prototype.setSF = function(v) {
    this.regs.FR.SF = (v & 0x8000) ? 1 : 0;
  };
  Comet2.prototype.setZF = function(v) {
    this.regs.FR.ZF = (v == 0) ? 1 : 0;
  };

  // ==== memory access ====
  
  Comet2.prototype.read = function(addr) {
    return this.rawView.getUint16(addr << 1);
  };
  Comet2.prototype.write = function(addr, value) {
    this.rawView.setUint16(addr << 1, value);
  };

  // ==== implementations of insns ====
  
  var insns = {
    INVALID: function(insn){
      throw "Invalid insn";
    },

    // op1 = 0
    
    NOP: function(insn) {
      // do nothing
    },

    // op1 = 1
    
    LD_rm: function(insn) { // op2 = 0
      this.refEffAddr(insn);
      this.regs.GR[insn.r] = this.addr;
    },
    ST: function(insn) { // op2 = 1
      this.readEffAddr(insn);
      this.write(this.addr, this.regs.GR[insn.r]);
    },
    LAD: function(insn) { // op2 = 2
      this.readEffAddr(insn);
      this.regs.GR[insn.r] = this.addr;
    },
    LD_rr: function(insn) { // op2 = 4
      this.regs.GR[insn.r1] = this.regs.GR[insn.r2];
      this.regs.FR.OF = 0; this.setSF(this.regs.GR[insn.r1]); this.setZF(this.regs.GR[insn.r1]);
    },

    // op1 = 2

    ADDA_rm: function(insn) { // op2 = 0
      this.refEffAddr(insn);
      var r = this.sex(this.regs.GR[insn.r]) + this.sex(this.addr);
      this.regs.GR[insn.r] = r & 0xffff;
      this.setOFA(r); this.setSF(this.regs.GR[insn.r]); this.setZF(this.regs.GR[insn.r]);
    },
    SUBA_rm: function(insn) { // op2 = 1
      this.refEffAddr(insn);
      var r = this.sex(this.regs.GR[insn.r]) - this.sex(this.addr);
      this.regs.GR[insn.r] = r & 0xffff;
      this.setOFA(r); this.setSF(this.regs.GR[insn.r]); this.setZF(this.regs.GR[insn.r]);
    },
    ADDL_rm: function(insn) { // op2 = 2
      this.refEffAddr(insn);
      var r = this.regs.GR[insn.r] + this.addr;
      this.regs.GR[insn.r] = r & 0xffff;
      this.setOFL(r); this.setSF(this.regs.GR[insn.r]); this.setZF(this.regs.GR[insn.r]);
    },
    SUBL_rm: function(insn) { // op2 = 3
      this.refEffAddr(insn);
      var r = this.regs.GR[insn.r] - this.addr;
      this.regs.GR[insn.r] = r & 0xffff;
      this.setOFL(r); this.setSF(this.regs.GR[insn.r]); this.setZF(this.regs.GR[insn.r]);
    },
    ADDA_rr: function(insn) { // op2 = 4
      var r = this.sex(this.regs.GR[insn.r1]) + this.sex(this.regs.GR[insn.r2]);
      this.regs.GR[insn.r1] = r & 0xffff;
      this.setOFA(r); this.setSF(this.regs.GR[insn.r1]); this.setZF(this.regs.GR[insn.r1]);
    },
    SUBA_rr: function(insn) { // op2 = 5
      var r = this.sex(this.regs.GR[insn.r1]) - this.sex(this.regs.GR[insn.r2]);
      this.regs.GR[insn.r1] = r & 0xffff;
      this.setOFA(r); this.setSF(this.regs.GR[insn.r1]); this.setZF(this.regs.GR[insn.r1]);
    },
    ADDL_rr: function(insn) { // op2 = 6
      var r = this.regs.GR[insn.r1] + this.regs.GR[insn.r2];
      this.regs.GR[insn.r1] = r & 0xffff;
      this.setOFL(r); this.setSF(this.regs.GR[insn.r1]); this.setZF(this.regs.GR[insn.r1]);
    },
    SUBL_rr: function(insn) { // op2 = 7
      var r = this.regs.GR[insn.r1] - this.regs.GR[insn.r2];
      this.regs.GR[insn.r1] = r & 0xffff;
      this.setOFL(r); this.setSF(this.regs.GR[insn.r1]); this.setZF(this.regs.GR[insn.r1]);
    },

    // op1 = 3

    AND_rm: function(insn) { // op2 = 0
      this.refEffAddr(insn);
      this.regs.GR[insn.r] &= this.addr;
      this.regs.FR.OF = 0; this.setSF(this.regs.GR[insn.r]); this.setZF(this.regs.GR[insn.r]);
    },
    OR_rm: function(insn) { // op2 = 1
      this.refEffAddr(insn);
      this.regs.GR[insn.r] |= this.addr;
      this.regs.FR.OF = 0; this.setSF(this.regs.GR[insn.r]); this.setZF(this.regs.GR[insn.r]);
    },
    XOR_rm: function(insn) { // op2 = 2
      this.refEffAddr(insn);
      this.regs.GR[insn.r] ^= this.addr;
      this.regs.FR.OF = 0; this.setSF(this.regs.GR[insn.r]); this.setZF(this.regs.GR[insn.r]);
    },

    AND_rr: function(insn) { // op2 = 4
      this.regs.GR[insn.r1] &= this.regs.GR[insn.r2];
      this.regs.FR.OF = 0; this.setSF(this.regs.GR[insn.r1]); this.setZF(this.regs.GR[insn.r1]);
    },
    OR_rr: function(insn) { // op2 = 5
      this.regs.GR[insn.r1] |= this.regs.GR[insn.r2];
      this.regs.FR.OF = 0; this.setSF(this.regs.GR[insn.r1]); this.setZF(this.regs.GR[insn.r1]);
    },
    XOR_rr: function(insn) { // op2 = 6
      this.regs.GR[insn.r1] ^= this.regs.GR[insn.r2];
      this.regs.FR.OF = 0; this.setSF(this.regs.GR[insn.r1]); this.setZF(this.regs.GR[insn.r1]);
    },

    // op1 = 4

    CPA_rm: function(insn) { // op2 = 0
      this.refEffAddr(insn);
      this.regs.FR.OF = 0;
      this.regs.FR.SF = (this.sex(this.regs.GR[insn.r]) < this.sex(this.addr)) ? 1 : 0;
      this.regs.FR.ZF = (this.sex(this.regs.GR[insn.r]) == this.sex(this.addr)) ? 1 : 0;
    },
    CPL_rm: function(insn) { // op2 = 1
      this.refEffAddr(insn);
      this.regs.FR.OF = 0;
      this.regs.FR.SF = (this.regs.GR[insn.r] < this.addr) ? 1 : 0;
      this.regs.FR.ZF = (this.regs.GR[insn.r] == this.addr) ? 1 : 0;
    },
    CPA_rr: function(insn) { // op2 = 4
      this.regs.FR.OF = 0;
      this.regs.FR.SF = (this.sex(this.regs.GR[insn.r1]) < this.sex(this.regs.GR[insn.r2])) ? 1 : 0;
      this.regs.FR.ZF = (this.sex(this.regs.GR[insn.r1]) == this.sex(this.regs.GR[insn.r2])) ? 1 : 0;
    },
    CPL_rr: function(insn) { // op2 = 5
      this.regs.FR.OF = 0;
      this.regs.FR.SF = (this.regs.GR[insn.r1] < this.regs.GR[insn.r2]) ? 1 : 0;
      this.regs.FR.ZF = (this.regs.GR[insn.r1] == this.regs.GR[insn.r2]) ? 1 : 0;
    },

    // op1 = 5

    SLA: function(insn) { // op2 = 0
      this.readEffAddr(insn);
      this.regs.FR.OF = (this.addr == 0) ? 0 : ((this.regs.GR[insn.r] & (1 << (15 - this.addr))) != 0);
      this.regs.GR[insn.r] <<= this.addr;
      this.setSF(this.regs.GR[insn.r]); this.setZF(this.regs.GR[insn.r]);
    },
    SRA: function(insn) { // op2 = 1
      this.readEffAddr(insn);
      this.regs.FR.OF = (this.addr == 0) ? 0 : ((this.regs.GR[insn.r] & (1 << (this.addr - 1))) != 0);
      this.regs.GR[insn.r] >>= this.addr;
      this.setSF(this.regs.GR[insn.r]); this.setZF(this.regs.GR[insn.r]);
    },
    SLL: function(insn) { // op2 = 2
      this.readEffAddr(insn);
      this.regs.FR.OF = this.regs.GR[insn.r] & 0x8000;
      this.regs.GR[insn.r] <<= this.addr;
      this.setSF(this.regs.GR[insn.r]); this.setZF(this.regs.GR[insn.r]);
    },
    SRL: function(insn) { // op2 = 3
      this.readEffAddr(insn);
      this.regs.FR.OF = this.regs.GR[insn.r] & 1;
      this.regs.GR[insn.r] >>>= this.addr;
      this.setSF(this.regs.GR[insn.r]); this.setZF(this.regs.GR[insn.r]);
    },

    // op1 = 6

    JMI: function(insn) { // op2 = 1
      this.readEffAddr(insn);
      if(this.regs.FR.SF != 0) this.regs.PR = this.addr;
    },
    JNZ: function(insn) { // op2 = 2
      this.readEffAddr(insn);
      if(this.regs.FR.ZF == 0) this.regs.PR = this.addr;
    },
    JZE: function(insn) { // op2 = 3
      this.readEffAddr(insn);
      if(this.regs.FR.ZF != 0) this.regs.PR = this.addr;
    },
    JUMP: function(insn) { // op2 = 4
      this.readEffAddr(insn);
      this.regs.PR = this.addr;
    },
    JPL: function(insn) { // op2 = 5
      this.readEffAddr(insn);
      if(this.regs.FR.SF == 0 && this.regs.FR.ZF == 0) this.regs.PR = this.addr;
    },
    JOV: function(insn) { // op2 = 6
      this.readEffAddr(insn);
      if(this.regs.FR.OF != 0) this.regs.PR = this.addr;
    },

    // op1 = 7

    PUSH: function(insn) { // op2 = 0
      this.readEffAddr(insn);
      this.write(--this.regs.SP, this.addr);
    },
    POP: function(insn) { // op2 = 1
      this.regs.GR[insn.r] = this.read(this.regs.SP++);
    },

    // op1 = 8

    CALL: function(insn) { // op2 = 0
      this.readEffAddr(insn);
      this.write(--this.regs.SP, this.regs.PR);
      this.regs.PR = this.addr;
    },
    RET: function(insn) { // op2 = 1
      this.regs.PR = this.read(this.regs.SP++);
    },
    
    // op1 = 0x0f

    SVC: function(insn) { // op2 = 0
      this.readEffAddr(insn);
      var vector = this.trapTable[this.addr];
      if(typeof vector == "undefined")
        throw "Int trap halt";
      this.write(--this.regs.SP, this.regs.PR);
      this.regs.PR = vector;
    }    
  };

  Comet2.prototype.insns = insns;
  Comet2.prototype.insnTable = {
    0x00: insns.NOP,
    0x10: insns.LD_rm,
    0x11: insns.ST,
    0x12: insns.LAD,
    0x14: insns.LD_rr,
    0x20: insns.ADDA_rm,
    0x21: insns.SUBA_rm,
    0x22: insns.ADDL_rm,
    0x23: insns.SUBL_rm,
    0x24: insns.ADDA_rr,
    0x25: insns.SUBA_rr,
    0x26: insns.ADDL_rr,
    0x27: insns.SUBL_rr,
    0x30: insns.AND_rm,
    0x31: insns.OR_rm,
    0x32: insns.XOR_rm,
    0x34: insns.AND_rr,
    0x35: insns.OR_rr,
    0x36: insns.XOR_rr,
    0x40: insns.CPA_rm,
    0x41: insns.CPL_rm,
    0x44: insns.CPA_rr,
    0x45: insns.CPL_rr,
    0x50: insns.SLA,
    0x51: insns.SRA,
    0x52: insns.SLL,
    0x53: insns.SRL,
    0x61: insns.JMI,
    0x62: insns.JNZ,
    0x63: insns.JZE,
    0x64: insns.JUMP,
    0x65: insns.JPL,
    0x66: insns.JOV,
    0x70: insns.PUSH,
    0x71: insns.POP,
    0x80: insns.CALL,
    0x81: insns.RET,
    0xf0: insns.SVC
  };

  // ====

  Comet2.prototype.step = function() {
    var i = this.read(this.regs.PR++);
    var insn = this.getInsn(i);

    var fn = this.insnTable[insn.op];
    if(typeof fn == "undefined")
      throw util.format("Invalid instruction: %d", insn.op);

    fn.call(this, insn);
  };
  Comet2.prototype.goTo = function(addr) {
    this.regs.PR = addr;
  };
  Comet2.prototype.kall = function(addr) {
    this.write(--this.regs.SP, this.regs.PR);
    this.regs.PR = addr;
  };
  Comet2.prototype.setSP = function(addr) {
    this.regs.SP = addr;
  };

  Comet2.prototype.setGR = function(i, v) {
    this.regs.GR[i] = v;
  };
  Comet2.prototype.getGR = function(i) {
    return this.regs.GR[i];
  };
  Comet2.prototype.getPR = function() {
    return this.regs.PR;
  };
  
  root.Comet2 = Comet2;
})(module.exports);
