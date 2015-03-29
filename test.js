
var c = require('./comet2.js');
var assert = require('assert');

var memImage = [
  0x7001, 0x0000,
  0x7002, 0x0000,
  0x2522,
  0x3411,
  0x6300, 0x000f,
  0x1222, 0x0001,
  0x1201, 0xffff,
  0x3410,
  0x6200, 0x0008,
  0x1402,
  0x7120,
  0x7110,
  0x8100
];

core = new c.Comet2();

for(var i = 0; i < memImage.length; i++) {
  core.rawView.setUint16(i * 2, memImage[i]);
}

core.setSP(0xffff);
core.goTo(0xffff);
core.setGR(1, 0xcab7);

core.kall(0x0000);
while(core.getPR() != 0xffff) {
  console.log(core.regs);
  core.step();
}

assert.equal(core.getGR(0), 10);

console.log(core.regs);
