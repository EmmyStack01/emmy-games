// Browser stand-in for "phaser" (only Settings.js needs it, for an event emitter)
class EventEmitter { constructor(){this._l={};} on(n,f){(this._l[n]??=new Set()).add(f);return this;} off(n,f){this._l[n]?.delete(f);return this;} emit(n,...a){this._l[n]?.forEach(f=>f(...a));return true;} once(n,f){const w=(...a)=>{this.off(n,w);f(...a)};return this.on(n,w);} }
export default { Events: { EventEmitter } };
