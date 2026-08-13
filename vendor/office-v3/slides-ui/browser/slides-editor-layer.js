(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require2() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // browser/stub-node.ts
  var stub_node_exports = {};
  __export(stub_node_exports, {
    Buffer: () => Buffer2,
    Readable: () => Readable,
    Writable: () => Writable,
    btoa: () => btoa2,
    createDeflate: () => createDeflate,
    createHash: () => createHash,
    createInflate: () => createInflate,
    default: () => stub_node_default,
    deflateSync: () => deflateSync,
    dirname: () => dirname,
    execFile: () => execFile,
    existsSync: () => existsSync,
    gunzipSync: () => gunzipSync,
    gzipSync: () => gzipSync,
    inflateSync: () => inflateSync,
    join: () => join,
    mkdir: () => mkdir,
    mkdirSync: () => mkdirSync,
    open: () => open,
    randomUUID: () => randomUUID,
    readFile: () => readFile,
    resolve: () => resolve,
    rm: () => rm,
    stat: () => stat,
    userInfo: () => userInfo,
    writeFile: () => writeFile
  });
  var readFile, writeFile, rm, stat, mkdir, open, existsSync, mkdirSync, createHash, randomUUID, userInfo, dirname, join, resolve, execFile, stub_node_default, deflateSync, inflateSync, gunzipSync, gzipSync, createDeflate, createInflate, Readable, Writable, Buffer2, btoa2;
  var init_stub_node = __esm({
    "browser/stub-node.ts"() {
      readFile = async () => {
        throw new Error("\u6D4F\u89C8\u5668\u73AF\u5883\u4E0D\u652F\u6301\u6587\u4EF6\u7CFB\u7EDF");
      };
      writeFile = async () => {
        throw new Error("\u6D4F\u89C8\u5668\u73AF\u5883\u4E0D\u652F\u6301\u6587\u4EF6\u7CFB\u7EDF");
      };
      rm = async () => {
        throw new Error("\u6D4F\u89C8\u5668\u73AF\u5883\u4E0D\u652F\u6301\u6587\u4EF6\u7CFB\u7EDF");
      };
      stat = async () => {
        throw new Error("\u6D4F\u89C8\u5668\u73AF\u5883\u4E0D\u652F\u6301\u6587\u4EF6\u7CFB\u7EDF");
      };
      mkdir = async () => {
        throw new Error("\u6D4F\u89C8\u5668\u73AF\u5883\u4E0D\u652F\u6301\u6587\u4EF6\u7CFB\u7EDF");
      };
      open = async () => {
        throw new Error("\u6D4F\u89C8\u5668\u73AF\u5883\u4E0D\u652F\u6301\u6587\u4EF6\u7CFB\u7EDF");
      };
      existsSync = () => false;
      mkdirSync = () => {
      };
      createHash = () => ({
        update() {
          return this;
        },
        digest() {
          return "local-hash";
        }
      });
      randomUUID = () => "browser-" + Math.random().toString(36).slice(2);
      userInfo = () => ({ username: "browser" });
      dirname = () => "";
      join = () => "";
      resolve = () => "";
      execFile = async () => {
        throw new Error("\u6D4F\u89C8\u5668\u73AF\u5883\u4E0D\u652F\u6301\u5B50\u8FDB\u7A0B");
      };
      stub_node_default = {};
      deflateSync = (d) => d;
      inflateSync = (d) => d;
      gunzipSync = (d) => d;
      gzipSync = (d) => d;
      createDeflate = () => ({ on() {
      }, push() {
      }, end() {
      } });
      createInflate = () => ({ on() {
      }, push() {
      }, end() {
      } });
      Readable = class {
        pipe() {
          return this;
        }
        on() {
          return this;
        }
      };
      Writable = class {
      };
      Buffer2 = {
        from: (x, enc) => typeof x === "string" ? new Uint8Array(new TextEncoder().encode(x)) : new Uint8Array(x),
        isBuffer: () => false,
        alloc: (n) => new Uint8Array(n),
        concat: (arrs) => {
          const t = arrs.reduce((a, b) => a + b.length, 0);
          const o = new Uint8Array(t);
          let p = 0;
          arrs.forEach((a) => {
            o.set(a, p);
            p += a.length;
          });
          return o;
        }
      };
      btoa2 = (s) => globalThis.btoa(s);
    }
  });

  // ../../../node_modules/jszip/dist/jszip.min.js
  var require_jszip_min = __commonJS({
    "../../../node_modules/jszip/dist/jszip.min.js"(exports2, module) {
      !(function(e) {
        if ("object" == typeof exports2 && "undefined" != typeof module) module.exports = e();
        else if ("function" == typeof define && define.amd) define([], e);
        else {
          ("undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof self ? self : this).JSZip = e();
        }
      })(function() {
        return (function s(a, o, h) {
          function u(r, e2) {
            if (!o[r]) {
              if (!a[r]) {
                var t = "function" == typeof __require && __require;
                if (!e2 && t) return t(r, true);
                if (l) return l(r, true);
                var n = new Error("Cannot find module '" + r + "'");
                throw n.code = "MODULE_NOT_FOUND", n;
              }
              var i = o[r] = { exports: {} };
              a[r][0].call(i.exports, function(e3) {
                var t2 = a[r][1][e3];
                return u(t2 || e3);
              }, i, i.exports, s, a, o, h);
            }
            return o[r].exports;
          }
          for (var l = "function" == typeof __require && __require, e = 0; e < h.length; e++) u(h[e]);
          return u;
        })({ 1: [function(e, t, r) {
          "use strict";
          var d = e("./utils"), c = e("./support"), p = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
          r.encode = function(e2) {
            for (var t2, r2, n, i, s, a, o, h = [], u = 0, l = e2.length, f = l, c2 = "string" !== d.getTypeOf(e2); u < e2.length; ) f = l - u, n = c2 ? (t2 = e2[u++], r2 = u < l ? e2[u++] : 0, u < l ? e2[u++] : 0) : (t2 = e2.charCodeAt(u++), r2 = u < l ? e2.charCodeAt(u++) : 0, u < l ? e2.charCodeAt(u++) : 0), i = t2 >> 2, s = (3 & t2) << 4 | r2 >> 4, a = 1 < f ? (15 & r2) << 2 | n >> 6 : 64, o = 2 < f ? 63 & n : 64, h.push(p.charAt(i) + p.charAt(s) + p.charAt(a) + p.charAt(o));
            return h.join("");
          }, r.decode = function(e2) {
            var t2, r2, n, i, s, a, o = 0, h = 0, u = "data:";
            if (e2.substr(0, u.length) === u) throw new Error("Invalid base64 input, it looks like a data url.");
            var l, f = 3 * (e2 = e2.replace(/[^A-Za-z0-9+/=]/g, "")).length / 4;
            if (e2.charAt(e2.length - 1) === p.charAt(64) && f--, e2.charAt(e2.length - 2) === p.charAt(64) && f--, f % 1 != 0) throw new Error("Invalid base64 input, bad content length.");
            for (l = c.uint8array ? new Uint8Array(0 | f) : new Array(0 | f); o < e2.length; ) t2 = p.indexOf(e2.charAt(o++)) << 2 | (i = p.indexOf(e2.charAt(o++))) >> 4, r2 = (15 & i) << 4 | (s = p.indexOf(e2.charAt(o++))) >> 2, n = (3 & s) << 6 | (a = p.indexOf(e2.charAt(o++))), l[h++] = t2, 64 !== s && (l[h++] = r2), 64 !== a && (l[h++] = n);
            return l;
          };
        }, { "./support": 30, "./utils": 32 }], 2: [function(e, t, r) {
          "use strict";
          var n = e("./external"), i = e("./stream/DataWorker"), s = e("./stream/Crc32Probe"), a = e("./stream/DataLengthProbe");
          function o(e2, t2, r2, n2, i2) {
            this.compressedSize = e2, this.uncompressedSize = t2, this.crc32 = r2, this.compression = n2, this.compressedContent = i2;
          }
          o.prototype = { getContentWorker: function() {
            var e2 = new i(n.Promise.resolve(this.compressedContent)).pipe(this.compression.uncompressWorker()).pipe(new a("data_length")), t2 = this;
            return e2.on("end", function() {
              if (this.streamInfo.data_length !== t2.uncompressedSize) throw new Error("Bug : uncompressed data size mismatch");
            }), e2;
          }, getCompressedWorker: function() {
            return new i(n.Promise.resolve(this.compressedContent)).withStreamInfo("compressedSize", this.compressedSize).withStreamInfo("uncompressedSize", this.uncompressedSize).withStreamInfo("crc32", this.crc32).withStreamInfo("compression", this.compression);
          } }, o.createWorkerFrom = function(e2, t2, r2) {
            return e2.pipe(new s()).pipe(new a("uncompressedSize")).pipe(t2.compressWorker(r2)).pipe(new a("compressedSize")).withStreamInfo("compression", t2);
          }, t.exports = o;
        }, { "./external": 6, "./stream/Crc32Probe": 25, "./stream/DataLengthProbe": 26, "./stream/DataWorker": 27 }], 3: [function(e, t, r) {
          "use strict";
          var n = e("./stream/GenericWorker");
          r.STORE = { magic: "\0\0", compressWorker: function() {
            return new n("STORE compression");
          }, uncompressWorker: function() {
            return new n("STORE decompression");
          } }, r.DEFLATE = e("./flate");
        }, { "./flate": 7, "./stream/GenericWorker": 28 }], 4: [function(e, t, r) {
          "use strict";
          var n = e("./utils");
          var o = (function() {
            for (var e2, t2 = [], r2 = 0; r2 < 256; r2++) {
              e2 = r2;
              for (var n2 = 0; n2 < 8; n2++) e2 = 1 & e2 ? 3988292384 ^ e2 >>> 1 : e2 >>> 1;
              t2[r2] = e2;
            }
            return t2;
          })();
          t.exports = function(e2, t2) {
            return void 0 !== e2 && e2.length ? "string" !== n.getTypeOf(e2) ? (function(e3, t3, r2, n2) {
              var i = o, s = n2 + r2;
              e3 ^= -1;
              for (var a = n2; a < s; a++) e3 = e3 >>> 8 ^ i[255 & (e3 ^ t3[a])];
              return -1 ^ e3;
            })(0 | t2, e2, e2.length, 0) : (function(e3, t3, r2, n2) {
              var i = o, s = n2 + r2;
              e3 ^= -1;
              for (var a = n2; a < s; a++) e3 = e3 >>> 8 ^ i[255 & (e3 ^ t3.charCodeAt(a))];
              return -1 ^ e3;
            })(0 | t2, e2, e2.length, 0) : 0;
          };
        }, { "./utils": 32 }], 5: [function(e, t, r) {
          "use strict";
          r.base64 = false, r.binary = false, r.dir = false, r.createFolders = true, r.date = null, r.compression = null, r.compressionOptions = null, r.comment = null, r.unixPermissions = null, r.dosPermissions = null;
        }, {}], 6: [function(e, t, r) {
          "use strict";
          var n = null;
          n = "undefined" != typeof Promise ? Promise : e("lie"), t.exports = { Promise: n };
        }, { lie: 37 }], 7: [function(e, t, r) {
          "use strict";
          var n = "undefined" != typeof Uint8Array && "undefined" != typeof Uint16Array && "undefined" != typeof Uint32Array, i = e("pako"), s = e("./utils"), a = e("./stream/GenericWorker"), o = n ? "uint8array" : "array";
          function h(e2, t2) {
            a.call(this, "FlateWorker/" + e2), this._pako = null, this._pakoAction = e2, this._pakoOptions = t2, this.meta = {};
          }
          r.magic = "\b\0", s.inherits(h, a), h.prototype.processChunk = function(e2) {
            this.meta = e2.meta, null === this._pako && this._createPako(), this._pako.push(s.transformTo(o, e2.data), false);
          }, h.prototype.flush = function() {
            a.prototype.flush.call(this), null === this._pako && this._createPako(), this._pako.push([], true);
          }, h.prototype.cleanUp = function() {
            a.prototype.cleanUp.call(this), this._pako = null;
          }, h.prototype._createPako = function() {
            this._pako = new i[this._pakoAction]({ raw: true, level: this._pakoOptions.level || -1 });
            var t2 = this;
            this._pako.onData = function(e2) {
              t2.push({ data: e2, meta: t2.meta });
            };
          }, r.compressWorker = function(e2) {
            return new h("Deflate", e2);
          }, r.uncompressWorker = function() {
            return new h("Inflate", {});
          };
        }, { "./stream/GenericWorker": 28, "./utils": 32, pako: 38 }], 8: [function(e, t, r) {
          "use strict";
          function A(e2, t2) {
            var r2, n2 = "";
            for (r2 = 0; r2 < t2; r2++) n2 += String.fromCharCode(255 & e2), e2 >>>= 8;
            return n2;
          }
          function n(e2, t2, r2, n2, i2, s2) {
            var a, o, h = e2.file, u = e2.compression, l = s2 !== O.utf8encode, f = I.transformTo("string", s2(h.name)), c = I.transformTo("string", O.utf8encode(h.name)), d = h.comment, p = I.transformTo("string", s2(d)), m = I.transformTo("string", O.utf8encode(d)), _ = c.length !== h.name.length, g = m.length !== d.length, b = "", v = "", y = "", w = h.dir, k = h.date, x = { crc32: 0, compressedSize: 0, uncompressedSize: 0 };
            t2 && !r2 || (x.crc32 = e2.crc32, x.compressedSize = e2.compressedSize, x.uncompressedSize = e2.uncompressedSize);
            var S = 0;
            t2 && (S |= 8), l || !_ && !g || (S |= 2048);
            var z = 0, C = 0;
            w && (z |= 16), "UNIX" === i2 ? (C = 798, z |= (function(e3, t3) {
              var r3 = e3;
              return e3 || (r3 = t3 ? 16893 : 33204), (65535 & r3) << 16;
            })(h.unixPermissions, w)) : (C = 20, z |= (function(e3) {
              return 63 & (e3 || 0);
            })(h.dosPermissions)), a = k.getUTCHours(), a <<= 6, a |= k.getUTCMinutes(), a <<= 5, a |= k.getUTCSeconds() / 2, o = k.getUTCFullYear() - 1980, o <<= 4, o |= k.getUTCMonth() + 1, o <<= 5, o |= k.getUTCDate(), _ && (v = A(1, 1) + A(B(f), 4) + c, b += "up" + A(v.length, 2) + v), g && (y = A(1, 1) + A(B(p), 4) + m, b += "uc" + A(y.length, 2) + y);
            var E = "";
            return E += "\n\0", E += A(S, 2), E += u.magic, E += A(a, 2), E += A(o, 2), E += A(x.crc32, 4), E += A(x.compressedSize, 4), E += A(x.uncompressedSize, 4), E += A(f.length, 2), E += A(b.length, 2), { fileRecord: R.LOCAL_FILE_HEADER + E + f + b, dirRecord: R.CENTRAL_FILE_HEADER + A(C, 2) + E + A(p.length, 2) + "\0\0\0\0" + A(z, 4) + A(n2, 4) + f + b + p };
          }
          var I = e("../utils"), i = e("../stream/GenericWorker"), O = e("../utf8"), B = e("../crc32"), R = e("../signature");
          function s(e2, t2, r2, n2) {
            i.call(this, "ZipFileWorker"), this.bytesWritten = 0, this.zipComment = t2, this.zipPlatform = r2, this.encodeFileName = n2, this.streamFiles = e2, this.accumulate = false, this.contentBuffer = [], this.dirRecords = [], this.currentSourceOffset = 0, this.entriesCount = 0, this.currentFile = null, this._sources = [];
          }
          I.inherits(s, i), s.prototype.push = function(e2) {
            var t2 = e2.meta.percent || 0, r2 = this.entriesCount, n2 = this._sources.length;
            this.accumulate ? this.contentBuffer.push(e2) : (this.bytesWritten += e2.data.length, i.prototype.push.call(this, { data: e2.data, meta: { currentFile: this.currentFile, percent: r2 ? (t2 + 100 * (r2 - n2 - 1)) / r2 : 100 } }));
          }, s.prototype.openedSource = function(e2) {
            this.currentSourceOffset = this.bytesWritten, this.currentFile = e2.file.name;
            var t2 = this.streamFiles && !e2.file.dir;
            if (t2) {
              var r2 = n(e2, t2, false, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
              this.push({ data: r2.fileRecord, meta: { percent: 0 } });
            } else this.accumulate = true;
          }, s.prototype.closedSource = function(e2) {
            this.accumulate = false;
            var t2 = this.streamFiles && !e2.file.dir, r2 = n(e2, t2, true, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
            if (this.dirRecords.push(r2.dirRecord), t2) this.push({ data: (function(e3) {
              return R.DATA_DESCRIPTOR + A(e3.crc32, 4) + A(e3.compressedSize, 4) + A(e3.uncompressedSize, 4);
            })(e2), meta: { percent: 100 } });
            else for (this.push({ data: r2.fileRecord, meta: { percent: 0 } }); this.contentBuffer.length; ) this.push(this.contentBuffer.shift());
            this.currentFile = null;
          }, s.prototype.flush = function() {
            for (var e2 = this.bytesWritten, t2 = 0; t2 < this.dirRecords.length; t2++) this.push({ data: this.dirRecords[t2], meta: { percent: 100 } });
            var r2 = this.bytesWritten - e2, n2 = (function(e3, t3, r3, n3, i2) {
              var s2 = I.transformTo("string", i2(n3));
              return R.CENTRAL_DIRECTORY_END + "\0\0\0\0" + A(e3, 2) + A(e3, 2) + A(t3, 4) + A(r3, 4) + A(s2.length, 2) + s2;
            })(this.dirRecords.length, r2, e2, this.zipComment, this.encodeFileName);
            this.push({ data: n2, meta: { percent: 100 } });
          }, s.prototype.prepareNextSource = function() {
            this.previous = this._sources.shift(), this.openedSource(this.previous.streamInfo), this.isPaused ? this.previous.pause() : this.previous.resume();
          }, s.prototype.registerPrevious = function(e2) {
            this._sources.push(e2);
            var t2 = this;
            return e2.on("data", function(e3) {
              t2.processChunk(e3);
            }), e2.on("end", function() {
              t2.closedSource(t2.previous.streamInfo), t2._sources.length ? t2.prepareNextSource() : t2.end();
            }), e2.on("error", function(e3) {
              t2.error(e3);
            }), this;
          }, s.prototype.resume = function() {
            return !!i.prototype.resume.call(this) && (!this.previous && this._sources.length ? (this.prepareNextSource(), true) : this.previous || this._sources.length || this.generatedError ? void 0 : (this.end(), true));
          }, s.prototype.error = function(e2) {
            var t2 = this._sources;
            if (!i.prototype.error.call(this, e2)) return false;
            for (var r2 = 0; r2 < t2.length; r2++) try {
              t2[r2].error(e2);
            } catch (e3) {
            }
            return true;
          }, s.prototype.lock = function() {
            i.prototype.lock.call(this);
            for (var e2 = this._sources, t2 = 0; t2 < e2.length; t2++) e2[t2].lock();
          }, t.exports = s;
        }, { "../crc32": 4, "../signature": 23, "../stream/GenericWorker": 28, "../utf8": 31, "../utils": 32 }], 9: [function(e, t, r) {
          "use strict";
          var u = e("../compressions"), n = e("./ZipFileWorker");
          r.generateWorker = function(e2, a, t2) {
            var o = new n(a.streamFiles, t2, a.platform, a.encodeFileName), h = 0;
            try {
              e2.forEach(function(e3, t3) {
                h++;
                var r2 = (function(e4, t4) {
                  var r3 = e4 || t4, n3 = u[r3];
                  if (!n3) throw new Error(r3 + " is not a valid compression method !");
                  return n3;
                })(t3.options.compression, a.compression), n2 = t3.options.compressionOptions || a.compressionOptions || {}, i = t3.dir, s = t3.date;
                t3._compressWorker(r2, n2).withStreamInfo("file", { name: e3, dir: i, date: s, comment: t3.comment || "", unixPermissions: t3.unixPermissions, dosPermissions: t3.dosPermissions }).pipe(o);
              }), o.entriesCount = h;
            } catch (e3) {
              o.error(e3);
            }
            return o;
          };
        }, { "../compressions": 3, "./ZipFileWorker": 8 }], 10: [function(e, t, r) {
          "use strict";
          function n() {
            if (!(this instanceof n)) return new n();
            if (arguments.length) throw new Error("The constructor with parameters has been removed in JSZip 3.0, please check the upgrade guide.");
            this.files = /* @__PURE__ */ Object.create(null), this.comment = null, this.root = "", this.clone = function() {
              var e2 = new n();
              for (var t2 in this) "function" != typeof this[t2] && (e2[t2] = this[t2]);
              return e2;
            };
          }
          (n.prototype = e("./object")).loadAsync = e("./load"), n.support = e("./support"), n.defaults = e("./defaults"), n.version = "3.10.1", n.loadAsync = function(e2, t2) {
            return new n().loadAsync(e2, t2);
          }, n.external = e("./external"), t.exports = n;
        }, { "./defaults": 5, "./external": 6, "./load": 11, "./object": 15, "./support": 30 }], 11: [function(e, t, r) {
          "use strict";
          var u = e("./utils"), i = e("./external"), n = e("./utf8"), s = e("./zipEntries"), a = e("./stream/Crc32Probe"), l = e("./nodejsUtils");
          function f(n2) {
            return new i.Promise(function(e2, t2) {
              var r2 = n2.decompressed.getContentWorker().pipe(new a());
              r2.on("error", function(e3) {
                t2(e3);
              }).on("end", function() {
                r2.streamInfo.crc32 !== n2.decompressed.crc32 ? t2(new Error("Corrupted zip : CRC32 mismatch")) : e2();
              }).resume();
            });
          }
          t.exports = function(e2, o) {
            var h = this;
            return o = u.extend(o || {}, { base64: false, checkCRC32: false, optimizedBinaryString: false, createFolders: false, decodeFileName: n.utf8decode }), l.isNode && l.isStream(e2) ? i.Promise.reject(new Error("JSZip can't accept a stream when loading a zip file.")) : u.prepareContent("the loaded zip file", e2, true, o.optimizedBinaryString, o.base64).then(function(e3) {
              var t2 = new s(o);
              return t2.load(e3), t2;
            }).then(function(e3) {
              var t2 = [i.Promise.resolve(e3)], r2 = e3.files;
              if (o.checkCRC32) for (var n2 = 0; n2 < r2.length; n2++) t2.push(f(r2[n2]));
              return i.Promise.all(t2);
            }).then(function(e3) {
              for (var t2 = e3.shift(), r2 = t2.files, n2 = 0; n2 < r2.length; n2++) {
                var i2 = r2[n2], s2 = i2.fileNameStr, a2 = u.resolve(i2.fileNameStr);
                h.file(a2, i2.decompressed, { binary: true, optimizedBinaryString: true, date: i2.date, dir: i2.dir, comment: i2.fileCommentStr.length ? i2.fileCommentStr : null, unixPermissions: i2.unixPermissions, dosPermissions: i2.dosPermissions, createFolders: o.createFolders }), i2.dir || (h.file(a2).unsafeOriginalName = s2);
              }
              return t2.zipComment.length && (h.comment = t2.zipComment), h;
            });
          };
        }, { "./external": 6, "./nodejsUtils": 14, "./stream/Crc32Probe": 25, "./utf8": 31, "./utils": 32, "./zipEntries": 33 }], 12: [function(e, t, r) {
          "use strict";
          var n = e("../utils"), i = e("../stream/GenericWorker");
          function s(e2, t2) {
            i.call(this, "Nodejs stream input adapter for " + e2), this._upstreamEnded = false, this._bindStream(t2);
          }
          n.inherits(s, i), s.prototype._bindStream = function(e2) {
            var t2 = this;
            (this._stream = e2).pause(), e2.on("data", function(e3) {
              t2.push({ data: e3, meta: { percent: 0 } });
            }).on("error", function(e3) {
              t2.isPaused ? this.generatedError = e3 : t2.error(e3);
            }).on("end", function() {
              t2.isPaused ? t2._upstreamEnded = true : t2.end();
            });
          }, s.prototype.pause = function() {
            return !!i.prototype.pause.call(this) && (this._stream.pause(), true);
          }, s.prototype.resume = function() {
            return !!i.prototype.resume.call(this) && (this._upstreamEnded ? this.end() : this._stream.resume(), true);
          }, t.exports = s;
        }, { "../stream/GenericWorker": 28, "../utils": 32 }], 13: [function(e, t, r) {
          "use strict";
          var i = e("readable-stream").Readable;
          function n(e2, t2, r2) {
            i.call(this, t2), this._helper = e2;
            var n2 = this;
            e2.on("data", function(e3, t3) {
              n2.push(e3) || n2._helper.pause(), r2 && r2(t3);
            }).on("error", function(e3) {
              n2.emit("error", e3);
            }).on("end", function() {
              n2.push(null);
            });
          }
          e("../utils").inherits(n, i), n.prototype._read = function() {
            this._helper.resume();
          }, t.exports = n;
        }, { "../utils": 32, "readable-stream": 16 }], 14: [function(e, t, r) {
          "use strict";
          t.exports = { isNode: "undefined" != typeof Buffer, newBufferFrom: function(e2, t2) {
            if (Buffer.from && Buffer.from !== Uint8Array.from) return Buffer.from(e2, t2);
            if ("number" == typeof e2) throw new Error('The "data" argument must not be a number');
            return new Buffer(e2, t2);
          }, allocBuffer: function(e2) {
            if (Buffer.alloc) return Buffer.alloc(e2);
            var t2 = new Buffer(e2);
            return t2.fill(0), t2;
          }, isBuffer: function(e2) {
            return Buffer.isBuffer(e2);
          }, isStream: function(e2) {
            return e2 && "function" == typeof e2.on && "function" == typeof e2.pause && "function" == typeof e2.resume;
          } };
        }, {}], 15: [function(e, t, r) {
          "use strict";
          function s(e2, t2, r2) {
            var n2, i2 = u.getTypeOf(t2), s2 = u.extend(r2 || {}, f);
            s2.date = s2.date || /* @__PURE__ */ new Date(), null !== s2.compression && (s2.compression = s2.compression.toUpperCase()), "string" == typeof s2.unixPermissions && (s2.unixPermissions = parseInt(s2.unixPermissions, 8)), s2.unixPermissions && 16384 & s2.unixPermissions && (s2.dir = true), s2.dosPermissions && 16 & s2.dosPermissions && (s2.dir = true), s2.dir && (e2 = g(e2)), s2.createFolders && (n2 = _(e2)) && b.call(this, n2, true);
            var a2 = "string" === i2 && false === s2.binary && false === s2.base64;
            r2 && void 0 !== r2.binary || (s2.binary = !a2), (t2 instanceof c && 0 === t2.uncompressedSize || s2.dir || !t2 || 0 === t2.length) && (s2.base64 = false, s2.binary = true, t2 = "", s2.compression = "STORE", i2 = "string");
            var o2 = null;
            o2 = t2 instanceof c || t2 instanceof l ? t2 : p.isNode && p.isStream(t2) ? new m(e2, t2) : u.prepareContent(e2, t2, s2.binary, s2.optimizedBinaryString, s2.base64);
            var h2 = new d(e2, o2, s2);
            this.files[e2] = h2;
          }
          var i = e("./utf8"), u = e("./utils"), l = e("./stream/GenericWorker"), a = e("./stream/StreamHelper"), f = e("./defaults"), c = e("./compressedObject"), d = e("./zipObject"), o = e("./generate"), p = e("./nodejsUtils"), m = e("./nodejs/NodejsStreamInputAdapter"), _ = function(e2) {
            "/" === e2.slice(-1) && (e2 = e2.substring(0, e2.length - 1));
            var t2 = e2.lastIndexOf("/");
            return 0 < t2 ? e2.substring(0, t2) : "";
          }, g = function(e2) {
            return "/" !== e2.slice(-1) && (e2 += "/"), e2;
          }, b = function(e2, t2) {
            return t2 = void 0 !== t2 ? t2 : f.createFolders, e2 = g(e2), this.files[e2] || s.call(this, e2, null, { dir: true, createFolders: t2 }), this.files[e2];
          };
          function h(e2) {
            return "[object RegExp]" === Object.prototype.toString.call(e2);
          }
          var n = { load: function() {
            throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
          }, forEach: function(e2) {
            var t2, r2, n2;
            for (t2 in this.files) n2 = this.files[t2], (r2 = t2.slice(this.root.length, t2.length)) && t2.slice(0, this.root.length) === this.root && e2(r2, n2);
          }, filter: function(r2) {
            var n2 = [];
            return this.forEach(function(e2, t2) {
              r2(e2, t2) && n2.push(t2);
            }), n2;
          }, file: function(e2, t2, r2) {
            if (1 !== arguments.length) return e2 = this.root + e2, s.call(this, e2, t2, r2), this;
            if (h(e2)) {
              var n2 = e2;
              return this.filter(function(e3, t3) {
                return !t3.dir && n2.test(e3);
              });
            }
            var i2 = this.files[this.root + e2];
            return i2 && !i2.dir ? i2 : null;
          }, folder: function(r2) {
            if (!r2) return this;
            if (h(r2)) return this.filter(function(e3, t3) {
              return t3.dir && r2.test(e3);
            });
            var e2 = this.root + r2, t2 = b.call(this, e2), n2 = this.clone();
            return n2.root = t2.name, n2;
          }, remove: function(r2) {
            r2 = this.root + r2;
            var e2 = this.files[r2];
            if (e2 || ("/" !== r2.slice(-1) && (r2 += "/"), e2 = this.files[r2]), e2 && !e2.dir) delete this.files[r2];
            else for (var t2 = this.filter(function(e3, t3) {
              return t3.name.slice(0, r2.length) === r2;
            }), n2 = 0; n2 < t2.length; n2++) delete this.files[t2[n2].name];
            return this;
          }, generate: function() {
            throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
          }, generateInternalStream: function(e2) {
            var t2, r2 = {};
            try {
              if ((r2 = u.extend(e2 || {}, { streamFiles: false, compression: "STORE", compressionOptions: null, type: "", platform: "DOS", comment: null, mimeType: "application/zip", encodeFileName: i.utf8encode })).type = r2.type.toLowerCase(), r2.compression = r2.compression.toUpperCase(), "binarystring" === r2.type && (r2.type = "string"), !r2.type) throw new Error("No output type specified.");
              u.checkSupport(r2.type), "darwin" !== r2.platform && "freebsd" !== r2.platform && "linux" !== r2.platform && "sunos" !== r2.platform || (r2.platform = "UNIX"), "win32" === r2.platform && (r2.platform = "DOS");
              var n2 = r2.comment || this.comment || "";
              t2 = o.generateWorker(this, r2, n2);
            } catch (e3) {
              (t2 = new l("error")).error(e3);
            }
            return new a(t2, r2.type || "string", r2.mimeType);
          }, generateAsync: function(e2, t2) {
            return this.generateInternalStream(e2).accumulate(t2);
          }, generateNodeStream: function(e2, t2) {
            return (e2 = e2 || {}).type || (e2.type = "nodebuffer"), this.generateInternalStream(e2).toNodejsStream(t2);
          } };
          t.exports = n;
        }, { "./compressedObject": 2, "./defaults": 5, "./generate": 9, "./nodejs/NodejsStreamInputAdapter": 12, "./nodejsUtils": 14, "./stream/GenericWorker": 28, "./stream/StreamHelper": 29, "./utf8": 31, "./utils": 32, "./zipObject": 35 }], 16: [function(e, t, r) {
          "use strict";
          t.exports = e("stream");
        }, { stream: void 0 }], 17: [function(e, t, r) {
          "use strict";
          var n = e("./DataReader");
          function i(e2) {
            n.call(this, e2);
            for (var t2 = 0; t2 < this.data.length; t2++) e2[t2] = 255 & e2[t2];
          }
          e("../utils").inherits(i, n), i.prototype.byteAt = function(e2) {
            return this.data[this.zero + e2];
          }, i.prototype.lastIndexOfSignature = function(e2) {
            for (var t2 = e2.charCodeAt(0), r2 = e2.charCodeAt(1), n2 = e2.charCodeAt(2), i2 = e2.charCodeAt(3), s = this.length - 4; 0 <= s; --s) if (this.data[s] === t2 && this.data[s + 1] === r2 && this.data[s + 2] === n2 && this.data[s + 3] === i2) return s - this.zero;
            return -1;
          }, i.prototype.readAndCheckSignature = function(e2) {
            var t2 = e2.charCodeAt(0), r2 = e2.charCodeAt(1), n2 = e2.charCodeAt(2), i2 = e2.charCodeAt(3), s = this.readData(4);
            return t2 === s[0] && r2 === s[1] && n2 === s[2] && i2 === s[3];
          }, i.prototype.readData = function(e2) {
            if (this.checkOffset(e2), 0 === e2) return [];
            var t2 = this.data.slice(this.zero + this.index, this.zero + this.index + e2);
            return this.index += e2, t2;
          }, t.exports = i;
        }, { "../utils": 32, "./DataReader": 18 }], 18: [function(e, t, r) {
          "use strict";
          var n = e("../utils");
          function i(e2) {
            this.data = e2, this.length = e2.length, this.index = 0, this.zero = 0;
          }
          i.prototype = { checkOffset: function(e2) {
            this.checkIndex(this.index + e2);
          }, checkIndex: function(e2) {
            if (this.length < this.zero + e2 || e2 < 0) throw new Error("End of data reached (data length = " + this.length + ", asked index = " + e2 + "). Corrupted zip ?");
          }, setIndex: function(e2) {
            this.checkIndex(e2), this.index = e2;
          }, skip: function(e2) {
            this.setIndex(this.index + e2);
          }, byteAt: function() {
          }, readInt: function(e2) {
            var t2, r2 = 0;
            for (this.checkOffset(e2), t2 = this.index + e2 - 1; t2 >= this.index; t2--) r2 = (r2 << 8) + this.byteAt(t2);
            return this.index += e2, r2;
          }, readString: function(e2) {
            return n.transformTo("string", this.readData(e2));
          }, readData: function() {
          }, lastIndexOfSignature: function() {
          }, readAndCheckSignature: function() {
          }, readDate: function() {
            var e2 = this.readInt(4);
            return new Date(Date.UTC(1980 + (e2 >> 25 & 127), (e2 >> 21 & 15) - 1, e2 >> 16 & 31, e2 >> 11 & 31, e2 >> 5 & 63, (31 & e2) << 1));
          } }, t.exports = i;
        }, { "../utils": 32 }], 19: [function(e, t, r) {
          "use strict";
          var n = e("./Uint8ArrayReader");
          function i(e2) {
            n.call(this, e2);
          }
          e("../utils").inherits(i, n), i.prototype.readData = function(e2) {
            this.checkOffset(e2);
            var t2 = this.data.slice(this.zero + this.index, this.zero + this.index + e2);
            return this.index += e2, t2;
          }, t.exports = i;
        }, { "../utils": 32, "./Uint8ArrayReader": 21 }], 20: [function(e, t, r) {
          "use strict";
          var n = e("./DataReader");
          function i(e2) {
            n.call(this, e2);
          }
          e("../utils").inherits(i, n), i.prototype.byteAt = function(e2) {
            return this.data.charCodeAt(this.zero + e2);
          }, i.prototype.lastIndexOfSignature = function(e2) {
            return this.data.lastIndexOf(e2) - this.zero;
          }, i.prototype.readAndCheckSignature = function(e2) {
            return e2 === this.readData(4);
          }, i.prototype.readData = function(e2) {
            this.checkOffset(e2);
            var t2 = this.data.slice(this.zero + this.index, this.zero + this.index + e2);
            return this.index += e2, t2;
          }, t.exports = i;
        }, { "../utils": 32, "./DataReader": 18 }], 21: [function(e, t, r) {
          "use strict";
          var n = e("./ArrayReader");
          function i(e2) {
            n.call(this, e2);
          }
          e("../utils").inherits(i, n), i.prototype.readData = function(e2) {
            if (this.checkOffset(e2), 0 === e2) return new Uint8Array(0);
            var t2 = this.data.subarray(this.zero + this.index, this.zero + this.index + e2);
            return this.index += e2, t2;
          }, t.exports = i;
        }, { "../utils": 32, "./ArrayReader": 17 }], 22: [function(e, t, r) {
          "use strict";
          var n = e("../utils"), i = e("../support"), s = e("./ArrayReader"), a = e("./StringReader"), o = e("./NodeBufferReader"), h = e("./Uint8ArrayReader");
          t.exports = function(e2) {
            var t2 = n.getTypeOf(e2);
            return n.checkSupport(t2), "string" !== t2 || i.uint8array ? "nodebuffer" === t2 ? new o(e2) : i.uint8array ? new h(n.transformTo("uint8array", e2)) : new s(n.transformTo("array", e2)) : new a(e2);
          };
        }, { "../support": 30, "../utils": 32, "./ArrayReader": 17, "./NodeBufferReader": 19, "./StringReader": 20, "./Uint8ArrayReader": 21 }], 23: [function(e, t, r) {
          "use strict";
          r.LOCAL_FILE_HEADER = "PK", r.CENTRAL_FILE_HEADER = "PK", r.CENTRAL_DIRECTORY_END = "PK", r.ZIP64_CENTRAL_DIRECTORY_LOCATOR = "PK\x07", r.ZIP64_CENTRAL_DIRECTORY_END = "PK", r.DATA_DESCRIPTOR = "PK\x07\b";
        }, {}], 24: [function(e, t, r) {
          "use strict";
          var n = e("./GenericWorker"), i = e("../utils");
          function s(e2) {
            n.call(this, "ConvertWorker to " + e2), this.destType = e2;
          }
          i.inherits(s, n), s.prototype.processChunk = function(e2) {
            this.push({ data: i.transformTo(this.destType, e2.data), meta: e2.meta });
          }, t.exports = s;
        }, { "../utils": 32, "./GenericWorker": 28 }], 25: [function(e, t, r) {
          "use strict";
          var n = e("./GenericWorker"), i = e("../crc32");
          function s() {
            n.call(this, "Crc32Probe"), this.withStreamInfo("crc32", 0);
          }
          e("../utils").inherits(s, n), s.prototype.processChunk = function(e2) {
            this.streamInfo.crc32 = i(e2.data, this.streamInfo.crc32 || 0), this.push(e2);
          }, t.exports = s;
        }, { "../crc32": 4, "../utils": 32, "./GenericWorker": 28 }], 26: [function(e, t, r) {
          "use strict";
          var n = e("../utils"), i = e("./GenericWorker");
          function s(e2) {
            i.call(this, "DataLengthProbe for " + e2), this.propName = e2, this.withStreamInfo(e2, 0);
          }
          n.inherits(s, i), s.prototype.processChunk = function(e2) {
            if (e2) {
              var t2 = this.streamInfo[this.propName] || 0;
              this.streamInfo[this.propName] = t2 + e2.data.length;
            }
            i.prototype.processChunk.call(this, e2);
          }, t.exports = s;
        }, { "../utils": 32, "./GenericWorker": 28 }], 27: [function(e, t, r) {
          "use strict";
          var n = e("../utils"), i = e("./GenericWorker");
          function s(e2) {
            i.call(this, "DataWorker");
            var t2 = this;
            this.dataIsReady = false, this.index = 0, this.max = 0, this.data = null, this.type = "", this._tickScheduled = false, e2.then(function(e3) {
              t2.dataIsReady = true, t2.data = e3, t2.max = e3 && e3.length || 0, t2.type = n.getTypeOf(e3), t2.isPaused || t2._tickAndRepeat();
            }, function(e3) {
              t2.error(e3);
            });
          }
          n.inherits(s, i), s.prototype.cleanUp = function() {
            i.prototype.cleanUp.call(this), this.data = null;
          }, s.prototype.resume = function() {
            return !!i.prototype.resume.call(this) && (!this._tickScheduled && this.dataIsReady && (this._tickScheduled = true, n.delay(this._tickAndRepeat, [], this)), true);
          }, s.prototype._tickAndRepeat = function() {
            this._tickScheduled = false, this.isPaused || this.isFinished || (this._tick(), this.isFinished || (n.delay(this._tickAndRepeat, [], this), this._tickScheduled = true));
          }, s.prototype._tick = function() {
            if (this.isPaused || this.isFinished) return false;
            var e2 = null, t2 = Math.min(this.max, this.index + 16384);
            if (this.index >= this.max) return this.end();
            switch (this.type) {
              case "string":
                e2 = this.data.substring(this.index, t2);
                break;
              case "uint8array":
                e2 = this.data.subarray(this.index, t2);
                break;
              case "array":
              case "nodebuffer":
                e2 = this.data.slice(this.index, t2);
            }
            return this.index = t2, this.push({ data: e2, meta: { percent: this.max ? this.index / this.max * 100 : 0 } });
          }, t.exports = s;
        }, { "../utils": 32, "./GenericWorker": 28 }], 28: [function(e, t, r) {
          "use strict";
          function n(e2) {
            this.name = e2 || "default", this.streamInfo = {}, this.generatedError = null, this.extraStreamInfo = {}, this.isPaused = true, this.isFinished = false, this.isLocked = false, this._listeners = { data: [], end: [], error: [] }, this.previous = null;
          }
          n.prototype = { push: function(e2) {
            this.emit("data", e2);
          }, end: function() {
            if (this.isFinished) return false;
            this.flush();
            try {
              this.emit("end"), this.cleanUp(), this.isFinished = true;
            } catch (e2) {
              this.emit("error", e2);
            }
            return true;
          }, error: function(e2) {
            return !this.isFinished && (this.isPaused ? this.generatedError = e2 : (this.isFinished = true, this.emit("error", e2), this.previous && this.previous.error(e2), this.cleanUp()), true);
          }, on: function(e2, t2) {
            return this._listeners[e2].push(t2), this;
          }, cleanUp: function() {
            this.streamInfo = this.generatedError = this.extraStreamInfo = null, this._listeners = [];
          }, emit: function(e2, t2) {
            if (this._listeners[e2]) for (var r2 = 0; r2 < this._listeners[e2].length; r2++) this._listeners[e2][r2].call(this, t2);
          }, pipe: function(e2) {
            return e2.registerPrevious(this);
          }, registerPrevious: function(e2) {
            if (this.isLocked) throw new Error("The stream '" + this + "' has already been used.");
            this.streamInfo = e2.streamInfo, this.mergeStreamInfo(), this.previous = e2;
            var t2 = this;
            return e2.on("data", function(e3) {
              t2.processChunk(e3);
            }), e2.on("end", function() {
              t2.end();
            }), e2.on("error", function(e3) {
              t2.error(e3);
            }), this;
          }, pause: function() {
            return !this.isPaused && !this.isFinished && (this.isPaused = true, this.previous && this.previous.pause(), true);
          }, resume: function() {
            if (!this.isPaused || this.isFinished) return false;
            var e2 = this.isPaused = false;
            return this.generatedError && (this.error(this.generatedError), e2 = true), this.previous && this.previous.resume(), !e2;
          }, flush: function() {
          }, processChunk: function(e2) {
            this.push(e2);
          }, withStreamInfo: function(e2, t2) {
            return this.extraStreamInfo[e2] = t2, this.mergeStreamInfo(), this;
          }, mergeStreamInfo: function() {
            for (var e2 in this.extraStreamInfo) Object.prototype.hasOwnProperty.call(this.extraStreamInfo, e2) && (this.streamInfo[e2] = this.extraStreamInfo[e2]);
          }, lock: function() {
            if (this.isLocked) throw new Error("The stream '" + this + "' has already been used.");
            this.isLocked = true, this.previous && this.previous.lock();
          }, toString: function() {
            var e2 = "Worker " + this.name;
            return this.previous ? this.previous + " -> " + e2 : e2;
          } }, t.exports = n;
        }, {}], 29: [function(e, t, r) {
          "use strict";
          var h = e("../utils"), i = e("./ConvertWorker"), s = e("./GenericWorker"), u = e("../base64"), n = e("../support"), a = e("../external"), o = null;
          if (n.nodestream) try {
            o = e("../nodejs/NodejsStreamOutputAdapter");
          } catch (e2) {
          }
          function l(e2, o2) {
            return new a.Promise(function(t2, r2) {
              var n2 = [], i2 = e2._internalType, s2 = e2._outputType, a2 = e2._mimeType;
              e2.on("data", function(e3, t3) {
                n2.push(e3), o2 && o2(t3);
              }).on("error", function(e3) {
                n2 = [], r2(e3);
              }).on("end", function() {
                try {
                  var e3 = (function(e4, t3, r3) {
                    switch (e4) {
                      case "blob":
                        return h.newBlob(h.transformTo("arraybuffer", t3), r3);
                      case "base64":
                        return u.encode(t3);
                      default:
                        return h.transformTo(e4, t3);
                    }
                  })(s2, (function(e4, t3) {
                    var r3, n3 = 0, i3 = null, s3 = 0;
                    for (r3 = 0; r3 < t3.length; r3++) s3 += t3[r3].length;
                    switch (e4) {
                      case "string":
                        return t3.join("");
                      case "array":
                        return Array.prototype.concat.apply([], t3);
                      case "uint8array":
                        for (i3 = new Uint8Array(s3), r3 = 0; r3 < t3.length; r3++) i3.set(t3[r3], n3), n3 += t3[r3].length;
                        return i3;
                      case "nodebuffer":
                        return Buffer.concat(t3);
                      default:
                        throw new Error("concat : unsupported type '" + e4 + "'");
                    }
                  })(i2, n2), a2);
                  t2(e3);
                } catch (e4) {
                  r2(e4);
                }
                n2 = [];
              }).resume();
            });
          }
          function f(e2, t2, r2) {
            var n2 = t2;
            switch (t2) {
              case "blob":
              case "arraybuffer":
                n2 = "uint8array";
                break;
              case "base64":
                n2 = "string";
            }
            try {
              this._internalType = n2, this._outputType = t2, this._mimeType = r2, h.checkSupport(n2), this._worker = e2.pipe(new i(n2)), e2.lock();
            } catch (e3) {
              this._worker = new s("error"), this._worker.error(e3);
            }
          }
          f.prototype = { accumulate: function(e2) {
            return l(this, e2);
          }, on: function(e2, t2) {
            var r2 = this;
            return "data" === e2 ? this._worker.on(e2, function(e3) {
              t2.call(r2, e3.data, e3.meta);
            }) : this._worker.on(e2, function() {
              h.delay(t2, arguments, r2);
            }), this;
          }, resume: function() {
            return h.delay(this._worker.resume, [], this._worker), this;
          }, pause: function() {
            return this._worker.pause(), this;
          }, toNodejsStream: function(e2) {
            if (h.checkSupport("nodestream"), "nodebuffer" !== this._outputType) throw new Error(this._outputType + " is not supported by this method");
            return new o(this, { objectMode: "nodebuffer" !== this._outputType }, e2);
          } }, t.exports = f;
        }, { "../base64": 1, "../external": 6, "../nodejs/NodejsStreamOutputAdapter": 13, "../support": 30, "../utils": 32, "./ConvertWorker": 24, "./GenericWorker": 28 }], 30: [function(e, t, r) {
          "use strict";
          if (r.base64 = true, r.array = true, r.string = true, r.arraybuffer = "undefined" != typeof ArrayBuffer && "undefined" != typeof Uint8Array, r.nodebuffer = "undefined" != typeof Buffer, r.uint8array = "undefined" != typeof Uint8Array, "undefined" == typeof ArrayBuffer) r.blob = false;
          else {
            var n = new ArrayBuffer(0);
            try {
              r.blob = 0 === new Blob([n], { type: "application/zip" }).size;
            } catch (e2) {
              try {
                var i = new (self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder)();
                i.append(n), r.blob = 0 === i.getBlob("application/zip").size;
              } catch (e3) {
                r.blob = false;
              }
            }
          }
          try {
            r.nodestream = !!e("readable-stream").Readable;
          } catch (e2) {
            r.nodestream = false;
          }
        }, { "readable-stream": 16 }], 31: [function(e, t, s) {
          "use strict";
          for (var o = e("./utils"), h = e("./support"), r = e("./nodejsUtils"), n = e("./stream/GenericWorker"), u = new Array(256), i = 0; i < 256; i++) u[i] = 252 <= i ? 6 : 248 <= i ? 5 : 240 <= i ? 4 : 224 <= i ? 3 : 192 <= i ? 2 : 1;
          u[254] = u[254] = 1;
          function a() {
            n.call(this, "utf-8 decode"), this.leftOver = null;
          }
          function l() {
            n.call(this, "utf-8 encode");
          }
          s.utf8encode = function(e2) {
            return h.nodebuffer ? r.newBufferFrom(e2, "utf-8") : (function(e3) {
              var t2, r2, n2, i2, s2, a2 = e3.length, o2 = 0;
              for (i2 = 0; i2 < a2; i2++) 55296 == (64512 & (r2 = e3.charCodeAt(i2))) && i2 + 1 < a2 && 56320 == (64512 & (n2 = e3.charCodeAt(i2 + 1))) && (r2 = 65536 + (r2 - 55296 << 10) + (n2 - 56320), i2++), o2 += r2 < 128 ? 1 : r2 < 2048 ? 2 : r2 < 65536 ? 3 : 4;
              for (t2 = h.uint8array ? new Uint8Array(o2) : new Array(o2), i2 = s2 = 0; s2 < o2; i2++) 55296 == (64512 & (r2 = e3.charCodeAt(i2))) && i2 + 1 < a2 && 56320 == (64512 & (n2 = e3.charCodeAt(i2 + 1))) && (r2 = 65536 + (r2 - 55296 << 10) + (n2 - 56320), i2++), r2 < 128 ? t2[s2++] = r2 : (r2 < 2048 ? t2[s2++] = 192 | r2 >>> 6 : (r2 < 65536 ? t2[s2++] = 224 | r2 >>> 12 : (t2[s2++] = 240 | r2 >>> 18, t2[s2++] = 128 | r2 >>> 12 & 63), t2[s2++] = 128 | r2 >>> 6 & 63), t2[s2++] = 128 | 63 & r2);
              return t2;
            })(e2);
          }, s.utf8decode = function(e2) {
            return h.nodebuffer ? o.transformTo("nodebuffer", e2).toString("utf-8") : (function(e3) {
              var t2, r2, n2, i2, s2 = e3.length, a2 = new Array(2 * s2);
              for (t2 = r2 = 0; t2 < s2; ) if ((n2 = e3[t2++]) < 128) a2[r2++] = n2;
              else if (4 < (i2 = u[n2])) a2[r2++] = 65533, t2 += i2 - 1;
              else {
                for (n2 &= 2 === i2 ? 31 : 3 === i2 ? 15 : 7; 1 < i2 && t2 < s2; ) n2 = n2 << 6 | 63 & e3[t2++], i2--;
                1 < i2 ? a2[r2++] = 65533 : n2 < 65536 ? a2[r2++] = n2 : (n2 -= 65536, a2[r2++] = 55296 | n2 >> 10 & 1023, a2[r2++] = 56320 | 1023 & n2);
              }
              return a2.length !== r2 && (a2.subarray ? a2 = a2.subarray(0, r2) : a2.length = r2), o.applyFromCharCode(a2);
            })(e2 = o.transformTo(h.uint8array ? "uint8array" : "array", e2));
          }, o.inherits(a, n), a.prototype.processChunk = function(e2) {
            var t2 = o.transformTo(h.uint8array ? "uint8array" : "array", e2.data);
            if (this.leftOver && this.leftOver.length) {
              if (h.uint8array) {
                var r2 = t2;
                (t2 = new Uint8Array(r2.length + this.leftOver.length)).set(this.leftOver, 0), t2.set(r2, this.leftOver.length);
              } else t2 = this.leftOver.concat(t2);
              this.leftOver = null;
            }
            var n2 = (function(e3, t3) {
              var r3;
              for ((t3 = t3 || e3.length) > e3.length && (t3 = e3.length), r3 = t3 - 1; 0 <= r3 && 128 == (192 & e3[r3]); ) r3--;
              return r3 < 0 ? t3 : 0 === r3 ? t3 : r3 + u[e3[r3]] > t3 ? r3 : t3;
            })(t2), i2 = t2;
            n2 !== t2.length && (h.uint8array ? (i2 = t2.subarray(0, n2), this.leftOver = t2.subarray(n2, t2.length)) : (i2 = t2.slice(0, n2), this.leftOver = t2.slice(n2, t2.length))), this.push({ data: s.utf8decode(i2), meta: e2.meta });
          }, a.prototype.flush = function() {
            this.leftOver && this.leftOver.length && (this.push({ data: s.utf8decode(this.leftOver), meta: {} }), this.leftOver = null);
          }, s.Utf8DecodeWorker = a, o.inherits(l, n), l.prototype.processChunk = function(e2) {
            this.push({ data: s.utf8encode(e2.data), meta: e2.meta });
          }, s.Utf8EncodeWorker = l;
        }, { "./nodejsUtils": 14, "./stream/GenericWorker": 28, "./support": 30, "./utils": 32 }], 32: [function(e, t, a) {
          "use strict";
          var o = e("./support"), h = e("./base64"), r = e("./nodejsUtils"), u = e("./external");
          function n(e2) {
            return e2;
          }
          function l(e2, t2) {
            for (var r2 = 0; r2 < e2.length; ++r2) t2[r2] = 255 & e2.charCodeAt(r2);
            return t2;
          }
          e("setimmediate"), a.newBlob = function(t2, r2) {
            a.checkSupport("blob");
            try {
              return new Blob([t2], { type: r2 });
            } catch (e2) {
              try {
                var n2 = new (self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder)();
                return n2.append(t2), n2.getBlob(r2);
              } catch (e3) {
                throw new Error("Bug : can't construct the Blob.");
              }
            }
          };
          var i = { stringifyByChunk: function(e2, t2, r2) {
            var n2 = [], i2 = 0, s2 = e2.length;
            if (s2 <= r2) return String.fromCharCode.apply(null, e2);
            for (; i2 < s2; ) "array" === t2 || "nodebuffer" === t2 ? n2.push(String.fromCharCode.apply(null, e2.slice(i2, Math.min(i2 + r2, s2)))) : n2.push(String.fromCharCode.apply(null, e2.subarray(i2, Math.min(i2 + r2, s2)))), i2 += r2;
            return n2.join("");
          }, stringifyByChar: function(e2) {
            for (var t2 = "", r2 = 0; r2 < e2.length; r2++) t2 += String.fromCharCode(e2[r2]);
            return t2;
          }, applyCanBeUsed: { uint8array: (function() {
            try {
              return o.uint8array && 1 === String.fromCharCode.apply(null, new Uint8Array(1)).length;
            } catch (e2) {
              return false;
            }
          })(), nodebuffer: (function() {
            try {
              return o.nodebuffer && 1 === String.fromCharCode.apply(null, r.allocBuffer(1)).length;
            } catch (e2) {
              return false;
            }
          })() } };
          function s(e2) {
            var t2 = 65536, r2 = a.getTypeOf(e2), n2 = true;
            if ("uint8array" === r2 ? n2 = i.applyCanBeUsed.uint8array : "nodebuffer" === r2 && (n2 = i.applyCanBeUsed.nodebuffer), n2) for (; 1 < t2; ) try {
              return i.stringifyByChunk(e2, r2, t2);
            } catch (e3) {
              t2 = Math.floor(t2 / 2);
            }
            return i.stringifyByChar(e2);
          }
          function f(e2, t2) {
            for (var r2 = 0; r2 < e2.length; r2++) t2[r2] = e2[r2];
            return t2;
          }
          a.applyFromCharCode = s;
          var c = {};
          c.string = { string: n, array: function(e2) {
            return l(e2, new Array(e2.length));
          }, arraybuffer: function(e2) {
            return c.string.uint8array(e2).buffer;
          }, uint8array: function(e2) {
            return l(e2, new Uint8Array(e2.length));
          }, nodebuffer: function(e2) {
            return l(e2, r.allocBuffer(e2.length));
          } }, c.array = { string: s, array: n, arraybuffer: function(e2) {
            return new Uint8Array(e2).buffer;
          }, uint8array: function(e2) {
            return new Uint8Array(e2);
          }, nodebuffer: function(e2) {
            return r.newBufferFrom(e2);
          } }, c.arraybuffer = { string: function(e2) {
            return s(new Uint8Array(e2));
          }, array: function(e2) {
            return f(new Uint8Array(e2), new Array(e2.byteLength));
          }, arraybuffer: n, uint8array: function(e2) {
            return new Uint8Array(e2);
          }, nodebuffer: function(e2) {
            return r.newBufferFrom(new Uint8Array(e2));
          } }, c.uint8array = { string: s, array: function(e2) {
            return f(e2, new Array(e2.length));
          }, arraybuffer: function(e2) {
            return e2.buffer;
          }, uint8array: n, nodebuffer: function(e2) {
            return r.newBufferFrom(e2);
          } }, c.nodebuffer = { string: s, array: function(e2) {
            return f(e2, new Array(e2.length));
          }, arraybuffer: function(e2) {
            return c.nodebuffer.uint8array(e2).buffer;
          }, uint8array: function(e2) {
            return f(e2, new Uint8Array(e2.length));
          }, nodebuffer: n }, a.transformTo = function(e2, t2) {
            if (t2 = t2 || "", !e2) return t2;
            a.checkSupport(e2);
            var r2 = a.getTypeOf(t2);
            return c[r2][e2](t2);
          }, a.resolve = function(e2) {
            for (var t2 = e2.split("/"), r2 = [], n2 = 0; n2 < t2.length; n2++) {
              var i2 = t2[n2];
              "." === i2 || "" === i2 && 0 !== n2 && n2 !== t2.length - 1 || (".." === i2 ? r2.pop() : r2.push(i2));
            }
            return r2.join("/");
          }, a.getTypeOf = function(e2) {
            return "string" == typeof e2 ? "string" : "[object Array]" === Object.prototype.toString.call(e2) ? "array" : o.nodebuffer && r.isBuffer(e2) ? "nodebuffer" : o.uint8array && e2 instanceof Uint8Array ? "uint8array" : o.arraybuffer && e2 instanceof ArrayBuffer ? "arraybuffer" : void 0;
          }, a.checkSupport = function(e2) {
            if (!o[e2.toLowerCase()]) throw new Error(e2 + " is not supported by this platform");
          }, a.MAX_VALUE_16BITS = 65535, a.MAX_VALUE_32BITS = -1, a.pretty = function(e2) {
            var t2, r2, n2 = "";
            for (r2 = 0; r2 < (e2 || "").length; r2++) n2 += "\\x" + ((t2 = e2.charCodeAt(r2)) < 16 ? "0" : "") + t2.toString(16).toUpperCase();
            return n2;
          }, a.delay = function(e2, t2, r2) {
            setImmediate(function() {
              e2.apply(r2 || null, t2 || []);
            });
          }, a.inherits = function(e2, t2) {
            function r2() {
            }
            r2.prototype = t2.prototype, e2.prototype = new r2();
          }, a.extend = function() {
            var e2, t2, r2 = {};
            for (e2 = 0; e2 < arguments.length; e2++) for (t2 in arguments[e2]) Object.prototype.hasOwnProperty.call(arguments[e2], t2) && void 0 === r2[t2] && (r2[t2] = arguments[e2][t2]);
            return r2;
          }, a.prepareContent = function(r2, e2, n2, i2, s2) {
            return u.Promise.resolve(e2).then(function(n3) {
              return o.blob && (n3 instanceof Blob || -1 !== ["[object File]", "[object Blob]"].indexOf(Object.prototype.toString.call(n3))) && "undefined" != typeof FileReader ? new u.Promise(function(t2, r3) {
                var e3 = new FileReader();
                e3.onload = function(e4) {
                  t2(e4.target.result);
                }, e3.onerror = function(e4) {
                  r3(e4.target.error);
                }, e3.readAsArrayBuffer(n3);
              }) : n3;
            }).then(function(e3) {
              var t2 = a.getTypeOf(e3);
              return t2 ? ("arraybuffer" === t2 ? e3 = a.transformTo("uint8array", e3) : "string" === t2 && (s2 ? e3 = h.decode(e3) : n2 && true !== i2 && (e3 = (function(e4) {
                return l(e4, o.uint8array ? new Uint8Array(e4.length) : new Array(e4.length));
              })(e3))), e3) : u.Promise.reject(new Error("Can't read the data of '" + r2 + "'. Is it in a supported JavaScript type (String, Blob, ArrayBuffer, etc) ?"));
            });
          };
        }, { "./base64": 1, "./external": 6, "./nodejsUtils": 14, "./support": 30, setimmediate: 54 }], 33: [function(e, t, r) {
          "use strict";
          var n = e("./reader/readerFor"), i = e("./utils"), s = e("./signature"), a = e("./zipEntry"), o = e("./support");
          function h(e2) {
            this.files = [], this.loadOptions = e2;
          }
          h.prototype = { checkSignature: function(e2) {
            if (!this.reader.readAndCheckSignature(e2)) {
              this.reader.index -= 4;
              var t2 = this.reader.readString(4);
              throw new Error("Corrupted zip or bug: unexpected signature (" + i.pretty(t2) + ", expected " + i.pretty(e2) + ")");
            }
          }, isSignature: function(e2, t2) {
            var r2 = this.reader.index;
            this.reader.setIndex(e2);
            var n2 = this.reader.readString(4) === t2;
            return this.reader.setIndex(r2), n2;
          }, readBlockEndOfCentral: function() {
            this.diskNumber = this.reader.readInt(2), this.diskWithCentralDirStart = this.reader.readInt(2), this.centralDirRecordsOnThisDisk = this.reader.readInt(2), this.centralDirRecords = this.reader.readInt(2), this.centralDirSize = this.reader.readInt(4), this.centralDirOffset = this.reader.readInt(4), this.zipCommentLength = this.reader.readInt(2);
            var e2 = this.reader.readData(this.zipCommentLength), t2 = o.uint8array ? "uint8array" : "array", r2 = i.transformTo(t2, e2);
            this.zipComment = this.loadOptions.decodeFileName(r2);
          }, readBlockZip64EndOfCentral: function() {
            this.zip64EndOfCentralSize = this.reader.readInt(8), this.reader.skip(4), this.diskNumber = this.reader.readInt(4), this.diskWithCentralDirStart = this.reader.readInt(4), this.centralDirRecordsOnThisDisk = this.reader.readInt(8), this.centralDirRecords = this.reader.readInt(8), this.centralDirSize = this.reader.readInt(8), this.centralDirOffset = this.reader.readInt(8), this.zip64ExtensibleData = {};
            for (var e2, t2, r2, n2 = this.zip64EndOfCentralSize - 44; 0 < n2; ) e2 = this.reader.readInt(2), t2 = this.reader.readInt(4), r2 = this.reader.readData(t2), this.zip64ExtensibleData[e2] = { id: e2, length: t2, value: r2 };
          }, readBlockZip64EndOfCentralLocator: function() {
            if (this.diskWithZip64CentralDirStart = this.reader.readInt(4), this.relativeOffsetEndOfZip64CentralDir = this.reader.readInt(8), this.disksCount = this.reader.readInt(4), 1 < this.disksCount) throw new Error("Multi-volumes zip are not supported");
          }, readLocalFiles: function() {
            var e2, t2;
            for (e2 = 0; e2 < this.files.length; e2++) t2 = this.files[e2], this.reader.setIndex(t2.localHeaderOffset), this.checkSignature(s.LOCAL_FILE_HEADER), t2.readLocalPart(this.reader), t2.handleUTF8(), t2.processAttributes();
          }, readCentralDir: function() {
            var e2;
            for (this.reader.setIndex(this.centralDirOffset); this.reader.readAndCheckSignature(s.CENTRAL_FILE_HEADER); ) (e2 = new a({ zip64: this.zip64 }, this.loadOptions)).readCentralPart(this.reader), this.files.push(e2);
            if (this.centralDirRecords !== this.files.length && 0 !== this.centralDirRecords && 0 === this.files.length) throw new Error("Corrupted zip or bug: expected " + this.centralDirRecords + " records in central dir, got " + this.files.length);
          }, readEndOfCentral: function() {
            var e2 = this.reader.lastIndexOfSignature(s.CENTRAL_DIRECTORY_END);
            if (e2 < 0) throw !this.isSignature(0, s.LOCAL_FILE_HEADER) ? new Error("Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html") : new Error("Corrupted zip: can't find end of central directory");
            this.reader.setIndex(e2);
            var t2 = e2;
            if (this.checkSignature(s.CENTRAL_DIRECTORY_END), this.readBlockEndOfCentral(), this.diskNumber === i.MAX_VALUE_16BITS || this.diskWithCentralDirStart === i.MAX_VALUE_16BITS || this.centralDirRecordsOnThisDisk === i.MAX_VALUE_16BITS || this.centralDirRecords === i.MAX_VALUE_16BITS || this.centralDirSize === i.MAX_VALUE_32BITS || this.centralDirOffset === i.MAX_VALUE_32BITS) {
              if (this.zip64 = true, (e2 = this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR)) < 0) throw new Error("Corrupted zip: can't find the ZIP64 end of central directory locator");
              if (this.reader.setIndex(e2), this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR), this.readBlockZip64EndOfCentralLocator(), !this.isSignature(this.relativeOffsetEndOfZip64CentralDir, s.ZIP64_CENTRAL_DIRECTORY_END) && (this.relativeOffsetEndOfZip64CentralDir = this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_END), this.relativeOffsetEndOfZip64CentralDir < 0)) throw new Error("Corrupted zip: can't find the ZIP64 end of central directory");
              this.reader.setIndex(this.relativeOffsetEndOfZip64CentralDir), this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_END), this.readBlockZip64EndOfCentral();
            }
            var r2 = this.centralDirOffset + this.centralDirSize;
            this.zip64 && (r2 += 20, r2 += 12 + this.zip64EndOfCentralSize);
            var n2 = t2 - r2;
            if (0 < n2) this.isSignature(t2, s.CENTRAL_FILE_HEADER) || (this.reader.zero = n2);
            else if (n2 < 0) throw new Error("Corrupted zip: missing " + Math.abs(n2) + " bytes.");
          }, prepareReader: function(e2) {
            this.reader = n(e2);
          }, load: function(e2) {
            this.prepareReader(e2), this.readEndOfCentral(), this.readCentralDir(), this.readLocalFiles();
          } }, t.exports = h;
        }, { "./reader/readerFor": 22, "./signature": 23, "./support": 30, "./utils": 32, "./zipEntry": 34 }], 34: [function(e, t, r) {
          "use strict";
          var n = e("./reader/readerFor"), s = e("./utils"), i = e("./compressedObject"), a = e("./crc32"), o = e("./utf8"), h = e("./compressions"), u = e("./support");
          function l(e2, t2) {
            this.options = e2, this.loadOptions = t2;
          }
          l.prototype = { isEncrypted: function() {
            return 1 == (1 & this.bitFlag);
          }, useUTF8: function() {
            return 2048 == (2048 & this.bitFlag);
          }, readLocalPart: function(e2) {
            var t2, r2;
            if (e2.skip(22), this.fileNameLength = e2.readInt(2), r2 = e2.readInt(2), this.fileName = e2.readData(this.fileNameLength), e2.skip(r2), -1 === this.compressedSize || -1 === this.uncompressedSize) throw new Error("Bug or corrupted zip : didn't get enough information from the central directory (compressedSize === -1 || uncompressedSize === -1)");
            if (null === (t2 = (function(e3) {
              for (var t3 in h) if (Object.prototype.hasOwnProperty.call(h, t3) && h[t3].magic === e3) return h[t3];
              return null;
            })(this.compressionMethod))) throw new Error("Corrupted zip : compression " + s.pretty(this.compressionMethod) + " unknown (inner file : " + s.transformTo("string", this.fileName) + ")");
            this.decompressed = new i(this.compressedSize, this.uncompressedSize, this.crc32, t2, e2.readData(this.compressedSize));
          }, readCentralPart: function(e2) {
            this.versionMadeBy = e2.readInt(2), e2.skip(2), this.bitFlag = e2.readInt(2), this.compressionMethod = e2.readString(2), this.date = e2.readDate(), this.crc32 = e2.readInt(4), this.compressedSize = e2.readInt(4), this.uncompressedSize = e2.readInt(4);
            var t2 = e2.readInt(2);
            if (this.extraFieldsLength = e2.readInt(2), this.fileCommentLength = e2.readInt(2), this.diskNumberStart = e2.readInt(2), this.internalFileAttributes = e2.readInt(2), this.externalFileAttributes = e2.readInt(4), this.localHeaderOffset = e2.readInt(4), this.isEncrypted()) throw new Error("Encrypted zip are not supported");
            e2.skip(t2), this.readExtraFields(e2), this.parseZIP64ExtraField(e2), this.fileComment = e2.readData(this.fileCommentLength);
          }, processAttributes: function() {
            this.unixPermissions = null, this.dosPermissions = null;
            var e2 = this.versionMadeBy >> 8;
            this.dir = !!(16 & this.externalFileAttributes), 0 == e2 && (this.dosPermissions = 63 & this.externalFileAttributes), 3 == e2 && (this.unixPermissions = this.externalFileAttributes >> 16 & 65535), this.dir || "/" !== this.fileNameStr.slice(-1) || (this.dir = true);
          }, parseZIP64ExtraField: function() {
            if (this.extraFields[1]) {
              var e2 = n(this.extraFields[1].value);
              this.uncompressedSize === s.MAX_VALUE_32BITS && (this.uncompressedSize = e2.readInt(8)), this.compressedSize === s.MAX_VALUE_32BITS && (this.compressedSize = e2.readInt(8)), this.localHeaderOffset === s.MAX_VALUE_32BITS && (this.localHeaderOffset = e2.readInt(8)), this.diskNumberStart === s.MAX_VALUE_32BITS && (this.diskNumberStart = e2.readInt(4));
            }
          }, readExtraFields: function(e2) {
            var t2, r2, n2, i2 = e2.index + this.extraFieldsLength;
            for (this.extraFields || (this.extraFields = {}); e2.index + 4 < i2; ) t2 = e2.readInt(2), r2 = e2.readInt(2), n2 = e2.readData(r2), this.extraFields[t2] = { id: t2, length: r2, value: n2 };
            e2.setIndex(i2);
          }, handleUTF8: function() {
            var e2 = u.uint8array ? "uint8array" : "array";
            if (this.useUTF8()) this.fileNameStr = o.utf8decode(this.fileName), this.fileCommentStr = o.utf8decode(this.fileComment);
            else {
              var t2 = this.findExtraFieldUnicodePath();
              if (null !== t2) this.fileNameStr = t2;
              else {
                var r2 = s.transformTo(e2, this.fileName);
                this.fileNameStr = this.loadOptions.decodeFileName(r2);
              }
              var n2 = this.findExtraFieldUnicodeComment();
              if (null !== n2) this.fileCommentStr = n2;
              else {
                var i2 = s.transformTo(e2, this.fileComment);
                this.fileCommentStr = this.loadOptions.decodeFileName(i2);
              }
            }
          }, findExtraFieldUnicodePath: function() {
            var e2 = this.extraFields[28789];
            if (e2) {
              var t2 = n(e2.value);
              return 1 !== t2.readInt(1) ? null : a(this.fileName) !== t2.readInt(4) ? null : o.utf8decode(t2.readData(e2.length - 5));
            }
            return null;
          }, findExtraFieldUnicodeComment: function() {
            var e2 = this.extraFields[25461];
            if (e2) {
              var t2 = n(e2.value);
              return 1 !== t2.readInt(1) ? null : a(this.fileComment) !== t2.readInt(4) ? null : o.utf8decode(t2.readData(e2.length - 5));
            }
            return null;
          } }, t.exports = l;
        }, { "./compressedObject": 2, "./compressions": 3, "./crc32": 4, "./reader/readerFor": 22, "./support": 30, "./utf8": 31, "./utils": 32 }], 35: [function(e, t, r) {
          "use strict";
          function n(e2, t2, r2) {
            this.name = e2, this.dir = r2.dir, this.date = r2.date, this.comment = r2.comment, this.unixPermissions = r2.unixPermissions, this.dosPermissions = r2.dosPermissions, this._data = t2, this._dataBinary = r2.binary, this.options = { compression: r2.compression, compressionOptions: r2.compressionOptions };
          }
          var s = e("./stream/StreamHelper"), i = e("./stream/DataWorker"), a = e("./utf8"), o = e("./compressedObject"), h = e("./stream/GenericWorker");
          n.prototype = { internalStream: function(e2) {
            var t2 = null, r2 = "string";
            try {
              if (!e2) throw new Error("No output type specified.");
              var n2 = "string" === (r2 = e2.toLowerCase()) || "text" === r2;
              "binarystring" !== r2 && "text" !== r2 || (r2 = "string"), t2 = this._decompressWorker();
              var i2 = !this._dataBinary;
              i2 && !n2 && (t2 = t2.pipe(new a.Utf8EncodeWorker())), !i2 && n2 && (t2 = t2.pipe(new a.Utf8DecodeWorker()));
            } catch (e3) {
              (t2 = new h("error")).error(e3);
            }
            return new s(t2, r2, "");
          }, async: function(e2, t2) {
            return this.internalStream(e2).accumulate(t2);
          }, nodeStream: function(e2, t2) {
            return this.internalStream(e2 || "nodebuffer").toNodejsStream(t2);
          }, _compressWorker: function(e2, t2) {
            if (this._data instanceof o && this._data.compression.magic === e2.magic) return this._data.getCompressedWorker();
            var r2 = this._decompressWorker();
            return this._dataBinary || (r2 = r2.pipe(new a.Utf8EncodeWorker())), o.createWorkerFrom(r2, e2, t2);
          }, _decompressWorker: function() {
            return this._data instanceof o ? this._data.getContentWorker() : this._data instanceof h ? this._data : new i(this._data);
          } };
          for (var u = ["asText", "asBinary", "asNodeBuffer", "asUint8Array", "asArrayBuffer"], l = function() {
            throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
          }, f = 0; f < u.length; f++) n.prototype[u[f]] = l;
          t.exports = n;
        }, { "./compressedObject": 2, "./stream/DataWorker": 27, "./stream/GenericWorker": 28, "./stream/StreamHelper": 29, "./utf8": 31 }], 36: [function(e, l, t) {
          (function(t2) {
            "use strict";
            var r, n, e2 = t2.MutationObserver || t2.WebKitMutationObserver;
            if (e2) {
              var i = 0, s = new e2(u), a = t2.document.createTextNode("");
              s.observe(a, { characterData: true }), r = function() {
                a.data = i = ++i % 2;
              };
            } else if (t2.setImmediate || void 0 === t2.MessageChannel) r = "document" in t2 && "onreadystatechange" in t2.document.createElement("script") ? function() {
              var e3 = t2.document.createElement("script");
              e3.onreadystatechange = function() {
                u(), e3.onreadystatechange = null, e3.parentNode.removeChild(e3), e3 = null;
              }, t2.document.documentElement.appendChild(e3);
            } : function() {
              setTimeout(u, 0);
            };
            else {
              var o = new t2.MessageChannel();
              o.port1.onmessage = u, r = function() {
                o.port2.postMessage(0);
              };
            }
            var h = [];
            function u() {
              var e3, t3;
              n = true;
              for (var r2 = h.length; r2; ) {
                for (t3 = h, h = [], e3 = -1; ++e3 < r2; ) t3[e3]();
                r2 = h.length;
              }
              n = false;
            }
            l.exports = function(e3) {
              1 !== h.push(e3) || n || r();
            };
          }).call(this, "undefined" != typeof global ? global : "undefined" != typeof self ? self : "undefined" != typeof window ? window : {});
        }, {}], 37: [function(e, t, r) {
          "use strict";
          var i = e("immediate");
          function u() {
          }
          var l = {}, s = ["REJECTED"], a = ["FULFILLED"], n = ["PENDING"];
          function o(e2) {
            if ("function" != typeof e2) throw new TypeError("resolver must be a function");
            this.state = n, this.queue = [], this.outcome = void 0, e2 !== u && d(this, e2);
          }
          function h(e2, t2, r2) {
            this.promise = e2, "function" == typeof t2 && (this.onFulfilled = t2, this.callFulfilled = this.otherCallFulfilled), "function" == typeof r2 && (this.onRejected = r2, this.callRejected = this.otherCallRejected);
          }
          function f(t2, r2, n2) {
            i(function() {
              var e2;
              try {
                e2 = r2(n2);
              } catch (e3) {
                return l.reject(t2, e3);
              }
              e2 === t2 ? l.reject(t2, new TypeError("Cannot resolve promise with itself")) : l.resolve(t2, e2);
            });
          }
          function c(e2) {
            var t2 = e2 && e2.then;
            if (e2 && ("object" == typeof e2 || "function" == typeof e2) && "function" == typeof t2) return function() {
              t2.apply(e2, arguments);
            };
          }
          function d(t2, e2) {
            var r2 = false;
            function n2(e3) {
              r2 || (r2 = true, l.reject(t2, e3));
            }
            function i2(e3) {
              r2 || (r2 = true, l.resolve(t2, e3));
            }
            var s2 = p(function() {
              e2(i2, n2);
            });
            "error" === s2.status && n2(s2.value);
          }
          function p(e2, t2) {
            var r2 = {};
            try {
              r2.value = e2(t2), r2.status = "success";
            } catch (e3) {
              r2.status = "error", r2.value = e3;
            }
            return r2;
          }
          (t.exports = o).prototype.finally = function(t2) {
            if ("function" != typeof t2) return this;
            var r2 = this.constructor;
            return this.then(function(e2) {
              return r2.resolve(t2()).then(function() {
                return e2;
              });
            }, function(e2) {
              return r2.resolve(t2()).then(function() {
                throw e2;
              });
            });
          }, o.prototype.catch = function(e2) {
            return this.then(null, e2);
          }, o.prototype.then = function(e2, t2) {
            if ("function" != typeof e2 && this.state === a || "function" != typeof t2 && this.state === s) return this;
            var r2 = new this.constructor(u);
            this.state !== n ? f(r2, this.state === a ? e2 : t2, this.outcome) : this.queue.push(new h(r2, e2, t2));
            return r2;
          }, h.prototype.callFulfilled = function(e2) {
            l.resolve(this.promise, e2);
          }, h.prototype.otherCallFulfilled = function(e2) {
            f(this.promise, this.onFulfilled, e2);
          }, h.prototype.callRejected = function(e2) {
            l.reject(this.promise, e2);
          }, h.prototype.otherCallRejected = function(e2) {
            f(this.promise, this.onRejected, e2);
          }, l.resolve = function(e2, t2) {
            var r2 = p(c, t2);
            if ("error" === r2.status) return l.reject(e2, r2.value);
            var n2 = r2.value;
            if (n2) d(e2, n2);
            else {
              e2.state = a, e2.outcome = t2;
              for (var i2 = -1, s2 = e2.queue.length; ++i2 < s2; ) e2.queue[i2].callFulfilled(t2);
            }
            return e2;
          }, l.reject = function(e2, t2) {
            e2.state = s, e2.outcome = t2;
            for (var r2 = -1, n2 = e2.queue.length; ++r2 < n2; ) e2.queue[r2].callRejected(t2);
            return e2;
          }, o.resolve = function(e2) {
            if (e2 instanceof this) return e2;
            return l.resolve(new this(u), e2);
          }, o.reject = function(e2) {
            var t2 = new this(u);
            return l.reject(t2, e2);
          }, o.all = function(e2) {
            var r2 = this;
            if ("[object Array]" !== Object.prototype.toString.call(e2)) return this.reject(new TypeError("must be an array"));
            var n2 = e2.length, i2 = false;
            if (!n2) return this.resolve([]);
            var s2 = new Array(n2), a2 = 0, t2 = -1, o2 = new this(u);
            for (; ++t2 < n2; ) h2(e2[t2], t2);
            return o2;
            function h2(e3, t3) {
              r2.resolve(e3).then(function(e4) {
                s2[t3] = e4, ++a2 !== n2 || i2 || (i2 = true, l.resolve(o2, s2));
              }, function(e4) {
                i2 || (i2 = true, l.reject(o2, e4));
              });
            }
          }, o.race = function(e2) {
            var t2 = this;
            if ("[object Array]" !== Object.prototype.toString.call(e2)) return this.reject(new TypeError("must be an array"));
            var r2 = e2.length, n2 = false;
            if (!r2) return this.resolve([]);
            var i2 = -1, s2 = new this(u);
            for (; ++i2 < r2; ) a2 = e2[i2], t2.resolve(a2).then(function(e3) {
              n2 || (n2 = true, l.resolve(s2, e3));
            }, function(e3) {
              n2 || (n2 = true, l.reject(s2, e3));
            });
            var a2;
            return s2;
          };
        }, { immediate: 36 }], 38: [function(e, t, r) {
          "use strict";
          var n = {};
          (0, e("./lib/utils/common").assign)(n, e("./lib/deflate"), e("./lib/inflate"), e("./lib/zlib/constants")), t.exports = n;
        }, { "./lib/deflate": 39, "./lib/inflate": 40, "./lib/utils/common": 41, "./lib/zlib/constants": 44 }], 39: [function(e, t, r) {
          "use strict";
          var a = e("./zlib/deflate"), o = e("./utils/common"), h = e("./utils/strings"), i = e("./zlib/messages"), s = e("./zlib/zstream"), u = Object.prototype.toString, l = 0, f = -1, c = 0, d = 8;
          function p(e2) {
            if (!(this instanceof p)) return new p(e2);
            this.options = o.assign({ level: f, method: d, chunkSize: 16384, windowBits: 15, memLevel: 8, strategy: c, to: "" }, e2 || {});
            var t2 = this.options;
            t2.raw && 0 < t2.windowBits ? t2.windowBits = -t2.windowBits : t2.gzip && 0 < t2.windowBits && t2.windowBits < 16 && (t2.windowBits += 16), this.err = 0, this.msg = "", this.ended = false, this.chunks = [], this.strm = new s(), this.strm.avail_out = 0;
            var r2 = a.deflateInit2(this.strm, t2.level, t2.method, t2.windowBits, t2.memLevel, t2.strategy);
            if (r2 !== l) throw new Error(i[r2]);
            if (t2.header && a.deflateSetHeader(this.strm, t2.header), t2.dictionary) {
              var n2;
              if (n2 = "string" == typeof t2.dictionary ? h.string2buf(t2.dictionary) : "[object ArrayBuffer]" === u.call(t2.dictionary) ? new Uint8Array(t2.dictionary) : t2.dictionary, (r2 = a.deflateSetDictionary(this.strm, n2)) !== l) throw new Error(i[r2]);
              this._dict_set = true;
            }
          }
          function n(e2, t2) {
            var r2 = new p(t2);
            if (r2.push(e2, true), r2.err) throw r2.msg || i[r2.err];
            return r2.result;
          }
          p.prototype.push = function(e2, t2) {
            var r2, n2, i2 = this.strm, s2 = this.options.chunkSize;
            if (this.ended) return false;
            n2 = t2 === ~~t2 ? t2 : true === t2 ? 4 : 0, "string" == typeof e2 ? i2.input = h.string2buf(e2) : "[object ArrayBuffer]" === u.call(e2) ? i2.input = new Uint8Array(e2) : i2.input = e2, i2.next_in = 0, i2.avail_in = i2.input.length;
            do {
              if (0 === i2.avail_out && (i2.output = new o.Buf8(s2), i2.next_out = 0, i2.avail_out = s2), 1 !== (r2 = a.deflate(i2, n2)) && r2 !== l) return this.onEnd(r2), !(this.ended = true);
              0 !== i2.avail_out && (0 !== i2.avail_in || 4 !== n2 && 2 !== n2) || ("string" === this.options.to ? this.onData(h.buf2binstring(o.shrinkBuf(i2.output, i2.next_out))) : this.onData(o.shrinkBuf(i2.output, i2.next_out)));
            } while ((0 < i2.avail_in || 0 === i2.avail_out) && 1 !== r2);
            return 4 === n2 ? (r2 = a.deflateEnd(this.strm), this.onEnd(r2), this.ended = true, r2 === l) : 2 !== n2 || (this.onEnd(l), !(i2.avail_out = 0));
          }, p.prototype.onData = function(e2) {
            this.chunks.push(e2);
          }, p.prototype.onEnd = function(e2) {
            e2 === l && ("string" === this.options.to ? this.result = this.chunks.join("") : this.result = o.flattenChunks(this.chunks)), this.chunks = [], this.err = e2, this.msg = this.strm.msg;
          }, r.Deflate = p, r.deflate = n, r.deflateRaw = function(e2, t2) {
            return (t2 = t2 || {}).raw = true, n(e2, t2);
          }, r.gzip = function(e2, t2) {
            return (t2 = t2 || {}).gzip = true, n(e2, t2);
          };
        }, { "./utils/common": 41, "./utils/strings": 42, "./zlib/deflate": 46, "./zlib/messages": 51, "./zlib/zstream": 53 }], 40: [function(e, t, r) {
          "use strict";
          var c = e("./zlib/inflate"), d = e("./utils/common"), p = e("./utils/strings"), m = e("./zlib/constants"), n = e("./zlib/messages"), i = e("./zlib/zstream"), s = e("./zlib/gzheader"), _ = Object.prototype.toString;
          function a(e2) {
            if (!(this instanceof a)) return new a(e2);
            this.options = d.assign({ chunkSize: 16384, windowBits: 0, to: "" }, e2 || {});
            var t2 = this.options;
            t2.raw && 0 <= t2.windowBits && t2.windowBits < 16 && (t2.windowBits = -t2.windowBits, 0 === t2.windowBits && (t2.windowBits = -15)), !(0 <= t2.windowBits && t2.windowBits < 16) || e2 && e2.windowBits || (t2.windowBits += 32), 15 < t2.windowBits && t2.windowBits < 48 && 0 == (15 & t2.windowBits) && (t2.windowBits |= 15), this.err = 0, this.msg = "", this.ended = false, this.chunks = [], this.strm = new i(), this.strm.avail_out = 0;
            var r2 = c.inflateInit2(this.strm, t2.windowBits);
            if (r2 !== m.Z_OK) throw new Error(n[r2]);
            this.header = new s(), c.inflateGetHeader(this.strm, this.header);
          }
          function o(e2, t2) {
            var r2 = new a(t2);
            if (r2.push(e2, true), r2.err) throw r2.msg || n[r2.err];
            return r2.result;
          }
          a.prototype.push = function(e2, t2) {
            var r2, n2, i2, s2, a2, o2, h = this.strm, u = this.options.chunkSize, l = this.options.dictionary, f = false;
            if (this.ended) return false;
            n2 = t2 === ~~t2 ? t2 : true === t2 ? m.Z_FINISH : m.Z_NO_FLUSH, "string" == typeof e2 ? h.input = p.binstring2buf(e2) : "[object ArrayBuffer]" === _.call(e2) ? h.input = new Uint8Array(e2) : h.input = e2, h.next_in = 0, h.avail_in = h.input.length;
            do {
              if (0 === h.avail_out && (h.output = new d.Buf8(u), h.next_out = 0, h.avail_out = u), (r2 = c.inflate(h, m.Z_NO_FLUSH)) === m.Z_NEED_DICT && l && (o2 = "string" == typeof l ? p.string2buf(l) : "[object ArrayBuffer]" === _.call(l) ? new Uint8Array(l) : l, r2 = c.inflateSetDictionary(this.strm, o2)), r2 === m.Z_BUF_ERROR && true === f && (r2 = m.Z_OK, f = false), r2 !== m.Z_STREAM_END && r2 !== m.Z_OK) return this.onEnd(r2), !(this.ended = true);
              h.next_out && (0 !== h.avail_out && r2 !== m.Z_STREAM_END && (0 !== h.avail_in || n2 !== m.Z_FINISH && n2 !== m.Z_SYNC_FLUSH) || ("string" === this.options.to ? (i2 = p.utf8border(h.output, h.next_out), s2 = h.next_out - i2, a2 = p.buf2string(h.output, i2), h.next_out = s2, h.avail_out = u - s2, s2 && d.arraySet(h.output, h.output, i2, s2, 0), this.onData(a2)) : this.onData(d.shrinkBuf(h.output, h.next_out)))), 0 === h.avail_in && 0 === h.avail_out && (f = true);
            } while ((0 < h.avail_in || 0 === h.avail_out) && r2 !== m.Z_STREAM_END);
            return r2 === m.Z_STREAM_END && (n2 = m.Z_FINISH), n2 === m.Z_FINISH ? (r2 = c.inflateEnd(this.strm), this.onEnd(r2), this.ended = true, r2 === m.Z_OK) : n2 !== m.Z_SYNC_FLUSH || (this.onEnd(m.Z_OK), !(h.avail_out = 0));
          }, a.prototype.onData = function(e2) {
            this.chunks.push(e2);
          }, a.prototype.onEnd = function(e2) {
            e2 === m.Z_OK && ("string" === this.options.to ? this.result = this.chunks.join("") : this.result = d.flattenChunks(this.chunks)), this.chunks = [], this.err = e2, this.msg = this.strm.msg;
          }, r.Inflate = a, r.inflate = o, r.inflateRaw = function(e2, t2) {
            return (t2 = t2 || {}).raw = true, o(e2, t2);
          }, r.ungzip = o;
        }, { "./utils/common": 41, "./utils/strings": 42, "./zlib/constants": 44, "./zlib/gzheader": 47, "./zlib/inflate": 49, "./zlib/messages": 51, "./zlib/zstream": 53 }], 41: [function(e, t, r) {
          "use strict";
          var n = "undefined" != typeof Uint8Array && "undefined" != typeof Uint16Array && "undefined" != typeof Int32Array;
          r.assign = function(e2) {
            for (var t2 = Array.prototype.slice.call(arguments, 1); t2.length; ) {
              var r2 = t2.shift();
              if (r2) {
                if ("object" != typeof r2) throw new TypeError(r2 + "must be non-object");
                for (var n2 in r2) r2.hasOwnProperty(n2) && (e2[n2] = r2[n2]);
              }
            }
            return e2;
          }, r.shrinkBuf = function(e2, t2) {
            return e2.length === t2 ? e2 : e2.subarray ? e2.subarray(0, t2) : (e2.length = t2, e2);
          };
          var i = { arraySet: function(e2, t2, r2, n2, i2) {
            if (t2.subarray && e2.subarray) e2.set(t2.subarray(r2, r2 + n2), i2);
            else for (var s2 = 0; s2 < n2; s2++) e2[i2 + s2] = t2[r2 + s2];
          }, flattenChunks: function(e2) {
            var t2, r2, n2, i2, s2, a;
            for (t2 = n2 = 0, r2 = e2.length; t2 < r2; t2++) n2 += e2[t2].length;
            for (a = new Uint8Array(n2), t2 = i2 = 0, r2 = e2.length; t2 < r2; t2++) s2 = e2[t2], a.set(s2, i2), i2 += s2.length;
            return a;
          } }, s = { arraySet: function(e2, t2, r2, n2, i2) {
            for (var s2 = 0; s2 < n2; s2++) e2[i2 + s2] = t2[r2 + s2];
          }, flattenChunks: function(e2) {
            return [].concat.apply([], e2);
          } };
          r.setTyped = function(e2) {
            e2 ? (r.Buf8 = Uint8Array, r.Buf16 = Uint16Array, r.Buf32 = Int32Array, r.assign(r, i)) : (r.Buf8 = Array, r.Buf16 = Array, r.Buf32 = Array, r.assign(r, s));
          }, r.setTyped(n);
        }, {}], 42: [function(e, t, r) {
          "use strict";
          var h = e("./common"), i = true, s = true;
          try {
            String.fromCharCode.apply(null, [0]);
          } catch (e2) {
            i = false;
          }
          try {
            String.fromCharCode.apply(null, new Uint8Array(1));
          } catch (e2) {
            s = false;
          }
          for (var u = new h.Buf8(256), n = 0; n < 256; n++) u[n] = 252 <= n ? 6 : 248 <= n ? 5 : 240 <= n ? 4 : 224 <= n ? 3 : 192 <= n ? 2 : 1;
          function l(e2, t2) {
            if (t2 < 65537 && (e2.subarray && s || !e2.subarray && i)) return String.fromCharCode.apply(null, h.shrinkBuf(e2, t2));
            for (var r2 = "", n2 = 0; n2 < t2; n2++) r2 += String.fromCharCode(e2[n2]);
            return r2;
          }
          u[254] = u[254] = 1, r.string2buf = function(e2) {
            var t2, r2, n2, i2, s2, a = e2.length, o = 0;
            for (i2 = 0; i2 < a; i2++) 55296 == (64512 & (r2 = e2.charCodeAt(i2))) && i2 + 1 < a && 56320 == (64512 & (n2 = e2.charCodeAt(i2 + 1))) && (r2 = 65536 + (r2 - 55296 << 10) + (n2 - 56320), i2++), o += r2 < 128 ? 1 : r2 < 2048 ? 2 : r2 < 65536 ? 3 : 4;
            for (t2 = new h.Buf8(o), i2 = s2 = 0; s2 < o; i2++) 55296 == (64512 & (r2 = e2.charCodeAt(i2))) && i2 + 1 < a && 56320 == (64512 & (n2 = e2.charCodeAt(i2 + 1))) && (r2 = 65536 + (r2 - 55296 << 10) + (n2 - 56320), i2++), r2 < 128 ? t2[s2++] = r2 : (r2 < 2048 ? t2[s2++] = 192 | r2 >>> 6 : (r2 < 65536 ? t2[s2++] = 224 | r2 >>> 12 : (t2[s2++] = 240 | r2 >>> 18, t2[s2++] = 128 | r2 >>> 12 & 63), t2[s2++] = 128 | r2 >>> 6 & 63), t2[s2++] = 128 | 63 & r2);
            return t2;
          }, r.buf2binstring = function(e2) {
            return l(e2, e2.length);
          }, r.binstring2buf = function(e2) {
            for (var t2 = new h.Buf8(e2.length), r2 = 0, n2 = t2.length; r2 < n2; r2++) t2[r2] = e2.charCodeAt(r2);
            return t2;
          }, r.buf2string = function(e2, t2) {
            var r2, n2, i2, s2, a = t2 || e2.length, o = new Array(2 * a);
            for (r2 = n2 = 0; r2 < a; ) if ((i2 = e2[r2++]) < 128) o[n2++] = i2;
            else if (4 < (s2 = u[i2])) o[n2++] = 65533, r2 += s2 - 1;
            else {
              for (i2 &= 2 === s2 ? 31 : 3 === s2 ? 15 : 7; 1 < s2 && r2 < a; ) i2 = i2 << 6 | 63 & e2[r2++], s2--;
              1 < s2 ? o[n2++] = 65533 : i2 < 65536 ? o[n2++] = i2 : (i2 -= 65536, o[n2++] = 55296 | i2 >> 10 & 1023, o[n2++] = 56320 | 1023 & i2);
            }
            return l(o, n2);
          }, r.utf8border = function(e2, t2) {
            var r2;
            for ((t2 = t2 || e2.length) > e2.length && (t2 = e2.length), r2 = t2 - 1; 0 <= r2 && 128 == (192 & e2[r2]); ) r2--;
            return r2 < 0 ? t2 : 0 === r2 ? t2 : r2 + u[e2[r2]] > t2 ? r2 : t2;
          };
        }, { "./common": 41 }], 43: [function(e, t, r) {
          "use strict";
          t.exports = function(e2, t2, r2, n) {
            for (var i = 65535 & e2 | 0, s = e2 >>> 16 & 65535 | 0, a = 0; 0 !== r2; ) {
              for (r2 -= a = 2e3 < r2 ? 2e3 : r2; s = s + (i = i + t2[n++] | 0) | 0, --a; ) ;
              i %= 65521, s %= 65521;
            }
            return i | s << 16 | 0;
          };
        }, {}], 44: [function(e, t, r) {
          "use strict";
          t.exports = { Z_NO_FLUSH: 0, Z_PARTIAL_FLUSH: 1, Z_SYNC_FLUSH: 2, Z_FULL_FLUSH: 3, Z_FINISH: 4, Z_BLOCK: 5, Z_TREES: 6, Z_OK: 0, Z_STREAM_END: 1, Z_NEED_DICT: 2, Z_ERRNO: -1, Z_STREAM_ERROR: -2, Z_DATA_ERROR: -3, Z_BUF_ERROR: -5, Z_NO_COMPRESSION: 0, Z_BEST_SPEED: 1, Z_BEST_COMPRESSION: 9, Z_DEFAULT_COMPRESSION: -1, Z_FILTERED: 1, Z_HUFFMAN_ONLY: 2, Z_RLE: 3, Z_FIXED: 4, Z_DEFAULT_STRATEGY: 0, Z_BINARY: 0, Z_TEXT: 1, Z_UNKNOWN: 2, Z_DEFLATED: 8 };
        }, {}], 45: [function(e, t, r) {
          "use strict";
          var o = (function() {
            for (var e2, t2 = [], r2 = 0; r2 < 256; r2++) {
              e2 = r2;
              for (var n = 0; n < 8; n++) e2 = 1 & e2 ? 3988292384 ^ e2 >>> 1 : e2 >>> 1;
              t2[r2] = e2;
            }
            return t2;
          })();
          t.exports = function(e2, t2, r2, n) {
            var i = o, s = n + r2;
            e2 ^= -1;
            for (var a = n; a < s; a++) e2 = e2 >>> 8 ^ i[255 & (e2 ^ t2[a])];
            return -1 ^ e2;
          };
        }, {}], 46: [function(e, t, r) {
          "use strict";
          var h, c = e("../utils/common"), u = e("./trees"), d = e("./adler32"), p = e("./crc32"), n = e("./messages"), l = 0, f = 4, m = 0, _ = -2, g = -1, b = 4, i = 2, v = 8, y = 9, s = 286, a = 30, o = 19, w = 2 * s + 1, k = 15, x = 3, S = 258, z = S + x + 1, C = 42, E = 113, A = 1, I = 2, O = 3, B = 4;
          function R(e2, t2) {
            return e2.msg = n[t2], t2;
          }
          function T(e2) {
            return (e2 << 1) - (4 < e2 ? 9 : 0);
          }
          function D(e2) {
            for (var t2 = e2.length; 0 <= --t2; ) e2[t2] = 0;
          }
          function F(e2) {
            var t2 = e2.state, r2 = t2.pending;
            r2 > e2.avail_out && (r2 = e2.avail_out), 0 !== r2 && (c.arraySet(e2.output, t2.pending_buf, t2.pending_out, r2, e2.next_out), e2.next_out += r2, t2.pending_out += r2, e2.total_out += r2, e2.avail_out -= r2, t2.pending -= r2, 0 === t2.pending && (t2.pending_out = 0));
          }
          function N(e2, t2) {
            u._tr_flush_block(e2, 0 <= e2.block_start ? e2.block_start : -1, e2.strstart - e2.block_start, t2), e2.block_start = e2.strstart, F(e2.strm);
          }
          function U(e2, t2) {
            e2.pending_buf[e2.pending++] = t2;
          }
          function P(e2, t2) {
            e2.pending_buf[e2.pending++] = t2 >>> 8 & 255, e2.pending_buf[e2.pending++] = 255 & t2;
          }
          function L(e2, t2) {
            var r2, n2, i2 = e2.max_chain_length, s2 = e2.strstart, a2 = e2.prev_length, o2 = e2.nice_match, h2 = e2.strstart > e2.w_size - z ? e2.strstart - (e2.w_size - z) : 0, u2 = e2.window, l2 = e2.w_mask, f2 = e2.prev, c2 = e2.strstart + S, d2 = u2[s2 + a2 - 1], p2 = u2[s2 + a2];
            e2.prev_length >= e2.good_match && (i2 >>= 2), o2 > e2.lookahead && (o2 = e2.lookahead);
            do {
              if (u2[(r2 = t2) + a2] === p2 && u2[r2 + a2 - 1] === d2 && u2[r2] === u2[s2] && u2[++r2] === u2[s2 + 1]) {
                s2 += 2, r2++;
                do {
                } while (u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && s2 < c2);
                if (n2 = S - (c2 - s2), s2 = c2 - S, a2 < n2) {
                  if (e2.match_start = t2, o2 <= (a2 = n2)) break;
                  d2 = u2[s2 + a2 - 1], p2 = u2[s2 + a2];
                }
              }
            } while ((t2 = f2[t2 & l2]) > h2 && 0 != --i2);
            return a2 <= e2.lookahead ? a2 : e2.lookahead;
          }
          function j(e2) {
            var t2, r2, n2, i2, s2, a2, o2, h2, u2, l2, f2 = e2.w_size;
            do {
              if (i2 = e2.window_size - e2.lookahead - e2.strstart, e2.strstart >= f2 + (f2 - z)) {
                for (c.arraySet(e2.window, e2.window, f2, f2, 0), e2.match_start -= f2, e2.strstart -= f2, e2.block_start -= f2, t2 = r2 = e2.hash_size; n2 = e2.head[--t2], e2.head[t2] = f2 <= n2 ? n2 - f2 : 0, --r2; ) ;
                for (t2 = r2 = f2; n2 = e2.prev[--t2], e2.prev[t2] = f2 <= n2 ? n2 - f2 : 0, --r2; ) ;
                i2 += f2;
              }
              if (0 === e2.strm.avail_in) break;
              if (a2 = e2.strm, o2 = e2.window, h2 = e2.strstart + e2.lookahead, u2 = i2, l2 = void 0, l2 = a2.avail_in, u2 < l2 && (l2 = u2), r2 = 0 === l2 ? 0 : (a2.avail_in -= l2, c.arraySet(o2, a2.input, a2.next_in, l2, h2), 1 === a2.state.wrap ? a2.adler = d(a2.adler, o2, l2, h2) : 2 === a2.state.wrap && (a2.adler = p(a2.adler, o2, l2, h2)), a2.next_in += l2, a2.total_in += l2, l2), e2.lookahead += r2, e2.lookahead + e2.insert >= x) for (s2 = e2.strstart - e2.insert, e2.ins_h = e2.window[s2], e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[s2 + 1]) & e2.hash_mask; e2.insert && (e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[s2 + x - 1]) & e2.hash_mask, e2.prev[s2 & e2.w_mask] = e2.head[e2.ins_h], e2.head[e2.ins_h] = s2, s2++, e2.insert--, !(e2.lookahead + e2.insert < x)); ) ;
            } while (e2.lookahead < z && 0 !== e2.strm.avail_in);
          }
          function Z(e2, t2) {
            for (var r2, n2; ; ) {
              if (e2.lookahead < z) {
                if (j(e2), e2.lookahead < z && t2 === l) return A;
                if (0 === e2.lookahead) break;
              }
              if (r2 = 0, e2.lookahead >= x && (e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[e2.strstart + x - 1]) & e2.hash_mask, r2 = e2.prev[e2.strstart & e2.w_mask] = e2.head[e2.ins_h], e2.head[e2.ins_h] = e2.strstart), 0 !== r2 && e2.strstart - r2 <= e2.w_size - z && (e2.match_length = L(e2, r2)), e2.match_length >= x) if (n2 = u._tr_tally(e2, e2.strstart - e2.match_start, e2.match_length - x), e2.lookahead -= e2.match_length, e2.match_length <= e2.max_lazy_match && e2.lookahead >= x) {
                for (e2.match_length--; e2.strstart++, e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[e2.strstart + x - 1]) & e2.hash_mask, r2 = e2.prev[e2.strstart & e2.w_mask] = e2.head[e2.ins_h], e2.head[e2.ins_h] = e2.strstart, 0 != --e2.match_length; ) ;
                e2.strstart++;
              } else e2.strstart += e2.match_length, e2.match_length = 0, e2.ins_h = e2.window[e2.strstart], e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[e2.strstart + 1]) & e2.hash_mask;
              else n2 = u._tr_tally(e2, 0, e2.window[e2.strstart]), e2.lookahead--, e2.strstart++;
              if (n2 && (N(e2, false), 0 === e2.strm.avail_out)) return A;
            }
            return e2.insert = e2.strstart < x - 1 ? e2.strstart : x - 1, t2 === f ? (N(e2, true), 0 === e2.strm.avail_out ? O : B) : e2.last_lit && (N(e2, false), 0 === e2.strm.avail_out) ? A : I;
          }
          function W(e2, t2) {
            for (var r2, n2, i2; ; ) {
              if (e2.lookahead < z) {
                if (j(e2), e2.lookahead < z && t2 === l) return A;
                if (0 === e2.lookahead) break;
              }
              if (r2 = 0, e2.lookahead >= x && (e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[e2.strstart + x - 1]) & e2.hash_mask, r2 = e2.prev[e2.strstart & e2.w_mask] = e2.head[e2.ins_h], e2.head[e2.ins_h] = e2.strstart), e2.prev_length = e2.match_length, e2.prev_match = e2.match_start, e2.match_length = x - 1, 0 !== r2 && e2.prev_length < e2.max_lazy_match && e2.strstart - r2 <= e2.w_size - z && (e2.match_length = L(e2, r2), e2.match_length <= 5 && (1 === e2.strategy || e2.match_length === x && 4096 < e2.strstart - e2.match_start) && (e2.match_length = x - 1)), e2.prev_length >= x && e2.match_length <= e2.prev_length) {
                for (i2 = e2.strstart + e2.lookahead - x, n2 = u._tr_tally(e2, e2.strstart - 1 - e2.prev_match, e2.prev_length - x), e2.lookahead -= e2.prev_length - 1, e2.prev_length -= 2; ++e2.strstart <= i2 && (e2.ins_h = (e2.ins_h << e2.hash_shift ^ e2.window[e2.strstart + x - 1]) & e2.hash_mask, r2 = e2.prev[e2.strstart & e2.w_mask] = e2.head[e2.ins_h], e2.head[e2.ins_h] = e2.strstart), 0 != --e2.prev_length; ) ;
                if (e2.match_available = 0, e2.match_length = x - 1, e2.strstart++, n2 && (N(e2, false), 0 === e2.strm.avail_out)) return A;
              } else if (e2.match_available) {
                if ((n2 = u._tr_tally(e2, 0, e2.window[e2.strstart - 1])) && N(e2, false), e2.strstart++, e2.lookahead--, 0 === e2.strm.avail_out) return A;
              } else e2.match_available = 1, e2.strstart++, e2.lookahead--;
            }
            return e2.match_available && (n2 = u._tr_tally(e2, 0, e2.window[e2.strstart - 1]), e2.match_available = 0), e2.insert = e2.strstart < x - 1 ? e2.strstart : x - 1, t2 === f ? (N(e2, true), 0 === e2.strm.avail_out ? O : B) : e2.last_lit && (N(e2, false), 0 === e2.strm.avail_out) ? A : I;
          }
          function M(e2, t2, r2, n2, i2) {
            this.good_length = e2, this.max_lazy = t2, this.nice_length = r2, this.max_chain = n2, this.func = i2;
          }
          function H() {
            this.strm = null, this.status = 0, this.pending_buf = null, this.pending_buf_size = 0, this.pending_out = 0, this.pending = 0, this.wrap = 0, this.gzhead = null, this.gzindex = 0, this.method = v, this.last_flush = -1, this.w_size = 0, this.w_bits = 0, this.w_mask = 0, this.window = null, this.window_size = 0, this.prev = null, this.head = null, this.ins_h = 0, this.hash_size = 0, this.hash_bits = 0, this.hash_mask = 0, this.hash_shift = 0, this.block_start = 0, this.match_length = 0, this.prev_match = 0, this.match_available = 0, this.strstart = 0, this.match_start = 0, this.lookahead = 0, this.prev_length = 0, this.max_chain_length = 0, this.max_lazy_match = 0, this.level = 0, this.strategy = 0, this.good_match = 0, this.nice_match = 0, this.dyn_ltree = new c.Buf16(2 * w), this.dyn_dtree = new c.Buf16(2 * (2 * a + 1)), this.bl_tree = new c.Buf16(2 * (2 * o + 1)), D(this.dyn_ltree), D(this.dyn_dtree), D(this.bl_tree), this.l_desc = null, this.d_desc = null, this.bl_desc = null, this.bl_count = new c.Buf16(k + 1), this.heap = new c.Buf16(2 * s + 1), D(this.heap), this.heap_len = 0, this.heap_max = 0, this.depth = new c.Buf16(2 * s + 1), D(this.depth), this.l_buf = 0, this.lit_bufsize = 0, this.last_lit = 0, this.d_buf = 0, this.opt_len = 0, this.static_len = 0, this.matches = 0, this.insert = 0, this.bi_buf = 0, this.bi_valid = 0;
          }
          function G(e2) {
            var t2;
            return e2 && e2.state ? (e2.total_in = e2.total_out = 0, e2.data_type = i, (t2 = e2.state).pending = 0, t2.pending_out = 0, t2.wrap < 0 && (t2.wrap = -t2.wrap), t2.status = t2.wrap ? C : E, e2.adler = 2 === t2.wrap ? 0 : 1, t2.last_flush = l, u._tr_init(t2), m) : R(e2, _);
          }
          function K(e2) {
            var t2 = G(e2);
            return t2 === m && (function(e3) {
              e3.window_size = 2 * e3.w_size, D(e3.head), e3.max_lazy_match = h[e3.level].max_lazy, e3.good_match = h[e3.level].good_length, e3.nice_match = h[e3.level].nice_length, e3.max_chain_length = h[e3.level].max_chain, e3.strstart = 0, e3.block_start = 0, e3.lookahead = 0, e3.insert = 0, e3.match_length = e3.prev_length = x - 1, e3.match_available = 0, e3.ins_h = 0;
            })(e2.state), t2;
          }
          function Y(e2, t2, r2, n2, i2, s2) {
            if (!e2) return _;
            var a2 = 1;
            if (t2 === g && (t2 = 6), n2 < 0 ? (a2 = 0, n2 = -n2) : 15 < n2 && (a2 = 2, n2 -= 16), i2 < 1 || y < i2 || r2 !== v || n2 < 8 || 15 < n2 || t2 < 0 || 9 < t2 || s2 < 0 || b < s2) return R(e2, _);
            8 === n2 && (n2 = 9);
            var o2 = new H();
            return (e2.state = o2).strm = e2, o2.wrap = a2, o2.gzhead = null, o2.w_bits = n2, o2.w_size = 1 << o2.w_bits, o2.w_mask = o2.w_size - 1, o2.hash_bits = i2 + 7, o2.hash_size = 1 << o2.hash_bits, o2.hash_mask = o2.hash_size - 1, o2.hash_shift = ~~((o2.hash_bits + x - 1) / x), o2.window = new c.Buf8(2 * o2.w_size), o2.head = new c.Buf16(o2.hash_size), o2.prev = new c.Buf16(o2.w_size), o2.lit_bufsize = 1 << i2 + 6, o2.pending_buf_size = 4 * o2.lit_bufsize, o2.pending_buf = new c.Buf8(o2.pending_buf_size), o2.d_buf = 1 * o2.lit_bufsize, o2.l_buf = 3 * o2.lit_bufsize, o2.level = t2, o2.strategy = s2, o2.method = r2, K(e2);
          }
          h = [new M(0, 0, 0, 0, function(e2, t2) {
            var r2 = 65535;
            for (r2 > e2.pending_buf_size - 5 && (r2 = e2.pending_buf_size - 5); ; ) {
              if (e2.lookahead <= 1) {
                if (j(e2), 0 === e2.lookahead && t2 === l) return A;
                if (0 === e2.lookahead) break;
              }
              e2.strstart += e2.lookahead, e2.lookahead = 0;
              var n2 = e2.block_start + r2;
              if ((0 === e2.strstart || e2.strstart >= n2) && (e2.lookahead = e2.strstart - n2, e2.strstart = n2, N(e2, false), 0 === e2.strm.avail_out)) return A;
              if (e2.strstart - e2.block_start >= e2.w_size - z && (N(e2, false), 0 === e2.strm.avail_out)) return A;
            }
            return e2.insert = 0, t2 === f ? (N(e2, true), 0 === e2.strm.avail_out ? O : B) : (e2.strstart > e2.block_start && (N(e2, false), e2.strm.avail_out), A);
          }), new M(4, 4, 8, 4, Z), new M(4, 5, 16, 8, Z), new M(4, 6, 32, 32, Z), new M(4, 4, 16, 16, W), new M(8, 16, 32, 32, W), new M(8, 16, 128, 128, W), new M(8, 32, 128, 256, W), new M(32, 128, 258, 1024, W), new M(32, 258, 258, 4096, W)], r.deflateInit = function(e2, t2) {
            return Y(e2, t2, v, 15, 8, 0);
          }, r.deflateInit2 = Y, r.deflateReset = K, r.deflateResetKeep = G, r.deflateSetHeader = function(e2, t2) {
            return e2 && e2.state ? 2 !== e2.state.wrap ? _ : (e2.state.gzhead = t2, m) : _;
          }, r.deflate = function(e2, t2) {
            var r2, n2, i2, s2;
            if (!e2 || !e2.state || 5 < t2 || t2 < 0) return e2 ? R(e2, _) : _;
            if (n2 = e2.state, !e2.output || !e2.input && 0 !== e2.avail_in || 666 === n2.status && t2 !== f) return R(e2, 0 === e2.avail_out ? -5 : _);
            if (n2.strm = e2, r2 = n2.last_flush, n2.last_flush = t2, n2.status === C) if (2 === n2.wrap) e2.adler = 0, U(n2, 31), U(n2, 139), U(n2, 8), n2.gzhead ? (U(n2, (n2.gzhead.text ? 1 : 0) + (n2.gzhead.hcrc ? 2 : 0) + (n2.gzhead.extra ? 4 : 0) + (n2.gzhead.name ? 8 : 0) + (n2.gzhead.comment ? 16 : 0)), U(n2, 255 & n2.gzhead.time), U(n2, n2.gzhead.time >> 8 & 255), U(n2, n2.gzhead.time >> 16 & 255), U(n2, n2.gzhead.time >> 24 & 255), U(n2, 9 === n2.level ? 2 : 2 <= n2.strategy || n2.level < 2 ? 4 : 0), U(n2, 255 & n2.gzhead.os), n2.gzhead.extra && n2.gzhead.extra.length && (U(n2, 255 & n2.gzhead.extra.length), U(n2, n2.gzhead.extra.length >> 8 & 255)), n2.gzhead.hcrc && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending, 0)), n2.gzindex = 0, n2.status = 69) : (U(n2, 0), U(n2, 0), U(n2, 0), U(n2, 0), U(n2, 0), U(n2, 9 === n2.level ? 2 : 2 <= n2.strategy || n2.level < 2 ? 4 : 0), U(n2, 3), n2.status = E);
            else {
              var a2 = v + (n2.w_bits - 8 << 4) << 8;
              a2 |= (2 <= n2.strategy || n2.level < 2 ? 0 : n2.level < 6 ? 1 : 6 === n2.level ? 2 : 3) << 6, 0 !== n2.strstart && (a2 |= 32), a2 += 31 - a2 % 31, n2.status = E, P(n2, a2), 0 !== n2.strstart && (P(n2, e2.adler >>> 16), P(n2, 65535 & e2.adler)), e2.adler = 1;
            }
            if (69 === n2.status) if (n2.gzhead.extra) {
              for (i2 = n2.pending; n2.gzindex < (65535 & n2.gzhead.extra.length) && (n2.pending !== n2.pending_buf_size || (n2.gzhead.hcrc && n2.pending > i2 && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending - i2, i2)), F(e2), i2 = n2.pending, n2.pending !== n2.pending_buf_size)); ) U(n2, 255 & n2.gzhead.extra[n2.gzindex]), n2.gzindex++;
              n2.gzhead.hcrc && n2.pending > i2 && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending - i2, i2)), n2.gzindex === n2.gzhead.extra.length && (n2.gzindex = 0, n2.status = 73);
            } else n2.status = 73;
            if (73 === n2.status) if (n2.gzhead.name) {
              i2 = n2.pending;
              do {
                if (n2.pending === n2.pending_buf_size && (n2.gzhead.hcrc && n2.pending > i2 && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending - i2, i2)), F(e2), i2 = n2.pending, n2.pending === n2.pending_buf_size)) {
                  s2 = 1;
                  break;
                }
                s2 = n2.gzindex < n2.gzhead.name.length ? 255 & n2.gzhead.name.charCodeAt(n2.gzindex++) : 0, U(n2, s2);
              } while (0 !== s2);
              n2.gzhead.hcrc && n2.pending > i2 && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending - i2, i2)), 0 === s2 && (n2.gzindex = 0, n2.status = 91);
            } else n2.status = 91;
            if (91 === n2.status) if (n2.gzhead.comment) {
              i2 = n2.pending;
              do {
                if (n2.pending === n2.pending_buf_size && (n2.gzhead.hcrc && n2.pending > i2 && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending - i2, i2)), F(e2), i2 = n2.pending, n2.pending === n2.pending_buf_size)) {
                  s2 = 1;
                  break;
                }
                s2 = n2.gzindex < n2.gzhead.comment.length ? 255 & n2.gzhead.comment.charCodeAt(n2.gzindex++) : 0, U(n2, s2);
              } while (0 !== s2);
              n2.gzhead.hcrc && n2.pending > i2 && (e2.adler = p(e2.adler, n2.pending_buf, n2.pending - i2, i2)), 0 === s2 && (n2.status = 103);
            } else n2.status = 103;
            if (103 === n2.status && (n2.gzhead.hcrc ? (n2.pending + 2 > n2.pending_buf_size && F(e2), n2.pending + 2 <= n2.pending_buf_size && (U(n2, 255 & e2.adler), U(n2, e2.adler >> 8 & 255), e2.adler = 0, n2.status = E)) : n2.status = E), 0 !== n2.pending) {
              if (F(e2), 0 === e2.avail_out) return n2.last_flush = -1, m;
            } else if (0 === e2.avail_in && T(t2) <= T(r2) && t2 !== f) return R(e2, -5);
            if (666 === n2.status && 0 !== e2.avail_in) return R(e2, -5);
            if (0 !== e2.avail_in || 0 !== n2.lookahead || t2 !== l && 666 !== n2.status) {
              var o2 = 2 === n2.strategy ? (function(e3, t3) {
                for (var r3; ; ) {
                  if (0 === e3.lookahead && (j(e3), 0 === e3.lookahead)) {
                    if (t3 === l) return A;
                    break;
                  }
                  if (e3.match_length = 0, r3 = u._tr_tally(e3, 0, e3.window[e3.strstart]), e3.lookahead--, e3.strstart++, r3 && (N(e3, false), 0 === e3.strm.avail_out)) return A;
                }
                return e3.insert = 0, t3 === f ? (N(e3, true), 0 === e3.strm.avail_out ? O : B) : e3.last_lit && (N(e3, false), 0 === e3.strm.avail_out) ? A : I;
              })(n2, t2) : 3 === n2.strategy ? (function(e3, t3) {
                for (var r3, n3, i3, s3, a3 = e3.window; ; ) {
                  if (e3.lookahead <= S) {
                    if (j(e3), e3.lookahead <= S && t3 === l) return A;
                    if (0 === e3.lookahead) break;
                  }
                  if (e3.match_length = 0, e3.lookahead >= x && 0 < e3.strstart && (n3 = a3[i3 = e3.strstart - 1]) === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3]) {
                    s3 = e3.strstart + S;
                    do {
                    } while (n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && i3 < s3);
                    e3.match_length = S - (s3 - i3), e3.match_length > e3.lookahead && (e3.match_length = e3.lookahead);
                  }
                  if (e3.match_length >= x ? (r3 = u._tr_tally(e3, 1, e3.match_length - x), e3.lookahead -= e3.match_length, e3.strstart += e3.match_length, e3.match_length = 0) : (r3 = u._tr_tally(e3, 0, e3.window[e3.strstart]), e3.lookahead--, e3.strstart++), r3 && (N(e3, false), 0 === e3.strm.avail_out)) return A;
                }
                return e3.insert = 0, t3 === f ? (N(e3, true), 0 === e3.strm.avail_out ? O : B) : e3.last_lit && (N(e3, false), 0 === e3.strm.avail_out) ? A : I;
              })(n2, t2) : h[n2.level].func(n2, t2);
              if (o2 !== O && o2 !== B || (n2.status = 666), o2 === A || o2 === O) return 0 === e2.avail_out && (n2.last_flush = -1), m;
              if (o2 === I && (1 === t2 ? u._tr_align(n2) : 5 !== t2 && (u._tr_stored_block(n2, 0, 0, false), 3 === t2 && (D(n2.head), 0 === n2.lookahead && (n2.strstart = 0, n2.block_start = 0, n2.insert = 0))), F(e2), 0 === e2.avail_out)) return n2.last_flush = -1, m;
            }
            return t2 !== f ? m : n2.wrap <= 0 ? 1 : (2 === n2.wrap ? (U(n2, 255 & e2.adler), U(n2, e2.adler >> 8 & 255), U(n2, e2.adler >> 16 & 255), U(n2, e2.adler >> 24 & 255), U(n2, 255 & e2.total_in), U(n2, e2.total_in >> 8 & 255), U(n2, e2.total_in >> 16 & 255), U(n2, e2.total_in >> 24 & 255)) : (P(n2, e2.adler >>> 16), P(n2, 65535 & e2.adler)), F(e2), 0 < n2.wrap && (n2.wrap = -n2.wrap), 0 !== n2.pending ? m : 1);
          }, r.deflateEnd = function(e2) {
            var t2;
            return e2 && e2.state ? (t2 = e2.state.status) !== C && 69 !== t2 && 73 !== t2 && 91 !== t2 && 103 !== t2 && t2 !== E && 666 !== t2 ? R(e2, _) : (e2.state = null, t2 === E ? R(e2, -3) : m) : _;
          }, r.deflateSetDictionary = function(e2, t2) {
            var r2, n2, i2, s2, a2, o2, h2, u2, l2 = t2.length;
            if (!e2 || !e2.state) return _;
            if (2 === (s2 = (r2 = e2.state).wrap) || 1 === s2 && r2.status !== C || r2.lookahead) return _;
            for (1 === s2 && (e2.adler = d(e2.adler, t2, l2, 0)), r2.wrap = 0, l2 >= r2.w_size && (0 === s2 && (D(r2.head), r2.strstart = 0, r2.block_start = 0, r2.insert = 0), u2 = new c.Buf8(r2.w_size), c.arraySet(u2, t2, l2 - r2.w_size, r2.w_size, 0), t2 = u2, l2 = r2.w_size), a2 = e2.avail_in, o2 = e2.next_in, h2 = e2.input, e2.avail_in = l2, e2.next_in = 0, e2.input = t2, j(r2); r2.lookahead >= x; ) {
              for (n2 = r2.strstart, i2 = r2.lookahead - (x - 1); r2.ins_h = (r2.ins_h << r2.hash_shift ^ r2.window[n2 + x - 1]) & r2.hash_mask, r2.prev[n2 & r2.w_mask] = r2.head[r2.ins_h], r2.head[r2.ins_h] = n2, n2++, --i2; ) ;
              r2.strstart = n2, r2.lookahead = x - 1, j(r2);
            }
            return r2.strstart += r2.lookahead, r2.block_start = r2.strstart, r2.insert = r2.lookahead, r2.lookahead = 0, r2.match_length = r2.prev_length = x - 1, r2.match_available = 0, e2.next_in = o2, e2.input = h2, e2.avail_in = a2, r2.wrap = s2, m;
          }, r.deflateInfo = "pako deflate (from Nodeca project)";
        }, { "../utils/common": 41, "./adler32": 43, "./crc32": 45, "./messages": 51, "./trees": 52 }], 47: [function(e, t, r) {
          "use strict";
          t.exports = function() {
            this.text = 0, this.time = 0, this.xflags = 0, this.os = 0, this.extra = null, this.extra_len = 0, this.name = "", this.comment = "", this.hcrc = 0, this.done = false;
          };
        }, {}], 48: [function(e, t, r) {
          "use strict";
          t.exports = function(e2, t2) {
            var r2, n, i, s, a, o, h, u, l, f, c, d, p, m, _, g, b, v, y, w, k, x, S, z, C;
            r2 = e2.state, n = e2.next_in, z = e2.input, i = n + (e2.avail_in - 5), s = e2.next_out, C = e2.output, a = s - (t2 - e2.avail_out), o = s + (e2.avail_out - 257), h = r2.dmax, u = r2.wsize, l = r2.whave, f = r2.wnext, c = r2.window, d = r2.hold, p = r2.bits, m = r2.lencode, _ = r2.distcode, g = (1 << r2.lenbits) - 1, b = (1 << r2.distbits) - 1;
            e: do {
              p < 15 && (d += z[n++] << p, p += 8, d += z[n++] << p, p += 8), v = m[d & g];
              t: for (; ; ) {
                if (d >>>= y = v >>> 24, p -= y, 0 === (y = v >>> 16 & 255)) C[s++] = 65535 & v;
                else {
                  if (!(16 & y)) {
                    if (0 == (64 & y)) {
                      v = m[(65535 & v) + (d & (1 << y) - 1)];
                      continue t;
                    }
                    if (32 & y) {
                      r2.mode = 12;
                      break e;
                    }
                    e2.msg = "invalid literal/length code", r2.mode = 30;
                    break e;
                  }
                  w = 65535 & v, (y &= 15) && (p < y && (d += z[n++] << p, p += 8), w += d & (1 << y) - 1, d >>>= y, p -= y), p < 15 && (d += z[n++] << p, p += 8, d += z[n++] << p, p += 8), v = _[d & b];
                  r: for (; ; ) {
                    if (d >>>= y = v >>> 24, p -= y, !(16 & (y = v >>> 16 & 255))) {
                      if (0 == (64 & y)) {
                        v = _[(65535 & v) + (d & (1 << y) - 1)];
                        continue r;
                      }
                      e2.msg = "invalid distance code", r2.mode = 30;
                      break e;
                    }
                    if (k = 65535 & v, p < (y &= 15) && (d += z[n++] << p, (p += 8) < y && (d += z[n++] << p, p += 8)), h < (k += d & (1 << y) - 1)) {
                      e2.msg = "invalid distance too far back", r2.mode = 30;
                      break e;
                    }
                    if (d >>>= y, p -= y, (y = s - a) < k) {
                      if (l < (y = k - y) && r2.sane) {
                        e2.msg = "invalid distance too far back", r2.mode = 30;
                        break e;
                      }
                      if (S = c, (x = 0) === f) {
                        if (x += u - y, y < w) {
                          for (w -= y; C[s++] = c[x++], --y; ) ;
                          x = s - k, S = C;
                        }
                      } else if (f < y) {
                        if (x += u + f - y, (y -= f) < w) {
                          for (w -= y; C[s++] = c[x++], --y; ) ;
                          if (x = 0, f < w) {
                            for (w -= y = f; C[s++] = c[x++], --y; ) ;
                            x = s - k, S = C;
                          }
                        }
                      } else if (x += f - y, y < w) {
                        for (w -= y; C[s++] = c[x++], --y; ) ;
                        x = s - k, S = C;
                      }
                      for (; 2 < w; ) C[s++] = S[x++], C[s++] = S[x++], C[s++] = S[x++], w -= 3;
                      w && (C[s++] = S[x++], 1 < w && (C[s++] = S[x++]));
                    } else {
                      for (x = s - k; C[s++] = C[x++], C[s++] = C[x++], C[s++] = C[x++], 2 < (w -= 3); ) ;
                      w && (C[s++] = C[x++], 1 < w && (C[s++] = C[x++]));
                    }
                    break;
                  }
                }
                break;
              }
            } while (n < i && s < o);
            n -= w = p >> 3, d &= (1 << (p -= w << 3)) - 1, e2.next_in = n, e2.next_out = s, e2.avail_in = n < i ? i - n + 5 : 5 - (n - i), e2.avail_out = s < o ? o - s + 257 : 257 - (s - o), r2.hold = d, r2.bits = p;
          };
        }, {}], 49: [function(e, t, r) {
          "use strict";
          var I = e("../utils/common"), O = e("./adler32"), B = e("./crc32"), R = e("./inffast"), T = e("./inftrees"), D = 1, F = 2, N = 0, U = -2, P = 1, n = 852, i = 592;
          function L(e2) {
            return (e2 >>> 24 & 255) + (e2 >>> 8 & 65280) + ((65280 & e2) << 8) + ((255 & e2) << 24);
          }
          function s() {
            this.mode = 0, this.last = false, this.wrap = 0, this.havedict = false, this.flags = 0, this.dmax = 0, this.check = 0, this.total = 0, this.head = null, this.wbits = 0, this.wsize = 0, this.whave = 0, this.wnext = 0, this.window = null, this.hold = 0, this.bits = 0, this.length = 0, this.offset = 0, this.extra = 0, this.lencode = null, this.distcode = null, this.lenbits = 0, this.distbits = 0, this.ncode = 0, this.nlen = 0, this.ndist = 0, this.have = 0, this.next = null, this.lens = new I.Buf16(320), this.work = new I.Buf16(288), this.lendyn = null, this.distdyn = null, this.sane = 0, this.back = 0, this.was = 0;
          }
          function a(e2) {
            var t2;
            return e2 && e2.state ? (t2 = e2.state, e2.total_in = e2.total_out = t2.total = 0, e2.msg = "", t2.wrap && (e2.adler = 1 & t2.wrap), t2.mode = P, t2.last = 0, t2.havedict = 0, t2.dmax = 32768, t2.head = null, t2.hold = 0, t2.bits = 0, t2.lencode = t2.lendyn = new I.Buf32(n), t2.distcode = t2.distdyn = new I.Buf32(i), t2.sane = 1, t2.back = -1, N) : U;
          }
          function o(e2) {
            var t2;
            return e2 && e2.state ? ((t2 = e2.state).wsize = 0, t2.whave = 0, t2.wnext = 0, a(e2)) : U;
          }
          function h(e2, t2) {
            var r2, n2;
            return e2 && e2.state ? (n2 = e2.state, t2 < 0 ? (r2 = 0, t2 = -t2) : (r2 = 1 + (t2 >> 4), t2 < 48 && (t2 &= 15)), t2 && (t2 < 8 || 15 < t2) ? U : (null !== n2.window && n2.wbits !== t2 && (n2.window = null), n2.wrap = r2, n2.wbits = t2, o(e2))) : U;
          }
          function u(e2, t2) {
            var r2, n2;
            return e2 ? (n2 = new s(), (e2.state = n2).window = null, (r2 = h(e2, t2)) !== N && (e2.state = null), r2) : U;
          }
          var l, f, c = true;
          function j(e2) {
            if (c) {
              var t2;
              for (l = new I.Buf32(512), f = new I.Buf32(32), t2 = 0; t2 < 144; ) e2.lens[t2++] = 8;
              for (; t2 < 256; ) e2.lens[t2++] = 9;
              for (; t2 < 280; ) e2.lens[t2++] = 7;
              for (; t2 < 288; ) e2.lens[t2++] = 8;
              for (T(D, e2.lens, 0, 288, l, 0, e2.work, { bits: 9 }), t2 = 0; t2 < 32; ) e2.lens[t2++] = 5;
              T(F, e2.lens, 0, 32, f, 0, e2.work, { bits: 5 }), c = false;
            }
            e2.lencode = l, e2.lenbits = 9, e2.distcode = f, e2.distbits = 5;
          }
          function Z(e2, t2, r2, n2) {
            var i2, s2 = e2.state;
            return null === s2.window && (s2.wsize = 1 << s2.wbits, s2.wnext = 0, s2.whave = 0, s2.window = new I.Buf8(s2.wsize)), n2 >= s2.wsize ? (I.arraySet(s2.window, t2, r2 - s2.wsize, s2.wsize, 0), s2.wnext = 0, s2.whave = s2.wsize) : (n2 < (i2 = s2.wsize - s2.wnext) && (i2 = n2), I.arraySet(s2.window, t2, r2 - n2, i2, s2.wnext), (n2 -= i2) ? (I.arraySet(s2.window, t2, r2 - n2, n2, 0), s2.wnext = n2, s2.whave = s2.wsize) : (s2.wnext += i2, s2.wnext === s2.wsize && (s2.wnext = 0), s2.whave < s2.wsize && (s2.whave += i2))), 0;
          }
          r.inflateReset = o, r.inflateReset2 = h, r.inflateResetKeep = a, r.inflateInit = function(e2) {
            return u(e2, 15);
          }, r.inflateInit2 = u, r.inflate = function(e2, t2) {
            var r2, n2, i2, s2, a2, o2, h2, u2, l2, f2, c2, d, p, m, _, g, b, v, y, w, k, x, S, z, C = 0, E = new I.Buf8(4), A = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
            if (!e2 || !e2.state || !e2.output || !e2.input && 0 !== e2.avail_in) return U;
            12 === (r2 = e2.state).mode && (r2.mode = 13), a2 = e2.next_out, i2 = e2.output, h2 = e2.avail_out, s2 = e2.next_in, n2 = e2.input, o2 = e2.avail_in, u2 = r2.hold, l2 = r2.bits, f2 = o2, c2 = h2, x = N;
            e: for (; ; ) switch (r2.mode) {
              case P:
                if (0 === r2.wrap) {
                  r2.mode = 13;
                  break;
                }
                for (; l2 < 16; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                if (2 & r2.wrap && 35615 === u2) {
                  E[r2.check = 0] = 255 & u2, E[1] = u2 >>> 8 & 255, r2.check = B(r2.check, E, 2, 0), l2 = u2 = 0, r2.mode = 2;
                  break;
                }
                if (r2.flags = 0, r2.head && (r2.head.done = false), !(1 & r2.wrap) || (((255 & u2) << 8) + (u2 >> 8)) % 31) {
                  e2.msg = "incorrect header check", r2.mode = 30;
                  break;
                }
                if (8 != (15 & u2)) {
                  e2.msg = "unknown compression method", r2.mode = 30;
                  break;
                }
                if (l2 -= 4, k = 8 + (15 & (u2 >>>= 4)), 0 === r2.wbits) r2.wbits = k;
                else if (k > r2.wbits) {
                  e2.msg = "invalid window size", r2.mode = 30;
                  break;
                }
                r2.dmax = 1 << k, e2.adler = r2.check = 1, r2.mode = 512 & u2 ? 10 : 12, l2 = u2 = 0;
                break;
              case 2:
                for (; l2 < 16; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                if (r2.flags = u2, 8 != (255 & r2.flags)) {
                  e2.msg = "unknown compression method", r2.mode = 30;
                  break;
                }
                if (57344 & r2.flags) {
                  e2.msg = "unknown header flags set", r2.mode = 30;
                  break;
                }
                r2.head && (r2.head.text = u2 >> 8 & 1), 512 & r2.flags && (E[0] = 255 & u2, E[1] = u2 >>> 8 & 255, r2.check = B(r2.check, E, 2, 0)), l2 = u2 = 0, r2.mode = 3;
              case 3:
                for (; l2 < 32; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                r2.head && (r2.head.time = u2), 512 & r2.flags && (E[0] = 255 & u2, E[1] = u2 >>> 8 & 255, E[2] = u2 >>> 16 & 255, E[3] = u2 >>> 24 & 255, r2.check = B(r2.check, E, 4, 0)), l2 = u2 = 0, r2.mode = 4;
              case 4:
                for (; l2 < 16; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                r2.head && (r2.head.xflags = 255 & u2, r2.head.os = u2 >> 8), 512 & r2.flags && (E[0] = 255 & u2, E[1] = u2 >>> 8 & 255, r2.check = B(r2.check, E, 2, 0)), l2 = u2 = 0, r2.mode = 5;
              case 5:
                if (1024 & r2.flags) {
                  for (; l2 < 16; ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  r2.length = u2, r2.head && (r2.head.extra_len = u2), 512 & r2.flags && (E[0] = 255 & u2, E[1] = u2 >>> 8 & 255, r2.check = B(r2.check, E, 2, 0)), l2 = u2 = 0;
                } else r2.head && (r2.head.extra = null);
                r2.mode = 6;
              case 6:
                if (1024 & r2.flags && (o2 < (d = r2.length) && (d = o2), d && (r2.head && (k = r2.head.extra_len - r2.length, r2.head.extra || (r2.head.extra = new Array(r2.head.extra_len)), I.arraySet(r2.head.extra, n2, s2, d, k)), 512 & r2.flags && (r2.check = B(r2.check, n2, d, s2)), o2 -= d, s2 += d, r2.length -= d), r2.length)) break e;
                r2.length = 0, r2.mode = 7;
              case 7:
                if (2048 & r2.flags) {
                  if (0 === o2) break e;
                  for (d = 0; k = n2[s2 + d++], r2.head && k && r2.length < 65536 && (r2.head.name += String.fromCharCode(k)), k && d < o2; ) ;
                  if (512 & r2.flags && (r2.check = B(r2.check, n2, d, s2)), o2 -= d, s2 += d, k) break e;
                } else r2.head && (r2.head.name = null);
                r2.length = 0, r2.mode = 8;
              case 8:
                if (4096 & r2.flags) {
                  if (0 === o2) break e;
                  for (d = 0; k = n2[s2 + d++], r2.head && k && r2.length < 65536 && (r2.head.comment += String.fromCharCode(k)), k && d < o2; ) ;
                  if (512 & r2.flags && (r2.check = B(r2.check, n2, d, s2)), o2 -= d, s2 += d, k) break e;
                } else r2.head && (r2.head.comment = null);
                r2.mode = 9;
              case 9:
                if (512 & r2.flags) {
                  for (; l2 < 16; ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  if (u2 !== (65535 & r2.check)) {
                    e2.msg = "header crc mismatch", r2.mode = 30;
                    break;
                  }
                  l2 = u2 = 0;
                }
                r2.head && (r2.head.hcrc = r2.flags >> 9 & 1, r2.head.done = true), e2.adler = r2.check = 0, r2.mode = 12;
                break;
              case 10:
                for (; l2 < 32; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                e2.adler = r2.check = L(u2), l2 = u2 = 0, r2.mode = 11;
              case 11:
                if (0 === r2.havedict) return e2.next_out = a2, e2.avail_out = h2, e2.next_in = s2, e2.avail_in = o2, r2.hold = u2, r2.bits = l2, 2;
                e2.adler = r2.check = 1, r2.mode = 12;
              case 12:
                if (5 === t2 || 6 === t2) break e;
              case 13:
                if (r2.last) {
                  u2 >>>= 7 & l2, l2 -= 7 & l2, r2.mode = 27;
                  break;
                }
                for (; l2 < 3; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                switch (r2.last = 1 & u2, l2 -= 1, 3 & (u2 >>>= 1)) {
                  case 0:
                    r2.mode = 14;
                    break;
                  case 1:
                    if (j(r2), r2.mode = 20, 6 !== t2) break;
                    u2 >>>= 2, l2 -= 2;
                    break e;
                  case 2:
                    r2.mode = 17;
                    break;
                  case 3:
                    e2.msg = "invalid block type", r2.mode = 30;
                }
                u2 >>>= 2, l2 -= 2;
                break;
              case 14:
                for (u2 >>>= 7 & l2, l2 -= 7 & l2; l2 < 32; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                if ((65535 & u2) != (u2 >>> 16 ^ 65535)) {
                  e2.msg = "invalid stored block lengths", r2.mode = 30;
                  break;
                }
                if (r2.length = 65535 & u2, l2 = u2 = 0, r2.mode = 15, 6 === t2) break e;
              case 15:
                r2.mode = 16;
              case 16:
                if (d = r2.length) {
                  if (o2 < d && (d = o2), h2 < d && (d = h2), 0 === d) break e;
                  I.arraySet(i2, n2, s2, d, a2), o2 -= d, s2 += d, h2 -= d, a2 += d, r2.length -= d;
                  break;
                }
                r2.mode = 12;
                break;
              case 17:
                for (; l2 < 14; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                if (r2.nlen = 257 + (31 & u2), u2 >>>= 5, l2 -= 5, r2.ndist = 1 + (31 & u2), u2 >>>= 5, l2 -= 5, r2.ncode = 4 + (15 & u2), u2 >>>= 4, l2 -= 4, 286 < r2.nlen || 30 < r2.ndist) {
                  e2.msg = "too many length or distance symbols", r2.mode = 30;
                  break;
                }
                r2.have = 0, r2.mode = 18;
              case 18:
                for (; r2.have < r2.ncode; ) {
                  for (; l2 < 3; ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  r2.lens[A[r2.have++]] = 7 & u2, u2 >>>= 3, l2 -= 3;
                }
                for (; r2.have < 19; ) r2.lens[A[r2.have++]] = 0;
                if (r2.lencode = r2.lendyn, r2.lenbits = 7, S = { bits: r2.lenbits }, x = T(0, r2.lens, 0, 19, r2.lencode, 0, r2.work, S), r2.lenbits = S.bits, x) {
                  e2.msg = "invalid code lengths set", r2.mode = 30;
                  break;
                }
                r2.have = 0, r2.mode = 19;
              case 19:
                for (; r2.have < r2.nlen + r2.ndist; ) {
                  for (; g = (C = r2.lencode[u2 & (1 << r2.lenbits) - 1]) >>> 16 & 255, b = 65535 & C, !((_ = C >>> 24) <= l2); ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  if (b < 16) u2 >>>= _, l2 -= _, r2.lens[r2.have++] = b;
                  else {
                    if (16 === b) {
                      for (z = _ + 2; l2 < z; ) {
                        if (0 === o2) break e;
                        o2--, u2 += n2[s2++] << l2, l2 += 8;
                      }
                      if (u2 >>>= _, l2 -= _, 0 === r2.have) {
                        e2.msg = "invalid bit length repeat", r2.mode = 30;
                        break;
                      }
                      k = r2.lens[r2.have - 1], d = 3 + (3 & u2), u2 >>>= 2, l2 -= 2;
                    } else if (17 === b) {
                      for (z = _ + 3; l2 < z; ) {
                        if (0 === o2) break e;
                        o2--, u2 += n2[s2++] << l2, l2 += 8;
                      }
                      l2 -= _, k = 0, d = 3 + (7 & (u2 >>>= _)), u2 >>>= 3, l2 -= 3;
                    } else {
                      for (z = _ + 7; l2 < z; ) {
                        if (0 === o2) break e;
                        o2--, u2 += n2[s2++] << l2, l2 += 8;
                      }
                      l2 -= _, k = 0, d = 11 + (127 & (u2 >>>= _)), u2 >>>= 7, l2 -= 7;
                    }
                    if (r2.have + d > r2.nlen + r2.ndist) {
                      e2.msg = "invalid bit length repeat", r2.mode = 30;
                      break;
                    }
                    for (; d--; ) r2.lens[r2.have++] = k;
                  }
                }
                if (30 === r2.mode) break;
                if (0 === r2.lens[256]) {
                  e2.msg = "invalid code -- missing end-of-block", r2.mode = 30;
                  break;
                }
                if (r2.lenbits = 9, S = { bits: r2.lenbits }, x = T(D, r2.lens, 0, r2.nlen, r2.lencode, 0, r2.work, S), r2.lenbits = S.bits, x) {
                  e2.msg = "invalid literal/lengths set", r2.mode = 30;
                  break;
                }
                if (r2.distbits = 6, r2.distcode = r2.distdyn, S = { bits: r2.distbits }, x = T(F, r2.lens, r2.nlen, r2.ndist, r2.distcode, 0, r2.work, S), r2.distbits = S.bits, x) {
                  e2.msg = "invalid distances set", r2.mode = 30;
                  break;
                }
                if (r2.mode = 20, 6 === t2) break e;
              case 20:
                r2.mode = 21;
              case 21:
                if (6 <= o2 && 258 <= h2) {
                  e2.next_out = a2, e2.avail_out = h2, e2.next_in = s2, e2.avail_in = o2, r2.hold = u2, r2.bits = l2, R(e2, c2), a2 = e2.next_out, i2 = e2.output, h2 = e2.avail_out, s2 = e2.next_in, n2 = e2.input, o2 = e2.avail_in, u2 = r2.hold, l2 = r2.bits, 12 === r2.mode && (r2.back = -1);
                  break;
                }
                for (r2.back = 0; g = (C = r2.lencode[u2 & (1 << r2.lenbits) - 1]) >>> 16 & 255, b = 65535 & C, !((_ = C >>> 24) <= l2); ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                if (g && 0 == (240 & g)) {
                  for (v = _, y = g, w = b; g = (C = r2.lencode[w + ((u2 & (1 << v + y) - 1) >> v)]) >>> 16 & 255, b = 65535 & C, !(v + (_ = C >>> 24) <= l2); ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  u2 >>>= v, l2 -= v, r2.back += v;
                }
                if (u2 >>>= _, l2 -= _, r2.back += _, r2.length = b, 0 === g) {
                  r2.mode = 26;
                  break;
                }
                if (32 & g) {
                  r2.back = -1, r2.mode = 12;
                  break;
                }
                if (64 & g) {
                  e2.msg = "invalid literal/length code", r2.mode = 30;
                  break;
                }
                r2.extra = 15 & g, r2.mode = 22;
              case 22:
                if (r2.extra) {
                  for (z = r2.extra; l2 < z; ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  r2.length += u2 & (1 << r2.extra) - 1, u2 >>>= r2.extra, l2 -= r2.extra, r2.back += r2.extra;
                }
                r2.was = r2.length, r2.mode = 23;
              case 23:
                for (; g = (C = r2.distcode[u2 & (1 << r2.distbits) - 1]) >>> 16 & 255, b = 65535 & C, !((_ = C >>> 24) <= l2); ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                if (0 == (240 & g)) {
                  for (v = _, y = g, w = b; g = (C = r2.distcode[w + ((u2 & (1 << v + y) - 1) >> v)]) >>> 16 & 255, b = 65535 & C, !(v + (_ = C >>> 24) <= l2); ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  u2 >>>= v, l2 -= v, r2.back += v;
                }
                if (u2 >>>= _, l2 -= _, r2.back += _, 64 & g) {
                  e2.msg = "invalid distance code", r2.mode = 30;
                  break;
                }
                r2.offset = b, r2.extra = 15 & g, r2.mode = 24;
              case 24:
                if (r2.extra) {
                  for (z = r2.extra; l2 < z; ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  r2.offset += u2 & (1 << r2.extra) - 1, u2 >>>= r2.extra, l2 -= r2.extra, r2.back += r2.extra;
                }
                if (r2.offset > r2.dmax) {
                  e2.msg = "invalid distance too far back", r2.mode = 30;
                  break;
                }
                r2.mode = 25;
              case 25:
                if (0 === h2) break e;
                if (d = c2 - h2, r2.offset > d) {
                  if ((d = r2.offset - d) > r2.whave && r2.sane) {
                    e2.msg = "invalid distance too far back", r2.mode = 30;
                    break;
                  }
                  p = d > r2.wnext ? (d -= r2.wnext, r2.wsize - d) : r2.wnext - d, d > r2.length && (d = r2.length), m = r2.window;
                } else m = i2, p = a2 - r2.offset, d = r2.length;
                for (h2 < d && (d = h2), h2 -= d, r2.length -= d; i2[a2++] = m[p++], --d; ) ;
                0 === r2.length && (r2.mode = 21);
                break;
              case 26:
                if (0 === h2) break e;
                i2[a2++] = r2.length, h2--, r2.mode = 21;
                break;
              case 27:
                if (r2.wrap) {
                  for (; l2 < 32; ) {
                    if (0 === o2) break e;
                    o2--, u2 |= n2[s2++] << l2, l2 += 8;
                  }
                  if (c2 -= h2, e2.total_out += c2, r2.total += c2, c2 && (e2.adler = r2.check = r2.flags ? B(r2.check, i2, c2, a2 - c2) : O(r2.check, i2, c2, a2 - c2)), c2 = h2, (r2.flags ? u2 : L(u2)) !== r2.check) {
                    e2.msg = "incorrect data check", r2.mode = 30;
                    break;
                  }
                  l2 = u2 = 0;
                }
                r2.mode = 28;
              case 28:
                if (r2.wrap && r2.flags) {
                  for (; l2 < 32; ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  if (u2 !== (4294967295 & r2.total)) {
                    e2.msg = "incorrect length check", r2.mode = 30;
                    break;
                  }
                  l2 = u2 = 0;
                }
                r2.mode = 29;
              case 29:
                x = 1;
                break e;
              case 30:
                x = -3;
                break e;
              case 31:
                return -4;
              case 32:
              default:
                return U;
            }
            return e2.next_out = a2, e2.avail_out = h2, e2.next_in = s2, e2.avail_in = o2, r2.hold = u2, r2.bits = l2, (r2.wsize || c2 !== e2.avail_out && r2.mode < 30 && (r2.mode < 27 || 4 !== t2)) && Z(e2, e2.output, e2.next_out, c2 - e2.avail_out) ? (r2.mode = 31, -4) : (f2 -= e2.avail_in, c2 -= e2.avail_out, e2.total_in += f2, e2.total_out += c2, r2.total += c2, r2.wrap && c2 && (e2.adler = r2.check = r2.flags ? B(r2.check, i2, c2, e2.next_out - c2) : O(r2.check, i2, c2, e2.next_out - c2)), e2.data_type = r2.bits + (r2.last ? 64 : 0) + (12 === r2.mode ? 128 : 0) + (20 === r2.mode || 15 === r2.mode ? 256 : 0), (0 == f2 && 0 === c2 || 4 === t2) && x === N && (x = -5), x);
          }, r.inflateEnd = function(e2) {
            if (!e2 || !e2.state) return U;
            var t2 = e2.state;
            return t2.window && (t2.window = null), e2.state = null, N;
          }, r.inflateGetHeader = function(e2, t2) {
            var r2;
            return e2 && e2.state ? 0 == (2 & (r2 = e2.state).wrap) ? U : ((r2.head = t2).done = false, N) : U;
          }, r.inflateSetDictionary = function(e2, t2) {
            var r2, n2 = t2.length;
            return e2 && e2.state ? 0 !== (r2 = e2.state).wrap && 11 !== r2.mode ? U : 11 === r2.mode && O(1, t2, n2, 0) !== r2.check ? -3 : Z(e2, t2, n2, n2) ? (r2.mode = 31, -4) : (r2.havedict = 1, N) : U;
          }, r.inflateInfo = "pako inflate (from Nodeca project)";
        }, { "../utils/common": 41, "./adler32": 43, "./crc32": 45, "./inffast": 48, "./inftrees": 50 }], 50: [function(e, t, r) {
          "use strict";
          var D = e("../utils/common"), F = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258, 0, 0], N = [16, 16, 16, 16, 16, 16, 16, 16, 17, 17, 17, 17, 18, 18, 18, 18, 19, 19, 19, 19, 20, 20, 20, 20, 21, 21, 21, 21, 16, 72, 78], U = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577, 0, 0], P = [16, 16, 16, 16, 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 22, 23, 23, 24, 24, 25, 25, 26, 26, 27, 27, 28, 28, 29, 29, 64, 64];
          t.exports = function(e2, t2, r2, n, i, s, a, o) {
            var h, u, l, f, c, d, p, m, _, g = o.bits, b = 0, v = 0, y = 0, w = 0, k = 0, x = 0, S = 0, z = 0, C = 0, E = 0, A = null, I = 0, O = new D.Buf16(16), B = new D.Buf16(16), R = null, T = 0;
            for (b = 0; b <= 15; b++) O[b] = 0;
            for (v = 0; v < n; v++) O[t2[r2 + v]]++;
            for (k = g, w = 15; 1 <= w && 0 === O[w]; w--) ;
            if (w < k && (k = w), 0 === w) return i[s++] = 20971520, i[s++] = 20971520, o.bits = 1, 0;
            for (y = 1; y < w && 0 === O[y]; y++) ;
            for (k < y && (k = y), b = z = 1; b <= 15; b++) if (z <<= 1, (z -= O[b]) < 0) return -1;
            if (0 < z && (0 === e2 || 1 !== w)) return -1;
            for (B[1] = 0, b = 1; b < 15; b++) B[b + 1] = B[b] + O[b];
            for (v = 0; v < n; v++) 0 !== t2[r2 + v] && (a[B[t2[r2 + v]]++] = v);
            if (d = 0 === e2 ? (A = R = a, 19) : 1 === e2 ? (A = F, I -= 257, R = N, T -= 257, 256) : (A = U, R = P, -1), b = y, c = s, S = v = E = 0, l = -1, f = (C = 1 << (x = k)) - 1, 1 === e2 && 852 < C || 2 === e2 && 592 < C) return 1;
            for (; ; ) {
              for (p = b - S, _ = a[v] < d ? (m = 0, a[v]) : a[v] > d ? (m = R[T + a[v]], A[I + a[v]]) : (m = 96, 0), h = 1 << b - S, y = u = 1 << x; i[c + (E >> S) + (u -= h)] = p << 24 | m << 16 | _ | 0, 0 !== u; ) ;
              for (h = 1 << b - 1; E & h; ) h >>= 1;
              if (0 !== h ? (E &= h - 1, E += h) : E = 0, v++, 0 == --O[b]) {
                if (b === w) break;
                b = t2[r2 + a[v]];
              }
              if (k < b && (E & f) !== l) {
                for (0 === S && (S = k), c += y, z = 1 << (x = b - S); x + S < w && !((z -= O[x + S]) <= 0); ) x++, z <<= 1;
                if (C += 1 << x, 1 === e2 && 852 < C || 2 === e2 && 592 < C) return 1;
                i[l = E & f] = k << 24 | x << 16 | c - s | 0;
              }
            }
            return 0 !== E && (i[c + E] = b - S << 24 | 64 << 16 | 0), o.bits = k, 0;
          };
        }, { "../utils/common": 41 }], 51: [function(e, t, r) {
          "use strict";
          t.exports = { 2: "need dictionary", 1: "stream end", 0: "", "-1": "file error", "-2": "stream error", "-3": "data error", "-4": "insufficient memory", "-5": "buffer error", "-6": "incompatible version" };
        }, {}], 52: [function(e, t, r) {
          "use strict";
          var i = e("../utils/common"), o = 0, h = 1;
          function n(e2) {
            for (var t2 = e2.length; 0 <= --t2; ) e2[t2] = 0;
          }
          var s = 0, a = 29, u = 256, l = u + 1 + a, f = 30, c = 19, _ = 2 * l + 1, g = 15, d = 16, p = 7, m = 256, b = 16, v = 17, y = 18, w = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0], k = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13], x = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7], S = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15], z = new Array(2 * (l + 2));
          n(z);
          var C = new Array(2 * f);
          n(C);
          var E = new Array(512);
          n(E);
          var A = new Array(256);
          n(A);
          var I = new Array(a);
          n(I);
          var O, B, R, T = new Array(f);
          function D(e2, t2, r2, n2, i2) {
            this.static_tree = e2, this.extra_bits = t2, this.extra_base = r2, this.elems = n2, this.max_length = i2, this.has_stree = e2 && e2.length;
          }
          function F(e2, t2) {
            this.dyn_tree = e2, this.max_code = 0, this.stat_desc = t2;
          }
          function N(e2) {
            return e2 < 256 ? E[e2] : E[256 + (e2 >>> 7)];
          }
          function U(e2, t2) {
            e2.pending_buf[e2.pending++] = 255 & t2, e2.pending_buf[e2.pending++] = t2 >>> 8 & 255;
          }
          function P(e2, t2, r2) {
            e2.bi_valid > d - r2 ? (e2.bi_buf |= t2 << e2.bi_valid & 65535, U(e2, e2.bi_buf), e2.bi_buf = t2 >> d - e2.bi_valid, e2.bi_valid += r2 - d) : (e2.bi_buf |= t2 << e2.bi_valid & 65535, e2.bi_valid += r2);
          }
          function L(e2, t2, r2) {
            P(e2, r2[2 * t2], r2[2 * t2 + 1]);
          }
          function j(e2, t2) {
            for (var r2 = 0; r2 |= 1 & e2, e2 >>>= 1, r2 <<= 1, 0 < --t2; ) ;
            return r2 >>> 1;
          }
          function Z(e2, t2, r2) {
            var n2, i2, s2 = new Array(g + 1), a2 = 0;
            for (n2 = 1; n2 <= g; n2++) s2[n2] = a2 = a2 + r2[n2 - 1] << 1;
            for (i2 = 0; i2 <= t2; i2++) {
              var o2 = e2[2 * i2 + 1];
              0 !== o2 && (e2[2 * i2] = j(s2[o2]++, o2));
            }
          }
          function W(e2) {
            var t2;
            for (t2 = 0; t2 < l; t2++) e2.dyn_ltree[2 * t2] = 0;
            for (t2 = 0; t2 < f; t2++) e2.dyn_dtree[2 * t2] = 0;
            for (t2 = 0; t2 < c; t2++) e2.bl_tree[2 * t2] = 0;
            e2.dyn_ltree[2 * m] = 1, e2.opt_len = e2.static_len = 0, e2.last_lit = e2.matches = 0;
          }
          function M(e2) {
            8 < e2.bi_valid ? U(e2, e2.bi_buf) : 0 < e2.bi_valid && (e2.pending_buf[e2.pending++] = e2.bi_buf), e2.bi_buf = 0, e2.bi_valid = 0;
          }
          function H(e2, t2, r2, n2) {
            var i2 = 2 * t2, s2 = 2 * r2;
            return e2[i2] < e2[s2] || e2[i2] === e2[s2] && n2[t2] <= n2[r2];
          }
          function G(e2, t2, r2) {
            for (var n2 = e2.heap[r2], i2 = r2 << 1; i2 <= e2.heap_len && (i2 < e2.heap_len && H(t2, e2.heap[i2 + 1], e2.heap[i2], e2.depth) && i2++, !H(t2, n2, e2.heap[i2], e2.depth)); ) e2.heap[r2] = e2.heap[i2], r2 = i2, i2 <<= 1;
            e2.heap[r2] = n2;
          }
          function K(e2, t2, r2) {
            var n2, i2, s2, a2, o2 = 0;
            if (0 !== e2.last_lit) for (; n2 = e2.pending_buf[e2.d_buf + 2 * o2] << 8 | e2.pending_buf[e2.d_buf + 2 * o2 + 1], i2 = e2.pending_buf[e2.l_buf + o2], o2++, 0 === n2 ? L(e2, i2, t2) : (L(e2, (s2 = A[i2]) + u + 1, t2), 0 !== (a2 = w[s2]) && P(e2, i2 -= I[s2], a2), L(e2, s2 = N(--n2), r2), 0 !== (a2 = k[s2]) && P(e2, n2 -= T[s2], a2)), o2 < e2.last_lit; ) ;
            L(e2, m, t2);
          }
          function Y(e2, t2) {
            var r2, n2, i2, s2 = t2.dyn_tree, a2 = t2.stat_desc.static_tree, o2 = t2.stat_desc.has_stree, h2 = t2.stat_desc.elems, u2 = -1;
            for (e2.heap_len = 0, e2.heap_max = _, r2 = 0; r2 < h2; r2++) 0 !== s2[2 * r2] ? (e2.heap[++e2.heap_len] = u2 = r2, e2.depth[r2] = 0) : s2[2 * r2 + 1] = 0;
            for (; e2.heap_len < 2; ) s2[2 * (i2 = e2.heap[++e2.heap_len] = u2 < 2 ? ++u2 : 0)] = 1, e2.depth[i2] = 0, e2.opt_len--, o2 && (e2.static_len -= a2[2 * i2 + 1]);
            for (t2.max_code = u2, r2 = e2.heap_len >> 1; 1 <= r2; r2--) G(e2, s2, r2);
            for (i2 = h2; r2 = e2.heap[1], e2.heap[1] = e2.heap[e2.heap_len--], G(e2, s2, 1), n2 = e2.heap[1], e2.heap[--e2.heap_max] = r2, e2.heap[--e2.heap_max] = n2, s2[2 * i2] = s2[2 * r2] + s2[2 * n2], e2.depth[i2] = (e2.depth[r2] >= e2.depth[n2] ? e2.depth[r2] : e2.depth[n2]) + 1, s2[2 * r2 + 1] = s2[2 * n2 + 1] = i2, e2.heap[1] = i2++, G(e2, s2, 1), 2 <= e2.heap_len; ) ;
            e2.heap[--e2.heap_max] = e2.heap[1], (function(e3, t3) {
              var r3, n3, i3, s3, a3, o3, h3 = t3.dyn_tree, u3 = t3.max_code, l2 = t3.stat_desc.static_tree, f2 = t3.stat_desc.has_stree, c2 = t3.stat_desc.extra_bits, d2 = t3.stat_desc.extra_base, p2 = t3.stat_desc.max_length, m2 = 0;
              for (s3 = 0; s3 <= g; s3++) e3.bl_count[s3] = 0;
              for (h3[2 * e3.heap[e3.heap_max] + 1] = 0, r3 = e3.heap_max + 1; r3 < _; r3++) p2 < (s3 = h3[2 * h3[2 * (n3 = e3.heap[r3]) + 1] + 1] + 1) && (s3 = p2, m2++), h3[2 * n3 + 1] = s3, u3 < n3 || (e3.bl_count[s3]++, a3 = 0, d2 <= n3 && (a3 = c2[n3 - d2]), o3 = h3[2 * n3], e3.opt_len += o3 * (s3 + a3), f2 && (e3.static_len += o3 * (l2[2 * n3 + 1] + a3)));
              if (0 !== m2) {
                do {
                  for (s3 = p2 - 1; 0 === e3.bl_count[s3]; ) s3--;
                  e3.bl_count[s3]--, e3.bl_count[s3 + 1] += 2, e3.bl_count[p2]--, m2 -= 2;
                } while (0 < m2);
                for (s3 = p2; 0 !== s3; s3--) for (n3 = e3.bl_count[s3]; 0 !== n3; ) u3 < (i3 = e3.heap[--r3]) || (h3[2 * i3 + 1] !== s3 && (e3.opt_len += (s3 - h3[2 * i3 + 1]) * h3[2 * i3], h3[2 * i3 + 1] = s3), n3--);
              }
            })(e2, t2), Z(s2, u2, e2.bl_count);
          }
          function X(e2, t2, r2) {
            var n2, i2, s2 = -1, a2 = t2[1], o2 = 0, h2 = 7, u2 = 4;
            for (0 === a2 && (h2 = 138, u2 = 3), t2[2 * (r2 + 1) + 1] = 65535, n2 = 0; n2 <= r2; n2++) i2 = a2, a2 = t2[2 * (n2 + 1) + 1], ++o2 < h2 && i2 === a2 || (o2 < u2 ? e2.bl_tree[2 * i2] += o2 : 0 !== i2 ? (i2 !== s2 && e2.bl_tree[2 * i2]++, e2.bl_tree[2 * b]++) : o2 <= 10 ? e2.bl_tree[2 * v]++ : e2.bl_tree[2 * y]++, s2 = i2, u2 = (o2 = 0) === a2 ? (h2 = 138, 3) : i2 === a2 ? (h2 = 6, 3) : (h2 = 7, 4));
          }
          function V(e2, t2, r2) {
            var n2, i2, s2 = -1, a2 = t2[1], o2 = 0, h2 = 7, u2 = 4;
            for (0 === a2 && (h2 = 138, u2 = 3), n2 = 0; n2 <= r2; n2++) if (i2 = a2, a2 = t2[2 * (n2 + 1) + 1], !(++o2 < h2 && i2 === a2)) {
              if (o2 < u2) for (; L(e2, i2, e2.bl_tree), 0 != --o2; ) ;
              else 0 !== i2 ? (i2 !== s2 && (L(e2, i2, e2.bl_tree), o2--), L(e2, b, e2.bl_tree), P(e2, o2 - 3, 2)) : o2 <= 10 ? (L(e2, v, e2.bl_tree), P(e2, o2 - 3, 3)) : (L(e2, y, e2.bl_tree), P(e2, o2 - 11, 7));
              s2 = i2, u2 = (o2 = 0) === a2 ? (h2 = 138, 3) : i2 === a2 ? (h2 = 6, 3) : (h2 = 7, 4);
            }
          }
          n(T);
          var q = false;
          function J(e2, t2, r2, n2) {
            P(e2, (s << 1) + (n2 ? 1 : 0), 3), (function(e3, t3, r3, n3) {
              M(e3), n3 && (U(e3, r3), U(e3, ~r3)), i.arraySet(e3.pending_buf, e3.window, t3, r3, e3.pending), e3.pending += r3;
            })(e2, t2, r2, true);
          }
          r._tr_init = function(e2) {
            q || ((function() {
              var e3, t2, r2, n2, i2, s2 = new Array(g + 1);
              for (n2 = r2 = 0; n2 < a - 1; n2++) for (I[n2] = r2, e3 = 0; e3 < 1 << w[n2]; e3++) A[r2++] = n2;
              for (A[r2 - 1] = n2, n2 = i2 = 0; n2 < 16; n2++) for (T[n2] = i2, e3 = 0; e3 < 1 << k[n2]; e3++) E[i2++] = n2;
              for (i2 >>= 7; n2 < f; n2++) for (T[n2] = i2 << 7, e3 = 0; e3 < 1 << k[n2] - 7; e3++) E[256 + i2++] = n2;
              for (t2 = 0; t2 <= g; t2++) s2[t2] = 0;
              for (e3 = 0; e3 <= 143; ) z[2 * e3 + 1] = 8, e3++, s2[8]++;
              for (; e3 <= 255; ) z[2 * e3 + 1] = 9, e3++, s2[9]++;
              for (; e3 <= 279; ) z[2 * e3 + 1] = 7, e3++, s2[7]++;
              for (; e3 <= 287; ) z[2 * e3 + 1] = 8, e3++, s2[8]++;
              for (Z(z, l + 1, s2), e3 = 0; e3 < f; e3++) C[2 * e3 + 1] = 5, C[2 * e3] = j(e3, 5);
              O = new D(z, w, u + 1, l, g), B = new D(C, k, 0, f, g), R = new D(new Array(0), x, 0, c, p);
            })(), q = true), e2.l_desc = new F(e2.dyn_ltree, O), e2.d_desc = new F(e2.dyn_dtree, B), e2.bl_desc = new F(e2.bl_tree, R), e2.bi_buf = 0, e2.bi_valid = 0, W(e2);
          }, r._tr_stored_block = J, r._tr_flush_block = function(e2, t2, r2, n2) {
            var i2, s2, a2 = 0;
            0 < e2.level ? (2 === e2.strm.data_type && (e2.strm.data_type = (function(e3) {
              var t3, r3 = 4093624447;
              for (t3 = 0; t3 <= 31; t3++, r3 >>>= 1) if (1 & r3 && 0 !== e3.dyn_ltree[2 * t3]) return o;
              if (0 !== e3.dyn_ltree[18] || 0 !== e3.dyn_ltree[20] || 0 !== e3.dyn_ltree[26]) return h;
              for (t3 = 32; t3 < u; t3++) if (0 !== e3.dyn_ltree[2 * t3]) return h;
              return o;
            })(e2)), Y(e2, e2.l_desc), Y(e2, e2.d_desc), a2 = (function(e3) {
              var t3;
              for (X(e3, e3.dyn_ltree, e3.l_desc.max_code), X(e3, e3.dyn_dtree, e3.d_desc.max_code), Y(e3, e3.bl_desc), t3 = c - 1; 3 <= t3 && 0 === e3.bl_tree[2 * S[t3] + 1]; t3--) ;
              return e3.opt_len += 3 * (t3 + 1) + 5 + 5 + 4, t3;
            })(e2), i2 = e2.opt_len + 3 + 7 >>> 3, (s2 = e2.static_len + 3 + 7 >>> 3) <= i2 && (i2 = s2)) : i2 = s2 = r2 + 5, r2 + 4 <= i2 && -1 !== t2 ? J(e2, t2, r2, n2) : 4 === e2.strategy || s2 === i2 ? (P(e2, 2 + (n2 ? 1 : 0), 3), K(e2, z, C)) : (P(e2, 4 + (n2 ? 1 : 0), 3), (function(e3, t3, r3, n3) {
              var i3;
              for (P(e3, t3 - 257, 5), P(e3, r3 - 1, 5), P(e3, n3 - 4, 4), i3 = 0; i3 < n3; i3++) P(e3, e3.bl_tree[2 * S[i3] + 1], 3);
              V(e3, e3.dyn_ltree, t3 - 1), V(e3, e3.dyn_dtree, r3 - 1);
            })(e2, e2.l_desc.max_code + 1, e2.d_desc.max_code + 1, a2 + 1), K(e2, e2.dyn_ltree, e2.dyn_dtree)), W(e2), n2 && M(e2);
          }, r._tr_tally = function(e2, t2, r2) {
            return e2.pending_buf[e2.d_buf + 2 * e2.last_lit] = t2 >>> 8 & 255, e2.pending_buf[e2.d_buf + 2 * e2.last_lit + 1] = 255 & t2, e2.pending_buf[e2.l_buf + e2.last_lit] = 255 & r2, e2.last_lit++, 0 === t2 ? e2.dyn_ltree[2 * r2]++ : (e2.matches++, t2--, e2.dyn_ltree[2 * (A[r2] + u + 1)]++, e2.dyn_dtree[2 * N(t2)]++), e2.last_lit === e2.lit_bufsize - 1;
          }, r._tr_align = function(e2) {
            P(e2, 2, 3), L(e2, m, z), (function(e3) {
              16 === e3.bi_valid ? (U(e3, e3.bi_buf), e3.bi_buf = 0, e3.bi_valid = 0) : 8 <= e3.bi_valid && (e3.pending_buf[e3.pending++] = 255 & e3.bi_buf, e3.bi_buf >>= 8, e3.bi_valid -= 8);
            })(e2);
          };
        }, { "../utils/common": 41 }], 53: [function(e, t, r) {
          "use strict";
          t.exports = function() {
            this.input = null, this.next_in = 0, this.avail_in = 0, this.total_in = 0, this.output = null, this.next_out = 0, this.avail_out = 0, this.total_out = 0, this.msg = "", this.state = null, this.data_type = 2, this.adler = 0;
          };
        }, {}], 54: [function(e, t, r) {
          (function(e2) {
            !(function(r2, n) {
              "use strict";
              if (!r2.setImmediate) {
                var i, s, t2, a, o = 1, h = {}, u = false, l = r2.document, e3 = Object.getPrototypeOf && Object.getPrototypeOf(r2);
                e3 = e3 && e3.setTimeout ? e3 : r2, i = "[object process]" === {}.toString.call(r2.process) ? function(e4) {
                  process.nextTick(function() {
                    c(e4);
                  });
                } : (function() {
                  if (r2.postMessage && !r2.importScripts) {
                    var e4 = true, t3 = r2.onmessage;
                    return r2.onmessage = function() {
                      e4 = false;
                    }, r2.postMessage("", "*"), r2.onmessage = t3, e4;
                  }
                })() ? (a = "setImmediate$" + Math.random() + "$", r2.addEventListener ? r2.addEventListener("message", d, false) : r2.attachEvent("onmessage", d), function(e4) {
                  r2.postMessage(a + e4, "*");
                }) : r2.MessageChannel ? ((t2 = new MessageChannel()).port1.onmessage = function(e4) {
                  c(e4.data);
                }, function(e4) {
                  t2.port2.postMessage(e4);
                }) : l && "onreadystatechange" in l.createElement("script") ? (s = l.documentElement, function(e4) {
                  var t3 = l.createElement("script");
                  t3.onreadystatechange = function() {
                    c(e4), t3.onreadystatechange = null, s.removeChild(t3), t3 = null;
                  }, s.appendChild(t3);
                }) : function(e4) {
                  setTimeout(c, 0, e4);
                }, e3.setImmediate = function(e4) {
                  "function" != typeof e4 && (e4 = new Function("" + e4));
                  for (var t3 = new Array(arguments.length - 1), r3 = 0; r3 < t3.length; r3++) t3[r3] = arguments[r3 + 1];
                  var n2 = { callback: e4, args: t3 };
                  return h[o] = n2, i(o), o++;
                }, e3.clearImmediate = f;
              }
              function f(e4) {
                delete h[e4];
              }
              function c(e4) {
                if (u) setTimeout(c, 0, e4);
                else {
                  var t3 = h[e4];
                  if (t3) {
                    u = true;
                    try {
                      !(function(e5) {
                        var t4 = e5.callback, r3 = e5.args;
                        switch (r3.length) {
                          case 0:
                            t4();
                            break;
                          case 1:
                            t4(r3[0]);
                            break;
                          case 2:
                            t4(r3[0], r3[1]);
                            break;
                          case 3:
                            t4(r3[0], r3[1], r3[2]);
                            break;
                          default:
                            t4.apply(n, r3);
                        }
                      })(t3);
                    } finally {
                      f(e4), u = false;
                    }
                  }
                }
              }
              function d(e4) {
                e4.source === r2 && "string" == typeof e4.data && 0 === e4.data.indexOf(a) && c(+e4.data.slice(a.length));
              }
            })("undefined" == typeof self ? void 0 === e2 ? this : e2 : self);
          }).call(this, "undefined" != typeof global ? global : "undefined" != typeof self ? self : "undefined" != typeof window ? window : {});
        }, {}] }, {}, [10])(10);
      });
    }
  });

  // browser/stub-electron.ts
  var handlers = {};
  var ipcMain = {
    handle(channel, fn) {
      handlers[channel] = fn;
    },
    removeHandler(_channel) {
    }
  };
  var WebContents = class {
    id = "browser";
  };
  var app = {
    whenReady: () => Promise.resolve(),
    getPath: () => ""
  };
  var desktopCapturer = { getSources: () => Promise.resolve([]) };
  var dialog = { showOpenDialog: () => Promise.resolve({ canceled: true, filePaths: [] }) };
  var BrowserWindow = class {
    static getAllWindows() {
      return [];
    }
    loadURL() {
    }
    loadFile() {
    }
    on() {
      return this;
    }
    once() {
      return this;
    }
    webContents = { id: "browser", on() {
    } };
  };
  var webContents = { getAllWebContents: () => [], fromId: () => null };
  var clipboard = { readText: () => "", writeText: () => {
  } };
  var nativeImage = { createFromPath: () => ({ toDataURL: () => "" }), createFromBuffer: () => ({ toDataURL: () => "" }) };
  var session = { defaultSession: { setDisplayMediaRequestHandler() {
  }, webRequest: { onBeforeSendHeaders() {
  } } } };

  // browser/slides-main-browser.ts
  init_stub_node();
  init_stub_node();
  init_stub_node();
  init_stub_node();
  init_stub_node();
  init_stub_node();

  // browser/stub-ai-search.ts
  var gskApiKey = () => "";
  var gskSlideGenerate = async () => ({ ok: false, error: "\u6D4F\u89C8\u5668\u73AF\u5883\u7981\u7528\u4E91\u7AEF\u751F\u6210" });

  // browser/stub-electron-utils.ts
  var configuredDefaultSaveDir = () => "";
  var showOpenDialogWithMemory = async () => ({ canceled: true, filePaths: [] });
  var showSaveDialogWithMemory = async () => ({ canceled: true, filePath: null });

  // ../word-ui/packages_i18n/src/index.ts
  var IS_MAC = (() => {
    const g = globalThis;
    if (g.navigator?.platform) return /mac/i.test(g.navigator.platform);
    return g.process?.platform === "darwin";
  })();
  var uiLang = "zh";
  function getUiLang() {
    return uiLang;
  }

  // ../engine/pptx-engine/index.ts
  var import_jszip3 = __toESM(require_jszip_min());

  // ../engine/pptx-engine/zip.ts
  var import_jszip = __toESM(require_jszip_min());
  init_stub_node();

  // ../../../node_modules/fast-xml-parser/src/util.js
  var nameStartChar = ":A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD";
  var nameChar = nameStartChar + "\\-.\\d\\u00B7\\u0300-\\u036F\\u203F-\\u2040";
  var nameRegexp = "[" + nameStartChar + "][" + nameChar + "]*";
  var regexName = new RegExp("^" + nameRegexp + "$");
  function getAllMatches(string, regex) {
    const matches = [];
    let match = regex.exec(string);
    while (match) {
      const allmatches = [];
      allmatches.startIndex = regex.lastIndex - match[0].length;
      const len = match.length;
      for (let index = 0; index < len; index++) {
        allmatches.push(match[index]);
      }
      matches.push(allmatches);
      match = regex.exec(string);
    }
    return matches;
  }
  var isName = function(string) {
    const match = regexName.exec(string);
    return !(match === null || typeof match === "undefined");
  };
  function isExist(v) {
    return typeof v !== "undefined";
  }
  var DANGEROUS_PROPERTY_NAMES = [
    // '__proto__',
    // 'constructor',
    // 'prototype',
    "hasOwnProperty",
    "toString",
    "valueOf",
    "__defineGetter__",
    "__defineSetter__",
    "__lookupGetter__",
    "__lookupSetter__"
  ];
  var criticalProperties = ["__proto__", "constructor", "prototype"];

  // ../../../node_modules/fast-xml-parser/src/validator.js
  var defaultOptions = {
    allowBooleanAttributes: false,
    //A tag can have attributes without any value
    unpairedTags: []
  };
  function validate(xmlData, options) {
    options = Object.assign({}, defaultOptions, options);
    const tags = [];
    let tagFound = false;
    let reachedRoot = false;
    if (xmlData[0] === "\uFEFF") {
      xmlData = xmlData.substr(1);
    }
    for (let i = 0; i < xmlData.length; i++) {
      if (xmlData[i] === "<" && xmlData[i + 1] === "?") {
        i += 2;
        i = readPI(xmlData, i);
        if (i.err) return i;
      } else if (xmlData[i] === "<") {
        let tagStartPos = i;
        i++;
        if (xmlData[i] === "!") {
          i = readCommentAndCDATA(xmlData, i);
          continue;
        } else {
          let closingTag = false;
          if (xmlData[i] === "/") {
            closingTag = true;
            i++;
          }
          let tagName = "";
          for (; i < xmlData.length && xmlData[i] !== ">" && xmlData[i] !== " " && xmlData[i] !== "	" && xmlData[i] !== "\n" && xmlData[i] !== "\r"; i++) {
            tagName += xmlData[i];
          }
          tagName = tagName.trim();
          if (tagName[tagName.length - 1] === "/") {
            tagName = tagName.substring(0, tagName.length - 1);
            i--;
          }
          if (!validateTagName(tagName)) {
            let msg;
            if (tagName.trim().length === 0) {
              msg = "Invalid space after '<'.";
            } else {
              msg = "Tag '" + tagName + "' is an invalid name.";
            }
            return getErrorObject("InvalidTag", msg, getLineNumberForPosition(xmlData, i));
          }
          const result = readAttributeStr(xmlData, i);
          if (result === false) {
            return getErrorObject("InvalidAttr", "Attributes for '" + tagName + "' have open quote.", getLineNumberForPosition(xmlData, i));
          }
          let attrStr = result.value;
          i = result.index;
          if (attrStr[attrStr.length - 1] === "/") {
            const attrStrStart = i - attrStr.length;
            attrStr = attrStr.substring(0, attrStr.length - 1);
            const isValid = validateAttributeString(attrStr, options);
            if (isValid === true) {
              tagFound = true;
            } else {
              return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, attrStrStart + isValid.err.line));
            }
          } else if (closingTag) {
            if (!result.tagClosed) {
              return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' doesn't have proper closing.", getLineNumberForPosition(xmlData, i));
            } else if (attrStr.trim().length > 0) {
              return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' can't have attributes or invalid starting.", getLineNumberForPosition(xmlData, tagStartPos));
            } else if (tags.length === 0) {
              return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' has not been opened.", getLineNumberForPosition(xmlData, tagStartPos));
            } else {
              const otg = tags.pop();
              if (tagName !== otg.tagName) {
                let openPos = getLineNumberForPosition(xmlData, otg.tagStartPos);
                return getErrorObject(
                  "InvalidTag",
                  "Expected closing tag '" + otg.tagName + "' (opened in line " + openPos.line + ", col " + openPos.col + ") instead of closing tag '" + tagName + "'.",
                  getLineNumberForPosition(xmlData, tagStartPos)
                );
              }
              if (tags.length == 0) {
                reachedRoot = true;
              }
            }
          } else {
            const isValid = validateAttributeString(attrStr, options);
            if (isValid !== true) {
              return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, i - attrStr.length + isValid.err.line));
            }
            if (reachedRoot === true) {
              return getErrorObject("InvalidXml", "Multiple possible root nodes found.", getLineNumberForPosition(xmlData, i));
            } else if (options.unpairedTags.indexOf(tagName) !== -1) {
            } else {
              tags.push({ tagName, tagStartPos });
            }
            tagFound = true;
          }
          for (i++; i < xmlData.length; i++) {
            if (xmlData[i] === "<") {
              if (xmlData[i + 1] === "!") {
                i++;
                i = readCommentAndCDATA(xmlData, i);
                continue;
              } else if (xmlData[i + 1] === "?") {
                i = readPI(xmlData, ++i);
                if (i.err) return i;
              } else {
                break;
              }
            } else if (xmlData[i] === "&") {
              const afterAmp = validateAmpersand(xmlData, i);
              if (afterAmp == -1)
                return getErrorObject("InvalidChar", "char '&' is not expected.", getLineNumberForPosition(xmlData, i));
              i = afterAmp;
            } else {
              if (reachedRoot === true && !isWhiteSpace(xmlData[i])) {
                return getErrorObject("InvalidXml", "Extra text at the end", getLineNumberForPosition(xmlData, i));
              }
            }
          }
          if (xmlData[i] === "<") {
            i--;
          }
        }
      } else {
        if (isWhiteSpace(xmlData[i])) {
          continue;
        }
        return getErrorObject("InvalidChar", "char '" + xmlData[i] + "' is not expected.", getLineNumberForPosition(xmlData, i));
      }
    }
    if (!tagFound) {
      return getErrorObject("InvalidXml", "Start tag expected.", 1);
    } else if (tags.length == 1) {
      return getErrorObject("InvalidTag", "Unclosed tag '" + tags[0].tagName + "'.", getLineNumberForPosition(xmlData, tags[0].tagStartPos));
    } else if (tags.length > 0) {
      return getErrorObject("InvalidXml", "Invalid '" + JSON.stringify(tags.map((t) => t.tagName), null, 4).replace(/\r?\n/g, "") + "' found.", { line: 1, col: 1 });
    }
    return true;
  }
  function isWhiteSpace(char) {
    return char === " " || char === "	" || char === "\n" || char === "\r";
  }
  function readPI(xmlData, i) {
    const start = i;
    for (; i < xmlData.length; i++) {
      if (xmlData[i] == "?" || xmlData[i] == " ") {
        const tagname = xmlData.substr(start, i - start);
        if (i > 5 && tagname === "xml") {
          return getErrorObject("InvalidXml", "XML declaration allowed only at the start of the document.", getLineNumberForPosition(xmlData, i));
        } else if (xmlData[i] == "?" && xmlData[i + 1] == ">") {
          i++;
          break;
        } else {
          continue;
        }
      }
    }
    return i;
  }
  function readCommentAndCDATA(xmlData, i) {
    if (xmlData.length > i + 5 && xmlData[i + 1] === "-" && xmlData[i + 2] === "-") {
      for (i += 3; i < xmlData.length; i++) {
        if (xmlData[i] === "-" && xmlData[i + 1] === "-" && xmlData[i + 2] === ">") {
          i += 2;
          break;
        }
      }
    } else if (xmlData.length > i + 8 && xmlData[i + 1] === "D" && xmlData[i + 2] === "O" && xmlData[i + 3] === "C" && xmlData[i + 4] === "T" && xmlData[i + 5] === "Y" && xmlData[i + 6] === "P" && xmlData[i + 7] === "E") {
      let angleBracketsCount = 1;
      for (i += 8; i < xmlData.length; i++) {
        if (xmlData[i] === "<") {
          angleBracketsCount++;
        } else if (xmlData[i] === ">") {
          angleBracketsCount--;
          if (angleBracketsCount === 0) {
            break;
          }
        }
      }
    } else if (xmlData.length > i + 9 && xmlData[i + 1] === "[" && xmlData[i + 2] === "C" && xmlData[i + 3] === "D" && xmlData[i + 4] === "A" && xmlData[i + 5] === "T" && xmlData[i + 6] === "A" && xmlData[i + 7] === "[") {
      for (i += 8; i < xmlData.length; i++) {
        if (xmlData[i] === "]" && xmlData[i + 1] === "]" && xmlData[i + 2] === ">") {
          i += 2;
          break;
        }
      }
    }
    return i;
  }
  var doubleQuote = '"';
  var singleQuote = "'";
  function readAttributeStr(xmlData, i) {
    let attrStr = "";
    let startChar = "";
    let tagClosed = false;
    for (; i < xmlData.length; i++) {
      if (xmlData[i] === doubleQuote || xmlData[i] === singleQuote) {
        if (startChar === "") {
          startChar = xmlData[i];
        } else if (startChar !== xmlData[i]) {
        } else {
          startChar = "";
        }
      } else if (xmlData[i] === ">") {
        if (startChar === "") {
          tagClosed = true;
          break;
        }
      }
      attrStr += xmlData[i];
    }
    if (startChar !== "") {
      return false;
    }
    return {
      value: attrStr,
      index: i,
      tagClosed
    };
  }
  var validAttrStrRegxp = new RegExp(`(\\s*)([^\\s=]+)(\\s*=)?(\\s*(['"])(([\\s\\S])*?)\\5)?`, "g");
  function validateAttributeString(attrStr, options) {
    const matches = getAllMatches(attrStr, validAttrStrRegxp);
    const attrNames = {};
    for (let i = 0; i < matches.length; i++) {
      if (matches[i][1].length === 0) {
        return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' has no space in starting.", getPositionFromMatch(matches[i]));
      } else if (matches[i][3] !== void 0 && matches[i][4] === void 0) {
        return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' is without value.", getPositionFromMatch(matches[i]));
      } else if (matches[i][3] === void 0 && !options.allowBooleanAttributes) {
        return getErrorObject("InvalidAttr", "boolean attribute '" + matches[i][2] + "' is not allowed.", getPositionFromMatch(matches[i]));
      }
      const attrName = matches[i][2];
      if (!validateAttrName(attrName)) {
        return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is an invalid name.", getPositionFromMatch(matches[i]));
      }
      if (!Object.prototype.hasOwnProperty.call(attrNames, attrName)) {
        attrNames[attrName] = 1;
      } else {
        return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is repeated.", getPositionFromMatch(matches[i]));
      }
    }
    return true;
  }
  function validateNumberAmpersand(xmlData, i) {
    let re = /\d/;
    if (xmlData[i] === "x") {
      i++;
      re = /[\da-fA-F]/;
    }
    for (; i < xmlData.length; i++) {
      if (xmlData[i] === ";")
        return i;
      if (!xmlData[i].match(re))
        break;
    }
    return -1;
  }
  function validateAmpersand(xmlData, i) {
    i++;
    if (xmlData[i] === ";")
      return -1;
    if (xmlData[i] === "#") {
      i++;
      return validateNumberAmpersand(xmlData, i);
    }
    let count = 0;
    for (; i < xmlData.length; i++, count++) {
      if (xmlData[i].match(/\w/) && count < 20)
        continue;
      if (xmlData[i] === ";")
        break;
      return -1;
    }
    return i;
  }
  function getErrorObject(code, message, lineNumber) {
    return {
      err: {
        code,
        msg: message,
        line: lineNumber.line || lineNumber,
        col: lineNumber.col
      }
    };
  }
  function validateAttrName(attrName) {
    return isName(attrName);
  }
  function validateTagName(tagname) {
    return isName(tagname);
  }
  function getLineNumberForPosition(xmlData, index) {
    const lines = xmlData.substring(0, index).split(/\r?\n/);
    return {
      line: lines.length,
      // column number is last line's length + 1, because column numbering starts at 1:
      col: lines[lines.length - 1].length + 1
    };
  }
  function getPositionFromMatch(match) {
    return match.startIndex + match[1].length;
  }

  // ../../../node_modules/@nodable/entities/src/entities.js
  var CURRENCY = {
    cent: "\xA2",
    pound: "\xA3",
    curren: "\xA4",
    yen: "\xA5",
    euro: "\u20AC",
    dollar: "$",
    fnof: "\u0192",
    inr: "\u20B9",
    af: "\u060B",
    birr: "\u1265\u122D",
    peso: "\u20B1",
    rub: "\u20BD",
    won: "\u20A9",
    yuan: "\xA5",
    cedil: "\xB8"
  };
  var XML = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"'
  };
  var COMMON_HTML = {
    nbsp: "\xA0",
    copy: "\xA9",
    reg: "\xAE",
    trade: "\u2122",
    mdash: "\u2014",
    ndash: "\u2013",
    hellip: "\u2026",
    laquo: "\xAB",
    raquo: "\xBB",
    lsquo: "\u2018",
    rsquo: "\u2019",
    ldquo: "\u201C",
    rdquo: "\u201D",
    bull: "\u2022",
    para: "\xB6",
    sect: "\xA7",
    deg: "\xB0",
    frac12: "\xBD",
    frac14: "\xBC",
    frac34: "\xBE"
  };

  // ../../../node_modules/@nodable/entities/src/EntityDecoder.js
  var ENTITY_ACTION = Object.freeze({
    /** Resolve and expand the entity normally. */
    ALLOW: "allow",
    /** Silently skip this entity — it will not be registered. */
    BLOCK: "block",
    /** Throw an error, aborting entity registration entirely. */
    THROW: "throw"
  });
  var SPECIAL_CHARS = new Set("!?\\\\/[]$%{}^&*()<>|+");
  function validateEntityName(name) {
    if (name[0] === "#") {
      throw new Error(`[EntityReplacer] Invalid character '#' in entity name: "${name}"`);
    }
    for (const ch of name) {
      if (SPECIAL_CHARS.has(ch)) {
        throw new Error(`[EntityReplacer] Invalid character '${ch}' in entity name: "${name}"`);
      }
    }
    return name;
  }
  function mergeEntityMaps(...maps) {
    const out = /* @__PURE__ */ Object.create(null);
    for (const map of maps) {
      if (!map) continue;
      for (const key of Object.keys(map)) {
        const raw = map[key];
        if (typeof raw === "string") {
          out[key] = raw;
        } else if (raw && typeof raw === "object" && raw.val !== void 0) {
          const val = raw.val;
          if (typeof val === "string") {
            out[key] = val;
          }
        }
      }
    }
    return out;
  }
  var LIMIT_TIER_EXTERNAL = "external";
  var LIMIT_TIER_BASE = "base";
  var LIMIT_TIER_ALL = "all";
  function parseLimitTiers(raw) {
    if (!raw || raw === LIMIT_TIER_EXTERNAL) return /* @__PURE__ */ new Set([LIMIT_TIER_EXTERNAL]);
    if (raw === LIMIT_TIER_ALL) return /* @__PURE__ */ new Set([LIMIT_TIER_ALL]);
    if (raw === LIMIT_TIER_BASE) return /* @__PURE__ */ new Set([LIMIT_TIER_BASE]);
    if (Array.isArray(raw)) return new Set(raw);
    return /* @__PURE__ */ new Set([LIMIT_TIER_EXTERNAL]);
  }
  var NCR_LEVEL = Object.freeze({ allow: 0, leave: 1, remove: 2, throw: 3 });
  var XML10_ALLOWED_C0 = /* @__PURE__ */ new Set([9, 10, 13]);
  function parseNCRConfig(ncr) {
    if (!ncr) {
      return { xmlVersion: 1, onLevel: NCR_LEVEL.allow, nullLevel: NCR_LEVEL.remove };
    }
    const xmlVersion = ncr.xmlVersion === 1.1 ? 1.1 : 1;
    const onLevel = NCR_LEVEL[ncr.onNCR] ?? NCR_LEVEL.allow;
    const nullLevel = NCR_LEVEL[ncr.nullNCR] ?? NCR_LEVEL.remove;
    const clampedNull = Math.max(nullLevel, NCR_LEVEL.remove);
    return { xmlVersion, onLevel, nullLevel: clampedNull };
  }
  var EntityDecoder = class {
    /**
     * @param {object} [options]
     * @param {object|null}  [options.namedEntities]        — extra named entities merged into base map
     * @param {object}  [options.limit]                 — security limits
     * @param {number}       [options.limit.maxTotalExpansions=0]  — 0 = unlimited
     * @param {number}       [options.limit.maxExpandedLength=0]   — 0 = unlimited
     * @param {'external'|'base'|'all'|string[]} [options.limit.applyLimitsTo='external']
     *   Which entity tiers count against the security limits:
     *   - 'external' (default) — only input/runtime + persistent external entities
     *   - 'base'               — only DEFAULT_XML_ENTITIES + namedEntities
     *   - 'all'                — every entity regardless of tier
     *   - string[]             — explicit combination, e.g. ['external', 'base']
     * @param {((resolved: string, original: string) => string)|null} [options.postCheck=null]
     * @param {string[]} [options.remove=[]] — entity names (e.g. ['nbsp', '#13']) to delete (replace with empty string)
     * @param {string[]} [options.leave=[]]  — entity names to keep as literal (unchanged in output)
     * @param {object}   [options.ncr]       — Numeric Character Reference controls
     * @param {1.0|1.1}  [options.ncr.xmlVersion=1.0]
     *   XML version governing which codepoint ranges are restricted:
     *   - 1.0 — C0 controls U+0001–U+001F (except U+0009/000A/000D) are prohibited
     *   - 1.1 — C0 controls are allowed when written as NCRs; C1 (U+007F–U+009F) decoded as-is
     * @param {'allow'|'leave'|'remove'|'throw'} [options.ncr.onNCR='allow']
     *   Base action for numeric references. Severity order: allow < leave < remove < throw.
     *   For codepoint ranges that carry a minimum level (surrogates → remove, XML 1.0 C0 → remove),
     *   the effective action is max(onNCR, rangeMinimum).
     * @param {'remove'|'throw'} [options.ncr.nullNCR='remove']
     *   Action for U+0000 (null). 'allow' and 'leave' are clamped to 'remove' since null is never safe.
     * @param {((name: string, value: string) => 'allow'|'block'|'throw')|null} [options.onExternalEntity=null]
     *   Hook called when an external entity is registered via `setExternalEntities()` or
     *   `addExternalEntity()`. Return `ENTITY_ACTION.ALLOW` to accept the entity,
     *   `ENTITY_ACTION.BLOCK` to silently skip it, or `ENTITY_ACTION.THROW` to abort with an error.
     * @param {((name: string, value: string) => 'allow'|'block'|'throw')|null} [options.onInputEntity=null]
     *   Hook called when an input entity is registered via `addInputEntities()`. Return
     *   `ENTITY_ACTION.ALLOW` to accept, `ENTITY_ACTION.BLOCK` to silently skip, or
     *   `ENTITY_ACTION.THROW` to abort with an error.
     */
    constructor(options = {}) {
      this._limit = options.limit || {};
      this._maxTotalExpansions = this._limit.maxTotalExpansions || 0;
      this._maxExpandedLength = this._limit.maxExpandedLength || 0;
      this._postCheck = typeof options.postCheck === "function" ? options.postCheck : (r) => r;
      this._limitTiers = parseLimitTiers(this._limit.applyLimitsTo ?? LIMIT_TIER_EXTERNAL);
      this._numericAllowed = options.numericAllowed ?? true;
      this._baseMap = mergeEntityMaps(XML, options.namedEntities || null);
      this._externalMap = /* @__PURE__ */ Object.create(null);
      this._inputMap = /* @__PURE__ */ Object.create(null);
      this._totalExpansions = 0;
      this._expandedLength = 0;
      this._removeSet = new Set(options.remove && Array.isArray(options.remove) ? options.remove : []);
      this._leaveSet = new Set(options.leave && Array.isArray(options.leave) ? options.leave : []);
      const ncrCfg = parseNCRConfig(options.ncr);
      this._ncrXmlVersion = ncrCfg.xmlVersion;
      this._ncrOnLevel = ncrCfg.onLevel;
      this._ncrNullLevel = ncrCfg.nullLevel;
      this._onExternalEntity = typeof options.onExternalEntity === "function" ? options.onExternalEntity : null;
      this._onInputEntity = typeof options.onInputEntity === "function" ? options.onInputEntity : null;
    }
    // -------------------------------------------------------------------------
    // Private: registration hook dispatch
    // -------------------------------------------------------------------------
    /**
     * Invoke a registration hook for a single entity name/value pair.
     * Returns true when the entity should be accepted, false when it should be
     * silently skipped (BLOCK), and throws when the hook returns THROW.
     *
     * @param {((name: string, value: string) => 'allow'|'block'|'throw')|null} hook
     * @param {string} name
     * @param {string} value
     * @param {string} context  — used in error messages ('external' | 'input')
     * @returns {boolean}  true = accept, false = skip
     */
    _applyRegistrationHook(hook, name, value, context) {
      if (!hook) return true;
      const action = hook(name, value);
      if (action === ENTITY_ACTION.BLOCK) return false;
      if (action === ENTITY_ACTION.THROW) {
        throw new Error(
          `[EntityDecoder] Registration of ${context} entity "&${name};" was rejected by hook`
        );
      }
      return true;
    }
    // -------------------------------------------------------------------------
    // Persistent external entity registration
    // -------------------------------------------------------------------------
    /**
     * Replace the full set of persistent external entities.
     * All keys are validated — throws on invalid characters.
     * If `onExternalEntity` is set, it is called once per entry; entries that
     * return `ENTITY_ACTION.BLOCK` are silently omitted, `ENTITY_ACTION.THROW`
     * aborts the whole call.
     * @param {Record<string, string | { regex?: RegExp, val: string }>} map
     */
    setExternalEntities(map) {
      if (map) {
        for (const key of Object.keys(map)) {
          validateEntityName(key);
        }
      }
      if (!this._onExternalEntity) {
        this._externalMap = mergeEntityMaps(map);
        return;
      }
      const flat = mergeEntityMaps(map);
      const filtered = /* @__PURE__ */ Object.create(null);
      for (const [name, value] of Object.entries(flat)) {
        if (this._applyRegistrationHook(this._onExternalEntity, name, value, "external")) {
          filtered[name] = value;
        }
      }
      this._externalMap = filtered;
    }
    /**
     * Add a single persistent external entity.
     * If `onExternalEntity` is set it is called before the entity is stored;
     * `ENTITY_ACTION.BLOCK` silently skips storage, `ENTITY_ACTION.THROW` raises.
     * @param {string} key
     * @param {string} value
     */
    addExternalEntity(key, value) {
      validateEntityName(key);
      if (typeof value === "string" && value.indexOf("&") === -1) {
        if (this._applyRegistrationHook(this._onExternalEntity, key, value, "external")) {
          this._externalMap[key] = value;
        }
      }
    }
    // -------------------------------------------------------------------------
    // Input / runtime entity registration (per document)
    // -------------------------------------------------------------------------
    /**
     * Inject DOCTYPE entities for the current document.
     * Also resets per-document expansion counters.
     * If `onInputEntity` is set it is called once per entry; entries returning
     * `ENTITY_ACTION.BLOCK` are silently omitted, `ENTITY_ACTION.THROW` aborts.
     * @param {Record<string, string | { regx?: RegExp, regex?: RegExp, val: string }>} map
     */
    addInputEntities(map) {
      this._totalExpansions = 0;
      this._expandedLength = 0;
      if (!this._onInputEntity) {
        this._inputMap = mergeEntityMaps(map);
        return;
      }
      const flat = mergeEntityMaps(map);
      const filtered = /* @__PURE__ */ Object.create(null);
      for (const [name, value] of Object.entries(flat)) {
        if (this._applyRegistrationHook(this._onInputEntity, name, value, "input")) {
          filtered[name] = value;
        }
      }
      this._inputMap = filtered;
    }
    // -------------------------------------------------------------------------
    // Per-document reset
    // -------------------------------------------------------------------------
    /**
     * Wipe input/runtime entities and reset counters.
     * Call this before processing each new document.
     * @returns {this}
     */
    reset() {
      this._inputMap = /* @__PURE__ */ Object.create(null);
      this._totalExpansions = 0;
      this._expandedLength = 0;
      return this;
    }
    // -------------------------------------------------------------------------
    // XML version (can be set after construction, e.g. once parser reads <?xml?>)
    // -------------------------------------------------------------------------
    /**
     * Update the XML version used for NCR classification.
     * Call this as soon as the document's `<?xml version="...">` declaration is parsed.
     * @param {1.0|1.1|number} version
     */
    setXmlVersion(version) {
      this._ncrXmlVersion = version === 1.1 ? 1.1 : 1;
    }
    // -------------------------------------------------------------------------
    // Primary API
    // -------------------------------------------------------------------------
    /**
     * Replace all entity references in `str` in a single pass.
     *
     * @param {string} str
     * @returns {string}
     */
    decode(str) {
      if (typeof str !== "string" || str.length === 0) return str;
      if (str.indexOf("&") === -1) return str;
      const original = str;
      const chunks = [];
      const len = str.length;
      let last = 0;
      let i = 0;
      const limitExpansions = this._maxTotalExpansions > 0;
      const limitLength = this._maxExpandedLength > 0;
      const checkLimits = limitExpansions || limitLength;
      while (i < len) {
        if (str.charCodeAt(i) !== 38) {
          i++;
          continue;
        }
        let j = i + 1;
        while (j < len && str.charCodeAt(j) !== 59 && j - i <= 32) j++;
        if (j >= len || str.charCodeAt(j) !== 59) {
          i++;
          continue;
        }
        const token = str.slice(i + 1, j);
        if (token.length === 0) {
          i++;
          continue;
        }
        let replacement;
        let tier;
        if (this._removeSet.has(token)) {
          replacement = "";
          if (tier === void 0) {
            tier = LIMIT_TIER_EXTERNAL;
          }
        } else if (this._leaveSet.has(token)) {
          i++;
          continue;
        } else if (token.charCodeAt(0) === 35) {
          const ncrResult = this._resolveNCR(token);
          if (ncrResult === void 0) {
            i++;
            continue;
          }
          replacement = ncrResult;
          tier = LIMIT_TIER_BASE;
        } else {
          const resolved = this._resolveName(token);
          replacement = resolved?.value;
          tier = resolved?.tier;
        }
        if (replacement === void 0) {
          i++;
          continue;
        }
        if (i > last) chunks.push(str.slice(last, i));
        chunks.push(replacement);
        last = j + 1;
        i = last;
        if (checkLimits && this._tierCounts(tier)) {
          if (limitExpansions) {
            this._totalExpansions++;
            if (this._totalExpansions > this._maxTotalExpansions) {
              throw new Error(
                `[EntityReplacer] Entity expansion count limit exceeded: ${this._totalExpansions} > ${this._maxTotalExpansions}`
              );
            }
          }
          if (limitLength) {
            const delta = replacement.length - (token.length + 2);
            if (delta > 0) {
              this._expandedLength += delta;
              if (this._expandedLength > this._maxExpandedLength) {
                throw new Error(
                  `[EntityReplacer] Expanded content length limit exceeded: ${this._expandedLength} > ${this._maxExpandedLength}`
                );
              }
            }
          }
        }
      }
      if (last < len) chunks.push(str.slice(last));
      const result = chunks.length === 0 ? str : chunks.join("");
      return this._postCheck(result, original);
    }
    // -------------------------------------------------------------------------
    // Private: limit tier check
    // -------------------------------------------------------------------------
    /**
     * Returns true if a resolved entity of the given tier should count
     * against the expansion/length limits.
     * @param {string} tier  — LIMIT_TIER_EXTERNAL | LIMIT_TIER_BASE
     * @returns {boolean}
     */
    _tierCounts(tier) {
      if (this._limitTiers.has(LIMIT_TIER_ALL)) return true;
      return this._limitTiers.has(tier);
    }
    // -------------------------------------------------------------------------
    // Private: entity resolution
    // -------------------------------------------------------------------------
    /**
     * Resolve a named entity token (without & and ;).
     * Priority: inputMap > externalMap > baseMap
     * Returns the resolved value tagged with its limit tier.
     *
     * @param {string} name
     * @returns {{ value: string, tier: string }|undefined}
     */
    _resolveName(name) {
      if (name in this._inputMap) return { value: this._inputMap[name], tier: LIMIT_TIER_EXTERNAL };
      if (name in this._externalMap) return { value: this._externalMap[name], tier: LIMIT_TIER_EXTERNAL };
      if (name in this._baseMap) return { value: this._baseMap[name], tier: LIMIT_TIER_BASE };
      return void 0;
    }
    /**
     * Classify a codepoint and return the minimum action level that must be applied.
     * Returns -1 when no minimum is imposed (normal allow path).
     *
     * Ranges checked (in priority order):
     *   1. U+0000            — null, governed by nullNCR (always ≥ remove)
     *   2. U+D800–U+DFFF     — surrogates, always prohibited (min: remove)
     *   3. U+0001–U+001F \ {0x09,0x0A,0x0D}  — XML 1.0 restricted C0 (min: remove)
     *      (skipped in XML 1.1 — C0 controls are allowed when written as NCRs)
     *
     * @param {number} cp  — codepoint
     * @returns {number}   — minimum NCR_LEVEL value, or -1 for no restriction
     */
    _classifyNCR(cp) {
      if (cp === 0) return this._ncrNullLevel;
      if (cp >= 55296 && cp <= 57343) return NCR_LEVEL.remove;
      if (this._ncrXmlVersion === 1) {
        if (cp >= 1 && cp <= 31 && !XML10_ALLOWED_C0.has(cp)) return NCR_LEVEL.remove;
      }
      return -1;
    }
    /**
     * Execute a resolved NCR action.
     *
     * @param {number} action   — NCR_LEVEL value
     * @param {string} token    — raw token (e.g. '#38') for error messages
     * @param {number} cp       — codepoint, used only for error messages
     * @returns {string|undefined}
     *   - decoded character string  → 'allow'
     *   - ''                        → 'remove'
     *   - undefined                 → 'leave' (caller must skip past '&' only)
     *   - throws Error              → 'throw'
     */
    _applyNCRAction(action, token, cp) {
      switch (action) {
        case NCR_LEVEL.allow:
          return String.fromCodePoint(cp);
        case NCR_LEVEL.remove:
          return "";
        case NCR_LEVEL.leave:
          return void 0;
        // signal: keep literal
        case NCR_LEVEL.throw:
          throw new Error(
            `[EntityDecoder] Prohibited numeric character reference &${token}; (U+${cp.toString(16).toUpperCase().padStart(4, "0")})`
          );
        default:
          return String.fromCodePoint(cp);
      }
    }
    /**
     * Full NCR resolution pipeline for a numeric token.
     *
     * Steps:
     *   1. Parse the codepoint (decimal or hex).
     *   2. Validate the raw codepoint range (NaN, <0, >0x10FFFF).
     *   3. If numericAllowed is false and no minimum restriction applies → leave as-is.
     *   4. Classify the codepoint to find the minimum required action level.
     *   5. Resolve effective action = max(onNCR, minimum).
     *   6. Apply and return.
     *
     * @param {string} token  — e.g. '#38', '#x26', '#X26'
     * @returns {string|undefined}
     *   - string (incl. '')  — replacement ('' = remove)
     *   - undefined          — leave original &token; as-is
     */
    _resolveNCR(token) {
      const second = token.charCodeAt(1);
      let cp;
      if (second === 120 || second === 88) {
        cp = parseInt(token.slice(2), 16);
      } else {
        cp = parseInt(token.slice(1), 10);
      }
      if (Number.isNaN(cp) || cp < 0 || cp > 1114111) return void 0;
      const minimum = this._classifyNCR(cp);
      if (!this._numericAllowed && minimum < NCR_LEVEL.remove) return void 0;
      const effective = minimum === -1 ? this._ncrOnLevel : Math.max(this._ncrOnLevel, minimum);
      return this._applyNCRAction(effective, token, cp);
    }
  };

  // ../../../node_modules/fast-xml-parser/src/xmlparser/OptionsBuilder.js
  var defaultOnDangerousProperty = (name) => {
    if (DANGEROUS_PROPERTY_NAMES.includes(name)) {
      return "__" + name;
    }
    return name;
  };
  var defaultOptions2 = {
    preserveOrder: false,
    attributeNamePrefix: "@_",
    attributesGroupName: false,
    textNodeName: "#text",
    ignoreAttributes: true,
    removeNSPrefix: false,
    // remove NS from tag name or attribute name if true
    allowBooleanAttributes: false,
    //a tag can have attributes without any value
    //ignoreRootElement : false,
    parseTagValue: true,
    parseAttributeValue: false,
    trimValues: true,
    //Trim string values of tag and attributes
    cdataPropName: false,
    numberParseOptions: {
      hex: true,
      leadingZeros: true,
      eNotation: true,
      unicode: false
    },
    tagValueProcessor: function(tagName, val) {
      return val;
    },
    attributeValueProcessor: function(attrName, val) {
      return val;
    },
    stopNodes: [],
    //nested tags will not be parsed even for errors
    alwaysCreateTextNode: false,
    isArray: () => false,
    commentPropName: false,
    unpairedTags: [],
    processEntities: true,
    htmlEntities: false,
    entityDecoder: null,
    ignoreDeclaration: false,
    ignorePiTags: false,
    transformTagName: false,
    transformAttributeName: false,
    updateTag: function(tagName, jPath, attrs) {
      return tagName;
    },
    // skipEmptyListItem: false
    captureMetaData: false,
    maxNestedTags: 100,
    strictReservedNames: true,
    jPath: true,
    // if true, pass jPath string to callbacks; if false, pass matcher instance
    onDangerousProperty: defaultOnDangerousProperty
  };
  function validatePropertyName(propertyName, optionName) {
    if (typeof propertyName !== "string") {
      return;
    }
    const normalized = propertyName.toLowerCase();
    if (DANGEROUS_PROPERTY_NAMES.some((dangerous) => normalized === dangerous.toLowerCase())) {
      throw new Error(
        `[SECURITY] Invalid ${optionName}: "${propertyName}" is a reserved JavaScript keyword that could cause prototype pollution`
      );
    }
    if (criticalProperties.some((dangerous) => normalized === dangerous.toLowerCase())) {
      throw new Error(
        `[SECURITY] Invalid ${optionName}: "${propertyName}" is a reserved JavaScript keyword that could cause prototype pollution`
      );
    }
  }
  function normalizeProcessEntities(value, htmlEntities) {
    if (typeof value === "boolean") {
      return {
        enabled: value,
        // true or false
        maxEntitySize: 1e4,
        maxExpansionDepth: 1e4,
        maxTotalExpansions: Infinity,
        maxExpandedLength: 1e5,
        maxEntityCount: 1e3,
        allowedTags: null,
        tagFilter: null,
        appliesTo: "all"
      };
    }
    if (typeof value === "object" && value !== null) {
      return {
        enabled: value.enabled !== false,
        maxEntitySize: Math.max(1, value.maxEntitySize ?? 1e4),
        maxExpansionDepth: Math.max(1, value.maxExpansionDepth ?? 1e4),
        maxTotalExpansions: Math.max(1, value.maxTotalExpansions ?? Infinity),
        maxExpandedLength: Math.max(1, value.maxExpandedLength ?? 1e5),
        maxEntityCount: Math.max(1, value.maxEntityCount ?? 1e3),
        allowedTags: value.allowedTags ?? null,
        tagFilter: value.tagFilter ?? null,
        appliesTo: value.appliesTo ?? "all"
      };
    }
    return normalizeProcessEntities(true);
  }
  var buildOptions = function(options) {
    const built = Object.assign({}, defaultOptions2, options);
    const propertyNameOptions = [
      { value: built.attributeNamePrefix, name: "attributeNamePrefix" },
      { value: built.attributesGroupName, name: "attributesGroupName" },
      { value: built.textNodeName, name: "textNodeName" },
      { value: built.cdataPropName, name: "cdataPropName" },
      { value: built.commentPropName, name: "commentPropName" }
    ];
    for (const { value, name } of propertyNameOptions) {
      if (value) {
        validatePropertyName(value, name);
      }
    }
    if (built.onDangerousProperty === null) {
      built.onDangerousProperty = defaultOnDangerousProperty;
    }
    built.processEntities = normalizeProcessEntities(built.processEntities, built.htmlEntities);
    built.unpairedTagsSet = new Set(built.unpairedTags);
    if (built.stopNodes && Array.isArray(built.stopNodes)) {
      built.stopNodes = built.stopNodes.map((node) => {
        if (typeof node === "string" && node.startsWith("*.")) {
          return ".." + node.substring(2);
        }
        return node;
      });
    }
    return built;
  };

  // ../../../node_modules/fast-xml-parser/src/xmlparser/xmlNode.js
  var METADATA_SYMBOL;
  if (typeof Symbol !== "function") {
    METADATA_SYMBOL = "@@xmlMetadata";
  } else {
    METADATA_SYMBOL = /* @__PURE__ */ Symbol("XML Node Metadata");
  }
  var XmlNode = class {
    constructor(tagname) {
      this.tagname = tagname;
      this.child = [];
      this[":@"] = /* @__PURE__ */ Object.create(null);
    }
    add(key, val) {
      if (key === "__proto__") key = "#__proto__";
      this.child.push({ [key]: val });
    }
    addChild(node, startIndex) {
      if (node.tagname === "__proto__") node.tagname = "#__proto__";
      if (node[":@"] && Object.keys(node[":@"]).length > 0) {
        this.child.push({ [node.tagname]: node.child, [":@"]: node[":@"] });
      } else {
        this.child.push({ [node.tagname]: node.child });
      }
      if (startIndex !== void 0) {
        this.child[this.child.length - 1][METADATA_SYMBOL] = { startIndex };
      }
    }
    /** symbol used for metadata */
    static getMetaDataSymbol() {
      return METADATA_SYMBOL;
    }
  };

  // ../../../node_modules/xml-naming/src/index.js
  var nameStartChar10 = ":A-Za-z_\xC0-\xD6\xD8-\xF6\xF8-\u02FF\u0370-\u037D\u037F-\u0486\u0488-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD";
  var nameChar10 = nameStartChar10 + "\\-\\.\\d\xB7\u0300-\u036F\u203F-\u2040";
  var nameStartChar11 = ":A-Za-z_\xC0-\u02FF\u0370-\u037D\u037F-\u0486\u0488-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}";
  var nameChar11 = nameStartChar11 + "\\-\\.\\d\xB7\u0300-\u036F\u0487\u203F-\u2040";
  var buildRegexes = (startChar, char, flags = "") => {
    const ncStart = startChar.replace(":", "");
    const ncChar = char.replace(":", "");
    const ncNamePat = `[${ncStart}][${ncChar}]*`;
    return {
      name: new RegExp(`^[${startChar}][${char}]*$`, flags),
      ncName: new RegExp(`^${ncNamePat}$`, flags),
      qName: new RegExp(`^${ncNamePat}(?::${ncNamePat})?$`, flags),
      nmToken: new RegExp(`^[${char}]+$`, flags),
      nmTokens: new RegExp(`^[${char}]+(?:\\s+[${char}]+)*$`, flags)
    };
  };
  var regexes10 = buildRegexes(nameStartChar10, nameChar10);
  var regexes11 = buildRegexes(nameStartChar11, nameChar11, "u");
  var nameStartCharAscii = ":A-Za-z_";
  var nameCharAscii = nameStartCharAscii + "\\-\\.\\d";
  var regexesAscii = buildRegexes(nameStartCharAscii, nameCharAscii);
  var getRegexes = (xmlVersion = "1.0", asciiOnly = false) => {
    if (asciiOnly) return regexesAscii;
    return xmlVersion === "1.1" ? regexes11 : regexes10;
  };
  var qName = (str, { xmlVersion = "1.0", asciiOnly = false } = {}) => getRegexes(xmlVersion, asciiOnly).qName.test(str);

  // ../../../node_modules/fast-xml-parser/src/xmlparser/DocTypeReader.js
  var DocTypeReader = class {
    constructor(options, xmlVersion) {
      this.suppressValidationErr = !options;
      this.options = options;
      this.xmlVersion = xmlVersion || 1;
    }
    setXmlVersion(xmlVersion = 1) {
      this.xmlVersion = xmlVersion;
    }
    readDocType(xmlData, i) {
      const entities = /* @__PURE__ */ Object.create(null);
      let entityCount = 0;
      if (xmlData[i + 3] === "O" && xmlData[i + 4] === "C" && xmlData[i + 5] === "T" && xmlData[i + 6] === "Y" && xmlData[i + 7] === "P" && xmlData[i + 8] === "E") {
        i = i + 9;
        let angleBracketsCount = 1;
        let hasBody = false, comment = false;
        let exp = "";
        for (; i < xmlData.length; i++) {
          if (xmlData[i] === "<" && !comment) {
            if (hasBody && hasSeq(xmlData, "!ENTITY", i)) {
              i += 7;
              let entityName, val;
              [entityName, val, i] = this.readEntityExp(xmlData, i + 1, this.suppressValidationErr);
              if (val.indexOf("&") === -1) {
                if (this.options.enabled !== false && this.options.maxEntityCount != null && entityCount >= this.options.maxEntityCount) {
                  throw new Error(
                    `Entity count (${entityCount + 1}) exceeds maximum allowed (${this.options.maxEntityCount})`
                  );
                }
                entities[entityName] = val;
                entityCount++;
              }
            } else if (hasBody && hasSeq(xmlData, "!ELEMENT", i)) {
              i += 8;
              const { index } = this.readElementExp(xmlData, i + 1);
              i = index;
            } else if (hasBody && hasSeq(xmlData, "!ATTLIST", i)) {
              i += 8;
            } else if (hasBody && hasSeq(xmlData, "!NOTATION", i)) {
              i += 9;
              const { index } = this.readNotationExp(xmlData, i + 1, this.suppressValidationErr);
              i = index;
            } else if (hasSeq(xmlData, "!--", i)) comment = true;
            else throw new Error(`Invalid DOCTYPE`);
            angleBracketsCount++;
            exp = "";
          } else if (xmlData[i] === ">") {
            if (comment) {
              if (xmlData[i - 1] === "-" && xmlData[i - 2] === "-") {
                comment = false;
                angleBracketsCount--;
              }
            } else {
              angleBracketsCount--;
            }
            if (angleBracketsCount === 0) {
              break;
            }
          } else if (xmlData[i] === "[") {
            hasBody = true;
          } else {
            exp += xmlData[i];
          }
        }
        if (angleBracketsCount !== 0) {
          throw new Error(`Unclosed DOCTYPE`);
        }
      } else {
        throw new Error(`Invalid Tag instead of DOCTYPE`);
      }
      return { entities, i };
    }
    readEntityExp(xmlData, i) {
      i = skipWhitespace(xmlData, i);
      const startIndex = i;
      while (i < xmlData.length && !/\s/.test(xmlData[i]) && xmlData[i] !== '"' && xmlData[i] !== "'") {
        i++;
      }
      let entityName = xmlData.substring(startIndex, i);
      validateEntityName2(entityName, { xmlVersion: this.xmlVersion });
      i = skipWhitespace(xmlData, i);
      if (!this.suppressValidationErr) {
        if (xmlData.substring(i, i + 6).toUpperCase() === "SYSTEM") {
          throw new Error("External entities are not supported");
        } else if (xmlData[i] === "%") {
          throw new Error("Parameter entities are not supported");
        }
      }
      let entityValue = "";
      [i, entityValue] = this.readIdentifierVal(xmlData, i, "entity");
      if (this.options.enabled !== false && this.options.maxEntitySize != null && entityValue.length > this.options.maxEntitySize) {
        throw new Error(
          `Entity "${entityName}" size (${entityValue.length}) exceeds maximum allowed size (${this.options.maxEntitySize})`
        );
      }
      i--;
      return [entityName, entityValue, i];
    }
    readNotationExp(xmlData, i) {
      i = skipWhitespace(xmlData, i);
      const startIndex = i;
      while (i < xmlData.length && !/\s/.test(xmlData[i])) {
        i++;
      }
      let notationName = xmlData.substring(startIndex, i);
      !this.suppressValidationErr && validateEntityName2(notationName, { xmlVersion: this.xmlVersion });
      i = skipWhitespace(xmlData, i);
      const identifierType = xmlData.substring(i, i + 6).toUpperCase();
      if (!this.suppressValidationErr && identifierType !== "SYSTEM" && identifierType !== "PUBLIC") {
        throw new Error(`Expected SYSTEM or PUBLIC, found "${identifierType}"`);
      }
      i += identifierType.length;
      i = skipWhitespace(xmlData, i);
      let publicIdentifier = null;
      let systemIdentifier = null;
      if (identifierType === "PUBLIC") {
        [i, publicIdentifier] = this.readIdentifierVal(xmlData, i, "publicIdentifier");
        i = skipWhitespace(xmlData, i);
        if (xmlData[i] === '"' || xmlData[i] === "'") {
          [i, systemIdentifier] = this.readIdentifierVal(xmlData, i, "systemIdentifier");
        }
      } else if (identifierType === "SYSTEM") {
        [i, systemIdentifier] = this.readIdentifierVal(xmlData, i, "systemIdentifier");
        if (!this.suppressValidationErr && !systemIdentifier) {
          throw new Error("Missing mandatory system identifier for SYSTEM notation");
        }
      }
      return { notationName, publicIdentifier, systemIdentifier, index: --i };
    }
    readIdentifierVal(xmlData, i, type) {
      let identifierVal = "";
      const startChar = xmlData[i];
      if (startChar !== '"' && startChar !== "'") {
        throw new Error(`Expected quoted string, found "${startChar}"`);
      }
      i++;
      const startIndex = i;
      while (i < xmlData.length && xmlData[i] !== startChar) {
        i++;
      }
      identifierVal = xmlData.substring(startIndex, i);
      if (xmlData[i] !== startChar) {
        throw new Error(`Unterminated ${type} value`);
      }
      i++;
      return [i, identifierVal];
    }
    readElementExp(xmlData, i) {
      i = skipWhitespace(xmlData, i);
      const startIndex = i;
      while (i < xmlData.length && !/\s/.test(xmlData[i])) {
        i++;
      }
      let elementName = xmlData.substring(startIndex, i);
      if (!this.suppressValidationErr && !qName(elementName, { xmlVersion: this.xmlVersion })) {
        throw new Error(`Invalid element name: "${elementName}"`);
      }
      i = skipWhitespace(xmlData, i);
      let contentModel = "";
      if (xmlData[i] === "E" && hasSeq(xmlData, "MPTY", i)) i += 4;
      else if (xmlData[i] === "A" && hasSeq(xmlData, "NY", i)) i += 2;
      else if (xmlData[i] === "(") {
        i++;
        const startIndex2 = i;
        while (i < xmlData.length && xmlData[i] !== ")") {
          i++;
        }
        contentModel = xmlData.substring(startIndex2, i);
        if (xmlData[i] !== ")") {
          throw new Error("Unterminated content model");
        }
      } else if (!this.suppressValidationErr) {
        throw new Error(`Invalid Element Expression, found "${xmlData[i]}"`);
      }
      return {
        elementName,
        contentModel: contentModel.trim(),
        index: i
      };
    }
    readAttlistExp(xmlData, i) {
      i = skipWhitespace(xmlData, i);
      let startIndex = i;
      while (i < xmlData.length && !/\s/.test(xmlData[i])) {
        i++;
      }
      let elementName = xmlData.substring(startIndex, i);
      validateEntityName2(elementName, { xmlVersion: this.xmlVersion });
      i = skipWhitespace(xmlData, i);
      startIndex = i;
      while (i < xmlData.length && !/\s/.test(xmlData[i])) {
        i++;
      }
      let attributeName = xmlData.substring(startIndex, i);
      if (!validateEntityName2(attributeName, { xmlVersion: this.xmlVersion })) {
        throw new Error(`Invalid attribute name: "${attributeName}"`);
      }
      i = skipWhitespace(xmlData, i);
      let attributeType = "";
      if (xmlData.substring(i, i + 8).toUpperCase() === "NOTATION") {
        attributeType = "NOTATION";
        i += 8;
        i = skipWhitespace(xmlData, i);
        if (xmlData[i] !== "(") {
          throw new Error(`Expected '(', found "${xmlData[i]}"`);
        }
        i++;
        let allowedNotations = [];
        while (i < xmlData.length && xmlData[i] !== ")") {
          const startIndex2 = i;
          while (i < xmlData.length && xmlData[i] !== "|" && xmlData[i] !== ")") {
            i++;
          }
          let notation = xmlData.substring(startIndex2, i);
          notation = notation.trim();
          if (!validateEntityName2(notation, { xmlVersion: this.xmlVersion })) {
            throw new Error(`Invalid notation name: "${notation}"`);
          }
          allowedNotations.push(notation);
          if (xmlData[i] === "|") {
            i++;
            i = skipWhitespace(xmlData, i);
          }
        }
        if (xmlData[i] !== ")") {
          throw new Error("Unterminated list of notations");
        }
        i++;
        attributeType += " (" + allowedNotations.join("|") + ")";
      } else {
        const startIndex2 = i;
        while (i < xmlData.length && !/\s/.test(xmlData[i])) {
          i++;
        }
        attributeType += xmlData.substring(startIndex2, i);
        const validTypes = ["CDATA", "ID", "IDREF", "IDREFS", "ENTITY", "ENTITIES", "NMTOKEN", "NMTOKENS"];
        if (!this.suppressValidationErr && !validTypes.includes(attributeType.toUpperCase())) {
          throw new Error(`Invalid attribute type: "${attributeType}"`);
        }
      }
      i = skipWhitespace(xmlData, i);
      let defaultValue = "";
      if (xmlData.substring(i, i + 8).toUpperCase() === "#REQUIRED") {
        defaultValue = "#REQUIRED";
        i += 8;
      } else if (xmlData.substring(i, i + 7).toUpperCase() === "#IMPLIED") {
        defaultValue = "#IMPLIED";
        i += 7;
      } else {
        [i, defaultValue] = this.readIdentifierVal(xmlData, i, "ATTLIST");
      }
      return {
        elementName,
        attributeName,
        attributeType,
        defaultValue,
        index: i
      };
    }
  };
  var skipWhitespace = (data, index) => {
    while (index < data.length && /\s/.test(data[index])) {
      index++;
    }
    return index;
  };
  function hasSeq(data, seq, i) {
    for (let j = 0; j < seq.length; j++) {
      if (seq[j] !== data[i + j + 1]) return false;
    }
    return true;
  }
  function validateEntityName2(name, xmlVersion) {
    if (qName(name, { xmlVersion }))
      return name;
    else
      throw new Error(`Invalid entity name ${name}`);
  }

  // ../../../node_modules/anynum/digitTable.js
  var SCRIPT_ZEROS = [
    // Basic Latin (ASCII) — included for completeness / pass-through
    48,
    // 0-9
    // Arabic scripts
    1632,
    // Arabic-Indic ٠١٢٣٤٥٦٧٨٩
    1776,
    // Extended Arabic-Indic (Urdu/Persian/Sindhi) ۰۱۲۳
    // Indic scripts
    2406,
    // Devanagari ०१२३४५६७८९
    2534,
    // Bengali ০১২৩৪৫৬৭৮৯
    2662,
    // Gurmukhi ੦੧੨੩੪੫੬੭੮੯
    2790,
    // Gujarati ૦૧૨૩૪૫૬૭૮૯
    2918,
    // Odia ୦୧୨୩୪୫୬୭୮୯
    3046,
    // Tamil ௦௧௨௩௪௫௬௭௮௯
    3174,
    // Telugu ౦౧౨౩౪౫౬౭౮౯
    3302,
    // Kannada ೦೧೨೩೪೫೬೭೮೯
    3430,
    // Malayalam ൦൧൨൩൪൫൬൭൮൯
    3558,
    // Sinhala Archaic ෦෧෨෩෪෫෬෭෮෯
    // Southeast Asian scripts
    3664,
    // Thai ๐๑๒๓๔๕๖๗๘๙
    3792,
    // Lao ໐໑໒໓໔໕໖໗໘໙
    3872,
    // Tibetan ༠༡༢༣༤༥༦༧༨༩
    4160,
    // Myanmar ၀၁၂၃၄၅၆၇၈၉
    4240,
    // Myanmar Shan ႐႑႒႓႔႕႖႗႘႙
    6112,
    // Khmer ០១២៣៤៥៦៧៨៩
    6160,
    // Mongolian ᠐᠑᠒᠓᠔᠕᠖᠗᠘᠙
    6470,
    // Limbu ᥆᥇᥈᥉᥊᥋᥌᥍᥎᥏
    6608,
    // New Tai Lue ᧐᧑᧒᧓᧔᧕᧖᧗᧘᧙
    6784,
    // Tai Tham Hora ᪀᪁᪂᪃᪄᪅᪆᪇᪈᪉
    6800,
    // Tai Tham Tham ᪐᪑᪒᪓᪔᪕᪖᪗᪘᪙
    6992,
    // Balinese ᭐᭑᭒᭓᭔᭕᭖᭗᭘᭙
    7088,
    // Sundanese ᮰᮱᮲᮳᮴᮵᮶᮷᮸᮹
    7232,
    // Lepcha ᱀᱁᱂᱃᱄᱅᱆᱇᱈᱉
    7248,
    // Ol Chiki ᱐᱑᱒᱓᱔᱕᱖᱗᱘᱙
    // Fullwidth (CJK context)
    65296,
    // Fullwidth ０１２３４５６７８９
    // Mathematical digit variants (Unicode math block)
    120782,
    // Mathematical Bold
    120792,
    // Mathematical Double-Struck
    120802,
    // Mathematical Sans-Serif
    120812,
    // Mathematical Sans-Serif Bold
    120822,
    // Mathematical Monospace
    // Other scripts
    66720,
    // Osmanya 𐒠𐒡𐒢𐒣𐒤𐒥𐒦𐒧𐒨𐒩
    68912,
    // Hanifi Rohingya 𐴰𐴱𐴲𐴳𐴴𐴵𐴶𐴷𐴸𐴹
    69734,
    // Brahmi 𑁦𑁧𑁨𑁩𑁪𑁫𑁬𑁭𑁮𑁯
    69872,
    // Sora Sompeng 𑃰𑃱𑃲𑃳𑃴𑃵𑃶𑃷𑃸𑃹
    69942,
    // Chakma 𑄶𑄷𑄸𑄹𑄺𑄻𑄼𑄽𑄾𑄿
    70096,
    // Sharada 𑇐𑇑𑇒𑇓𑇔𑇕𑇖𑇗𑇘𑇙
    70384,
    // Khudawadi 𑋰𑋱𑋲𑋳𑋴𑋵𑋶𑋷𑋸𑋹
    70736,
    // Newa 𑑐𑑑𑑒𑑓𑑔𑑕𑑖𑑗𑑘𑑙
    70864,
    // Tirhuta 𑓐𑓑𑓒𑓓𑓔𑓕𑓖𑓗𑓘𑓙
    71248,
    // Modi 𑙐𑙑𑙒𑙓𑙔𑙕𑙖𑙗𑙘𑙙
    71360,
    // Takri 𑛀𑛁𑛂𑛃𑛄𑛅𑛆𑛇𑛈𑛉
    71472,
    // Ahom 𑜰𑜱𑜲𑜳𑜴𑜵𑜶𑜷𑜸𑜹
    71904,
    // Warang Citi 𑣠𑣡𑣢𑣣𑣤𑣥𑣦𑣧𑣨𑣩
    72016,
    // Dives Akuru 𑥐𑥑𑥒𑥓𑥔𑥕𑥖𑥗𑥘𑥙
    72688,
    // Khitan Small Script 𑯰𑯱𑯲𑯳𑯴𑯵𑯶𑯷𑯸𑯹
    72784,
    // Bhaiksuki 𑱐𑱑𑱒𑱓𑱔𑱕𑱖𑱗𑱘𑱙
    73040,
    // Masaram Gondi 𑵐𑵑𑵒𑵓𑵔𑵕𑵖𑵗𑵘𑵙
    73120,
    // Gunjala Gondi 𑶠𑶡𑶢𑶣𑶤𑶥𑶦𑶧𑶨𑶩
    73552,
    // Kawi 𑽐𑽑𑽒𑽓𑽔𑽕𑽖𑽗𑽘𑽙
    92768,
    // Mro 𖩠𖩡𖩢𖩣𖩤𖩥𖩦𖩧𖩨𖩩
    92864,
    // Tangsa 𖫀𖫁𖫂𖫃𖫄𖫅𖫆𖫇𖫈𖫉
    93008,
    // Pahawh Hmong 𖭐𖭑𖭒𖭓𖭔𖭕𖭖𖭗𖭘𖭙
    123200,
    // Nyiakeng Puachue Hmong 𞅀𞅁𞅂𞅃𞅄𞅅𞅆𞅇𞅈𞅉
    123632,
    // Wancho 𞋰𞋱𞋲𞋳𞋴𞋵𞋶𞋷𞋸𞋹
    124144,
    // Nag Mundari 𞓰𞓱𞓲𞓳𞓴𞓵𞓶𞓷𞓸𞓹
    125264,
    // Adlam 𞥐𞥑𞥒𞥓𞥔𞥕𞥖𞥗𞥘𞥙
    130032
    // Segmented digit symbols 🯰🯱🯲🯳🯴🯵🯶🯷🯸🯹
  ];
  var NOT_DIGIT = 255;
  var HIGH_MAP = /* @__PURE__ */ new Map();
  var LOW_MAX = 65535;
  var LOW_MIN = 1632;
  var TABLE_OFFSET = LOW_MIN;
  var TABLE_SIZE = LOW_MAX - LOW_MIN + 1;
  var TABLE = new Uint8Array(TABLE_SIZE).fill(NOT_DIGIT);
  for (const zero of SCRIPT_ZEROS) {
    for (let d = 0; d < 10; d++) {
      const cp = zero + d;
      if (cp <= LOW_MAX) {
        TABLE[cp - TABLE_OFFSET] = d;
      } else {
        HIGH_MAP.set(cp, d);
      }
    }
  }

  // ../../../node_modules/anynum/anynum.js
  var CHAR_0 = 48;
  var CHAR_9 = 57;
  var CHAR_MINUS = 45;
  var MINUS_SET = /* @__PURE__ */ new Set([8722, 65293, 65123]);
  function anynum(str) {
    if (typeof str !== "string") return str;
    const len = str.length;
    if (len === 0) return str;
    let firstHit = -1;
    for (let i = 0; i < len; i++) {
      const cc = str.charCodeAt(i);
      if (cc >= CHAR_0 && cc <= CHAR_9 || cc === CHAR_MINUS) continue;
      if (cc < TABLE_OFFSET) {
        if (MINUS_SET.has(cc)) {
          firstHit = i;
          break;
        }
        continue;
      }
      if (cc >= 55296 && cc <= 56319) {
        if (i + 1 < len) {
          const low = str.charCodeAt(i + 1);
          if (low >= 56320 && low <= 57343) {
            const cp = 65536 + (cc - 55296 << 10) + (low - 56320);
            if (HIGH_MAP.has(cp)) {
              firstHit = i;
              break;
            }
          }
        }
        continue;
      }
      if (TABLE[cc - TABLE_OFFSET] !== NOT_DIGIT || MINUS_SET.has(cc)) {
        firstHit = i;
        break;
      }
    }
    if (firstHit === -1) return str;
    const chars = [];
    if (firstHit > 0) chars.push(str.slice(0, firstHit));
    for (let i = firstHit; i < len; i++) {
      const cc = str.charCodeAt(i);
      if (cc >= CHAR_0 && cc <= CHAR_9 || cc === CHAR_MINUS) {
        chars.push(str[i]);
        continue;
      }
      if (cc < TABLE_OFFSET) {
        chars.push(MINUS_SET.has(cc) ? "-" : str[i]);
        continue;
      }
      if (cc >= 55296 && cc <= 56319) {
        if (i + 1 < len) {
          const low = str.charCodeAt(i + 1);
          if (low >= 56320 && low <= 57343) {
            const cp = 65536 + (cc - 55296 << 10) + (low - 56320);
            const d2 = HIGH_MAP.get(cp);
            if (d2 !== void 0) {
              chars.push(String.fromCharCode(d2 + 48));
              i++;
              continue;
            }
          }
        }
        chars.push(str[i]);
        continue;
      }
      if (MINUS_SET.has(cc)) {
        chars.push("-");
        continue;
      }
      const d = TABLE[cc - TABLE_OFFSET];
      chars.push(d !== NOT_DIGIT ? String.fromCharCode(d + 48) : str[i]);
    }
    return chars.join("");
  }
  var anynum_default = anynum;

  // ../../../node_modules/strnum/strnum.js
  var hexRegex = /^[-+]?0x[a-fA-F0-9]+$/;
  var binRegex = /^0b[01]+$/;
  var octRegex = /^0o[0-7]+$/;
  var numRegex = /^([\-\+])?(0*)([0-9]*(\.[0-9]*)?)$/;
  var consider = {
    hex: true,
    binary: false,
    octal: false,
    leadingZeros: true,
    decimalPoint: ".",
    eNotation: true,
    //skipLike: /regex/,
    infinity: "original",
    // "null", "infinity" (Infinity type), "string" ("Infinity" (the string literal))
    unicode: false
  };
  function toNumber(str, options = {}) {
    options = Object.assign({}, consider, options);
    if (!str || typeof str !== "string") return str;
    let trimmedStr = str.trim();
    if (trimmedStr.length === 0) return str;
    else if (options.skipLike !== void 0 && options.skipLike.test(trimmedStr)) return str;
    else if (trimmedStr === "0") return 0;
    if (options.unicode) {
      trimmedStr = anynum_default(trimmedStr);
      if (trimmedStr === "0") return 0;
    }
    if (options.hex && hexRegex.test(trimmedStr)) {
      return parse_int(trimmedStr, 16);
    } else if (options.binary && binRegex.test(trimmedStr)) {
      return parse_int(trimmedStr, 2);
    } else if (options.octal && octRegex.test(trimmedStr)) {
      return parse_int(trimmedStr, 8);
    } else if (!isFinite(trimmedStr)) {
      return handleInfinity(str, Number(trimmedStr), options);
    } else if (trimmedStr.includes("e") || trimmedStr.includes("E")) {
      return resolveEnotation(str, trimmedStr, options);
    } else {
      const match = numRegex.exec(trimmedStr);
      if (match) {
        const sign = match[1] || "";
        const leadingZeros = match[2];
        let numTrimmedByZeros = trimZeros(match[3]);
        const decimalAdjacentToLeadingZeros = sign ? (
          // 0., -00., 000.
          str[leadingZeros.length + 1] === "."
        ) : str[leadingZeros.length] === ".";
        if (!options.leadingZeros && (leadingZeros.length > 1 || leadingZeros.length === 1 && !decimalAdjacentToLeadingZeros)) {
          return str;
        } else {
          const num = Number(trimmedStr);
          const parsedStr = String(num);
          if (num === 0) return num;
          if (parsedStr.search(/[eE]/) !== -1) {
            if (options.eNotation) return num;
            else return str;
          } else if (trimmedStr.indexOf(".") !== -1) {
            if (parsedStr === "0") return num;
            else if (parsedStr === numTrimmedByZeros) return num;
            else if (parsedStr === `${sign}${numTrimmedByZeros}`) return num;
            else return str;
          }
          let n = leadingZeros ? numTrimmedByZeros : trimmedStr;
          if (leadingZeros) {
            return n === parsedStr || sign + n === parsedStr ? num : str;
          } else {
            return n === parsedStr || n === sign + parsedStr ? num : str;
          }
        }
      } else {
        return str;
      }
    }
  }
  var eNotationRegx = /^([-+])?(0*)(\d*(\.\d*)?[eE][-\+]?\d+)$/;
  function resolveEnotation(str, trimmedStr, options) {
    if (!options.eNotation) return str;
    const notation = trimmedStr.match(eNotationRegx);
    if (notation) {
      let sign = notation[1] || "";
      const eChar = notation[3].indexOf("e") === -1 ? "E" : "e";
      const leadingZeros = notation[2];
      const eAdjacentToLeadingZeros = sign ? (
        // 0E.
        str[leadingZeros.length + 1] === eChar
      ) : str[leadingZeros.length] === eChar;
      if (leadingZeros.length > 1 && eAdjacentToLeadingZeros) return str;
      else if (leadingZeros.length === 1 && (notation[3].startsWith(`.${eChar}`) || notation[3][0] === eChar)) {
        return Number(trimmedStr);
      } else if (leadingZeros.length > 0) {
        if (options.leadingZeros && !eAdjacentToLeadingZeros) {
          trimmedStr = (notation[1] || "") + notation[3];
          return Number(trimmedStr);
        } else return str;
      } else {
        return Number(trimmedStr);
      }
    } else {
      return str;
    }
  }
  function trimZeros(numStr) {
    if (numStr && numStr.indexOf(".") !== -1) {
      numStr = numStr.replace(/0+$/, "");
      if (numStr === ".") numStr = "0";
      else if (numStr[0] === ".") numStr = "0" + numStr;
      else if (numStr[numStr.length - 1] === ".") numStr = numStr.substring(0, numStr.length - 1);
      return numStr;
    }
    return numStr;
  }
  function parse_int(numStr, base) {
    const str = numStr.trim();
    if (base === 2 || base === 8) numStr = str.substring(2);
    if (parseInt) return parseInt(numStr, base);
    else if (Number.parseInt) return Number.parseInt(numStr, base);
    else if (window && window.parseInt) return window.parseInt(numStr, base);
    else throw new Error("parseInt, Number.parseInt, window.parseInt are not supported");
  }
  function handleInfinity(str, num, options) {
    const isPositive = num === Infinity;
    switch (options.infinity.toLowerCase()) {
      case "null":
        return null;
      case "infinity":
        return num;
      // Return Infinity or -Infinity
      case "string":
        return isPositive ? "Infinity" : "-Infinity";
      case "original":
      default:
        return str;
    }
  }

  // ../../../node_modules/fast-xml-parser/src/ignoreAttributes.js
  function getIgnoreAttributesFn(ignoreAttributes) {
    if (typeof ignoreAttributes === "function") {
      return ignoreAttributes;
    }
    if (Array.isArray(ignoreAttributes)) {
      return (attrName) => {
        for (const pattern of ignoreAttributes) {
          if (typeof pattern === "string" && attrName === pattern) {
            return true;
          }
          if (pattern instanceof RegExp && pattern.test(attrName)) {
            return true;
          }
        }
      };
    }
    return () => false;
  }

  // ../../../node_modules/path-expression-matcher/src/Expression.js
  var Expression = class {
    /**
     * Create a new Expression
     * @param {string} pattern - Pattern string (e.g., "root.users.user", "..user[id]")
     * @param {Object} options - Configuration options
     * @param {string} options.separator - Path separator (default: '.')
     */
    constructor(pattern, options = {}, data) {
      this.pattern = pattern;
      this.separator = options.separator || ".";
      this.segments = this._parse(pattern);
      this.data = data;
      this._hasDeepWildcard = this.segments.some((seg) => seg.type === "deep-wildcard");
      this._hasAttributeCondition = this.segments.some((seg) => seg.attrName !== void 0);
      this._hasPositionSelector = this.segments.some((seg) => seg.position !== void 0);
    }
    /**
     * Parse pattern string into segments
     * @private
     * @param {string} pattern - Pattern to parse
     * @returns {Array} Array of segment objects
     */
    _parse(pattern) {
      const segments = [];
      let i = 0;
      let currentPart = "";
      while (i < pattern.length) {
        if (pattern[i] === this.separator) {
          if (i + 1 < pattern.length && pattern[i + 1] === this.separator) {
            if (currentPart.trim()) {
              segments.push(this._parseSegment(currentPart.trim()));
              currentPart = "";
            }
            segments.push({ type: "deep-wildcard" });
            i += 2;
          } else {
            if (currentPart.trim()) {
              segments.push(this._parseSegment(currentPart.trim()));
            }
            currentPart = "";
            i++;
          }
        } else {
          currentPart += pattern[i];
          i++;
        }
      }
      if (currentPart.trim()) {
        segments.push(this._parseSegment(currentPart.trim()));
      }
      return segments;
    }
    /**
     * Parse a single segment
     * @private
     * @param {string} part - Segment string (e.g., "user", "ns::user", "user[id]", "ns::user:first")
     * @returns {Object} Segment object
     */
    _parseSegment(part) {
      const segment = { type: "tag" };
      let bracketContent = null;
      let withoutBrackets = part;
      const bracketMatch = part.match(/^([^\[]+)(\[[^\]]*\])(.*)$/);
      if (bracketMatch) {
        withoutBrackets = bracketMatch[1] + bracketMatch[3];
        if (bracketMatch[2]) {
          const content = bracketMatch[2].slice(1, -1);
          if (content) {
            bracketContent = content;
          }
        }
      }
      let namespace = void 0;
      let tagAndPosition = withoutBrackets;
      if (withoutBrackets.includes("::")) {
        const nsIndex = withoutBrackets.indexOf("::");
        namespace = withoutBrackets.substring(0, nsIndex).trim();
        tagAndPosition = withoutBrackets.substring(nsIndex + 2).trim();
        if (!namespace) {
          throw new Error(`Invalid namespace in pattern: ${part}`);
        }
      }
      let tag = void 0;
      let positionMatch = null;
      if (tagAndPosition.includes(":")) {
        const colonIndex = tagAndPosition.lastIndexOf(":");
        const tagPart = tagAndPosition.substring(0, colonIndex).trim();
        const posPart = tagAndPosition.substring(colonIndex + 1).trim();
        const isPositionKeyword = ["first", "last", "odd", "even"].includes(posPart) || /^nth\(\d+\)$/.test(posPart);
        if (isPositionKeyword) {
          tag = tagPart;
          positionMatch = posPart;
        } else {
          tag = tagAndPosition;
        }
      } else {
        tag = tagAndPosition;
      }
      if (!tag) {
        throw new Error(`Invalid segment pattern: ${part}`);
      }
      segment.tag = tag;
      if (namespace) {
        segment.namespace = namespace;
      }
      if (bracketContent) {
        if (bracketContent.includes("=")) {
          const eqIndex = bracketContent.indexOf("=");
          segment.attrName = bracketContent.substring(0, eqIndex).trim();
          segment.attrValue = bracketContent.substring(eqIndex + 1).trim();
        } else {
          segment.attrName = bracketContent.trim();
        }
      }
      if (positionMatch) {
        const nthMatch = positionMatch.match(/^nth\((\d+)\)$/);
        if (nthMatch) {
          segment.position = "nth";
          segment.positionValue = parseInt(nthMatch[1], 10);
        } else {
          segment.position = positionMatch;
        }
      }
      return segment;
    }
    /**
     * Get the number of segments
     * @returns {number}
     */
    get length() {
      return this.segments.length;
    }
    /**
     * Check if expression contains deep wildcard
     * @returns {boolean}
     */
    hasDeepWildcard() {
      return this._hasDeepWildcard;
    }
    /**
     * Check if expression has attribute conditions
     * @returns {boolean}
     */
    hasAttributeCondition() {
      return this._hasAttributeCondition;
    }
    /**
     * Check if expression has position selectors
     * @returns {boolean}
     */
    hasPositionSelector() {
      return this._hasPositionSelector;
    }
    /**
     * Get string representation
     * @returns {string}
     */
    toString() {
      return this.pattern;
    }
  };

  // ../../../node_modules/path-expression-matcher/src/ExpressionSet.js
  var ExpressionSet = class {
    constructor() {
      this._byDepthAndTag = /* @__PURE__ */ new Map();
      this._wildcardByDepth = /* @__PURE__ */ new Map();
      this._deepWildcards = [];
      this._deepByTerminalTag = /* @__PURE__ */ new Map();
      this._patterns = /* @__PURE__ */ new Set();
      this._sealed = false;
    }
    /**
     * Add an Expression to the set.
     * Duplicate patterns (same pattern string) are silently ignored.
     *
     * @param {import('./Expression.js').default} expression - A pre-constructed Expression instance
     * @returns {this} for chaining
     * @throws {TypeError} if called after seal()
     *
     * @example
     * set.add(new Expression('root.users.user'));
     * set.add(new Expression('..script'));
     */
    add(expression) {
      if (this._sealed) {
        throw new TypeError(
          "ExpressionSet is sealed. Create a new ExpressionSet to add more expressions."
        );
      }
      if (this._patterns.has(expression.pattern)) return this;
      this._patterns.add(expression.pattern);
      if (expression.hasDeepWildcard()) {
        const lastSeg2 = expression.segments[expression.segments.length - 1];
        if (lastSeg2 && lastSeg2.type !== "deep-wildcard" && lastSeg2.tag !== "*") {
          const tag2 = lastSeg2.tag;
          if (!this._deepByTerminalTag.has(tag2)) this._deepByTerminalTag.set(tag2, []);
          this._deepByTerminalTag.get(tag2).push(expression);
        } else {
          this._deepWildcards.push(expression);
        }
        return this;
      }
      const depth = expression.length;
      const lastSeg = expression.segments[expression.segments.length - 1];
      const tag = lastSeg?.tag;
      if (!tag || tag === "*") {
        if (!this._wildcardByDepth.has(depth)) this._wildcardByDepth.set(depth, []);
        this._wildcardByDepth.get(depth).push(expression);
      } else {
        const key = `${depth}:${tag}`;
        if (!this._byDepthAndTag.has(key)) this._byDepthAndTag.set(key, []);
        this._byDepthAndTag.get(key).push(expression);
      }
      return this;
    }
    /**
     * Add multiple expressions at once.
     *
     * @param {import('./Expression.js').default[]} expressions - Array of Expression instances
     * @returns {this} for chaining
     *
     * @example
     * set.addAll([
     *   new Expression('root.users.user'),
     *   new Expression('root.config.setting'),
     * ]);
     */
    addAll(expressions) {
      for (const expr of expressions) this.add(expr);
      return this;
    }
    /**
     * Check whether a pattern string is already present in the set.
     *
     * @param {import('./Expression.js').default} expression
     * @returns {boolean}
     */
    has(expression) {
      return this._patterns.has(expression.pattern);
    }
    /**
     * Number of expressions in the set.
     * @type {number}
     */
    get size() {
      return this._patterns.size;
    }
    /**
     * Seal the set against further modifications.
     * Useful to prevent accidental mutations after config is built.
     * Calling add() or addAll() on a sealed set throws a TypeError.
     *
     * @returns {this}
     */
    seal() {
      this._sealed = true;
      return this;
    }
    /**
     * Whether the set has been sealed.
     * @type {boolean}
     */
    get isSealed() {
      return this._sealed;
    }
    /**
     * Test whether the matcher's current path matches any expression in the set.
     *
     * Evaluation order (cheapest → most expensive):
     *  1. Exact depth + tag bucket  — O(1) lookup, typically 0–2 expressions
     *  2. Depth-only wildcard bucket — O(1) lookup, rare
     *  3. Deep-wildcard list         — always checked, but usually small
     *
     * @param {import('./Matcher.js').default} matcher - Matcher instance (or readOnly view)
     * @returns {boolean} true if any expression matches the current path
     *
     * @example
     * if (stopNodes.matchesAny(matcher)) {
     *   // handle stop node
     * }
     */
    matchesAny(matcher) {
      return this.findMatch(matcher) !== null;
    }
    /**
    * Find and return the first Expression that matches the matcher's current path.
    *
    * Uses the same evaluation order as matchesAny (cheapest → most expensive):
    *  1. Exact depth + tag bucket
    *  2. Depth-only wildcard bucket
    *  3. Deep-wildcard list
    *
    * @param {import('./Matcher.js').default} matcher - Matcher instance (or readOnly view)
    * @returns {import('./Expression.js').default | null} the first matching Expression, or null
    *
    * @example
    * const expr = stopNodes.findMatch(matcher);
    * if (expr) {
    *   // access expr.config, expr.pattern, etc.
    * }
    */
    findMatch(matcher) {
      const depth = matcher.getDepth();
      const tag = matcher.getCurrentTag();
      const exactKey = `${depth}:${tag}`;
      const exactBucket = this._byDepthAndTag.get(exactKey);
      if (exactBucket) {
        for (let i = 0; i < exactBucket.length; i++) {
          if (matcher.matches(exactBucket[i])) return exactBucket[i];
        }
      }
      const wildcardBucket = this._wildcardByDepth.get(depth);
      if (wildcardBucket) {
        for (let i = 0; i < wildcardBucket.length; i++) {
          if (matcher.matches(wildcardBucket[i])) return wildcardBucket[i];
        }
      }
      const deepBucket = this._deepByTerminalTag.get(tag);
      if (deepBucket) {
        for (let i = 0; i < deepBucket.length; i++) {
          if (matcher.matches(deepBucket[i])) return deepBucket[i];
        }
      }
      for (let i = 0; i < this._deepWildcards.length; i++) {
        if (matcher.matches(this._deepWildcards[i])) return this._deepWildcards[i];
      }
      return null;
    }
  };

  // ../../../node_modules/path-expression-matcher/src/Matcher.js
  var MatcherView = class {
    /**
     * @param {Matcher} matcher - The parent Matcher instance to read from.
     */
    constructor(matcher) {
      this._matcher = matcher;
    }
    /**
     * Get the path separator used by the parent matcher.
     * @returns {string}
     */
    get separator() {
      return this._matcher.separator;
    }
    /**
     * Get current tag name.
     * @returns {string|undefined}
     */
    getCurrentTag() {
      const path = this._matcher.path;
      return path.length > 0 ? path[path.length - 1].tag : void 0;
    }
    /**
     * Get current namespace.
     * @returns {string|undefined}
     */
    getCurrentNamespace() {
      const path = this._matcher.path;
      return path.length > 0 ? path[path.length - 1].namespace : void 0;
    }
    /**
     * Get current node's attribute value.
     * @param {string} attrName
     * @returns {*}
     */
    getAttrValue(attrName) {
      const path = this._matcher.path;
      if (path.length === 0) return void 0;
      return path[path.length - 1].values?.[attrName];
    }
    /**
     * Check if current node has an attribute.
     * @param {string} attrName
     * @returns {boolean}
     */
    hasAttr(attrName) {
      const path = this._matcher.path;
      if (path.length === 0) return false;
      const current = path[path.length - 1];
      return current.values !== void 0 && attrName in current.values;
    }
    /**
     * Get the value of a "kept" attribute from the nearest ancestor (or
     * current node) that declared it via `push(tag, attrs, ns, { keep: [...] })`.
     * @param {string} attrName
     * @returns {*}
     */
    getAnyParentAttr(attrName) {
      return this._matcher.getAnyParentAttr(attrName);
    }
    /**
     * Check whether any ancestor (or the current node) kept the given
     * attribute via `push(tag, attrs, ns, { keep: [...] })`.
     * @param {string} attrName
     * @returns {boolean}
     */
    hasAnyParentAttr(attrName) {
      return this._matcher.hasAnyParentAttr(attrName);
    }
    /**
     * Get current node's sibling position (child index in parent).
     * @returns {number}
     */
    getPosition() {
      const path = this._matcher.path;
      if (path.length === 0) return -1;
      return path[path.length - 1].position ?? 0;
    }
    /**
     * Get current node's repeat counter (occurrence count of this tag name).
     * @returns {number}
     */
    getCounter() {
      const path = this._matcher.path;
      if (path.length === 0) return -1;
      return path[path.length - 1].counter ?? 0;
    }
    /**
     * Get current node's sibling index (alias for getPosition).
     * @returns {number}
     * @deprecated Use getPosition() or getCounter() instead
     */
    getIndex() {
      return this.getPosition();
    }
    /**
     * Get current path depth.
     * @returns {number}
     */
    getDepth() {
      return this._matcher.path.length;
    }
    /**
     * Get path as string.
     * @param {string} [separator] - Optional separator (uses default if not provided)
     * @param {boolean} [includeNamespace=true]
     * @returns {string}
     */
    toString(separator, includeNamespace = true) {
      return this._matcher.toString(separator, includeNamespace);
    }
    /**
     * Get path as array of tag names.
     * @returns {string[]}
     */
    toArray() {
      return this._matcher.path.map((n) => n.tag);
    }
    /**
     * Match current path against an Expression.
     * @param {Expression} expression
     * @returns {boolean}
     */
    matches(expression) {
      return this._matcher.matches(expression);
    }
    /**
     * Match any expression in the given set against the current path.
     * @param {ExpressionSet} exprSet
     * @returns {boolean}
     */
    matchesAny(exprSet) {
      return exprSet.matchesAny(this._matcher);
    }
  };
  var Matcher = class {
    /**
     * Create a new Matcher.
     * @param {Object} [options={}]
     * @param {string} [options.separator='.'] - Default path separator
     */
    constructor(options = {}) {
      this.separator = options.separator || ".";
      this.path = [];
      this.siblingStacks = [];
      this._pathStringCache = null;
      this._view = new MatcherView(this);
      this._keptAttrs = [];
    }
    /**
     * Push a new tag onto the path.
     * @param {string} tagName
     * @param {Object|null} [attrValues=null]
     * @param {string|null} [namespace=null]
     * @param {Object|null} [options=null]
     * @param {string[]} [options.keep] - Names of attributes (from attrValues)
     */
    push(tagName, attrValues = null, namespace = null, options = null) {
      this._pathStringCache = null;
      if (this.path.length > 0) {
        this.path[this.path.length - 1].values = void 0;
      }
      const currentLevel = this.path.length;
      let level = this.siblingStacks[currentLevel];
      if (!level) {
        level = { counts: /* @__PURE__ */ new Map(), total: 0 };
        this.siblingStacks[currentLevel] = level;
      }
      const siblingKey = namespace ? `${namespace}:${tagName}` : tagName;
      const counter = level.counts.get(siblingKey) || 0;
      const position = level.total;
      level.counts.set(siblingKey, counter + 1);
      level.total++;
      const node = {
        tag: tagName,
        position,
        counter
      };
      if (namespace !== null && namespace !== void 0) {
        node.namespace = namespace;
      }
      if (attrValues !== null && attrValues !== void 0) {
        node.values = attrValues;
      }
      this.path.push(node);
      const depth = this.path.length;
      const keep = options !== null ? options.keep : null;
      if (keep !== null && keep !== void 0 && keep.length > 0 && attrValues) {
        for (let i = 0; i < keep.length; i++) {
          const name = keep[i];
          if (attrValues[name] !== void 0) {
            this._keptAttrs.push({ depth, name, value: attrValues[name] });
          }
        }
      }
    }
    /**
     * Pop the last tag from the path.
     * @returns {Object|undefined} The popped node
     */
    pop() {
      if (this.path.length === 0) return void 0;
      this._pathStringCache = null;
      const node = this.path.pop();
      if (this.siblingStacks.length > this.path.length + 1) {
        this.siblingStacks.length = this.path.length + 1;
      }
      const poppedDepth = this.path.length + 1;
      while (this._keptAttrs.length > 0 && this._keptAttrs[this._keptAttrs.length - 1].depth >= poppedDepth) {
        this._keptAttrs.pop();
      }
      return node;
    }
    /**
     * Update current node's attribute values.
     * Useful when attributes are parsed after push.
     * @param {Object} attrValues
     */
    updateCurrent(attrValues) {
      if (this.path.length > 0) {
        const current = this.path[this.path.length - 1];
        if (attrValues !== null && attrValues !== void 0) {
          current.values = attrValues;
        }
      }
    }
    /**
     * Get current tag name.
     * @returns {string|undefined}
     */
    getCurrentTag() {
      return this.path.length > 0 ? this.path[this.path.length - 1].tag : void 0;
    }
    /**
     * Get current namespace.
     * @returns {string|undefined}
     */
    getCurrentNamespace() {
      return this.path.length > 0 ? this.path[this.path.length - 1].namespace : void 0;
    }
    /**
     * Get current node's attribute value.
     * @param {string} attrName
     * @returns {*}
     */
    getAttrValue(attrName) {
      if (this.path.length === 0) return void 0;
      return this.path[this.path.length - 1].values?.[attrName];
    }
    /**
     * Check if current node has an attribute.
     * @param {string} attrName
     * @returns {boolean}
     */
    hasAttr(attrName) {
      if (this.path.length === 0) return false;
      const current = this.path[this.path.length - 1];
      return current.values !== void 0 && attrName in current.values;
    }
    /**
     * Get the value of a "kept" attribute from the nearest ancestor (or
     * current node) that declared it via `push(tag, attrs, ns, { keep: [...] })`.
     * Unlike getAttrValue(), this works regardless of how deep the path has
     * gone since the attribute was pushed — but only for attribute names that
     * were explicitly marked with `keep` at push time. Cost is proportional to
     * the number of currently-kept attributes (typically 0-3), not path depth.
     * @param {string} attrName
     * @returns {*} the value, or undefined if no ancestor kept this attribute
     */
    getAnyParentAttr(attrName) {
      const kept = this._keptAttrs;
      for (let i = kept.length - 1; i >= 0; i--) {
        if (kept[i].name === attrName) return kept[i].value;
      }
      return void 0;
    }
    /**
     * Check whether any ancestor (or the current node) kept the given
     * attribute via `push(tag, attrs, ns, { keep: [...] })`.
     * @param {string} attrName
     * @returns {boolean}
     */
    hasAnyParentAttr(attrName) {
      const kept = this._keptAttrs;
      for (let i = kept.length - 1; i >= 0; i--) {
        if (kept[i].name === attrName) return true;
      }
      return false;
    }
    /**
     * Get current node's sibling position (child index in parent).
     * @returns {number}
     */
    getPosition() {
      if (this.path.length === 0) return -1;
      return this.path[this.path.length - 1].position ?? 0;
    }
    /**
     * Get current node's repeat counter (occurrence count of this tag name).
     * @returns {number}
     */
    getCounter() {
      if (this.path.length === 0) return -1;
      return this.path[this.path.length - 1].counter ?? 0;
    }
    /**
     * Get current node's sibling index (alias for getPosition).
     * @returns {number}
     * @deprecated Use getPosition() or getCounter() instead
     */
    getIndex() {
      return this.getPosition();
    }
    /**
     * Get current path depth.
     * @returns {number}
     */
    getDepth() {
      return this.path.length;
    }
    /**
     * Get path as string.
     * @param {string} [separator] - Optional separator (uses default if not provided)
     * @param {boolean} [includeNamespace=true]
     * @returns {string}
     */
    toString(separator, includeNamespace = true) {
      const sep2 = separator || this.separator;
      const isDefault = sep2 === this.separator && includeNamespace === true;
      if (isDefault) {
        if (this._pathStringCache !== null) {
          return this._pathStringCache;
        }
        const result = this.path.map(
          (n) => n.namespace ? `${n.namespace}:${n.tag}` : n.tag
        ).join(sep2);
        this._pathStringCache = result;
        return result;
      }
      return this.path.map(
        (n) => includeNamespace && n.namespace ? `${n.namespace}:${n.tag}` : n.tag
      ).join(sep2);
    }
    /**
     * Get path as array of tag names.
     * @returns {string[]}
     */
    toArray() {
      return this.path.map((n) => n.tag);
    }
    /**
     * Reset the path to empty.
     */
    reset() {
      this._pathStringCache = null;
      this.path = [];
      this.siblingStacks = [];
      this._keptAttrs = [];
    }
    /**
     * Match current path against an Expression.
     * @param {Expression} expression
     * @returns {boolean}
     */
    matches(expression) {
      const segments = expression.segments;
      if (segments.length === 0) {
        return false;
      }
      if (expression.hasDeepWildcard()) {
        return this._matchWithDeepWildcard(segments);
      }
      return this._matchSimple(segments);
    }
    /**
     * @private
     */
    _matchSimple(segments) {
      if (this.path.length !== segments.length) {
        return false;
      }
      for (let i = 0; i < segments.length; i++) {
        if (!this._matchSegment(segments[i], this.path[i], i === this.path.length - 1)) {
          return false;
        }
      }
      return true;
    }
    /**
     * @private
     */
    _matchWithDeepWildcard(segments) {
      let pathIdx = this.path.length - 1;
      let segIdx = segments.length - 1;
      while (segIdx >= 0 && pathIdx >= 0) {
        const segment = segments[segIdx];
        if (segment.type === "deep-wildcard") {
          segIdx--;
          if (segIdx < 0) {
            return true;
          }
          const nextSeg = segments[segIdx];
          let found = false;
          for (let i = pathIdx; i >= 0; i--) {
            if (this._matchSegment(nextSeg, this.path[i], i === this.path.length - 1)) {
              pathIdx = i - 1;
              segIdx--;
              found = true;
              break;
            }
          }
          if (!found) {
            return false;
          }
        } else {
          if (!this._matchSegment(segment, this.path[pathIdx], pathIdx === this.path.length - 1)) {
            return false;
          }
          pathIdx--;
          segIdx--;
        }
      }
      return segIdx < 0;
    }
    /**
     * @private
     */
    _matchSegment(segment, node, isCurrentNode) {
      if (segment.tag !== "*" && segment.tag !== node.tag) {
        return false;
      }
      if (segment.namespace !== void 0) {
        if (segment.namespace !== "*" && segment.namespace !== node.namespace) {
          return false;
        }
      }
      if (segment.attrName !== void 0) {
        if (!isCurrentNode) {
          return false;
        }
        if (!node.values || !(segment.attrName in node.values)) {
          return false;
        }
        if (segment.attrValue !== void 0) {
          if (String(node.values[segment.attrName]) !== String(segment.attrValue)) {
            return false;
          }
        }
      }
      if (segment.position !== void 0) {
        if (!isCurrentNode) {
          return false;
        }
        const counter = node.counter ?? 0;
        if (segment.position === "first" && counter !== 0) {
          return false;
        } else if (segment.position === "odd" && counter % 2 !== 1) {
          return false;
        } else if (segment.position === "even" && counter % 2 !== 0) {
          return false;
        } else if (segment.position === "nth" && counter !== segment.positionValue) {
          return false;
        }
      }
      return true;
    }
    /**
     * Match any expression in the given set against the current path.
     * @param {ExpressionSet} exprSet
     * @returns {boolean}
     */
    matchesAny(exprSet) {
      return exprSet.matchesAny(this);
    }
    /**
     * Create a snapshot of current state.
     * @returns {Object}
     */
    snapshot() {
      return {
        path: this.path.map((node) => ({ ...node })),
        siblingStacks: this.siblingStacks.map((level) => level ? { counts: new Map(level.counts), total: level.total } : level),
        keptAttrs: this._keptAttrs.map((entry) => ({ ...entry }))
      };
    }
    /**
     * Restore state from snapshot.
     * @param {Object} snapshot
     */
    restore(snapshot) {
      this._pathStringCache = null;
      this.path = snapshot.path.map((node) => ({ ...node }));
      this.siblingStacks = snapshot.siblingStacks.map((level) => level ? { counts: new Map(level.counts), total: level.total } : level);
      this._keptAttrs = (snapshot.keptAttrs || []).map((entry) => ({ ...entry }));
    }
    /**
     * Return the read-only {@link MatcherView} for this matcher.
     *
     * The same instance is returned on every call — no allocation occurs.
     * It always reflects the current parser state and is safe to pass to
     * user callbacks without risk of accidental mutation.
     *
     * @returns {MatcherView}
     *
     * @example
     * const view = matcher.readOnly();
     * // pass view to callbacks — it stays in sync automatically
     * view.matches(expr);       // ✓
     * view.getCurrentTag();     // ✓
     * // view.push(...)         // ✗ method does not exist — caught by TypeScript
     */
    readOnly() {
      return this._view;
    }
  };

  // ../../../node_modules/is-unsafe/src/contexts/html.js
  var HTML_PATTERNS = [
    {
      id: "html-script-open",
      description: "<script opening tag",
      pattern: /<script[\s>/]/i
    },
    {
      id: "html-script-close",
      description: "<\/script closing tag",
      pattern: /<\/script[\s>]/i
    },
    {
      id: "html-javascript-protocol",
      description: "javascript: URI scheme (with optional whitespace/encoding)",
      // Handles j&#x61;vascript:, j\u0061vascript:, and whitespace variants
      pattern: /j[\t\n\r ]*a[\t\n\r ]*v[\t\n\r ]*a[\t\n\r ]*s[\t\n\r ]*c[\t\n\r ]*r[\t\n\r ]*i[\t\n\r ]*p[\t\n\r ]*t[\t\n\r ]*:/i
    },
    {
      id: "html-vbscript-protocol",
      description: "vbscript: URI scheme",
      pattern: /vbscript[\t\n\r ]*:/i
    },
    {
      id: "html-data-html",
      description: "data:text/html URI \u2014 can execute scripts in browsers",
      pattern: /data[\t\n\r ]*:[\t\n\r ]*text\/html/i
    },
    {
      id: "html-data-xhtml",
      description: "data:application/xhtml+xml URI",
      pattern: /data[\t\n\r ]*:[\t\n\r ]*application\/xhtml/i
    },
    {
      id: "html-data-svg",
      description: "data:image/svg+xml URI \u2014 can execute scripts",
      pattern: /data[\t\n\r ]*:[\t\n\r ]*image\/svg\+xml/i
    },
    {
      id: "html-inline-event-handler",
      description: "Inline event handler attributes: onclick=, onerror=, onload=, etc.",
      // \bon ensures we match a word boundary so "phonetic=" is not caught
      pattern: /\bon\w{1,30}\s*=/i
    },
    {
      id: "html-entity-obfuscated-script",
      description: "HTML-entity-encoded <script (e.g. &#x3C;script or &lt;script)",
      // Entities include optional trailing semicolon: &#x3C; or &#x3C (both valid in HTML5)
      pattern: /(?:&#x0*3[Cc];?|&#0*60;?|&lt;)\s*script/i
    },
    {
      id: "html-entity-obfuscated-javascript",
      description: 'HTML-entity-encoded javascript: (partial \u2014 catches common &#106; or &#x6a; for "j")',
      pattern: /(?:&#x0*6[Aa];?|&#0*106;?)\s*(?:&#x0*61;?|a)[\s\S]{0,80}script\s*:/i
    },
    {
      id: "html-style-expression",
      description: "CSS expression() \u2014 IE-era code execution in style attributes",
      pattern: /style[\s\S]{0,20}expression\s*\(/i
    },
    {
      id: "html-object-embed",
      description: "<object or <embed tags that can load active content",
      pattern: /<(?:object|embed)[\s>/]/i
    },
    {
      id: "html-base-tag",
      description: "<base href= \u2014 can hijack all relative URLs on a page",
      pattern: /<base[\s>]/i
    },
    {
      id: "html-meta-refresh",
      description: '<meta http-equiv="refresh" \u2014 can redirect users',
      pattern: /<meta[\s\S]{0,40}http-equiv[\s\S]{0,20}refresh/i
    },
    {
      id: "html-srcdoc",
      description: "srcdoc= attribute on iframes \u2014 embeds HTML that can run scripts",
      pattern: /srcdoc\s*=/i
    },
    {
      id: "html-iframe",
      description: "<iframe tag",
      pattern: /<iframe[\s>/]/i
    },
    {
      id: "html-form",
      description: "<form tag \u2014 can be used for phishing / credential harvesting injection",
      pattern: /<form[\s>/]/i
    }
  ];
  var html_default = HTML_PATTERNS;

  // ../../../node_modules/is-unsafe/src/contexts/xml.js
  var XML_PATTERNS = [
    {
      id: "xml-cdata-injection",
      description: "CDATA section injection: <![CDATA[ breaks out of text node context",
      pattern: /<!\[CDATA\[/i
    },
    {
      id: "xml-cdata-close",
      description: "CDATA close sequence: ]]> can terminate an enclosing CDATA section",
      pattern: /\]\]>/
    },
    {
      id: "xml-processing-instruction",
      description: "XML processing instruction: <?xml-stylesheet or <?php etc.",
      pattern: /<\?(?:xml[\- ]|php|asp)/i
    },
    {
      id: "xml-doctype-injection",
      description: "DOCTYPE declaration embedded in content \u2014 can define entities",
      // Match <!DOCTYPE followed by end-of-string, whitespace, or [ (internal subset)
      pattern: /<!DOCTYPE(?:[\s[]|$)/i
    },
    {
      id: "xml-entity-system",
      description: "SYSTEM keyword \u2014 used in external entity declarations (XXE)",
      pattern: /\bSYSTEM\s+["']/i
    },
    {
      id: "xml-entity-public",
      description: "PUBLIC keyword \u2014 used in external entity declarations (XXE)",
      pattern: /\bPUBLIC\s+["']/i
    },
    {
      id: "xml-entity-declaration",
      description: "<!ENTITY declaration \u2014 defines entities, potential XXE or entity expansion",
      pattern: /<!ENTITY[\s%]/i
    },
    {
      id: "xml-billion-laughs",
      description: "Entity reference chaining / billion laughs: repeated &eX; style references",
      // Heuristic: 3+ consecutive entity refs suggests expansion attack
      pattern: /(?:&\w{1,20};){3,}/
    },
    {
      id: "xml-namespace-confusion",
      description: "xmlns: attribute injection \u2014 can redefine namespaces to confuse parsers",
      pattern: /\bxmlns\s*(?::\w{1,40})?\s*=/i
    },
    {
      id: "xml-comment-injection",
      description: "<!-- comment injection \u2014 can hide content from some parsers",
      pattern: /<!--/
    },
    {
      id: "xml-comment-close",
      description: "--> closes an enclosing XML comment",
      pattern: /-->/
    },
    {
      id: "xml-pi-close",
      description: "?> closes an enclosing processing instruction",
      pattern: /\?>/
    }
  ];
  var xml_default = XML_PATTERNS;

  // ../../../node_modules/is-unsafe/src/contexts/svg.js
  var SVG_PATTERNS = [
    {
      id: "svg-script-element",
      description: "<script element inside SVG executes JavaScript",
      pattern: /<script[\s>/]/i
    },
    {
      id: "svg-xlink-href-javascript",
      description: "xlink:href with javascript: \u2014 classic SVG XSS via <a> or <use>",
      pattern: /xlink\s*:\s*href\s*=\s*["']?\s*javascript\s*:/i
    },
    {
      id: "svg-href-javascript",
      description: "href= with javascript: in SVG context (<a>, <animate>, etc.)",
      pattern: /href\s*=\s*["']?\s*javascript\s*:/i
    },
    {
      id: "svg-foreignobject",
      description: "<foreignObject embeds HTML inside SVG \u2014 can execute scripts",
      pattern: /<foreignObject[\s>/]/i
    },
    {
      id: "svg-use-external",
      description: "<use xlink:href or href pointing to external resource (non-fragment URL)",
      // Match <use with href= where the value starts with a non-# character (external URL)
      // [\"'][^#] catches quoted values not starting with #; [^\"'#\s>] catches unquoted
      pattern: /<use[\s\S]{0,60}(?:xlink\s*:\s*)?href\s*=\s*(?:["'][^#]|[^"'#\s>])/i
    },
    {
      id: "svg-animate-href",
      description: '<animate attributeName="href" \u2014 can dynamically change href to javascript:',
      pattern: /<animate[\s\S]{0,80}attributeName\s*=\s*["'][\s]*href["']/i
    },
    {
      id: "svg-animate-xlinkhref",
      description: '<animate attributeName="xlink:href"',
      pattern: /<animate[\s\S]{0,80}attributeName\s*=\s*["'][\s]*xlink\s*:\s*href["']/i
    },
    {
      id: "svg-set-javascript",
      description: '<set to="javascript:..." \u2014 sets an attribute to a javascript: URI',
      pattern: /<set[\s\S]{0,80}to\s*=\s*["']?\s*javascript\s*:/i
    },
    {
      id: "svg-event-handler",
      description: "SVG-specific event handler attributes: onload=, onerror=, onactivate=, etc.",
      pattern: /\bon(?:load|error|activate|begin|end|repeat|focus|blur|click|mouse\w{1,20}|key\w{1,20})\s*=/i
    },
    {
      id: "svg-handler-generic",
      description: "Generic on* handler catch-all for SVG attributes",
      pattern: /\bon\w{1,30}\s*=/i
    },
    {
      id: "svg-filter-feimage",
      description: "<feImage href= \u2014 filter primitive that can load external resources",
      pattern: /<feImage[\s\S]{0,80}(?:xlink\s*:\s*)?href\s*=/i
    },
    {
      id: "svg-image-external",
      description: "<image xlink:href with http/https or javascript protocol",
      pattern: /<image[\s\S]{0,80}(?:xlink\s*:\s*)?href\s*=\s*["']?\s*(?:https?|javascript)\s*:/i
    },
    {
      id: "svg-style-javascript",
      description: "style= attribute containing javascript: (e.g. background:url(javascript:...))",
      pattern: /style\s*=[\s\S]{0,60}javascript\s*:/i
    }
  ];
  var svg_default = SVG_PATTERNS;

  // ../../../node_modules/is-unsafe/src/contexts/sql.js
  var SQL_PATTERNS = [
    {
      id: "sql-block-comment-open",
      description: "SQL block comment open: /* ... */ \u2014 unusual in legitimate user text",
      pattern: /\/\*/
    },
    {
      id: "sql-union-select",
      description: "UNION SELECT \u2014 most common SQL injection aggregation attack",
      pattern: /\bUNION\s{1,20}(?:ALL\s{1,20})?SELECT\b/i
    },
    {
      id: "sql-drop-table",
      description: "DROP TABLE \u2014 destructive DDL injection",
      pattern: /\bDROP\s{1,20}TABLE\b/i
    },
    {
      id: "sql-drop-database",
      description: "DROP DATABASE \u2014 destructive DDL injection",
      pattern: /\bDROP\s{1,20}DATABASE\b/i
    },
    {
      id: "sql-insert-into",
      description: "INSERT INTO \u2014 data injection",
      pattern: /\bINSERT\s{1,20}INTO\b/i
    },
    {
      id: "sql-delete-from",
      description: "DELETE FROM \u2014 data deletion injection",
      pattern: /\bDELETE\s{1,20}FROM\b/i
    },
    {
      id: "sql-update-set",
      description: "UPDATE ... SET \u2014 data modification injection",
      // Allows arbitrary content between UPDATE and SET (table name, alias, etc.)
      pattern: /\bUPDATE\b[\s\S]{1,60}\bSET\b/i
    },
    {
      id: "sql-exec-xp",
      description: "EXEC xp_ \u2014 MSSQL extended stored procedure execution",
      pattern: /\bEXEC(?:UTE)?\s{1,20}xp_/i
    },
    {
      id: "sql-tautology-string",
      description: `Classic string tautology: ' OR '1'='1 or " OR "1"="1"`,
      // Last quote is optional — injection may truncate it: ' OR '1'='1--
      pattern: /'\s{0,10}OR\s{0,10}'[^']{0,20}'\s*=\s*'[^']{0,20}/i
    },
    {
      id: "sql-tautology-numeric",
      description: "Numeric tautology: OR 1=1",
      pattern: /\bOR\s{1,10}1\s*=\s*1\b/i
    },
    {
      id: "sql-always-true-zero",
      description: "Numeric tautology: OR 0=0",
      pattern: /\bOR\s{1,10}0\s*=\s*0\b/i
    },
    {
      id: "sql-sleep-benchmark",
      description: "Time-based blind injection: SLEEP() or BENCHMARK()",
      pattern: /\b(?:SLEEP|BENCHMARK)\s*\(/i
    },
    {
      id: "sql-waitfor-delay",
      description: "MSSQL time-based blind injection: WAITFOR DELAY",
      pattern: /\bWAITFOR\s{1,20}DELAY\b/i
    },
    {
      id: "sql-char-function",
      description: "CHAR() function \u2014 used to obfuscate injected strings",
      pattern: /\bCHAR\s*\(\s*\d{1,3}/i
    },
    {
      id: "sql-information-schema",
      description: "INFORMATION_SCHEMA \u2014 reconnaissance query for table/column enumeration",
      pattern: /\bINFORMATION_SCHEMA\b/i
    }
  ];
  var sql_default = SQL_PATTERNS;

  // ../../../node_modules/is-unsafe/src/contexts/shell.js
  var SHELL_PATTERNS = [
    {
      id: "shell-path-traversal-unix",
      description: "Unix path traversal: ../  \u2014 climbing the directory tree",
      pattern: /\.\.\//
    },
    {
      id: "shell-path-traversal-windows",
      description: "Windows path traversal: ..\\ \u2014 climbing the directory tree",
      pattern: /\.\.\\/
    },
    {
      id: "shell-path-traversal-encoded",
      description: "URL-encoded path traversal: %2e%2e or %2f variants",
      pattern: /%2e%2e|%2f\.\.|\.\.%2f/i
    },
    {
      id: "shell-null-byte",
      description: "Null byte injection: \\x00 or %00 \u2014 truncates strings in C-backed functions",
      pattern: /\x00|%00/
    },
    {
      id: "shell-semicolon",
      description: "Semicolon command separator: cmd1; cmd2",
      pattern: /;/
    },
    {
      id: "shell-pipe",
      description: "Pipe operator: cmd1 | cmd2",
      pattern: /\|/
    },
    {
      id: "shell-and-operator",
      description: "AND operator: cmd1 && cmd2",
      pattern: /&&/
    },
    {
      id: "shell-or-operator",
      description: "OR operator: cmd1 || cmd2",
      pattern: /\|\|/
    },
    {
      id: "shell-backtick",
      description: "Backtick command substitution: `cmd`",
      pattern: /`/
    },
    {
      id: "shell-dollar-paren",
      description: "Dollar-paren command substitution: $(cmd)",
      pattern: /\$\(/
    },
    {
      id: "shell-dollar-brace",
      description: "Dollar-brace variable expansion: ${var} \u2014 can be abused for injection",
      pattern: /\$\{/
    },
    {
      id: "shell-redirect-out",
      description: "Output redirection: cmd > file or cmd >> file",
      pattern: />{1,2}/
    },
    {
      id: "shell-redirect-in",
      description: "Input redirection: cmd < file",
      pattern: /</
    },
    {
      id: "shell-newline-injection",
      description: "Newline injection: \\n or \\r \u2014 can inject new shell commands",
      pattern: /[\n\r]/
    },
    {
      id: "shell-glob-star",
      description: "Glob expansion: * or ? \u2014 can expand to unintended files",
      // Only flag when combined with path separators to reduce false positives
      pattern: /[/\\][*?]/
    },
    {
      id: "shell-absolute-root",
      description: "Absolute root path injection: string starting with / or \\ (Windows UNC)",
      pattern: /^(?:\/|\\\\)/
    },
    {
      id: "shell-windows-drive",
      description: "Windows drive letter path injection: C:\\ or D:/",
      pattern: /^[a-zA-Z]:[/\\]/
    },
    {
      id: "shell-curl-wget",
      description: "curl/wget with URL or flags \u2014 can exfiltrate data or download payloads",
      // Require a URL scheme (http/https/ftp) or a flag (-) to reduce false positives
      // "curl is a tool" won't match; "curl http://..." or "curl -s ..." will
      pattern: /\b(?:curl|wget)\s+(?:https?:\/\/|ftp:\/\/|-)/i
    }
  ];
  var shell_default = SHELL_PATTERNS;

  // ../../../node_modules/is-unsafe/src/contexts/redos.js
  var REDOS_PATTERNS = [
    {
      id: "redos-nested-quantifier-plus",
      description: "Nested + quantifier inside a group with outer quantifier: (a+)+, (.+b)*, etc.",
      // Matches any group containing a + quantifier, with an outer * or + — catches (a+)+, (.+b)*, etc.
      pattern: /\([^)]*\+[^)]*\)[+*]/
    },
    {
      id: "redos-nested-quantifier-star",
      description: "Nested * quantifier: (a*)* or (a*)+ \u2014 catastrophic backtracking",
      pattern: /\([^)]*\*[^)]*\)[*+]/
    },
    {
      id: "redos-nested-groups",
      description: "Doubly nested quantified groups: ((a+)+) \u2014 guaranteed catastrophic",
      pattern: /\(\([^)]{0,40}\)[+*]\)[+*]/
    },
    {
      id: "redos-alternation-overlap",
      description: "Overlapping alternation under quantifier: (a|a)+ \u2014 ambiguous NFA paths",
      // Detect repeated identical alternatives under a quantifier
      pattern: /\(([^|()]{1,20})\|(?:\1)(?:\|[^|()]{1,20}){0,5}\)[+*?]{1,2}/
    },
    {
      id: "redos-star-plus-concat",
      description: "(x*x)+ pattern \u2014 triggers super-linear backtracking",
      pattern: /\([^)]{0,10}\*[^)]{0,10}\)[+*]/
    },
    {
      id: "redos-dot-star-greedy",
      description: "(.*){n,} or (.+){n,} \u2014 repeated greedy dot quantifiers",
      pattern: /\(\.[*+]\)\{?\d/
    },
    {
      id: "redos-large-repetition",
      description: "Very large fixed or range repetition count {1000,} or {1000,n} \u2014 denial of service via backtracking",
      // Matches { followed by 4+ digits (≥1000), then optional ,digits }
      pattern: /\{\d{4,}(?:,\d*)?\}/
    },
    {
      id: "redos-catastrophic-alternation",
      description: "Long alternation with many similar branches \u2014 polynomial backtracking risk",
      // Heuristic: 10+ pipe-separated alternatives in a single group
      pattern: /\([^)]{0,200}(?:\|[^|)]{0,50}){9,}\)/
    }
  ];
  var redos_default = REDOS_PATTERNS;

  // ../../../node_modules/is-unsafe/src/contexts/nosql.js
  var sep = `["'\\s]*:`;
  var NOSQL_PATTERNS = [
    // ─── MongoDB $ operator injection ────────────────────────────────────────
    {
      id: "nosql-where-operator",
      description: "$where \u2014 executes arbitrary JavaScript server-side in MongoDB",
      pattern: new RegExp(`\\$where${sep}`, "i")
    },
    {
      id: "nosql-ne-operator",
      description: '$ne \u2014 "not equal" operator used to bypass equality checks',
      pattern: new RegExp(`\\$ne${sep}`, "i")
    },
    {
      id: "nosql-gt-operator",
      description: '$gt \u2014 "greater than" used to bypass password/value checks',
      pattern: new RegExp(`\\$gte?${sep}`, "i")
    },
    {
      id: "nosql-lt-operator",
      description: '$lt / $lte \u2014 "less than" bypass variants',
      pattern: new RegExp(`\\$lte?${sep}`, "i")
    },
    {
      id: "nosql-regex-operator",
      description: "$regex \u2014 can be used to extract data character by character (blind injection)",
      pattern: new RegExp(`\\$regex${sep}`, "i")
    },
    {
      id: "nosql-or-operator",
      description: "$or \u2014 logical OR; used to create always-true conditions",
      pattern: new RegExp(`\\$or${sep}\\s*\\[`, "i")
    },
    {
      id: "nosql-and-operator",
      description: "$and \u2014 logical AND operator injection",
      pattern: new RegExp(`\\$and${sep}\\s*\\[`, "i")
    },
    {
      id: "nosql-nor-operator",
      description: "$nor \u2014 logical NOR operator injection",
      pattern: new RegExp(`\\$nor${sep}\\s*\\[`, "i")
    },
    {
      id: "nosql-exists-operator",
      description: "$exists \u2014 can enumerate fields to determine schema",
      pattern: new RegExp(`\\$exists${sep}`, "i")
    },
    {
      id: "nosql-in-operator",
      description: "$in \u2014 matches any value in a list; can enumerate values",
      pattern: new RegExp(`\\$in${sep}\\s*\\[`, "i")
    },
    {
      id: "nosql-expr-operator",
      description: "$expr \u2014 allows aggregation expressions in queries (MongoDB 3.6+)",
      pattern: new RegExp(`\\$expr${sep}`, "i")
    },
    {
      id: "nosql-function-operator",
      description: "$function \u2014 executes arbitrary JavaScript in MongoDB 4.4+",
      pattern: new RegExp(`\\$function${sep}`, "i")
    },
    {
      id: "nosql-accumulator-operator",
      description: "$accumulator \u2014 custom aggregation with arbitrary JS execution",
      pattern: new RegExp(`\\$accumulator${sep}`, "i")
    },
    // ─── Prototype pollution ─────────────────────────────────────────────────
    {
      id: "nosql-proto-pollution",
      description: "__proto__ \u2014 prototype pollution via object key injection",
      pattern: /__proto__/
    },
    {
      id: "nosql-constructor-prototype",
      description: "constructor.prototype \u2014 alternative prototype pollution vector (dot notation or JSON key)",
      // Matches dot-notation (obj.constructor.prototype) and JSON key adjacency
      // ("constructor": {"prototype": ...})
      pattern: /constructor[\s"':.,{\[]*prototype/i
    },
    {
      id: "nosql-proto-bracket",
      description: '["__proto__"] \u2014 bracket-notation prototype pollution',
      pattern: /\[["']__proto__["']\]/
    }
  ];
  var nosql_default = NOSQL_PATTERNS;

  // ../../../node_modules/is-unsafe/src/contexts/log.js
  var LOG_PATTERNS = [
    // ─── CRLF / newline injection ─────────────────────────────────────────────
    {
      id: "log-crlf-injection",
      description: "CRLF injection: literal \\r or \\n embeds fake log lines",
      pattern: /[\r\n]/
    },
    {
      id: "log-url-encoded-crlf",
      description: "URL-encoded CRLF: %0d, %0a, %0D, %0A \u2014 decoded by some log parsers",
      pattern: /%0[dDaA]/
    },
    {
      id: "log-unicode-newline",
      description: "Unicode newline variants: U+2028 (line separator), U+2029 (paragraph separator)",
      pattern: /[\u2028\u2029]/
    },
    // ─── Log4Shell / JNDI injection (CVE-2021-44228) ─────────────────────────
    {
      id: "log-log4shell-jndi",
      description: "Log4Shell: ${jndi:...} triggers remote code execution in Apache Log4j",
      pattern: /\$\{jndi\s*:/i
    },
    {
      id: "log-log4shell-obfuscated",
      description: "Obfuscated Log4Shell: ${::-j}... lookup-bypass prefix used to evade WAF detection",
      // ${::- is the Log4j lookup-bypass escape sequence; presence alone is suspicious
      pattern: /\$\{::-/
    },
    {
      id: "log-log4j-lookup",
      description: "Log4j lookup syntax: ${env:...}, ${sys:...}, ${ctx:...} \u2014 data exfiltration",
      pattern: /\$\{(?:env|sys|ctx|main|map|sd|web|docker|k8s|spring)\s*:/i
    },
    // ─── Server-Side Template Injection (SSTI) in log messages ───────────────
    {
      id: "log-ssti-double-brace",
      description: "SSTI double-brace: {{expression}} \u2014 Jinja2, Twig, Handlebars, etc.",
      pattern: /\{\{[\s\S]{0,80}\}\}/
    },
    {
      id: "log-ssti-hash-brace",
      description: "SSTI hash-brace: #{expression} \u2014 Thymeleaf, Velocity, Ruby ERB",
      pattern: /#\{[\s\S]{0,80}\}/
    },
    {
      id: "log-ssti-dollar-brace",
      description: "SSTI/EL injection: ${expression with operators or method calls} \u2014 JSP EL, Freemarker, SpEL",
      // Require that the ${...} content looks like an expression, not a plain variable name.
      // Flags if the content contains: . ( * + operators, or known SSTI keywords.
      // This avoids flagging ${PATH}, ${HOME} etc. (plain shell variables).
      pattern: /\$\{[^}]*(?:\.|\(|\*|\+|\bclass\b|\bruntime\b|\bprocess\b|\bexec\b)[^}]{0,80}\}/i
    },
    {
      id: "log-ssti-percent-tag",
      description: "SSTI ERB/ASP tag: <%= expression %> \u2014 Ruby ERB, ASP",
      pattern: /<%=[\s\S]{0,80}%>/
    },
    // ─── Null byte ────────────────────────────────────────────────────────────
    {
      id: "log-null-byte",
      description: "Null byte: \\x00 or %00 \u2014 can truncate log entries in C-backed loggers",
      pattern: /\x00|%00/
    },
    // ─── ANSI escape injection ────────────────────────────────────────────────
    {
      id: "log-ansi-escape",
      description: "ANSI escape sequence: ESC[ \u2014 can manipulate terminal output when logs are tailed",
      pattern: /\x1b\[/
    }
  ];
  var log_default = LOG_PATTERNS;

  // ../../../node_modules/is-unsafe/src/contexts/sql-strict.js
  var SQL_STRICT_EXTRA = [
    {
      id: "sql-line-comment",
      description: "SQL line comment: -- followed by whitespace or end of string",
      pattern: /--(?:\s|$)/
    },
    {
      id: "sql-stacked-query",
      description: "Stacked queries: semicolon immediately followed by a SQL keyword",
      pattern: /;\s{0,10}(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC)\b/i
    },
    {
      id: "sql-hex-encoding",
      description: "Hex-encoded string injection: 0x41414141 style (MySQL)",
      pattern: /\b0x[0-9a-f]{4,}/i
    }
  ];
  var SQL_STRICT_PATTERNS = [...sql_default, ...SQL_STRICT_EXTRA];
  var sql_strict_default = SQL_STRICT_PATTERNS;

  // ../../../node_modules/is-unsafe/src/index.js
  html_default.label = "HTML";
  xml_default.label = "XML";
  svg_default.label = "SVG";
  sql_default.label = "SQL";
  sql_strict_default.label = "SQL-STRICT";
  shell_default.label = "SHELL";
  redos_default.label = "REDOS";
  nosql_default.label = "NOSQL";
  log_default.label = "LOG";
  var VALID_CONTEXTS = Object.freeze({
    HTML: html_default,
    XML: xml_default,
    SVG: svg_default,
    SQL: sql_default,
    "SQL-STRICT": sql_strict_default,
    SHELL: shell_default,
    REDOS: redos_default,
    NOSQL: nosql_default,
    LOG: log_default
  });
  function assertString(value) {
    if (typeof value !== "string") {
      throw new TypeError(
        `is-unsafe: first argument must be a string, got ${typeof value}`
      );
    }
  }
  function assertContext(context) {
    if (context instanceof RegExp) return;
    if (Array.isArray(context)) {
      if (context.length === 0) {
        throw new TypeError("is-unsafe: context must not be an empty array");
      }
      if (Array.isArray(context[0])) {
        for (const list of context) {
          if (!Array.isArray(list) || list.length === 0) {
            throw new TypeError(
              "is-unsafe: each context in the array must be a non-empty pattern array (PatternList)"
            );
          }
        }
      }
      return;
    }
    throw new TypeError(
      `is-unsafe: second argument must be a PatternList (e.g. HTML), an array of PatternLists (e.g. [HTML, XML]), or a RegExp. Got: ${typeof context}`
    );
  }
  function normalise(context) {
    if (context instanceof RegExp) return { lists: null, regex: context };
    if (Array.isArray(context[0])) return { lists: context, regex: null };
    return { lists: [context], regex: null };
  }
  function matchList(value, list) {
    const label = list.label ?? "CUSTOM";
    for (const rule of list) {
      if (rule.pattern.test(value)) {
        return { context: label, id: rule.id, description: rule.description, pattern: rule.pattern };
      }
    }
    return null;
  }
  function isUnsafe(value, context) {
    assertString(value);
    assertContext(context);
    const { lists, regex } = normalise(context);
    if (regex) return regex.test(value);
    for (const list of lists) {
      if (matchList(value, list) !== null) return true;
    }
    return false;
  }

  // ../../../node_modules/fast-xml-parser/src/xmlparser/OrderedObjParser.js
  function extractRawAttributes(prefixedAttrs, options) {
    if (!prefixedAttrs) return {};
    const attrs = options.attributesGroupName ? prefixedAttrs[options.attributesGroupName] : prefixedAttrs;
    if (!attrs) return {};
    const rawAttrs = {};
    for (const key in attrs) {
      if (key.startsWith(options.attributeNamePrefix)) {
        const rawName = key.substring(options.attributeNamePrefix.length);
        rawAttrs[rawName] = attrs[key];
      } else {
        rawAttrs[key] = attrs[key];
      }
    }
    return rawAttrs;
  }
  function extractNamespace(rawTagName) {
    if (!rawTagName || typeof rawTagName !== "string") return void 0;
    const colonIndex = rawTagName.indexOf(":");
    if (colonIndex !== -1 && colonIndex > 0) {
      const ns = rawTagName.substring(0, colonIndex);
      if (ns !== "xmlns") {
        return ns;
      }
    }
    return void 0;
  }
  var OrderedObjParser = class {
    constructor(options, externalEntities) {
      this.options = options;
      this.currentNode = null;
      this.tagsNodeStack = [];
      this.parseXml = parseXml;
      this.parseTextData = parseTextData;
      this.resolveNameSpace = resolveNameSpace;
      this.buildAttributesMap = buildAttributesMap;
      this.isItStopNode = isItStopNode;
      this.replaceEntitiesValue = replaceEntitiesValue;
      this.readStopNodeData = readStopNodeData;
      this.saveTextToParentTag = saveTextToParentTag;
      this.addChild = addChild;
      this.ignoreAttributesFn = getIgnoreAttributesFn(this.options.ignoreAttributes);
      this.entityExpansionCount = 0;
      this.currentExpandedLength = 0;
      this.doctypefound = false;
      let namedEntities = { ...XML };
      if (this.options.entityDecoder) {
        this.entityDecoder = this.options.entityDecoder;
      } else {
        if (typeof this.options.htmlEntities === "object") namedEntities = this.options.htmlEntities;
        else if (this.options.htmlEntities === true) namedEntities = { ...COMMON_HTML, ...CURRENCY };
        this.entityDecoder = new EntityDecoder({
          namedEntities: { ...namedEntities, ...externalEntities },
          numericAllowed: this.options.htmlEntities,
          limit: {
            maxTotalExpansions: this.options.processEntities.maxTotalExpansions,
            maxExpandedLength: this.options.processEntities.maxExpandedLength,
            applyLimitsTo: this.options.processEntities.appliesTo
          },
          // onExternalEntity: (name, value) => isUnsafe(value) ? 'block' : 'allow',
          onInputEntity: (name, value) => (
            //TODO: VALID_CONTEXTS.HTML should be set only if this.options.htmlEntities
            isUnsafe(value, [html_default, xml_default]) ? ENTITY_ACTION.BLOCK : ENTITY_ACTION.ALLOW
          )
          //postCheck: resolved => resolved
        });
      }
      this.matcher = new Matcher();
      this.readonlyMatcher = this.matcher.readOnly();
      this.isCurrentNodeStopNode = false;
      this.stopNodeExpressionsSet = new ExpressionSet();
      const stopNodesOpts = this.options.stopNodes;
      if (stopNodesOpts && stopNodesOpts.length > 0) {
        for (let i = 0; i < stopNodesOpts.length; i++) {
          const stopNodeExp = stopNodesOpts[i];
          if (typeof stopNodeExp === "string") {
            this.stopNodeExpressionsSet.add(new Expression(stopNodeExp));
          } else if (stopNodeExp instanceof Expression) {
            this.stopNodeExpressionsSet.add(stopNodeExp);
          }
        }
        this.stopNodeExpressionsSet.seal();
      }
    }
  };
  function parseTextData(val, tagName, jPath, dontTrim, hasAttributes, isLeafNode, escapeEntities) {
    const options = this.options;
    if (val !== void 0) {
      if (options.trimValues && !dontTrim) {
        val = val.trim();
      }
      if (val.length > 0) {
        if (!escapeEntities) val = this.replaceEntitiesValue(val, tagName, jPath);
        const jPathOrMatcher = options.jPath ? jPath.toString() : jPath;
        const newval = options.tagValueProcessor(tagName, val, jPathOrMatcher, hasAttributes, isLeafNode);
        if (newval === null || newval === void 0) {
          return val;
        } else if (typeof newval !== typeof val || newval !== val) {
          return newval;
        } else if (options.trimValues) {
          return parseValue(val, options.parseTagValue, options.numberParseOptions);
        } else {
          const trimmedVal = val.trim();
          if (trimmedVal === val) {
            return parseValue(val, options.parseTagValue, options.numberParseOptions);
          } else {
            return val;
          }
        }
      }
    }
  }
  function resolveNameSpace(tagname) {
    if (this.options.removeNSPrefix) {
      const tags = tagname.split(":");
      const prefix = tagname.charAt(0) === "/" ? "/" : "";
      if (tags[0] === "xmlns") {
        return "";
      }
      if (tags.length === 2) {
        tagname = prefix + tags[1];
      }
    }
    return tagname;
  }
  var attrsRegx = new RegExp(`([^\\s=]+)\\s*(=\\s*(['"])([\\s\\S]*?)\\3)?`, "gm");
  function buildAttributesMap(attrStr, jPath, tagName, force = false) {
    const options = this.options;
    if (force === true || options.ignoreAttributes !== true && typeof attrStr === "string") {
      const matches = getAllMatches(attrStr, attrsRegx);
      const len = matches.length;
      const attrs = {};
      const processedVals = new Array(len);
      let hasRawAttrs = false;
      const rawAttrsForMatcher = {};
      for (let i = 0; i < len; i++) {
        const attrName = this.resolveNameSpace(matches[i][1]);
        const oldVal = matches[i][4];
        if (attrName.length && oldVal !== void 0) {
          let val = oldVal;
          if (options.trimValues) val = val.trim();
          val = this.replaceEntitiesValue(val, tagName, this.readonlyMatcher);
          processedVals[i] = val;
          rawAttrsForMatcher[attrName] = val;
          hasRawAttrs = true;
        }
      }
      if (hasRawAttrs && typeof jPath === "object" && jPath.updateCurrent) {
        jPath.updateCurrent(rawAttrsForMatcher);
      }
      const jPathStr = options.jPath ? jPath.toString() : this.readonlyMatcher;
      let hasAttrs = false;
      for (let i = 0; i < len; i++) {
        const attrName = this.resolveNameSpace(matches[i][1]);
        if (this.ignoreAttributesFn(attrName, jPathStr)) continue;
        let aName = options.attributeNamePrefix + attrName;
        if (attrName.length) {
          if (options.transformAttributeName) {
            aName = options.transformAttributeName(aName);
          }
          aName = sanitizeName(aName, options);
          if (matches[i][4] !== void 0) {
            const oldVal = processedVals[i];
            const newVal = options.attributeValueProcessor(attrName, oldVal, jPathStr);
            if (newVal === null || newVal === void 0) {
              attrs[aName] = oldVal;
            } else if (typeof newVal !== typeof oldVal || newVal !== oldVal) {
              attrs[aName] = newVal;
            } else {
              attrs[aName] = parseValue(oldVal, options.parseAttributeValue, options.numberParseOptions);
            }
            hasAttrs = true;
          } else if (options.allowBooleanAttributes) {
            attrs[aName] = true;
            hasAttrs = true;
          }
        }
      }
      if (!hasAttrs) return;
      if (options.attributesGroupName && !options.preserveOrder) {
        const attrCollection = {};
        attrCollection[options.attributesGroupName] = attrs;
        return attrCollection;
      }
      return attrs;
    }
  }
  var parseXml = function(xmlData) {
    xmlData = xmlData.replace(/\r\n?/g, "\n");
    const xmlObj = new XmlNode("!xml");
    let currentNode = xmlObj;
    let textData = "";
    this.matcher.reset();
    this.entityDecoder.reset();
    this.entityExpansionCount = 0;
    this.currentExpandedLength = 0;
    this.doctypefound = false;
    const options = this.options;
    const docTypeReader = new DocTypeReader(options.processEntities);
    const xmlLen = xmlData.length;
    for (let i = 0; i < xmlLen; i++) {
      const ch = xmlData[i];
      if (ch === "<") {
        const c1 = xmlData.charCodeAt(i + 1);
        if (c1 === 47) {
          const closeIndex = findClosingIndex(xmlData, ">", i, "Closing Tag is not closed.");
          let tagName = xmlData.substring(i + 2, closeIndex).trim();
          if (options.removeNSPrefix) {
            const colonIndex = tagName.indexOf(":");
            if (colonIndex !== -1) {
              tagName = tagName.substr(colonIndex + 1);
            }
          }
          tagName = transformTagName(options.transformTagName, tagName, "", options).tagName;
          if (currentNode) {
            textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
          }
          const lastTagName = this.matcher.getCurrentTag();
          if (tagName && options.unpairedTagsSet.has(tagName)) {
            throw new Error(`Unpaired tag can not be used as closing tag: </${tagName}>`);
          }
          if (lastTagName && options.unpairedTagsSet.has(lastTagName)) {
            this.matcher.pop();
            this.tagsNodeStack.pop();
          }
          this.matcher.pop();
          this.isCurrentNodeStopNode = false;
          currentNode = this.tagsNodeStack.pop();
          textData = "";
          i = closeIndex;
        } else if (c1 === 63) {
          let tagData = readTagExp(xmlData, i, false, "?>");
          if (!tagData) throw new Error("Pi Tag is not closed.");
          textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
          const attsMap = this.buildAttributesMap(tagData.tagExp, this.matcher, tagData.tagName, true);
          if (attsMap) {
            const ver = attsMap[this.options.attributeNamePrefix + "version"];
            this.entityDecoder.setXmlVersion(Number(ver) || 1);
            docTypeReader.setXmlVersion(Number(ver) || 1);
          }
          if (options.ignoreDeclaration && tagData.tagName === "?xml" || options.ignorePiTags) {
          } else {
            const childNode = new XmlNode(tagData.tagName);
            childNode.add(options.textNodeName, "");
            if (tagData.tagName !== tagData.tagExp && tagData.attrExpPresent && options.ignoreAttributes !== true) {
              childNode[":@"] = attsMap;
            }
            this.addChild(currentNode, childNode, this.readonlyMatcher, i);
          }
          i = tagData.closeIndex + 1;
        } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 45 && xmlData.charCodeAt(i + 3) === 45) {
          const endIndex = findClosingIndex(xmlData, "-->", i + 4, "Comment is not closed.");
          if (options.commentPropName) {
            const comment = xmlData.substring(i + 4, endIndex - 2);
            textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
            currentNode.add(options.commentPropName, [{ [options.textNodeName]: comment }]);
          }
          i = endIndex;
        } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 68) {
          if (this.doctypefound) throw new Error("Multiple DOCTYPE declarations found.");
          this.doctypefound = true;
          const result = docTypeReader.readDocType(xmlData, i);
          this.entityDecoder.addInputEntities(result.entities);
          i = result.i;
        } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 91) {
          const closeIndex = findClosingIndex(xmlData, "]]>", i, "CDATA is not closed.") - 2;
          const tagExp = xmlData.substring(i + 9, closeIndex);
          textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
          let val = this.parseTextData(tagExp, currentNode.tagname, this.readonlyMatcher, true, false, true, true);
          if (val == void 0) val = "";
          if (options.cdataPropName) {
            currentNode.add(options.cdataPropName, [{ [options.textNodeName]: tagExp }]);
          } else {
            currentNode.add(options.textNodeName, val);
          }
          i = closeIndex + 2;
        } else {
          let result = readTagExp(xmlData, i, options.removeNSPrefix);
          if (!result) {
            const context = xmlData.substring(Math.max(0, i - 50), Math.min(xmlLen, i + 50));
            throw new Error(`readTagExp returned undefined at position ${i}. Context: "${context}"`);
          }
          let tagName = result.tagName;
          const rawTagName = result.rawTagName;
          let tagExp = result.tagExp;
          let attrExpPresent = result.attrExpPresent;
          let closeIndex = result.closeIndex;
          ({ tagName, tagExp } = transformTagName(options.transformTagName, tagName, tagExp, options));
          if (options.strictReservedNames && (tagName === options.commentPropName || tagName === options.cdataPropName || tagName === options.textNodeName || tagName === options.attributesGroupName)) {
            throw new Error(`Invalid tag name: ${tagName}`);
          }
          if (currentNode && textData) {
            if (currentNode.tagname !== "!xml") {
              textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher, false);
            }
          }
          const lastTag = currentNode;
          if (lastTag && options.unpairedTagsSet.has(lastTag.tagname)) {
            currentNode = this.tagsNodeStack.pop();
            this.matcher.pop();
          }
          let isSelfClosing = false;
          if (tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1) {
            isSelfClosing = true;
            if (tagName[tagName.length - 1] === "/") {
              tagName = tagName.substr(0, tagName.length - 1);
              tagExp = tagName;
            } else {
              tagExp = tagExp.substr(0, tagExp.length - 1);
            }
            attrExpPresent = tagName !== tagExp;
          }
          let prefixedAttrs = null;
          let rawAttrs = {};
          let namespace = void 0;
          namespace = extractNamespace(rawTagName);
          if (tagName !== xmlObj.tagname) {
            this.matcher.push(tagName, {}, namespace);
          }
          if (tagName !== tagExp && attrExpPresent) {
            prefixedAttrs = this.buildAttributesMap(tagExp, this.matcher, tagName);
            if (prefixedAttrs) {
              rawAttrs = extractRawAttributes(prefixedAttrs, options);
            }
          }
          if (tagName !== xmlObj.tagname) {
            this.isCurrentNodeStopNode = this.isItStopNode();
          }
          const startIndex = i;
          if (this.isCurrentNodeStopNode) {
            let tagContent = "";
            if (isSelfClosing) {
              i = result.closeIndex;
            } else if (options.unpairedTagsSet.has(tagName)) {
              i = result.closeIndex;
            } else {
              const result2 = this.readStopNodeData(xmlData, rawTagName, closeIndex + 1);
              if (!result2) throw new Error(`Unexpected end of ${rawTagName}`);
              i = result2.i;
              tagContent = result2.tagContent;
            }
            const childNode = new XmlNode(tagName);
            if (prefixedAttrs) {
              childNode[":@"] = prefixedAttrs;
            }
            childNode.add(options.textNodeName, tagContent);
            this.matcher.pop();
            this.isCurrentNodeStopNode = false;
            this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
          } else {
            if (isSelfClosing) {
              ({ tagName, tagExp } = transformTagName(options.transformTagName, tagName, tagExp, options));
              const childNode = new XmlNode(tagName);
              if (prefixedAttrs) {
                childNode[":@"] = prefixedAttrs;
              }
              this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
              this.matcher.pop();
              this.isCurrentNodeStopNode = false;
            } else if (options.unpairedTagsSet.has(tagName)) {
              const childNode = new XmlNode(tagName);
              if (prefixedAttrs) {
                childNode[":@"] = prefixedAttrs;
              }
              this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
              this.matcher.pop();
              this.isCurrentNodeStopNode = false;
              i = result.closeIndex;
              continue;
            } else {
              const childNode = new XmlNode(tagName);
              if (this.tagsNodeStack.length > options.maxNestedTags) {
                throw new Error("Maximum nested tags exceeded");
              }
              this.tagsNodeStack.push(currentNode);
              if (prefixedAttrs) {
                childNode[":@"] = prefixedAttrs;
              }
              this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
              currentNode = childNode;
            }
            textData = "";
            i = closeIndex;
          }
        }
      } else {
        textData += xmlData[i];
      }
    }
    return xmlObj.child;
  };
  function addChild(currentNode, childNode, matcher, startIndex) {
    if (!this.options.captureMetaData) startIndex = void 0;
    const jPathOrMatcher = this.options.jPath ? matcher.toString() : matcher;
    const result = this.options.updateTag(childNode.tagname, jPathOrMatcher, childNode[":@"]);
    if (result === false) {
    } else if (typeof result === "string") {
      childNode.tagname = result;
      currentNode.addChild(childNode, startIndex);
    } else {
      currentNode.addChild(childNode, startIndex);
    }
  }
  function replaceEntitiesValue(val, tagName, jPath) {
    const entityConfig = this.options.processEntities;
    if (!entityConfig || !entityConfig.enabled) {
      return val;
    }
    if (entityConfig.allowedTags) {
      const jPathOrMatcher = this.options.jPath ? jPath.toString() : jPath;
      const allowed = Array.isArray(entityConfig.allowedTags) ? entityConfig.allowedTags.includes(tagName) : entityConfig.allowedTags(tagName, jPathOrMatcher);
      if (!allowed) {
        return val;
      }
    }
    if (entityConfig.tagFilter) {
      const jPathOrMatcher = this.options.jPath ? jPath.toString() : jPath;
      if (!entityConfig.tagFilter(tagName, jPathOrMatcher)) {
        return val;
      }
    }
    return this.entityDecoder.decode(val);
  }
  function saveTextToParentTag(textData, parentNode, matcher, isLeafNode) {
    if (textData) {
      if (isLeafNode === void 0) isLeafNode = parentNode.child.length === 0;
      textData = this.parseTextData(
        textData,
        parentNode.tagname,
        matcher,
        false,
        parentNode[":@"] ? Object.keys(parentNode[":@"]).length !== 0 : false,
        isLeafNode
      );
      if (textData !== void 0 && textData !== "")
        parentNode.add(this.options.textNodeName, textData);
      textData = "";
    }
    return textData;
  }
  function isItStopNode() {
    if (this.stopNodeExpressionsSet.size === 0) return false;
    return this.matcher.matchesAny(this.stopNodeExpressionsSet);
  }
  function tagExpWithClosingIndex(xmlData, i, closingChar = ">") {
    let attrBoundary = 0;
    const len = xmlData.length;
    const closeCode0 = closingChar.charCodeAt(0);
    const closeCode1 = closingChar.length > 1 ? closingChar.charCodeAt(1) : -1;
    let result = "";
    let segmentStart = i;
    for (let index = i; index < len; index++) {
      const code = xmlData.charCodeAt(index);
      if (attrBoundary) {
        if (code === attrBoundary) attrBoundary = 0;
      } else if (code === 34 || code === 39) {
        attrBoundary = code;
      } else if (code === closeCode0) {
        if (closeCode1 !== -1) {
          if (xmlData.charCodeAt(index + 1) === closeCode1) {
            result += xmlData.substring(segmentStart, index);
            return { data: result, index };
          }
        } else {
          result += xmlData.substring(segmentStart, index);
          return { data: result, index };
        }
      } else if (code === 9 && !attrBoundary) {
        result += xmlData.substring(segmentStart, index) + " ";
        segmentStart = index + 1;
      }
    }
  }
  function findClosingIndex(xmlData, str, i, errMsg) {
    const closingIndex = xmlData.indexOf(str, i);
    if (closingIndex === -1) {
      throw new Error(errMsg);
    } else {
      return closingIndex + str.length - 1;
    }
  }
  function findClosingChar(xmlData, char, i, errMsg) {
    const closingIndex = xmlData.indexOf(char, i);
    if (closingIndex === -1) throw new Error(errMsg);
    return closingIndex;
  }
  function readTagExp(xmlData, i, removeNSPrefix, closingChar = ">") {
    const result = tagExpWithClosingIndex(xmlData, i + 1, closingChar);
    if (!result) return;
    let tagExp = result.data;
    const closeIndex = result.index;
    const separatorIndex = tagExp.search(/\s/);
    let tagName = tagExp;
    let attrExpPresent = true;
    if (separatorIndex !== -1) {
      tagName = tagExp.substring(0, separatorIndex);
      tagExp = tagExp.substring(separatorIndex + 1).trimStart();
    }
    const rawTagName = tagName;
    if (removeNSPrefix) {
      const colonIndex = tagName.indexOf(":");
      if (colonIndex !== -1) {
        tagName = tagName.substr(colonIndex + 1);
        attrExpPresent = tagName !== result.data.substr(colonIndex + 1);
      }
    }
    return {
      tagName,
      tagExp,
      closeIndex,
      attrExpPresent,
      rawTagName
    };
  }
  function readStopNodeData(xmlData, tagName, i) {
    const startIndex = i;
    let openTagCount = 1;
    const xmllen = xmlData.length;
    for (; i < xmllen; i++) {
      if (xmlData[i] === "<") {
        const c1 = xmlData.charCodeAt(i + 1);
        if (c1 === 47) {
          const closeIndex = findClosingChar(xmlData, ">", i, `${tagName} is not closed`);
          let closeTagName = xmlData.substring(i + 2, closeIndex).trim();
          if (closeTagName === tagName) {
            openTagCount--;
            if (openTagCount === 0) {
              return {
                tagContent: xmlData.substring(startIndex, i),
                i: closeIndex
              };
            }
          }
          i = closeIndex;
        } else if (c1 === 63) {
          const closeIndex = findClosingIndex(xmlData, "?>", i + 1, "StopNode is not closed.");
          i = closeIndex;
        } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 45 && xmlData.charCodeAt(i + 3) === 45) {
          const closeIndex = findClosingIndex(xmlData, "-->", i + 3, "StopNode is not closed.");
          i = closeIndex;
        } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 91) {
          const closeIndex = findClosingIndex(xmlData, "]]>", i, "StopNode is not closed.") - 2;
          i = closeIndex;
        } else {
          const tagData = readTagExp(xmlData, i, false);
          if (tagData) {
            const openTagName = tagData && tagData.tagName;
            if (openTagName === tagName && tagData.tagExp[tagData.tagExp.length - 1] !== "/") {
              openTagCount++;
            }
            i = tagData.closeIndex;
          }
        }
      }
    }
  }
  function parseValue(val, shouldParse, options) {
    if (shouldParse && typeof val === "string") {
      const newval = val.trim();
      if (newval === "true") return true;
      else if (newval === "false") return false;
      else return toNumber(val, options);
    } else {
      if (isExist(val)) {
        return val;
      } else {
        return "";
      }
    }
  }
  function transformTagName(fn, tagName, tagExp, options) {
    if (fn) {
      const newTagName = fn(tagName);
      if (tagExp === tagName) {
        tagExp = newTagName;
      }
      tagName = newTagName;
    }
    tagName = sanitizeName(tagName, options);
    return { tagName, tagExp };
  }
  function sanitizeName(name, options) {
    if (criticalProperties.includes(name)) {
      throw new Error(`[SECURITY] Invalid name: "${name}" is a reserved JavaScript keyword that could cause prototype pollution`);
    } else if (DANGEROUS_PROPERTY_NAMES.includes(name)) {
      return options.onDangerousProperty(name);
    }
    return name;
  }

  // ../../../node_modules/fast-xml-parser/src/xmlparser/node2json.js
  var METADATA_SYMBOL2 = XmlNode.getMetaDataSymbol();
  function stripAttributePrefix(attrs, prefix) {
    if (!attrs || typeof attrs !== "object") return {};
    if (!prefix) return attrs;
    const rawAttrs = {};
    for (const key in attrs) {
      if (key.startsWith(prefix)) {
        const rawName = key.substring(prefix.length);
        rawAttrs[rawName] = attrs[key];
      } else {
        rawAttrs[key] = attrs[key];
      }
    }
    return rawAttrs;
  }
  function prettify(node, options, matcher, readonlyMatcher) {
    return compress(node, options, matcher, readonlyMatcher);
  }
  function compress(arr, options, matcher, readonlyMatcher) {
    let text;
    const compressedObj = {};
    for (let i = 0; i < arr.length; i++) {
      const tagObj = arr[i];
      const property = propName(tagObj);
      if (property !== void 0 && property !== options.textNodeName) {
        const rawAttrs = stripAttributePrefix(
          tagObj[":@"] || {},
          options.attributeNamePrefix
        );
        matcher.push(property, rawAttrs);
      }
      if (property === options.textNodeName) {
        if (text === void 0) text = tagObj[property];
        else text += "" + tagObj[property];
      } else if (property === void 0) {
        continue;
      } else if (tagObj[property]) {
        let val = compress(tagObj[property], options, matcher, readonlyMatcher);
        const isLeaf = isLeafTag(val, options);
        if (Object.keys(val).length === 0 && options.alwaysCreateTextNode) {
          val[options.textNodeName] = "";
        }
        if (tagObj[":@"]) {
          assignAttributes(val, tagObj[":@"], readonlyMatcher, options);
        } else if (Object.keys(val).length === 1 && val[options.textNodeName] !== void 0 && !options.alwaysCreateTextNode) {
          val = val[options.textNodeName];
        } else if (Object.keys(val).length === 0) {
          if (options.alwaysCreateTextNode) val[options.textNodeName] = "";
          else val = "";
        }
        if (tagObj[METADATA_SYMBOL2] !== void 0 && typeof val === "object" && val !== null) {
          val[METADATA_SYMBOL2] = tagObj[METADATA_SYMBOL2];
        }
        if (compressedObj[property] !== void 0 && Object.prototype.hasOwnProperty.call(compressedObj, property)) {
          if (!Array.isArray(compressedObj[property])) {
            compressedObj[property] = [compressedObj[property]];
          }
          compressedObj[property].push(val);
        } else {
          const jPathOrMatcher = options.jPath ? readonlyMatcher.toString() : readonlyMatcher;
          if (options.isArray(property, jPathOrMatcher, isLeaf)) {
            compressedObj[property] = [val];
          } else {
            compressedObj[property] = val;
          }
        }
        if (property !== void 0 && property !== options.textNodeName) {
          matcher.pop();
        }
      }
    }
    if (typeof text === "string") {
      if (text.length > 0) compressedObj[options.textNodeName] = text;
    } else if (text !== void 0) compressedObj[options.textNodeName] = text;
    return compressedObj;
  }
  function propName(obj) {
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key !== ":@") return key;
    }
  }
  function assignAttributes(obj, attrMap, readonlyMatcher, options) {
    if (attrMap) {
      const keys = Object.keys(attrMap);
      const len = keys.length;
      for (let i = 0; i < len; i++) {
        const atrrName = keys[i];
        const rawAttrName = atrrName.startsWith(options.attributeNamePrefix) ? atrrName.substring(options.attributeNamePrefix.length) : atrrName;
        const jPathOrMatcher = options.jPath ? readonlyMatcher.toString() + "." + rawAttrName : readonlyMatcher;
        if (options.isArray(atrrName, jPathOrMatcher, true, true)) {
          obj[atrrName] = [attrMap[atrrName]];
        } else {
          obj[atrrName] = attrMap[atrrName];
        }
      }
    }
  }
  function isLeafTag(obj, options) {
    const { textNodeName } = options;
    const propCount = Object.keys(obj).length;
    if (propCount === 0) {
      return true;
    }
    if (propCount === 1 && (obj[textNodeName] || typeof obj[textNodeName] === "boolean" || obj[textNodeName] === 0)) {
      return true;
    }
    return false;
  }

  // ../../../node_modules/fast-xml-parser/src/xmlparser/XMLParser.js
  var XMLParser = class {
    constructor(options) {
      this.externalEntities = {};
      this.options = buildOptions(options);
    }
    /**
     * Parse XML dats to JS object 
     * @param {string|Uint8Array} xmlData 
     * @param {boolean|Object} validationOption 
     */
    parse(xmlData, validationOption) {
      if (typeof xmlData !== "string" && xmlData.toString) {
        xmlData = xmlData.toString();
      } else if (typeof xmlData !== "string") {
        throw new Error("XML data is accepted in String or Bytes[] form.");
      }
      if (validationOption) {
        if (validationOption === true) validationOption = {};
        const result = validate(xmlData, validationOption);
        if (result !== true) {
          throw Error(`${result.err.msg}:${result.err.line}:${result.err.col}`);
        }
      }
      const orderedObjParser = new OrderedObjParser(this.options, this.externalEntities);
      const orderedResult = orderedObjParser.parseXml(xmlData);
      if (this.options.preserveOrder || orderedResult === void 0) return orderedResult;
      else return prettify(orderedResult, this.options, orderedObjParser.matcher, orderedObjParser.readonlyMatcher);
    }
    /**
     * Add Entity which is not by default supported by this library
     * @param {string} key 
     * @param {string} value 
     */
    addEntity(key, value) {
      if (value.indexOf("&") !== -1) {
        throw new Error("Entity value can't have '&'");
      } else if (key.indexOf("&") !== -1 || key.indexOf(";") !== -1) {
        throw new Error("An entity must be set without '&' and ';'. Eg. use '#xD' for '&#xD;'");
      } else if (value === "&") {
        throw new Error("An entity with value '&' is not permitted");
      } else {
        this.externalEntities[key] = value;
      }
    }
    /**
     * Returns a Symbol that can be used to access the metadata
     * property on a node.
     * 
     * If Symbol is not available in the environment, an ordinary property is used
     * and the name of the property is here returned.
     * 
     * The XMLMetaData property is only present when `captureMetaData`
     * is true in the options.
     */
    static getMetaDataSymbol() {
      return XmlNode.getMetaDataSymbol();
    }
  };

  // ../engine/pptx-engine/xml-utils.ts
  function asXmlNode(v) {
    return typeof v === "object" && v !== null ? v : {};
  }
  function xmlArray(v) {
    if (Array.isArray(v)) return v.map(asXmlNode);
    return v ? [asXmlNode(v)] : [];
  }
  function escapeXmlText(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escapeXmlAttr(text) {
    return escapeXmlText(text).replace(/"/g, "&quot;");
  }

  // ../engine/pptx-engine/zip.ts
  var relsParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) => name === "Relationship" || name === "sldId" || name === "Override"
  });
  var PackageArchive = class _PackageArchive {
    constructor(zip, entries, originalHash) {
      this.zip = zip;
      this.entries = entries;
      this.originalHash = originalHash;
    }
    zip;
    entries;
    originalHash;
    static async open(bytes) {
      const originalHash = createHash("sha256").update(bytes).digest("hex");
      const zip = await import_jszip.default.loadAsync(bytes);
      const entries = /* @__PURE__ */ new Map();
      const names = Object.keys(zip.files);
      for (const name of names) {
        const file = zip.files[name];
        if (file.dir) continue;
        entries.set(name, await file.async("uint8array"));
      }
      return new _PackageArchive(zip, entries, originalHash);
    }
    has(path) {
      return this.entries.has(path);
    }
    /** Read a part as a UTF-8 string (for XML parts). */
    readText(path) {
      const bytes = this.entries.get(path);
      if (!bytes) return null;
      return Buffer.from(bytes).toString("utf8");
    }
    readBytes(path) {
      return this.entries.get(path) ?? null;
    }
    /**
     * Read a part's relationships file. partPath e.g. 'ppt/slides/slide1.xml' →
     * 'ppt/slides/_rels/slide1.xml.rels'.
     */
    readRels(partPath) {
      const relsPath = relsPathFor(partPath);
      const rels = /* @__PURE__ */ new Map();
      const xml = this.readText(relsPath);
      if (!xml) return rels;
      const doc = asXmlNode(relsParser.parse(xml));
      const list = asXmlNode(doc.Relationships).Relationship;
      for (const r of xmlArray(list)) {
        const id = String(r["@_Id"] ?? "");
        rels.set(id, {
          id,
          type: String(r["@_Type"] ?? ""),
          target: String(r["@_Target"] ?? ""),
          ...r["@_TargetMode"] != null ? { targetMode: String(r["@_TargetMode"]) } : {}
        });
      }
      return rels;
    }
    /**
     * Read the presentation's slide size and the slide part paths in order.
     */
    readPresentation() {
      const presXml = this.readText("ppt/presentation.xml");
      if (!presXml) throw new Error("pptx: missing ppt/presentation.xml");
      const parser3 = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        isArray: (name) => name === "p:sldId"
      });
      const pres = asXmlNode(parser3.parse(presXml));
      const rootRaw = pres["p:presentation"] ?? pres.presentation;
      if (!rootRaw) throw new Error("pptx: malformed presentation.xml");
      const root = asXmlNode(rootRaw);
      const szRaw = root["p:sldSz"] ?? root.sldSz;
      const sz = szRaw ? asXmlNode(szRaw) : null;
      const size = {
        cx: sz ? parseInt(String(sz["@_cx"]), 10) : 9144e3,
        cy: sz ? parseInt(String(sz["@_cy"]), 10) : 6858e3
      };
      const rels = this.readRels("ppt/presentation.xml");
      const sldIdLst = asXmlNode(root["p:sldIdLst"] ?? root.sldIdLst);
      const slidePaths = [];
      for (const id of xmlArray(sldIdLst["p:sldId"])) {
        const rId = id["@_r:id"] ?? id["@_id"];
        if (!rId) continue;
        const rel = rels.get(String(rId));
        if (!rel) continue;
        slidePaths.push(resolveTarget("ppt/presentation.xml", rel.target));
      }
      return { size, slidePaths };
    }
    /** Resolve a slide's layout / master part paths (via the rels chain). */
    resolveSlideChain(slidePath) {
      const slideRels = this.readRels(slidePath);
      let layoutPath;
      for (const rel of slideRels.values()) {
        if (rel.type.endsWith("/slideLayout")) {
          layoutPath = resolveTarget(slidePath, rel.target);
          break;
        }
      }
      let masterPath;
      let themePath;
      if (layoutPath) {
        const layoutRels = this.readRels(layoutPath);
        for (const rel of layoutRels.values()) {
          if (rel.type.endsWith("/slideMaster")) {
            masterPath = resolveTarget(layoutPath, rel.target);
            break;
          }
        }
      }
      if (masterPath) {
        const masterRels = this.readRels(masterPath);
        for (const rel of masterRels.values()) {
          if (rel.type.endsWith("/theme")) {
            themePath = resolveTarget(masterPath, rel.target);
            break;
          }
        }
      }
      return { layoutPath, masterPath, themePath };
    }
  };
  function relsPathFor(partPath) {
    const idx = partPath.lastIndexOf("/");
    const dir = idx >= 0 ? partPath.slice(0, idx) : "";
    const file = idx >= 0 ? partPath.slice(idx + 1) : partPath;
    return `${dir ? dir + "/" : ""}_rels/${file}.rels`;
  }
  function resolveTarget(basePart, target) {
    if (target.startsWith("/")) return target.slice(1);
    const baseDir = basePart.slice(0, basePart.lastIndexOf("/"));
    const parts = baseDir.split("/").filter(Boolean);
    for (const seg of target.split("/")) {
      if (seg === "." || seg === "") continue;
      if (seg === "..") parts.pop();
      else parts.push(seg);
    }
    return parts.join("/");
  }

  // ../engine/pptx-engine/theme.ts
  var parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  function topLevelFragments(xml) {
    const out = [];
    const re = /<(\/?)([a-zA-Z][\w:]*)((?:"[^"]*"|'[^']*'|[^"'>])*?)(\/?)>/g;
    let depth = 0;
    let curStart = -1;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const closing = m[1] === "/";
      const selfClose = m[4] === "/";
      if (!closing && !selfClose) {
        if (depth === 0) curStart = m.index;
        depth++;
      } else if (closing) {
        depth--;
        if (depth === 0 && curStart >= 0) out.push(xml.slice(curStart, re.lastIndex));
      } else if (selfClose && depth === 0) {
        out.push(xml.slice(m.index, re.lastIndex));
      }
    }
    return out;
  }
  function parseStyleList(themeXml, tag) {
    const m = new RegExp(`<a:${tag}\\b[^>]*>([\\s\\S]*?)</a:${tag}>`).exec(themeXml);
    if (!m) return void 0;
    const items = topLevelFragments(m[1]).map((frag) => asXmlNode(parser.parse(frag)));
    return items.length ? items : void 0;
  }
  function readColorNode(node) {
    if (!node) return void 0;
    const n = asXmlNode(node);
    const srgb = asXmlNode(n["a:srgbClr"]);
    if (n["a:srgbClr"]) return "#" + String(srgb["@_val"]).toUpperCase();
    const sys = asXmlNode(n["a:sysClr"]);
    if (n["a:sysClr"]) return "#" + String(sys["@_lastClr"] ?? "000000").toUpperCase();
    return void 0;
  }
  function typeface(scheme, font, script) {
    const v = asXmlNode(asXmlNode(scheme[font])[script])["@_typeface"];
    return typeof v === "string" && v ? v : void 0;
  }
  function parseTheme(themeXml) {
    const doc = asXmlNode(parser.parse(themeXml));
    const themeEl = asXmlNode(doc["a:theme"] ?? doc.theme);
    const elements = asXmlNode(themeEl["a:themeElements"]);
    const clrScheme = asXmlNode(elements["a:clrScheme"]);
    const colors = {};
    for (const key of ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"]) {
      const c = readColorNode(clrScheme["a:" + key]);
      if (c) colors[key] = c;
    }
    const fontScheme = asXmlNode(elements["a:fontScheme"]);
    const majorFont = typeface(fontScheme, "a:majorFont", "a:latin");
    const minorFont = typeface(fontScheme, "a:minorFont", "a:latin");
    const majorEaFont = typeface(fontScheme, "a:majorFont", "a:ea");
    const minorEaFont = typeface(fontScheme, "a:minorFont", "a:ea");
    const majorCsFont = typeface(fontScheme, "a:majorFont", "a:cs");
    const minorCsFont = typeface(fontScheme, "a:minorFont", "a:cs");
    const fmtM = /<a:fmtScheme\b[^>]*>[\s\S]*?<\/a:fmtScheme>/.exec(themeXml);
    const fmt = fmtM?.[0] ?? "";
    const fillStyles2 = parseStyleList(fmt, "fillStyleLst");
    const lnStyles2 = parseStyleList(fmt, "lnStyleLst");
    const effectStyles2 = parseStyleList(fmt, "effectStyleLst");
    const bgFillStyles2 = parseStyleList(fmt, "bgFillStyleLst");
    return {
      colors,
      majorFont,
      minorFont,
      majorEaFont,
      minorEaFont,
      majorCsFont,
      minorCsFont,
      ...fillStyles2 ? { fillStyles: fillStyles2 } : {},
      ...lnStyles2 ? { lnStyles: lnStyles2 } : {},
      ...effectStyles2 ? { effectStyles: effectStyles2 } : {},
      ...bgFillStyles2 ? { bgFillStyles: bgFillStyles2 } : {}
    };
  }
  function resolveFontRef(typeface2, theme) {
    if (!typeface2) return void 0;
    if (!typeface2.startsWith("+")) return typeface2;
    switch (typeface2) {
      case "+mj-lt":
        return theme?.majorFont;
      case "+mn-lt":
        return theme?.minorFont;
      case "+mj-ea":
        return theme?.majorEaFont ?? theme?.majorFont;
      case "+mn-ea":
        return theme?.minorEaFont ?? theme?.minorFont;
      case "+mj-cs":
        return theme?.majorCsFont ?? theme?.majorFont;
      case "+mn-cs":
        return theme?.minorCsFont ?? theme?.minorFont;
      default:
        return theme?.minorFont;
    }
  }
  function resolveSchemeColor(name, theme, phClr) {
    if (name === "phClr") return phClr;
    const map = { tx1: "dk1", bg1: "lt1", tx2: "dk2", bg2: "lt2" };
    const key = map[name] ?? name;
    return theme?.colors[key];
  }

  // ../engine/pptx-engine/scan.ts
  var TAG_RE = /<\/?(?:[^<>"']|"[^"]*"|'[^']*')*>/g;
  var NAME_RE = /^<\/?\s*([A-Za-z_][\w:.-]*)/;
  var SHAPE_TAGS = /* @__PURE__ */ new Set(["p:sp", "p:pic", "p:graphicFrame", "p:grpSp", "p:cxnSp"]);
  function scanSlide(slideXml) {
    const spTreeOpen = /<p:spTree(?:\s(?:[^<>"']|"[^"]*"|'[^']*')*)?>/.exec(slideXml);
    if (!spTreeOpen) {
      throw new Error("slide xml has no <p:spTree> element");
    }
    const scanFrom = spTreeOpen.index + spTreeOpen[0].length;
    const elements = [];
    TAG_RE.lastIndex = scanFrom;
    let depth = 0;
    let currentStart = -1;
    let currentName = "";
    let match;
    let spTreeCloseAt = -1;
    while ((match = TAG_RE.exec(slideXml)) !== null) {
      const tag = match[0];
      if (tag.startsWith("<!--") || tag.startsWith("<![") || tag.startsWith("<?")) continue;
      const isClosing = tag.startsWith("</");
      const isSelfClosing = !isClosing && tag.endsWith("/>");
      const name = NAME_RE.exec(tag)?.[1] ?? "";
      if (isClosing) {
        if (depth === 0) {
          if (name === "p:spTree") {
            spTreeCloseAt = match.index;
            break;
          }
          throw new Error(`unexpected closing tag </${name}> at spTree level`);
        }
        depth--;
        if (depth === 0 && SHAPE_TAGS.has(currentName)) {
          elements.push({ name: currentName, start: currentStart, end: match.index + tag.length });
        }
      } else if (isSelfClosing) {
        if (depth === 0 && SHAPE_TAGS.has(name)) {
          elements.push({ name, start: match.index, end: match.index + tag.length });
        }
      } else {
        if (depth === 0) {
          currentStart = match.index;
          currentName = name;
        }
        depth++;
      }
    }
    if (spTreeCloseAt < 0) throw new Error("slide xml: unterminated <p:spTree>");
    for (let i = 0; i + 1 < elements.length; i++) {
      const gap = slideXml.slice(elements[i].end, elements[i + 1].start);
      if (gap) elements[i].gapAfter = gap;
    }
    const firstShapeStart = elements.length ? elements[0].start : spTreeCloseAt;
    const lastShapeEnd = elements.length ? elements[elements.length - 1].end : spTreeCloseAt;
    return {
      elements,
      bodyPrefix: slideXml.slice(0, firstShapeStart),
      bodySuffix: slideXml.slice(lastShapeEnd)
    };
  }

  // ../engine/pptx-engine/table-grid.ts
  function tableRowGridCols(row) {
    const cols = [];
    let c = 0;
    row.forEach((cell, i) => {
      cols.push(c);
      const span = cell.gridSpan ?? 1;
      const followers = span > 1 ? row.slice(i + 1, i + span) : [];
      c += followers.length === span - 1 && followers.every((f) => f.merged) ? 1 : span;
    });
    return cols;
  }

  // ../engine/pptx-engine/color.ts
  function resolveColorNode(node, theme, phClr) {
    if (!node) return void 0;
    const n = asXmlNode(node);
    let base;
    let mods;
    if (n["a:srgbClr"]) {
      mods = asXmlNode(n["a:srgbClr"]);
      base = "#" + String(mods["@_val"]).toUpperCase();
    } else if (n["a:schemeClr"]) {
      mods = asXmlNode(n["a:schemeClr"]);
      base = resolveSchemeColor(String(mods["@_val"]), theme, phClr);
    } else if (n["a:sysClr"]) {
      mods = asXmlNode(n["a:sysClr"]);
      base = "#" + String(mods["@_lastClr"] ?? "000000").toUpperCase();
    }
    if (!base) return void 0;
    return applyColorMods(base, mods);
  }
  function applyColorMods(hex, mods) {
    let { r, g, b } = hexToRgb(hex);
    const pct = (k) => {
      const v = asXmlNode(mods?.[k])["@_val"];
      return v != null ? (parseInt(String(v), 10) || 0) / 1e5 : void 0;
    };
    const lumMod = pct("a:lumMod");
    const lumOff = pct("a:lumOff");
    const shade2 = pct("a:shade");
    const tint2 = pct("a:tint");
    const satMod = pct("a:satMod");
    if (satMod != null) {
      const { h, s, l } = rgbToHsl(r, g, b);
      const rgb2 = hslToRgb(h, Math.max(0, Math.min(1, s * satMod)), l);
      r = rgb2.r;
      g = rgb2.g;
      b = rgb2.b;
    }
    if (lumMod != null) {
      r *= lumMod;
      g *= lumMod;
      b *= lumMod;
    }
    if (lumOff != null) {
      r += 255 * lumOff;
      g += 255 * lumOff;
      b += 255 * lumOff;
    }
    if (shade2 != null) {
      r *= shade2;
      g *= shade2;
      b *= shade2;
    }
    if (tint2 != null) {
      r = r * tint2 + 255 * (1 - tint2);
      g = g * tint2 + 255 * (1 - tint2);
      b = b * tint2 + 255 * (1 - tint2);
    }
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
    let out = "#" + [clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
    const alpha = pct("a:alpha");
    if (alpha != null && alpha < 1) {
      out += Math.round(alpha * 255).toString(16).padStart(2, "0").toUpperCase();
    }
    return out;
  }
  function hexToRgb(hex) {
    const h = hex.replace(/^#/, "");
    return {
      r: parseInt(h.slice(0, 2), 16) || 0,
      g: parseInt(h.slice(2, 4), 16) || 0,
      b: parseInt(h.slice(4, 6), 16) || 0
    };
  }
  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return { h, s, l };
  }
  function hslToRgb(h, s, l) {
    if (s === 0) {
      const v = l * 255;
      return { r: v, g: v, b: v };
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return { r: f(h + 1 / 3) * 255, g: f(h) * 255, b: f(h - 1 / 3) * 255 };
  }

  // ../engine/pptx-engine/placeholder.ts
  var phParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) => ["p:sp"].includes(name)
  });
  var TITLE_TYPES = /* @__PURE__ */ new Set(["title", "ctrTitle"]);
  var BODY_TYPES = /* @__PURE__ */ new Set(["body", "subTitle", "obj", ""]);
  function parseXfrmNode(xfrmRaw) {
    if (!xfrmRaw) return null;
    const xfrm = asXmlNode(xfrmRaw);
    const offRaw = xfrm["a:off"];
    const extRaw = xfrm["a:ext"];
    if (!offRaw && !extRaw) return null;
    const off = asXmlNode(offRaw);
    const ext = asXmlNode(extRaw);
    return {
      offset: {
        x: offRaw ? parseInt(String(off["@_x"]), 10) || 0 : 0,
        y: offRaw ? parseInt(String(off["@_y"]), 10) || 0 : 0,
        cx: extRaw ? parseInt(String(ext["@_cx"]), 10) || 0 : 0,
        cy: extRaw ? parseInt(String(ext["@_cy"]), 10) || 0 : 0
      },
      rot: xfrm["@_rot"] ? parseInt(String(xfrm["@_rot"]), 10) || 0 : 0,
      flipH: xfrm["@_flipH"] === "1" || xfrm["@_flipH"] === "true",
      flipV: xfrm["@_flipV"] === "1" || xfrm["@_flipV"] === "true"
    };
  }
  function parsePlaceholderMap(layoutOrMasterXml, theme) {
    const entries = [];
    let doc;
    try {
      doc = asXmlNode(phParser.parse(layoutOrMasterXml));
    } catch {
      return { entries };
    }
    const root = asXmlNode(doc["p:sldLayout"] ?? doc["p:sldMaster"]);
    const spTreeRaw = asXmlNode(root["p:cSld"])["p:spTree"];
    if (!spTreeRaw) return { entries };
    const spTree = asXmlNode(spTreeRaw);
    for (const sp of xmlArray(spTree["p:sp"])) {
      const phRaw = asXmlNode(asXmlNode(sp["p:nvSpPr"])["p:nvPr"])["p:ph"];
      if (!phRaw) continue;
      const ph = asXmlNode(phRaw);
      const type = String(ph["@_type"] ?? "body");
      const idx = ph["@_idx"] != null ? String(ph["@_idx"]) : "";
      const transform = parseXfrmNode(asXmlNode(sp["p:spPr"])["a:xfrm"]);
      const textStyle = parseLstStyleLevels(asXmlNode(sp["p:txBody"])["a:lstStyle"], theme);
      if (!transform && !textStyle) continue;
      entries.push({ type, idx, transform, ...textStyle ? { textStyle } : {} });
    }
    return { entries };
  }
  var ALIGN_MAP = {
    l: "left",
    ctr: "center",
    r: "right",
    just: "justify"
  };
  function decodeAttrCharRefs(s) {
    return s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
  }
  function spcPctVal(node) {
    const v = asXmlNode(asXmlNode(node)["a:spcPct"])["@_val"];
    return v != null ? parseInt(String(v), 10) / 1e3 : void 0;
  }
  function spcPtsVal(node) {
    const v = asXmlNode(asXmlNode(node)["a:spcPts"])["@_val"];
    return v != null ? parseInt(String(v), 10) / 100 : void 0;
  }
  function typefaceAttr(node) {
    const v = asXmlNode(node)["@_typeface"];
    return v != null ? String(v) : void 0;
  }
  function parseLvlPPr(pPrRaw, theme) {
    if (!pPrRaw || typeof pPrRaw !== "object") return void 0;
    const pPr = asXmlNode(pPrRaw);
    const out = {};
    const algn = String(pPr["@_algn"] ?? "");
    if (algn && ALIGN_MAP[algn]) out.align = ALIGN_MAP[algn];
    const lineHeight = spcPctVal(pPr["a:lnSpc"]);
    const lineExact = spcPtsVal(pPr["a:lnSpc"]);
    if (lineHeight != null) out.lineHeight = lineHeight;
    if (lineExact != null) out.lineExact = lineExact;
    const spcBef = pPr["a:spcBef"];
    const spcAft = pPr["a:spcAft"];
    if (spcPtsVal(spcBef) != null) out.spaceBefore = spcPtsVal(spcBef);
    if (spcPctVal(spcBef) != null) out.spaceBeforePct = spcPctVal(spcBef);
    if (spcPtsVal(spcAft) != null) out.spaceAfter = spcPtsVal(spcAft);
    if (spcPctVal(spcAft) != null) out.spaceAfterPct = spcPctVal(spcAft);
    const buChar = asXmlNode(pPr["a:buChar"])["@_char"];
    if (pPr["a:buNone"] !== void 0) out.bullet = { type: "none" };
    else if (buChar != null) {
      out.bullet = { type: "char", char: decodeAttrCharRefs(String(buChar)) };
    } else if (pPr["a:buAutoNum"]) out.bullet = { type: "number" };
    if (pPr["@_marL"] != null) {
      const v = parseInt(String(pPr["@_marL"]), 10);
      if (!Number.isNaN(v)) out.marL = v;
    }
    if (pPr["@_indent"] != null) {
      const v = parseInt(String(pPr["@_indent"]), 10);
      if (!Number.isNaN(v)) out.indent = v;
    }
    const defRPrRaw = pPr["a:defRPr"];
    if (defRPrRaw && typeof defRPrRaw === "object") {
      const defRPr = asXmlNode(defRPrRaw);
      if (defRPr["@_sz"]) out.fontSize = parseInt(String(defRPr["@_sz"]), 10) / 100;
      if (defRPr["@_b"] != null) out.bold = defRPr["@_b"] === "1" || defRPr["@_b"] === "true";
      if (defRPr["@_i"] != null) out.italic = defRPr["@_i"] === "1" || defRPr["@_i"] === "true";
      const color = resolveColorNode(defRPr["a:solidFill"], theme);
      if (color) out.color = color;
      const latin = resolveFontRef(typefaceAttr(defRPr["a:latin"]), theme);
      if (latin) out.latinFont = latin;
      const ea = resolveFontRef(typefaceAttr(defRPr["a:ea"]), theme);
      if (ea) out.eaFont = ea;
      const cs = resolveFontRef(typefaceAttr(defRPr["a:cs"]), theme);
      if (cs) out.csFont = cs;
    }
    return Object.keys(out).length ? out : void 0;
  }
  function parseLstStyleLevels(lst, theme) {
    if (!lst || typeof lst !== "object") return void 0;
    const l = asXmlNode(lst);
    const levels = [];
    for (let i = 1; i <= 9; i++) levels[i - 1] = parseLvlPPr(l[`a:lvl${i}pPr`], theme);
    return levels.some(Boolean) ? { levels } : void 0;
  }
  function parseMasterTextStyles(masterXml, theme) {
    let doc;
    try {
      doc = asXmlNode(phParser.parse(masterXml));
    } catch {
      return {};
    }
    const txRaw = asXmlNode(doc["p:sldMaster"])["p:txStyles"];
    if (!txRaw) return {};
    const tx = asXmlNode(txRaw);
    return {
      ...parseLstStyleLevels(tx["p:titleStyle"], theme) ? { title: parseLstStyleLevels(tx["p:titleStyle"], theme) } : {},
      ...parseLstStyleLevels(tx["p:bodyStyle"], theme) ? { body: parseLstStyleLevels(tx["p:bodyStyle"], theme) } : {},
      ...parseLstStyleLevels(tx["p:otherStyle"], theme) ? { other: parseLstStyleLevels(tx["p:otherStyle"], theme) } : {}
    };
  }
  function findStyleInMap(map, type, idx) {
    if (!map || map.entries.length === 0) return void 0;
    const t = type ?? "body";
    const i = idx ?? "";
    const styled = map.entries.filter((e) => e.textStyle);
    let hit = styled.find((e) => e.type === t && e.idx === i);
    if (!hit && i !== "") hit = styled.find((e) => e.idx === i);
    if (!hit) hit = styled.find((e) => e.type === t);
    if (!hit && TITLE_TYPES.has(t)) hit = styled.find((e) => TITLE_TYPES.has(e.type));
    if (!hit && BODY_TYPES.has(t)) hit = styled.find((e) => BODY_TYPES.has(e.type));
    return hit?.textStyle;
  }
  function placeholderStyleChain(layout, master, masterTx, type, idx) {
    const chain = [];
    const fromLayout = findStyleInMap(layout, type, idx);
    if (fromLayout) chain.push(fromLayout);
    const fromMaster = findStyleInMap(master, type, idx);
    if (fromMaster) chain.push(fromMaster);
    const t = type ?? "body";
    const family = TITLE_TYPES.has(t) ? masterTx?.title : BODY_TYPES.has(t) ? masterTx?.body : masterTx?.other;
    if (family) chain.push(family);
    return chain;
  }
  function mergeTextStyleChain(chain, level) {
    const out = {};
    let any = false;
    for (const layer of chain) {
      if (!layer) continue;
      const lvl = layer.levels[level] ?? layer.levels[0];
      if (!lvl) continue;
      any = true;
      if (out.fontSize == null && lvl.fontSize != null) out.fontSize = lvl.fontSize;
      if (out.bold == null && lvl.bold != null) out.bold = lvl.bold;
      if (out.italic == null && lvl.italic != null) out.italic = lvl.italic;
      if (out.color == null && lvl.color != null) out.color = lvl.color;
      if (out.latinFont == null && lvl.latinFont != null) out.latinFont = lvl.latinFont;
      if (out.eaFont == null && lvl.eaFont != null) out.eaFont = lvl.eaFont;
      if (out.csFont == null && lvl.csFont != null) out.csFont = lvl.csFont;
      if (out.align == null && lvl.align != null) out.align = lvl.align;
      if (out.bullet == null && lvl.bullet != null) out.bullet = lvl.bullet;
      if (out.marL == null && lvl.marL != null) out.marL = lvl.marL;
      if (out.indent == null && lvl.indent != null) out.indent = lvl.indent;
      if (out.lineHeight == null && out.lineExact == null && (lvl.lineHeight != null || lvl.lineExact != null)) {
        if (lvl.lineHeight != null) out.lineHeight = lvl.lineHeight;
        if (lvl.lineExact != null) out.lineExact = lvl.lineExact;
      }
      if (out.spaceBefore == null && out.spaceBeforePct == null && (lvl.spaceBefore != null || lvl.spaceBeforePct != null)) {
        if (lvl.spaceBefore != null) out.spaceBefore = lvl.spaceBefore;
        if (lvl.spaceBeforePct != null) out.spaceBeforePct = lvl.spaceBeforePct;
      }
      if (out.spaceAfter == null && out.spaceAfterPct == null && (lvl.spaceAfter != null || lvl.spaceAfterPct != null)) {
        if (lvl.spaceAfter != null) out.spaceAfter = lvl.spaceAfter;
        if (lvl.spaceAfterPct != null) out.spaceAfterPct = lvl.spaceAfterPct;
      }
    }
    return any ? out : void 0;
  }
  function findInMap(map, type, idx) {
    if (!map || map.entries.length === 0) return void 0;
    const t = type ?? "body";
    const i = idx ?? "";
    const geo = map.entries.filter((e) => e.transform);
    let hit = geo.find((e) => e.type === t && e.idx === i);
    if (hit) return hit.transform;
    if (i !== "") {
      hit = geo.find((e) => e.idx === i);
      if (hit) return hit.transform;
    }
    hit = geo.find((e) => e.type === t);
    if (hit) return hit.transform;
    if (TITLE_TYPES.has(t)) {
      hit = geo.find((e) => TITLE_TYPES.has(e.type));
      if (hit) return hit.transform;
    }
    if (BODY_TYPES.has(t)) {
      hit = geo.find((e) => BODY_TYPES.has(e.type));
      if (hit) return hit.transform;
    }
    return void 0;
  }
  function resolvePlaceholderTransform(layout, master, type, idx) {
    return findInMap(layout, type, idx) ?? findInMap(master, type, idx);
  }

  // ../engine/pptx-engine/chart.ts
  var chartParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: false,
    parseTagValue: false,
    isArray: (name) => ["c:ser", "c:pt", "c:lvl", "c:dPt"].includes(name)
  });
  function parseChartXml(xml, theme) {
    let doc;
    try {
      doc = chartParser.parse(xml);
    } catch {
      return null;
    }
    const chart = doc["c:chartSpace"]?.["c:chart"];
    const plotArea = chart?.["c:plotArea"];
    if (!plotArea) return null;
    const cartesian = [];
    if (plotArea["c:barChart"]) cartesian.push({ kind: "bar", plot: plotArea["c:barChart"] });
    if (plotArea["c:areaChart"]) cartesian.push({ kind: "area", plot: plotArea["c:areaChart"] });
    if (plotArea["c:lineChart"]) cartesian.push({ kind: "line", plot: plotArea["c:lineChart"] });
    let kind;
    let plot;
    if (cartesian.length) {
      kind = cartesian[0].kind;
      plot = cartesian[0].plot;
    } else if (plotArea["c:pieChart"] || plotArea["c:doughnutChart"]) {
      kind = "pie";
      plot = plotArea["c:pieChart"] ?? plotArea["c:doughnutChart"];
    } else if (plotArea["c:scatterChart"]) {
      kind = "scatter";
      plot = plotArea["c:scatterChart"];
    } else if (plotArea["c:radarChart"]) {
      kind = "radar";
      plot = plotArea["c:radarChart"];
    } else {
      return null;
    }
    const valAxRaw = plotArea["c:valAx"];
    const valAxes = Array.isArray(valAxRaw) ? valAxRaw : valAxRaw ? [valAxRaw] : [];
    const secValAxNode = kind !== "scatter" && cartesian.length > 1 ? valAxes.find((a) => a?.["c:axPos"]?.["@_val"] === "r" && a?.["c:delete"]?.["@_val"] !== "1") : void 0;
    const secAxId = secValAxNode?.["c:axId"]?.["@_val"];
    const plotAxIds = (plotNode) => {
      const raw = plotNode?.["c:axId"];
      const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
      return arr.map((a) => a?.["@_val"]).filter((v) => v != null);
    };
    const series = [];
    let categories = [];
    const parsePlotSeries = (plotNode, plotKind, tagPlotKind, secondary = false) => {
      const sersRaw = plotNode["c:ser"];
      const sers = Array.isArray(sersRaw) ? sersRaw : sersRaw ? [sersRaw] : [];
      for (const ser of sers) {
        const s = { values: readNumPoints(plotKind === "scatter" ? ser["c:yVal"] : ser["c:val"]) };
        if (tagPlotKind) s.plotKind = plotKind;
        if (secondary) s.secondaryAxis = true;
        if (plotKind === "scatter") {
          const xs = readNumPoints(ser["c:xVal"]);
          if (xs.length) s.xValues = xs;
        }
        const name = readStrPoints(ser["c:tx"])[0];
        if (name != null) s.name = name;
        const color = serColor(ser, theme);
        if (color) s.color = color;
        if (ser["c:smooth"]?.["@_val"] === "1") s.smooth = true;
        const markerSym = ser["c:marker"]?.["c:symbol"]?.["@_val"];
        if (plotKind === "line") s.marker = markerSym != null && markerSym !== "none";
        else if ((plotKind === "scatter" || plotKind === "radar") && markerSym != null) s.marker = markerSym !== "none";
        const dPts = ser["c:dPt"] ?? [];
        if (dPts.length) {
          const pointColors = [];
          for (const dPt of dPts) {
            const idx = parseInt(dPt["c:idx"]?.["@_val"], 10);
            if (Number.isNaN(idx)) continue;
            const c = resolveColorNode(dPt["c:spPr"]?.["a:solidFill"], theme);
            if (c != null) pointColors[idx] = c;
          }
          if (pointColors.length) s.pointColors = pointColors;
        }
        series.push(s);
        if (!categories.length) categories = readStrPoints(ser["c:cat"]);
      }
    };
    if (cartesian.length > 1) {
      for (const c of cartesian)
        parsePlotSeries(c.plot, c.kind, true, secAxId != null && plotAxIds(c.plot).includes(secAxId));
    } else parsePlotSeries(plot, kind, false);
    if (!series.length) return null;
    if (!categories.length) {
      const n = Math.max(...series.map((s) => s.values.length), 0);
      categories = Array.from({ length: n }, () => "");
    }
    const model = { kind, categories, series };
    if (kind === "bar") {
      const dir = plot["c:barDir"]?.["@_val"];
      model.barDir = dir === "bar" ? "bar" : "col";
      const grouping = plot["c:grouping"]?.["@_val"];
      if (grouping) model.grouping = grouping;
      const gap = plot["c:gapWidth"]?.["@_val"];
      model.gapWidthPct = gap != null ? parseInt(gap, 10) : 150;
    }
    if (kind === "pie") {
      const hole = plot["c:holeSize"]?.["@_val"];
      model.holePct = hole != null ? parseInt(hole, 10) || 0 : plotArea["c:doughnutChart"] ? 50 : 0;
      const first = plot["c:firstSliceAng"]?.["@_val"];
      if (first != null) model.firstSliceAngDeg = parseInt(first, 10) || 0;
    }
    if (kind === "scatter") {
      const st = plot["c:scatterStyle"]?.["@_val"];
      if (st) model.scatterStyle = String(st);
    }
    if (kind === "radar") {
      const st = plot["c:radarStyle"]?.["@_val"];
      model.radarStyle = st === "filled" ? "filled" : st === "marker" ? "marker" : "standard";
    }
    const legendPos = chart["c:legend"]?.["c:legendPos"]?.["@_val"];
    if (chart["c:legend"]) model.legendPos = legendPos ?? "r";
    const chartTitle = collectText(chart["c:title"]?.["c:tx"]?.["c:rich"]);
    if (chartTitle) model.title = chartTitle;
    const dLblsInfo = (owner) => {
      const d = owner?.["c:dLbls"];
      if (!d || typeof d !== "object" || d["c:delete"]?.["@_val"] === "1") return { on: false, pct: false };
      const showVal = d["c:showVal"]?.["@_val"] === "1";
      const showPct = d["c:showPercent"]?.["@_val"] === "1";
      return { on: showVal || showPct, pct: showPct && !showVal };
    };
    const dLblOwners = (cartesian.length > 1 ? cartesian.map((c) => c.plot) : [plot]).flatMap(
      (p) => [p, ...Array.isArray(p["c:ser"]) ? p["c:ser"] : p["c:ser"] ? [p["c:ser"]] : []]
    );
    const found = dLblOwners.map(dLblsInfo).find((r) => r.on);
    if (found) {
      model.dataLabels = true;
      if (found.pct) model.dataLabelsPct = true;
    }
    if (kind === "scatter" && valAxes.length >= 2) {
      const xAxNode = valAxes.find((a) => a?.["c:axPos"]?.["@_val"] === "b") ?? valAxes[0];
      const yAxNode = valAxes.find((a) => a !== xAxNode) ?? valAxes[1];
      const xAx = parseAxis(xAxNode, theme);
      if (xAx) model.catAxis = xAx;
      const yAx = parseAxis(yAxNode, theme);
      if (yAx) model.valAxis = yAx;
    } else {
      const valAxNode = valAxes.find((a) => a?.["c:axPos"]?.["@_val"] === "l") ?? valAxes[0];
      const valAx = parseAxis(valAxNode, theme);
      if (valAx) model.valAxis = valAx;
      if (secValAxNode) {
        const valAx2 = parseAxis(secValAxNode, theme);
        if (valAx2) model.valAxis2 = valAx2;
      }
      const catAxRaw = plotArea["c:catAx"];
      const catAxes = Array.isArray(catAxRaw) ? catAxRaw : catAxRaw ? [catAxRaw] : [];
      const catAxNode = catAxes.find((a) => a?.["c:delete"]?.["@_val"] !== "1") ?? catAxes[0];
      const catAx = parseAxis(catAxNode, theme);
      if (catAx) model.catAxis = catAx;
    }
    return model;
  }
  function readNumPoints(node) {
    const cache = node?.["c:numRef"]?.["c:numCache"] ?? node?.["c:numLit"];
    if (!cache) return [];
    return readPoints(cache).map((v) => {
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    });
  }
  function readStrPoints(node) {
    const strCache = node?.["c:strRef"]?.["c:strCache"];
    if (strCache) return readPoints(strCache).map((v) => v ?? "");
    const multi = node?.["c:multiLvlStrRef"]?.["c:multiLvlStrCache"];
    if (multi) {
      const lvls = Array.isArray(multi["c:lvl"]) ? multi["c:lvl"] : multi["c:lvl"] ? [multi["c:lvl"]] : [];
      if (lvls.length) return readPoints(lvls[0]).map((v) => v ?? "");
    }
    const numCache = node?.["c:numRef"]?.["c:numCache"];
    if (numCache) return readPoints(numCache).map((v) => v ?? "");
    return [];
  }
  function readPoints(cache) {
    const ptsRaw = cache?.["c:pt"];
    const pts = Array.isArray(ptsRaw) ? ptsRaw : ptsRaw ? [ptsRaw] : [];
    const count = cache?.["c:ptCount"]?.["@_val"];
    const n = count != null ? parseInt(count, 10) : pts.length;
    const out = new Array(Math.max(n, pts.length)).fill(null);
    for (const pt of pts) {
      const idx = parseInt(pt["@_idx"], 10) || 0;
      const v = pt["c:v"];
      out[idx] = typeof v === "string" ? v : v != null ? String(v["#text"] ?? v) : null;
    }
    return out;
  }
  function serColor(ser, theme) {
    const spPr = ser["c:spPr"];
    if (!spPr) return void 0;
    const lnColor = resolveColorNode(spPr["a:ln"]?.["a:solidFill"], theme);
    const fillColor = resolveColorNode(spPr["a:solidFill"], theme);
    return lnColor ?? fillColor;
  }
  function parseAxis(ax, theme) {
    if (!ax || typeof ax !== "object") return void 0;
    const out = {};
    const scaling = ax["c:scaling"];
    if (scaling?.["c:min"]?.["@_val"] != null) out.min = Number(scaling["c:min"]["@_val"]);
    if (scaling?.["c:max"]?.["@_val"] != null) out.max = Number(scaling["c:max"]["@_val"]);
    if (scaling?.["c:orientation"]?.["@_val"] === "maxMin") out.reversed = true;
    const defRPr = ax["c:txPr"]?.["a:p"]?.[0]?.["a:pPr"]?.["a:defRPr"] ?? ax["c:txPr"]?.["a:p"]?.["a:pPr"]?.["a:defRPr"];
    if (defRPr) {
      const c = resolveColorNode(defRPr["a:solidFill"], theme);
      if (c) out.labelColor = c;
      if (defRPr["@_sz"]) out.labelSizePt = parseInt(defRPr["@_sz"], 10) / 100;
    }
    const lineColor = resolveColorNode(ax["c:spPr"]?.["a:ln"]?.["a:solidFill"], theme);
    if (lineColor) out.lineColor = lineColor;
    const grid = ax["c:majorGridlines"];
    if (grid !== void 0) {
      const spPr = typeof grid === "object" ? grid["c:spPr"] : void 0;
      const gc = resolveColorNode(spPr?.["a:ln"]?.["a:solidFill"], theme);
      out.gridColor = gc ?? "#E6E6E6";
      if (spPr?.["a:ln"]?.["a:prstDash"]?.["@_val"] === "dash") out.gridDash = true;
    }
    const title = collectText(ax["c:title"]?.["c:tx"]?.["c:rich"]);
    if (title) out.title = title;
    return Object.keys(out).length ? out : void 0;
  }
  function collectText(rich) {
    if (!rich) return void 0;
    const paras = Array.isArray(rich["a:p"]) ? rich["a:p"] : rich["a:p"] ? [rich["a:p"]] : [];
    const parts = [];
    for (const p of paras) {
      const runs = Array.isArray(p["a:r"]) ? p["a:r"] : p["a:r"] ? [p["a:r"]] : [];
      for (const r of runs) {
        const t = r["a:t"];
        parts.push(typeof t === "string" ? t : String(t?.["#text"] ?? ""));
      }
    }
    const s = parts.join("");
    return s.trim() ? s : void 0;
  }

  // ../engine/pptx-engine/custgeom.ts
  var TAG_RE2 = /<\/?(?:[^<>"']|"[^"]*"|'[^']*')*>/g;
  var NAME_RE2 = /^<\/?\s*([A-Za-z_][\w:.-]*)/;
  var ATTR_RE = /([\w:]+)\s*=\s*"([^"]*)"/g;
  function tagAttrs(tag) {
    const out = {};
    ATTR_RE.lastIndex = 0;
    let m;
    while (m = ATTR_RE.exec(tag)) out[m[1]] = m[2];
    return out;
  }
  var DEG = Math.PI / 180;
  var a2r = (v) => v / 6e4 * DEG;
  function evalGuides(gds, w, h) {
    const ss = Math.min(w, h);
    const env = {
      w,
      h,
      ss,
      ls: Math.max(w, h),
      hc: w / 2,
      vc: h / 2,
      l: 0,
      t: 0,
      r: w,
      b: h,
      wd2: w / 2,
      wd3: w / 3,
      wd4: w / 4,
      wd5: w / 5,
      wd6: w / 6,
      wd8: w / 8,
      wd10: w / 10,
      wd12: w / 12,
      wd32: w / 32,
      hd2: h / 2,
      hd3: h / 3,
      hd4: h / 4,
      hd5: h / 5,
      hd6: h / 6,
      hd8: h / 8,
      hd10: h / 10,
      hd12: h / 12,
      ssd2: ss / 2,
      ssd4: ss / 4,
      ssd6: ss / 6,
      ssd8: ss / 8,
      ssd16: ss / 16,
      ssd32: ss / 32,
      cd2: 108e5,
      cd4: 54e5,
      cd8: 27e5,
      "3cd4": 162e5,
      "3cd8": 81e5,
      "5cd8": 135e5,
      "7cd8": 189e5
    };
    const val = (tok) => {
      if (tok == null) return 0;
      const n = Number(tok);
      return Number.isFinite(n) ? n : env[tok] ?? 0;
    };
    for (const gd of gds) {
      const parts = gd.fmla.trim().split(/\s+/);
      const op = parts[0];
      const x = val(parts[1]);
      const y = val(parts[2]);
      const z = val(parts[3]);
      let out;
      switch (op) {
        case "val":
          out = x;
          break;
        case "*/":
          out = z === 0 ? 0 : x * y / z;
          break;
        case "+-":
          out = x + y - z;
          break;
        case "+/":
          out = z === 0 ? 0 : (x + y) / z;
          break;
        case "?:":
          out = x > 0 ? y : z;
          break;
        case "abs":
          out = Math.abs(x);
          break;
        case "min":
          out = Math.min(x, y);
          break;
        case "max":
          out = Math.max(x, y);
          break;
        case "pin":
          out = Math.min(Math.max(y, x), z);
          break;
        case "mod":
          out = Math.sqrt(x * x + y * y + z * z);
          break;
        case "sqrt":
          out = Math.sqrt(Math.max(x, 0));
          break;
        case "at2":
          out = Math.atan2(y, x) / DEG * 6e4;
          break;
        case "cat2":
          out = x * Math.cos(Math.atan2(z, y));
          break;
        case "sat2":
          out = x * Math.sin(Math.atan2(z, y));
          break;
        case "cos":
          out = x * Math.cos(a2r(y));
          break;
        case "sin":
          out = x * Math.sin(a2r(y));
          break;
        case "tan":
          out = x * Math.tan(a2r(y));
          break;
        default:
          out = 0;
      }
      env[gd.name] = out;
    }
    return env;
  }
  var CMD_PT_COUNT = {
    "a:moveTo": 1,
    "a:lnTo": 1,
    "a:quadBezTo": 2,
    "a:cubicBezTo": 3
  };
  var CMD_LETTER = {
    "a:moveTo": "M",
    "a:lnTo": "L",
    "a:quadBezTo": "Q",
    "a:cubicBezTo": "C"
  };
  function parseCustGeom(shapeXml, shapeW, shapeH) {
    const start = shapeXml.indexOf("<a:custGeom");
    if (start < 0) return void 0;
    const end = shapeXml.indexOf("</a:custGeom>", start);
    if (end < 0) return void 0;
    const xml = shapeXml.slice(start, end);
    const gds = [];
    const paths = [];
    let inGuides = false;
    let cur = null;
    let pending = null;
    TAG_RE2.lastIndex = 0;
    let m;
    while (m = TAG_RE2.exec(xml)) {
      const tag = m[0];
      if (tag.startsWith("<!--") || tag.startsWith("<![") || tag.startsWith("<?")) continue;
      const closing = tag.startsWith("</");
      const name = NAME_RE2.exec(tag)?.[1] ?? "";
      if (closing) {
        if (name === "a:avLst" || name === "a:gdLst") inGuides = false;
        else if (name === "a:path" && cur) {
          paths.push(cur);
          cur = null;
          pending = null;
        }
        continue;
      }
      const self2 = tag.endsWith("/>");
      switch (name) {
        case "a:avLst":
        case "a:gdLst":
          if (!self2) inGuides = true;
          break;
        case "a:gd": {
          if (!inGuides) break;
          const a = tagAttrs(tag);
          if (a.name && a.fmla) gds.push({ name: a.name, fmla: a.fmla });
          break;
        }
        case "a:path": {
          const a = tagAttrs(tag);
          cur = {
            w: a.w ? Number(a.w) || 0 : void 0,
            h: a.h ? Number(a.h) || 0 : void 0,
            fill: a.fill,
            stroke: a.stroke,
            cmds: []
          };
          if (self2) {
            paths.push(cur);
            cur = null;
          }
          break;
        }
        case "a:moveTo":
        case "a:lnTo":
        case "a:quadBezTo":
        case "a:cubicBezTo":
          if (cur) pending = { c: CMD_LETTER[name], need: CMD_PT_COUNT[name], pts: [] };
          break;
        case "a:pt": {
          if (!cur || !pending) break;
          const a = tagAttrs(tag);
          pending.pts.push([a.x ?? "0", a.y ?? "0"]);
          if (pending.pts.length >= pending.need) {
            cur.cmds.push({ c: pending.c, pts: pending.pts });
            pending = null;
          }
          break;
        }
        case "a:arcTo": {
          if (!cur) break;
          const a = tagAttrs(tag);
          cur.cmds.push({
            c: "A",
            arc: { wR: a.wR ?? "0", hR: a.hR ?? "0", stAng: a.stAng ?? "0", swAng: a.swAng ?? "0" }
          });
          break;
        }
        case "a:close":
          if (cur) cur.cmds.push({ c: "Z" });
          break;
      }
    }
    const env = evalGuides(gds, shapeW, shapeH);
    const resolve2 = (tok) => {
      const n = Number(tok);
      return Number.isFinite(n) ? n : env[tok] ?? 0;
    };
    const absList = paths.map((p) => toAbsCmds(p, resolve2));
    let fw = 0;
    let fh = 0;
    paths.forEach((p, i) => {
      if (!p.w) fw = Math.max(fw, maxCoord(absList[i], 0));
      if (!p.h) fh = Math.max(fh, maxCoord(absList[i], 1));
    });
    const buckets = { path: [], fillPath: [], strokePath: [] };
    paths.forEach((p, i) => {
      const abs = absList[i];
      if (!abs.length) return;
      const vw = p.w || shapeW || fw || 1;
      const vh = p.h || shapeH || fh || 1;
      const d = emitNorm(abs, vw, vh);
      if (!d) return;
      const fillNone = p.fill === "none";
      const strokeNone = p.stroke === "0" || p.stroke === "false" || p.stroke === "none";
      if (fillNone && strokeNone) return;
      if (fillNone) buckets.strokePath.push(d);
      else if (strokeNone) buckets.fillPath.push(d);
      else buckets.path.push(d);
    });
    const out = {};
    if (buckets.path.length) out.path = buckets.path.join(" ");
    if (buckets.fillPath.length) out.fillPath = buckets.fillPath.join(" ");
    if (buckets.strokePath.length) out.strokePath = buckets.strokePath.join(" ");
    return out.path || out.fillPath || out.strokePath ? out : void 0;
  }
  function paramAngle(a, wR, hR) {
    if (wR === hR || !wR || !hR) return a;
    const t = Math.atan2(Math.sin(a) * wR, Math.cos(a) * hR);
    return t + 2 * Math.PI * Math.round((a - t) / (2 * Math.PI));
  }
  function toAbsCmds(p, resolve2) {
    const out = [];
    let cx = 0;
    let cy = 0;
    let sx = 0;
    let sy = 0;
    for (const cmd of p.cmds) {
      if (cmd.c === "Z") {
        out.push({ c: "Z", xy: [] });
        cx = sx;
        cy = sy;
        continue;
      }
      if (cmd.c === "A") {
        const wR = resolve2(cmd.arc.wR);
        const hR = resolve2(cmd.arc.hR);
        const stRay = a2r(resolve2(cmd.arc.stAng));
        const swRay = a2r(resolve2(cmd.arc.swAng));
        if (swRay === 0) continue;
        const st = paramAngle(stRay, wR, hR);
        let sw = paramAngle(stRay + swRay, wR, hR) - st;
        sw += 2 * Math.PI * Math.round((swRay - sw) / (2 * Math.PI));
        const ecx = cx - wR * Math.cos(st);
        const ecy = cy - hR * Math.sin(st);
        const segs = Math.max(1, Math.ceil(Math.abs(sw) / (Math.PI / 2)));
        const da = sw / segs;
        const k = 4 / 3 * Math.tan(da / 4);
        for (let i = 0; i < segs; i++) {
          const a1 = st + i * da;
          const a2 = a1 + da;
          const x1 = ecx + wR * Math.cos(a1);
          const y1 = ecy + hR * Math.sin(a1);
          const x2 = ecx + wR * Math.cos(a2);
          const y2 = ecy + hR * Math.sin(a2);
          out.push({
            c: "C",
            xy: [
              x1 - k * wR * Math.sin(a1),
              y1 + k * hR * Math.cos(a1),
              x2 + k * wR * Math.sin(a2),
              y2 - k * hR * Math.cos(a2),
              x2,
              y2
            ]
          });
          cx = x2;
          cy = y2;
        }
        continue;
      }
      const xy = [];
      for (const [xs, ys] of cmd.pts) {
        xy.push(resolve2(xs), resolve2(ys));
      }
      out.push({ c: cmd.c, xy });
      if (cmd.c === "M") {
        sx = xy[0];
        sy = xy[1];
      }
      cx = xy[xy.length - 2];
      cy = xy[xy.length - 1];
    }
    return out;
  }
  function maxCoord(cmds, axis) {
    let mx = 0;
    for (const c of cmds) for (let i = axis; i < c.xy.length; i += 2) mx = Math.max(mx, c.xy[i]);
    return mx;
  }
  function emitNorm(cmds, vw, vh) {
    const r5 = (v) => Math.round(v * 1e5) / 1e5;
    const parts = [];
    for (const c of cmds) {
      parts.push(c.c);
      for (let i = 0; i < c.xy.length; i += 2) {
        parts.push(String(r5(c.xy[i] / vw)), String(r5(c.xy[i + 1] / vh)));
      }
    }
    return parts.length ? parts.join(" ") : "";
  }

  // ../engine/pptx-engine/table-style.ts
  var BUILTIN = {
    "{2D5ABB26-0587-4C30-8999-92F81FD0307C}": { family: "themed1" },
    "{3C2FFA5D-87B4-456A-9821-1D502468CF0F}": { family: "themed1", accent: "accent1" },
    "{284E427A-3D55-4303-BF80-6455036E1DE7}": { family: "themed1", accent: "accent2" },
    "{69C7853C-536D-4A76-A0AE-DD22124D55A5}": { family: "themed1", accent: "accent3" },
    "{775DCB02-9BB8-47FD-8907-85C794F793BA}": { family: "themed1", accent: "accent4" },
    "{35758FB7-9AC5-4552-8A53-C91805E547FA}": { family: "themed1", accent: "accent5" },
    "{08FB837D-C827-4EFA-A057-4D05807E0F7C}": { family: "themed1", accent: "accent6" },
    "{5940675A-B579-460E-94D1-54222C63F5DA}": { family: "themed2" },
    "{D113A9D2-9D6B-4929-AA2D-F23B5EE8CBE7}": { family: "themed2", accent: "accent1" },
    "{18603FDC-E32A-4AB5-989C-0864C3EAD2B8}": { family: "themed2", accent: "accent2" },
    "{306799F8-075E-4A3A-A7F6-7FBC6576F1A4}": { family: "themed2", accent: "accent3" },
    "{E269D01E-BC32-4049-B463-5C60D7B0CCD2}": { family: "themed2", accent: "accent4" },
    "{327F97BB-C833-4FB7-BDE5-3F7075034690}": { family: "themed2", accent: "accent5" },
    "{638B1855-1B75-4FBE-930C-398BA8C253C6}": { family: "themed2", accent: "accent6" },
    "{9D7B26C5-4107-4FEC-AEDC-1716B250A1EF}": { family: "light1" },
    "{3B4B98B0-60AC-42C2-AFA5-B58CD77FA1E5}": { family: "light1", accent: "accent1" },
    "{0E3FDE45-AF77-4B5C-9715-49D594BDF05E}": { family: "light1", accent: "accent2" },
    "{C083E6E3-FA7D-4D7B-A595-EF9225AFEA82}": { family: "light1", accent: "accent3" },
    "{D27102A9-8310-4765-A935-A1911B00CA55}": { family: "light1", accent: "accent4" },
    "{5FD0F851-EC5A-4D38-B0AD-8093EC10F338}": { family: "light1", accent: "accent5" },
    "{68D230F3-CF80-4859-8CE7-A43EE81993B5}": { family: "light1", accent: "accent6" },
    "{7E9639D4-E3E2-4D34-9284-5A2195B3D0D7}": { family: "light2" },
    "{69012ECD-51FC-41F1-AA8D-1B2483CD663E}": { family: "light2", accent: "accent1" },
    "{72833802-FEF1-4C79-8D5D-14CF1EAF98D9}": { family: "light2", accent: "accent2" },
    "{F2DE63D5-997A-4646-A377-4702673A728D}": { family: "light2", accent: "accent3" },
    "{17292A2E-F333-43FB-9621-5CBBE7FDCDCB}": { family: "light2", accent: "accent4" },
    "{5A111915-BE36-4E01-A7E5-04B1672EAD32}": { family: "light2", accent: "accent5" },
    "{912C8C85-51F0-491E-9774-3900AFEF0FD7}": { family: "light2", accent: "accent6" },
    "{616DA210-FB5B-4158-B5E0-FEB733F419BA}": { family: "light3" },
    "{BC89EF96-8CEA-46FF-86C4-4CE0E7609802}": { family: "light3", accent: "accent1" },
    "{5DA37D80-6434-44D0-A028-1B22A696006F}": { family: "light3", accent: "accent2" },
    "{8799B23B-EC83-4686-B30A-512413B5E67A}": { family: "light3", accent: "accent3" },
    "{ED083AE6-46FA-4A59-8FB0-9F97EB10719F}": { family: "light3", accent: "accent4" },
    "{BDBED569-4797-4DF1-A0F4-6AAB3CD982D8}": { family: "light3", accent: "accent5" },
    "{E8B1032C-EA38-4F05-BA0D-38AFFFC7BED3}": { family: "light3", accent: "accent6" },
    "{793D81CF-94F2-401A-BA57-92F5A7B2D0C5}": { family: "medium1" },
    "{B301B821-A1FF-4177-AEE7-76D212191A09}": { family: "medium1", accent: "accent1" },
    "{9DCAF9ED-07DC-4A11-8D7F-57B35C25682E}": { family: "medium1", accent: "accent2" },
    "{1FECB4D8-DB02-4DC6-A0A2-4F2EBAE1DC90}": { family: "medium1", accent: "accent3" },
    "{1E171933-4619-4E11-9A3F-F7608DF75F80}": { family: "medium1", accent: "accent4" },
    "{FABFCF23-3B69-468F-B69F-88F6DE6A72F2}": { family: "medium1", accent: "accent5" },
    "{10A1B5D5-9B99-4C35-A422-299274C87663}": { family: "medium1", accent: "accent6" },
    "{073A0DAA-6AF3-43AB-8588-CEC1D06C72B9}": { family: "medium2" },
    "{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}": { family: "medium2", accent: "accent1" },
    "{21E4AEA4-8DFA-4A89-87EB-49C32662AFE0}": { family: "medium2", accent: "accent2" },
    "{F5AB1C69-6EDB-4FF4-983F-18BD219EF322}": { family: "medium2", accent: "accent3" },
    "{00A15C55-8517-42AA-B614-E9B94910E393}": { family: "medium2", accent: "accent4" },
    "{7DF18680-E054-41AD-8BC1-D1AEF772440D}": { family: "medium2", accent: "accent5" },
    "{93296810-A885-4BE3-A3E7-6D5BEEA58F35}": { family: "medium2", accent: "accent6" },
    "{8EC20E35-A176-4012-BC5E-935CFFF8708E}": { family: "medium3" },
    "{6E25E649-3F16-4E02-A733-19D2CDBF48F0}": { family: "medium3", accent: "accent1" },
    "{85BE263C-DBD7-4A20-BB59-AAB30ACAA65A}": { family: "medium3", accent: "accent2" },
    "{EB344D84-9AFB-497E-A393-DC336BA19D2E}": { family: "medium3", accent: "accent3" },
    "{EB9631B5-78F2-41C9-869B-9F39066F8104}": { family: "medium3", accent: "accent4" },
    "{74C1A8A3-306A-4EB7-A6B1-4F7E0EB9C5D6}": { family: "medium3", accent: "accent5" },
    "{2A488322-F2BA-4B5B-9748-0D474271808F}": { family: "medium3", accent: "accent6" },
    "{D7AC3CCA-C797-4891-BE02-D94E43425B78}": { family: "medium4" },
    "{69CF1AB2-1976-4502-BF36-3FF5EA218861}": { family: "medium4", accent: "accent1" },
    "{8A107856-5554-42FB-B03E-39F5DBC370BA}": { family: "medium4", accent: "accent2" },
    "{0505E3EF-67EA-436B-97B2-0124C06EBD24}": { family: "medium4", accent: "accent3" },
    "{C4B1156A-380E-4F78-BDF5-A606A8083BF9}": { family: "medium4", accent: "accent4" },
    "{22838BEF-8BB2-4498-84A7-C5851F593DF1}": { family: "medium4", accent: "accent5" },
    "{16D9F66E-5EB9-4882-86FB-DCBF35E3C3E4}": { family: "medium4", accent: "accent6" },
    "{E8034E78-7F5D-4C2E-B375-FC64B27BC917}": { family: "dark1" },
    "{125E5076-3810-47DD-B79F-674D7AD40C01}": { family: "dark1", accent: "accent1" },
    "{37CE84F3-28C3-443E-9E96-99CF82512B78}": { family: "dark1", accent: "accent2" },
    "{D03447BB-5D67-496B-8E87-E561075AD55C}": { family: "dark1", accent: "accent3" },
    "{E929F9F4-4A8F-4326-A1B4-22849713DDAB}": { family: "dark1", accent: "accent4" },
    "{8FD4443E-F989-4FC4-A0C8-D5A2AF1F390B}": { family: "dark1", accent: "accent5" },
    "{AF606853-7671-496A-8E4F-DF71F8EC918B}": { family: "dark1", accent: "accent6" },
    "{5202B0CA-FC54-4496-8BCA-5EF66A818D29}": { family: "dark2" },
    "{0660B408-B3CF-4A94-85FC-2B1E0A45F4A2}": { family: "dark2", accent: "accent1" },
    "{91EBBBCC-DAD2-459C-BE2E-F6DE35CF9A28}": { family: "dark2", accent: "accent3" },
    "{46F890A9-2807-4EBB-B81D-B2AA78EC7F39}": { family: "dark2", accent: "accent5" }
  };
  var LEGACY_NO_STYLE = "{2D5ABB26-0587-4C30-8999-92F81FD0307D}";
  function tint(hex, pct) {
    return mixToward(hex, pct, 255);
  }
  function shade(hex, pct) {
    return mixToward(hex, pct, 0);
  }
  function mixToward(hex, pct, target) {
    const h = hex.replace("#", "");
    const ch = (i) => parseInt(h.slice(i, i + 2), 16);
    const mix = (c) => Math.round(target * (1 - pct) + c * pct);
    const to = (c) => c.toString(16).toUpperCase().padStart(2, "0");
    return `#${to(mix(ch(0)))}${to(mix(ch(2)))}${to(mix(ch(4)))}`;
  }
  function over(fg, alpha, bg) {
    const f = fg.replace("#", "");
    const b = bg.replace("#", "");
    const ch = (s, i) => parseInt(s.slice(i, i + 2), 16);
    const mix = (i) => Math.round(ch(f, i) * alpha + ch(b, i) * (1 - alpha));
    const to = (c) => c.toString(16).toUpperCase().padStart(2, "0");
    return `#${to(mix(0))}${to(mix(2))}${to(mix(4))}`;
  }
  var solid = (color) => ({ type: "solid", color });
  var line = (color, width = 12700) => ({ fill: solid(color), width });
  function builtinStyle(family, accentName, theme) {
    const lt1 = resolveSchemeColor("lt1", theme) ?? "#FFFFFF";
    const dk1 = resolveSchemeColor("dk1", theme) ?? "#000000";
    const accent = accentName ? resolveSchemeColor(accentName, theme) ?? "#4472C4" : void 0;
    switch (family) {
      case "themed1": {
        if (!accent) return { wholeTbl: { textColor: dk1 } };
        const band = solid(over(accent, 0.4, lt1));
        return {
          wholeTbl: { textColor: dk1 },
          firstRow: { fill: solid(accent), textColor: lt1 },
          band1H: { fill: band },
          band1V: { fill: band },
          insideH: line(accent),
          insideV: line(accent),
          outer: { l: line(accent), r: line(accent), t: line(accent), b: line(accent) },
          firstRowBottom: line(lt1)
        };
      }
      case "themed2": {
        if (!accent) {
          return {
            wholeTbl: { textColor: dk1 },
            insideH: line(dk1),
            insideV: line(dk1),
            outer: { l: line(dk1), r: line(dk1), t: line(dk1), b: line(dk1) }
          };
        }
        const outer = line(tint(accent, 0.5));
        const band = solid(over(lt1, 0.2, accent));
        return {
          wholeTbl: { fill: solid(accent), textColor: lt1 },
          band1H: { fill: band },
          band1V: { fill: band },
          outer: { l: outer, r: outer, t: outer, b: outer },
          firstRowBottom: line(lt1),
          lastRowTop: line(lt1)
        };
      }
      case "light1": {
        const a = accent ?? dk1;
        const band = solid(over(a, 0.2, lt1));
        return {
          wholeTbl: { textColor: dk1 },
          firstRow: { bold: true, textColor: dk1 },
          firstCol: { bold: true },
          lastCol: { bold: true, textColor: dk1 },
          band1H: { fill: band },
          band1V: { fill: band },
          outer: { t: line(a), b: line(a) },
          firstRowBottom: line(a),
          lastRowTop: line(a)
        };
      }
      case "light2": {
        const a = accent ?? dk1;
        return {
          wholeTbl: { textColor: dk1 },
          firstRow: { fill: solid(a), textColor: lt1, bold: true },
          outer: { l: line(a), r: line(a), t: line(a), b: line(a) },
          lastRowTop: line(a)
        };
      }
      case "light3": {
        const a = accent ?? dk1;
        const band = solid(over(a, 0.2, lt1));
        return {
          wholeTbl: { textColor: dk1 },
          firstRow: { textColor: a, bold: true },
          band1H: { fill: band },
          band1V: { fill: band },
          insideH: line(a),
          insideV: line(a),
          outer: { l: line(a), r: line(a), t: line(a), b: line(a) },
          firstRowBottom: line(a),
          lastRowTop: line(a)
        };
      }
      case "medium1": {
        const a = accent ?? dk1;
        const band = solid(tint(a, 0.2));
        return {
          wholeTbl: { fill: solid(lt1), textColor: dk1 },
          firstRow: { fill: solid(a), textColor: lt1, bold: true },
          lastRow: { fill: solid(lt1), bold: true },
          band1H: { fill: band },
          band1V: { fill: band },
          insideH: line(a),
          outer: { l: line(a), r: line(a), t: line(a), b: line(a) },
          lastRowTop: line(a)
        };
      }
      case "medium2": {
        const a = accent ?? dk1;
        return {
          wholeTbl: { fill: solid(tint(a, 0.2)), textColor: dk1 },
          band1H: { fill: solid(tint(a, 0.4)) },
          band1V: { fill: solid(tint(a, 0.4)) },
          firstRow: { fill: solid(a), textColor: lt1, bold: true },
          lastRow: { fill: solid(a), textColor: lt1, bold: true },
          firstCol: { fill: solid(a), textColor: lt1, bold: true },
          lastCol: { fill: solid(a), textColor: lt1, bold: true },
          insideH: line(lt1),
          insideV: line(lt1),
          outer: { l: line(lt1), r: line(lt1), t: line(lt1), b: line(lt1) },
          firstRowBottom: line(lt1),
          lastRowTop: line(lt1)
        };
      }
      case "medium3": {
        const a = accent ?? dk1;
        const band = solid(tint(dk1, 0.2));
        return {
          wholeTbl: { fill: solid(lt1), textColor: dk1 },
          firstRow: { fill: solid(a), textColor: lt1, bold: true },
          lastRow: { fill: solid(lt1), bold: true },
          firstCol: { fill: solid(a), textColor: lt1 },
          lastCol: { fill: solid(a), textColor: lt1 },
          band1H: { fill: band },
          band1V: { fill: band },
          outer: { t: line(dk1), b: line(dk1) },
          firstRowBottom: line(dk1),
          lastRowTop: line(dk1)
        };
      }
      case "medium4": {
        const a = accent ?? dk1;
        const band = solid(tint(a, 0.4));
        return {
          wholeTbl: { fill: solid(tint(a, 0.2)), textColor: dk1 },
          firstRow: { fill: solid(tint(a, 0.2)), textColor: a, bold: true },
          lastRow: { fill: solid(tint(dk1, 0.2)) },
          band1H: { fill: band },
          band1V: { fill: band },
          insideH: line(a),
          insideV: line(a),
          outer: { l: line(a), r: line(a), t: line(a), b: line(a) },
          lastRowTop: line(dk1)
        };
      }
      case "dark1": {
        const a = accent ?? dk1;
        const tf = accent ? shade : tint;
        const body = accent ? lt1 : dk1;
        return {
          wholeTbl: { fill: solid(tf(a, 0.2)), textColor: body },
          firstRow: { fill: solid(dk1), textColor: lt1, bold: true },
          lastRow: { fill: solid(tf(a, 0.2)), textColor: body, bold: true },
          firstCol: { fill: solid(tf(a, 0.6)) },
          lastCol: { fill: solid(tf(a, 0.6)) },
          band1H: { fill: solid(tf(a, 0.4)) },
          band1V: { fill: solid(tf(a, 0.4)) },
          firstRowBottom: line(lt1),
          lastRowTop: line(lt1)
        };
      }
      case "dark2": {
        const a = accent ?? dk1;
        const headerPair = { accent1: "accent2", accent3: "accent4", accent5: "accent6" };
        const header = accentName ? resolveSchemeColor(headerPair[accentName] ?? accentName, theme) ?? dk1 : dk1;
        const band = solid(tint(a, 0.4));
        return {
          wholeTbl: { fill: solid(tint(a, 0.2)), textColor: dk1 },
          firstRow: { fill: solid(header), textColor: lt1, bold: true },
          lastRow: { fill: solid(tint(a, 0.2)), bold: true },
          band1H: { fill: band },
          band1V: { fill: band },
          lastRowTop: line(dk1)
        };
      }
    }
  }
  function resolveTableStyle(styleId, tableStylesXml, theme) {
    if (!styleId) return void 0;
    if (tableStylesXml && tableStylesXml.includes(styleId)) {
      const def = parseTableStylesXml(tableStylesXml, styleId, theme);
      if (def) return def;
    }
    const builtin = BUILTIN[styleId];
    if (builtin) return builtinStyle(builtin.family, builtin.accent, theme);
    if (styleId === LEGACY_NO_STYLE) return {};
    return void 0;
  }
  function cellStyleBorders(def, flags, r, c, nRows, nCols) {
    const out = {};
    if (r < nRows - 1 && def.insideH) out.b = def.insideH;
    if (c < nCols - 1 && def.insideV) out.r = def.insideV;
    if (def.outer) {
      if (r === 0 && def.outer.t) out.t = def.outer.t;
      if (r === nRows - 1 && def.outer.b) out.b = def.outer.b;
      if (c === 0 && def.outer.l) out.l = def.outer.l;
      if (c === nCols - 1 && def.outer.r) out.r = def.outer.r;
    }
    if (flags.firstRow && r === 0 && nRows > 1 && def.firstRowBottom) out.b = def.firstRowBottom;
    if (flags.lastRow && r === nRows - 1 && nRows > 1 && def.lastRowTop) out.t = def.lastRowTop;
    return out;
  }
  var tsParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) => name === "a:tblStyle"
  });
  function readColor(node, theme) {
    if (!node || typeof node !== "object") return void 0;
    const n = asXmlNode(node);
    const srgb = asXmlNode(n["a:srgbClr"])["@_val"];
    if (srgb) return "#" + String(srgb).toUpperCase();
    if (n["a:schemeClr"]) {
      const scheme = asXmlNode(n["a:schemeClr"]);
      const base = resolveSchemeColor(String(scheme["@_val"]), theme);
      if (!base) return void 0;
      const t = asXmlNode(scheme["a:tint"])["@_val"];
      return t ? tint(base, parseInt(String(t), 10) / 1e5) : base;
    }
    const prst = asXmlNode(n["a:prstClr"])["@_val"];
    if (prst === "black") return "#000000";
    if (prst === "white") return "#FFFFFF";
    return void 0;
  }
  function readPart(part, theme) {
    if (!part || typeof part !== "object") return void 0;
    const p = asXmlNode(part);
    const out = {};
    const fillColor = readColor(
      asXmlNode(asXmlNode(p["a:tcStyle"])["a:fill"])["a:solidFill"],
      theme
    );
    if (fillColor) out.fill = solid(fillColor);
    if (p["a:tcTxStyle"]) {
      const tx = asXmlNode(p["a:tcTxStyle"]);
      if (tx["@_b"] === "on") out.bold = true;
      const c = readColor(tx, theme);
      if (c) out.textColor = c;
    }
    return Object.keys(out).length ? out : void 0;
  }
  function readInside(part, tag, theme) {
    const bdr = asXmlNode(asXmlNode(asXmlNode(part)["a:tcStyle"])["a:tcBdr"]);
    const lnRaw = asXmlNode(bdr[tag])["a:ln"];
    if (!lnRaw) return void 0;
    const ln = asXmlNode(lnRaw);
    const c = readColor(ln["a:solidFill"], theme);
    if (!c) return void 0;
    return line(c, parseInt(String(ln["@_w"]), 10) || 12700);
  }
  function parseTableStylesXml(xml, styleId, theme) {
    let doc;
    try {
      doc = asXmlNode(tsParser.parse(xml));
    } catch {
      return void 0;
    }
    const list = asXmlNode(doc["a:tblStyleLst"])["a:tblStyle"] ?? [];
    const style = xmlArray(list).find((s) => s["@_styleId"] === styleId);
    if (!style) return void 0;
    const def = {};
    for (const key of ["wholeTbl", "band1H", "band2H", "band1V", "band2V", "firstRow", "lastRow", "firstCol", "lastCol"]) {
      const p = readPart(style["a:" + key], theme);
      if (p) def[key] = p;
    }
    def.insideH = readInside(style["a:wholeTbl"], "a:insideH", theme);
    def.insideV = readInside(style["a:wholeTbl"], "a:insideV", theme);
    if (!def.insideH) delete def.insideH;
    if (!def.insideV) delete def.insideV;
    return Object.keys(def).length ? def : void 0;
  }
  function cellPartStyle(def, flags, r, c, nRows, nCols) {
    const merge = (base, over2) => over2 ? { ...base, ...Object.fromEntries(Object.entries(over2).filter(([, v]) => v !== void 0)) } : base;
    let out = { ...def.wholeTbl ?? {} };
    const isFirstRow = flags.firstRow && r === 0;
    const isLastRow = flags.lastRow && r === nRows - 1;
    const isFirstCol = flags.firstCol && c === 0;
    const isLastCol = flags.lastCol && c === nCols - 1;
    if (flags.bandRow && !isFirstRow && !isLastRow) {
      const dataR = r - (flags.firstRow ? 1 : 0);
      out = merge(out, dataR % 2 === 0 ? def.band1H : def.band2H);
    }
    if (flags.bandCol && !isFirstCol && !isLastCol) {
      const dataC = c - (flags.firstCol ? 1 : 0);
      out = merge(out, dataC % 2 === 0 ? def.band1V : def.band2V);
    }
    if (isLastCol) out = merge(out, def.lastCol);
    if (isFirstCol) out = merge(out, def.firstCol);
    if (isLastRow) out = merge(out, def.lastRow);
    if (isFirstRow) out = merge(out, def.firstRow);
    return out;
  }

  // ../engine/pptx-engine/parse.ts
  var parser2 = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    // Text fidelity: no trim (leading/trailing spaces in runs matter, e.g. "bold word " + following text),
    // no numeric coercion of tag values (otherwise <a:t>2026</a:t> becomes a number and downstream string reads lose characters)
    trimValues: false,
    parseTagValue: false,
    // Order preservation is not the point (semantic tree); keep array structure for multiple runs/paragraphs
    isArray: (name) => [
      "a:p",
      "a:r",
      "a:br",
      "a:fld",
      "p:sp",
      "p:pic",
      "p:graphicFrame",
      "p:grpSp",
      "p:cxnSp",
      "a:tr",
      "a:tc",
      "a:gridCol"
    ].includes(name)
    // spTree children nested in groups also need arrays (covered above)
  });
  var EMU_PER_PT = 12700;
  var uidCounter = 0;
  function uid(prefix) {
    return `${prefix}_${(uidCounter++).toString(36)}`;
  }
  function parseSlide(input) {
    const { slideXml, path, layoutPath, masterPath, ctx } = input;
    const scan = scanSlide(slideXml);
    const elements = [];
    scan.elements.forEach((sp, idx) => {
      const fragXml = slideXml.slice(sp.start, sp.end);
      const anchor = {
        spIndex: idx,
        originalXml: fragXml,
        range: [sp.start, sp.end],
        ...sp.gapAfter ? { gapAfter: sp.gapAfter } : {}
      };
      const el = parseShapeFragment(sp, fragXml, anchor, ctx);
      if (el) elements.push(el);
    });
    const background = parseBackground(slideXml, ctx) ?? (ctx.layoutBg ? parseBackground(ctx.layoutBg, ctx) : void 0) ?? (ctx.masterBg ? parseBackground(ctx.masterBg, ctx) : void 0);
    return {
      path,
      originalXml: slideXml,
      bodyPrefix: scan.bodyPrefix,
      bodySuffix: scan.bodySuffix,
      elements,
      layoutPath,
      masterPath,
      ...background ? { background } : {}
    };
  }
  function parseBackground(xml, ctx) {
    const m = /<p:bg\b[\s\S]*?<\/p:bg>/.exec(xml);
    if (!m) return void 0;
    let doc;
    try {
      doc = parser2.parse(m[0]);
    } catch {
      return void 0;
    }
    const bg = doc["p:bg"];
    const bgPr = bg?.["p:bgPr"];
    if (bgPr) {
      return parseFill(bgPr, ctx);
    }
    const bgRef = bg?.["p:bgRef"];
    if (bgRef) {
      const color = resolveColorNode2(bgRef, ctx);
      if (color) return { type: "solid", color };
    }
    return void 0;
  }
  function parseShapeFragment(sp, fragXml, anchor, ctx) {
    const semanticXml = fragXml.replace(/<a:br\b[^>]*\/>|<a:br\b[\s\S]*?<\/a:br>/g, "<a:r><a:t>\n</a:t></a:r>").replace(/<a:fld\b/g, "<a:r").replace(/<\/a:fld>/g, "</a:r>");
    const doc = parser2.parse(semanticXml);
    const node = doc[sp.name] ? Array.isArray(doc[sp.name]) ? doc[sp.name][0] : doc[sp.name] : null;
    if (!node) return null;
    switch (sp.name) {
      case "p:sp":
        return parseSpShape(node, anchor, ctx);
      case "p:pic":
        return parsePicture(node, anchor, ctx);
      case "p:grpSp":
        return parseGroup(node, anchor, ctx);
      case "p:graphicFrame":
        return graphicFramePassthrough(node, anchor, ctx);
      case "p:cxnSp":
        return parseConnector(node, anchor, ctx);
      default:
        return passthrough(anchor, "unknown", node);
    }
  }
  function parseSpShape(node, anchor, ctx, rawXml) {
    const spPr = node["p:spPr"] ?? {};
    const nv = node["p:nvSpPr"];
    const ph = nv?.["p:nvPr"]?.["p:ph"];
    const phType = ph?.["@_type"];
    const phIdx = ph?.["@_idx"] != null ? String(ph["@_idx"]) : void 0;
    const name = nv?.["p:cNvPr"]?.["@_name"];
    let transform = parseXfrm(spPr["a:xfrm"]);
    if (ph && !spPr["a:xfrm"]) {
      const inherited = resolvePlaceholderTransform(
        ctx.layoutPlaceholders,
        ctx.masterPlaceholders,
        phType,
        phIdx
      );
      if (inherited) transform = inherited;
    }
    const prstGeom = spPr["a:prstGeom"];
    const presetGeometry = prstGeom?.["@_prst"];
    const adjust = parseAvLst(prstGeom?.["a:avLst"]);
    const customGeometry = spPr["a:custGeom"] != null ? parseCustGeom(rawXml || anchor.originalXml, transform.offset.cx, transform.offset.cy) : void 0;
    let fill = parseFill(spPr, ctx);
    const txBody = node["p:txBody"];
    const phChain = ph ? placeholderStyleChain(
      ctx.layoutPlaceholders,
      ctx.masterPlaceholders,
      ctx.masterTextStyles,
      phType,
      phIdx
    ) : [];
    const text = txBody ? parseTextBody(txBody, ctx, phChain) : void 0;
    let stroke = parseStroke(spPr, ctx);
    let shadow = parseShadow(spPr, ctx);
    let glow = parseGlow(spPr, ctx);
    const style = node["p:style"];
    if (style && typeof style === "object") {
      if (fill === void 0) {
        const ref = style["a:fillRef"];
        const idx = parseInt(String(ref?.["@_idx"] ?? "0"), 10) || 0;
        const phClr = resolveColorNode2(ref, ctx);
        if (idx > 0) {
          const tpl = idx > 1e3 ? ctx.theme?.bgFillStyles?.[idx - 1001] : ctx.theme?.fillStyles?.[idx - 1];
          const tplFill = tpl ? parseFill(tpl, { ...ctx, phClr }) : void 0;
          fill = tplFill ?? (phClr ? { type: "solid", color: phClr } : void 0);
        }
      }
      if (stroke === void 0) stroke = styleRefStroke(node, ctx);
      if (!shadow && !glow) {
        const ref = style["a:effectRef"];
        const idx = parseInt(String(ref?.["@_idx"] ?? "0"), 10) || 0;
        const phClr = resolveColorNode2(ref, ctx);
        const es = idx > 0 ? ctx.theme?.effectStyles?.[idx - 1]?.["a:effectStyle"] : void 0;
        if (es) {
          const tplCtx = { ...ctx, phClr };
          shadow = parseShadow(es, tplCtx);
          glow = parseGlow(es, tplCtx);
        }
      }
      const fontColor = resolveColorNode2(style["a:fontRef"], ctx);
      if (fontColor && text) {
        for (const p of text.paragraphs) {
          for (const r of p.runs) if (!r.color) r.color = fontColor;
        }
      }
    }
    const el = {
      id: uid("sp"),
      type: txBody && !presetGeometry && !customGeometry ? "text" : "shape",
      anchor,
      transform,
      // <p:ph> without a type (content placeholder) defaults to body per ECMA
      placeholder: ph ? phType ?? "body" : void 0,
      name,
      presetGeometry,
      ...adjust ? { adjust } : {},
      ...customGeometry ? { customGeometry } : {},
      fill,
      ...stroke ? { stroke } : {},
      ...shadow ? { shadow } : {},
      ...glow ? { glow } : {},
      text
    };
    return el;
  }
  function styleRefStroke(node, ctx) {
    const ref = node?.["p:style"]?.["a:lnRef"];
    const idx = parseInt(String(ref?.["@_idx"] ?? "0"), 10) || 0;
    if (idx <= 0) return void 0;
    const phClr = resolveColorNode2(ref, ctx);
    const tpl = ctx.theme?.lnStyles?.[idx - 1];
    return (tpl ? parseStroke(tpl, { ...ctx, phClr }) : void 0) ?? (phClr ? { fill: { type: "solid", color: phClr }, width: 12700 } : void 0);
  }
  function parseStroke(spPr, ctx, fallbackColor) {
    const ln = spPr?.["a:ln"];
    if (!ln || typeof ln !== "object") return void 0;
    if ("a:noFill" in ln) return null;
    let fill = parseFill(ln, ctx);
    if (!fill || fill.type === "none") {
      if (!fallbackColor) return void 0;
      fill = { type: "solid", color: fallbackColor };
    }
    const capMap = { flat: "flat", rnd: "round", sq: "square" };
    const dash = ln["a:prstDash"]?.["@_val"];
    const cap = ln["@_cap"] ? capMap[ln["@_cap"]] : void 0;
    const headEnd = parseArrowEnd(ln["a:headEnd"]);
    const tailEnd = parseArrowEnd(ln["a:tailEnd"]);
    return {
      fill,
      width: intOr(ln["@_w"], 12700),
      ...dash ? { dash: String(dash) } : {},
      ...cap ? { cap } : {},
      ...headEnd ? { headEnd } : {},
      ...tailEnd ? { tailEnd } : {}
    };
  }
  function parseArrowEnd(node) {
    if (!node || typeof node !== "object") return void 0;
    const type = String(node["@_type"] ?? "none");
    if (type === "none") return void 0;
    const wRaw = node["@_w"];
    const lenRaw = node["@_len"];
    const sizeMap = { sm: "sm", med: "med", lg: "lg" };
    return {
      type,
      ...wRaw ? { w: sizeMap[wRaw] ?? "med" } : {},
      ...lenRaw ? { len: sizeMap[lenRaw] ?? "med" } : {}
    };
  }
  function parseConnector(node, anchor, ctx) {
    const spPr = node["p:spPr"] ?? {};
    const nvCxn = node["p:nvCxnSpPr"];
    const name = nvCxn?.["p:cNvPr"]?.["@_name"];
    const prstGeom = spPr["a:prstGeom"];
    const refStroke = styleRefStroke(node, ctx);
    const fallback = (refStroke?.fill.type === "solid" ? refStroke.fill.color : void 0) ?? ctx.theme?.colors?.["dk1"] ?? "#000000";
    const explicitStroke = parseStroke(spPr, ctx, spPr?.["a:ln"] ? fallback : void 0);
    const stroke = explicitStroke === null ? void 0 : explicitStroke ?? refStroke ?? { fill: { type: "solid", color: fallback }, width: 12700 };
    const cxnPr = nvCxn?.["p:cNvCxnSpPr"];
    const st = cxnPr?.["a:stCxn"];
    const end = cxnPr?.["a:endCxn"];
    const cxnRef = (n) => n?.["@_id"] != null ? { id: parseInt(n["@_id"], 10), idx: intOr(n["@_idx"], 0) } : void 0;
    const connection = st || end ? {
      ...cxnRef(st) ? { start: cxnRef(st) } : {},
      ...cxnRef(end) ? { end: cxnRef(end) } : {}
    } : void 0;
    return {
      id: uid("cxn"),
      type: "shape",
      anchor,
      transform: parseXfrm(spPr["a:xfrm"]),
      name,
      presetGeometry: prstGeom?.["@_prst"] ?? "line",
      ...parseAvLst(prstGeom?.["a:avLst"]) ? { adjust: parseAvLst(prstGeom?.["a:avLst"]) } : {},
      ...connection ? { connection } : {},
      fill: { type: "none" },
      ...stroke ? { stroke } : {}
    };
  }
  function parseGlow(spPr, ctx) {
    const glow = spPr?.["a:effectLst"]?.["a:glow"];
    if (!glow || typeof glow !== "object") return void 0;
    const color = resolveColorNode2(glow, ctx);
    if (!color) return void 0;
    const rad = glow["@_rad"] != null ? parseInt(glow["@_rad"], 10) : 0;
    return { color, radius: Number.isFinite(rad) ? rad : 0 };
  }
  function parseShadow(spPr, ctx) {
    const shdw = spPr?.["a:effectLst"]?.["a:outerShdw"];
    if (!shdw || typeof shdw !== "object") return void 0;
    const color = resolveColorNode2(shdw, ctx);
    if (!color) return void 0;
    return {
      color,
      blurRad: intOr(shdw["@_blurRad"], 0),
      dist: intOr(shdw["@_dist"], 0),
      dirDeg: intOr(shdw["@_dir"], 0) / 6e4
    };
  }
  function parseAvLst(avLst) {
    const gdRaw = avLst?.["a:gd"];
    if (!gdRaw) return void 0;
    const list = Array.isArray(gdRaw) ? gdRaw : [gdRaw];
    const out = {};
    for (const gd of list) {
      const name = gd?.["@_name"];
      const m = /^val\s+(-?\d+)/.exec(String(gd?.["@_fmla"] ?? ""));
      if (name && m) out[name] = parseInt(m[1], 10);
    }
    return Object.keys(out).length ? out : void 0;
  }
  var GROUP_CHILD_TAGS = ["p:sp", "p:pic", "p:grpSp", "p:graphicFrame", "p:cxnSp"];
  function parseGroup(node, anchor, ctx, rawXml) {
    const grpSpPr = node["p:grpSpPr"] ?? {};
    const xfrm = grpSpPr["a:xfrm"];
    const transform = parseXfrm(xfrm);
    const name = node["p:nvGrpSpPr"]?.["p:cNvPr"]?.["@_name"];
    const chOff = xfrm?.["a:chOff"];
    const chExt = xfrm?.["a:chExt"];
    const childOffset = chOff || chExt ? {
      x: chOff ? parseInt(chOff["@_x"], 10) || 0 : 0,
      y: chOff ? parseInt(chOff["@_y"], 10) || 0 : 0,
      cx: chExt ? parseInt(chExt["@_cx"], 10) || 0 : 0,
      cy: chExt ? parseInt(chExt["@_cy"], 10) || 0 : 0
    } : void 0;
    const groupXml = rawXml || anchor.originalXml;
    const slices = sliceGroupChildren(groupXml);
    const byTag = {};
    for (const s of slices) (byTag[s.name] ??= []).push(s);
    const ordered = [];
    for (const tag of GROUP_CHILD_TAGS) {
      const raw = node[tag];
      if (!raw) continue;
      const list = Array.isArray(raw) ? raw : [raw];
      list.forEach((child, i) => {
        const slice = byTag[tag]?.[i];
        const el = parseGroupChild(tag, child, ctx, slice?.xml);
        if (el) ordered.push({ el, start: slice?.start ?? Number.MAX_SAFE_INTEGER });
      });
    }
    ordered.sort((a, b) => a.start - b.start);
    const children = ordered.map((o) => o.el);
    return {
      id: uid("grp"),
      type: "group",
      anchor,
      transform,
      name,
      children,
      ...childOffset ? { childOffset } : {}
    };
  }
  function parseGroupChild(tag, child, ctx, rawXml) {
    const childAnchor = { spIndex: -1, originalXml: "", range: [0, 0] };
    let el;
    switch (tag) {
      case "p:sp":
        el = parseSpShape(child, childAnchor, ctx, rawXml);
        break;
      case "p:pic":
        el = parsePicture(child, childAnchor, ctx);
        break;
      case "p:grpSp":
        el = parseGroup(child, childAnchor, ctx, rawXml);
        break;
      case "p:graphicFrame":
        el = graphicFramePassthrough(child, childAnchor, ctx);
        break;
      case "p:cxnSp":
        el = parseConnector(child, childAnchor, ctx);
        break;
      default:
        return null;
    }
    const nvId = groupChildNvId(child);
    if (el && nvId != null) el.nvId = nvId;
    return el;
  }
  function groupChildNvId(child) {
    for (const key of ["p:nvSpPr", "p:nvPicPr", "p:nvGrpSpPr", "p:nvGraphicFramePr", "p:nvCxnSpPr"]) {
      const id = child?.[key]?.["p:cNvPr"]?.["@_id"];
      if (id != null) return String(id);
    }
    return void 0;
  }
  var GROUP_TAG_RE = /<\/?(?:[^<>"']|"[^"]*"|'[^']*')*>/g;
  var GROUP_NAME_RE = /^<\/?\s*([A-Za-z_][\w:.-]*)/;
  function sliceGroupChildren(xml) {
    const out = [];
    const tags = new Set(GROUP_CHILD_TAGS);
    GROUP_TAG_RE.lastIndex = 0;
    let depth = 0;
    let start = -1;
    let startName = "";
    let m;
    while (m = GROUP_TAG_RE.exec(xml)) {
      const tag = m[0];
      if (tag.startsWith("<!--") || tag.startsWith("<![") || tag.startsWith("<?")) continue;
      const closing = tag.startsWith("</");
      const self2 = !closing && tag.endsWith("/>");
      const name = GROUP_NAME_RE.exec(tag)?.[1] ?? "";
      if (closing) {
        depth--;
        if (depth === 1 && startName) {
          out.push({ name: startName, xml: xml.slice(start, m.index + tag.length), start });
          startName = "";
        }
      } else if (self2) {
        if (depth === 1 && tags.has(name)) out.push({ name, xml: tag, start: m.index });
      } else {
        if (depth === 1 && tags.has(name)) {
          start = m.index;
          startName = name;
        }
        depth++;
      }
    }
    return out;
  }
  function sliceGroupChildXmls(grpXml) {
    return sliceGroupChildren(grpXml).map((s) => s.xml);
  }
  function blipEmbedId(blip) {
    const direct = blip?.["@_r:embed"];
    if (direct) return direct;
    const exts = blip?.["a:extLst"]?.["a:ext"];
    for (const ext of Array.isArray(exts) ? exts : exts ? [exts] : []) {
      for (const [key, value] of Object.entries(ext)) {
        if (key === "svgBlip" || key.endsWith(":svgBlip")) {
          const id = value?.["@_r:embed"];
          if (id) return id;
        }
      }
    }
    return void 0;
  }
  function parsePicture(node, anchor, ctx) {
    const spPr = node["p:spPr"] ?? {};
    const transform = parseXfrm(spPr["a:xfrm"]);
    const blipFill = node["p:blipFill"];
    const blip = blipFill?.["a:blip"];
    const embedId = blipEmbedId(blip);
    const mediaRef = embedId && ctx.mediaRels?.get(embedId) || "";
    const name = node["p:nvPicPr"]?.["p:cNvPr"]?.["@_name"];
    const descr = node["p:nvPicPr"]?.["p:cNvPr"]?.["@_descr"];
    const srcRect = parseSrcRect(blipFill?.["a:srcRect"]);
    const picGeom = spPr["a:prstGeom"]?.["@_prst"];
    const picAdjust = parseAvLst(spPr["a:prstGeom"]?.["a:avLst"]);
    const softEdgeRad = spPr["a:effectLst"]?.["a:softEdge"]?.["@_rad"];
    const alphaAmt = blip?.["a:alphaModFix"]?.["@_amt"];
    const opacity = alphaAmt != null ? Math.max(0, Math.min(1, parseInt(alphaAmt, 10) / 1e5)) : void 0;
    const stroke = parseStroke(spPr, ctx);
    const shadow = parseShadow(spPr, ctx);
    const glow = parseGlow(spPr, ctx);
    const nvPr = node["p:nvPicPr"]?.["p:nvPr"];
    const avNode = nvPr?.["a:videoFile"] ?? nvPr?.["a:audioFile"];
    let media;
    if (avNode !== void 0) {
      const kind = nvPr?.["a:videoFile"] !== void 0 ? "video" : "audio";
      const link = avNode?.["@_r:link"];
      const rel = link ? ctx.avRels?.get(String(link)) : void 0;
      media = {
        kind,
        ...rel ? { target: rel.target, ...rel.external ? { external: true } : {} } : {}
      };
    }
    return {
      id: uid("pic"),
      type: "picture",
      anchor,
      transform,
      name,
      ...descr ? { descr } : {},
      mediaRef,
      ...srcRect ? { srcRect } : {},
      ...picGeom && picGeom !== "rect" ? { presetGeometry: picGeom, ...picAdjust ? { adjust: picAdjust } : {} } : {},
      ...opacity != null && opacity < 1 ? { opacity } : {},
      ...softEdgeRad != null ? { softEdge: intOr(softEdgeRad, 0) } : {},
      ...media ? { media } : {},
      ...stroke ? { stroke } : {},
      ...shadow ? { shadow } : {},
      ...glow ? { glow } : {}
    };
  }
  function parseSrcRect(sr) {
    if (!sr || typeof sr !== "object") return void 0;
    const f = (k) => intOr(sr[`@_${k}`], 0) / 1e5;
    const rect = { l: f("l"), t: f("t"), r: f("r"), b: f("b") };
    if (!rect.l && !rect.t && !rect.r && !rect.b) return void 0;
    return rect;
  }
  function graphicFramePassthrough(node, anchor, ctx) {
    const data = node["a:graphic"]?.["a:graphicData"];
    const uri = data?.["@_uri"] ?? "";
    if (uri.includes("/table") && data?.["a:tbl"]) {
      const table = parseTable(node, data["a:tbl"], anchor, ctx);
      if (table) return table;
    }
    if (uri.includes("/chart")) {
      const rid = data?.["c:chart"]?.["@_r:id"];
      const chartXml = rid ? ctx.chartXmls?.get(rid) : void 0;
      const model = chartXml ? parseChartXml(chartXml, ctx.theme) : null;
      if (model) {
        const cNvPr = node["p:nvGraphicFramePr"]?.["p:cNvPr"];
        const descr = cNvPr?.["@_descr"] || void 0;
        return {
          id: uid("chart"),
          type: "chart",
          anchor,
          transform: parseXfrm(node["p:xfrm"]),
          name: cNvPr?.["@_name"],
          ...descr ? { descr } : {},
          chart: model
        };
      }
    }
    let kind = "unknown";
    if (uri.includes("/table")) kind = "table";
    else if (uri.includes("/chart")) kind = "chart";
    else if (uri.includes("/diagram") || uri.includes("SmartArt")) kind = "smartart";
    else if (uri.includes("/ole")) kind = "ole";
    const transform = parseXfrm(node["p:xfrm"]);
    const el = {
      id: uid("gf"),
      type: "passthrough",
      anchor,
      transform,
      kind
    };
    if (kind === "smartart") {
      const dm = data?.["dgm:relIds"]?.["@_r:dm"];
      const drawingXml = dm ? ctx.diagramDrawings?.get(String(dm)) : void 0;
      if (drawingXml) {
        const shapes = parseDiagramDrawing(drawingXml, ctx);
        if (shapes.length) el.previewShapes = shapes;
      }
    }
    if (kind === "ole") {
      const pic = findDescendantPic(data);
      if (pic) el.previewPicture = parsePicture(pic, anchor, ctx);
    }
    return el;
  }
  function parseDiagramDrawing(drawingXml, ctx) {
    const xml = drawingXml.replace(/<(\/?)dsp:/g, "<$1p:");
    let doc;
    try {
      doc = parser2.parse(xml);
    } catch {
      return [];
    }
    const spTree = doc["p:drawing"]?.["p:spTree"];
    if (!spTree) return [];
    const spsRaw = spTree["p:sp"];
    const sps = Array.isArray(spsRaw) ? spsRaw : spsRaw ? [spsRaw] : [];
    const out = [];
    for (const sp of sps) {
      const anchor = { spIndex: -1, originalXml: "", range: [0, 0] };
      const el = parseSpShape(sp, anchor, ctx);
      if (el.type !== "passthrough") out.push(el);
    }
    return out;
  }
  function findDescendantPic(node, depth = 0) {
    if (!node || typeof node !== "object" || depth > 6) return void 0;
    const pics = node["p:pic"];
    if (Array.isArray(pics) && pics.length) return pics[0];
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith("@_")) continue;
      for (const child of Array.isArray(v) ? v : [v]) {
        const found = findDescendantPic(child, depth + 1);
        if (found) return found;
      }
    }
    return void 0;
  }
  function parseTable(node, tbl, anchor, ctx) {
    const gridRaw = tbl["a:tblGrid"]?.["a:gridCol"];
    const gridCols = Array.isArray(gridRaw) ? gridRaw : gridRaw ? [gridRaw] : [];
    const colWidths = gridCols.map((g) => intOr(g["@_w"], 0));
    const trsRaw = tbl["a:tr"];
    const trs = Array.isArray(trsRaw) ? trsRaw : trsRaw ? [trsRaw] : [];
    if (!colWidths.length || !trs.length) return null;
    const tblPr2 = tbl["a:tblPr"] ?? {};
    const styleIdRaw = tblPr2["a:tableStyleId"];
    const styleId = typeof styleIdRaw === "string" ? styleIdRaw : styleIdRaw?.["#text"];
    const styleDef = resolveTableStyle(styleId, ctx.tableStyles, ctx.theme);
    const flags = {
      firstRow: tblPr2["@_firstRow"] === "1",
      lastRow: tblPr2["@_lastRow"] === "1",
      firstCol: tblPr2["@_firstCol"] === "1",
      lastCol: tblPr2["@_lastCol"] === "1",
      bandRow: tblPr2["@_bandRow"] === "1",
      bandCol: tblPr2["@_bandCol"] === "1"
    };
    const nRows = trs.length;
    const nCols = colWidths.length;
    const rowHeights = trs.map((tr) => intOr(tr["@_h"], 0));
    const rows = trs.map((tr, r) => {
      const tcsRaw = tr["a:tc"];
      const tcs = Array.isArray(tcsRaw) ? tcsRaw : tcsRaw ? [tcsRaw] : [];
      const gridCols2 = tableRowGridCols(
        tcs.map((tc) => ({
          gridSpan: tc["@_gridSpan"] ? parseInt(tc["@_gridSpan"], 10) || 1 : 1,
          merged: tc["@_hMerge"] === "1" || tc["@_vMerge"] === "1"
        }))
      );
      return tcs.map((tc, i) => {
        const c = gridCols2[i];
        const part = styleDef ? cellPartStyle(styleDef, flags, r, c, nRows, nCols) : void 0;
        const inside = styleDef ? cellStyleBorders(styleDef, flags, r, c, nRows, nCols) : void 0;
        return parseTableCell(tc, ctx, part, inside);
      });
    });
    return {
      id: uid("tbl"),
      type: "table",
      anchor,
      transform: parseXfrm(node["p:xfrm"]),
      name: node["p:nvGraphicFramePr"]?.["p:cNvPr"]?.["@_name"],
      colWidths,
      rowHeights,
      rows,
      styleFlags: { firstRow: flags.firstRow, bandRow: flags.bandRow }
    };
  }
  function parseTableCell(tc, ctx, part, inside) {
    const tcPr = tc["a:tcPr"] ?? {};
    const cell = {};
    if (tc["a:txBody"]) {
      const styleChain = part && (part.bold !== void 0 || part.textColor) ? [
        {
          levels: [
            {
              ...part.bold !== void 0 ? { bold: part.bold } : {},
              ...part.textColor ? { color: part.textColor } : {}
            }
          ]
        }
      ] : [];
      const text = parseTextBody(tc["a:txBody"], ctx, styleChain);
      const anchorMap = { t: "top", ctr: "middle", b: "bottom" };
      if (tcPr["@_anchor"]) text.anchor = anchorMap[tcPr["@_anchor"]];
      text.insets = {
        l: intOr(tcPr["@_marL"], 91440),
        r: intOr(tcPr["@_marR"], 91440),
        t: intOr(tcPr["@_marT"], 45720),
        b: intOr(tcPr["@_marB"], 45720)
      };
      cell.text = text;
    }
    const fill = parseFill(tcPr, ctx);
    if (fill && fill.type !== "none") cell.fill = fill;
    else if (part?.fill) cell.fill = part.fill;
    const borders = {};
    for (const [key, tag] of [
      ["l", "a:lnL"],
      ["r", "a:lnR"],
      ["t", "a:lnT"],
      ["b", "a:lnB"]
    ]) {
      const ln = tcPr[tag];
      if (!ln || typeof ln !== "object") continue;
      const stroke = parseStroke({ "a:ln": ln }, ctx);
      if (stroke) borders[key] = stroke;
    }
    for (const k of ["l", "r", "t", "b"]) {
      if (inside?.[k] && !borders[k]) borders[k] = inside[k];
    }
    if (Object.keys(borders).length) cell.borders = borders;
    const gridSpan = tc["@_gridSpan"] ? parseInt(tc["@_gridSpan"], 10) : void 0;
    const rowSpan = tc["@_rowSpan"] ? parseInt(tc["@_rowSpan"], 10) : void 0;
    if (gridSpan && gridSpan > 1) cell.gridSpan = gridSpan;
    if (rowSpan && rowSpan > 1) cell.rowSpan = rowSpan;
    if (tc["@_hMerge"] === "1" || tc["@_vMerge"] === "1") cell.merged = true;
    return cell;
  }
  function passthrough(anchor, kind, node) {
    const spPr = node?.["p:spPr"] ?? node?.["p:grpSpPr"];
    const transform = parseXfrm(spPr?.["a:xfrm"]);
    return { id: uid("pt"), type: "passthrough", anchor, transform, kind };
  }
  function parseXfrm(xfrm) {
    const zero = {
      offset: { x: 0, y: 0, cx: 0, cy: 0 },
      rot: 0,
      flipH: false,
      flipV: false
    };
    if (!xfrm) return zero;
    const off = xfrm["a:off"];
    const ext = xfrm["a:ext"];
    return {
      offset: {
        x: off ? parseInt(off["@_x"], 10) || 0 : 0,
        y: off ? parseInt(off["@_y"], 10) || 0 : 0,
        cx: ext ? parseInt(ext["@_cx"], 10) || 0 : 0,
        cy: ext ? parseInt(ext["@_cy"], 10) || 0 : 0
      },
      rot: xfrm["@_rot"] ? parseInt(xfrm["@_rot"], 10) || 0 : 0,
      flipH: xfrm["@_flipH"] === "1" || xfrm["@_flipH"] === "true",
      flipV: xfrm["@_flipV"] === "1" || xfrm["@_flipV"] === "true"
    };
  }
  function parseFill(spPr, ctx) {
    if (!spPr) return void 0;
    if ("a:noFill" in spPr) return { type: "none" };
    const solid2 = spPr["a:solidFill"];
    if (solid2) {
      const color = resolveColorNode2(solid2, ctx);
      if (color) return { type: "solid", color };
    }
    const grad = spPr["a:gradFill"];
    if (grad) return parseGradFill(grad, ctx);
    const blip = spPr["a:blipFill"];
    if (blip) {
      const embedId = blipEmbedId(blip["a:blip"]);
      const mediaRef = embedId && ctx.mediaRels?.get(embedId) || "";
      if (mediaRef) return { type: "image", mediaRef, mode: "a:tile" in blip ? "tile" : "stretch" };
    }
    const pat = spPr["a:pattFill"];
    if (pat) {
      const fg = resolveColorNode2(pat["a:fgClr"], ctx) ?? "#000000";
      const bg = resolveColorNode2(pat["a:bgClr"], ctx) ?? "#FFFFFF";
      return { type: "pattern", fg, bg, preset: String(pat["@_prst"] ?? "pct50") };
    }
    return void 0;
  }
  function parseGradFill(grad, ctx) {
    const gsLst = grad["a:gsLst"]?.["a:gs"];
    const list = gsLst ? Array.isArray(gsLst) ? gsLst : [gsLst] : [];
    const stops = list.map((gs) => {
      const pos = (parseInt(gs["@_pos"], 10) || 0) / 1e5;
      const color = resolveColorNode2(gs, ctx);
      return color ? { pos, color } : null;
    }).filter((s) => !!s);
    if (!stops.length) return void 0;
    const ang = grad["a:lin"]?.["@_ang"];
    const angle = ang != null ? parseInt(ang, 10) || 0 : void 0;
    const pathType = grad["a:path"]?.["@_path"];
    return {
      type: "gradient",
      stops,
      ...angle != null ? { angle } : {},
      ...pathType === "circle" || pathType === "rect" || pathType === "shape" ? { path: pathType } : {}
    };
  }
  function resolveColorNode2(node, ctx) {
    return resolveColorNode(node, ctx.theme, ctx.phClr);
  }
  function parseTextBody(txBody, ctx, phChain = []) {
    const bodyPrRaw = txBody["a:bodyPr"];
    const bodyPr = bodyPrRaw && typeof bodyPrRaw === "object" ? bodyPrRaw : {};
    const anchorMap = { t: "top", ctr: "middle", b: "bottom" };
    const paras = txBody["a:p"] ? Array.isArray(txBody["a:p"]) ? txBody["a:p"] : [txBody["a:p"]] : [];
    const ownStyle = parseLstStyleLevels(txBody["a:lstStyle"], ctx.theme);
    const chain = [ownStyle, ...phChain];
    const paragraphs = paras.map((p) => parseParagraph(p, ctx, chain));
    let autofit = "none";
    if ("a:normAutofit" in bodyPr) autofit = "shrink";
    else if ("a:spAutoFit" in bodyPr) autofit = "resize";
    const naf = bodyPr["a:normAutofit"];
    const nafAttr = (k) => {
      const v = naf && typeof naf === "object" ? naf[k] : void 0;
      const n = v != null ? parseInt(String(v), 10) : NaN;
      return Number.isFinite(n) && n > 0 ? n / 1e5 : void 0;
    };
    const fontScale = nafAttr("@_fontScale");
    const lnSpcReduction = nafAttr("@_lnSpcReduction");
    const vertRaw = bodyPr["@_vert"];
    const vert = vertRaw === "eaVert" || vertRaw === "vert" || vertRaw === "vert270" || vertRaw === "wordArtVert" ? vertRaw : void 0;
    return {
      paragraphs,
      anchor: bodyPr["@_anchor"] ? anchorMap[bodyPr["@_anchor"]] : void 0,
      insets: {
        l: intOr(bodyPr["@_lIns"], 91440),
        t: intOr(bodyPr["@_tIns"], 45720),
        r: intOr(bodyPr["@_rIns"], 91440),
        b: intOr(bodyPr["@_bIns"], 45720)
      },
      autofit,
      ...fontScale != null ? { fontScale } : {},
      ...lnSpcReduction != null ? { lnSpcReduction } : {},
      wrap: bodyPr["@_wrap"] !== "none",
      ...vert ? { vert } : {}
    };
  }
  function spcPct(node) {
    const v = node?.["a:spcPct"]?.["@_val"];
    return v != null ? (parseInt(v, 10) || 0) / 1e3 : void 0;
  }
  function spcPts(node) {
    const v = node?.["a:spcPts"]?.["@_val"];
    return v != null ? (parseInt(v, 10) || 0) / 100 : void 0;
  }
  function parseParagraph(p, ctx, chain = []) {
    const pPr = p["a:pPr"] ?? {};
    const alignMap = {
      l: "left",
      ctr: "center",
      r: "right",
      just: "justify"
    };
    const level = pPr["@_lvl"] ? parseInt(pPr["@_lvl"], 10) : void 0;
    const dflt = mergeTextStyleChain(chain, level ?? 0);
    const runsRaw = p["a:r"] ? Array.isArray(p["a:r"]) ? p["a:r"] : [p["a:r"]] : [];
    const runs = runsRaw.map((r) => {
      const run = parseRun(r, ctx, dflt);
      if (r?.["@_type"]) run.field = String(r["@_type"]);
      return run;
    });
    const fldsRaw = p["a:fld"] ? Array.isArray(p["a:fld"]) ? p["a:fld"] : [p["a:fld"]] : [];
    for (const f of fldsRaw) {
      const run = parseRun(f, ctx, dflt);
      if (f?.["@_type"]) run.field = String(f["@_type"]);
      runs.push(run);
    }
    const lnSpcNode = pPr["a:lnSpc"];
    const lineHeight = lnSpcNode ? spcPct(lnSpcNode) : dflt?.lineHeight;
    const lineExact = lnSpcNode ? spcPts(lnSpcNode) : dflt?.lineExact;
    const befNode = pPr["a:spcBef"];
    const spaceBefore = befNode ? spcPts(befNode) : dflt?.spaceBefore;
    const spaceBeforePct = befNode ? spcPct(befNode) : dflt?.spaceBeforePct;
    const aftNode = pPr["a:spcAft"];
    const spaceAfter = aftNode ? spcPts(aftNode) : dflt?.spaceAfter;
    const spaceAfterPct = aftNode ? spcPct(aftNode) : dflt?.spaceAfterPct;
    let bullet;
    if (pPr["a:buNone"] !== void 0) bullet = { type: "none" };
    else if (pPr["a:buChar"]?.["@_char"] != null) {
      bullet = { type: "char", char: decodeCharRefs(String(pPr["a:buChar"]["@_char"])) };
    } else if (pPr["a:buAutoNum"]) {
      bullet = { type: "number" };
      if (pPr["a:buAutoNum"]["@_type"]) bullet.numType = String(pPr["a:buAutoNum"]["@_type"]);
    }
    if (bullet && bullet.type !== "none") {
      if (pPr["a:buClr"]) {
        const c = resolveColorNode2(pPr["a:buClr"], ctx);
        if (c) bullet.color = c;
      }
      if (pPr["a:buFont"]?.["@_typeface"]) bullet.font = String(pPr["a:buFont"]["@_typeface"]);
      if (pPr["a:buSzPct"]?.["@_val"]) {
        const v = parseInt(pPr["a:buSzPct"]["@_val"], 10);
        if (Number.isFinite(v)) bullet.sizePct = v / 1e3;
      }
    }
    const marLRaw = pPr["@_marL"] != null ? parseInt(pPr["@_marL"], 10) : void 0;
    const indentRaw = pPr["@_indent"] != null ? parseInt(pPr["@_indent"], 10) : void 0;
    const effBullet = bullet ?? dflt?.bullet;
    const hasMarL = marLRaw != null && !Number.isNaN(marLRaw);
    const hasIndent = indentRaw != null && !Number.isNaN(indentRaw);
    const marL = hasMarL ? marLRaw : dflt?.marL;
    const indent = hasIndent ? indentRaw : dflt?.indent;
    const pPrExplicit = {
      ...pPr["@_algn"] ? { align: true } : {},
      ...lnSpcNode ? { lnSpc: true } : {},
      ...befNode ? { spcBef: true } : {},
      ...aftNode ? { spcAft: true } : {},
      ...bullet ? { bullet: true } : {},
      ...hasMarL ? { marL: true } : {},
      ...hasIndent ? { indent: true } : {}
    };
    return {
      runs,
      align: pPr["@_algn"] ? alignMap[pPr["@_algn"]] : dflt?.align,
      level,
      pPrExplicit,
      ...lineHeight != null ? { lineHeight } : {},
      ...lineExact != null ? { lineExact } : {},
      ...spaceBefore != null ? { spaceBefore } : {},
      ...spaceAfter != null ? { spaceAfter } : {},
      ...spaceBeforePct != null ? { spaceBeforePct } : {},
      ...spaceAfterPct != null ? { spaceAfterPct } : {},
      ...effBullet ? { bullet: effBullet } : {},
      ...marL != null ? { marL } : {},
      ...indent != null ? { indent } : {}
    };
  }
  function decodeCharRefs(s) {
    return s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
  }
  var CJK_RE = /[\u1100-\u11ff\u2e80-\u303e\u3041-\u33ff\u3400-\u9fff\ua960-\ua97f\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]/;
  var CS_RE = /[\u0590-\u07bf\u08a0-\u08ff\u0900-\u0dff\u0e00-\u0eff\u1000-\u109f\u1780-\u17ff\ufb1d-\ufdff\ufe70-\ufeff]/;
  function parseRun(r, ctx, dflt) {
    const rPr = r["a:rPr"] ?? {};
    const rawT = r["a:t"];
    const text = decodeCharRefs(
      typeof rawT === "string" ? rawT : rawT == null ? "" : typeof rawT === "object" ? String(rawT["#text"] ?? "") : String(rawT)
    );
    const hlink = rPr["a:hlinkClick"];
    const hlinkTarget = hlink?.["@_r:id"] ? ctx.hlinkRels?.get(String(hlink["@_r:id"])) : void 0;
    const fill = rPr["a:solidFill"];
    const color = (fill ? resolveColorNode2(fill, ctx) : void 0) ?? (hlinkTarget ? ctx.theme?.colors?.hlink : void 0) ?? dflt?.color;
    const colorFollowsTheme = color != null && !(fill && fill["a:srgbClr"]);
    const colorInherited = color != null && !fill;
    const latin = resolveFontRef(rPr["a:latin"]?.["@_typeface"], ctx.theme) ?? dflt?.latinFont;
    const ea = resolveFontRef(rPr["a:ea"]?.["@_typeface"], ctx.theme) ?? dflt?.eaFont;
    const cs = resolveFontRef(rPr["a:cs"]?.["@_typeface"], ctx.theme) ?? dflt?.csFont;
    const fontFamily = (CS_RE.test(text) ? cs ?? latin ?? ea : CJK_RE.test(text) ? ea ?? latin : latin ?? ea) ?? ctx.theme?.minorFont;
    const bAttr = rPr["@_b"];
    const iAttr = rPr["@_i"];
    let outline;
    const lnNode = rPr["a:ln"];
    if (lnNode && typeof lnNode === "object" && lnNode["a:solidFill"]) {
      const lnColor = resolveColorNode2(lnNode["a:solidFill"], ctx);
      if (lnColor) {
        const w = lnNode["@_w"] != null ? parseInt(lnNode["@_w"], 10) : 9525;
        outline = { color: lnColor, widthEmu: Number.isFinite(w) ? w : 9525 };
      }
    }
    const uAttr = rPr["@_u"];
    const strikeAttr = rPr["@_strike"];
    const hasStrike = strikeAttr !== void 0 && strikeAttr !== "noStrike";
    const latinRaw = rPr["a:latin"]?.["@_typeface"];
    const eaRaw = rPr["a:ea"]?.["@_typeface"];
    const csRaw = rPr["a:cs"]?.["@_typeface"];
    const linkUnderline = hlinkTarget != null && uAttr === void 0;
    return {
      text,
      bold: bAttr != null ? bAttr === "1" || bAttr === "true" : !!dflt?.bold,
      italic: iAttr != null ? iAttr === "1" || iAttr === "true" : !!dflt?.italic,
      underline: uAttr !== void 0 && uAttr !== "none" || linkUnderline,
      ...uAttr !== void 0 && uAttr !== "none" ? { underlineStyle: String(uAttr) } : {},
      ...linkUnderline ? { underlineImplicit: true } : {},
      ...hasStrike ? { strike: true, strikeStyle: String(strikeAttr) } : {},
      ...latinRaw ? { latinFont: String(latinRaw) } : {},
      ...eaRaw ? { eaFont: String(eaRaw) } : {},
      ...csRaw ? { csFont: String(csRaw) } : {},
      ...!latinRaw && !eaRaw ? { fontImplicit: true } : {},
      fontSize: rPr["@_sz"] ? parseInt(rPr["@_sz"], 10) / 100 : dflt?.fontSize,
      ...rPr["@_sz"] ? {} : { fontSizeImplicit: true },
      ...rPr["@_spc"] ? { letterSpacing: parseInt(rPr["@_spc"], 10) / 100 } : {},
      ...rPr["@_baseline"] ? { baseline: parseInt(rPr["@_baseline"], 10) / 1e3 } : {},
      fontFamily,
      color,
      ...colorFollowsTheme ? { colorFollowsTheme } : {},
      ...colorInherited ? { colorInherited } : {},
      ...outline ? { outline } : {},
      ...hlink?.["@_r:id"] ? {
        hyperlinkRId: String(hlink["@_r:id"]),
        ...hlinkTarget ? { hyperlink: hlinkTarget } : {},
        ...hlink["@_action"] ? { hyperlinkAction: String(hlink["@_action"]) } : {},
        ...hlink["@_tooltip"] ? { hyperlinkTooltip: String(hlink["@_tooltip"]) } : {}
      } : {}
    };
  }
  function parseDecorations(xml, ctx, opts = {}) {
    let scan;
    try {
      scan = scanSlide(xml);
    } catch {
      return [];
    }
    const out = [];
    scan.elements.forEach((sp, idx) => {
      const fragXml = xml.slice(sp.start, sp.end);
      const anchor = { spIndex: -(idx + 1), originalXml: "", range: [0, 0] };
      const el = parseShapeFragment(sp, fragXml, anchor, ctx);
      if (!el || el.type === "passthrough") return;
      const ph = el.placeholder;
      if (ph !== void 0) {
        if (!opts.hfTypes?.has(ph)) return;
      } else if (/<p:ph[\s/>]/.test(fragXml)) {
        return;
      }
      if (opts.slideNum != null) substituteSlideNum(el, opts.slideNum);
      out.push(el);
    });
    return out;
  }
  function substituteSlideNum(el, num) {
    if (el.type === "group") {
      for (const c of el.children) substituteSlideNum(c, num);
      return;
    }
    const text = el.text;
    if (!text) return;
    for (const p of text.paragraphs) {
      for (const r of p.runs) {
        if (r.field === "slidenum") r.text = String(num);
      }
    }
  }
  function intOr(v, dflt) {
    if (v === void 0 || v === null) return dflt;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? dflt : n;
  }

  // ../engine/pptx-engine/generate.ts
  function patchTextElementXml(el, originalXml) {
    if (!el.text || !el.text.paragraphs.length) return originalXml;
    const modelRuns = el.text.paragraphs.flatMap((p) => p.runs);
    const runSpans = findRunSpans(originalXml);
    const aligned = runSpans.length === modelRuns.length && runSpans.length > 0 && runSpans.every((s, i) => s.kind === "br" === isSoftBreakRun(modelRuns[i]));
    if (aligned) {
      let out = "";
      let cursor = 0;
      for (let i = 0; i < runSpans.length; i++) {
        const span = runSpans[i];
        out += originalXml.slice(cursor, span.start);
        const slice = originalXml.slice(span.start, span.end);
        out += span.kind === "br" ? slice : patchRun(slice, modelRuns[i]);
        cursor = span.end;
      }
      out += originalXml.slice(cursor);
      return out;
    }
    return rebuildTxBody(el, originalXml);
  }
  var PPR_CHILD_RE = {
    lnSpc: /<a:lnSpc\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/a:lnSpc>)/g,
    spcBef: /<a:spcBef\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/a:spcBef>)/g,
    spcAft: /<a:spcAft\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/a:spcAft>)/g,
    bullet: /<a:bu(?:ClrTx|Clr|SzTx|SzPct|SzPts|FontTx|Font|None|AutoNum|Char)\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/a:bu(?:ClrTx|Clr|SzTx|SzPct|SzPts|FontTx|Font|None|AutoNum|Char)>)/g
  };
  function buildPPrGroup(p, group) {
    switch (group) {
      case "lnSpc":
        if (p.lineExact != null)
          return `<a:lnSpc><a:spcPts val="${Math.round(p.lineExact * 100)}"/></a:lnSpc>`;
        if (p.lineHeight != null)
          return `<a:lnSpc><a:spcPct val="${Math.round(p.lineHeight * 1e3)}"/></a:lnSpc>`;
        return "";
      case "spcBef":
        if (p.spaceBefore != null)
          return `<a:spcBef><a:spcPts val="${Math.round(p.spaceBefore * 100)}"/></a:spcBef>`;
        if (p.spaceBeforePct != null)
          return `<a:spcBef><a:spcPct val="${Math.round(p.spaceBeforePct * 1e3)}"/></a:spcBef>`;
        return "";
      case "spcAft":
        if (p.spaceAfter != null)
          return `<a:spcAft><a:spcPts val="${Math.round(p.spaceAfter * 100)}"/></a:spcAft>`;
        if (p.spaceAfterPct != null)
          return `<a:spcAft><a:spcPct val="${Math.round(p.spaceAfterPct * 1e3)}"/></a:spcAft>`;
        return "";
      case "bullet": {
        const b = p.bullet;
        if (!b) return "";
        if (b.type === "none") return "<a:buNone/>";
        let s = "";
        if (b.color) s += `<a:buClr><a:srgbClr val="${hex6(b.color)}"/></a:buClr>`;
        if (b.sizePct != null) s += `<a:buSzPct val="${Math.round(b.sizePct * 1e3)}"/>`;
        if (b.font) s += `<a:buFont typeface="${escapeXmlAttr(b.font)}"/>`;
        s += b.type === "number" ? `<a:buAutoNum type="${escapeXmlAttr(b.numType ?? "arabicPeriod")}"/>` : `<a:buChar char="${escapeXmlAttr(b.char ?? "\u2022")}"/>`;
        return s;
      }
    }
  }
  function patchParagraphPPrXml(paraXml, p, which) {
    const ALIGN_MAP2 = {
      left: "l",
      center: "ctr",
      right: "r",
      justify: "just"
    };
    let m = /<a:pPr\b([^>]*?)(\/?)>/.exec(paraXml);
    if (!m) {
      paraXml = paraXml.replace(/^<a:p>/, "<a:p><a:pPr></a:pPr>");
      m = /<a:pPr\b([^>]*?)(\/?)>/.exec(paraXml);
    } else if (m[2] === "/") {
      paraXml = paraXml.slice(0, m.index) + `<a:pPr${m[1]}></a:pPr>` + paraXml.slice(m.index + m[0].length);
      m = /<a:pPr\b([^>]*?)(\/?)>/.exec(paraXml);
    }
    const openEnd = m.index + m[0].length;
    const closeAt = paraXml.indexOf("</a:pPr>", openEnd);
    if (closeAt < 0) return paraXml;
    let openTag = paraXml.slice(m.index, openEnd);
    let inner = paraXml.slice(openEnd, closeAt);
    const setPPrAttr = (name, value) => {
      const re = new RegExp(`\\s${name}="[^"]*"`);
      if (value === void 0) {
        openTag = openTag.replace(re, "");
        return;
      }
      if (re.test(openTag)) openTag = openTag.replace(re, ` ${name}="${escapeXmlAttr(value)}"`);
      else openTag = openTag.replace(/^<a:pPr/, `<a:pPr ${name}="${escapeXmlAttr(value)}"`);
    };
    if (which.align) setPPrAttr("algn", p.align ? ALIGN_MAP2[p.align] : void 0);
    if (which.level) setPPrAttr("lvl", p.level ? String(p.level) : void 0);
    if (which.indents) {
      setPPrAttr("marL", p.marL != null ? String(Math.round(p.marL)) : void 0);
      setPPrAttr("indent", p.indent != null ? String(Math.round(p.indent)) : void 0);
    }
    const groups = [
      "lnSpc",
      "spcBef",
      "spcAft",
      "bullet"
    ];
    const kept = {};
    for (const g of groups) {
      const re = PPR_CHILD_RE[g];
      re.lastIndex = 0;
      kept[g] = (inner.match(re) ?? []).join("");
      inner = inner.replace(re, "");
    }
    const block = groups.map((g) => which[g] ? buildPPrGroup(p, g) : kept[g]).join("");
    return paraXml.slice(0, m.index) + openTag + block + inner + paraXml.slice(closeAt);
  }
  function findParagraphSpans(xml) {
    const spans = [];
    const re = /<a:p>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const close = xml.indexOf("</a:p>", re.lastIndex);
      if (close < 0) break;
      const end = close + "</a:p>".length;
      spans.push({ start: m.index, end });
      re.lastIndex = end;
    }
    return spans;
  }
  function patchElementPPr(el, xml, which) {
    const paras = el.text?.paragraphs ?? [];
    const spans = findParagraphSpans(xml);
    if (spans.length !== paras.length || !spans.length) return null;
    let out = "";
    let cursor = 0;
    for (let i = 0; i < spans.length; i++) {
      const s = spans[i];
      out += xml.slice(cursor, s.start);
      out += which.paraIndices && !which.paraIndices.includes(i) ? xml.slice(s.start, s.end) : patchParagraphPPrXml(xml.slice(s.start, s.end), paras[i], which);
      cursor = s.end;
    }
    out += xml.slice(cursor);
    return out;
  }
  function isSoftBreakRun(r) {
    return r.text === "\n" && !r.field;
  }
  function findRunSpans(xml) {
    const spans = [];
    const re = /<a:r>|<a:r\s[^>]*>|<a:br\b[^>]*\/>|<a:br\b[^>]*>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const start = m.index;
      if (m[0].startsWith("<a:br")) {
        if (m[0].endsWith("/>")) {
          spans.push({ start, end: re.lastIndex, kind: "br" });
        } else {
          const close2 = xml.indexOf("</a:br>", re.lastIndex);
          if (close2 < 0) break;
          const end2 = close2 + "</a:br>".length;
          spans.push({ start, end: end2, kind: "br" });
          re.lastIndex = end2;
        }
        continue;
      }
      const close = xml.indexOf("</a:r>", re.lastIndex);
      if (close < 0) break;
      const end = close + "</a:r>".length;
      spans.push({ start, end, kind: "r" });
      re.lastIndex = end;
    }
    return spans;
  }
  function patchRun(runXml, run) {
    let out = runXml;
    out = out.replace(
      /(<a:t(?:\s[^>]*)?>)([\s\S]*?)(<\/a:t>)/,
      (_all, open2, _text, close) => {
        return `${open2}${escapeXmlText(run.text)}${close}`;
      }
    );
    if (!/<a:t/.test(runXml)) return out;
    out = patchRunProps(out, run);
    return out;
  }
  function patchRunProps(runXml, run) {
    const attrPatch = (rprOpen) => {
      let tag = rprOpen;
      tag = setBoolAttr(tag, "b", run.bold);
      tag = setBoolAttr(tag, "i", run.italic);
      const uVal = run.underline ? run.underlineImplicit ? void 0 : run.underlineStyle ?? "sng" : /\su="[^"]*"/.test(tag) ? "none" : void 0;
      tag = setAttr(tag, "u", uVal, /\su="[^"]*"/);
      const strikeVal = run.strike ? run.strikeStyle ?? "sngStrike" : /\sstrike="[^"]*"/.test(tag) ? "noStrike" : void 0;
      tag = setAttr(tag, "strike", strikeVal, /\sstrike="[^"]*"/);
      const blVal = run.baseline ? String(Math.round(run.baseline * 1e3)) : /\sbaseline="[^"]*"/.test(tag) ? "0" : void 0;
      tag = setAttr(tag, "baseline", blVal, /\sbaseline="[^"]*"/);
      tag = setAttr(
        tag,
        "sz",
        run.fontSize != null && !run.fontSizeImplicit ? String(Math.round(run.fontSize * 100)) : void 0,
        /\ssz="[^"]*"/
      );
      return tag;
    };
    const hasRPr = /<a:rPr\b/.test(runXml);
    if (hasRPr) {
      runXml = runXml.replace(/<a:rPr\b([^>]*?)(\/?)>/, (_all, attrs, selfClose) => {
        const patched = attrPatch(`<a:rPr${attrs}`);
        return `${patched}${selfClose ? "/>" : ">"}`;
      });
      if (run.color && !run.colorFollowsTheme) {
        runXml = patchRunColor(runXml, run.color);
      }
      if (run.fontFamily && !run.latinFont && !run.eaFont && !run.fontImplicit) {
        runXml = patchRunFont(runXml, run.fontFamily);
      }
      runXml = patchRunHlink(runXml, run);
    } else {
      const attrs = buildRPrAttrs(run);
      const color = run.color ? `<a:solidFill><a:srgbClr val="${hex6(run.color)}"/></a:solidFill>` : "";
      const font = run.fontFamily && !run.fontImplicit && !run.latinFont && !run.eaFont ? fontSlotsXml(escapeXmlAttr(run.fontFamily)) : "";
      const inner = color + font + hlinkXml(run);
      const rpr = inner ? `<a:rPr${attrs}>${inner}</a:rPr>` : `<a:rPr${attrs}/>`;
      runXml = runXml.replace(/(<a:r(?:\s[^>]*)?>)/, `$1${rpr}`);
    }
    return runXml;
  }
  function hlinkXml(run) {
    if (!run.hyperlinkRId) return "";
    return `<a:hlinkClick xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${escapeXmlAttr(run.hyperlinkRId)}"` + (run.hyperlinkAction ? ` action="${escapeXmlAttr(run.hyperlinkAction)}"` : "") + (run.hyperlinkTooltip ? ` tooltip="${escapeXmlAttr(run.hyperlinkTooltip)}"` : "") + "/>";
  }
  function patchRunHlink(runXml, run) {
    const existing = /<a:hlinkClick\b[^>]*?\br:id="([^"]*)"/.exec(runXml);
    if ((existing?.[1] ?? void 0) === run.hyperlinkRId) return runXml;
    runXml = runXml.replace(
      /<a:hlinkClick\b[^>]*\/>|<a:hlinkClick\b[^>]*>[\s\S]*?<\/a:hlinkClick>/,
      ""
    );
    const hlink = hlinkXml(run);
    if (!hlink) return runXml;
    if (/<a:rPr\b[^>]*\/>/.test(runXml)) {
      return runXml.replace(/<a:rPr\b([^>]*?)\/>/, `<a:rPr$1>${hlink}</a:rPr>`);
    }
    const m = /<a:(?:rtl|extLst)\b/.exec(runXml);
    if (m) return runXml.slice(0, m.index) + hlink + runXml.slice(m.index);
    return runXml.replace(/<\/a:rPr>/, `${hlink}</a:rPr>`);
  }
  function fontSlotsXml(esc) {
    return `<a:latin typeface="${esc}"/><a:ea typeface="${esc}"/><a:cs typeface="${esc}"/>`;
  }
  var FONT_SLOTS = ["a:latin", "a:ea", "a:cs"];
  var IS_FONT_SLOT = new Set(FONT_SLOTS);
  var AFTER_FONT_SLOTS = /* @__PURE__ */ new Set(["a:sym", "a:hlinkClick", "a:hlinkMouseOver", "a:rtl", "a:extLst"]);
  function setTypeface(el, esc) {
    const tag = /^<[^\s/>]+(?:"[^"]*"|'[^']*'|[^"'>])*>/.exec(el)?.[0];
    if (!tag) return el;
    const name = /^<[^\s/>]+/.exec(tag)[0];
    const close = tag.endsWith("/>") ? "/>" : ">";
    let had = false;
    const attrs = tag.slice(name.length, tag.length - close.length).replace(/\s([^\s=/>]+)\s*=\s*("[^"]*"|'[^']*')/g, (whole, attr) => {
      if (attr !== "typeface") return whole;
      had = true;
      return ` typeface="${esc}"`;
    });
    return name + (had ? attrs : `${attrs} typeface="${esc}"`) + close + el.slice(tag.length);
  }
  var RPR_KNOWN_CHILDREN = /* @__PURE__ */ new Set([
    "a:ln",
    "a:noFill",
    "a:solidFill",
    "a:gradFill",
    "a:blipFill",
    "a:pattFill",
    "a:grpFill",
    "a:effectLst",
    "a:effectDag",
    "a:highlight",
    "a:uLnTx",
    "a:uLn",
    "a:uFillTx",
    "a:uFill",
    "a:latin",
    "a:ea",
    "a:cs",
    "a:sym",
    "a:hlinkClick",
    "a:hlinkMouseOver",
    "a:rtl",
    "a:extLst"
  ]);
  function patchRunFontUnscannable(runXml, esc) {
    if (/<a:latin\b/.test(runXml)) {
      runXml = runXml.replace(/(<a:latin\b[^>]*?\btypeface=")[^"]*(")/, `$1${esc}$2`);
      if (/<a:ea\b/.test(runXml)) {
        runXml = runXml.replace(/(<a:ea\b[^>]*?\btypeface=")[^"]*(")/, `$1${esc}$2`);
      } else {
        runXml = runXml.replace(
          /(<a:latin\b[^>]*\/>|<a:latin\b[^>]*>[\s\S]*?<\/a:latin>)/,
          `$1<a:ea typeface="${esc}"/>`
        );
      }
      return runXml;
    }
    const fonts = `<a:latin typeface="${esc}"/><a:ea typeface="${esc}"/>`;
    if (/<a:rPr\b[^>]*\/>/.test(runXml)) {
      return runXml.replace(/<a:rPr\b([^>]*?)\/>/, `<a:rPr$1>${fonts}</a:rPr>`);
    }
    return runXml.replace(/<\/a:rPr>/, `${fonts}</a:rPr>`);
  }
  function patchRunFont(runXml, family) {
    const esc = escapeXmlAttr(family);
    if (/<!--|<!\[CDATA\[|<\?/.test(runXml)) return patchRunFontUnscannable(runXml, esc);
    for (const [, name] of runXml.matchAll(/<\/?([^\s/>!?][^\s/>]*)/g)) {
      if (!/^[a-zA-Z][\w:]*$/.test(name)) return patchRunFontUnscannable(runXml, esc);
    }
    const runOpen = /^<[^\s/>]+(?:"[^"]*"|'[^']*'|[^"'>])*?>/.exec(runXml)?.[0];
    if (!runOpen) return patchRunFontUnscannable(runXml, esc);
    const rPr = topLevelChildren(runXml, runOpen.length, runXml.length).find(
      (c) => c.name === "a:rPr"
    );
    if (!rPr) return patchRunFontUnscannable(runXml, esc);
    const el = runXml.slice(rPr.start, rPr.end);
    const selfAttrs = /^<a:rPr\b((?:"[^"]*"|'[^']*'|[^"'>])*?)\/>$/.exec(el)?.[1];
    if (selfAttrs !== void 0) {
      return runXml.slice(0, rPr.start) + `<a:rPr${selfAttrs}>${fontSlotsXml(esc)}</a:rPr>` + runXml.slice(rPr.end);
    }
    const rPrOpen = /^<a:rPr\b(?:"[^"]*"|'[^']*'|[^"'>])*?>/.exec(el)?.[0];
    if (!rPrOpen) return patchRunFontUnscannable(runXml, esc);
    const innerStart = rPr.start + rPrOpen.length;
    const innerEnd = rPr.start + el.lastIndexOf("</");
    if (innerEnd <= innerStart) return patchRunFontUnscannable(runXml, esc);
    const children = topLevelChildren(runXml, innerStart, innerEnd);
    if (children.some((c) => !RPR_KNOWN_CHILDREN.has(c.name))) {
      return patchRunFontUnscannable(runXml, esc);
    }
    const slots = children.filter((c) => IS_FONT_SLOT.has(c.name));
    if (new Set(slots.map((c) => c.name)).size !== slots.length) {
      return patchRunFontUnscannable(runXml, esc);
    }
    const block = FONT_SLOTS.map((tag) => {
      const found = slots.find((s) => s.name === tag);
      if (!found) return `<${tag} typeface="${esc}"/>`;
      return setTypeface(runXml.slice(found.start, found.end), esc);
    }).join("");
    const at = slots.length ? slots[0].start : children.find((c) => AFTER_FONT_SLOTS.has(c.name))?.start ?? innerEnd;
    let out = runXml;
    for (const c of [...slots].reverse()) out = out.slice(0, c.start) + out.slice(c.end);
    return out.slice(0, at) + block + out.slice(at);
  }
  function patchRunColor(runXml, color) {
    const hex = hex6(color);
    if (/<a:solidFill>\s*<a:srgbClr\b/.test(runXml)) {
      return runXml.replace(/(<a:solidFill>\s*<a:srgbClr\b[^>]*?\bval=")[^"]*(")/, `$1${hex}$2`);
    }
    if (/<a:solidFill>\s*<a:schemeClr\b/.test(runXml)) {
      return runXml.replace(
        /<a:solidFill>\s*<a:schemeClr\b[^>]*?(?:\/>|>[\s\S]*?<\/a:schemeClr>)\s*<\/a:solidFill>/,
        `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`
      );
    }
    const fill = `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;
    if (/<a:rPr\b[^>]*\/>/.test(runXml)) {
      return runXml.replace(/<a:rPr\b([^>]*?)\/>/, `<a:rPr$1>${fill}</a:rPr>`);
    }
    return runXml.replace(/(<a:rPr\b[^>]*>)/, `$1${fill}`);
  }
  function buildRPrAttrs(run) {
    let s = "";
    if (run.fontSize != null && !run.fontSizeImplicit) s += ` sz="${Math.round(run.fontSize * 100)}"`;
    if (run.bold) s += ' b="1"';
    if (run.italic) s += ' i="1"';
    if (run.underline && !run.underlineImplicit)
      s += ` u="${escapeXmlAttr(run.underlineStyle ?? "sng")}"`;
    if (run.strike) s += ` strike="${escapeXmlAttr(run.strikeStyle ?? "sngStrike")}"`;
    if (run.letterSpacing) s += ` spc="${Math.round(run.letterSpacing * 100)}"`;
    if (run.baseline) s += ` baseline="${Math.round(run.baseline * 1e3)}"`;
    return s;
  }
  function setBoolAttr(tag, name, val) {
    if (val === void 0) return tag;
    return setAttr(tag, name, val ? "1" : "0", new RegExp(`\\s${name}="[^"]*"`));
  }
  function setAttr(tag, name, value, existingRe) {
    if (value === void 0) return tag;
    if (existingRe.test(tag)) {
      return tag.replace(existingRe, ` ${name}="${escapeXmlAttr(value)}"`);
    }
    return tag.replace(/^<a:rPr/, `<a:rPr ${name}="${escapeXmlAttr(value)}"`);
  }
  function rebuildTxBody(el, originalXml) {
    const body = el.text;
    const paras = body.paragraphs.map((p) => generateParagraphXml(p)).join("");
    const txOpen = /<p:txBody\b[^>]*>/.exec(originalXml);
    if (!txOpen) {
      const txBody = `<p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody>`;
      if (/<\/p:spPr>/.test(originalXml)) {
        return originalXml.replace(/(<\/p:spPr>)/, `$1${txBody}`);
      }
      return originalXml;
    }
    const txStart = txOpen.index;
    const txContentStart = txStart + txOpen[0].length;
    const txEnd = originalXml.lastIndexOf("</p:txBody>");
    const inner = originalXml.slice(txContentStart, txEnd);
    const bodyPr = /<a:bodyPr\b(?:[^>]*?)(?:\/>|>[\s\S]*?<\/a:bodyPr>)/.exec(inner)?.[0] ?? "<a:bodyPr/>";
    const lstStyle = /<a:lstStyle\b(?:[^>]*?)(?:\/>|>[\s\S]*?<\/a:lstStyle>)/.exec(inner)?.[0] ?? "";
    return originalXml.slice(0, txContentStart) + bodyPr + lstStyle + paras + originalXml.slice(txEnd);
  }
  function generateParagraphXml(p) {
    const alignMap = { left: "l", center: "ctr", right: "r", justify: "just" };
    const ex = p.pPrExplicit;
    const want = (k) => !ex || !!ex[k];
    const pPrAttrs = [];
    if (p.marL != null && want("marL")) pPrAttrs.push(`marL="${Math.round(p.marL)}"`);
    if (p.indent != null && want("indent")) pPrAttrs.push(`indent="${Math.round(p.indent)}"`);
    if (p.align && want("align")) pPrAttrs.push(`algn="${alignMap[p.align]}"`);
    if (p.level) pPrAttrs.push(`lvl="${p.level}"`);
    let kids = "";
    if (want("lnSpc")) {
      if (p.lineExact != null)
        kids += `<a:lnSpc><a:spcPts val="${Math.round(p.lineExact * 100)}"/></a:lnSpc>`;
      else if (p.lineHeight != null)
        kids += `<a:lnSpc><a:spcPct val="${Math.round(p.lineHeight * 1e3)}"/></a:lnSpc>`;
    }
    if (want("spcBef")) {
      if (p.spaceBefore != null)
        kids += `<a:spcBef><a:spcPts val="${Math.round(p.spaceBefore * 100)}"/></a:spcBef>`;
      else if (p.spaceBeforePct != null)
        kids += `<a:spcBef><a:spcPct val="${Math.round(p.spaceBeforePct * 1e3)}"/></a:spcBef>`;
    }
    if (want("spcAft")) {
      if (p.spaceAfter != null)
        kids += `<a:spcAft><a:spcPts val="${Math.round(p.spaceAfter * 100)}"/></a:spcAft>`;
      else if (p.spaceAfterPct != null)
        kids += `<a:spcAft><a:spcPct val="${Math.round(p.spaceAfterPct * 1e3)}"/></a:spcAft>`;
    }
    if (p.bullet && want("bullet")) {
      const b = p.bullet;
      if (b.type === "none") kids += "<a:buNone/>";
      else {
        if (b.color) kids += `<a:buClr><a:srgbClr val="${hex6(b.color)}"/></a:buClr>`;
        if (b.sizePct != null) kids += `<a:buSzPct val="${Math.round(b.sizePct * 1e3)}"/>`;
        if (b.font) kids += `<a:buFont typeface="${escapeXmlAttr(b.font)}"/>`;
        kids += b.type === "number" ? `<a:buAutoNum type="${escapeXmlAttr(b.numType ?? "arabicPeriod")}"/>` : `<a:buChar char="${escapeXmlAttr(b.char ?? "\u2022")}"/>`;
      }
    }
    const attrStr = pPrAttrs.length ? ` ${pPrAttrs.join(" ")}` : "";
    const pPr = kids ? `<a:pPr${attrStr}>${kids}</a:pPr>` : pPrAttrs.length ? `<a:pPr${attrStr}/>` : "";
    const runs = p.runs.map((r) => generateRunXml(r)).join("");
    return `<a:p>${pPr}${runs}</a:p>`;
  }
  function generateRunXml(r) {
    if (isSoftBreakRun(r)) return "<a:br/>";
    if (r.text.includes("\n") && !r.field) {
      return r.text.split("\n").map((part) => part ? generateRunXml({ ...r, text: part }) : "").join("<a:br/>");
    }
    const attrs = buildRPrAttrs(r);
    const ln = r.outline ? `<a:ln w="${Math.round(r.outline.widthEmu)}"><a:solidFill><a:srgbClr val="${hex6(r.outline.color)}"/></a:solidFill></a:ln>` : "";
    const color = r.color && !r.colorInherited ? `<a:solidFill><a:srgbClr val="${hex6(r.color)}"/></a:solidFill>` : "";
    const font = r.latinFont || r.eaFont || r.csFont ? (r.latinFont ? `<a:latin typeface="${escapeXmlAttr(r.latinFont)}"/>` : "") + (r.eaFont ? `<a:ea typeface="${escapeXmlAttr(r.eaFont)}"/>` : "") + (r.csFont ? `<a:cs typeface="${escapeXmlAttr(r.csFont)}"/>` : "") : r.fontFamily && !r.fontImplicit ? fontSlotsXml(escapeXmlAttr(r.fontFamily)) : "";
    const hlink = hlinkXml(r);
    const rprInner = ln + color + font + hlink;
    const rPr = rprInner ? `<a:rPr${attrs}>${rprInner}</a:rPr>` : attrs ? `<a:rPr${attrs}/>` : "<a:rPr/>";
    if (r.field) {
      return `<a:fld id="{${fieldGuid()}}" type="${escapeXmlAttr(r.field)}">${rPr}<a:t>${escapeXmlText(r.text)}</a:t></a:fld>`;
    }
    return `<a:r>${rPr}<a:t>${escapeXmlText(r.text)}</a:t></a:r>`;
  }
  function fieldGuid() {
    const hex = () => Math.floor(Math.random() * 65536).toString(16).toUpperCase().padStart(4, "0");
    return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
  }
  function hex6(color) {
    let c = color.replace(/^#/, "").toUpperCase();
    if (c.length >= 6) c = c.slice(0, 6);
    return c;
  }
  function alphaXml(color) {
    const c = color.replace(/^#/, "");
    if (c.length < 8) return "";
    const a = parseInt(c.slice(6, 8), 16);
    if (!Number.isFinite(a) || a >= 255) return "";
    return `<a:alpha val="${Math.round(a / 255 * 1e5)}"/>`;
  }
  function srgbClrXml(color) {
    const alpha = alphaXml(color);
    return alpha ? `<a:srgbClr val="${hex6(color)}">${alpha}</a:srgbClr>` : `<a:srgbClr val="${hex6(color)}"/>`;
  }
  var FILL_TAGS = /* @__PURE__ */ new Set([
    "a:noFill",
    "a:solidFill",
    "a:gradFill",
    "a:blipFill",
    "a:pattFill",
    "a:grpFill"
  ]);
  function topLevelChildren(xml, from, to) {
    const out = [];
    const re = /<(\/?)([a-zA-Z][\w:]*)((?:"[^"]*"|'[^']*'|[^"'>])*?)(\/?)>/g;
    re.lastIndex = from;
    let depth = 0;
    let curStart = -1;
    let curName = "";
    let m;
    while ((m = re.exec(xml)) !== null && m.index < to) {
      const closing = m[1] === "/";
      const selfClose = m[4] === "/";
      if (!closing && !selfClose) {
        if (depth === 0) {
          curStart = m.index;
          curName = m[2];
        }
        depth++;
      } else if (closing) {
        depth--;
        if (depth === 0) out.push({ name: curName, start: curStart, end: re.lastIndex });
      } else if (selfClose && depth === 0) {
        out.push({ name: m[2], start: m.index, end: re.lastIndex });
      }
    }
    return out;
  }
  function expandEmptySpPr(xml) {
    return xml.replace(
      /<p:spPr(\s[^>]*?)?\/>/,
      (_all, attrs) => `<p:spPr${attrs ?? ""}></p:spPr>`
    );
  }
  function gsLstXml(stops) {
    return `<a:gsLst>${stops.map(
      (s) => `<a:gs pos="${Math.round(Math.max(0, Math.min(1, s.pos)) * 1e5)}"><a:srgbClr val="${hex6(s.color)}"/></a:gs>`
    ).join("")}</a:gsLst>`;
  }
  var RADIAL_PATH_XML = '<a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path>';
  function buildFillXml(fill) {
    if (typeof fill === "object" && "rawFillXml" in fill) return fill.rawFillXml;
    if (typeof fill === "object")
      return `<a:gradFill rotWithShape="1">${gsLstXml(fill.stops)}${fill.radial ? RADIAL_PATH_XML : `<a:lin ang="${Math.round(fill.angle ?? 0)}" scaled="1"/>`}</a:gradFill>`;
    if (fill === "none") return "<a:noFill/>";
    return `<a:solidFill>${srgbClrXml(fill)}</a:solidFill>`;
  }
  function patchFillNodeXml(existingXml, existingName, fill) {
    if (typeof fill === "string" && fill !== "none" && existingName === "a:solidFill") {
      if (fill.replace(/^#/, "").length >= 8) return `<a:solidFill>${srgbClrXml(fill)}</a:solidFill>`;
      const alpha = /<a:alpha\s[^>]*\/>/.exec(existingXml)?.[0];
      return alpha ? `<a:solidFill><a:srgbClr val="${hex6(fill)}">${alpha}</a:srgbClr></a:solidFill>` : `<a:solidFill><a:srgbClr val="${hex6(fill)}"/></a:solidFill>`;
    }
    if (typeof fill === "object" && !("rawFillXml" in fill) && existingName === "a:gradFill") {
      return patchGradFillXml(existingXml, fill);
    }
    return buildFillXml(fill);
  }
  function patchGradFillXml(gradXml, patch) {
    const open2 = /^<a:gradFill((?:"[^"]*"|'[^']*'|[^"'>])*?)(\/?)>/.exec(gradXml);
    if (!open2 || open2[2] === "/") return buildFillXml(patch);
    const innerStart = open2[0].length;
    const innerEnd = gradXml.lastIndexOf("</a:gradFill>");
    if (innerEnd < 0) return buildFillXml(patch);
    const children = topLevelChildren(gradXml, innerStart, innerEnd);
    const parts = [];
    let gsIdx = -1;
    let hasShade = false;
    for (const c of children) {
      const seg = gradXml.slice(c.start, c.end);
      if (c.name === "a:gsLst") {
        gsIdx = parts.length;
        parts.push(gsLstXml(patch.stops));
      } else if (c.name === "a:lin" || c.name === "a:path") {
        if (patch.radial) {
          if (c.name === "a:path") {
            parts.push(seg);
            hasShade = true;
          }
        } else if (c.name === "a:lin") {
          const scaled = /\sscaled="([^"]*)"/.exec(seg)?.[1] ?? "1";
          parts.push(`<a:lin ang="${Math.round(patch.angle ?? 0)}" scaled="${scaled}"/>`);
          hasShade = true;
        }
      } else {
        parts.push(seg);
      }
    }
    if (gsIdx < 0) return buildFillXml(patch);
    if (!hasShade) {
      const shade2 = patch.radial ? RADIAL_PATH_XML : `<a:lin ang="${Math.round(patch.angle ?? 0)}" scaled="1"/>`;
      parts.splice(gsIdx + 1, 0, shade2);
    }
    return `<a:gradFill${open2[1] ?? ""}>${parts.join("")}</a:gradFill>`;
  }
  function patchElementFill(originalXml, fill) {
    originalXml = expandEmptySpPr(originalXml);
    const spPrOpen = /<p:spPr(\s[^>]*)?>/.exec(originalXml);
    if (!spPrOpen) return originalXml;
    const innerStart = spPrOpen.index + spPrOpen[0].length;
    const spPrClose = originalXml.indexOf("</p:spPr>", innerStart);
    if (spPrClose < 0) return originalXml;
    const children = topLevelChildren(originalXml, innerStart, spPrClose);
    const existing = children.find((c) => FILL_TAGS.has(c.name));
    if (existing) {
      const fillXml2 = patchFillNodeXml(
        originalXml.slice(existing.start, existing.end),
        existing.name,
        fill
      );
      return originalXml.slice(0, existing.start) + fillXml2 + originalXml.slice(existing.end);
    }
    const fillXml = buildFillXml(fill);
    const anchor = children.find((c) => c.name === "a:prstGeom" || c.name === "a:custGeom") ?? children.find((c) => c.name === "a:xfrm");
    const at = anchor ? anchor.end : innerStart;
    return originalXml.slice(0, at) + fillXml + originalXml.slice(at);
  }
  function patchLnXml(lnXml, stroke) {
    const open2 = /^<a:ln((?:"[^"]*"|'[^']*'|[^"'>])*?)(\/?)>/.exec(lnXml);
    if (!open2) return lnXml;
    let attrs = open2[1] ?? "";
    if (stroke) {
      const w = `w="${Math.round(stroke.widthEmu)}"`;
      attrs = /\sw="[^"]*"/.test(attrs) ? attrs.replace(/\sw="[^"]*"/, ` ${w}`) : ` ${w}${attrs}`;
    }
    const fillXml = stroke ? `<a:solidFill>${srgbClrXml(stroke.color)}</a:solidFill>` : "<a:noFill/>";
    const dashXml = stroke?.dash && stroke.dash !== "solid" ? `<a:prstDash val="${escapeXmlAttr(stroke.dash)}"/>` : "";
    if (open2[2] === "/") return `<a:ln${attrs}>${fillXml}${dashXml}</a:ln>`;
    const innerStart = open2[0].length;
    const innerEnd = lnXml.lastIndexOf("</a:ln>");
    if (innerEnd < 0) return lnXml;
    const children = topLevelChildren(lnXml, innerStart, innerEnd);
    const fill = children.find((c) => FILL_TAGS.has(c.name));
    let inner = fill ? lnXml.slice(innerStart, fill.start) + fillXml + lnXml.slice(fill.end, innerEnd) : fillXml + lnXml.slice(innerStart, innerEnd);
    if (stroke && stroke.dash !== void 0) {
      inner = inner.replace(/<a:prstDash\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/a:prstDash>)/, "");
      if (dashXml) {
        const fillEnd = inner.indexOf(fillXml) + fillXml.length;
        inner = inner.slice(0, fillEnd) + dashXml + inner.slice(fillEnd);
      }
    }
    return `<a:ln${attrs}>${inner}</a:ln>`;
  }
  function patchElementStroke(originalXml, stroke) {
    originalXml = expandEmptySpPr(originalXml);
    const spPrOpen = /<p:spPr(\s[^>]*)?>/.exec(originalXml);
    if (!spPrOpen) return originalXml;
    const innerStart = spPrOpen.index + spPrOpen[0].length;
    const spPrClose = originalXml.indexOf("</p:spPr>", innerStart);
    if (spPrClose < 0) return originalXml;
    const children = topLevelChildren(originalXml, innerStart, spPrClose);
    const existing = children.find((c) => c.name === "a:ln");
    if (existing) {
      const patched = patchLnXml(originalXml.slice(existing.start, existing.end), stroke);
      return originalXml.slice(0, existing.start) + patched + originalXml.slice(existing.end);
    }
    const lnXml = stroke ? `<a:ln w="${Math.round(stroke.widthEmu)}"><a:solidFill>${srgbClrXml(stroke.color)}</a:solidFill>${stroke.dash && stroke.dash !== "solid" ? `<a:prstDash val="${escapeXmlAttr(stroke.dash)}"/>` : ""}</a:ln>` : "<a:ln><a:noFill/></a:ln>";
    const anchor = children.find((c) => FILL_TAGS.has(c.name)) ?? children.find((c) => c.name === "a:prstGeom" || c.name === "a:custGeom") ?? children.find((c) => c.name === "a:xfrm");
    const at = anchor ? anchor.end : spPrClose;
    return originalXml.slice(0, at) + lnXml + originalXml.slice(at);
  }
  function patchPictureSrcRect(originalXml, srcRect) {
    const blipFillOpen = /<p:blipFill(\s[^>]*)?>/.exec(originalXml);
    if (!blipFillOpen) return originalXml;
    const innerStart = blipFillOpen.index + blipFillOpen[0].length;
    const blipFillClose = originalXml.indexOf("</p:blipFill>", innerStart);
    if (blipFillClose < 0) return originalXml;
    const existing = /<a:srcRect[^/]*\/>|<a:srcRect[^>]*>[\s\S]*?<\/a:srcRect>/.exec(
      originalXml.slice(blipFillOpen.index, blipFillClose + "</p:blipFill>".length)
    );
    let xmlInner = originalXml;
    if (existing) {
      const absStart = blipFillOpen.index + existing.index;
      xmlInner = originalXml.slice(0, absStart) + originalXml.slice(absStart + existing[0].length);
    }
    if (!srcRect) return xmlInner;
    const to5 = (v) => Math.round(Math.max(0, Math.min(1, v)) * 1e5);
    const l = to5(srcRect.l);
    const t = to5(srcRect.t);
    const r = to5(srcRect.r);
    const b = to5(srcRect.b);
    const attrs = (l ? ` l="${l}"` : "") + (t ? ` t="${t}"` : "") + (r ? ` r="${r}"` : "") + (b ? ` b="${b}"` : "");
    const srcRectXml = `<a:srcRect${attrs}/>`;
    const blipFillOpenNew = /<p:blipFill(\s[^>]*)?>/.exec(xmlInner);
    if (!blipFillOpenNew) return xmlInner;
    const innerStartNew = blipFillOpenNew.index + blipFillOpenNew[0].length;
    const blipFillCloseNew = xmlInner.indexOf("</p:blipFill>", innerStartNew);
    if (blipFillCloseNew < 0) return xmlInner;
    const children = topLevelChildren(xmlInner, innerStartNew, blipFillCloseNew);
    const blipChild = children.find((c) => c.name === "a:blip");
    const insertAt = blipChild ? blipChild.end : innerStartNew;
    return xmlInner.slice(0, insertAt) + srcRectXml + xmlInner.slice(insertAt);
  }
  function patchSlideBackgroundXml(bodyPrefix, color) {
    const bgXml = `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${hex6(color)}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
    const existing = /<p:bg>[\s\S]*?<\/p:bg>|<p:bg\s[^>]*\/>/.exec(bodyPrefix);
    if (existing) {
      return bodyPrefix.slice(0, existing.index) + bgXml + bodyPrefix.slice(existing.index + existing[0].length);
    }
    const cSld = /<p:cSld(\s[^>]*)?>/.exec(bodyPrefix);
    if (!cSld) return bodyPrefix;
    const at = cSld.index + cSld[0].length;
    return bodyPrefix.slice(0, at) + bgXml + bodyPrefix.slice(at);
  }
  var TRANSITION_INNER = {
    fade: "<p:fade/>",
    push: '<p:push dir="u"/>',
    wipe: '<p:wipe dir="l"/>',
    split: '<p:split orient="horz" dir="out"/>',
    circle: "<p:circle/>",
    cover: '<p:cover dir="l"/>',
    pull: '<p:pull dir="l"/>',
    dissolve: "<p:dissolve/>",
    zoom: "<p:zoom/>",
    random: "<p:random/>"
  };
  var MORPH_TRANSITION_XML = '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/main" Requires="p159"><p:transition xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" spd="slow" p14:dur="800"><p159:morph option="byObject"/></p:transition></mc:Choice><mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>';
  var TRANSITION_RE = /<p:transition\b[^>]*\/>|<p:transition\b[^>]*>[\s\S]*?<\/p:transition>/;
  var AC_TRANSITION_RE = /<mc:AlternateContent\b[^>]*>\s*<mc:Choice\b[^>]*>\s*<p:transition\b[\s\S]*?<\/mc:AlternateContent>/;
  function transitionInsertPos(body) {
    const clrMap = /<p:clrMapOvr\b[^>]*\/>|<p:clrMapOvr\b[^>]*>[\s\S]*?<\/p:clrMapOvr>/.exec(body);
    if (clrMap) return clrMap.index + clrMap[0].length;
    const cSldEnd = body.indexOf("</p:cSld>");
    return cSldEnd >= 0 ? cSldEnd + "</p:cSld>".length : -1;
  }
  function patchSlideTransitionXml(bodySuffix, kind) {
    const advTm = readSlideAdvanceTimeXml(bodySuffix);
    const stripped = bodySuffix.replace(AC_TRANSITION_RE, "").replace(TRANSITION_RE, "");
    if (kind === "none") return advTm == null ? stripped : patchSlideAdvanceTimeXml(stripped, advTm);
    const xml = kind === "morph" ? MORPH_TRANSITION_XML : `<p:transition>${TRANSITION_INNER[kind]}</p:transition>`;
    const at = transitionInsertPos(stripped);
    if (at < 0) return stripped;
    const out = stripped.slice(0, at) + xml + stripped.slice(at);
    return advTm == null ? out : patchSlideAdvanceTimeXml(out, advTm);
  }
  function readSlideTransitionXml(bodySuffix) {
    const m = AC_TRANSITION_RE.exec(bodySuffix) ?? TRANSITION_RE.exec(bodySuffix);
    if (!m) return "none";
    if (/<[\w.]+:morph[\s/>]/.test(m[0])) return "morph";
    const kind = /<p:(fade|push|wipe|split|circle|cover|pull|dissolve|zoom|random)\b/.exec(m[0])?.[1];
    return kind ?? "none";
  }
  function patchAdvTmAttr(block, ms) {
    return block.replace(/<p:transition\b[^>]*>/g, (tag) => {
      const cleaned = tag.replace(/\s+advTm="[^"]*"/, "");
      if (ms == null) return cleaned;
      return cleaned.replace(
        /(\s*\/)?>$/,
        (_m, close) => ` advTm="${ms}"${close ?? ""}>`
      );
    });
  }
  function patchSlideAdvanceTimeXml(bodySuffix, ms) {
    const m = AC_TRANSITION_RE.exec(bodySuffix) ?? TRANSITION_RE.exec(bodySuffix);
    if (m)
      return bodySuffix.slice(0, m.index) + patchAdvTmAttr(m[0], ms) + bodySuffix.slice(m.index + m[0].length);
    if (ms == null) return bodySuffix;
    const at = transitionInsertPos(bodySuffix);
    if (at < 0) return bodySuffix;
    return bodySuffix.slice(0, at) + `<p:transition advTm="${ms}"/>` + bodySuffix.slice(at);
  }
  function readSlideAdvanceTimeXml(bodySuffix) {
    const m = AC_TRANSITION_RE.exec(bodySuffix) ?? TRANSITION_RE.exec(bodySuffix);
    const adv = m && /\badvTm="(\d+)"/.exec(m[0]);
    return adv ? Number(adv[1]) : null;
  }
  var SLD_OPEN_RE = /<p:sld\b[^>]*>/;
  function patchSlideHiddenXml(bodyPrefix, hidden) {
    const m = SLD_OPEN_RE.exec(bodyPrefix);
    if (!m) return bodyPrefix;
    let tag = m[0].replace(/\s+show="[^"]*"/, "");
    if (hidden) tag = `${tag.slice(0, -1)} show="0">`;
    return bodyPrefix.slice(0, m.index) + tag + bodyPrefix.slice(m.index + m[0].length);
  }
  function generateXfrmXml(t, tag = "a:xfrm") {
    const attrs = (t.rot ? ` rot="${t.rot}"` : "") + (t.flipH ? ' flipH="1"' : "") + (t.flipV ? ' flipV="1"' : "");
    const o = t.offset;
    return `<${tag}${attrs}><a:off x="${o.x}" y="${o.y}"/><a:ext cx="${o.cx}" cy="${o.cy}"/></${tag}>`;
  }
  function patchElementXfrm(el, originalXml) {
    const t = el.transform;
    const isFrame = el.type === "table" || el.type === "chart" || el.type === "passthrough";
    const xfrmTag = isFrame ? "p:xfrm" : "a:xfrm";
    const open2 = new RegExp(`<${xfrmTag}(\\s[^>]*)?>`).exec(originalXml);
    if (open2) {
      const start = open2.index;
      const close = originalXml.indexOf(`</${xfrmTag}>`, start);
      if (close < 0) return originalXml;
      const end = close + `</${xfrmTag}>`.length;
      const inner = originalXml.slice(start + open2[0].length, close);
      const rest = inner.replace(/<a:off\s[^>]*\/>|<a:ext\s[^>]*\/>/g, "");
      const attrs = (t.rot ? ` rot="${t.rot}"` : "") + (t.flipH ? ' flipH="1"' : "") + (t.flipV ? ' flipV="1"' : "");
      const o = t.offset;
      const replaced = `<${xfrmTag}${attrs}><a:off x="${o.x}" y="${o.y}"/><a:ext cx="${o.cx}" cy="${o.cy}"/>` + rest + `</${xfrmTag}>`;
      return originalXml.slice(0, start) + replaced + originalXml.slice(end);
    }
    if (isFrame) return originalXml;
    const spPr = /<(p:spPr|p:grpSpPr|pic:spPr)(\s[^>]*?)?(\/?)>/.exec(originalXml);
    if (!spPr) return originalXml;
    const tag = spPr[1];
    if (spPr[3] === "/") {
      const openTag = `<${tag}${spPr[2] ?? ""}>`;
      return originalXml.slice(0, spPr.index) + openTag + generateXfrmXml(t) + `</${tag}>` + originalXml.slice(spPr.index + spPr[0].length);
    }
    const insertAt = spPr.index + spPr[0].length;
    return originalXml.slice(0, insertAt) + generateXfrmXml(t) + originalXml.slice(insertAt);
  }
  function patchBodyPrAutofit(xml, fontScale, lnSpcReduction) {
    const attrs = (fontScale < 0.999 ? ` fontScale="${Math.round(fontScale * 1e5)}"` : "") + (lnSpcReduction ? ` lnSpcReduction="${Math.round(lnSpcReduction * 1e5)}"` : "");
    return xml.replace(
      /<a:normAutofit\b[^>]*?(?:\/>|>\s*<\/a:normAutofit>)/,
      `<a:normAutofit${attrs}/>`
    );
  }

  // ../engine/pptx-engine/insert.ts
  var insertCounter = 1;
  var LINE_KINDS = {
    line: { prst: "line" },
    lineArrow: { prst: "straightConnector1", tail: true },
    lineArrowDouble: { prst: "straightConnector1", head: true, tail: true },
    lineBent: { prst: "bentConnector3" },
    lineCurved: { prst: "curvedConnector3" }
  };
  var DEFAULT_LINE_STROKE = { color: "#000000", widthEmu: 12700 };
  function buildCxnSpXml(slide, opts, def) {
    const id = nextCNvPrId(slide);
    const name = `${def.prst.startsWith("bentConnector") ? "Elbow Connector" : def.prst.startsWith("curvedConnector") ? "Curved Connector" : "Straight Connector"} ${id}`;
    const o = opts.offset;
    const stroke = opts.stroke ?? DEFAULT_LINE_STROKE;
    const color = stroke.color.replace(/^#/, "").slice(0, 6).toUpperCase();
    const head = def.head ? '<a:headEnd type="triangle" w="med" len="med"/>' : "";
    const tail = def.tail ? '<a:tailEnd type="triangle" w="med" len="med"/>' : "";
    return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="${escapeXmlAttr(name)}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="${o.x}" y="${o.y}"/><a:ext cx="${o.cx}" cy="${o.cy}"/></a:xfrm><a:prstGeom prst="${def.prst}"><a:avLst/></a:prstGeom><a:ln w="${Math.round(stroke.widthEmu)}" cap="flat"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill>${head}${tail}</a:ln></p:spPr></p:cxnSp>`;
  }
  function nextCNvPrId(slide) {
    let max = 1;
    const scan = (xml) => {
      for (const m of xml.matchAll(/<p:cNvPr\s[^>]*\bid="(\d+)"/g)) {
        max = Math.max(max, Number(m[1]));
      }
    };
    scan(slide.originalXml);
    for (const el of slide.elements) scan(el.anchor.originalXml);
    return max + 1;
  }
  function buildSpXml(slide, opts) {
    const id = nextCNvPrId(slide);
    const isTextbox = opts.kind === "textbox";
    const name = isTextbox ? `TextBox ${id}` : `Shape ${id}`;
    const o = opts.offset;
    const xfrm = `<a:xfrm><a:off x="${o.x}" y="${o.y}"/><a:ext cx="${o.cx}" cy="${o.cy}"/></a:xfrm>`;
    const geom = isTextbox ? "" : `<a:prstGeom prst="${escapeXmlAttr(opts.kind)}"><a:avLst/></a:prstGeom>`;
    const fill = opts.fillColor ? `<a:solidFill><a:srgbClr val="${opts.fillColor.replace(/^#/, "").slice(0, 6).toUpperCase()}"/></a:solidFill>` : "";
    const ln = opts.stroke ? `<a:ln w="${Math.round(opts.stroke.widthEmu)}"><a:solidFill><a:srgbClr val="${opts.stroke.color.replace(/^#/, "").slice(0, 6).toUpperCase()}"/></a:solidFill></a:ln>` : "";
    const paras = (opts.paragraphs?.length ? opts.paragraphs : [{ runs: [{ text: "" }] }]).map((p) => generateParagraphXml(p)).join("");
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXmlAttr(name)}"/><p:cNvSpPr${isTextbox ? ' txBox="1"' : ""}/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm}${geom}${fill}${ln}</p:spPr><p:txBody><a:bodyPr wrap="square" rtlCol="0"/><a:lstStyle/>${paras}</p:txBody></p:sp>`;
  }
  function addElement(slide, opts) {
    const lineDef = LINE_KINDS[opts.kind];
    if (lineDef) {
      const stroke = opts.stroke ?? DEFAULT_LINE_STROKE;
      const el2 = {
        id: `spnew_${(insertCounter++).toString(36)}_${Date.now().toString(36)}`,
        type: "shape",
        anchor: {
          spIndex: slide.elements.length,
          originalXml: buildCxnSpXml(slide, opts, lineDef),
          range: [0, 0]
        },
        transform: { offset: { ...opts.offset }, rot: 0, flipH: false, flipV: false },
        presetGeometry: lineDef.prst,
        fill: { type: "none" },
        stroke: {
          fill: { type: "solid", color: stroke.color },
          width: Math.round(stroke.widthEmu),
          ...lineDef.head ? { headEnd: { type: "triangle" } } : {},
          ...lineDef.tail ? { tailEnd: { type: "triangle" } } : {}
        }
      };
      slide.elements.push(el2);
      slide.structureDirty = true;
      return el2;
    }
    const xml = buildSpXml(slide, opts);
    const el = {
      id: `spnew_${(insertCounter++).toString(36)}_${Date.now().toString(36)}`,
      type: opts.kind === "textbox" ? "text" : "shape",
      anchor: { spIndex: slide.elements.length, originalXml: xml, range: [0, 0] },
      transform: { offset: { ...opts.offset }, rot: 0, flipH: false, flipV: false },
      ...opts.kind !== "textbox" ? { presetGeometry: opts.kind } : {},
      ...opts.fillColor ? { fill: { type: "solid", color: opts.fillColor } } : {},
      ...opts.stroke ? {
        stroke: {
          fill: { type: "solid", color: opts.stroke.color },
          width: Math.round(opts.stroke.widthEmu)
        }
      } : {},
      text: { paragraphs: opts.paragraphs?.length ? opts.paragraphs : [{ runs: [{ text: "" }] }] }
    };
    slide.elements.push(el);
    slide.structureDirty = true;
    return el;
  }
  var DEFAULT_TABLE_STYLE_ID = "{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}";
  function buildTableXml(slide, opts) {
    const id = nextCNvPrId(slide);
    const rows = Math.max(1, Math.floor(opts.rows));
    const cols = Math.max(1, Math.floor(opts.cols));
    const colW = Math.max(1, Math.floor(opts.offset.cx / cols));
    const rowH = Math.max(1, Math.floor(opts.offset.cy / rows));
    const grid = Array.from({ length: cols }, () => `<a:gridCol w="${colW}"/>`).join("");
    const cell = "<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p/></a:txBody><a:tcPr/></a:tc>";
    const trs = Array.from(
      { length: rows },
      () => `<a:tr h="${rowH}">${cell.repeat(cols)}</a:tr>`
    ).join("");
    return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${opts.offset.x}" y="${opts.offset.y}"/><a:ext cx="${opts.offset.cx}" cy="${opts.offset.cy}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"><a:tableStyleId>${DEFAULT_TABLE_STYLE_ID}</a:tableStyleId></a:tblPr><a:tblGrid>${grid}</a:tblGrid>${trs}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
  }
  var IMAGE_MIME = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    bmp: "image/bmp",
    webp: "image/webp",
    tif: "image/tiff",
    tiff: "image/tiff"
  };
  var IMAGE_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
  function addImageMediaAndRel(opened, slide, bytes, extRaw) {
    const { archive } = opened;
    const ext = extRaw.toLowerCase();
    const mime = IMAGE_MIME[ext];
    if (!mime) return null;
    let maxNum = 0;
    for (const path of archive.entries.keys()) {
      const m = /^ppt\/media\/image(\d+)\./.exec(path);
      if (m) maxNum = Math.max(maxNum, Number(m[1]));
    }
    const mediaPath = `ppt/media/image${maxNum + 1}.${ext}`;
    archive.entries.set(mediaPath, bytes);
    const ctPath = "[Content_Types].xml";
    const ct = archive.readText(ctPath);
    if (ct && !new RegExp(`<Default Extension="${ext}"`).test(ct)) {
      const dflt = `<Default Extension="${ext}" ContentType="${mime}"/>`;
      archive.entries.set(ctPath, Buffer.from(ct.replace("</Types>", `${dflt}</Types>`), "utf8"));
    }
    const relsPath = relsPathFor(slide.path);
    const rels = archive.readText(relsPath) ?? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    let maxRid = 0;
    for (const m of rels.matchAll(/Id="rId(\d+)"/g)) maxRid = Math.max(maxRid, Number(m[1]));
    const rid = `rId${maxRid + 1}`;
    const relXml = `<Relationship Id="${rid}" Type="${IMAGE_REL_TYPE}" Target="../media/image${maxNum + 1}.${ext}"/>`;
    archive.entries.set(
      relsPath,
      Buffer.from(rels.replace("</Relationships>", `${relXml}</Relationships>`), "utf8")
    );
    return { rid, mediaPath };
  }
  function addPicture(opened, slide, opts) {
    const added = addImageMediaAndRel(opened, slide, opts.bytes, opts.ext);
    if (!added) return null;
    const { rid, mediaPath } = added;
    const id = nextCNvPrId(slide);
    const name = opts.name ?? `Picture ${id}`;
    const descrAttr = opts.descr ? ` descr="${escapeXmlAttr(opts.descr)}"` : "";
    const xml = `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${escapeXmlAttr(name)}"${descrAttr}/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${generateXfrmXml({ offset: opts.offset, rot: 0, flipH: false, flipV: false })}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
    const el = {
      id: `picnew_${(insertCounter++).toString(36)}_${Date.now().toString(36)}`,
      type: "picture",
      anchor: { spIndex: slide.elements.length, originalXml: xml, range: [0, 0] },
      transform: { offset: { ...opts.offset }, rot: 0, flipH: false, flipV: false },
      name,
      ...opts.descr ? { descr: opts.descr } : {},
      mediaRef: mediaPath
    };
    slide.elements.push(el);
    slide.structureDirty = true;
    return el;
  }
  function deleteElement(slide, elementId) {
    const idx = slide.elements.findIndex((e) => e.id === elementId);
    if (idx < 0) return false;
    slide.elements.splice(idx, 1);
    slide.structureDirty = true;
    return true;
  }
  function calcBoundingBox(elements) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of elements) {
      const o = el.transform.offset;
      minX = Math.min(minX, o.x);
      minY = Math.min(minY, o.y);
      maxX = Math.max(maxX, o.x + o.cx);
      maxY = Math.max(maxY, o.y + o.cy);
    }
    return { x: minX, y: minY, cx: maxX - minX, cy: maxY - minY };
  }
  function buildGrpSpXml(slide, bbox, childrenXml) {
    const id = nextCNvPrId(slide);
    const name = `Group ${id}`;
    const { x, y, cx, cy } = bbox;
    const grpXfrm = `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/><a:chOff x="${x}" y="${y}"/><a:chExt cx="${cx}" cy="${cy}"/></a:xfrm>`;
    return `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="${escapeXmlAttr(name)}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr>${grpXfrm}</p:grpSpPr>` + childrenXml + `</p:grpSp>`;
  }

  // ../engine/pptx-engine/blank.ts
  var import_jszip2 = __toESM(require_jszip_min());
  var XMLDECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
  var NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
  var NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  var NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main";
  var CONTENT_TYPES = XMLDECL + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>';
  var ROOT_RELS = XMLDECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>';
  var PRESENTATION = XMLDECL + `<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
  var PRESENTATION_RELS = XMLDECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>';
  var EMPTY_SPTREE = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>';
  var BLANK_SLIDE_XML = XMLDECL + `<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld>${EMPTY_SPTREE}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  var SLIDE1_RELS = XMLDECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>';
  var LAYOUT1 = XMLDECL + `<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="blank"><p:cSld name="Blank">${EMPTY_SPTREE}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
  var LAYOUT1_RELS = XMLDECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>';
  var MASTER1 = XMLDECL + `<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld>${EMPTY_SPTREE}</p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`;
  var MASTER1_RELS = XMLDECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>';
  var fillStyles = '<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>';
  var lnStyles = "<a:lnStyleLst>" + ["6350", "12700", "19050"].map((w) => `<a:ln w="${w}"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>`).join("") + "</a:lnStyleLst>";
  var effectStyles = "<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>";
  var bgFillStyles = '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>';
  var THEME1 = XMLDECL + `<a:theme xmlns:a="${NS_A}" name="Office"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="C43E1C"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="4472C4"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office">${fillStyles}${lnStyles}${effectStyles}${bgFillStyles}</a:fmtScheme></a:themeElements></a:theme>`;
  async function createBlankPptx() {
    const zip = new import_jszip2.default();
    zip.file("[Content_Types].xml", CONTENT_TYPES);
    zip.file("_rels/.rels", ROOT_RELS);
    zip.file("ppt/presentation.xml", PRESENTATION);
    zip.file("ppt/_rels/presentation.xml.rels", PRESENTATION_RELS);
    zip.file("ppt/slides/slide1.xml", BLANK_SLIDE_XML);
    zip.file("ppt/slides/_rels/slide1.xml.rels", SLIDE1_RELS);
    zip.file("ppt/slideLayouts/slideLayout1.xml", LAYOUT1);
    zip.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels", LAYOUT1_RELS);
    zip.file("ppt/slideMasters/slideMaster1.xml", MASTER1);
    zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels", MASTER1_RELS);
    zip.file("ppt/theme/theme1.xml", THEME1);
    return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  }

  // ../engine/pptx-engine/animation.ts
  function elementSpid(el) {
    const m = /<p:cNvPr\s[^>]*\bid="(\d+)"/.exec(el.anchor.originalXml);
    return m ? Number(m[1]) : null;
  }
  var PRESET = {
    appear: { id: 1, cls: "entr", sub: 0 },
    fade: { id: 10, cls: "entr", sub: 0 },
    flyIn: { id: 2, cls: "entr", sub: 4 },
    // from bottom
    wipe: { id: 22, cls: "entr", sub: 1 },
    // from bottom
    wipeDown: { id: 22, cls: "entr", sub: 4 },
    // from top
    splitIn: { id: 16, cls: "entr", sub: 21 },
    // expand left/right from center
    bounce: { id: 26, cls: "entr", sub: 0 },
    flipIn: { id: 30, cls: "entr", sub: 0 },
    // flip in from far to near (Grow & Turn)
    zoom: { id: 23, cls: "entr", sub: 16 },
    pulse: { id: 26, cls: "emph", sub: 0 },
    spin: { id: 8, cls: "emph", sub: 0 },
    grow: { id: 6, cls: "emph", sub: 0 },
    teeter: { id: 32, cls: "emph", sub: 0 },
    disappear: { id: 1, cls: "exit", sub: 0 },
    fadeOut: { id: 10, cls: "exit", sub: 0 },
    flyOut: { id: 2, cls: "exit", sub: 4 },
    // to bottom
    wipeOut: { id: 22, cls: "exit", sub: 1 },
    shrink: { id: 30, cls: "exit", sub: 0 },
    // shrink and rotate (Shrink & Turn)
    zoomOut: { id: 23, cls: "exit", sub: 16 },
    motionPath: { id: 0, cls: "path", sub: 0 }
    // custom path
  };
  function effectFromPreset(cls, id, sub) {
    if (cls === "path") return "motionPath";
    const bySub = {
      "entr:22:1": "wipe",
      "entr:22:4": "wipeDown"
    };
    const exact = {
      "entr:1": "appear",
      "entr:10": "fade",
      "entr:2": "flyIn",
      "entr:22": "wipe",
      "entr:16": "splitIn",
      "entr:26": "bounce",
      "entr:30": "flipIn",
      "entr:23": "zoom",
      "emph:26": "pulse",
      "emph:8": "spin",
      "emph:6": "grow",
      "emph:32": "teeter",
      "exit:1": "disappear",
      "exit:10": "fadeOut",
      "exit:2": "flyOut",
      "exit:22": "wipeOut",
      "exit:30": "shrink",
      "exit:23": "zoomOut"
    };
    const hit = bySub[`${cls}:${id}:${sub}`] ?? exact[`${cls}:${id}`];
    if (hit) return hit;
    if (cls === "exit") return "fadeOut";
    if (cls === "emph") return "pulse";
    return "fade";
  }
  var NODE_TYPE = {
    onClick: "clickEffect",
    withPrev: "withEffect",
    afterPrev: "afterEffect"
  };
  function tgtElXml(a) {
    const inner = a.paragraph == null ? `<p:spTgt spid="${a.spid}"/>` : `<p:spTgt spid="${a.spid}"><p:txEl><p:pgRg st="${a.paragraph}" end="${a.paragraph}"/></p:txEl></p:spTgt>`;
    return `<p:tgtEl>${inner}</p:tgtEl>`;
  }
  function setVisibilityXml(gen, tgt, visible, delayMs) {
    return `<p:set><p:cBhvr><p:cTn id="${gen.next()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="${delayMs}"/></p:stCondLst></p:cTn>` + tgt + `<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="${visible ? "visible" : "hidden"}"/></p:to></p:set>`;
  }
  function keyframeAnimXml(gen, tgt, dur, attr, frames) {
    const tavs = frames.map(([tm2, val]) => `<p:tav tm="${tm2}"><p:val><p:strVal val="${val}"/></p:val></p:tav>`).join("");
    return `<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="${gen.next()}" dur="${dur}" fill="hold"/>` + tgt + `<p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst>${tavs}</p:tavLst></p:anim>`;
  }
  function moveAnimXml(gen, tgt, dur, attr, from, to) {
    return keyframeAnimXml(gen, tgt, dur, attr, [
      [0, from],
      [1e5, to]
    ]);
  }
  var DEFAULT_MOTION_PATH = "M 0 0 L 0.25 0";
  function motionAnimXml(gen, tgt, dur, path) {
    const p = path.trim() || DEFAULT_MOTION_PATH;
    const pathAttr = /\bE$/.test(p) ? p : `${p} E`;
    return `<p:animMotion origin="layout" path="${pathAttr}" pathEditMode="relative"><p:cBhvr><p:cTn id="${gen.next()}" dur="${dur}" fill="hold"/>` + tgt + "<p:attrNameLst><p:attrName>ppt_x</p:attrName><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr></p:animMotion>";
  }
  function effectBehaviorsXml(gen, a) {
    const dur = Math.max(1, Math.round(a.durationMs));
    const target = tgtElXml(a);
    const show = setVisibilityXml(gen, target, true, 0);
    const hideAtEnd = setVisibilityXml(gen, target, false, Math.max(0, dur - 1));
    switch (a.effect) {
      case "appear":
        return show;
      case "fade":
        return show + `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${gen.next()}" dur="${dur}"/>${target}</p:cBhvr></p:animEffect>`;
      case "flyIn":
        return show + moveAnimXml(gen, target, dur, "ppt_x", "#ppt_x", "#ppt_x") + moveAnimXml(gen, target, dur, "ppt_y", "1+#ppt_h/2", "#ppt_y");
      case "wipe":
        return show + `<p:animEffect transition="in" filter="wipe(up)"><p:cBhvr><p:cTn id="${gen.next()}" dur="${dur}"/>${target}</p:cBhvr></p:animEffect>`;
      case "wipeDown":
        return show + `<p:animEffect transition="in" filter="wipe(down)"><p:cBhvr><p:cTn id="${gen.next()}" dur="${dur}"/>${target}</p:cBhvr></p:animEffect>`;
      case "splitIn":
        return show + `<p:animEffect transition="in" filter="split(inHorizontal)"><p:cBhvr><p:cTn id="${gen.next()}" dur="${dur}"/>${target}</p:cBhvr></p:animEffect>`;
      case "bounce":
        return show + keyframeAnimXml(gen, target, dur, "ppt_y", [
          [0, "#ppt_y-0.25"],
          [55e3, "#ppt_y"],
          [7e4, "#ppt_y-0.08"],
          [85e3, "#ppt_y"],
          [92e3, "#ppt_y-0.03"],
          [1e5, "#ppt_y"]
        ]);
      case "flipIn":
        return show + `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${gen.next()}" dur="${dur}"/>${target}</p:cBhvr></p:animEffect><p:animScale><p:cBhvr><p:cTn id="${gen.next()}" dur="${dur}" fill="hold"/>${target}</p:cBhvr><p:from x="0" y="100000"/><p:to x="100000" y="100000"/></p:animScale>`;
      case "zoom":
        return show + `<p:animScale><p:cBhvr><p:cTn id="${gen.next()}" dur="${dur}" fill="hold"/>${target}</p:cBhvr><p:from x="0" y="0"/><p:to x="100000" y="100000"/></p:animScale>`;
      case "pulse":
        return `<p:animScale><p:cBhvr><p:cTn id="${gen.next()}" dur="${Math.max(1, Math.round(dur / 2))}" autoRev="1" fill="hold"/>${target}</p:cBhvr><p:by x="106000" y="106000"/></p:animScale>`;
      case "spin":
        return `<p:animRot by="21600000"><p:cBhvr><p:cTn id="${gen.next()}" dur="${dur}" fill="hold"/>${target}<p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst></p:cBhvr></p:animRot>`;
      case "grow":
        return `<p:animScale><p:cBhvr><p:cTn id="${gen.next()}" dur="${dur}" fill="hold"/>${target}</p:cBhvr><p:by x="150000" y="150000"/></p:animScale>`;
      case "teeter":
        return keyframeAnimXml(gen, target, dur, "ppt_r", [
          [0, "#ppt_r"],
          [12500, "#ppt_r-9"],
          [37500, "#ppt_r+9"],
          [62500, "#ppt_r-6"],
          [87500, "#ppt_r+3"],
          [1e5, "#ppt_r"]
        ]);
      case "disappear":
        return setVisibilityXml(gen, target, false, 0);
      case "fadeOut":
        return `<p:animEffect transition="out" filter="fade"><p:cBhvr><p:cTn id="${gen.next()}" dur="${dur}"/>${target}</p:cBhvr></p:animEffect>` + hideAtEnd;
      case "flyOut":
        return moveAnimXml(gen, target, dur, "ppt_x", "#ppt_x", "#ppt_x") + moveAnimXml(gen, target, dur, "ppt_y", "#ppt_y", "1+#ppt_h/2") + hideAtEnd;
      case "wipeOut":
        return `<p:animEffect transition="out" filter="wipe(down)"><p:cBhvr><p:cTn id="${gen.next()}" dur="${dur}"/>${target}</p:cBhvr></p:animEffect>` + hideAtEnd;
      case "shrink":
        return `<p:animScale><p:cBhvr><p:cTn id="${gen.next()}" dur="${dur}" fill="hold"/>${target}</p:cBhvr><p:from x="100000" y="100000"/><p:to x="1000" y="1000"/></p:animScale><p:animRot by="-5400000"><p:cBhvr><p:cTn id="${gen.next()}" dur="${dur}" fill="hold"/>${target}<p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst></p:cBhvr></p:animRot>` + hideAtEnd;
      case "zoomOut":
        return `<p:animScale><p:cBhvr><p:cTn id="${gen.next()}" dur="${dur}" fill="hold"/>${target}</p:cBhvr><p:from x="100000" y="100000"/><p:to x="1000" y="1000"/></p:animScale>` + hideAtEnd;
      case "motionPath":
        return motionAnimXml(gen, target, dur, a.motionPath ?? DEFAULT_MOTION_PATH);
    }
  }
  function placeAnims(anims, grpBase) {
    const groups = [];
    const grpCount = new Map(grpBase ?? []);
    let prevStart = 0;
    let prevEnd = 0;
    for (const a of anims) {
      if (a.trigger === "onClick" || groups.length === 0) {
        groups.push({ auto: a.trigger !== "onClick", items: [] });
        prevStart = 0;
        prevEnd = 0;
      }
      const base = a.trigger === "afterPrev" ? prevEnd : a.trigger === "withPrev" ? prevStart : 0;
      const start = base + Math.max(0, Math.round(a.delayMs));
      const grpId = grpCount.get(a.spid) ?? 0;
      grpCount.set(a.spid, grpId + 1);
      groups[groups.length - 1].items.push({ a, startMs: start, grpId });
      prevStart = start;
      prevEnd = start + Math.max(1, Math.round(a.durationMs));
    }
    return groups;
  }
  function effectParXml(gen, p) {
    const preset = PRESET[p.a.effect];
    return `<p:par><p:cTn id="${gen.next()}" presetID="${preset.id}" presetClass="${preset.cls}" presetSubtype="${preset.sub}" fill="hold" grpId="${p.grpId}" nodeType="${NODE_TYPE[p.a.trigger]}"><p:stCondLst><p:cond delay="${p.startMs}"/></p:stCondLst><p:childTnLst>${effectBehaviorsXml(gen, p.a)}</p:childTnLst></p:cTn></p:par>`;
  }
  function groupParXml(gen, g) {
    const effects = g.items.map((p) => effectParXml(gen, p)).join("");
    return `<p:par><p:cTn id="${gen.next()}" fill="hold"><p:stCondLst><p:cond delay="${g.auto ? "0" : "indefinite"}"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="${gen.next()}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${effects}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`;
  }
  function bldPsXml(anims) {
    const paraSpids = new Set(anims.filter((a) => a.paragraph != null).map((a) => a.spid));
    const bldSeen = /* @__PURE__ */ new Set();
    return anims.map((a, i) => {
      if (paraSpids.has(a.spid)) {
        const key2 = `p:${a.spid}`;
        if (bldSeen.has(key2)) return "";
        bldSeen.add(key2);
        return `<p:bldP spid="${a.spid}" grpId="0" uiExpand="1" build="p"/>`;
      }
      const before = anims.slice(0, i).filter((x) => x.spid === a.spid).length;
      const key = `${a.spid}:${before}`;
      if (bldSeen.has(key)) return "";
      bldSeen.add(key);
      return `<p:bldP spid="${a.spid}" grpId="${before}"/>`;
    }).join("");
  }
  function buildTimingXml(anims) {
    if (anims.length === 0) return "";
    let idCounter = 0;
    const gen = { next: () => ++idCounter };
    const rootId = gen.next();
    const seqId = gen.next();
    const groupXml = placeAnims(anims).map((g) => groupParXml(gen, g)).join("");
    const bldPs = bldPsXml(anims);
    return `<p:timing><p:tnLst><p:par><p:cTn id="${rootId}" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="${seqId}" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${groupXml}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst><p:bldLst>${bldPs}</p:bldLst></p:timing>`;
  }
  var TIMING_RE = /<p:timing\b[^>]*\/>|<p:timing\b[^>]*>[\s\S]*?<\/p:timing>/;
  function mainSeqSpan(timing) {
    const m = /<p:cTn\b[^>]*\bnodeType="mainSeq"[^>]*>/.exec(timing);
    if (!m) return null;
    const start = m.index + m[0].length;
    return { start, end: findCTnEnd(timing, start) };
  }
  function rootChildTnLstEmpty(timing) {
    const rootM = /<p:cTn\b[^>]*\bnodeType="tmRoot"[^>]*>/.exec(timing);
    if (!rootM) return true;
    const childOpen = timing.indexOf("<p:childTnLst>", rootM.index + rootM[0].length);
    if (childOpen < 0) return true;
    const childClose = findBalancedClose(timing, childOpen, "p:childTnLst");
    if (childClose < 0) return true;
    return !timing.slice(childOpen + "<p:childTnLst>".length, childClose).trim();
  }
  function rebuildBldLst(timing, anims) {
    const ours = bldPsXml(anims);
    const bldOpen = /<p:bldLst\b[^>]*>/.exec(timing);
    if (!bldOpen) {
      if (!ours) return timing;
      const tEnd = timing.lastIndexOf("</p:timing>");
      if (tEnd < 0) return timing;
      return timing.slice(0, tEnd) + `<p:bldLst>${ours}</p:bldLst>` + timing.slice(tEnd);
    }
    const close = findBalancedClose(timing, bldOpen.index, "p:bldLst");
    if (close < 0) return timing;
    const inner = timing.slice(bldOpen.index + bldOpen[0].length, close);
    const kept = inner.replace(/<p:bldP\b[^>]*\/>|<p:bldP\b[^>]*>[\s\S]*?<\/p:bldP>/g, "");
    const newInner = ours + kept;
    const replacement = newInner ? `<p:bldLst>${newInner}</p:bldLst>` : "";
    return timing.slice(0, bldOpen.index) + replacement + timing.slice(close + "</p:bldLst>".length);
  }
  function rebuildTimingPreservingXml(timing, anims) {
    const seqCtnM = /<p:cTn\b[^>]*\bnodeType="mainSeq"[^>]*>/.exec(timing);
    let newTiming;
    if (anims.length === 0) {
      if (!seqCtnM) return rebuildBldLst(timing, anims);
      const seqStart = timing.lastIndexOf("<p:seq", seqCtnM.index);
      if (seqStart < 0) return null;
      const seqClose = findBalancedClose(timing, seqStart, "p:seq");
      if (seqClose < 0) return null;
      newTiming = timing.slice(0, seqStart) + timing.slice(seqClose + "</p:seq>".length);
      newTiming = rebuildBldLst(newTiming, anims);
      return rootChildTnLstEmpty(newTiming) ? "" : newTiming;
    }
    const gen = makeGenAfterMaxId(timing);
    const groupXml = placeAnims(anims).map((g) => groupParXml(gen, g)).join("");
    if (seqCtnM) {
      const childOpen = timing.indexOf("<p:childTnLst>", seqCtnM.index + seqCtnM[0].length);
      if (childOpen < 0) return null;
      const childClose = findBalancedClose(timing, childOpen, "p:childTnLst");
      if (childClose < 0) return null;
      newTiming = timing.slice(0, childOpen + "<p:childTnLst>".length) + groupXml + timing.slice(childClose);
    } else {
      const rootM = /<p:cTn\b[^>]*\bnodeType="tmRoot"[^>]*>/.exec(timing);
      if (!rootM) return null;
      const childOpen = timing.indexOf("<p:childTnLst>", rootM.index + rootM[0].length);
      if (childOpen < 0) return null;
      const childClose = findBalancedClose(timing, childOpen, "p:childTnLst");
      if (childClose < 0) return null;
      const seqXml = `<p:seq concurrent="1" nextAc="seek"><p:cTn id="${gen.next()}" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${groupXml}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>`;
      newTiming = timing.slice(0, childClose) + seqXml + timing.slice(childClose);
    }
    return rebuildBldLst(newTiming, anims);
  }
  function patchSlideTimingXml(bodySuffix, anims) {
    const timingM = TIMING_RE.exec(bodySuffix);
    if (timingM) {
      const rebuilt = rebuildTimingPreservingXml(timingM[0], anims);
      if (rebuilt != null)
        return bodySuffix.slice(0, timingM.index) + rebuilt + bodySuffix.slice(timingM.index + timingM[0].length);
    }
    const stripped = bodySuffix.replace(TIMING_RE, "");
    if (anims.length === 0) return stripped;
    const xml = buildTimingXml(anims);
    const ext = stripped.lastIndexOf("<p:extLst");
    const sldEnd = stripped.lastIndexOf("</p:sld>");
    const at = ext >= 0 ? ext : sldEnd;
    if (at < 0) return stripped;
    return stripped.slice(0, at) + xml + stripped.slice(at);
  }
  function findCTnEnd(xml, openEnd) {
    const re = /<p:cTn\b[^>]*?(\/?)>|<\/p:cTn>/g;
    re.lastIndex = openEnd;
    let depth = 1;
    let m;
    while ((m = re.exec(xml)) !== null) {
      if (m[0] === "</p:cTn>") {
        depth--;
        if (depth === 0) return m.index;
      } else if (m[1] !== "/") {
        depth++;
      }
    }
    return xml.length;
  }
  function readSlideTimingXml(bodySuffix) {
    const timing = TIMING_RE.exec(bodySuffix)?.[0];
    if (!timing) return [];
    const seq = mainSeqSpan(timing);
    if (!seq) return [];
    const out = [];
    const re = /<p:cTn\b([^>]*\bpresetClass="[^"]*"[^>]*)>/g;
    re.lastIndex = seq.start;
    let m;
    let prevStart = 0;
    let prevEnd = 0;
    while ((m = re.exec(timing)) !== null && m.index < seq.end) {
      const attrs = m[1];
      const cls = /\bpresetClass="([^"]*)"/.exec(attrs)?.[1] ?? "entr";
      const pid = Number(/\bpresetID="(\d+)"/.exec(attrs)?.[1] ?? "0");
      const psub = Number(/\bpresetSubtype="(\d+)"/.exec(attrs)?.[1] ?? "0");
      const nodeType = /\bnodeType="([^"]*)"/.exec(attrs)?.[1] ?? "clickEffect";
      const trigger = nodeType === "withEffect" ? "withPrev" : nodeType === "afterEffect" ? "afterPrev" : "onClick";
      const bodyEnd = findCTnEnd(timing, re.lastIndex);
      const body = timing.slice(re.lastIndex, bodyEnd);
      re.lastIndex = bodyEnd;
      const spidM = /<p:spTgt\s[^>]*\bspid="(\d+)"/.exec(body);
      if (!spidM) continue;
      const spid = Number(spidM[1]);
      const startMs = Number(/^\s*<p:stCondLst><p:cond delay="(\d+)"/.exec(body)?.[1] ?? "0");
      let durationMs = 0;
      const durRe = /\bdur="(\d+)"/g;
      let dm;
      while ((dm = durRe.exec(body)) !== null) durationMs = Math.max(durationMs, Number(dm[1]));
      if (/\bautoRev="1"/.test(body)) durationMs *= 2;
      const effect = effectFromPreset(cls, pid, psub);
      if (effect === "appear" || effect === "disappear") durationMs = 0;
      if (trigger === "onClick") {
        prevStart = 0;
        prevEnd = 0;
      }
      const base = trigger === "afterPrev" ? prevEnd : trigger === "withPrev" ? prevStart : 0;
      const delayMs = Math.max(0, startMs - base);
      prevStart = startMs;
      prevEnd = startMs + Math.max(1, durationMs);
      const anim = { spid, effect, trigger, durationMs, delayMs };
      const pgM = /<p:pgRg\s[^>]*\bst="(\d+)"/.exec(body);
      if (pgM) anim.paragraph = Number(pgM[1]);
      if (effect === "motionPath") {
        const path = /<p:animMotion\b[^>]*\bpath="([^"]*)"/.exec(body)?.[1];
        anim.motionPath = (path ?? DEFAULT_MOTION_PATH).replace(/\s*E$/, "").trim();
      }
      out.push(anim);
    }
    return out;
  }
  function animEq(x, y) {
    return x.spid === y.spid && x.effect === y.effect && x.trigger === y.trigger && x.durationMs === y.durationMs && x.delayMs === y.delayMs && (x.motionPath ?? null) === (y.motionPath ?? null) && (x.paragraph ?? null) === (y.paragraph ?? null);
  }
  function findBalancedClose(xml, openStart, tag) {
    const re = new RegExp(`<${tag}\\b[^>]*?(/?)>|</${tag}>`, "g");
    re.lastIndex = openStart;
    let depth = 0;
    let m;
    while ((m = re.exec(xml)) !== null) {
      if (m[0].startsWith(`</`)) {
        depth--;
        if (depth === 0) return m.index;
      } else if (m[1] !== "/") {
        depth++;
      }
    }
    return -1;
  }
  function nthEffectParSpan(timing, n) {
    const seq = mainSeqSpan(timing);
    if (!seq) return null;
    const re = /<p:cTn\b[^>]*\bpresetClass="[^"]*"[^>]*>/g;
    re.lastIndex = seq.start;
    let m;
    let i = 0;
    while ((m = re.exec(timing)) !== null && m.index < seq.end) {
      if (i++ < n) {
        re.lastIndex = findCTnEnd(timing, re.lastIndex);
        continue;
      }
      const parStart = timing.lastIndexOf("<p:par", m.index);
      if (parStart < 0) return null;
      const closeAt = findBalancedClose(timing, parStart, "p:par");
      if (closeAt < 0) return null;
      return { start: parStart, end: closeAt + "</p:par>".length };
    }
    return null;
  }
  function absStarts(anims) {
    const out = [];
    let prevStart = 0;
    let prevEnd = 0;
    for (const a of anims) {
      if (a.trigger === "onClick") {
        prevStart = 0;
        prevEnd = 0;
      }
      const base = a.trigger === "afterPrev" ? prevEnd : a.trigger === "withPrev" ? prevStart : 0;
      const start = base + Math.max(0, Math.round(a.delayMs));
      out.push(start);
      prevStart = start;
      prevEnd = start + Math.max(1, Math.round(a.durationMs));
    }
    return out;
  }
  function makeGenAfterMaxId(timing) {
    let maxId = 0;
    for (const m of timing.matchAll(/\bid="(\d+)"/g)) maxId = Math.max(maxId, Number(m[1]));
    let c = maxId;
    return { next: () => ++c };
  }
  function appendBldPs(timing, items) {
    const seen = /* @__PURE__ */ new Set();
    for (const m of timing.matchAll(/<p:bldP\b[^>]*\bspid="(\d+)"[^>]*\bgrpId="(\d+)"/g)) {
      seen.add(`${m[1]}:${m[2]}`);
    }
    const paraSeen = /* @__PURE__ */ new Set();
    for (const m of timing.matchAll(/<p:bldP\b[^>]*\bspid="(\d+)"[^>]*\bbuild="p"/g)) paraSeen.add(m[1]);
    const parts = [];
    for (const p of items) {
      if (p.a.paragraph != null) {
        const k = String(p.a.spid);
        if (paraSeen.has(k)) continue;
        paraSeen.add(k);
        parts.push(`<p:bldP spid="${p.a.spid}" grpId="${p.grpId}" uiExpand="1" build="p"/>`);
      } else {
        const k = `${p.a.spid}:${p.grpId}`;
        if (seen.has(k)) continue;
        seen.add(k);
        parts.push(`<p:bldP spid="${p.a.spid}" grpId="${p.grpId}"/>`);
      }
    }
    const add = parts.join("");
    if (!add) return timing;
    const bldEnd = timing.lastIndexOf("</p:bldLst>");
    if (bldEnd >= 0) return timing.slice(0, bldEnd) + add + timing.slice(bldEnd);
    const tEnd = timing.lastIndexOf("</p:timing>");
    if (tEnd < 0) return timing;
    return timing.slice(0, tEnd) + `<p:bldLst>${add}</p:bldLst>` + timing.slice(tEnd);
  }
  function patchSlideTimingIncrementalXml(bodySuffix, anims) {
    const timingM = TIMING_RE.exec(bodySuffix);
    if (!timingM) return null;
    const timing = timingM[0];
    const old = readSlideTimingXml(bodySuffix);
    if (!old.length || !anims.length) return null;
    const splice = (newTiming) => bodySuffix.slice(0, timingM.index) + newTiming + bodySuffix.slice(timingM.index + timing.length);
    if (anims.length > old.length && old.every((o, i) => animEq(o, anims[i]))) {
      const added = anims.slice(old.length);
      if (added[0].trigger !== "onClick") return null;
      const kindBySpid = /* @__PURE__ */ new Map();
      for (const a of anims) kindBySpid.set(a.spid, (kindBySpid.get(a.spid) ?? 0) | (a.paragraph == null ? 1 : 2));
      if (added.some((a) => kindBySpid.get(a.spid) === 3)) return null;
      const seqM = /<p:cTn\b[^>]*\bnodeType="mainSeq"[^>]*>/.exec(timing);
      if (!seqM) return null;
      const childOpen = timing.indexOf("<p:childTnLst>", seqM.index + seqM[0].length);
      if (childOpen < 0) return null;
      const childClose = findBalancedClose(timing, childOpen, "p:childTnLst");
      if (childClose < 0) return null;
      const gen = makeGenAfterMaxId(timing);
      const grpBase = /* @__PURE__ */ new Map();
      for (const a of old) grpBase.set(a.spid, (grpBase.get(a.spid) ?? 0) + 1);
      const groups = placeAnims(added, grpBase);
      const groupsXml = groups.map((g) => groupParXml(gen, g)).join("");
      let newTiming = timing.slice(0, childClose) + groupsXml + timing.slice(childClose);
      newTiming = appendBldPs(newTiming, groups.flatMap((g) => g.items));
      return splice(newTiming);
    }
    if (anims.length === old.length) {
      const diffIdx = anims.flatMap((a2, i2) => animEq(a2, old[i2]) ? [] : [i2]);
      if (diffIdx.length !== 1) return null;
      const i = diffIdx[0];
      const o = old[i];
      const a = anims[i];
      if (o.trigger !== a.trigger || o.spid !== a.spid) return null;
      if ((o.paragraph ?? null) !== (a.paragraph ?? null)) return null;
      const next = anims[i + 1];
      if (next && next.trigger !== "onClick") return null;
      const span = nthEffectParSpan(timing, i);
      if (!span) return null;
      const gen = makeGenAfterMaxId(timing);
      const origGrpId = /\bgrpId="(\d+)"/.exec(timing.slice(span.start, span.end))?.[1];
      const grpId = origGrpId != null ? Number(origGrpId) : anims.slice(0, i).filter((x) => x.spid === a.spid).length;
      const par = effectParXml(gen, { a, startMs: absStarts(anims)[i], grpId });
      return splice(timing.slice(0, span.start) + par + timing.slice(span.end));
    }
    return null;
  }
  function setSlideAnimations(slide, anims) {
    slide.bodySuffix = patchSlideTimingIncrementalXml(slide.bodySuffix, anims) ?? patchSlideTimingXml(slide.bodySuffix, anims);
    slide.structureDirty = true;
  }
  function getSlideAnimations(slide) {
    return readSlideTimingXml(slide.bodySuffix);
  }

  // ../engine/pptx-engine/master-edit.ts
  var partNum = (p) => parseInt(/(\d+)\.xml$/.exec(p)?.[1] ?? "0", 10);
  function cSldName(xml, fallback) {
    const m = xml ? /<p:cSld\s[^>]*name="([^"]*)"/.exec(xml) : null;
    return m?.[1] || fallback;
  }
  function listMasterParts(archive) {
    const masters = [...archive.entries.keys()].filter((p) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(p)).sort((a, b) => partNum(a) - partNum(b));
    const out = [];
    for (const m of masters) {
      out.push({ partPath: m, kind: "master", name: cSldName(archive.readText(m), baseName(m)) });
      const layouts = [...archive.readRels(m).values()].filter((r) => r.type.endsWith("/slideLayout")).map((r) => resolveTarget(m, r.target)).sort((a, b) => partNum(a) - partNum(b));
      for (const l of layouts) {
        out.push({ partPath: l, kind: "layout", name: cSldName(archive.readText(l), baseName(l)) });
      }
    }
    return out;
  }
  function baseName(p) {
    return p.slice(p.lastIndexOf("/") + 1, -4);
  }
  function partMedia(archive, partPath) {
    const media = /* @__PURE__ */ new Map();
    for (const rel of archive.readRels(partPath).values()) {
      if (rel.type.endsWith("/image")) media.set(rel.id, resolveTarget(partPath, rel.target));
    }
    return media;
  }
  function parseMasterPart(archive, partPath) {
    const xml = archive.readText(partPath);
    if (!xml) return null;
    const isMaster = partPath.includes("/slideMasters/");
    let masterPath = isMaster ? partPath : void 0;
    if (!isMaster) {
      for (const rel of archive.readRels(partPath).values()) {
        if (rel.type.endsWith("/slideMaster")) {
          masterPath = resolveTarget(partPath, rel.target);
          break;
        }
      }
    }
    const ctx = {};
    if (masterPath) {
      for (const rel of archive.readRels(masterPath).values()) {
        if (rel.type.endsWith("/theme")) {
          const themeXml = archive.readText(resolveTarget(masterPath, rel.target));
          if (themeXml) ctx.theme = parseTheme(themeXml);
          break;
        }
      }
    }
    ctx.mediaRels = partMedia(archive, partPath);
    ctx.tableStyles = archive.readText("ppt/tableStyles.xml") ?? void 0;
    const masterXml = !isMaster && masterPath ? archive.readText(masterPath) : void 0;
    if (isMaster) {
      ctx.masterTextStyles = parseMasterTextStyles(xml, ctx.theme);
    } else if (masterXml) {
      ctx.masterPlaceholders = parsePlaceholderMap(masterXml, ctx.theme);
      ctx.masterTextStyles = parseMasterTextStyles(masterXml, ctx.theme);
      ctx.masterBg = masterXml;
    }
    const slide = parseSlide({ path: partPath, slideXml: xml, masterPath, ctx });
    if (!isMaster && masterXml && masterPath) {
      if (!/<p:sldLayout\b[^>]*showMasterSp="(?:0|false)"/.test(xml)) {
        const dctx = { theme: ctx.theme, mediaRels: partMedia(archive, masterPath) };
        const dec = parseDecorations(masterXml, dctx, {});
        if (dec.length) slide.decorations = dec;
      }
    }
    return slide;
  }

  // ../engine/pptx-engine/table-edit.ts
  var inLn = (tag, color) => `<a:${tag}><a:ln w="9525" cap="flat"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln></a:${tag}>`;
  function partXml(tag, o) {
    const tx = o.text || o.bold ? `<a:tcTxStyle${o.bold ? ' b="on"' : ""}>${o.text ? `<a:srgbClr val="${o.text}"/>` : ""}</a:tcTxStyle>` : "";
    const bdr = o.insideH || o.insideV ? `<a:tcBdr>${o.insideH ? inLn("insideH", o.insideH) : ""}${o.insideV ? inLn("insideV", o.insideV) : ""}</a:tcBdr>` : "";
    const fill = o.fill ? `<a:fill><a:solidFill><a:srgbClr val="${o.fill}"/></a:solidFill></a:fill>` : "";
    const tc = bdr || fill ? `<a:tcStyle>${bdr}${fill}</a:tcStyle>` : "";
    return `<a:${tag}>${tx}${tc}</a:${tag}>`;
  }
  function customStyle(styleId, name, o) {
    return `<a:tblStyle styleId="${styleId}" styleName="${name}">` + partXml("wholeTbl", { text: "000000", fill: o.whole, insideH: o.insideH }) + (o.band ? partXml("band1H", { fill: o.band }) : "") + partXml("firstRow", {
      bold: true,
      ...o.header ? { fill: o.header.fill, text: o.header.text } : {}
    }) + "</a:tblStyle>";
  }
  var ID_ZEBRA_BLUE = "{A10FF1CE-0000-4000-9000-000000000001}";
  var ID_ZEBRA_GRAY = "{A10FF1CE-0000-4000-9000-000000000002}";
  var ID_HEADER_DARKBLUE = "{A10FF1CE-0000-4000-9000-000000000003}";
  var ID_HEADER_ORANGE = "{A10FF1CE-0000-4000-9000-000000000004}";
  var ID_NO_BORDER = "{A10FF1CE-0000-4000-9000-000000000005}";
  var tblPr = (styleId, flags = "") => `<a:tblPr${flags}><a:tableStyleId>${styleId}</a:tableStyleId></a:tblPr>`;
  var NO_STYLE = "{2D5ABB26-0587-4C30-8999-92F81FD0307C}";
  var TABLE_STYLE_PRESETS = {
    none: { tblPrXml: tblPr(NO_STYLE), description: "No style" },
    lightGrid: {
      tblPrXml: tblPr(NO_STYLE),
      description: "Light grid",
      border: { color: "#BFBFBF", widthEmu: 12700 }
    },
    zebraBlue: {
      tblPrXml: tblPr(ID_ZEBRA_BLUE, ' firstRow="1" bandRow="1"'),
      description: "Banded blue",
      styleId: ID_ZEBRA_BLUE,
      styleDefXml: customStyle(ID_ZEBRA_BLUE, "Banded blue", {
        whole: "FFFFFF",
        band: "D6E4F0",
        header: { fill: "4472C4", text: "FFFFFF" }
      })
    },
    zebraGray: {
      tblPrXml: tblPr(ID_ZEBRA_GRAY, ' firstRow="1" bandRow="1"'),
      description: "Banded gray",
      styleId: ID_ZEBRA_GRAY,
      styleDefXml: customStyle(ID_ZEBRA_GRAY, "Banded gray", {
        whole: "FFFFFF",
        band: "EDEDED",
        header: { fill: "595959", text: "FFFFFF" }
      })
    },
    headerDarkBlue: {
      tblPrXml: tblPr(ID_HEADER_DARKBLUE, ' firstRow="1"'),
      description: "Dark blue header",
      styleId: ID_HEADER_DARKBLUE,
      styleDefXml: customStyle(ID_HEADER_DARKBLUE, "Dark blue header", {
        whole: "FFFFFF",
        insideH: "D9D9D9",
        band: "E9EDF5",
        header: { fill: "1F3864", text: "FFFFFF" }
      })
    },
    headerOrange: {
      tblPrXml: tblPr(ID_HEADER_ORANGE, ' firstRow="1"'),
      description: "Orange header",
      styleId: ID_HEADER_ORANGE,
      styleDefXml: customStyle(ID_HEADER_ORANGE, "Orange header", {
        whole: "FFFFFF",
        insideH: "D9D9D9",
        band: "FBE5D6",
        header: { fill: "ED7D31", text: "FFFFFF" }
      })
    },
    noBorder: {
      tblPrXml: tblPr(ID_NO_BORDER, ' firstRow="1" bandRow="1"'),
      description: "Minimal (no borders)",
      styleId: ID_NO_BORDER,
      styleDefXml: customStyle(ID_NO_BORDER, "Minimal (no borders)", { band: "F2F2F2" })
    },
    fullBorder: {
      tblPrXml: tblPr(NO_STYLE),
      description: "All borders",
      border: { color: "#000000", widthEmu: 12700 }
    }
  };
  var EMPTY_TABLE_STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>';
  function ensureTableStyleXml(tableStylesXml, styleId, styleDefXml) {
    const xml = tableStylesXml?.includes("<a:tblStyleLst") ? tableStylesXml : EMPTY_TABLE_STYLES_XML;
    if (xml.includes(styleId)) return xml;
    const sc = /<a:tblStyleLst([^>]*)\/>/.exec(xml);
    if (sc) return xml.replace(sc[0], `<a:tblStyleLst${sc[1]}>${styleDefXml}</a:tblStyleLst>`);
    return xml.replace("</a:tblStyleLst>", `${styleDefXml}</a:tblStyleLst>`);
  }
  function patchTableStyleXml(originalXml, edit) {
    let xml = originalXml;
    if (edit.tblPrXml !== void 0) {
      xml = replaceTblPr(xml, edit.tblPrXml);
    } else if (edit.firstRow !== void 0 || edit.bandRow !== void 0) {
      const tblPrMatch = /<a:tblPr(\s[^>]*)?(\/?>)/s.exec(xml);
      if (tblPrMatch) {
        if (tblPrMatch[2] === "/>") {
          let attrs = tblPrMatch[1] ?? "";
          if (edit.firstRow !== void 0)
            attrs = setAttr2(attrs, "firstRow", edit.firstRow ? "1" : void 0);
          if (edit.bandRow !== void 0)
            attrs = setAttr2(attrs, "bandRow", edit.bandRow ? "1" : void 0);
          const newOpen = `<a:tblPr${attrs}>`;
          xml = xml.slice(0, tblPrMatch.index) + newOpen + "</a:tblPr>" + xml.slice(tblPrMatch.index + tblPrMatch[0].length);
        } else {
          let attrs = tblPrMatch[1] ?? "";
          if (edit.firstRow !== void 0)
            attrs = setAttr2(attrs, "firstRow", edit.firstRow ? "1" : void 0);
          if (edit.bandRow !== void 0)
            attrs = setAttr2(attrs, "bandRow", edit.bandRow ? "1" : void 0);
          const newOpen = `<a:tblPr${attrs}>`;
          xml = xml.slice(0, tblPrMatch.index) + newOpen + xml.slice(tblPrMatch.index + tblPrMatch[0].length);
        }
      }
    }
    if (edit.shadingColor !== void 0 || edit.borderPreset !== void 0 || edit.clearDirectFormatting) {
      xml = edit.cells ? patchCellsTcPr(xml, edit) : patchAllTcPr(xml, edit);
    }
    return xml;
  }
  function replaceTblPr(xml, newTblPr) {
    const sc = /<a:tblPr[^>]*\/>/.exec(xml);
    if (sc) return xml.slice(0, sc.index) + newTblPr + xml.slice(sc.index + sc[0].length);
    const open2 = xml.indexOf("<a:tblPr");
    if (open2 < 0) {
      const tbl = xml.indexOf("<a:tbl>");
      if (tbl >= 0)
        return xml.slice(0, tbl + "<a:tbl>".length) + newTblPr + xml.slice(tbl + "<a:tbl>".length);
      return xml;
    }
    const close = xml.indexOf("</a:tblPr>", open2);
    if (close < 0) return xml;
    return xml.slice(0, open2) + newTblPr + xml.slice(close + "</a:tblPr>".length);
  }
  function setAttr2(attrs, key, value) {
    const re = new RegExp(`\\s${key}="[^"]*"`);
    const cleaned = attrs.replace(re, "");
    if (value === void 0) return cleaned;
    return `${cleaned} ${key}="${escapeXmlAttr(value)}"`;
  }
  function applyTcPrEdit(inner, edit) {
    if (edit.clearDirectFormatting) {
      inner = inner.replace(/<a:(solidFill|gradFill|pattFill|blipFill)>.*?<\/a:\1>/gs, "");
      inner = inner.replace(/<a:(noFill|grpFill)\/>/g, "");
      inner = inner.replace(/<a:(lnL|lnR|lnT|lnB|lnTlToBr|lnBlToTr)(\s[^>]*)?\/>/g, "");
      inner = inner.replace(/<a:(lnL|lnR|lnT|lnB|lnTlToBr|lnBlToTr)(\s[^>]*)?>.*?<\/a:\1>/gs, "");
    }
    if (edit.shadingColor !== void 0) {
      inner = inner.replace(/<a:solidFill>.*?<\/a:solidFill>/gs, "");
      inner = inner.replace(/<a:noFill\/>/g, "");
      inner = inner.replace(/<a:noFill><\/a:noFill>/g, "");
      if (edit.shadingColor === "none") {
        inner = "<a:noFill/>" + inner;
      } else if (edit.shadingColor) {
        const c = edit.shadingColor.replace("#", "").toUpperCase();
        inner = `<a:solidFill><a:srgbClr val="${c}"/></a:solidFill>` + inner;
      }
    }
    if (edit.borderPreset !== void 0) {
      inner = inner.replace(/<a:lnL[^>]*>.*?<\/a:lnL>/gs, "");
      inner = inner.replace(/<a:lnR[^>]*>.*?<\/a:lnR>/gs, "");
      inner = inner.replace(/<a:lnT[^>]*>.*?<\/a:lnT>/gs, "");
      inner = inner.replace(/<a:lnB[^>]*>.*?<\/a:lnB>/gs, "");
      if (edit.borderPreset === "all" && edit.borderColor) {
        const c = edit.borderColor.replace("#", "").toUpperCase();
        const w = edit.borderWidthEmu ?? 12700;
        const lnXml = (tag) => `<${tag} w="${w}"><a:solidFill><a:srgbClr val="${c}"/></a:solidFill></${tag}>`;
        inner = inner + lnXml("a:lnL") + lnXml("a:lnR") + lnXml("a:lnT") + lnXml("a:lnB");
      } else if (edit.borderPreset === "none") {
        inner = inner + '<a:lnL w="0"><a:noFill/></a:lnL><a:lnR w="0"><a:noFill/></a:lnR><a:lnT w="0"><a:noFill/></a:lnT><a:lnB w="0"><a:noFill/></a:lnB>';
      }
    }
    return inner;
  }
  function patchAllTcPr(xml, edit) {
    const out = [];
    let cursor = 0;
    const re = /<a:tcPr([^>]*)>(.*?)<\/a:tcPr>|<a:tcPr([^>]*)\/>/gs;
    let m;
    while ((m = re.exec(xml)) !== null) {
      out.push(xml.slice(cursor, m.index));
      const inner = applyTcPrEdit(m[2] ?? "", edit);
      const attrs = m[1] ?? m[3] ?? "";
      out.push(`<a:tcPr${attrs}>${inner}</a:tcPr>`);
      cursor = m.index + m[0].length;
    }
    out.push(xml.slice(cursor));
    return out.join("");
  }
  function nthSpan(xml, tag, n, from = 0, to = xml.length) {
    const re = new RegExp(`<${tag}[\\s>]`, "g");
    re.lastIndex = from;
    let i = 0;
    let m;
    while ((m = re.exec(xml)) !== null && m.index < to) {
      if (i === n) {
        const close = xml.indexOf(`</${tag}>`, m.index);
        if (close < 0 || close + tag.length + 3 > to) return null;
        return { start: m.index, end: close + tag.length + 3 };
      }
      i++;
    }
    return null;
  }
  function patchCellsTcPr(xml, edit) {
    const cells = [...edit.cells].sort((a, b) => b.row - a.row || b.col - a.col);
    for (const { row, col } of cells) {
      if (row < 0 || col < 0) continue;
      const tr = nthSpan(xml, "a:tr", row);
      if (!tr) continue;
      const tc = nthSpan(xml, "a:tc", col, tr.start, tr.end);
      if (!tc) continue;
      let tcXml = xml.slice(tc.start, tc.end);
      const m = /<a:tcPr([^>]*)>(.*?)<\/a:tcPr>|<a:tcPr([^>]*)\/>/s.exec(tcXml);
      if (m) {
        const inner = applyTcPrEdit(m[2] ?? "", edit);
        const attrs = m[1] ?? m[3] ?? "";
        tcXml = tcXml.slice(0, m.index) + `<a:tcPr${attrs}>${inner}</a:tcPr>` + tcXml.slice(m.index + m[0].length);
      } else {
        tcXml = tcXml.replace(/<\/a:tc>$/, `<a:tcPr>${applyTcPrEdit("", edit)}</a:tcPr></a:tc>`);
      }
      xml = xml.slice(0, tc.start) + tcXml + xml.slice(tc.end);
    }
    return xml;
  }

  // ../engine/pptx-engine/chart-insert.ts
  var CHART_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";
  var CHART_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart";
  var C_NS = "http://schemas.openxmlformats.org/drawingml/2006/chart";
  var A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
  var R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  var colLetter = (i) => String.fromCharCode(66 + i);
  function strCacheXml(values, f) {
    return `<c:strRef><c:f>${escapeXmlText(f)}</c:f><c:strCache><c:ptCount val="${values.length}"/>` + values.map((v, i) => v === "" ? "" : `<c:pt idx="${i}"><c:v>${escapeXmlText(v)}</c:v></c:pt>`).join("") + "</c:strCache></c:strRef>";
  }
  function numCacheXml(values, f) {
    return `<c:numRef><c:f>${escapeXmlText(f)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>` + values.map((v, i) => v == null || !Number.isFinite(v) ? "" : `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join("") + "</c:numCache></c:numRef>";
  }
  var DLBLS_XML = '<c:dLbls><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>';
  function axTitleXml(text, vertical) {
    return `<c:title><c:tx><c:rich><a:bodyPr${vertical ? ' rot="-5400000" vert="horz"' : ""}/><a:lstStyle/><a:p><a:r><a:t>${escapeXmlText(text)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
  }
  function buildChartSpaceXml(opts) {
    const rows = opts.categories.length;
    const dLbls = opts.dataLabels ? DLBLS_XML : "";
    const grid = opts.gridlines ? "<c:majorGridlines/>" : "";
    const catTitle = opts.catAxisTitle ? axTitleXml(opts.catAxisTitle, false) : "";
    const valTitle = opts.valAxisTitle ? axTitleXml(opts.valAxisTitle, true) : "";
    const gapWidth = opts.gapWidthPct != null ? `<c:gapWidth val="${Math.round(opts.gapWidthPct)}"/>` : "";
    const txXml = (name, i) => name === "" ? "" : `<c:tx>${strCacheXml([name], `Sheet1!$${colLetter(i)}$1`)}</c:tx>`;
    const catXml = opts.categories.some((c) => c !== "") ? `<c:cat>${strCacheXml(opts.categories, `Sheet1!$A$2:$A$${rows + 1}`)}</c:cat>` : "";
    const dPtXml = (i) => {
      const colors = opts.pointColors?.[i];
      if (!colors) return "";
      let out = "";
      colors.forEach((c, pi) => {
        if (!c) return;
        const hex = c.replace("#", "").toUpperCase();
        out += `<c:dPt><c:idx val="${pi}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill></c:spPr></c:dPt>`;
      });
      return out;
    };
    const serXml = (ser, i) => {
      const col = colLetter(i);
      return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>` + txXml(ser.name, i) + dPtXml(i) + catXml + `<c:val>${numCacheXml(ser.values.slice(0, rows), `Sheet1!$${col}$2:$${col}$${rows + 1}`)}</c:val></c:ser>`;
    };
    const sers = opts.series.map(serXml).join("");
    let plot;
    if (opts.kind === "comboBarLine") {
      const lineCount = opts.series.length >= 2 ? 1 : 0;
      const barEnd = opts.series.length - lineCount;
      const barSers = opts.series.slice(0, barEnd).map(serXml).join("");
      const lineSers = opts.series.slice(barEnd).map((ser, k) => serXml(ser, barEnd + k)).join("");
      plot = `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${barSers}${dLbls}${gapWidth}<c:axId val="111111111"/><c:axId val="222222222"/></c:barChart>` + (lineSers ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${lineSers}${dLbls}<c:marker val="1"/><c:axId val="333333333"/><c:axId val="444444444"/></c:lineChart>` : "") + `<c:catAx><c:axId val="111111111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>${catTitle}<c:crossAx val="222222222"/></c:catAx><c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>${grid}${valTitle}<c:crossAx val="111111111"/></c:valAx>` + (lineSers ? '<c:valAx><c:axId val="444444444"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="r"/><c:crossAx val="333333333"/><c:crosses val="max"/></c:valAx><c:catAx><c:axId val="333333333"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="1"/><c:axPos val="b"/><c:crossAx val="444444444"/></c:catAx>' : "");
    } else if (opts.kind === "pie") {
      plot = `<c:pieChart><c:varyColors val="1"/>${sers}${dLbls}<c:firstSliceAng val="0"/></c:pieChart>`;
    } else if (opts.kind === "doughnut") {
      plot = `<c:doughnutChart><c:varyColors val="1"/>${sers}${dLbls}<c:firstSliceAng val="0"/><c:holeSize val="50"/></c:doughnutChart>`;
    } else if (opts.kind === "scatter") {
      const xs = opts.categories.map((c, i) => {
        const v = Number(c);
        return c.trim() !== "" && Number.isFinite(v) ? v : i + 1;
      });
      const scatterSers = opts.series.map((ser, i) => {
        const col = colLetter(i);
        return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>` + txXml(ser.name, i) + `<c:xVal>${numCacheXml(xs, `Sheet1!$A$2:$A$${rows + 1}`)}</c:xVal><c:yVal>${numCacheXml(ser.values.slice(0, rows), `Sheet1!$${col}$2:$${col}$${rows + 1}`)}</c:yVal><c:smooth val="0"/></c:ser>`;
      }).join("");
      plot = `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${scatterSers}${dLbls}<c:axId val="111111111"/><c:axId val="222222222"/></c:scatterChart><c:valAx><c:axId val="111111111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>${catTitle}<c:crossAx val="222222222"/></c:valAx><c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>${grid}${valTitle}<c:crossAx val="111111111"/></c:valAx>`;
    } else {
      const isBarKind = opts.kind === "bar" || opts.kind === "barStacked" || opts.kind === "barPercentStacked";
      const horizontal = isBarKind && opts.barDir === "bar";
      const axes = `<c:catAx><c:axId val="111111111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? "l" : "b"}"/>${catTitle}<c:crossAx val="222222222"/></c:catAx><c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? "b" : "l"}"/>${grid}${valTitle}<c:crossAx val="111111111"/></c:valAx>`;
      const axIds = '<c:axId val="111111111"/><c:axId val="222222222"/>';
      let inner;
      if (opts.kind === "radar") {
        inner = `<c:radarChart><c:radarStyle val="standard"/><c:varyColors val="0"/>${sers}${dLbls}${axIds}</c:radarChart>`;
      } else if (opts.kind === "line") {
        inner = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}${dLbls}<c:marker val="1"/>${axIds}</c:lineChart>`;
      } else if (opts.kind === "area") {
        inner = `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}${dLbls}${axIds}</c:areaChart>`;
      } else {
        const grouping = opts.kind === "barPercentStacked" ? "percentStacked" : opts.kind === "barStacked" ? "stacked" : "clustered";
        const overlap = grouping === "clustered" ? "" : '<c:overlap val="100"/>';
        inner = `<c:barChart><c:barDir val="${horizontal ? "bar" : "col"}"/><c:grouping val="${grouping}"/><c:varyColors val="0"/>${sers}${dLbls}${gapWidth}${overlap}${axIds}</c:barChart>`;
      }
      plot = inner + axes;
    }
    const title = opts.title ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escapeXmlText(opts.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>` : '<c:autoTitleDeleted val="1"/>';
    const legendPos = opts.legendPos ?? "b";
    const legend = legendPos === "none" ? "" : `<c:legend><c:legendPos val="${legendPos}"/><c:overlay val="0"/></c:legend>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="${C_NS}" xmlns:a="${A_NS}" xmlns:r="${R_NS}"><c:chart>${title}<c:plotArea><c:layout/>${plot}</c:plotArea>` + legend + '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>';
  }
  function addChart(opened, slideIndex, opts) {
    const { archive } = opened;
    const slide = opened.deck.slides[slideIndex];
    if (!slide || !opts.categories.length || !opts.series.length) return null;
    let maxNum = 0;
    for (const path of archive.entries.keys()) {
      const m = /^ppt\/charts\/chart(\d+)\.xml$/.exec(path);
      if (m) maxNum = Math.max(maxNum, Number(m[1]));
    }
    const chartPath = `ppt/charts/chart${maxNum + 1}.xml`;
    archive.entries.set(chartPath, Buffer.from(buildChartSpaceXml(opts), "utf8"));
    const ctPath = "[Content_Types].xml";
    const ct = archive.readText(ctPath);
    if (ct && !ct.includes(`PartName="/${chartPath}"`)) {
      const override = `<Override PartName="/${chartPath}" ContentType="${CHART_CONTENT_TYPE}"/>`;
      archive.entries.set(ctPath, Buffer.from(ct.replace("</Types>", `${override}</Types>`), "utf8"));
    }
    const relsPath = relsPathFor(slide.path);
    const rels = archive.readText(relsPath) ?? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    let maxRid = 0;
    for (const m of rels.matchAll(/Id="rId(\d+)"/g)) maxRid = Math.max(maxRid, Number(m[1]));
    const rid = `rId${maxRid + 1}`;
    const relXml = `<Relationship Id="${rid}" Type="${CHART_REL_TYPE}" Target="../charts/chart${maxNum + 1}.xml"/>`;
    archive.entries.set(relsPath, Buffer.from(rels.replace("</Relationships>", `${relXml}</Relationships>`), "utf8"));
    const id = nextCNvPrId(slide);
    const o = opts.offset;
    const name = opts.title ? `Chart ${id} - ${opts.title}` : `Chart ${id}`;
    const frameXml = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${escapeXmlAttr(name)}" descr="aislides-chart"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${o.x}" y="${o.y}"/><a:ext cx="${o.cx}" cy="${o.cy}"/></p:xfrm><a:graphic><a:graphicData uri="${C_NS}"><c:chart xmlns:c="${C_NS}" xmlns:r="${R_NS}" r:id="${rid}"/></a:graphicData></a:graphic></p:graphicFrame>`;
    const r = appendRawElements(opened, slideIndex, [frameXml]);
    return r ? { slide: r.slide, elementId: r.elementIds[r.elementIds.length - 1] } : null;
  }

  // ../engine/pptx-engine/layout.ts
  var PH_HINT_MAP = {
    title: "Click to add title",
    ctrTitle: "Click to add title",
    body: "Click to add text",
    subTitle: "Click to add subtitle",
    obj: "Click to add content",
    "": "Click to add text"
  };
  var FUNCTION_TYPES = /* @__PURE__ */ new Set(["ftr", "sldNum", "dt", "pic"]);
  function parseLayoutName(xml, fallback) {
    const m = /<p:cSld\s[^>]*name="([^"]*)"/.exec(xml);
    return m?.[1] || fallback;
  }
  function parseLayoutType(xml) {
    const m = /<p:sldLayout\b[^>]*\btype="([^"]*)"/.exec(xml);
    return m?.[1] ?? "custom";
  }
  function parseLayoutPlaceholders(xml) {
    const results = [];
    for (const spMatch of xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)) {
      const sp = spMatch[1];
      const phMatch = /<p:ph\b([^>]*)\/?>/.exec(sp);
      if (!phMatch) continue;
      const phAttr = phMatch[1];
      const typeM = /\btype="([^"]*)"/.exec(phAttr);
      const idxM = /\bidx="([^"]*)"/.exec(phAttr);
      const type = typeM?.[1] ?? "";
      const idx = idxM?.[1] ?? "";
      if (FUNCTION_TYPES.has(type)) continue;
      const xfrmM = /<a:xfrm\b[^>]*>([\s\S]*?)<\/a:xfrm>/.exec(sp);
      if (!xfrmM) continue;
      const xfrmContent = xfrmM[1];
      const offM = /<a:off\s[^>]*x="([^"]*)"[^>]*y="([^"]*)"/.exec(xfrmContent);
      const extM = /<a:ext\s[^>]*cx="([^"]*)"[^>]*cy="([^"]*)"/.exec(xfrmContent);
      if (!offM || !extM) continue;
      const x = parseInt(offM[1], 10);
      const y = parseInt(offM[2], 10);
      const cx = parseInt(extM[1], 10);
      const cy = parseInt(extM[2], 10);
      if (isNaN(x) || isNaN(y) || isNaN(cx) || isNaN(cy)) continue;
      results.push({ type, idx, x, y, cx, cy, hint: PH_HINT_MAP[type] ?? "Click to add text" });
    }
    return results;
  }
  function listSlideLayouts(archive) {
    const paths = [...archive.entries.keys()].filter((p) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(p)).sort((a, b) => {
      const na = parseInt(/(\d+)/.exec(a)?.[1] ?? "0", 10);
      const nb = parseInt(/(\d+)/.exec(b)?.[1] ?? "0", 10);
      return na - nb;
    });
    return paths.map((path) => {
      const xml = archive.readText(path) ?? "";
      const fileName = path.slice(path.lastIndexOf("/") + 1, -4);
      const name = parseLayoutName(xml, fileName);
      const layoutType = parseLayoutType(xml);
      const placeholders = parseLayoutPlaceholders(xml);
      return { path, name, layoutType, placeholders };
    });
  }
  var SLIDE_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
  var SLIDE_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";
  var LAYOUT_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout";
  function nextSlidePath(archive) {
    let max = 0;
    for (const path of archive.entries.keys()) {
      const m = /^ppt\/slides\/slide(\d+)\.xml$/.exec(path);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `ppt/slides/slide${max + 1}.xml`;
  }
  var XMLDECL2 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
  var NS_A2 = "http://schemas.openxmlformats.org/drawingml/2006/main";
  var NS_R2 = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  var NS_P2 = "http://schemas.openxmlformats.org/presentationml/2006/main";
  var EMPTY_SPTREE2 = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
  function placeholderSpXml(ph, id) {
    const typeAttr = ph.type ? ` type="${escapeXmlAttr(ph.type)}"` : "";
    const idxAttr = ph.idx ? ` idx="${escapeXmlAttr(ph.idx)}"` : "";
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="ph${ph.idx || "0"}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph${typeAttr}${idxAttr}/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${ph.x}" y="${ph.y}"/><a:ext cx="${ph.cx}" cy="${ph.cy}"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`;
  }
  function buildSlideXmlWithPlaceholders(placeholders) {
    const shapes = placeholders.map((ph, i) => placeholderSpXml(ph, i + 2));
    const spTree = `<p:spTree>${EMPTY_SPTREE2}${shapes.join("")}</p:spTree>`;
    return XMLDECL2 + `<p:sld xmlns:a="${NS_A2}" xmlns:r="${NS_R2}" xmlns:p="${NS_P2}"><p:cSld>${spTree}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  }
  function prepareInsertSlideWithLayout(archive, deck, sourceIndex, layoutPath) {
    const src = deck.slides[sourceIndex];
    if (!src) return null;
    if (!archive.readText(layoutPath)) return null;
    const layoutXml = archive.readText(layoutPath) ?? "";
    const layoutInfo = {
      path: layoutPath,
      name: parseLayoutName(layoutXml, ""),
      layoutType: parseLayoutType(layoutXml),
      placeholders: parseLayoutPlaceholders(layoutXml)
    };
    const newSlideXml = buildSlideXmlWithPlaceholders(layoutInfo.placeholders);
    const newPath = nextSlidePath(archive);
    archive.entries.set(newPath, Buffer.from(newSlideXml, "utf8"));
    const relTarget = `../${layoutPath.slice(4)}`;
    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${LAYOUT_REL_TYPE}" Target="${escapeXmlAttr(relTarget)}"/></Relationships>`;
    archive.entries.set(relsPathFor(newPath), Buffer.from(relsXml, "utf8"));
    const ctPath = "[Content_Types].xml";
    const ct = archive.readText(ctPath);
    if (ct && !ct.includes(`PartName="/${newPath}"`)) {
      archive.entries.set(
        ctPath,
        Buffer.from(
          ct.replace(
            "</Types>",
            `<Override PartName="/${newPath}" ContentType="${SLIDE_CONTENT_TYPE}"/></Types>`
          ),
          "utf8"
        )
      );
    }
    const presRelsPath = "ppt/_rels/presentation.xml.rels";
    const presPath = "ppt/presentation.xml";
    const presRels = archive.readText(presRelsPath);
    const pres = archive.readText(presPath);
    if (!presRels || !pres) return null;
    let maxRid = 0;
    for (const m of presRels.matchAll(/Id="rId(\d+)"/g)) maxRid = Math.max(maxRid, Number(m[1]));
    const newRid = `rId${maxRid + 1}`;
    const relEntry = `<Relationship Id="${newRid}" Type="${SLIDE_REL_TYPE}" Target="${newPath.slice("ppt/".length)}"/>`;
    archive.entries.set(
      presRelsPath,
      Buffer.from(presRels.replace("</Relationships>", `${relEntry}</Relationships>`), "utf8")
    );
    let maxSldId = 255;
    for (const m of pres.matchAll(/<p:sldId\s[^>]*\bid="(\d+)"/g))
      maxSldId = Math.max(maxSldId, Number(m[1]));
    const newSldTag = `<p:sldId id="${maxSldId + 1}" r:id="${newRid}"/>`;
    const srcRid = [...archive.readRels(presPath).values()].find(
      (r) => resolveTarget(presPath, r.target) === src.path
    )?.id;
    const srcTag = srcRid ? new RegExp(`<p:sldId\\s[^>]*r:id="${srcRid}"[^>]*/>`).exec(pres)?.[0] : void 0;
    const nextPres = srcTag ? pres.replace(srcTag, `${srcTag}${newSldTag}`) : pres.replace("</p:sldIdLst>", `${newSldTag}</p:sldIdLst>`);
    archive.entries.set(presPath, Buffer.from(nextPres, "utf8"));
    return newPath;
  }

  // ../engine/pptx-engine/slide-transfer.ts
  var LAYOUT_REL = "/slideLayout";
  var NOTES_REL = "/notesSlide";
  function extOf(path) {
    const dot = path.lastIndexOf(".");
    return dot < 0 ? "" : path.slice(dot + 1).toLowerCase();
  }
  function overrideContentType(ct, partPath) {
    if (!ct) return void 0;
    const re = new RegExp(
      `<Override[^>]*PartName="/${partPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*ContentType="([^"]+)"`
    );
    return re.exec(ct)?.[1];
  }
  function defaultContentType(ct, ext) {
    if (!ct) return void 0;
    return new RegExp(`<Default[^>]*Extension="${ext}"[^>]*ContentType="([^"]+)"`, "i").exec(ct)?.[1];
  }
  function collectPart(archive, partPath, parts, contentTypes) {
    if (parts[partPath]) return;
    const bytes = archive.readBytes(partPath);
    if (!bytes) return;
    parts[partPath] = Buffer.from(bytes).toString("base64");
    const ct = archive.readText("[Content_Types].xml");
    const override = overrideContentType(ct, partPath);
    if (override) contentTypes[partPath] = override;
    else {
      const ext = extOf(partPath);
      const dflt = defaultContentType(ct, ext);
      if (ext && dflt) contentTypes[ext] = dflt;
    }
    const relsPath = relsPathFor(partPath);
    const relsXml = archive.readText(relsPath);
    if (!relsXml) return;
    parts[relsPath] = Buffer.from(relsXml, "utf8").toString("base64");
    for (const rel of archive.readRels(partPath).values()) {
      if (rel.targetMode === "External") continue;
      collectPart(archive, resolveTarget(partPath, rel.target), parts, contentTypes);
    }
  }
  function layoutNameOf(archive, layoutPath) {
    const xml = archive.readText(layoutPath);
    return xml ? /<p:cSld[^>]*\sname="([^"]*)"/.exec(xml)?.[1] : void 0;
  }
  function collectSlideBundle(archive, slidePath, slideXml) {
    const parts = {};
    const contentTypes = {};
    const rels = [];
    let layoutName;
    for (const rel of archive.readRels(slidePath).values()) {
      if (rel.type.endsWith(NOTES_REL)) continue;
      if (rel.targetMode === "External") {
        rels.push({ id: rel.id, type: rel.type, target: rel.target, external: true });
        continue;
      }
      const absolute = resolveTarget(slidePath, rel.target);
      if (rel.type.endsWith(LAYOUT_REL)) {
        layoutName = layoutNameOf(archive, absolute);
        rels.push({ id: rel.id, type: rel.type, target: absolute, layout: true });
        continue;
      }
      collectPart(archive, absolute, parts, contentTypes);
      rels.push({ id: rel.id, type: rel.type, target: absolute });
    }
    let slideSize;
    try {
      slideSize = archive.readPresentation().size;
    } catch {
    }
    let chain;
    const c = archive.resolveSlideChain(slidePath);
    if (c.layoutPath && c.masterPath) {
      const chainParts = {};
      const chainCT = {};
      collectPart(archive, c.layoutPath, chainParts, chainCT);
      chain = {
        layoutPath: c.layoutPath,
        masterPath: c.masterPath,
        ...c.themePath ? { themePath: c.themePath } : {},
        parts: chainParts,
        contentTypes: chainCT
      };
    }
    return {
      slideXml,
      rels,
      parts,
      contentTypes,
      layoutName,
      ...slideSize ? { slideSize } : {},
      ...chain ? { chain } : {}
    };
  }
  function freePath(archive, sourcePath, taken) {
    const slash = sourcePath.lastIndexOf("/");
    const dir = sourcePath.slice(0, slash);
    const file = sourcePath.slice(slash + 1);
    const dot = file.lastIndexOf(".");
    const stem = dot < 0 ? file : file.slice(0, dot);
    const ext = dot < 0 ? "" : file.slice(dot);
    const base = /^(.*?)(\d+)$/.exec(stem)?.[1] ?? stem;
    for (let n = 1; ; n += 1) {
      const candidate = `${dir}/${base}${n}${ext}`;
      if (!archive.has(candidate) && !taken.has(candidate)) return candidate;
    }
  }
  function relative(fromPart, toPath) {
    const from = fromPart.slice(0, fromPart.lastIndexOf("/")).split("/").filter(Boolean);
    const to = toPath.split("/").filter(Boolean);
    let shared = 0;
    while (shared < from.length && shared < to.length && from[shared] === to[shared]) shared += 1;
    return [...Array.from({ length: from.length - shared }, () => ".."), ...to.slice(shared)].join(
      "/"
    );
  }
  function escapeAttr(value) {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
  }
  function listLayouts(archive) {
    const layouts = [];
    for (const path of archive.entries.keys()) {
      if (/^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(path)) {
        layouts.push({ path, name: layoutNameOf(archive, path) });
      }
    }
    return layouts;
  }
  function writeParts(archive, parts, contentTypes) {
    const pathMap = /* @__PURE__ */ new Map();
    const taken = /* @__PURE__ */ new Set();
    for (const sourcePath of Object.keys(parts)) {
      if (sourcePath.includes("/_rels/")) continue;
      const dest = archive.has(sourcePath) || taken.has(sourcePath) ? freePath(archive, sourcePath, taken) : sourcePath;
      taken.add(dest);
      pathMap.set(sourcePath, dest);
    }
    for (const [sourcePath, base64] of Object.entries(parts)) {
      if (sourcePath.includes("/_rels/")) continue;
      const targetPath = pathMap.get(sourcePath);
      if (!targetPath) continue;
      archive.entries.set(targetPath, new Uint8Array(Buffer.from(base64, "base64")));
      const sourceRels = parts[relsPathFor(sourcePath)];
      if (!sourceRels) continue;
      let relsXml = Buffer.from(sourceRels, "base64").toString("utf8");
      relsXml = relsXml.replaceAll(/Target="([^"]+)"/g, (whole, target) => {
        if (/^[a-z]+:/i.test(target)) return whole;
        const absolute = resolveTarget(sourcePath, target);
        const mapped = pathMap.get(absolute);
        return mapped ? `Target="${escapeAttr(relative(targetPath, mapped))}"` : whole;
      });
      archive.entries.set(relsPathFor(targetPath), new Uint8Array(Buffer.from(relsXml, "utf8")));
    }
    ensureContentTypes(archive, contentTypes, pathMap);
    return pathMap;
  }
  function materializeSlideBundle(archive, bundle, slidePath, layoutPath) {
    const pathMap = writeParts(archive, bundle.parts, bundle.contentTypes);
    const relLines = bundle.rels.map((rel) => {
      if (rel.layout) {
        return `<Relationship Id="${rel.id}" Type="${rel.type}" Target="${escapeAttr(relative(slidePath, layoutPath))}"/>`;
      }
      if (rel.external) {
        return `<Relationship Id="${rel.id}" Type="${rel.type}" Target="${escapeAttr(rel.target)}" TargetMode="External"/>`;
      }
      const mapped = pathMap.get(rel.target) ?? rel.target;
      return `<Relationship Id="${rel.id}" Type="${rel.type}" Target="${escapeAttr(relative(slidePath, mapped))}"/>`;
    });
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relLines.join("")}</Relationships>`;
  }
  function ensureContentTypes(archive, contentTypes, pathMap) {
    const ctPath = "[Content_Types].xml";
    let ct = archive.readText(ctPath);
    if (!ct) return;
    for (const [key, contentType] of Object.entries(contentTypes)) {
      if (key.includes("/")) {
        const targetPath = pathMap.get(key);
        if (!targetPath) continue;
        const override = `<Override PartName="/${targetPath}" ContentType="${contentType}"/>`;
        if (!ct.includes(`PartName="/${targetPath}"`))
          ct = ct.replace("</Types>", `${override}</Types>`);
      } else if (!new RegExp(`<Default[^>]*Extension="${key}"`, "i").test(ct)) {
        ct = ct.replace(
          "</Types>",
          `<Default Extension="${key}" ContentType="${contentType}"/></Types>`
        );
      }
    }
    archive.entries.set(ctPath, new Uint8Array(Buffer.from(ct, "utf8")));
  }
  var PRES_PATH = "ppt/presentation.xml";
  var MASTER_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster";
  function partText(parts, path) {
    const base64 = parts[path];
    return base64 == null ? null : Buffer.from(base64, "base64").toString("utf8");
  }
  function findIdenticalLayout(archive, masterXml, themeXml, layoutXml) {
    for (const path of archive.entries.keys()) {
      if (!/^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(path)) continue;
      if (archive.readText(path) !== masterXml) continue;
      const rels = [...archive.readRels(path).values()];
      if (themeXml != null) {
        const themeRel = rels.find((r) => r.type.endsWith("/theme"));
        const themePath = themeRel ? resolveTarget(path, themeRel.target) : null;
        if (!themePath || archive.readText(themePath) !== themeXml) continue;
      }
      for (const rel of rels) {
        if (!rel.type.endsWith(LAYOUT_REL)) continue;
        const layoutPath = resolveTarget(path, rel.target);
        if (archive.readText(layoutPath) === layoutXml) return layoutPath;
      }
    }
    return null;
  }
  function registerMaster(archive, masterPath) {
    const presRelsPath = relsPathFor(PRES_PATH);
    const pres = archive.readText(PRES_PATH);
    const presRels = archive.readText(presRelsPath);
    if (!pres || !presRels || !pres.includes("</p:sldMasterIdLst>")) return false;
    let maxRid = 0;
    for (const m of presRels.matchAll(/Id="rId(\d+)"/g)) maxRid = Math.max(maxRid, Number(m[1]));
    const rid = `rId${maxRid + 1}`;
    archive.entries.set(
      presRelsPath,
      Buffer.from(
        presRels.replace(
          "</Relationships>",
          `<Relationship Id="${rid}" Type="${MASTER_REL_TYPE}" Target="${escapeAttr(relative(PRES_PATH, masterPath))}"/></Relationships>`
        ),
        "utf8"
      )
    );
    let maxId = 2147483647;
    for (const m of pres.matchAll(/<p:sldMasterId\s[^>]*id="(\d+)"/g))
      maxId = Math.max(maxId, Number(m[1]));
    archive.entries.set(
      PRES_PATH,
      Buffer.from(
        pres.replace(
          "</p:sldMasterIdLst>",
          `<p:sldMasterId id="${maxId + 1}" r:id="${rid}"/></p:sldMasterIdLst>`
        ),
        "utf8"
      )
    );
    return true;
  }
  function importSourceLayout(archive, bundle) {
    const chain = bundle.chain;
    if (!chain) return null;
    const layoutXml = partText(chain.parts, chain.layoutPath);
    const masterXml = partText(chain.parts, chain.masterPath);
    if (layoutXml == null || masterXml == null) return null;
    const themeXml = chain.themePath ? partText(chain.parts, chain.themePath) : null;
    const existing = findIdenticalLayout(archive, masterXml, themeXml, layoutXml);
    if (existing) return existing;
    const pres = archive.readText(PRES_PATH);
    if (!pres || !pres.includes("</p:sldMasterIdLst>")) return null;
    const pathMap = writeParts(archive, chain.parts, chain.contentTypes);
    const masterPath = pathMap.get(chain.masterPath);
    const layoutPath = pathMap.get(chain.layoutPath);
    if (!masterPath || !layoutPath || !registerMaster(archive, masterPath)) return null;
    return layoutPath;
  }
  function chooseLayout(archive, bundle, neighbourSlidePath) {
    const layouts = listLayouts(archive);
    if (bundle.layoutName) {
      const byName = layouts.find((layout) => layout.name === bundle.layoutName);
      if (byName) return byName.path;
    }
    if (neighbourSlidePath) {
      const chain = archive.resolveSlideChain(neighbourSlidePath);
      if (chain.layoutPath) return chain.layoutPath;
    }
    return layouts[0]?.path ?? null;
  }

  // ../engine/pptx-engine/sections.ts
  init_stub_node();

  // ../engine/pptx-engine/notes.ts
  var XMLDECL3 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
  var NS_A3 = "http://schemas.openxmlformats.org/drawingml/2006/main";
  var NS_R3 = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  var NS_P3 = "http://schemas.openxmlformats.org/presentationml/2006/main";
  var REL_BASE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  var NOTES_SLIDE_REL = `${REL_BASE}/notesSlide`;
  var NOTES_MASTER_REL = `${REL_BASE}/notesMaster`;
  var SLIDE_REL = `${REL_BASE}/slide`;
  var THEME_REL = `${REL_BASE}/theme`;
  var NOTES_SLIDE_CT = "application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml";
  var NOTES_MASTER_CT = "application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml";
  function setEntry(archive, path, xml) {
    archive.entries.set(path, Buffer.from(xml, "utf8"));
  }
  function unescapeXml(s) {
    return s.replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d))).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  }
  function notesPathForSlide(archive, slidePath) {
    for (const rel of archive.readRels(slidePath).values()) {
      if (rel.type === NOTES_SLIDE_REL) return resolveTarget(slidePath, rel.target);
    }
    return null;
  }
  function findBodySp(xml) {
    for (const m of xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)) {
      if (/<p:ph\b[^>]*type="body"/.test(m[0])) {
        return { xml: m[0], start: m.index, end: m.index + m[0].length };
      }
    }
    return null;
  }
  function getSlideNotes(archive, slidePath) {
    const notesPath = notesPathForSlide(archive, slidePath);
    if (!notesPath) return "";
    const xml = archive.readText(notesPath);
    if (!xml) return "";
    const body = findBodySp(xml);
    if (!body) return "";
    const tx = /<p:txBody>([\s\S]*?)<\/p:txBody>/.exec(body.xml)?.[1];
    if (!tx) return "";
    const paras = [...tx.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map(
      (p) => [...p[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((t) => unescapeXml(t[1])).join("")
    );
    while (paras.length && paras[paras.length - 1] === "") paras.pop();
    return paras.join("\n");
  }
  function buildNotesTxBody(text) {
    const lines = text.split("\n");
    const paras = lines.every((l) => l === "") ? '<a:p><a:endParaRPr lang="zh-CN"/></a:p>' : lines.map(
      (line2) => line2 === "" ? '<a:p><a:endParaRPr lang="zh-CN"/></a:p>' : `<a:p><a:r><a:rPr lang="zh-CN" dirty="0"/><a:t>${escapeXmlText(line2)}</a:t></a:r></a:p>`
    ).join("");
    return `<p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody>`;
  }
  var NOTES_BODY_SP_OPEN = '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>';
  function setSlideNotes(opened, slideIndex, text) {
    const slide = opened.deck.slides[slideIndex];
    if (!slide) return false;
    const { archive } = opened;
    const notesPath = notesPathForSlide(archive, slide.path) ?? createNotesSlide(opened, slide.path);
    if (!notesPath) return false;
    const xml = archive.readText(notesPath);
    if (!xml) return false;
    const txBody = buildNotesTxBody(text);
    const body = findBodySp(xml);
    let next;
    if (body) {
      const patched = body.xml.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/, () => txBody);
      next = xml.slice(0, body.start) + patched + xml.slice(body.end);
    } else {
      next = xml.replace("</p:spTree>", `${NOTES_BODY_SP_OPEN}${txBody}</p:sp></p:spTree>`);
    }
    setEntry(archive, notesPath, next);
    return true;
  }
  function addContentTypeOverride(archive, partPath, contentType) {
    const ctPath = "[Content_Types].xml";
    const ct = archive.readText(ctPath);
    if (!ct || ct.includes(`PartName="/${partPath}"`)) return;
    setEntry(
      archive,
      ctPath,
      ct.replace("</Types>", `<Override PartName="/${partPath}" ContentType="${contentType}"/></Types>`)
    );
  }
  function appendRelationship(archive, partPath, type, target) {
    const relsPath = relsPathFor(partPath);
    let xml = archive.readText(relsPath) ?? XMLDECL3 + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    let maxRid = 0;
    for (const m of xml.matchAll(/Id="rId(\d+)"/g)) maxRid = Math.max(maxRid, Number(m[1]));
    const rid = `rId${maxRid + 1}`;
    xml = xml.replace(
      "</Relationships>",
      `<Relationship Id="${rid}" Type="${type}" Target="${target}"/></Relationships>`
    );
    setEntry(archive, relsPath, xml);
    return rid;
  }
  function ensureNotesMaster(archive) {
    for (const path2 of archive.entries.keys()) {
      if (/^ppt\/notesMasters\/notesMaster\d+\.xml$/.test(path2)) return path2;
    }
    const path = "ppt/notesMasters/notesMaster1.xml";
    const emptyTree = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>';
    const xml = XMLDECL3 + `<p:notesMaster xmlns:a="${NS_A3}" xmlns:r="${NS_R3}" xmlns:p="${NS_P3}"><p:cSld>${emptyTree}</p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:notesMaster>`;
    setEntry(archive, path, xml);
    addContentTypeOverride(archive, path, NOTES_MASTER_CT);
    const theme = [...archive.entries.keys()].find((p) => /^ppt\/theme\/theme\d+\.xml$/.test(p));
    if (theme) appendRelationship(archive, path, THEME_REL, `../${theme.slice(4)}`);
    const presPath = "ppt/presentation.xml";
    const pres = archive.readText(presPath);
    if (pres && !pres.includes("<p:notesMasterIdLst>")) {
      const rid = appendRelationship(archive, presPath, NOTES_MASTER_REL, "notesMasters/notesMaster1.xml");
      const lst = `<p:notesMasterIdLst><p:notesMasterId r:id="${rid}"/></p:notesMasterIdLst>`;
      const next = pres.includes("</p:sldMasterIdLst>") ? pres.replace("</p:sldMasterIdLst>", `</p:sldMasterIdLst>${lst}`) : pres.replace("<p:sldIdLst>", `${lst}<p:sldIdLst>`);
      setEntry(archive, presPath, next);
    }
    return path;
  }
  function createNotesSlide(opened, slidePath) {
    const { archive } = opened;
    if (!ensureNotesMaster(archive)) return null;
    let maxNum = 0;
    for (const path of archive.entries.keys()) {
      const m = /^ppt\/notesSlides\/notesSlide(\d+)\.xml$/.exec(path);
      if (m) maxNum = Math.max(maxNum, Number(m[1]));
    }
    const notesPath = `ppt/notesSlides/notesSlide${maxNum + 1}.xml`;
    const xml = XMLDECL3 + `<p:notes xmlns:a="${NS_A3}" xmlns:r="${NS_R3}" xmlns:p="${NS_P3}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>` + NOTES_BODY_SP_OPEN + '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="zh-CN"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>';
    setEntry(archive, notesPath, xml);
    addContentTypeOverride(archive, notesPath, NOTES_SLIDE_CT);
    const master = [...archive.entries.keys()].find((p) => /^ppt\/notesMasters\/notesMaster\d+\.xml$/.test(p));
    appendRelationship(archive, notesPath, NOTES_MASTER_REL, `../${master.slice(4)}`);
    appendRelationship(archive, notesPath, SLIDE_REL, `../${slidePath.slice(4)}`);
    appendRelationship(archive, slidePath, NOTES_SLIDE_REL, `../${notesPath.slice(4)}`);
    return notesPath;
  }

  // ../engine/pptx-engine/sections.ts
  var PRES_PATH2 = "ppt/presentation.xml";
  var SECTION_EXT_URI = "{521415D9-36F7-43E2-AB2F-B90AF26B5E84}";
  var P14_NS = "http://schemas.microsoft.com/office/powerpoint/2010/main";
  function newSectionId() {
    return `{${randomUUID().toUpperCase()}}`;
  }
  function range(start, end) {
    const out = [];
    for (let i = start; i < end; i++) out.push(i);
    return out;
  }
  function readSlideEntries(opened) {
    const { archive, deck } = opened;
    const pres = archive.readText(PRES_PATH2);
    if (!pres) return [];
    const inner = /<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/.exec(pres)?.[1] ?? "";
    const rels = archive.readRels(PRES_PATH2);
    const out = [];
    for (const m of inner.matchAll(/<p:sldId\b[^>]*\/>/g)) {
      const sldId = /\bid="(\d+)"/.exec(m[0])?.[1];
      const rId = /\br:id="([^"]+)"/.exec(m[0])?.[1];
      if (!sldId || !rId) continue;
      const rel = rels.get(rId);
      const path = rel ? resolveTarget(PRES_PATH2, rel.target) : void 0;
      const deckIndex = path ? deck.slides.findIndex((s) => s.path === path) : -1;
      out.push({ sldId, rId, deckIndex });
    }
    return out;
  }
  function getSections(opened) {
    const pres = opened.archive.readText(PRES_PATH2);
    if (!pres) return [];
    const lst = /<p14:sectionLst[^>]*>([\s\S]*?)<\/p14:sectionLst>/.exec(pres)?.[1];
    if (!lst) return [];
    const entries = readSlideEntries(opened);
    const bySldId = new Map(entries.map((e) => [e.sldId, e.deckIndex]));
    const byRid = new Map(entries.map((e) => [e.rId, e.deckIndex]));
    const out = [];
    for (const m of lst.matchAll(/<p14:section\b([^>]*?)(?:\/>|>([\s\S]*?)<\/p14:section>)/g)) {
      const attrs = m[1] ?? "";
      const inner = m[2] ?? "";
      const name = unescapeXml(/\bname="([^"]*)"/.exec(attrs)?.[1] ?? "");
      const id = /\bid="([^"]+)"/.exec(attrs)?.[1] ?? newSectionId();
      const slideIndices = [];
      for (const sm of inner.matchAll(/<p14:sldId\s[^>]*id="([^"]+)"/g)) {
        const idx = bySldId.get(sm[1]) ?? byRid.get(sm[1]) ?? -1;
        if (idx >= 0) slideIndices.push(idx);
      }
      out.push({ id, name, slideIndices });
    }
    return out;
  }
  function setSections(opened, sections) {
    const { archive } = opened;
    const pres = archive.readText(PRES_PATH2);
    if (!pres) return;
    const byIndex = new Map(readSlideEntries(opened).map((e) => [e.deckIndex, e.sldId]));
    let next = pres.replace(
      /<p:ext\b[^>]*>\s*<p14:sectionLst[\s\S]*?<\/p14:sectionLst>\s*<\/p:ext>/,
      ""
    );
    next = next.replace(/<p:extLst>\s*<\/p:extLst>/, "");
    if (sections.length) {
      const secXml = sections.map((s) => {
        const ids = s.slideIndices.map((i) => byIndex.get(i)).filter((v) => v != null);
        const lst = ids.length ? `<p14:sldIdLst>${ids.map((id) => `<p14:sldId id="${id}"/>`).join("")}</p14:sldIdLst>` : "<p14:sldIdLst/>";
        return `<p14:section name="${escapeXmlAttr(s.name)}" id="${s.id || newSectionId()}">${lst}</p14:section>`;
      }).join("");
      const ext = `<p:ext uri="${SECTION_EXT_URI}"><p14:sectionLst xmlns:p14="${P14_NS}">${secXml}</p14:sectionLst></p:ext>`;
      if (/<\/p:extLst>/.test(next)) {
        next = next.replace("</p:extLst>", `${ext}</p:extLst>`);
      } else if (/<p:extLst\/>/.test(next)) {
        next = next.replace("<p:extLst/>", `<p:extLst>${ext}</p:extLst>`);
      } else {
        next = next.replace("</p:presentation>", `<p:extLst>${ext}</p:extLst></p:presentation>`);
      }
    }
    archive.entries.set(PRES_PATH2, Buffer.from(next, "utf8"));
  }
  function normalizeSections(sections, total) {
    if (!sections.length) return { lead: range(0, total), starts: [], sections: [] };
    const starts = new Array(sections.length);
    let nextStart = total;
    for (let i = sections.length - 1; i >= 0; i--) {
      const own = sections[i].slideIndices.length ? Math.min(...sections[i].slideIndices) : nextStart;
      starts[i] = Math.min(own, nextStart);
      nextStart = starts[i];
    }
    const norm = sections.map((s, i) => ({
      ...s,
      slideIndices: range(starts[i], i + 1 < sections.length ? starts[i + 1] : total)
    }));
    return { lead: range(0, starts[0]), starts, sections: norm };
  }
  function addSection(opened, atSlideIndex, name) {
    const total = opened.deck.slides.length;
    if (atSlideIndex < 0 || atSlideIndex >= total) return null;
    const cur = getSections(opened);
    const newSec = { id: newSectionId(), name, slideIndices: [] };
    let next;
    if (!cur.length) {
      next = [];
      if (atSlideIndex > 0)
        next.push({
          id: newSectionId(),
          name: "Default Section",
          slideIndices: range(0, atSlideIndex)
        });
      newSec.slideIndices = range(atSlideIndex, total);
      next.push(newSec);
    } else {
      const { starts, sections } = normalizeSections(cur, total);
      if (atSlideIndex < starts[0]) {
        newSec.slideIndices = range(atSlideIndex, starts[0]);
        next = [newSec, ...sections];
      } else {
        let g = sections.length - 1;
        for (let i = 0; i < sections.length; i++) {
          const end2 = i + 1 < sections.length ? starts[i + 1] : total;
          if (atSlideIndex >= starts[i] && atSlideIndex < end2) {
            g = i;
            break;
          }
        }
        const end = g + 1 < sections.length ? starts[g + 1] : total;
        newSec.slideIndices = range(atSlideIndex, end);
        const gSec = { ...sections[g], slideIndices: range(starts[g], atSlideIndex) };
        next = [...sections.slice(0, g), gSec, newSec, ...sections.slice(g + 1)];
      }
    }
    setSections(opened, next);
    return getSections(opened);
  }
  function renameSection(opened, id, name) {
    const cur = getSections(opened);
    const s = cur.find((x) => x.id === id);
    if (!s) return null;
    s.name = name;
    setSections(opened, cur);
    return getSections(opened);
  }
  function removeSection(opened, id, _opts) {
    const total = opened.deck.slides.length;
    const cur = getSections(opened);
    const i = cur.findIndex((x) => x.id === id);
    if (i < 0) return null;
    const { sections } = normalizeSections(cur, total);
    const removed = sections.splice(i, 1)[0];
    if (sections.length) {
      if (i > 0) {
        sections[i - 1].slideIndices = [...sections[i - 1].slideIndices, ...removed.slideIndices];
      } else {
        sections[0].slideIndices = [...removed.slideIndices, ...sections[0].slideIndices];
      }
    }
    setSections(opened, sections);
    return getSections(opened);
  }
  function moveSlide(opened, fromIndex, toIndex) {
    const { deck, archive } = opened;
    const total = deck.slides.length;
    if (fromIndex < 0 || fromIndex >= total) return false;
    const to = Math.max(0, Math.min(toIndex, total - 1));
    if (fromIndex === to) return false;
    const cur = getSections(opened);
    let labels = null;
    if (cur.length) {
      const { sections } = normalizeSections(cur, total);
      labels = new Array(total).fill(-1);
      sections.forEach((s, si) => {
        for (const i of s.slideIndices) labels[i] = si;
      });
    }
    const pres = archive.readText(PRES_PATH2);
    if (!pres) return false;
    const m = /<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/.exec(pres);
    if (!m) return false;
    const tags = [...m[1].matchAll(/<p:sldId\b[^>]*\/>/g)].map((t) => t[0]);
    if (tags.length !== total) return false;
    const [tag] = tags.splice(fromIndex, 1);
    tags.splice(to, 0, tag);
    archive.entries.set(
      PRES_PATH2,
      Buffer.from(pres.replace(m[0], `<p:sldIdLst>${tags.join("")}</p:sldIdLst>`), "utf8")
    );
    const [slide] = deck.slides.splice(fromIndex, 1);
    deck.slides.splice(to, 0, slide);
    if (labels) {
      labels.splice(fromIndex, 1);
      const adopt = to < labels.length ? labels[to] : labels[labels.length - 1] ?? -1;
      labels.splice(to, 0, adopt);
      const rebuilt = cur.map((s, si) => ({
        ...s,
        slideIndices: labels.flatMap((l, pos) => l === si ? [pos] : [])
      }));
      setSections(opened, rebuilt);
    }
    return true;
  }
  function moveSection(opened, id, dir) {
    const { deck, archive } = opened;
    const total = deck.slides.length;
    const cur = getSections(opened);
    const idx = cur.findIndex((s) => s.id === id);
    if (idx < 0) return null;
    const j = dir === "up" ? idx - 1 : idx + 1;
    if (j < 0 || j >= cur.length) return null;
    const { lead, sections } = normalizeSections(cur, total);
    const order = [...sections];
    [order[idx], order[j]] = [order[j], order[idx]];
    const newOldOrder = [...lead, ...order.flatMap((s) => s.slideIndices)];
    if (newOldOrder.length !== total) return null;
    const pres = archive.readText(PRES_PATH2);
    if (!pres) return null;
    const m = /<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/.exec(pres);
    if (!m) return null;
    const tags = [...m[1].matchAll(/<p:sldId\b[^>]*\/>/g)].map((t) => t[0]);
    if (tags.length !== total) return null;
    const newInner = newOldOrder.map((i) => tags[i]).join("");
    archive.entries.set(
      PRES_PATH2,
      Buffer.from(pres.replace(m[0], `<p:sldIdLst>${newInner}</p:sldIdLst>`), "utf8")
    );
    deck.slides = newOldOrder.map((i) => deck.slides[i]);
    let pos = lead.length;
    const rebuilt = order.map((s) => {
      const indices = range(pos, pos + s.slideIndices.length);
      pos += s.slideIndices.length;
      return { ...s, slideIndices: indices };
    });
    setSections(opened, rebuilt);
    return getSections(opened);
  }

  // ../engine/pptx-engine/background-promote.ts
  var EMU_PER_PX = 9525;
  var COVER_TOL = 2 * EMU_PER_PX;
  function coversPage(t, size, maxAreaRatio) {
    const o = t.offset;
    return o.x <= COVER_TOL && o.y <= COVER_TOL && o.x + o.cx >= size.cx - COVER_TOL && o.y + o.cy >= size.cy - COVER_TOL && o.cx * o.cy <= size.cx * size.cy * maxAreaRatio;
  }
  function isOpaqueColor(c) {
    return /^#?[0-9a-fA-F]{6}$/.test(c) || /^#?[0-9a-fA-F]{6}[fF]{2}$/.test(c);
  }
  function strokeInvisible(stroke) {
    if (!stroke || stroke.width === 0 || stroke.fill.type === "none") return true;
    return stroke.fill.type === "solid" && (stroke.fill.color === "none" || /^#?[0-9a-fA-F]{6}00$/.test(stroke.fill.color));
  }
  function hasVisibleText(el) {
    return !!el.text?.paragraphs.some((p) => p.runs.some((r) => r.text.trim() !== ""));
  }
  function isPromotableBackgroundShape(el, size) {
    if (el.type !== "shape" && el.type !== "text") return false;
    const t = el;
    const tr = el.transform;
    return !el.placeholder && tr.rot === 0 && !tr.flipH && !tr.flipV && coversPage(tr, size, 1.05) && (t.presetGeometry ?? "rect") === "rect" && !t.customGeometry && t.fill?.type === "solid" && isOpaqueColor(t.fill.color) && strokeInvisible(t.stroke) && !t.shadow && !t.glow && !hasVisibleText(t);
  }
  function isReferencedByTiming(slide, el) {
    const id = elementSpid(el);
    if (id == null) return true;
    const ref = `spid="${id}"`;
    return slide.bodySuffix.includes(ref) || slide.bodyPrefix.includes(ref);
  }
  function promoteSlideBackground(slide, size) {
    const leading = [];
    for (const el of slide.elements) {
      if (!isPromotableBackgroundShape(el, size) || isReferencedByTiming(slide, el)) break;
      leading.push(el);
    }
    if (leading.length === 0) return false;
    const fill = leading[leading.length - 1].fill;
    if (fill?.type !== "solid") return false;
    slide.elements.splice(0, leading.length);
    slide.bodyPrefix = patchSlideBackgroundXml(slide.bodyPrefix, fill.color);
    slide.background = { type: "solid", color: fill.color };
    slide.structureDirty = true;
    return true;
  }
  function isBackgroundLikeElement(el, size) {
    if (el.placeholder || el.transform.rot !== 0) return false;
    if (!coversPage(el.transform, size, 1.5)) return false;
    if (el.type === "picture") {
      const p = el;
      return !p.media && strokeInvisible(p.stroke);
    }
    if (el.type !== "shape" && el.type !== "text") return false;
    const t = el;
    const fillKind = t.fill?.type;
    return (fillKind === "solid" || fillKind === "gradient" || fillKind === "image") && (t.presetGeometry ?? "rect") === "rect" && !t.customGeometry && strokeInvisible(t.stroke) && !hasVisibleText(t);
  }

  // ../engine/pptx-engine/theme-apply.ts
  var SCHEME_KEYS = [
    "dk1",
    "lt1",
    "dk2",
    "lt2",
    "accent1",
    "accent2",
    "accent3",
    "accent4",
    "accent5",
    "accent6",
    "hlink",
    "folHlink"
  ];
  var hex62 = (c) => c.replace(/^#/, "").slice(0, 6).toUpperCase();
  function patchThemeXml(xml, spec) {
    let out = xml;
    for (const key of SCHEME_KEYS) {
      const color = spec.colors[key];
      if (!color) continue;
      out = out.replace(
        new RegExp(`<a:${key}>[\\s\\S]*?</a:${key}>`),
        `<a:${key}><a:srgbClr val="${hex62(color)}"/></a:${key}>`
      );
    }
    out = out.replace(/(<a:clrScheme name=")[^"]*(")/, `$1${escapeXmlAttr(spec.name)}$2`);
    if (spec.majorFont) {
      out = out.replace(
        /(<a:majorFont>[\s\S]*?<a:latin[^>]*typeface=")[^"]*(")/,
        `$1${escapeXmlAttr(spec.majorFont)}$2`
      );
    }
    if (spec.minorFont) {
      out = out.replace(
        /(<a:minorFont>[\s\S]*?<a:latin[^>]*typeface=")[^"]*(")/,
        `$1${escapeXmlAttr(spec.minorFont)}$2`
      );
    }
    return out;
  }
  var THEME_PART_RE = /^ppt\/theme\/theme\d+\.xml$/;
  function applyThemeToArchive(opened, spec) {
    const { archive } = opened;
    let patched = 0;
    for (const path of [...archive.entries.keys()]) {
      if (!THEME_PART_RE.test(path)) continue;
      const xml = archive.readText(path);
      if (!xml) continue;
      const next = patchThemeXml(xml, spec);
      if (next !== xml) {
        archive.entries.set(path, Buffer.from(next, "utf8"));
        patched++;
      }
    }
    return patched;
  }
  function hexToHsl(hex) {
    const h6 = hex.replace(/^#/, "");
    const r = (parseInt(h6.slice(0, 2), 16) || 0) / 255;
    const g = (parseInt(h6.slice(2, 4), 16) || 0) / 255;
    const b = (parseInt(h6.slice(4, 6), 16) || 0) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) return { h: 0, s: 0, l };
    const s = d / (1 - Math.abs(2 * l - 1));
    let h;
    if (max === r) h = 60 * ((g - b) / d % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
    return { h, s: Math.min(1, s), l };
  }
  function hslToHex({ h, s, l }) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(h / 60 % 2 - 1));
    const m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    const to255 = (v) => Math.max(0, Math.min(255, Math.round((v + m) * 255)));
    return [to255(r), to255(g), to255(b)].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
  }
  var hueDist = (a, b) => {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  };
  var isNeutral = ({ s, l }) => s < 0.15 || l > 0.95 || l < 0.07;
  var SRGB_RE = /<a:srgbClr val="([0-9A-Fa-f]{6})"/g;
  function collectExplicitColors(xmls) {
    const counts = /* @__PURE__ */ new Map();
    for (const xml of xmls) {
      for (const m of xml.matchAll(SRGB_RE)) {
        const hex = m[1].toUpperCase();
        counts.set(hex, (counts.get(hex) ?? 0) + 1);
      }
    }
    return counts;
  }
  function buildColorMap(counts, spec) {
    const neutralFor = (l) => {
      const key = l > 0.85 ? "lt1" : l > 0.55 ? "lt2" : l > 0.28 ? "dk2" : "dk1";
      return hex62(spec.colors[key] ?? (l > 0.5 ? "FFFFFF" : "000000"));
    };
    const accents = [1, 2, 3, 4, 5, 6].map((i) => spec.colors[`accent${i}`]).filter((c) => !!c).map((c) => hexToHsl(c));
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const clusters = [];
    const map = /* @__PURE__ */ new Map();
    for (const [hex] of sorted) {
      const hsl = hexToHsl(hex);
      let out;
      if (isNeutral(hsl)) {
        out = neutralFor(hsl.l);
      } else if (accents.length === 0) {
        continue;
      } else {
        let idx = clusters.findIndex((c) => hueDist(c.hue, hsl.h) <= 35);
        if (idx < 0) {
          clusters.push({ hue: hsl.h });
          idx = clusters.length - 1;
        }
        const target = accents[idx % accents.length];
        out = hslToHex({ h: target.h, s: target.s, l: hsl.l });
      }
      if (out !== hex) map.set(hex, out);
    }
    return map;
  }
  function recolorXml(xml, map) {
    if (map.size === 0) return xml;
    return xml.replace(SRGB_RE, (full, hex) => {
      const to = map.get(hex.toUpperCase());
      return to ? full.replace(hex, to) : full;
    });
  }
  function remapDeckColors(opened, spec) {
    const { archive, deck } = opened;
    const paths = deck.slides.map((s) => s.path);
    const xmls = paths.map((p) => archive.readText(p)).filter((x) => !!x);
    const map = buildColorMap(collectExplicitColors(xmls), spec);
    if (map.size === 0) return 0;
    for (const path of paths) {
      const xml = archive.readText(path);
      if (!xml) continue;
      const next = recolorXml(xml, map);
      if (next !== xml) archive.entries.set(path, Buffer.from(next, "utf8"));
    }
    return map.size;
  }

  // ../engine/pptx-engine/builtin-layouts.ts
  var XMLDECL4 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
  var NS_A4 = "http://schemas.openxmlformats.org/drawingml/2006/main";
  var NS_R4 = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  var NS_P4 = "http://schemas.openxmlformats.org/presentationml/2006/main";
  var MASTER_REL_TYPE2 = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster";
  var LAYOUT_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml";
  var BUILTIN_LAYOUT_PREFIX = "builtin:";
  var BASE_CX = 12192e3;
  var BASE_CY = 6858e3;
  var TITLE = { type: "title", x: 838200, y: 365125, cx: 10515600, cy: 1325563 };
  var BODY = { type: "body", idx: "1", x: 838200, y: 1825625, cx: 10515600, cy: 4351338 };
  var BUILTIN_LAYOUTS = [
    {
      key: "titleSlide",
      name: "Title Slide",
      type: "title",
      placeholders: [
        { type: "ctrTitle", x: 1524e3, y: 1122363, cx: 9144e3, cy: 2387600 },
        { type: "subTitle", idx: "1", x: 1524e3, y: 3602038, cx: 9144e3, cy: 1655762 }
      ]
    },
    { key: "titleContent", name: "Title and Content", type: "obj", placeholders: [TITLE, BODY] },
    {
      key: "sectionHeader",
      name: "Section Header",
      type: "secHead",
      placeholders: [
        { type: "title", x: 831850, y: 4589463, cx: 10515600, cy: 1500187 },
        { type: "body", idx: "1", x: 831850, y: 1709738, cx: 10515600, cy: 2852737 }
      ]
    },
    {
      key: "twoContent",
      name: "Two Content",
      type: "twoObj",
      placeholders: [
        TITLE,
        { type: "body", idx: "1", x: 838200, y: 1825625, cx: 5157787, cy: 4351338 },
        { type: "body", idx: "2", x: 6172200, y: 1825625, cx: 5181600, cy: 4351338 }
      ]
    },
    { key: "titleOnly", name: "Title Only", type: "titleOnly", placeholders: [TITLE] },
    { key: "blank", name: "Blank", type: "blank", placeholders: [] }
  ];
  function scalePh(ph, size) {
    const sx = (v) => Math.round(v / BASE_CX * size.cx);
    const sy = (v) => Math.round(v / BASE_CY * size.cy);
    return {
      type: ph.type,
      idx: ph.idx ?? "",
      x: sx(ph.x),
      y: sy(ph.y),
      cx: sx(ph.cx),
      cy: sy(ph.cy),
      hint: PH_HINT_MAP[ph.type] ?? "Click to add text"
    };
  }
  function shouldOfferBuiltinLayouts(layouts) {
    const names = new Set(BUILTIN_LAYOUTS.map((d) => d.name));
    return !layouts.some((l) => l.placeholders.length && !names.has(l.name));
  }
  function builtinLayoutInfos(size, existingNames) {
    return BUILTIN_LAYOUTS.filter((d) => !existingNames.has(d.name)).map((d) => ({
      path: `${BUILTIN_LAYOUT_PREFIX}${d.key}`,
      name: d.name,
      layoutType: d.type,
      placeholders: d.placeholders.map((ph) => scalePh(ph, size))
    }));
  }
  var EMPTY_SPTREE3 = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
  function buildLayoutXml(def, size) {
    const shapes = def.placeholders.map((ph, i) => placeholderSpXml(scalePh(ph, size), i + 2));
    return XMLDECL4 + `<p:sldLayout xmlns:a="${NS_A4}" xmlns:r="${NS_R4}" xmlns:p="${NS_P4}" type="${def.type}"><p:cSld name="${def.name}"><p:spTree>${EMPTY_SPTREE3}${shapes.join("")}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
  }
  function findMasterPath(archive) {
    for (const path of archive.entries.keys()) {
      if (!/^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(path)) continue;
      for (const rel of archive.readRels(path).values()) {
        if (rel.type === MASTER_REL_TYPE2) return resolveTarget(path, rel.target);
      }
    }
    const masters = [...archive.entries.keys()].filter((p) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(p)).sort();
    return masters[0] ?? null;
  }
  function ensureBuiltinLayout(archive, size, key) {
    const def = BUILTIN_LAYOUTS.find((d) => d.key === key);
    if (!def) return null;
    const existing = listSlideLayouts(archive).find((l) => l.name === def.name);
    if (existing) return existing.path;
    const masterPath = findMasterPath(archive);
    if (!masterPath) return null;
    const masterXml = archive.readText(masterPath);
    const masterRelsPath = relsPathFor(masterPath);
    const masterRels = archive.readText(masterRelsPath);
    if (!masterXml || !masterRels) return null;
    let maxLayout = 0;
    for (const p of archive.entries.keys()) {
      const m = /^ppt\/slideLayouts\/slideLayout(\d+)\.xml$/.exec(p);
      if (m) maxLayout = Math.max(maxLayout, parseInt(m[1], 10));
    }
    const layoutPath = `ppt/slideLayouts/slideLayout${maxLayout + 1}.xml`;
    archive.entries.set(layoutPath, Buffer.from(buildLayoutXml(def, size), "utf8"));
    const layoutRels = XMLDECL4 + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${MASTER_REL_TYPE2}" Target="../slideMasters/${masterPath.slice("ppt/slideMasters/".length)}"/></Relationships>`;
    archive.entries.set(relsPathFor(layoutPath), Buffer.from(layoutRels, "utf8"));
    const ctPath = "[Content_Types].xml";
    const ct = archive.readText(ctPath);
    if (ct && !ct.includes(`PartName="/${layoutPath}"`)) {
      archive.entries.set(
        ctPath,
        Buffer.from(
          ct.replace(
            "</Types>",
            `<Override PartName="/${layoutPath}" ContentType="${LAYOUT_CONTENT_TYPE}"/></Types>`
          ),
          "utf8"
        )
      );
    }
    let maxRid = 0;
    for (const m of masterRels.matchAll(/Id="rId(\d+)"/g)) maxRid = Math.max(maxRid, Number(m[1]));
    const rid = `rId${maxRid + 1}`;
    archive.entries.set(
      masterRelsPath,
      Buffer.from(
        masterRels.replace(
          "</Relationships>",
          `<Relationship Id="${rid}" Type="${LAYOUT_REL_TYPE}" Target="../slideLayouts/${layoutPath.slice("ppt/slideLayouts/".length)}"/></Relationships>`
        ),
        "utf8"
      )
    );
    let maxId = 2147483648;
    for (const m of masterXml.matchAll(/<p:sldLayoutId\s[^>]*\bid="(\d+)"/g))
      maxId = Math.max(maxId, Number(m[1]));
    const idTag = `<p:sldLayoutId id="${maxId + 1}" r:id="${rid}"/>`;
    const nextMaster = masterXml.includes("</p:sldLayoutIdLst>") ? masterXml.replace("</p:sldLayoutIdLst>", `${idTag}</p:sldLayoutIdLst>`) : masterXml.replace(/(<p:clrMap\b[^>]*\/>)/, `$1<p:sldLayoutIdLst>${idTag}</p:sldLayoutIdLst>`);
    archive.entries.set(masterPath, Buffer.from(nextMaster, "utf8"));
    return layoutPath;
  }

  // ../engine/pptx-engine/comments.ts
  var XMLDECL5 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
  var NS_P5 = "http://schemas.openxmlformats.org/presentationml/2006/main";
  var REL_BASE2 = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  var COMMENTS_REL = `${REL_BASE2}/comments`;
  var AUTHORS_REL = `${REL_BASE2}/commentAuthors`;
  var COMMENTS_CT = "application/vnd.openxmlformats-officedocument.presentationml.comments+xml";
  var AUTHORS_CT = "application/vnd.openxmlformats-officedocument.presentationml.commentAuthors+xml";
  var AUTHORS_PATH = "ppt/commentAuthors.xml";
  function setEntry2(archive, path, xml) {
    archive.entries.set(path, Buffer.from(xml, "utf8"));
  }
  function addContentTypeOverride2(archive, partPath, contentType) {
    const ctPath = "[Content_Types].xml";
    const ct = archive.readText(ctPath);
    if (!ct || ct.includes(`PartName="/${partPath}"`)) return;
    setEntry2(
      archive,
      ctPath,
      ct.replace(
        "</Types>",
        `<Override PartName="/${partPath}" ContentType="${contentType}"/></Types>`
      )
    );
  }
  function readAuthors(archive) {
    const map = /* @__PURE__ */ new Map();
    const xml = archive.readText(AUTHORS_PATH);
    if (!xml) return map;
    for (const m of xml.matchAll(/<p:cmAuthor\b([^>]*)\/>/g)) {
      const attrs = m[1];
      const id = Number(/\bid="(\d+)"/.exec(attrs)?.[1] ?? -1);
      if (id < 0) continue;
      map.set(id, {
        name: unescapeXml(/\bname="([^"]*)"/.exec(attrs)?.[1] ?? ""),
        initials: unescapeXml(/\binitials="([^"]*)"/.exec(attrs)?.[1] ?? "")
      });
    }
    return map;
  }
  function commentsPathForSlide(archive, slidePath) {
    for (const rel of archive.readRels(slidePath).values()) {
      if (rel.type === COMMENTS_REL) return resolveTarget(slidePath, rel.target);
    }
    return null;
  }
  function getSlideComments(archive, slidePath) {
    const partPath = commentsPathForSlide(archive, slidePath);
    if (!partPath) return [];
    const xml = archive.readText(partPath);
    if (!xml) return [];
    const authors = readAuthors(archive);
    const out = [];
    for (const m of xml.matchAll(/<p:cm\b([^>]*)>([\s\S]*?)<\/p:cm>/g)) {
      const attrs = m[1];
      const authorId = Number(/\bauthorId="(\d+)"/.exec(attrs)?.[1] ?? 0);
      const a = authors.get(authorId);
      out.push({
        authorId,
        author: a?.name ?? "Unknown author",
        initials: a?.initials ?? "",
        dt: /\bdt="([^"]*)"/.exec(attrs)?.[1] ?? "",
        idx: Number(/\bidx="(\d+)"/.exec(attrs)?.[1] ?? 0),
        text: unescapeXml(/<p:text>([\s\S]*?)<\/p:text>/.exec(m[2])?.[1] ?? "")
      });
    }
    return out;
  }
  function ensureAuthor(archive, name, initials) {
    let xml = archive.readText(AUTHORS_PATH);
    if (!xml) {
      xml = XMLDECL5 + `<p:cmAuthorLst xmlns:p="${NS_P5}"></p:cmAuthorLst>`;
      addContentTypeOverride2(archive, AUTHORS_PATH, AUTHORS_CT);
      appendRelationship(archive, "ppt/presentation.xml", AUTHORS_REL, "commentAuthors.xml");
    }
    for (const m of xml.matchAll(/<p:cmAuthor\b([^>]*)\/>/g)) {
      const attrs = m[1];
      if (unescapeXml(/\bname="([^"]*)"/.exec(attrs)?.[1] ?? "") !== name) continue;
      const authorId2 = Number(/\bid="(\d+)"/.exec(attrs)?.[1] ?? 0);
      const lastIdx = Number(/\blastIdx="(\d+)"/.exec(attrs)?.[1] ?? 0);
      const nextIdx = lastIdx + 1;
      const bumped = m[0].includes('lastIdx="') ? m[0].replace(/\blastIdx="\d+"/, `lastIdx="${nextIdx}"`) : m[0].replace("/>", ` lastIdx="${nextIdx}"/>`);
      setEntry2(archive, AUTHORS_PATH, xml.replace(m[0], bumped));
      return { authorId: authorId2, nextIdx };
    }
    let maxId = -1;
    for (const m of xml.matchAll(/<p:cmAuthor\b[^>]*\bid="(\d+)"/g))
      maxId = Math.max(maxId, Number(m[1]));
    const authorId = maxId + 1;
    const tag = `<p:cmAuthor id="${authorId}" name="${escapeXmlAttr(name)}" initials="${escapeXmlAttr(initials)}" lastIdx="1" clrIdx="${authorId}"/>`;
    setEntry2(archive, AUTHORS_PATH, xml.replace("</p:cmAuthorLst>", `${tag}</p:cmAuthorLst>`));
    return { authorId, nextIdx: 1 };
  }
  function addSlideComment(opened, slideIndex, opts) {
    const slide = opened.deck.slides[slideIndex];
    if (!slide) return null;
    const { archive } = opened;
    const initials = opts.initials ?? opts.author.split(/\s+/).map((w) => w[0] ?? "").join("").toUpperCase() ?? "";
    const { authorId, nextIdx } = ensureAuthor(archive, opts.author, initials);
    let partPath = commentsPathForSlide(archive, slide.path);
    if (!partPath) {
      let maxNum = 0;
      for (const path of archive.entries.keys()) {
        const m = /^ppt\/comments\/comment(\d+)\.xml$/.exec(path);
        if (m) maxNum = Math.max(maxNum, Number(m[1]));
      }
      partPath = `ppt/comments/comment${maxNum + 1}.xml`;
      setEntry2(archive, partPath, XMLDECL5 + `<p:cmLst xmlns:p="${NS_P5}"></p:cmLst>`);
      addContentTypeOverride2(archive, partPath, COMMENTS_CT);
      appendRelationship(archive, slide.path, COMMENTS_REL, `../${partPath.slice(4)}`);
    }
    const xml = archive.readText(partPath);
    if (!xml) return null;
    const dt = (/* @__PURE__ */ new Date()).toISOString();
    const count = [...xml.matchAll(/<p:cm\b/g)].length;
    const pos = 10 + count % 8 * 6;
    const cm = `<p:cm authorId="${authorId}" dt="${dt}" idx="${nextIdx}"><p:pos x="${pos}" y="${pos}"/><p:text>${escapeXmlText(opts.text)}</p:text></p:cm>`;
    setEntry2(archive, partPath, xml.replace("</p:cmLst>", `${cm}</p:cmLst>`));
    return { authorId, author: opts.author, initials, dt, idx: nextIdx, text: opts.text };
  }
  function deleteSlideComment(opened, slideIndex, ref) {
    const slide = opened.deck.slides[slideIndex];
    if (!slide) return false;
    const { archive } = opened;
    const partPath = commentsPathForSlide(archive, slide.path);
    if (!partPath) return false;
    const xml = archive.readText(partPath);
    if (!xml) return false;
    for (const m of xml.matchAll(/<p:cm\b([^>]*)>[\s\S]*?<\/p:cm>/g)) {
      const attrs = m[1];
      if (Number(/\bauthorId="(\d+)"/.exec(attrs)?.[1] ?? -1) === ref.authorId && Number(/\bidx="(\d+)"/.exec(attrs)?.[1] ?? -1) === ref.idx) {
        setEntry2(archive, partPath, xml.slice(0, m.index) + xml.slice(m.index + m[0].length));
        return true;
      }
    }
    return false;
  }

  // ../engine/pptx-engine/hyperlink.ts
  var HYPERLINK_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink";
  var SLIDE_REL_TYPE2 = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";
  var SLDJUMP_ACTION = "ppaction://hlinksldjump";
  var R_NS2 = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  var EMPTY_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  function appendRel(opened, slide, type, target, external) {
    const { archive } = opened;
    const relsPath = relsPathFor(slide.path);
    const rels = archive.readText(relsPath) ?? EMPTY_RELS;
    let maxRid = 0;
    for (const m of rels.matchAll(/Id="rId(\d+)"/g)) maxRid = Math.max(maxRid, Number(m[1]));
    const rid = `rId${maxRid + 1}`;
    const mode = external ? ' TargetMode="External"' : "";
    const relXml = `<Relationship Id="${rid}" Type="${type}" Target="${escapeXmlAttr(target)}"${mode}/>`;
    archive.entries.set(relsPath, Buffer.from(rels.replace("</Relationships>", `${relXml}</Relationships>`), "utf8"));
    return rid;
  }
  function stripHlink(xml) {
    return xml.replace(/<a:hlinkClick\b[^>]*\/>|<a:hlinkClick\b[^>]*>[\s\S]*?<\/a:hlinkClick>/, "");
  }
  function setElementLink(opened, slideIndex, elementId, target) {
    const slide = opened.deck.slides[slideIndex];
    if (!slide) return null;
    const el = slide.elements.find((e) => e.id === elementId);
    if (!el) return null;
    let xml = stripHlink(patchedElementXml(el));
    if (target) {
      let hlink;
      if (target.kind === "url") {
        const rid = appendRel(opened, slide, HYPERLINK_REL_TYPE, target.url, true);
        hlink = `<a:hlinkClick xmlns:r="${R_NS2}" r:id="${rid}"/>`;
      } else {
        const dst = opened.deck.slides[target.slideIndex];
        if (!dst) return null;
        const fileName = dst.path.split("/").pop();
        const rid = appendRel(opened, slide, SLIDE_REL_TYPE2, fileName, false);
        hlink = `<a:hlinkClick xmlns:r="${R_NS2}" r:id="${rid}" action="${SLDJUMP_ACTION}"/>`;
      }
      const cNvPr = /<p:cNvPr\b((?:"[^"]*"|'[^']*'|[^"'>])*?)(\/?)>/.exec(xml);
      if (!cNvPr) return null;
      if (cNvPr[2] === "/") {
        xml = xml.slice(0, cNvPr.index) + `<p:cNvPr${cNvPr[1]}>${hlink}</p:cNvPr>` + xml.slice(cNvPr.index + cNvPr[0].length);
      } else {
        const at = cNvPr.index + cNvPr[0].length;
        xml = xml.slice(0, at) + hlink + xml.slice(at);
      }
    }
    el.anchor = { ...el.anchor, originalXml: xml };
    el.dirty = false;
    slide.structureDirty = true;
    return materializeSlide(opened, slideIndex);
  }
  function decodeRunLink(s) {
    const m = /^slide:(\d+)$/.exec(s);
    if (m) return { kind: "slide", slideIndex: Number(m[1]) };
    return s ? { kind: "url", url: s } : null;
  }
  function encodeRunLink(target) {
    return target.kind === "slide" ? `slide:${target.slideIndex}` : target.url;
  }
  function ensureRunLinkRels(opened, slideIndex, paragraphs) {
    const slide = opened.deck.slides[slideIndex];
    if (!slide) return false;
    let changed = false;
    for (const p of paragraphs) {
      for (const run of p.runs) {
        if (!run.hyperlink || run.hyperlinkRId) continue;
        const target = decodeRunLink(run.hyperlink);
        if (!target) continue;
        if (target.kind === "url") {
          run.hyperlinkRId = appendRel(opened, slide, HYPERLINK_REL_TYPE, target.url, true);
          delete run.hyperlinkAction;
        } else {
          const dst = opened.deck.slides[target.slideIndex];
          if (!dst) continue;
          run.hyperlinkRId = appendRel(opened, slide, SLIDE_REL_TYPE2, dst.path.split("/").pop(), false);
          run.hyperlinkAction = SLDJUMP_ACTION;
        }
        changed = true;
      }
    }
    return changed;
  }
  function getRunLinks(opened, slideIndex) {
    const slide = opened.deck.slides[slideIndex];
    if (!slide) return [];
    const out = [];
    const rels = opened.archive.readRels(slide.path);
    const resolve2 = (rid) => {
      const rel = rels.get(rid);
      if (!rel) return null;
      if (rel.type === HYPERLINK_REL_TYPE) return { kind: "url", url: rel.target };
      if (rel.type === SLIDE_REL_TYPE2) {
        const abs = resolveTarget(slide.path, rel.target);
        const idx = opened.deck.slides.findIndex((s) => s.path === abs);
        if (idx >= 0) return { kind: "slide", slideIndex: idx };
      }
      return null;
    };
    const walk2 = (elements) => {
      for (const el of elements) {
        if (el.type === "group") {
          walk2(el.children);
          continue;
        }
        if (el.type !== "text" && el.type !== "shape" || !("text" in el) || !el.text) continue;
        el.text.paragraphs.forEach((p, paraIndex) => {
          p.runs.forEach((run, runIndex) => {
            if (!run.hyperlinkRId) return;
            const target = resolve2(run.hyperlinkRId);
            if (target) out.push({ elementId: el.id, paraIndex, runIndex, target });
          });
        });
      }
    };
    walk2(slide.elements);
    return out;
  }
  function resolveLinkInXml(opened, slide, xml) {
    const m = /<a:hlinkClick\b[^>]*\br:id="(rId\d+)"/.exec(xml);
    if (!m) return null;
    const rel = opened.archive.readRels(slide.path).get(m[1]);
    if (!rel) return null;
    if (rel.type === HYPERLINK_REL_TYPE) return { kind: "url", url: rel.target };
    if (rel.type === SLIDE_REL_TYPE2) {
      const abs = resolveTarget(slide.path, rel.target);
      const idx = opened.deck.slides.findIndex((s) => s.path === abs);
      if (idx >= 0) return { kind: "slide", slideIndex: idx };
    }
    return null;
  }
  function getElementLink(opened, slideIndex, elementId) {
    const slide = opened.deck.slides[slideIndex];
    const el = slide?.elements.find((e) => e.id === elementId);
    if (!slide || !el) return null;
    return resolveLinkInXml(opened, slide, el.anchor.originalXml);
  }
  function getSlideLinks(opened, slideIndex) {
    const slide = opened.deck.slides[slideIndex];
    if (!slide) return [];
    const out = [];
    const walk2 = (elements, xmlOf) => {
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const xml = xmlOf(i);
        if (el.type === "group") {
          const own = /<p:nvGrpSpPr>[\s\S]*?<\/p:nvGrpSpPr>/.exec(xml)?.[0] ?? "";
          const target2 = resolveLinkInXml(opened, slide, own);
          if (target2) out.push({ elementId: el.id, target: target2 });
          const childXmls = sliceGroupChildXmls(xml);
          walk2(el.children, (j) => childXmls[j] ?? "");
          continue;
        }
        const target = resolveLinkInXml(opened, slide, xml);
        if (target) out.push({ elementId: el.id, target });
      }
    };
    walk2(slide.elements, (i) => slide.elements[i].anchor.originalXml);
    return out;
  }

  // ../engine/pptx-engine/smartart-layout.ts
  var SMARTART_PALETTE = [
    "4472C4",
    "ED7D31",
    "A5A5A5",
    "FFC000",
    "5B9BD5",
    "70AD47",
    "264478",
    "9E480E"
  ];
  function layoutShapes(layout, items, cx, cy) {
    const n = Math.min(Math.max(items.length, 1), 8);
    const texts = items.slice(0, n);
    const color = (i) => SMARTART_PALETTE[i % SMARTART_PALETTE.length];
    const out = [];
    if (layout === "list") {
      const gap = Math.round(cy * 0.04);
      const h = Math.round((cy - gap * (n - 1)) / n);
      texts.forEach((t, i) => {
        out.push({
          prst: "roundRect",
          box: { x: 0, y: i * (h + gap), cx, cy: h },
          text: t,
          color: color(i)
        });
      });
    } else if (layout === "process") {
      const overlap = 0.25;
      const w = Math.round(cx / (n - (n - 1) * overlap));
      const h = Math.round(cy * 0.6);
      const y = Math.round((cy - h) / 2);
      texts.forEach((t, i) => {
        out.push({
          prst: i === 0 ? "homePlate" : "chevron",
          box: { x: Math.round(i * w * (1 - overlap)), y, cx: w, cy: h },
          text: t,
          color: color(i),
          fontSize: 12
        });
      });
    } else if (layout === "cycle") {
      const nodeW = Math.round(cx * 0.3);
      const nodeH = Math.round(cy * 0.26);
      const rx = (cx - nodeW) / 2;
      const ry = (cy - nodeH) / 2;
      texts.forEach((t, i) => {
        const ang = -Math.PI / 2 + i * 2 * Math.PI / n;
        out.push({
          prst: "ellipse",
          box: {
            x: Math.round(cx / 2 - nodeW / 2 + Math.cos(ang) * rx),
            y: Math.round(cy / 2 - nodeH / 2 + Math.sin(ang) * ry),
            cx: nodeW,
            cy: nodeH
          },
          text: t,
          color: color(i),
          fontSize: 12
        });
      });
    } else if (layout === "pyramid") {
      const h = Math.round(cy / n);
      texts.forEach((t, i) => {
        const w = Math.round(cx * (i + 1) / n);
        out.push({
          prst: i === 0 ? "triangle" : "trapezoid",
          box: { x: Math.round((cx - w) / 2), y: i * h, cx: w, cy: h },
          text: t,
          color: color(i),
          fontSize: 12
        });
      });
    } else if (layout === "matrix") {
      const gap = Math.round(Math.min(cx, cy) * 0.03);
      const rows = Math.ceil(n / 2);
      const w = Math.round((cx - gap) / 2);
      const h = Math.round((cy - gap * (rows - 1)) / rows);
      texts.forEach((t, i) => {
        out.push({
          prst: "roundRect",
          box: { x: i % 2 * (w + gap), y: Math.floor(i / 2) * (h + gap), cx: w, cy: h },
          text: t,
          color: color(i),
          fontSize: 12
        });
      });
    } else if (layout === "venn") {
      const m = Math.min(n, 4);
      const s = Math.min(cx, cy);
      const d = Math.round(s * 0.6);
      const ringR = Math.round(s * 0.2);
      const start = m === 2 ? 0 : -Math.PI / 2;
      texts.slice(0, m).forEach((t, i) => {
        const ang = start + i * 2 * Math.PI / m;
        out.push({
          prst: "ellipse",
          box: {
            x: Math.round(cx / 2 - d / 2 + Math.cos(ang) * ringR),
            y: Math.round(cy / 2 - d / 2 + Math.sin(ang) * ringR),
            cx: d,
            cy: d
          },
          text: t,
          color: color(i),
          fontSize: 12,
          alpha: 0.55
        });
      });
    } else {
      const top = texts[0];
      const rest = texts.slice(1);
      const h = Math.round(cy * 0.32);
      const topW = Math.round(cx * 0.36);
      out.push({
        prst: "roundRect",
        box: { x: Math.round((cx - topW) / 2), y: 0, cx: topW, cy: h },
        text: top,
        color: color(0)
      });
      if (rest.length) {
        const gap = Math.round(cx * 0.03);
        const w = Math.round((cx - gap * (rest.length - 1)) / rest.length);
        rest.forEach((t, i) => {
          const nodeX = i * (w + gap);
          out.push({
            prst: "rect",
            box: {
              x: Math.round(nodeX + w / 2 - cx * 2e-3),
              y: h,
              cx: Math.max(Math.round(cx * 4e-3), 9525),
              cy: Math.round(cy * 0.18)
            },
            color: "A5A5A5"
          });
          out.push({
            prst: "roundRect",
            box: { x: nodeX, y: Math.round(cy * 0.5), cx: w, cy: Math.round(cy * 0.5) },
            text: t,
            color: color(i + 1),
            fontSize: 12
          });
        });
      }
    }
    return out;
  }

  // ../engine/pptx-engine/smartart.ts
  function childSpXml(id, s) {
    const para = s.text ? `<a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="${Math.round((s.fontSize ?? 14) * 100)}" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>${escapeXmlText(s.text)}</a:t></a:r></a:p>` : "<a:p/>";
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXmlAttr(`SmartShape ${id}`)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${s.box.x}" y="${s.box.y}"/><a:ext cx="${s.box.cx}" cy="${s.box.cy}"/></a:xfrm><a:prstGeom prst="${s.prst}"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${s.color}">` + (s.alpha != null && s.alpha < 1 ? `<a:alpha val="${Math.round(s.alpha * 1e5)}"/>` : "") + `</a:srgbClr></a:solidFill></p:spPr><p:txBody><a:bodyPr wrap="square" anchor="ctr" rtlCol="0"><a:normAutofit/></a:bodyPr><a:lstStyle/>${para}</p:txBody></p:sp>`;
  }
  function buildSmartArtXml(slide, opts) {
    const baseId = nextCNvPrId(slide);
    const o = opts.offset;
    const shapes = layoutShapes(opts.layout, opts.items, o.cx, o.cy);
    const children = shapes.map((s, i) => childSpXml(baseId + 1 + i, s)).join("");
    return `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${baseId}" name="SmartArt ${baseId}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${o.x}" y="${o.y}"/><a:ext cx="${o.cx}" cy="${o.cy}"/><a:chOff x="0" y="0"/><a:chExt cx="${o.cx}" cy="${o.cy}"/></a:xfrm></p:grpSpPr>${children}</p:grpSp>`;
  }
  function addSmartArt(opened, slideIndex, opts) {
    const slide = opened.deck.slides[slideIndex];
    if (!slide || !opts.items.length) return null;
    const r = appendRawElements(opened, slideIndex, [buildSmartArtXml(slide, opts)]);
    return r ? { slide: r.slide, elementId: r.elementIds[r.elementIds.length - 1] } : null;
  }

  // ../engine/pptx-engine/media-insert.ts
  init_stub_node();
  var R_NS3 = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  var IMAGE_REL_TYPE2 = `${R_NS3}/image`;
  var VIDEO_REL_TYPE = `${R_NS3}/video`;
  var AUDIO_REL_TYPE = `${R_NS3}/audio`;
  var MEDIA_REL_TYPE = "http://schemas.microsoft.com/office/2007/relationships/media";
  var P14_NS2 = "http://schemas.microsoft.com/office/powerpoint/2010/main";
  var MEDIA_EXT_URI = "{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}";
  var MEDIA_MIME = {
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    avi: "video/x-msvideo",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    aac: "audio/aac",
    ogg: "audio/ogg",
    glb: "model/gltf-binary",
    gltf: "model/gltf+json"
  };
  var CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  function crc32(buf) {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ c >>> 8;
    return (c ^ -1) >>> 0;
  }
  function pngChunk(type, data) {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "ascii");
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 0);
    return Buffer.concat([head, data, crcBuf]);
  }
  function solidPng(w, h, rgb) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const raw = Buffer.alloc(h * (1 + w * 3));
    for (let y = 0; y < h; y++) {
      const row = y * (1 + w * 3);
      raw[row] = 0;
      for (let x = 0; x < w; x++) {
        raw[row + 1 + x * 3] = rgb[0];
        raw[row + 2 + x * 3] = rgb[1];
        raw[row + 3 + x * 3] = rgb[2];
      }
    }
    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      pngChunk("IHDR", ihdr),
      pngChunk("IDAT", deflateSync(raw)),
      pngChunk("IEND", Buffer.alloc(0))
    ]);
  }
  function ensureDefaultContentType(opened, ext, mime) {
    const ctPath = "[Content_Types].xml";
    const ct = opened.archive.readText(ctPath);
    if (ct && !new RegExp(`<Default Extension="${ext}"`).test(ct)) {
      const dflt = `<Default Extension="${ext}" ContentType="${mime}"/>`;
      opened.archive.entries.set(ctPath, Buffer.from(ct.replace("</Types>", `${dflt}</Types>`), "utf8"));
    }
  }
  function newMediaPart(opened, prefix, ext, bytes) {
    let maxNum = 0;
    for (const path of opened.archive.entries.keys()) {
      const m = /^ppt\/media\/[a-zA-Z]+(\d+)\./.exec(path);
      if (m) maxNum = Math.max(maxNum, Number(m[1]));
    }
    const partPath = `ppt/media/${prefix}${maxNum + 1}.${ext}`;
    opened.archive.entries.set(partPath, bytes);
    return partPath;
  }
  function appendRels(opened, slide, rels) {
    const relsPath = relsPathFor(slide.path);
    let xml = opened.archive.readText(relsPath) ?? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    let maxRid = 0;
    for (const m of xml.matchAll(/Id="rId(\d+)"/g)) maxRid = Math.max(maxRid, Number(m[1]));
    const rids = [];
    for (const rel of rels) {
      const rid = `rId${++maxRid}`;
      rids.push(rid);
      const mode = rel.external ? ' TargetMode="External"' : "";
      xml = xml.replace(
        "</Relationships>",
        `<Relationship Id="${rid}" Type="${rel.type}" Target="${escapeXmlAttr(rel.target)}"${mode}/></Relationships>`
      );
    }
    opened.archive.entries.set(relsPath, Buffer.from(xml, "utf8"));
    return rids;
  }
  function addMedia(opened, slideIndex, opts) {
    const slide = opened.deck.slides[slideIndex];
    if (!slide) return null;
    const ext = opts.ext.toLowerCase();
    const mime = MEDIA_MIME[ext];
    if (!mime) return null;
    const mediaPath = newMediaPart(opened, "media", ext, opts.bytes);
    ensureDefaultContentType(opened, ext, mime);
    const poster = opts.poster ?? {
      bytes: solidPng(16, 9, opts.kind === "video" ? [38, 38, 44] : [240, 240, 244]),
      ext: "png"
    };
    const posterExt = poster.ext.toLowerCase();
    const posterPath = newMediaPart(opened, "image", posterExt, poster.bytes);
    ensureDefaultContentType(
      opened,
      posterExt,
      posterExt === "jpg" || posterExt === "jpeg" ? "image/jpeg" : "image/png"
    );
    const mediaTarget = `../media/${mediaPath.split("/").pop()}`;
    const [ridPoster, ridLegacy, ridMedia] = appendRels(opened, slide, [
      { type: IMAGE_REL_TYPE2, target: `../media/${posterPath.split("/").pop()}` },
      { type: opts.kind === "video" ? VIDEO_REL_TYPE : AUDIO_REL_TYPE, target: mediaTarget },
      { type: MEDIA_REL_TYPE, target: mediaTarget }
    ]);
    const id = nextCNvPrId(slide);
    const name = opts.name ?? `${opts.kind === "video" ? "Video" : "Audio"} ${id}`;
    const fileTag = opts.kind === "video" ? "a:videoFile" : "a:audioFile";
    const o = opts.offset;
    const xml = `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${escapeXmlAttr(name)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr><${fileTag} xmlns:r="${R_NS3}" r:link="${ridLegacy}"/><p:extLst><p:ext uri="${MEDIA_EXT_URI}"><p14:media xmlns:p14="${P14_NS2}" xmlns:r="${R_NS3}" r:embed="${ridMedia}"/></p:ext></p:extLst></p:nvPr></p:nvPicPr><p:blipFill><a:blip r:embed="${ridPoster}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${o.x}" y="${o.y}"/><a:ext cx="${o.cx}" cy="${o.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
    const r = appendRawElements(opened, slideIndex, [xml]);
    return r ? { slide: r.slide, elementId: r.elementIds[r.elementIds.length - 1] } : null;
  }
  function addModel3d(opened, slideIndex, opts) {
    const slide = opened.deck.slides[slideIndex];
    if (!slide) return null;
    const ext = opts.ext.toLowerCase();
    const mime = MEDIA_MIME[ext];
    if (!mime) return null;
    const modelPath = newMediaPart(opened, "media", ext, opts.bytes);
    ensureDefaultContentType(opened, ext, mime);
    const poster = opts.poster ?? { bytes: solidPng(16, 9, [58, 58, 66]), ext: "png" };
    const posterExt = poster.ext.toLowerCase();
    const posterPath = newMediaPart(opened, "image", posterExt, poster.bytes);
    ensureDefaultContentType(
      opened,
      posterExt,
      posterExt === "jpg" || posterExt === "jpeg" ? "image/jpeg" : "image/png"
    );
    const [ridPoster] = appendRels(opened, slide, [
      { type: IMAGE_REL_TYPE2, target: `../media/${posterPath.split("/").pop()}` }
    ]);
    const id = nextCNvPrId(slide);
    const name = opts.name ?? `3D Model ${id}`;
    const o = opts.offset;
    const xml = `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${escapeXmlAttr(name)}" descr="${escapeXmlAttr(`aislides-3d:${modelPath}`)}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${ridPoster}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${o.x}" y="${o.y}"/><a:ext cx="${o.cx}" cy="${o.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
    const r = appendRawElements(opened, slideIndex, [xml]);
    return r ? { slide: r.slide, elementId: r.elementIds[r.elementIds.length - 1] } : null;
  }

  // ../engine/pptx-engine/headerfooter.ts
  var HF_TYPES = /* @__PURE__ */ new Set(["ftr", "sldNum", "dt"]);
  function hfSpXml(slide, type, idx, box, para) {
    const id = nextCNvPrId(slide);
    const nameMap = {
      dt: "Date Placeholder",
      ftr: "Footer Placeholder",
      sldNum: "Slide Number Placeholder"
    };
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${nameMap[type]} ${id}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="${type}" sz="${type === "dt" ? "half" : "quarter"}" idx="${idx}"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.cx}" cy="${box.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="ctr"/><a:lstStyle/>` + generateParagraphXml(para) + "</p:txBody></p:sp>";
  }
  function applyHeaderFooter(opened, opts, slideIndexes) {
    const { deck } = opened;
    const targets = slideIndexes ?? deck.slides.map((_, i) => i);
    const { cx, cy } = deck.size;
    const barH = Math.round(cy * 0.045);
    const barY = Math.round(cy * 0.93);
    const style = { fontSize: 12, color: "898989" };
    let changed = false;
    for (const i of targets) {
      const slide = deck.slides[i];
      if (!slide) continue;
      const before = slide.elements.length;
      slide.elements = slide.elements.filter(
        (el) => !(el.placeholder && HF_TYPES.has(el.placeholder))
      );
      let dirty = slide.elements.length !== before;
      const pushSp = (xml) => {
        const el = {
          // materialize reparses the whole slide, so these temporary model fields suffice
          id: `hfnew_${slide.elements.length}_${Date.now().toString(36)}`,
          type: "text",
          anchor: { spIndex: slide.elements.length, originalXml: xml, range: [0, 0] },
          transform: { offset: { x: 0, y: 0, cx: 0, cy: 0 }, rot: 0, flipH: false, flipV: false }
        };
        slide.elements.push(el);
        dirty = true;
      };
      if (opts.date) {
        pushSp(
          hfSpXml(
            slide,
            "dt",
            10,
            { x: Math.round(cx * 0.05), y: barY, cx: Math.round(cx * 0.22), cy: barH },
            {
              align: "left",
              runs: [
                opts.dateAuto ? { text: opts.date, field: "datetime1", ...style } : { text: opts.date, ...style }
              ]
            }
          )
        );
      }
      if (opts.footer) {
        pushSp(
          hfSpXml(
            slide,
            "ftr",
            11,
            { x: Math.round(cx * 0.3), y: barY, cx: Math.round(cx * 0.4), cy: barH },
            {
              align: "center",
              runs: [{ text: opts.footer, ...style }]
            }
          )
        );
      }
      if (opts.slideNum) {
        pushSp(
          hfSpXml(
            slide,
            "sldNum",
            12,
            { x: Math.round(cx * 0.86), y: barY, cx: Math.round(cx * 0.09), cy: barH },
            {
              align: "right",
              runs: [{ text: String(i + 1), field: "slidenum", ...style }]
            }
          )
        );
      }
      if (dirty) {
        slide.structureDirty = true;
        materializeSlide(opened, i);
        changed = true;
      }
    }
    return changed;
  }
  function readHeaderFooter(slide) {
    let footer = null;
    let date = null;
    let slideNum = false;
    for (const el of slide.elements) {
      if (el.type !== "text" && el.type !== "shape") continue;
      const text = el.text?.paragraphs.map((p) => p.runs.map((r) => r.text).join("")).join("\n").trim();
      if (el.placeholder === "ftr") footer = text || null;
      else if (el.placeholder === "dt") date = text || null;
      else if (el.placeholder === "sldNum") slideNum = true;
    }
    return { footer, slideNum, date };
  }

  // ../engine/pptx-engine/index.ts
  function parseSlideFromArchive(archive, slidePath) {
    const slideXml = archive.readText(slidePath);
    if (slideXml == null) return null;
    const chain = archive.resolveSlideChain(slidePath);
    const ctx = {};
    if (chain.themePath) {
      const themeXml = archive.readText(chain.themePath);
      if (themeXml) ctx.theme = parseTheme(themeXml);
    }
    const layoutXml = (chain.layoutPath ? archive.readText(chain.layoutPath) : void 0) ?? void 0;
    if (layoutXml) {
      ctx.layoutPlaceholders = parsePlaceholderMap(layoutXml, ctx.theme);
      ctx.layoutBg = layoutXml;
    }
    const masterXml = (chain.masterPath ? archive.readText(chain.masterPath) : void 0) ?? void 0;
    if (masterXml) {
      ctx.masterPlaceholders = parsePlaceholderMap(masterXml, ctx.theme);
      ctx.masterTextStyles = parseMasterTextStyles(masterXml, ctx.theme);
      ctx.masterBg = masterXml;
    }
    const rels = archive.readRels(slidePath);
    const mediaRels = /* @__PURE__ */ new Map();
    const chartXmls = /* @__PURE__ */ new Map();
    const avRels = /* @__PURE__ */ new Map();
    const diagramDrawings = /* @__PURE__ */ new Map();
    const hlinkRels = /* @__PURE__ */ new Map();
    let slideOrder;
    for (const rel of rels.values()) {
      if (rel.type.endsWith("/hyperlink")) {
        hlinkRels.set(rel.id, rel.target);
      } else if (rel.type.endsWith("/slide")) {
        slideOrder ??= archive.readPresentation().slidePaths;
        const idx = slideOrder.indexOf(resolveTarget(slidePath, rel.target));
        if (idx >= 0) hlinkRels.set(rel.id, `slide:${idx}`);
      } else if (rel.type.endsWith("/image")) {
        mediaRels.set(rel.id, resolveTarget(slidePath, rel.target));
      } else if (rel.type.endsWith("/chart")) {
        const xml = archive.readText(resolveTarget(slidePath, rel.target));
        if (xml) chartXmls.set(rel.id, xml);
      } else if (/\/(?:video|audio|media)$/.test(rel.type)) {
        const external = rel.targetMode === "External";
        avRels.set(rel.id, {
          target: external ? rel.target : resolveTarget(slidePath, rel.target),
          ...external ? { external: true } : {}
        });
      } else if (rel.type.endsWith("/diagramData")) {
        const dataPath = resolveTarget(slidePath, rel.target);
        const dataXml = archive.readText(dataPath);
        const relId = dataXml ? /<dsp:dataModelExt\b[^>]*\brelId="([^"]+)"/.exec(dataXml)?.[1] : void 0;
        if (relId) {
          const drawRel = rels.get(relId) ?? archive.readRels(dataPath).get(relId);
          const basePath = rels.get(relId) ? slidePath : dataPath;
          const drawingXml = drawRel ? archive.readText(resolveTarget(basePath, drawRel.target)) : void 0;
          if (drawingXml) diagramDrawings.set(rel.id, drawingXml);
        }
      }
    }
    ctx.mediaRels = mediaRels;
    ctx.chartXmls = chartXmls;
    if (hlinkRels.size) ctx.hlinkRels = hlinkRels;
    if (avRels.size) ctx.avRels = avRels;
    if (diagramDrawings.size) ctx.diagramDrawings = diagramDrawings;
    ctx.tableStyles = archive.readText("ppt/tableStyles.xml") ?? void 0;
    const slide = parseSlide({
      path: slidePath,
      slideXml,
      layoutPath: chain.layoutPath,
      masterPath: chain.masterPath,
      ctx
    });
    const decorations = buildDecorations(archive, slidePath, slideXml, slide, layoutXml, masterXml, {
      layoutPath: chain.layoutPath,
      masterPath: chain.masterPath,
      theme: ctx.theme,
      masterPlaceholders: ctx.masterPlaceholders,
      masterTextStyles: ctx.masterTextStyles
    });
    if (decorations.length) slide.decorations = decorations;
    return slide;
  }
  function partMediaRels(archive, partPath) {
    const media = /* @__PURE__ */ new Map();
    for (const rel of archive.readRels(partPath).values()) {
      if (rel.type.endsWith("/image")) media.set(rel.id, resolveTarget(partPath, rel.target));
    }
    return media;
  }
  function hfState(xml, attr) {
    if (!xml) return "unset";
    const hf = /<p:hf\b[^>]*\/?>/.exec(xml)?.[0];
    if (!hf) return "unset";
    if (new RegExp(`\\b${attr}="(?:1|true)"`).test(hf)) return "on";
    if (new RegExp(`\\b${attr}="(?:0|false)"`).test(hf)) return "off";
    return "unset";
  }
  function buildDecorations(archive, slidePath, slideXml, slide, layoutXml, masterXml, parts) {
    const out = [];
    let slideNum;
    try {
      const idx = archive.readPresentation().slidePaths.indexOf(slidePath);
      if (idx >= 0) slideNum = idx + 1;
    } catch {
    }
    const HF_ALL = ["ftr", "sldNum", "dt"];
    const enabled = new Set(
      HF_ALL.filter((k) => {
        const l = hfState(layoutXml, k);
        const m = hfState(masterXml, k);
        if (l === "off" || m === "off") return false;
        return l === "on" || m === "on";
      })
    );
    const slidePh = new Set(
      slide.elements.map((e) => e.placeholder).filter(Boolean)
    );
    const hasPh = (xml, type) => !!xml && new RegExp(`<p:ph\\b[^>]*type="${type}"`).test(xml);
    const masterShown = !/<p:sld\b[^>]*showMasterSp="(?:0|false)"/.test(slideXml) && !(layoutXml && /<p:sldLayout\b[^>]*showMasterSp="(?:0|false)"/.test(layoutXml));
    if (masterShown && masterXml && parts.masterPath) {
      const hfTypes = new Set([...enabled].filter((k) => !slidePh.has(k) && !hasPh(layoutXml, k)));
      const ctx = {
        theme: parts.theme,
        mediaRels: partMediaRels(archive, parts.masterPath)
      };
      out.push(
        ...parseDecorations(masterXml, ctx, { hfTypes, ...slideNum != null ? { slideNum } : {} })
      );
    }
    if (layoutXml && parts.layoutPath) {
      const hfTypes = new Set([...enabled].filter((k) => !slidePh.has(k)));
      const ctx = {
        theme: parts.theme,
        mediaRels: partMediaRels(archive, parts.layoutPath),
        masterPlaceholders: parts.masterPlaceholders,
        masterTextStyles: parts.masterTextStyles
      };
      out.push(
        ...parseDecorations(layoutXml, ctx, { hfTypes, ...slideNum != null ? { slideNum } : {} })
      );
    }
    return out;
  }
  async function openPptx(bytes) {
    const archive = await PackageArchive.open(bytes);
    const { size, slidePaths } = archive.readPresentation();
    const slides = [];
    for (const slidePath of slidePaths) {
      const slide = parseSlideFromArchive(archive, slidePath);
      if (slide) slides.push(slide);
    }
    const deck = { slides, size, originalHash: archive.originalHash };
    return { deck, archive };
  }
  function reparseDeck(opened) {
    const { archive } = opened;
    const { size, slidePaths } = archive.readPresentation();
    const slides = [];
    for (const slidePath of slidePaths) {
      const slide = parseSlideFromArchive(archive, slidePath);
      if (slide) slides.push(slide);
    }
    return { deck: { slides, size, originalHash: archive.originalHash }, archive };
  }
  async function savePptx(opened) {
    return buildZip(opened).generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });
  }
  async function savePptxToFile(opened, filePath) {
    const { createWriteStream } = await Promise.resolve().then(() => (init_stub_node(), stub_node_exports));
    const { pipeline } = await Promise.resolve().then(() => (init_stub_node(), stub_node_exports));
    const source = buildZip(opened).generateNodeStream({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
      streamFiles: true
    });
    await pipeline(source, createWriteStream(filePath));
  }
  function commitSaved(opened) {
    const { deck, archive } = opened;
    for (const slide of deck.slides) {
      if (!slideIsDirty(slide)) continue;
      const xml = patchSlideXml(slide);
      for (const el of slide.elements) {
        el.anchor.originalXml = patchedElementXml(el);
        delete el.dirty;
        delete el.dirtyTransform;
        delete el.dirtyFill;
        delete el.dirtyStroke;
        delete el.dirtySrcRect;
        delete el.dirtyPPr;
      }
      slide.originalXml = xml;
      delete slide.structureDirty;
      archive.entries.set(slide.path, Buffer.from(xml, "utf8"));
    }
  }
  var COMPRESSED_EXTENSIONS = /* @__PURE__ */ new Set(["xml", "rels"]);
  function slideIsDirty(s) {
    return !!s.structureDirty || s.elements.some(
      (e) => e.dirty || e.dirtyTransform || e.dirtyFill || e.dirtyStroke || e.dirtySrcRect || e.dirtyPPr
    );
  }
  function buildZip(opened) {
    const { deck, archive } = opened;
    const dirtyByPath = /* @__PURE__ */ new Map();
    for (const s of deck.slides) {
      if (slideIsDirty(s)) dirtyByPath.set(s.path, s);
    }
    const zip = new import_jszip3.default();
    for (const [path, data] of archive.entries) {
      const slide = dirtyByPath.get(path);
      if (slide) {
        zip.file(path, patchSlideXml(slide));
        continue;
      }
      const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
      zip.file(path, data, COMPRESSED_EXTENSIONS.has(ext) ? {} : { compression: "STORE" });
    }
    return zip;
  }
  function patchSlideXml(slide) {
    const parts = [slide.bodyPrefix];
    for (const el of slide.elements) {
      parts.push(patchedElementXml(el));
      if (el.anchor.gapAfter) parts.push(el.anchor.gapAfter);
    }
    parts.push(slide.bodySuffix);
    return parts.join("");
  }
  function patchedElementXml(el) {
    let xml = el.anchor.originalXml;
    if (el.dirty && (el.type === "text" || el.type === "shape")) {
      xml = patchTextElementXml(el, xml);
    }
    if (el.dirtyPPr && (el.type === "text" || el.type === "shape") && el.text) {
      const t = el;
      xml = patchElementPPr(t, xml, el.dirtyPPr) ?? rebuildTxBody(t, xml);
    }
    if (el.dirtyTransform) {
      xml = patchElementXfrm(el, xml);
    }
    if (el.dirtyFill && (el.type === "text" || el.type === "shape")) {
      const fill = el.fill;
      if (fill?.type === "solid") xml = patchElementFill(xml, fill.color);
      else if (fill?.type === "none") xml = patchElementFill(xml, "none");
      else if (fill?.type === "gradient") {
        xml = patchElementFill(xml, {
          stops: fill.stops,
          ...fill.angle != null ? { angle: fill.angle } : {},
          ...fill.path ? { radial: true } : {}
        });
      }
    }
    if (el.dirtyStroke && (el.type === "text" || el.type === "shape" || el.type === "picture")) {
      const stroke = el.stroke;
      xml = patchElementStroke(
        xml,
        stroke && stroke.fill.type === "solid" ? { color: stroke.fill.color, widthEmu: stroke.width, dash: stroke.dash } : null
      );
    }
    if (el.dirtySrcRect && el.type === "picture") {
      const pic = el;
      xml = patchPictureSrcRect(xml, pic.srcRect ?? null);
    }
    return xml;
  }
  function setSlideBackground(slide, color) {
    slide.bodyPrefix = patchSlideBackgroundXml(slide.bodyPrefix, color);
    slide.background = { type: "solid", color };
    slide.structureDirty = true;
  }
  function editPictureSrcRect(slide, sourceId, srcRect) {
    const el = slide.elements.find((e) => e.id === sourceId && e.type === "picture");
    if (!el) return false;
    const pic = el;
    if (srcRect && !srcRect.l && !srcRect.t && !srcRect.r && !srcRect.b) {
      pic.srcRect = void 0;
    } else {
      pic.srcRect = srcRect ?? void 0;
    }
    pic.dirtySrcRect = true;
    return true;
  }
  function setElementTextAnchor(slide, elementId, anchor) {
    const el = slide.elements.find((e) => e.id === elementId);
    if (!el || el.type !== "text" && el.type !== "shape") return false;
    const t = el;
    if (!t.text) return false;
    let xml = patchedElementXml(el);
    const val = anchor === "middle" ? "ctr" : anchor === "bottom" ? "b" : "t";
    const m = /<a:bodyPr\b[^>]*?\/?>/.exec(xml);
    if (!m) return false;
    let tag = m[0].replace(/\s+anchor="[^"]*"/, "");
    tag = tag.replace(/^<a:bodyPr/, `<a:bodyPr anchor="${val}"`);
    xml = xml.slice(0, m.index) + tag + xml.slice(m.index + m[0].length);
    el.dirty = el.dirtyTransform = el.dirtyFill = el.dirtyStroke = false;
    el.dirtyPPr = void 0;
    el.anchor.originalXml = xml;
    t.text.anchor = anchor;
    slide.structureDirty = true;
    return true;
  }
  function setElementImageFill(opened, slide, elementId, bytes, ext) {
    const el = slide.elements.find((e) => e.id === elementId);
    if (!el || el.type !== "text" && el.type !== "shape") return null;
    const added = addImageMediaAndRel(opened, slide, bytes, ext);
    if (!added) return null;
    const rawFillXml = `<a:blipFill rotWithShape="1"><a:blip r:embed="${added.rid}"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>`;
    const xml = patchElementFill(patchedElementXml(el), { rawFillXml });
    el.dirty = el.dirtyTransform = el.dirtyFill = el.dirtyStroke = false;
    el.dirtyPPr = void 0;
    el.anchor.originalXml = xml;
    el.fill = { type: "image", mediaRef: added.mediaPath, mode: "stretch" };
    slide.structureDirty = true;
    return added.mediaPath;
  }
  function setPictureOpacity(slide, sourceId, opacity) {
    const el = slide.elements.find((e) => e.id === sourceId && e.type === "picture");
    if (!el) return false;
    const pic = el;
    let xml = patchedElementXml(el);
    xml = xml.replace(/<a:alphaModFix\b[^>]*\/>|<a:alphaModFix\b[^>]*>[\s\S]*?<\/a:alphaModFix>/, "");
    const v = Math.max(0, Math.min(1, opacity));
    if (v < 0.999) {
      const amt = `<a:alphaModFix amt="${Math.round(v * 1e5)}"/>`;
      if (/<a:blip\b[^>]*\/>/.test(xml)) {
        xml = xml.replace(/<a:blip\b([^>]*)\/>/, `<a:blip$1>${amt}</a:blip>`);
      } else if (/<a:blip\b[^>]*>/.test(xml)) {
        xml = xml.replace(/(<a:blip\b[^>]*>)/, `$1${amt}`);
      } else {
        return false;
      }
      pic.opacity = v;
    } else {
      delete pic.opacity;
    }
    el.dirty = el.dirtyTransform = el.dirtyFill = el.dirtyStroke = false;
    el.dirtySrcRect = false;
    el.dirtyPPr = void 0;
    el.anchor.originalXml = xml;
    slide.structureDirty = true;
    return true;
  }
  function replacePictureBytes(opened, slide, sourceId, bytes, ext, opts) {
    const el = slide.elements.find((e) => e.id === sourceId && e.type === "picture");
    if (!el) return false;
    const pic = el;
    let xml = patchedElementXml(el);
    const blip = /<a:blip\b[^>]*\/?>/.exec(xml);
    if (!blip) return false;
    const added = addImageMediaAndRel(opened, slide, bytes, ext);
    if (!added) return false;
    let tag = blip[0];
    if (/r:embed="/.test(tag))
      tag = tag.replace(/r:embed="[^"]*"/, `r:embed="${added.rid}"`).replace(/\s+r:link="[^"]*"/, "");
    else if (/r:link="/.test(tag)) tag = tag.replace(/r:link="[^"]*"/, `r:embed="${added.rid}"`);
    else tag = tag.replace(/<a:blip\b/, `<a:blip r:embed="${added.rid}"`);
    xml = xml.slice(0, blip.index) + tag + xml.slice(blip.index + blip[0].length);
    xml = xml.replace(/<a:ext\b[^>]*>\s*<\w+:svgBlip\b[\s\S]*?<\/a:ext>/, "").replace(/<a:extLst>\s*<\/a:extLst>/, "");
    if (!opts?.keepSrcRect) {
      xml = xml.replace(/<a:srcRect\b[^>]*\/>|<a:srcRect\b[^>]*>[\s\S]*?<\/a:srcRect>/, "");
      delete pic.srcRect;
    }
    pic.mediaRef = added.mediaPath;
    delete pic.dataUrl;
    el.dirty = el.dirtyTransform = el.dirtyFill = el.dirtyStroke = false;
    el.dirtySrcRect = false;
    el.dirtyPPr = void 0;
    el.anchor.originalXml = xml;
    slide.structureDirty = true;
    return true;
  }
  var SLIDE_CONTENT_TYPE2 = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
  var SLIDE_REL_TYPE3 = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";
  function nextSlidePath2(archive) {
    let maxNum = 0;
    for (const path of archive.entries.keys()) {
      const m = /^ppt\/slides\/slide(\d+)\.xml$/.exec(path);
      if (m) maxNum = Math.max(maxNum, Number(m[1]));
    }
    return `ppt/slides/slide${maxNum + 1}.xml`;
  }
  function registerNewSlide(opened, sourceIndex, newPath) {
    const { deck, archive } = opened;
    const src = deck.slides[sourceIndex];
    if (!src) return null;
    const ctPath = "[Content_Types].xml";
    const ct = archive.readText(ctPath);
    if (ct) {
      const override = `<Override PartName="/${newPath}" ContentType="${SLIDE_CONTENT_TYPE2}"/>`;
      archive.entries.set(ctPath, Buffer.from(ct.replace("</Types>", `${override}</Types>`), "utf8"));
    }
    const presRelsPath = "ppt/_rels/presentation.xml.rels";
    const presRels = archive.readText(presRelsPath);
    const presPath = "ppt/presentation.xml";
    const pres = archive.readText(presPath);
    if (!presRels || !pres) return null;
    let maxRid = 0;
    for (const m of presRels.matchAll(/Id="rId(\d+)"/g)) maxRid = Math.max(maxRid, Number(m[1]));
    const newRid = `rId${maxRid + 1}`;
    const relXml = `<Relationship Id="${newRid}" Type="${SLIDE_REL_TYPE3}" Target="${newPath.slice("ppt/".length)}"/>`;
    archive.entries.set(
      presRelsPath,
      Buffer.from(presRels.replace("</Relationships>", `${relXml}</Relationships>`), "utf8")
    );
    let maxSldId = 255;
    for (const m of pres.matchAll(/<p:sldId\s[^>]*\bid="(\d+)"/g)) {
      maxSldId = Math.max(maxSldId, Number(m[1]));
    }
    const newSldId = `<p:sldId id="${maxSldId + 1}" r:id="${newRid}"/>`;
    const srcRid = [...archive.readRels(presPath).values()].find(
      (r) => resolveTarget(presPath, r.target) === src.path
    )?.id;
    const srcTag = srcRid ? new RegExp(`<p:sldId\\s[^>]*r:id="${srcRid}"[^>]*/>`).exec(pres)?.[0] : void 0;
    const nextPres = srcTag ? pres.replace(srcTag, `${srcTag}${newSldId}`) : pres.replace("</p:sldIdLst>", `${newSldId}</p:sldIdLst>`);
    archive.entries.set(presPath, Buffer.from(nextPres, "utf8"));
    const slide = parseSlideFromArchive(archive, newPath);
    if (!slide) return null;
    deck.slides.splice(sourceIndex + 1, 0, slide);
    return slide;
  }
  function duplicateSlide(opened, sourceIndex, opts) {
    const { deck, archive } = opened;
    const src = deck.slides[sourceIndex];
    if (!src) return null;
    const newPath = nextSlidePath2(archive);
    archive.entries.set(newPath, Buffer.from(patchSlideXml(src), "utf8"));
    const srcRels = archive.readText(relsPathFor(src.path));
    if (srcRels) {
      const cleaned = srcRels.replace(/<Relationship\s[^>]*\/notesSlide"[^>]*\/>/g, "");
      archive.entries.set(relsPathFor(newPath), Buffer.from(cleaned, "utf8"));
    }
    const slide = registerNewSlide(opened, sourceIndex, newPath);
    if (!slide) return null;
    if (opts?.clearText) {
      for (const el of slide.elements) {
        if ((el.type === "text" || el.type === "shape") && el.text) {
          ;
          el.text.paragraphs = [{ runs: [{ text: "" }] }];
          el.dirty = true;
        }
      }
    }
    return slide;
  }
  function copySlide(opened, sourceIndex) {
    const slide = opened.deck.slides[sourceIndex];
    if (!slide) return null;
    return collectSlideBundle(opened.archive, slide.path, patchSlideXml(slide));
  }
  function pasteSlide(opened, afterIndex, bundle, opts) {
    const { deck, archive } = opened;
    if (deck.slides.length === 0) return null;
    const anchorIndex = Math.min(Math.max(afterIndex, -1), deck.slides.length - 1);
    const neighbour = deck.slides[anchorIndex] ?? deck.slides[0];
    const layoutPath = (opts?.keepSourceFormatting ? importSourceLayout(archive, bundle) : null) ?? chooseLayout(archive, bundle, neighbour?.path);
    if (!layoutPath) return null;
    const newPath = nextSlidePath2(archive);
    const relsXml = materializeSlideBundle(archive, bundle, newPath, layoutPath);
    archive.entries.set(newPath, Buffer.from(bundle.slideXml, "utf8"));
    archive.entries.set(relsPathFor(newPath), Buffer.from(relsXml, "utf8"));
    if (anchorIndex < 0) {
      const slide = registerNewSlide(opened, 0, newPath);
      if (slide) moveSlide(opened, deck.slides.indexOf(slide), 0);
      return slide;
    }
    return registerNewSlide(opened, anchorIndex, newPath);
  }
  function insertBlankSlide(opened, sourceIndex) {
    const { deck, archive } = opened;
    const src = deck.slides[sourceIndex];
    if (!src) return null;
    const newPath = nextSlidePath2(archive);
    archive.entries.set(newPath, Buffer.from(BLANK_SLIDE_XML, "utf8"));
    const layout = [...archive.readRels(src.path).values()].find(
      (r) => r.type.endsWith("/slideLayout")
    );
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + (layout ? `<Relationship Id="rId1" Type="${layout.type}" Target="${escapeXmlAttr(layout.target)}"/>` : "") + "</Relationships>";
    archive.entries.set(relsPathFor(newPath), Buffer.from(rels, "utf8"));
    return registerNewSlide(opened, sourceIndex, newPath);
  }
  var IMAGE_REL_TYPE3 = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
  var LAYOUT_REL_TYPE2 = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout";
  var MEDIA_REL_SUFFIXES = ["/image", "/video", "/audio", "/media"];
  function nextMediaPath(archive, ext) {
    let maxNum = 0;
    for (const path of archive.entries.keys()) {
      const m = /^ppt\/media\/merged(\d+)\./.exec(path);
      if (m) maxNum = Math.max(maxNum, Number(m[1]));
    }
    return `ppt/media/merged${maxNum + 1}.${ext}`;
  }
  function ensureDefaultContentType2(archive, ext, contentType) {
    const ctPath = "[Content_Types].xml";
    const ct = archive.readText(ctPath);
    if (!ct) return;
    if (new RegExp(`<Default\\s[^>]*Extension="${ext}"`, "i").test(ct)) return;
    const def = `<Default Extension="${ext}" ContentType="${contentType}"/>`;
    const at = ct.indexOf(">") + 1;
    archive.entries.set(ctPath, Buffer.from(ct.slice(0, at) + def + ct.slice(at), "utf8"));
  }
  var MIME_BY_EXT = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    webp: "image/webp",
    tif: "image/tiff",
    tiff: "image/tiff",
    emf: "image/x-emf",
    wmf: "image/x-wmf"
  };
  async function mergeSlideFromPptx(target, sourceBytes) {
    const { deck, archive } = target;
    const src = await PackageArchive.open(sourceBytes);
    const { slidePaths } = src.readPresentation();
    const srcSlidePath = slidePaths[0];
    if (!srcSlidePath) return null;
    let slideXml = src.readText(srcSlidePath);
    if (slideXml == null) return null;
    const srcRels = src.readRels(srcSlidePath);
    const anchorSlide = deck.slides[deck.slides.length - 1];
    const layoutTarget = anchorSlide ? [...archive.readRels(anchorSlide.path).values()].find((r) => r.type.endsWith("/slideLayout"))?.target : void 0;
    const newPath = nextSlidePath2(archive);
    const newRelsLines = [];
    let ridSeq = 0;
    const nextRid = () => `rId${++ridSeq}`;
    for (const rel of srcRels.values()) {
      if (MEDIA_REL_SUFFIXES.some((s) => rel.type.endsWith(s))) {
        const srcMediaPath = resolveTarget(srcSlidePath, rel.target);
        const bytes = src.readBytes(srcMediaPath);
        if (!bytes) continue;
        const ext = (srcMediaPath.split(".").pop() || "png").toLowerCase();
        const destPath = nextMediaPath(archive, ext);
        archive.entries.set(destPath, bytes);
        ensureDefaultContentType2(archive, ext, MIME_BY_EXT[ext] ?? "application/octet-stream");
        const oldRid = rel.id;
        const newRid = nextRid();
        slideXml = slideXml.replace(
          new RegExp(`(r:(?:embed|link)=")${oldRid}(")`, "g"),
          `$1${newRid}$2`
        );
        const relTarget = "../media/" + destPath.slice("ppt/media/".length);
        newRelsLines.push(
          `<Relationship Id="${newRid}" Type="${IMAGE_REL_TYPE3}" Target="${escapeXmlAttr(relTarget)}"/>`
        );
      } else if (rel.type.endsWith("/slideLayout")) {
        const t = layoutTarget ?? rel.target;
        newRelsLines.push(
          `<Relationship Id="${nextRid()}" Type="${LAYOUT_REL_TYPE2}" Target="${escapeXmlAttr(t)}"/>`
        );
        if (!layoutTarget) importLayoutChain(src, archive, srcSlidePath);
      }
    }
    archive.entries.set(newPath, Buffer.from(slideXml, "utf8"));
    const relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + newRelsLines.join("") + "</Relationships>";
    archive.entries.set(relsPathFor(newPath), Buffer.from(relsXml, "utf8"));
    return registerNewSlide(target, deck.slides.length - 1, newPath);
  }
  function importLayoutChain(src, archive, srcSlidePath) {
    const chain = src.resolveSlideChain(srcSlidePath);
    for (const p of [chain.layoutPath, chain.masterPath, chain.themePath]) {
      if (!p) continue;
      const b = src.readBytes(p);
      if (b && !archive.has(p)) archive.entries.set(p, b);
      const rp = relsPathFor(p);
      const rb = src.readBytes(rp);
      if (rb && !archive.has(rp)) archive.entries.set(rp, rb);
    }
  }
  function insertSlideWithLayout(opened, sourceIndex, layoutPath) {
    const newPath = prepareInsertSlideWithLayout(opened.archive, opened.deck, sourceIndex, layoutPath);
    if (!newPath) return null;
    const slide = parseSlideFromArchive(opened.archive, newPath);
    if (!slide) return null;
    opened.deck.slides.splice(sourceIndex + 1, 0, slide);
    return slide;
  }
  function deleteSlide(opened, index) {
    const { deck, archive } = opened;
    const slide = deck.slides[index];
    if (!slide || deck.slides.length <= 1) return false;
    const presPath = "ppt/presentation.xml";
    const presRelsPath = "ppt/_rels/presentation.xml.rels";
    const pres = archive.readText(presPath);
    const presRels = archive.readText(presRelsPath);
    if (!pres || !presRels) return false;
    const rid = [...archive.readRels(presPath).values()].find(
      (r) => resolveTarget(presPath, r.target) === slide.path
    )?.id;
    if (!rid) return false;
    const sldTag = new RegExp(`<p:sldId\\s[^>]*r:id="${rid}"[^>]*/>`).exec(pres)?.[0];
    if (!sldTag) return false;
    archive.entries.set(presPath, Buffer.from(pres.replace(sldTag, ""), "utf8"));
    const relTag = new RegExp(`<Relationship\\s[^>]*Id="${rid}"[^>]*/>`).exec(presRels)?.[0];
    if (relTag) {
      archive.entries.set(presRelsPath, Buffer.from(presRels.replace(relTag, ""), "utf8"));
    }
    const ctPath = "[Content_Types].xml";
    const ct = archive.readText(ctPath);
    if (ct) {
      const override = new RegExp(
        `<Override PartName="/${slide.path.replace(/[.\\/]/g, "\\$&")}"[^>]*/>`
      ).exec(ct)?.[0];
      if (override) archive.entries.set(ctPath, Buffer.from(ct.replace(override, ""), "utf8"));
    }
    archive.entries.delete(slide.path);
    archive.entries.delete(relsPathFor(slide.path));
    deck.slides.splice(index, 1);
    return true;
  }
  function reorderElement(slide, elementId, dir) {
    const idx = slide.elements.findIndex((e) => e.id === elementId);
    if (idx < 0) return false;
    const to = dir === "front" ? slide.elements.length - 1 : dir === "back" ? 0 : dir === "forward" ? idx + 1 : idx - 1;
    if (to === idx || to < 0 || to >= slide.elements.length) return false;
    const [el] = slide.elements.splice(idx, 1);
    slide.elements.splice(to, 0, el);
    slide.structureDirty = true;
    return true;
  }
  function materializeSlide(opened, slideIndex) {
    const { deck, archive } = opened;
    const slide = deck.slides[slideIndex];
    if (!slide) return null;
    archive.entries.set(slide.path, Buffer.from(patchSlideXml(slide), "utf8"));
    const fresh = parseSlideFromArchive(archive, slide.path);
    if (!fresh) return null;
    deck.slides[slideIndex] = fresh;
    return fresh;
  }
  function connectionPoint(t, idx) {
    const o = t.offset;
    switch (idx) {
      case 0:
        return { x: o.x + o.cx / 2, y: o.y };
      case 1:
        return { x: o.x, y: o.y + o.cy / 2 };
      case 2:
        return { x: o.x + o.cx / 2, y: o.y + o.cy };
      case 3:
        return { x: o.x + o.cx, y: o.y + o.cy / 2 };
      default:
        return { x: o.x + o.cx / 2, y: o.y + o.cy / 2 };
    }
  }
  function updateConnectorsForMoved(slide, movedIds) {
    const movedSpids = /* @__PURE__ */ new Set();
    for (const id of movedIds) {
      const el = slide.elements.find((e) => e.id === id);
      const spid = el ? elementSpid(el) : null;
      if (spid != null) movedSpids.add(spid);
    }
    if (!movedSpids.size) return 0;
    const bySpid = /* @__PURE__ */ new Map();
    for (const e of slide.elements) {
      const spid = elementSpid(e);
      if (spid != null) bySpid.set(spid, e);
    }
    let n = 0;
    for (const el of slide.elements) {
      const cxn = el.connection;
      if (!cxn) continue;
      if (!(cxn.start && movedSpids.has(cxn.start.id) || cxn.end && movedSpids.has(cxn.end.id)))
        continue;
      const t = el.transform;
      const o = t.offset;
      const curStart = { x: t.flipH ? o.x + o.cx : o.x, y: t.flipV ? o.y + o.cy : o.y };
      const curEnd = { x: t.flipH ? o.x : o.x + o.cx, y: t.flipV ? o.y : o.y + o.cy };
      const stTarget = cxn.start ? bySpid.get(cxn.start.id) : void 0;
      const endTarget = cxn.end ? bySpid.get(cxn.end.id) : void 0;
      const p1 = stTarget ? connectionPoint(stTarget.transform, cxn.start.idx) : curStart;
      const p2 = endTarget ? connectionPoint(endTarget.transform, cxn.end.idx) : curEnd;
      t.offset = {
        x: Math.round(Math.min(p1.x, p2.x)),
        y: Math.round(Math.min(p1.y, p2.y)),
        cx: Math.round(Math.abs(p2.x - p1.x)),
        cy: Math.round(Math.abs(p2.y - p1.y))
      };
      t.flipH = p1.x > p2.x;
      t.flipV = p1.y > p2.y;
      el.dirtyTransform = true;
      n++;
    }
    return n;
  }
  function setElementConnection(slide, elementId, patch) {
    const el = slide.elements.find((e) => e.id === elementId);
    if (!el) return false;
    let xml = patchedElementXml(el);
    xml = xml.replace(/<p:cNvCxnSpPr([^>]*)\/>/, "<p:cNvCxnSpPr$1></p:cNvCxnSpPr>");
    const m = /<p:cNvCxnSpPr([^>]*)>([\s\S]*?)<\/p:cNvCxnSpPr>/.exec(xml);
    if (!m) return false;
    const curSt = /<a:stCxn\b[^>]*\/>/.exec(m[2])?.[0] ?? "";
    const curEnd = /<a:endCxn\b[^>]*\/>/.exec(m[2])?.[0] ?? "";
    let rest = m[2].replace(/<a:stCxn\b[^>]*\/>|<a:endCxn\b[^>]*\/>/g, "");
    let locks = "";
    const lockM = /<a:cxnSpLocks\b[^>]*(?:\/>|>[\s\S]*?<\/a:cxnSpLocks>)/.exec(rest);
    if (lockM) {
      locks = lockM[0];
      rest = rest.replace(lockM[0], "");
    }
    const tag = (which, v) => `<a:${which}Cxn id="${v.id}" idx="${v.idx}"/>`;
    const stTag = patch.start === void 0 ? curSt : patch.start ? tag("st", patch.start) : "";
    const endTag = patch.end === void 0 ? curEnd : patch.end ? tag("end", patch.end) : "";
    xml = xml.slice(0, m.index) + `<p:cNvCxnSpPr${m[1]}>${locks}${stTag}${endTag}${rest}</p:cNvCxnSpPr>` + xml.slice(m.index + m[0].length);
    el.dirty = el.dirtyTransform = el.dirtyFill = el.dirtyStroke = false;
    el.dirtyPPr = void 0;
    el.anchor.originalXml = xml;
    const start = patch.start === void 0 ? el.connection?.start : patch.start ?? void 0;
    const end = patch.end === void 0 ? el.connection?.end : patch.end ?? void 0;
    el.connection = start || end ? { ...start ? { start } : {}, ...end ? { end } : {} } : void 0;
    slide.structureDirty = true;
    return true;
  }
  function phSlotKey(type, idx) {
    return type === "title" || type === "ctrTitle" ? "title" : `body:${idx}`;
  }
  function setSlideLayout(opened, slideIndex, layoutPath) {
    const slide = opened.deck.slides[slideIndex];
    if (!slide) return null;
    if (!opened.archive.readText(layoutPath)) return null;
    const relsPath = relsPathFor(slide.path);
    const rels = opened.archive.readText(relsPath);
    if (!rels) return null;
    const relTarget = `../${layoutPath.slice("ppt/".length)}`;
    const existing = new RegExp(
      `<Relationship\\b[^>]*Type="${LAYOUT_REL_TYPE2}"[^>]*/>|<Relationship\\b[^>]*/>`,
      "g"
    );
    let next = null;
    for (const m of rels.matchAll(existing)) {
      if (!m[0].includes("slideLayout")) continue;
      next = rels.slice(0, m.index) + m[0].replace(/\bTarget="[^"]*"/, `Target="${escapeXmlAttr(relTarget)}"`) + rels.slice(m.index + m[0].length);
      break;
    }
    if (!next) {
      let maxRid = 0;
      for (const m of rels.matchAll(/Id="rId(\d+)"/g)) maxRid = Math.max(maxRid, Number(m[1]));
      next = rels.replace(
        "</Relationships>",
        `<Relationship Id="rId${maxRid + 1}" Type="${LAYOUT_REL_TYPE2}" Target="${escapeXmlAttr(relTarget)}"/></Relationships>`
      );
    }
    opened.archive.entries.set(relsPath, Buffer.from(next, "utf8"));
    const layoutPhs = parseLayoutPlaceholders(opened.archive.readText(layoutPath) ?? "");
    const taken = /* @__PURE__ */ new Set();
    let maxId = 1;
    for (const el of slide.elements) {
      const xml = patchedElementXml(el);
      const m = /<p:ph\b([^>]*?)\/?>/.exec(xml);
      const type = m ? /\btype="([^"]*)"/.exec(m[1])?.[1] ?? "" : "";
      if (m && !["ftr", "sldNum", "dt"].includes(type))
        taken.add(phSlotKey(type, /\bidx="([^"]*)"/.exec(m[1])?.[1] ?? ""));
      for (const idm of xml.matchAll(/<p:cNvPr\s[^>]*\bid="(\d+)"/g))
        maxId = Math.max(maxId, Number(idm[1]));
    }
    const missing = layoutPhs.filter((ph) => !taken.has(phSlotKey(ph.type, ph.idx)));
    if (missing.length) {
      const r = appendRawElements(
        opened,
        slideIndex,
        missing.map((ph, i) => placeholderSpXml(ph, maxId + 1 + i))
      );
      if (r) return r.slide;
    }
    return materializeSlide(opened, slideIndex);
  }
  function resetSlideLayout(opened, slideIndex) {
    const slide = opened.deck.slides[slideIndex];
    if (!slide) return null;
    let changed = false;
    for (const el of slide.elements) {
      if (!el.placeholder || el.type !== "text" && el.type !== "shape") continue;
      const xml = patchedElementXml(el);
      const stripped = xml.replace(/<a:xfrm\b[^>]*>[\s\S]*?<\/a:xfrm>/, "");
      if (stripped === xml) continue;
      el.dirty = el.dirtyTransform = el.dirtyFill = el.dirtyStroke = false;
      el.dirtyPPr = void 0;
      el.anchor.originalXml = stripped;
      changed = true;
    }
    if (!changed) return slide;
    slide.structureDirty = true;
    return materializeSlide(opened, slideIndex);
  }
  function setSlideSize(opened, cx, cy) {
    const { deck, archive } = opened;
    const old = deck.size;
    if (old.cx === cx && old.cy === cy) return false;
    const presPath = "ppt/presentation.xml";
    const pres = archive.readText(presPath);
    if (!pres || !/<p:sldSz\b[^>]*\/?>/.test(pres)) return false;
    const next = pres.replace(
      /<p:sldSz\b[^>]*?(\/?)>/,
      (tag) => tag.replace(/\bcx="\d+"/, `cx="${cx}"`).replace(/\bcy="\d+"/, `cy="${cy}"`)
    );
    archive.entries.set(presPath, Buffer.from(next, "utf8"));
    deck.size = { cx, cy };
    const sx = cx / old.cx;
    const sy = cy / old.cy;
    const scaleOffset = (o) => {
      o.x = Math.round(o.x * sx);
      o.y = Math.round(o.y * sy);
      o.cx = Math.round(o.cx * sx);
      o.cy = Math.round(o.cy * sy);
    };
    for (const slide of deck.slides) {
      for (const el of slide.elements) {
        const o = el.transform.offset;
        if (!o.cx && !o.cy) continue;
        scaleOffset(o);
        el.dirtyTransform = true;
      }
    }
    for (const part of listMasterParts(archive)) {
      const partSlide = parseMasterPart(archive, part.partPath);
      if (!partSlide) continue;
      let touched = false;
      for (const el of partSlide.elements) {
        const o = el.transform.offset;
        if (!o.cx && !o.cy) continue;
        scaleOffset(o);
        el.dirtyTransform = true;
        touched = true;
      }
      if (touched) archive.entries.set(part.partPath, Buffer.from(patchSlideXml(partSlide), "utf8"));
    }
    deck.slides.forEach((_, i) => materializeSlide(opened, i));
    return true;
  }
  function appendRawElements(opened, slideIndex, xmls) {
    const slide = opened.deck.slides[slideIndex];
    if (!slide || !xmls.length) return null;
    const before = slide.elements.length;
    for (const xml of xmls) {
      slide.elements.push({
        id: `rawnew_${slide.elements.length}`,
        type: "passthrough",
        kind: "unknown",
        anchor: { spIndex: slide.elements.length, originalXml: xml, range: [0, 0] },
        transform: { offset: { x: 0, y: 0, cx: 0, cy: 0 }, rot: 0, flipH: false, flipV: false }
      });
    }
    slide.structureDirty = true;
    const fresh = materializeSlide(opened, slideIndex);
    if (!fresh) return null;
    return { slide: fresh, elementIds: fresh.elements.slice(before).map((e) => e.id) };
  }
  function addTable(opened, slideIndex, opts) {
    const slide = opened.deck.slides[slideIndex];
    if (!slide) return null;
    const r = appendRawElements(opened, slideIndex, [buildTableXml(slide, opts)]);
    return r ? { slide: r.slide, elementId: r.elementIds[r.elementIds.length - 1] } : null;
  }
  function nthTagSpan(xml, tag, n) {
    const openRe = new RegExp(`<${tag}(?:\\s[^>]*)?>`, "g");
    let m;
    let i = 0;
    while ((m = openRe.exec(xml)) !== null) {
      const close = xml.indexOf(`</${tag}>`, openRe.lastIndex);
      if (close < 0) return null;
      const end = close + `</${tag}>`.length;
      if (i === n) return { start: m.index, end };
      i++;
      openRe.lastIndex = end;
    }
    return null;
  }
  function editTableCellText(slide, elementId, row, col, paragraphs) {
    const el = slide.elements.find((e) => e.id === elementId);
    if (!el || el.type !== "table") return false;
    const table = el;
    const cell = table.rows[row]?.[col];
    if (!cell || cell.merged) return false;
    const xml = el.anchor.originalXml;
    const tr = nthTagSpan(xml, "a:tr", row);
    if (!tr) return false;
    const trXml = xml.slice(tr.start, tr.end);
    const tc = nthTagSpan(trXml, "a:tc", col);
    if (!tc) return false;
    const tcXml = trXml.slice(tc.start, tc.end);
    const txOpen = /<a:txBody(\s[^>]*)?>/.exec(tcXml);
    const txEnd = tcXml.lastIndexOf("</a:txBody>");
    if (!txOpen || txEnd < 0) return false;
    const inner = tcXml.slice(txOpen.index + txOpen[0].length, txEnd);
    const bodyPr = /<a:bodyPr\b(?:[^>]*?)(?:\/>|>[\s\S]*?<\/a:bodyPr>)/.exec(inner)?.[0] ?? "<a:bodyPr/>";
    const lstStyle = /<a:lstStyle\b(?:[^>]*?)(?:\/>|>[\s\S]*?<\/a:lstStyle>)/.exec(inner)?.[0] ?? "";
    const paras = (paragraphs.length ? paragraphs : [{ runs: [{ text: "" }] }]).map((p) => generateParagraphXml(p)).join("");
    const newTc = tcXml.slice(0, txOpen.index + txOpen[0].length) + bodyPr + lstStyle + paras + tcXml.slice(txEnd);
    const newTr = trXml.slice(0, tc.start) + newTc + trXml.slice(tc.end);
    el.anchor.originalXml = xml.slice(0, tr.start) + newTr + xml.slice(tr.end);
    cell.text = {
      ...cell.text ?? { insets: { l: 91440, r: 91440, t: 45720, b: 45720 } },
      paragraphs
    };
    slide.structureDirty = true;
    return true;
  }
  function editTableStyle(slide, elementId, edit) {
    const el = slide.elements.find((e) => e.id === elementId);
    if (!el || el.type !== "table") return false;
    el.anchor.originalXml = patchTableStyleXml(el.anchor.originalXml, edit);
    slide.structureDirty = true;
    return true;
  }
  function ensureTableStylePart(opened, styleId, styleDefXml) {
    const { archive } = opened;
    const path = "ppt/tableStyles.xml";
    const existing = archive.readText(path);
    const next = ensureTableStyleXml(existing, styleId, styleDefXml);
    if (existing === next) return;
    archive.entries.set(path, Buffer.from(next, "utf8"));
    if (existing) return;
    const ctPath = "[Content_Types].xml";
    const ct = archive.readText(ctPath);
    if (ct && !ct.includes(`PartName="/${path}"`)) {
      archive.entries.set(
        ctPath,
        Buffer.from(
          ct.replace(
            "</Types>",
            `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/></Types>`
          ),
          "utf8"
        )
      );
    }
    const presRelsPath = "ppt/_rels/presentation.xml.rels";
    const presRels = archive.readText(presRelsPath);
    if (presRels && !presRels.includes('/relationships/tableStyles"')) {
      let maxRid = 0;
      for (const m of presRels.matchAll(/Id="rId(\d+)"/g)) maxRid = Math.max(maxRid, Number(m[1]));
      const rel = `<Relationship Id="rId${maxRid + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>`;
      archive.entries.set(
        presRelsPath,
        Buffer.from(presRels.replace("</Relationships>", rel + "</Relationships>"), "utf8")
      );
    }
  }
  function editChartElement(opened, slideIndex, elementId, patch) {
    const slide = opened.deck.slides[slideIndex];
    if (!slide) return false;
    const el = slide.elements.find((e) => e.id === elementId);
    if (!el || el.type !== "chart") return false;
    const chartEl = el;
    if (chartEl.descr !== "aislides-chart") return false;
    const { archive } = opened;
    const relsPath = relsPathFor(slide.path);
    const rels = archive.readText(relsPath);
    if (!rels) return false;
    const rIdInFrame = /r:id="([^"]+)"/.exec(el.anchor.originalXml);
    if (!rIdInFrame) return false;
    const rId = rIdInFrame[1];
    const relRe = new RegExp(`Id="${escapeRegex(rId)}"[^>]*Target="([^"]+)"`);
    const relMatch = relRe.exec(rels);
    if (!relMatch) return false;
    const chartPath = resolveTarget(slide.path, relMatch[1]);
    const existing = chartEl.chart;
    const isCombo = existing.kind === "bar" && existing.series.some((s) => s.plotKind === "line");
    const derivedKind = existing.kind === "unknown" ? "bar" : isCombo ? "comboBarLine" : existing.kind === "bar" ? existing.grouping === "percentStacked" ? "barPercentStacked" : existing.grouping === "stacked" ? "barStacked" : "bar" : existing.kind === "pie" ? (existing.holePct ?? 0) > 0 ? "doughnut" : "pie" : existing.kind;
    const kind = patch.kind ?? derivedKind;
    const barDir = patch.barDir ?? (patch.kind == null && existing.kind === "bar" && existing.barDir === "bar" && !isCombo ? "bar" : void 0);
    let categories = patch.categories ?? existing.categories;
    let series = patch.series ?? existing.series.map((s) => ({
      name: s.name ?? "",
      values: s.values.map((v) => v ?? 0)
    }));
    let pointColors = existing.series.map(
      (s) => s.pointColors ? [...s.pointColors] : void 0
    );
    if (patch.pointColors) {
      for (const [si, pts] of Object.entries(patch.pointColors)) {
        const row = pointColors[Number(si)] ??= [];
        for (const [pi, c] of Object.entries(pts)) row[Number(pi)] = c ?? void 0;
      }
    }
    if (patch.switchRowCol) {
      const cats = categories;
      categories = series.map((s) => s.name);
      const transposed = cats.map(
        (_, ci) => pointColors.some((row) => row?.[ci] != null) ? pointColors.map((row) => row?.[ci]) : void 0
      );
      series = cats.map((cat, ci) => ({ name: cat, values: series.map((s) => s.values[ci] ?? 0) }));
      pointColors = transposed;
    }
    const title = patch.title ?? existing.title;
    const legendPos = patch.legendPos ?? (existing.legendPos == null ? "none" : existing.legendPos === "tr" ? "r" : existing.legendPos);
    const dataLabels = patch.dataLabels ?? !!existing.dataLabels;
    const gridlines = patch.gridlines ?? !!existing.valAxis?.gridColor;
    const catAxisTitle = patch.catAxisTitle ?? existing.catAxis?.title;
    const valAxisTitle = patch.valAxisTitle ?? existing.valAxis?.title;
    const gapWidthPct = patch.gapWidthPct ?? existing.gapWidthPct;
    const existingColors = existing.series.map((s) => s.color);
    const colorScheme = patch.colorScheme ?? (existingColors.every((c) => !!c) ? existingColors : void 0);
    const opts = {
      kind,
      ...title !== void 0 ? { title } : {},
      categories,
      series,
      offset: { x: 0, y: 0, cx: 0, cy: 0 },
      legendPos,
      dataLabels,
      gridlines,
      ...catAxisTitle ? { catAxisTitle } : {},
      ...valAxisTitle ? { valAxisTitle } : {},
      ...gapWidthPct != null ? { gapWidthPct } : {},
      ...barDir ? { barDir } : {},
      ...pointColors.some((row) => row?.some((c) => c != null)) ? { pointColors } : {}
    };
    const newXml = buildChartSpaceXmlWithColors(opts, colorScheme);
    archive.entries.set(chartPath, Buffer.from(newXml, "utf8"));
    slide.structureDirty = true;
    return true;
  }
  function markChartEditable(slide, elementId) {
    const el = slide.elements.find((e) => e.id === elementId);
    if (!el || el.type !== "chart") return false;
    const chartEl = el;
    if (chartEl.descr === "aislides-chart") return true;
    const xml = el.anchor.originalXml;
    const m = /<p:cNvPr\b[^>]*\/?>/.exec(xml);
    if (!m) return false;
    const tag = m[0].includes('descr="') ? m[0].replace(/descr="[^"]*"/, 'descr="aislides-chart"') : m[0].replace(/(\/?>)$/, ' descr="aislides-chart"$1');
    el.anchor.originalXml = xml.slice(0, m.index) + tag + xml.slice(m.index + m[0].length);
    chartEl.descr = "aislides-chart";
    slide.structureDirty = true;
    return true;
  }
  function buildChartSpaceXmlWithColors(opts, colorScheme) {
    const base = buildChartSpaceXml(opts);
    if (!colorScheme || !colorScheme.length) return base;
    const lineSerIdx = opts.kind === "comboBarLine" && opts.series.length >= 2 ? opts.series.length - 1 : -1;
    let serIndex = 0;
    return base.replace(/<c:ser>/g, () => {
      const color = colorScheme[serIndex % colorScheme.length].replace("#", "").toUpperCase();
      const fill = `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>`;
      const spPr = serIndex === lineSerIdx ? `<c:spPr><a:ln w="28575">${fill}</a:ln></c:spPr>` : `<c:spPr>${fill}</c:spPr>`;
      serIndex++;
      return `<c:ser>${spPr}`;
    });
  }
  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function getChartElementData(slide, elementId) {
    const el = slide.elements.find((e) => e.id === elementId);
    if (!el || el.type !== "chart") return null;
    const chartEl = el;
    return {
      kind: chartEl.chart.kind,
      title: chartEl.chart.title ?? "",
      categories: chartEl.chart.categories,
      series: chartEl.chart.series.map((s) => ({
        name: s.name ?? "",
        values: s.values.map((v) => v ?? 0)
      })),
      seriesColors: chartEl.chart.series.map((s) => s.color),
      pointColors: chartEl.chart.series.map((s) => s.pointColors ? [...s.pointColors] : void 0)
    };
  }
  function applyFontPatch(paragraphs, patch) {
    for (const p of paragraphs) {
      if (!p.runs.length) p.runs.push({ text: "" });
      for (const r of p.runs) {
        if (patch.fontFamily !== void 0) {
          r.fontFamily = patch.fontFamily;
          delete r.latinFont;
          delete r.eaFont;
          delete r.csFont;
          delete r.fontImplicit;
        }
        if (patch.fontSizePt !== void 0) {
          r.fontSize = patch.fontSizePt;
          delete r.fontSizeImplicit;
        }
        if (patch.strike !== void 0) {
          r.strike = patch.strike;
          if (!patch.strike) delete r.strikeStyle;
        }
        if (patch.bold !== void 0) r.bold = patch.bold;
        if (patch.italic !== void 0) r.italic = patch.italic;
        if (patch.underline !== void 0) {
          r.underline = patch.underline;
          if (!patch.underline) delete r.underlineStyle;
        }
        if (patch.color !== void 0) {
          r.color = patch.color;
          delete r.colorFollowsTheme;
          delete r.colorInherited;
        }
      }
    }
  }
  function setElementFont(slide, elementId, patch) {
    const el = slide.elements.find((e) => e.id === elementId);
    if (!el) return false;
    const apply = (paragraphs) => applyFontPatch(paragraphs, patch);
    if (el.type === "text" || el.type === "shape") {
      const t = el;
      if (!t.text?.paragraphs.length) return false;
      apply(t.text.paragraphs);
      el.dirty = true;
      return true;
    }
    if (el.type === "table") {
      const table = el;
      let changed = false;
      for (let r = 0; r < table.rows.length; r++) {
        const row = table.rows[r];
        for (let c = 0; c < row.length; c++) {
          const cell = row[c];
          if (cell.merged || !cell.text?.paragraphs.length) continue;
          apply(cell.text.paragraphs);
          if (editTableCellText(slide, elementId, r, c, cell.text.paragraphs)) changed = true;
        }
      }
      return changed;
    }
    return false;
  }
  var escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function replaceAllInDeck(deck, find, replace, opts = {}) {
    if (!find) return { count: 0, changedSlides: [] };
    const re = new RegExp(escapeRegExp(find), opts.matchCase ? "g" : "gi");
    let budget = opts.firstOnly ? 1 : Infinity;
    let count = 0;
    const changed = /* @__PURE__ */ new Set();
    const replaceInParagraphs = (paragraphs) => {
      let hit = false;
      for (const p of paragraphs)
        for (const r of p.runs) {
          if (budget <= 0) return hit;
          if (r.field || !r.text) continue;
          re.lastIndex = 0;
          let n = 0;
          const next = r.text.replace(re, (m) => {
            if (n >= budget) return m;
            n++;
            return replace;
          });
          if (n > 0) {
            r.text = next;
            count += n;
            budget -= n;
            hit = true;
          }
        }
      return hit;
    };
    deck.slides.forEach((slide, si) => {
      if (budget <= 0) return;
      if (opts.slideIndex != null && si !== opts.slideIndex) return;
      for (const el of slide.elements) {
        if (budget <= 0) break;
        if (opts.elementId != null && el.id !== opts.elementId) continue;
        if ((el.type === "text" || el.type === "shape") && el.text) {
          if (replaceInParagraphs(el.text.paragraphs)) {
            el.dirty = true;
            changed.add(si);
          }
        } else if (el.type === "table") {
          const table = el;
          for (let ri = 0; ri < table.rows.length; ri++) {
            const row = table.rows[ri];
            for (let ci = 0; ci < row.length; ci++) {
              const cell = row[ci];
              if (cell.merged || !cell.text?.paragraphs.length) continue;
              if (replaceInParagraphs(cell.text.paragraphs)) {
                editTableCellText(slide, el.id, ri, ci, cell.text.paragraphs);
                changed.add(si);
              }
              if (budget <= 0) break;
            }
            if (budget <= 0) break;
          }
        } else if (el.type === "group") {
          for (const child of el.children) {
            if (budget <= 0) break;
            if ((child.type === "text" || child.type === "shape") && child.text) {
              if (replaceInParagraphs(child.text.paragraphs)) {
                patchGroupChildText(slide, el.id, child);
                changed.add(si);
              }
            }
          }
        }
      }
    });
    return { count, changedSlides: [...changed].sort((a, b) => a - b) };
  }
  var BULLET_HANG_EMU = 228600;
  function applyParagraphFormat(paragraphs, patch) {
    const dirty = {};
    for (const p of paragraphs) {
      const mark = (k) => {
        if (p.pPrExplicit) p.pPrExplicit[k] = true;
      };
      if (patch.bullet) {
        if (patch.bullet === "none") {
          p.bullet = { type: "none" };
          p.marL = 0;
          p.indent = 0;
          mark("marL");
          mark("indent");
          dirty.indents = true;
        } else {
          const prev = p.bullet && p.bullet.type !== "none" ? p.bullet : void 0;
          const kept = {
            ...prev?.color ? { color: prev.color } : {},
            ...prev?.sizePct != null ? { sizePct: prev.sizePct } : {},
            ...prev?.font ? { font: prev.font } : {}
          };
          p.bullet = patch.bullet === "number" ? { type: "number", numType: "arabicPeriod", ...kept } : { type: "char", char: patch.bulletChar ?? "\u2022", ...kept };
          const hang = patch.bulletHangEmu ?? BULLET_HANG_EMU;
          if (patch.bulletHangEmu != null || !(p.indent != null && p.indent < 0)) {
            p.marL = hang * ((p.level ?? 0) + 1);
            p.indent = -hang;
            mark("marL");
            mark("indent");
            dirty.indents = true;
          }
        }
        mark("bullet");
        dirty.bullet = true;
      } else if (patch.bulletHangEmu != null) {
        const hasBullet = p.bullet && p.bullet.type !== "none";
        if (hasBullet || p.indent != null && p.indent < 0) {
          p.marL = patch.bulletHangEmu * ((p.level ?? 0) + 1);
          p.indent = -patch.bulletHangEmu;
          mark("marL");
          mark("indent");
          dirty.indents = true;
        }
      }
      if (patch.bulletSizePct != null || patch.bulletColor) {
        if (p.bullet && p.bullet.type !== "none") {
          if (patch.bulletSizePct != null) p.bullet.sizePct = patch.bulletSizePct;
          if (patch.bulletColor) p.bullet.color = patch.bulletColor;
          mark("bullet");
          dirty.bullet = true;
        }
      }
      if (patch.lineSpacingPct != null) {
        p.lineHeight = patch.lineSpacingPct;
        delete p.lineExact;
        mark("lnSpc");
        dirty.lnSpc = true;
      }
      if (patch.spaceBeforePt != null) {
        p.spaceBefore = patch.spaceBeforePt;
        delete p.spaceBeforePct;
        mark("spcBef");
        dirty.spcBef = true;
      }
      if (patch.spaceAfterPt != null) {
        p.spaceAfter = patch.spaceAfterPt;
        delete p.spaceAfterPct;
        mark("spcAft");
        dirty.spcAft = true;
      }
      if (patch.align) {
        p.align = patch.align;
        mark("align");
        dirty.align = true;
      }
      if (patch.indentDelta) {
        const lvl = Math.max(0, Math.min(8, (p.level ?? 0) + patch.indentDelta));
        if (lvl !== (p.level ?? 0)) {
          p.level = lvl || void 0;
          dirty.level = true;
          if (p.pPrExplicit?.marL && p.indent != null && p.indent < 0) {
            p.marL = -p.indent * (lvl + 1);
            dirty.indents = true;
          }
        }
      }
    }
    return dirty;
  }
  function mergePPrDirty(el, d) {
    if (!Object.keys(d).length) return;
    const indices = el.dirtyPPr == null ? d.paraIndices : el.dirtyPPr.paraIndices && d.paraIndices ? [.../* @__PURE__ */ new Set([...el.dirtyPPr.paraIndices, ...d.paraIndices])] : void 0;
    el.dirtyPPr = { ...el.dirtyPPr, ...d };
    if (indices) el.dirtyPPr.paraIndices = indices;
    else delete el.dirtyPPr.paraIndices;
  }
  function setElementParagraphFormat(slide, elementId, patch, paraIndices) {
    const el = slide.elements.find((e) => e.id === elementId);
    if (!el) return false;
    if (el.type === "text" || el.type === "shape") {
      const t = el;
      if (!t.text?.paragraphs.length) return false;
      const target = paraIndices ? paraIndices.map((i) => t.text.paragraphs[i]).filter((p) => !!p) : t.text.paragraphs;
      if (!target.length) return false;
      const dirty = applyParagraphFormat(target, patch);
      if (paraIndices && Object.keys(dirty).length) dirty.paraIndices = paraIndices;
      mergePPrDirty(el, dirty);
      return !!el.dirtyPPr;
    }
    if (el.type === "table") {
      const table = el;
      let changed = false;
      for (let r = 0; r < table.rows.length; r++) {
        const row = table.rows[r];
        for (let c = 0; c < row.length; c++) {
          const cell = row[c];
          if (cell.merged || !cell.text?.paragraphs.length) continue;
          applyParagraphFormat(cell.text.paragraphs, patch);
          if (editTableCellText(slide, elementId, r, c, cell.text.paragraphs)) changed = true;
        }
      }
      return changed;
    }
    return false;
  }
  function setGroupChildParagraphFormat(slide, groupId, childId, patch, paraIndices) {
    const found = findGroupChild(slide, groupId, childId);
    const child = found?.child;
    if (!child || child.type !== "text" && child.type !== "shape") return false;
    const t = child;
    if (!t.text?.paragraphs.length) return false;
    const target = paraIndices ? paraIndices.map((i) => t.text.paragraphs[i]).filter((p) => !!p) : t.text.paragraphs;
    if (!target.length) return false;
    const dirty = applyParagraphFormat(target, patch);
    if (!Object.keys(dirty).length) return false;
    if (paraIndices) dirty.paraIndices = paraIndices;
    if (!patchGroupChildXml(
      found.grp,
      t,
      (xml) => patchElementPPr(t, xml, dirty) ?? rebuildTxBody(t, xml)
    )) {
      return false;
    }
    slide.structureDirty = true;
    return true;
  }
  function tableHasMerges(xml) {
    return /\b(?:gridSpan|rowSpan|hMerge|vMerge)="/.test(xml);
  }
  function clearTcText(xml) {
    return xml.replace(
      /<a:txBody(\s[^>]*)?>[\s\S]*?<\/a:txBody>/g,
      "<a:txBody><a:bodyPr/><a:lstStyle/><a:p/></a:txBody>"
    );
  }
  function bumpFrameExt(xml, attr, delta) {
    const m = /<p:xfrm[^>]*>[\s\S]*?<a:ext\s[^>]*\/>/.exec(xml);
    if (!m) return xml;
    const patched = m[0].replace(
      new RegExp(`\\b${attr}="(-?\\d+)"`),
      (_a, v) => `${attr}="${Math.max(1, Number(v) + delta)}"`
    );
    return xml.slice(0, m.index) + patched + xml.slice(m.index + m[0].length);
  }
  function editTableStructure(opened, slideIndex, elementId, op) {
    const slide = opened.deck.slides[slideIndex];
    if (!slide) return null;
    const elIndex = slide.elements.findIndex((e) => e.id === elementId);
    const el = slide.elements[elIndex];
    if (!el || el.type !== "table") return null;
    let xml = patchedElementXml(el);
    if (tableHasMerges(xml)) return null;
    const trSpans = [];
    for (let i = 0; ; i++) {
      const span = nthTagSpan(xml, "a:tr", i);
      if (!span) break;
      trSpans.push(span);
    }
    const nRows = trSpans.length;
    const gridColRe = /<a:gridCol\s[^>]*\/>/g;
    const gridCols = [...xml.matchAll(gridColRe)];
    const nCols = gridCols.length;
    if (!nRows || !nCols) return null;
    if (op.kind === "insert-row" || op.kind === "delete-row") {
      const at = op.index;
      const ref = trSpans[at];
      if (!ref) return null;
      const refXml = xml.slice(ref.start, ref.end);
      const rowH = Number(/<a:tr\s[^>]*\bh="(\d+)"/.exec(refXml)?.[1] ?? 0);
      if (op.kind === "insert-row") {
        const clone = clearTcText(refXml);
        const insertAt = op.before ? ref.start : ref.end;
        xml = xml.slice(0, insertAt) + clone + xml.slice(insertAt);
        xml = bumpFrameExt(xml, "cy", rowH);
      } else {
        if (nRows <= 1) return null;
        xml = xml.slice(0, ref.start) + xml.slice(ref.end);
        xml = bumpFrameExt(xml, "cy", -rowH);
      }
    } else {
      const at = op.index;
      const refCol = gridCols[at];
      if (!refCol) return null;
      const colW = Number(/\bw="(\d+)"/.exec(refCol[0])?.[1] ?? 0);
      if (op.kind === "delete-col" && nCols <= 1) return null;
      for (let r = nRows - 1; r >= 0; r--) {
        const tr = nthTagSpan(xml, "a:tr", r);
        if (!tr) return null;
        const trXml = xml.slice(tr.start, tr.end);
        const tc = nthTagSpan(trXml, "a:tc", at);
        if (!tc) return null;
        let newTr;
        if (op.kind === "insert-col") {
          const clone = clearTcText(trXml.slice(tc.start, tc.end));
          const insertAt = op.before ? tc.start : tc.end;
          newTr = trXml.slice(0, insertAt) + clone + trXml.slice(insertAt);
        } else {
          newTr = trXml.slice(0, tc.start) + trXml.slice(tc.end);
        }
        xml = xml.slice(0, tr.start) + newTr + xml.slice(tr.end);
      }
      const gc = [...xml.matchAll(gridColRe)][at];
      if (op.kind === "insert-col") {
        const insertAt = op.before ? gc.index : gc.index + gc[0].length;
        xml = xml.slice(0, insertAt) + gc[0] + xml.slice(insertAt);
        xml = bumpFrameExt(xml, "cx", colW);
      } else {
        xml = xml.slice(0, gc.index) + xml.slice(gc.index + gc[0].length);
        xml = bumpFrameExt(xml, "cx", -colW);
      }
    }
    el.dirty = el.dirtyTransform = el.dirtyFill = el.dirtyStroke = false;
    el.dirtyPPr = void 0;
    el.anchor.originalXml = xml;
    slide.structureDirty = true;
    const fresh = materializeSlide(opened, slideIndex);
    if (!fresh) return null;
    const newEl = fresh.elements[elIndex];
    if (!newEl) return null;
    return { slide: fresh, elementId: newEl.id };
  }
  var tcAttr = (tcOpen, name) => {
    const m = new RegExp(`\\b${name}="(\\d+)"`).exec(tcOpen);
    return m ? Number(m[1]) : 0;
  };
  function setTcAttrXml(tcXml, name, val) {
    return tcXml.replace(/<a:tc(\s[^>]*)?>/, (open2) => {
      const cleaned = open2.replace(new RegExp(`\\s${name}="[^"]*"`), "");
      if (val == null) return cleaned;
      return cleaned.replace(/^<a:tc/, `<a:tc ${name}="${val}"`);
    });
  }
  function tcParagraphsXml(tcXml) {
    const body = /<a:txBody(?:\s[^>]*)?>([\s\S]*?)<\/a:txBody>/.exec(tcXml)?.[1] ?? "";
    const paras = body.match(/<a:p>[\s\S]*?<\/a:p>|<a:p\/>/g) ?? [];
    return paras.filter((p) => /<a:t>(?=[^<]*\S)[^<]*<\/a:t>/.test(p)).join("");
  }
  function mergeTableCells(opened, slideIndex, elementId, op) {
    const slide = opened.deck.slides[slideIndex];
    if (!slide) return null;
    const elIndex = slide.elements.findIndex((e) => e.id === elementId);
    const el = slide.elements[elIndex];
    if (!el || el.type !== "table") return null;
    let xml = patchedElementXml(el);
    const tr = nthTagSpan(xml, "a:tr", op.row);
    if (!tr) return null;
    let trXml = xml.slice(tr.start, tr.end);
    const anchorSpan = nthTagSpan(trXml, "a:tc", op.col);
    if (!anchorSpan) return null;
    let anchorXml = trXml.slice(anchorSpan.start, anchorSpan.end);
    const anchorOpen = /<a:tc(\s[^>]*)?>/.exec(anchorXml)[0];
    if (/\b[hv]Merge="/.test(anchorOpen)) return null;
    const g = tcAttr(anchorOpen, "gridSpan") || 1;
    const v = tcAttr(anchorOpen, "rowSpan") || 1;
    const isPlainTc = (tcXml) => !/\b(?:gridSpan|rowSpan|hMerge|vMerge)="/.test(/<a:tc(\s[^>]*)?>/.exec(tcXml)[0]);
    const toCovered = (tcXml, mark) => setTcAttrXml(clearTcText(tcXml), mark, 1);
    const appendToAnchor = (parasXml) => {
      if (parasXml) anchorXml = anchorXml.replace(/<\/a:txBody>/, `${parasXml}</a:txBody>`);
    };
    if (op.kind === "merge-right") {
      if (v !== 1) return null;
      const target = nthTagSpan(trXml, "a:tc", op.col + g);
      if (!target) return null;
      const targetXml = trXml.slice(target.start, target.end);
      if (!isPlainTc(targetXml)) return null;
      appendToAnchor(tcParagraphsXml(targetXml));
      anchorXml = setTcAttrXml(anchorXml, "gridSpan", g + 1);
      trXml = trXml.slice(0, anchorSpan.start) + anchorXml + trXml.slice(anchorSpan.end, target.start) + toCovered(targetXml, "hMerge") + trXml.slice(target.end);
      xml = xml.slice(0, tr.start) + trXml + xml.slice(tr.end);
    } else if (op.kind === "merge-down") {
      if (g !== 1) return null;
      const tr2 = nthTagSpan(xml, "a:tr", op.row + v);
      if (!tr2) return null;
      let tr2Xml = xml.slice(tr2.start, tr2.end);
      const target = nthTagSpan(tr2Xml, "a:tc", op.col);
      if (!target) return null;
      const targetXml = tr2Xml.slice(target.start, target.end);
      if (!isPlainTc(targetXml)) return null;
      appendToAnchor(tcParagraphsXml(targetXml));
      anchorXml = setTcAttrXml(anchorXml, "rowSpan", v + 1);
      trXml = trXml.slice(0, anchorSpan.start) + anchorXml + trXml.slice(anchorSpan.end);
      tr2Xml = tr2Xml.slice(0, target.start) + toCovered(targetXml, "vMerge") + tr2Xml.slice(target.end);
      xml = xml.slice(0, tr2.start) + tr2Xml + xml.slice(tr2.end);
      xml = xml.slice(0, tr.start) + trXml + xml.slice(tr.end);
    } else {
      if (g <= 1 && v <= 1) return null;
      for (let r = op.row + v - 1; r >= op.row; r--) {
        const rowSpanRef = nthTagSpan(xml, "a:tr", r);
        if (!rowSpanRef) return null;
        let rowXml = xml.slice(rowSpanRef.start, rowSpanRef.end);
        for (let c = op.col + g - 1; c >= op.col; c--) {
          const span = nthTagSpan(rowXml, "a:tc", c);
          if (!span) return null;
          let tcXml = rowXml.slice(span.start, span.end);
          if (r === op.row && c === op.col) {
            tcXml = setTcAttrXml(setTcAttrXml(tcXml, "gridSpan", null), "rowSpan", null);
          } else {
            tcXml = setTcAttrXml(setTcAttrXml(tcXml, "hMerge", null), "vMerge", null);
          }
          rowXml = rowXml.slice(0, span.start) + tcXml + rowXml.slice(span.end);
        }
        xml = xml.slice(0, rowSpanRef.start) + rowXml + xml.slice(rowSpanRef.end);
      }
    }
    el.dirty = el.dirtyTransform = el.dirtyFill = el.dirtyStroke = false;
    el.dirtyPPr = void 0;
    el.anchor.originalXml = xml;
    slide.structureDirty = true;
    const fresh = materializeSlide(opened, slideIndex);
    if (!fresh) return null;
    const newEl = fresh.elements[elIndex];
    if (!newEl) return null;
    return { slide: fresh, elementId: newEl.id };
  }
  function setTableColWidth(slide, elementId, col, wEmu) {
    const el = slide.elements.find((e) => e.id === elementId);
    if (!el || el.type !== "table") return false;
    const table = el;
    if (col < 0 || col >= table.colWidths.length) return false;
    let xml = patchedElementXml(el);
    const gc = [...xml.matchAll(/<a:gridCol\s[^>]*\/>/g)][col];
    if (!gc) return false;
    el.dirty = el.dirtyTransform = el.dirtyFill = el.dirtyStroke = false;
    el.dirtyPPr = void 0;
    const w = Math.max(1, Math.round(wEmu));
    const patched = gc[0].replace(/\bw="-?\d+"/, `w="${w}"`);
    xml = xml.slice(0, gc.index) + patched + xml.slice(gc.index + gc[0].length);
    table.colWidths[col] = w;
    const sum = table.colWidths.reduce((a, b) => a + b, 0);
    xml = xml.replace(
      /(<p:xfrm[^>]*>[\s\S]*?<a:ext\s[^>]*\bcx=")-?\d+(")/,
      (_a, pre, post) => `${pre}${sum}${post}`
    );
    el.anchor.originalXml = xml;
    el.transform.offset.cx = sum;
    slide.structureDirty = true;
    return true;
  }
  function setTableRowHeight(slide, elementId, row, hEmu) {
    const el = slide.elements.find((e) => e.id === elementId);
    if (!el || el.type !== "table") return false;
    const table = el;
    if (row < 0 || row >= table.rowHeights.length) return false;
    let xml = patchedElementXml(el);
    const tr = nthTagSpan(xml, "a:tr", row);
    if (!tr) return false;
    el.dirty = el.dirtyTransform = el.dirtyFill = el.dirtyStroke = false;
    el.dirtyPPr = void 0;
    const h = Math.max(1, Math.round(hEmu));
    const trOpen = /<a:tr(\s[^>]*)?>/.exec(xml.slice(tr.start, tr.end))[0];
    const patchedOpen = /\bh="-?\d+"/.test(trOpen) ? trOpen.replace(/\bh="-?\d+"/, `h="${h}"`) : trOpen.replace(/^<a:tr/, `<a:tr h="${h}"`);
    xml = xml.slice(0, tr.start) + patchedOpen + xml.slice(tr.start + trOpen.length);
    table.rowHeights[row] = h;
    const sum = table.rowHeights.reduce((a, b) => a + b, 0);
    xml = xml.replace(
      /(<p:xfrm[^>]*>[\s\S]*?<a:ext\s[^>]*\bcy=")-?\d+(")/,
      (_a, pre, post) => `${pre}${sum}${post}`
    );
    el.anchor.originalXml = xml;
    el.transform.offset.cy = sum;
    slide.structureDirty = true;
    return true;
  }
  function scaleToSum(values, target) {
    const sum = values.reduce((a, b) => a + b, 0);
    if (sum <= 0) return values;
    const out = values.map((v) => Math.max(1, Math.round(v * target / sum)));
    const drift = target - out.reduce((a, b) => a + b, 0);
    out[out.length - 1] = Math.max(1, out[out.length - 1] + drift);
    return out;
  }
  function resizeTable(slide, elementId, cx, cy) {
    const el = slide.elements.find((e) => e.id === elementId);
    if (!el || el.type !== "table") return false;
    const table = el;
    if (!table.colWidths.length || !table.rowHeights.length) return false;
    const targetCx = Math.max(table.colWidths.length, Math.round(cx));
    const targetCy = Math.max(table.rowHeights.length, Math.round(cy));
    let xml = patchedElementXml(el);
    el.dirty = el.dirtyTransform = el.dirtyFill = el.dirtyStroke = false;
    el.dirtyPPr = void 0;
    const widths = scaleToSum(table.colWidths, targetCx);
    let ci = 0;
    xml = xml.replace(
      /<a:gridCol\s[^>]*\/>/g,
      (m) => ci < widths.length ? m.replace(/\bw="-?\d+"/, `w="${widths[ci++]}"`) : m
    );
    const heights = scaleToSum(table.rowHeights, targetCy);
    let ri = 0;
    xml = xml.replace(/<a:tr(\s[^>]*)?>/g, (m) => {
      if (ri >= heights.length) return m;
      const h = heights[ri++];
      return /\bh="-?\d+"/.test(m) ? m.replace(/\bh="-?\d+"/, `h="${h}"`) : m.replace(/^<a:tr/, `<a:tr h="${h}"`);
    });
    const sumW = widths.reduce((a, b) => a + b, 0);
    const sumH = heights.reduce((a, b) => a + b, 0);
    xml = xml.replace(
      /(<p:xfrm[^>]*>[\s\S]*?<a:ext\s[^>]*\bcx=")-?\d+(")/,
      (_a, pre, post) => `${pre}${sumW}${post}`
    );
    xml = xml.replace(
      /(<p:xfrm[^>]*>[\s\S]*?<a:ext\s[^>]*\bcy=")-?\d+(")/,
      (_a, pre, post) => `${pre}${sumH}${post}`
    );
    table.colWidths = widths;
    table.rowHeights = heights;
    el.anchor.originalXml = xml;
    el.transform.offset.cx = sumW;
    el.transform.offset.cy = sumH;
    slide.structureDirty = true;
    return true;
  }
  function setTableCellAnchor(slide, elementId, row, col, anchor) {
    const el = slide.elements.find((e) => e.id === elementId);
    if (!el || el.type !== "table") return false;
    const table = el;
    const cell = table.rows[row]?.[col];
    if (!cell || cell.merged) return false;
    let xml = patchedElementXml(el);
    const tr = nthTagSpan(xml, "a:tr", row);
    if (!tr) return false;
    let trXml = xml.slice(tr.start, tr.end);
    const tc = nthTagSpan(trXml, "a:tc", col);
    if (!tc) return false;
    let tcXml = trXml.slice(tc.start, tc.end);
    const val = anchor === "middle" ? "ctr" : anchor === "bottom" ? "b" : "t";
    const tcPr = /<a:tcPr(\s[^>]*)?\/?>/.exec(tcXml);
    if (tcPr) {
      let tag = tcPr[0].replace(/\s+anchor="[^"]*"/, "");
      tag = tag.replace(/^<a:tcPr/, `<a:tcPr anchor="${val}"`);
      tcXml = tcXml.slice(0, tcPr.index) + tag + tcXml.slice(tcPr.index + tcPr[0].length);
    } else {
      tcXml = tcXml.replace(/<\/a:tc>$/, `<a:tcPr anchor="${val}"/></a:tc>`);
    }
    trXml = trXml.slice(0, tc.start) + tcXml + trXml.slice(tc.end);
    xml = xml.slice(0, tr.start) + trXml + xml.slice(tr.end);
    el.dirty = el.dirtyTransform = el.dirtyFill = el.dirtyStroke = false;
    el.dirtyPPr = void 0;
    el.anchor.originalXml = xml;
    if (cell.text) cell.text.anchor = anchor;
    slide.structureDirty = true;
    return true;
  }
  var RID_ATTR_RE = /\br:(?:embed|link|id)="(rId\d+)"/g;
  function copyElementData(opened, slide, el) {
    const xml = patchedElementXml(el);
    const slideRels = opened.archive.readRels(slide.path);
    const rels = [];
    const seen = /* @__PURE__ */ new Set();
    for (const m of xml.matchAll(RID_ATTR_RE)) {
      const rid = m[1];
      if (seen.has(rid)) continue;
      seen.add(rid);
      const rel = slideRels.get(rid);
      if (!rel) continue;
      const external = rel.targetMode === "External";
      rels.push({
        rid,
        type: rel.type,
        target: external ? rel.target : resolveTarget(slide.path, rel.target),
        ...external ? { external: true } : {}
      });
    }
    return { xml, rels };
  }
  function relTargetFromSlide(absTarget) {
    return absTarget.startsWith("ppt/") ? `../${absTarget.slice(4)}` : `/${absTarget}`;
  }
  function pasteElements(opened, slideIndex, items, shiftEmu) {
    const { archive, deck } = opened;
    const slide = deck.slides[slideIndex];
    if (!slide || !items.length) return null;
    const relsPath = relsPathFor(slide.path);
    let relsXml = archive.readText(relsPath) ?? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    let relsDirty = false;
    let maxRid = 0;
    for (const m of relsXml.matchAll(/Id="rId(\d+)"/g)) maxRid = Math.max(maxRid, Number(m[1]));
    const byKey = /* @__PURE__ */ new Map();
    for (const rel of archive.readRels(slide.path).values()) {
      const abs = rel.targetMode === "External" ? rel.target : resolveTarget(slide.path, rel.target);
      byKey.set(`${rel.type} ${abs}`, rel.id);
    }
    let nextId = nextCNvPrId(slide);
    const xmls = items.map((item) => {
      let xml = item.xml;
      for (const rel of item.rels) {
        const key = `${rel.type} ${rel.target}`;
        let rid = byKey.get(key);
        if (!rid) {
          rid = `rId${++maxRid}`;
          const target = rel.external ? rel.target : relTargetFromSlide(rel.target);
          const mode = rel.external ? ' TargetMode="External"' : "";
          relsXml = relsXml.replace(
            "</Relationships>",
            `<Relationship Id="${rid}" Type="${rel.type}" Target="${escapeXmlAttr(target)}"${mode}/></Relationships>`
          );
          relsDirty = true;
          byKey.set(key, rid);
        }
        if (rid !== rel.rid) {
          xml = xml.replace(new RegExp(`\\br:(embed|link|id)="${rel.rid}"`, "g"), `r:$1="${rid}"`);
        }
      }
      xml = xml.replace(
        /(<p:cNvPr\s[^>]*\bid=")\d+(")/g,
        (_a, pre, post) => `${pre}${nextId++}${post}`
      );
      xml = xml.replace(
        /<a:off\b[^>]*\/>/,
        (tag) => tag.replace(/\bx="(-?\d+)"/, (_m, v) => `x="${Number(v) + shiftEmu.dx}"`).replace(/\by="(-?\d+)"/, (_m, v) => `y="${Number(v) + shiftEmu.dy}"`)
      );
      return xml;
    });
    if (relsDirty) archive.entries.set(relsPath, Buffer.from(relsXml, "utf8"));
    return appendRawElements(opened, slideIndex, xmls);
  }
  function setSlideTransition(slide, kind) {
    slide.bodySuffix = patchSlideTransitionXml(slide.bodySuffix, kind);
    slide.structureDirty = true;
  }
  function getSlideTransition(slide) {
    return readSlideTransitionXml(slide.bodySuffix);
  }
  function setSlideAdvanceTime(slide, ms) {
    slide.bodySuffix = patchSlideAdvanceTimeXml(slide.bodySuffix, ms);
    slide.structureDirty = true;
  }
  function setSlideHidden(slide, hidden) {
    slide.bodyPrefix = patchSlideHiddenXml(slide.bodyPrefix, hidden);
    slide.structureDirty = true;
  }
  function groupElements(opened, slideIndex, sourceIds) {
    const slide = opened.deck.slides[slideIndex];
    if (!slide || sourceIds.length < 2) return null;
    const GROUPABLE = /* @__PURE__ */ new Set(["text", "shape", "picture"]);
    const targets = sourceIds.map((id) => slide.elements.find((e) => e.id === id)).filter(Boolean);
    if (targets.length < 2) return null;
    if (targets.some((e) => !GROUPABLE.has(e.type))) return null;
    const bbox = calcBoundingBox(targets);
    const childrenXml = targets.map((e) => patchedElementXml(e)).join("");
    const grpXml = buildGrpSpXml(slide, bbox, childrenXml);
    const idSet = new Set(sourceIds);
    slide.elements = slide.elements.filter((e) => !idSet.has(e.id));
    const result = appendRawElements(opened, slideIndex, [grpXml]);
    if (!result) return null;
    return { slide: result.slide, groupId: result.elementIds[result.elementIds.length - 1] };
  }
  function ungroupElement(opened, slideIndex, sourceId) {
    const slide = opened.deck.slides[slideIndex];
    if (!slide) return null;
    const groupEl = slide.elements.find((e) => e.id === sourceId);
    if (!groupEl || groupEl.type !== "group") return null;
    const grp = groupEl;
    const gOff = grp.transform.offset;
    const chOff = grp.childOffset ?? { x: 0, y: 0, cx: gOff.cx, cy: gOff.cy };
    const scaleX = chOff.cx > 0 ? gOff.cx / chOff.cx : 1;
    const scaleY = chOff.cy > 0 ? gOff.cy / chOff.cy : 1;
    const childXmls = sliceGroupChildXmls(grp.anchor.originalXml);
    const liftedXmls = [];
    for (let i = 0; i < childXmls.length; i++) {
      const childXml = childXmls[i];
      const child = grp.children[i];
      if (!child) {
        liftedXmls.push(childXml);
        continue;
      }
      const co = child.transform.offset;
      const slideX = Math.round((co.x - chOff.x) * scaleX + gOff.x);
      const slideY = Math.round((co.y - chOff.y) * scaleY + gOff.y);
      const slideCx = Math.round(co.cx * scaleX);
      const slideCy = Math.round(co.cy * scaleY);
      const newXml = patchElementXfrmDirect(
        childXml,
        slideX,
        slideY,
        slideCx,
        slideCy,
        child.transform.rot
      );
      liftedXmls.push(newXml);
    }
    slide.elements = slide.elements.filter((e) => e.id !== sourceId);
    if (liftedXmls.length === 0) {
      slide.structureDirty = true;
      return materializeSlide(opened, slideIndex);
    }
    const result = appendRawElements(opened, slideIndex, liftedXmls);
    return result?.slide ?? null;
  }
  function patchElementXfrmDirect(xml, x, y, cx, cy, rot) {
    const xfrmRe = /(<(?:a|p):xfrm\b[^>]*>)([\s\S]*?)(<\/(?:a|p):xfrm>)/;
    const m = xfrmRe.exec(xml);
    if (!m) return xml;
    const openTag = m[1];
    const closeTag = m[3];
    const chOff = /<a:chOff\b[^>]*\/>/.exec(m[2])?.[0] ?? "";
    const chExt = /<a:chExt\b[^>]*\/>/.exec(m[2])?.[0] ?? "";
    const inner = `<a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/>` + chOff + chExt;
    const rotAttr = rot ? ` rot="${rot}"` : "";
    const flipH = /flipH="1"/.test(openTag) ? ' flipH="1"' : "";
    const flipV = /flipV="1"/.test(openTag) ? ' flipV="1"' : "";
    const tag = openTag.startsWith("<a:") ? "a:xfrm" : "p:xfrm";
    const newOpen = `<${tag}${rotAttr}${flipH}${flipV}>`;
    return xml.slice(0, m.index) + newOpen + inner + closeTag + xml.slice(m.index + m[0].length);
  }
  function elementEnd(xml, start, tag) {
    const re = new RegExp(`<${tag}(?=[\\s/>])[^>]*>|</${tag}>`, "g");
    re.lastIndex = start;
    let depth = 0;
    for (let m = re.exec(xml); m; m = re.exec(xml)) {
      if (m[0].startsWith("</")) {
        if (--depth === 0) return m.index + m[0].length;
      } else if (m[0].endsWith("/>")) {
        if (depth === 0) return m.index + m[0].length;
      } else {
        depth++;
      }
    }
    return -1;
  }
  function groupChildSlices(grpXml) {
    const prEnd = grpXml.indexOf("</p:grpSpPr>");
    let pos = prEnd >= 0 ? prEnd + "</p:grpSpPr>".length : 0;
    const openRe = /<p:(sp|pic|grpSp|graphicFrame|cxnSp)(?=[\s/>])/g;
    const slices = [];
    for (; ; ) {
      openRe.lastIndex = pos;
      const m = openRe.exec(grpXml);
      if (!m) break;
      const end = elementEnd(grpXml, m.index, `p:${m[1]}`);
      if (end < 0) break;
      const xml = grpXml.slice(m.index, end);
      const nvId = /<p:cNvPr\b[^>]*\bid="([^"]+)"/.exec(xml)?.[1];
      slices.push({ start: m.index, end, xml, ...nvId != null ? { nvId } : {} });
      pos = end;
    }
    return slices;
  }
  function patchGroupChildXml(grp, child, patch) {
    if (!child.nvId) return false;
    const grpXml = grp.anchor.originalXml;
    const slice = groupChildSlices(grpXml).find((s) => s.nvId === child.nvId);
    if (!slice) return false;
    grp.anchor.originalXml = grpXml.slice(0, slice.start) + patch(slice.xml) + grpXml.slice(slice.end);
    return true;
  }
  function findGroupChild(slide, groupId, childId) {
    const grp = slide.elements.find((e) => e.id === groupId && e.type === "group");
    const child = grp?.children.find((c) => c.id === childId);
    return grp && child ? { grp, child } : null;
  }
  function editGroupChildTransform(slide, groupId, childId, offset, rotationDeg) {
    const found = findGroupChild(slide, groupId, childId);
    if (!found) return false;
    const { grp, child } = found;
    const prev = child.transform;
    child.transform = { ...child.transform, offset, rot: Math.round(rotationDeg * 6e4) };
    if (!patchGroupChildXml(grp, child, (xml) => patchElementXfrm(child, xml))) {
      child.transform = prev;
      return false;
    }
    slide.structureDirty = true;
    return true;
  }
  function patchGroupChildText(slide, groupId, child) {
    const grp = slide.elements.find((e) => e.id === groupId && e.type === "group");
    if (!grp) return false;
    if (!patchGroupChildXml(grp, child, (xml) => patchTextElementXml(child, xml))) return false;
    slide.structureDirty = true;
    return true;
  }
  function setGroupChildFont(slide, groupId, childId, patch) {
    const found = findGroupChild(slide, groupId, childId);
    const child = found?.child;
    if (!child || child.type !== "text" && child.type !== "shape") return false;
    const t = child;
    if (!t.text?.paragraphs.length) return false;
    applyFontPatch(t.text.paragraphs, patch);
    return patchGroupChildText(slide, groupId, t);
  }
  function editGroupChildFill(slide, groupId, childId, fill) {
    const found = findGroupChild(slide, groupId, childId);
    const child = found?.child;
    if (!child || child.type !== "text" && child.type !== "shape") return false;
    child.fill = typeof fill === "string" ? fill === "none" ? { type: "none" } : { type: "solid", color: fill } : {
      type: "gradient",
      stops: fill.stops,
      ...fill.angle != null ? { angle: fill.angle } : {},
      ...fill.radial ? { path: "circle" } : {}
    };
    if (!patchGroupChildXml(found.grp, child, (xml) => patchElementFill(xml, fill))) return false;
    slide.structureDirty = true;
    return true;
  }
  function editGroupChildStroke(slide, groupId, childId, stroke) {
    const found = findGroupChild(slide, groupId, childId);
    const child = found?.child;
    if (!child || child.type !== "text" && child.type !== "shape" && child.type !== "picture")
      return false;
    const t = child;
    t.stroke = stroke ? {
      fill: { type: "solid", color: stroke.color },
      width: stroke.widthEmu,
      ...stroke.dash ? { dash: stroke.dash } : {}
    } : void 0;
    if (!patchGroupChildXml(found.grp, child, (xml) => patchElementStroke(xml, stroke))) return false;
    slide.structureDirty = true;
    return true;
  }

  // ../engine/pptx-render/coords.ts
  var EMU_PER_PX_96 = 9525;
  var EMU_PER_PT2 = 12700;
  function emuToPx(emu, scale = 1) {
    return emu / EMU_PER_PX_96 * scale;
  }
  function ptToPx(pt, scale = 1) {
    return pt * 96 / 72 * scale;
  }
  function rotToDeg(rot) {
    return rot / 6e4;
  }
  function makeViewport(size, fitWidthPx) {
    const baseWidthPx = size.cx / EMU_PER_PX_96;
    const scale = fitWidthPx / baseWidthPx;
    return {
      widthPx: fitWidthPx,
      heightPx: size.cy / EMU_PER_PX_96 * scale,
      scale
    };
  }
  function rectToPx(r, vp) {
    return {
      x: emuToPx(r.x, vp.scale),
      y: emuToPx(r.y, vp.scale),
      w: emuToPx(r.cx, vp.scale),
      h: emuToPx(r.cy, vp.scale)
    };
  }
  function placeTransform(t, vp, parent = { x: 0, y: 0 }) {
    const r = rectToPx(t.offset, vp);
    const sx = parent.scaleX ?? 1;
    const sy = parent.scaleY ?? 1;
    const x = r.x * sx + parent.x;
    const y = r.y * sy + parent.y;
    const w = r.w * sx;
    const h = r.h * sy;
    return {
      x,
      y,
      w,
      h,
      rotationDeg: rotToDeg(t.rot),
      flipH: t.flipH,
      flipV: t.flipV,
      centerX: x + w / 2,
      centerY: y + h / 2
    };
  }

  // ../engine/pptx-render/fill.ts
  function resolveFill(fill, vp, media) {
    if (!fill) return { kind: "none" };
    switch (fill.type) {
      case "none":
        return { kind: "none" };
      case "solid":
        return { kind: "solid", color: fill.color };
      case "gradient":
        return {
          kind: "gradient",
          stops: fill.stops.map((s) => ({ pos: s.pos, color: s.color })),
          angleDeg: fill.angle != null ? fill.angle / 6e4 : 0,
          ...fill.path ? { radial: true } : {}
        };
      case "image":
        return {
          kind: "image",
          dataUrl: media?.(fill.mediaRef),
          mode: fill.mode ?? "stretch"
        };
      case "pattern":
        return { kind: "solid", color: fill.fg };
      default:
        return { kind: "none" };
    }
  }
  function resolveStroke(stroke, vp) {
    if (!stroke) return void 0;
    const rf = stroke.fill;
    let color = "#000000";
    if (rf.type === "solid") color = rf.color;
    else if (rf.type === "none") return void 0;
    const widthPx = Math.max(emuToPx(stroke.width || 12700, vp.scale), 0.5);
    const widthPt = (stroke.width || 12700) / EMU_PER_PT2;
    const dash = dashPreset(stroke.dash, widthPx);
    return {
      color,
      widthPx,
      widthPt,
      ...dash ? { dash } : {},
      ...stroke.dash && stroke.dash !== "solid" ? { dashPreset: stroke.dash } : {}
    };
  }
  function resolveGlow(glow, vp) {
    if (!glow) return void 0;
    return { color: glow.color, blurPx: emuToPx(glow.radius, vp.scale) };
  }
  function resolveShadow(shadow, vp) {
    if (!shadow) return void 0;
    const distPx = emuToPx(shadow.dist, vp.scale);
    const rad = shadow.dirDeg * Math.PI / 180;
    return {
      color: shadow.color,
      blurPx: emuToPx(shadow.blurRad, vp.scale),
      offsetX: Math.cos(rad) * distPx,
      offsetY: Math.sin(rad) * distPx
    };
  }
  function dashPreset(name, w) {
    if (!name || name === "solid") return void 0;
    const u = w;
    switch (name) {
      case "dot":
      case "sysDot":
        return [u, u];
      case "dash":
      case "sysDash":
        return [4 * u, 3 * u];
      case "lgDash":
        return [8 * u, 3 * u];
      case "dashDot":
      case "sysDashDot":
        return [4 * u, 3 * u, u, 3 * u];
      case "lgDashDot":
        return [8 * u, 3 * u, u, 3 * u];
      case "lgDashDotDot":
        return [8 * u, 3 * u, u, 3 * u, u, 3 * u];
      case "dashDotDot":
      case "sysDashDotDot":
        return [4 * u, 3 * u, u, 3 * u, u, 3 * u];
      default:
        return void 0;
    }
  }

  // ../engine/pptx-render/metrics.ts
  var SEGMENTER = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(void 0, { granularity: "grapheme" }) : null;
  function graphemes(text) {
    if (!SEGMENTER) return [...text];
    const out = [];
    for (const s of SEGMENTER.segment(text)) out.push(s.segment);
    return out;
  }
  var WIDE_RANGES = [
    [4352, 4447],
    // Hangul Jamo (initial consonants)
    [11904, 12350],
    // CJK radicals / Kangxi radicals / CJK punctuation
    [12353, 13311],
    // Kana / Bopomofo / compatibility Hangul Jamo / CJK compatibility
    [13312, 19903],
    // CJK Extension A
    [19968, 40959],
    // CJK basic
    [40960, 42191],
    // Yi
    [43360, 43391],
    // Hangul Jamo Extended-A
    [44032, 55203],
    // Hangul syllables
    [63744, 64255],
    // compatibility ideographs
    [65072, 65103],
    // CJK compatibility forms
    [65280, 65376],
    // fullwidth ASCII
    [65504, 65510],
    // fullwidth symbols
    [110592, 111359],
    // Kana extensions
    [131072, 262141]
    // CJK Extension B+
  ];
  function isWideChar(code) {
    for (const [lo, hi] of WIDE_RANGES) {
      if (code >= lo && code <= hi) return true;
    }
    return false;
  }
  function charAdvanceEm(code) {
    if (isWideChar(code)) return 1;
    if (code >= 126976 || code >= 9728 && code <= 10175) return 1;
    if (code >= 9632 && code <= 9727 || code === 8251) return 1;
    if ("iIlj.,:;'!|".includes(String.fromCharCode(code))) return 0.28;
    if (" ftr".includes(String.fromCharCode(code))) return 0.32;
    if ("mwMW".includes(String.fromCharCode(code))) return 0.82;
    return 0.52;
  }
  var ZERO_WIDTH_RE = /[\p{Mn}\p{Me}\p{Cf}]/u;
  var EMOJI_JOIN_RE = /[\u200d\ufe0f\u{1f1e6}-\u{1f1ff}\u{1f3fb}-\u{1f3ff}]/u;
  function clusterAdvanceEm(g) {
    if (g.length > 1 && EMOJI_JOIN_RE.test(g)) return 1;
    let em = 0;
    for (const ch of g) {
      em += ZERO_WIDTH_RE.test(ch) ? 0 : charAdvanceEm(ch.codePointAt(0) ?? 0);
    }
    return em;
  }
  var HeuristicMetrics = class {
    metrics(style) {
      const s = style.fontSizePx;
      return {
        ascent: s * 0.8,
        descent: s * 0.2,
        lineHeight: s * 1.2
      };
    }
    measure(text, style) {
      let em = 0;
      for (const g of graphemes(text)) {
        em += clusterAdvanceEm(g);
      }
      const boldFactor = style.bold ? 1.04 : 1;
      return em * style.fontSizePx * boldFactor;
    }
  };

  // ../../../node_modules/bidi-js/dist/bidi.mjs
  function bidiFactory() {
    var bidi = (function(exports2) {
      var DATA = {
        "R": "13k,1a,2,3,3,2+1j,ch+16,a+1,5+2,2+n,5,a,4,6+16,4+3,h+1b,4mo,179q,2+9,2+11,2i9+7y,2+68,4,3+4,5+13,4+3,2+4k,3+29,8+cf,1t+7z,w+17,3+3m,1t+3z,16o1+5r,8+30,8+mc,29+1r,29+4v,75+73",
        "EN": "1c+9,3d+1,6,187+9,513,4+5,7+9,sf+j,175h+9,qw+q,161f+1d,4xt+a,25i+9",
        "ES": "17,2,6dp+1,f+1,av,16vr,mx+1,4o,2",
        "ET": "z+2,3h+3,b+1,ym,3e+1,2o,p4+1,8,6u,7c,g6,1wc,1n9+4,30+1b,2n,6d,qhx+1,h0m,a+1,49+2,63+1,4+1,6bb+3,12jj",
        "AN": "16o+5,2j+9,2+1,35,ed,1ff2+9,87+u",
        "CS": "18,2+1,b,2u,12k,55v,l,17v0,2,3,53,2+1,b",
        "B": "a,3,f+2,2v,690",
        "S": "9,2,k",
        "WS": "c,k,4f4,1vk+a,u,1j,335",
        "ON": "x+1,4+4,h+5,r+5,r+3,z,5+3,2+1,2+1,5,2+2,3+4,o,w,ci+1,8+d,3+d,6+8,2+g,39+1,9,6+1,2,33,b8,3+1,3c+1,7+1,5r,b,7h+3,sa+5,2,3i+6,jg+3,ur+9,2v,ij+1,9g+9,7+a,8m,4+1,49+x,14u,2+2,c+2,e+2,e+2,e+1,i+n,e+e,2+p,u+2,e+2,36+1,2+3,2+1,b,2+2,6+5,2,2,2,h+1,5+4,6+3,3+f,16+2,5+3l,3+81,1y+p,2+40,q+a,m+13,2r+ch,2+9e,75+hf,3+v,2+2w,6e+5,f+6,75+2a,1a+p,2+2g,d+5x,r+b,6+3,4+o,g,6+1,6+2,2k+1,4,2j,5h+z,1m+1,1e+f,t+2,1f+e,d+3,4o+3,2s+1,w,535+1r,h3l+1i,93+2,2s,b+1,3l+x,2v,4g+3,21+3,kz+1,g5v+1,5a,j+9,n+v,2,3,2+8,2+1,3+2,2,3,46+1,4+4,h+5,r+5,r+a,3h+2,4+6,b+4,78,1r+24,4+c,4,1hb,ey+6,103+j,16j+c,1ux+7,5+g,fsh,jdq+1t,4,57+2e,p1,1m,1m,1m,1m,4kt+1,7j+17,5+2r,d+e,3+e,2+e,2+10,m+4,w,1n+5,1q,4z+5,4b+rb,9+c,4+c,4+37,d+2g,8+b,l+b,5+1j,9+9,7+13,9+t,3+1,27+3c,2+29,2+3q,d+d,3+4,4+2,6+6,a+o,8+6,a+2,e+6,16+42,2+1i",
        "BN": "0+8,6+d,2s+5,2+p,e,4m9,1kt+2,2b+5,5+5,17q9+v,7k,6p+8,6+1,119d+3,440+7,96s+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+75,6p+2rz,1ben+1,1ekf+1,1ekf+1",
        "NSM": "lc+33,7o+6,7c+18,2,2+1,2+1,2,21+a,1d+k,h,2u+6,3+5,3+1,2+3,10,v+q,2k+a,1n+8,a,p+3,2+8,2+2,2+4,18+2,3c+e,2+v,1k,2,5+7,5,4+6,b+1,u,1n,5+3,9,l+1,r,3+1,1m,5+1,5+1,3+2,4,v+1,4,c+1,1m,5+4,2+1,5,l+1,n+5,2,1n,3,2+3,9,8+1,c+1,v,1q,d,1f,4,1m+2,6+2,2+3,8+1,c+1,u,1n,g+1,l+1,t+1,1m+1,5+3,9,l+1,u,21,8+2,2,2j,3+6,d+7,2r,3+8,c+5,23+1,s,2,2,1k+d,2+4,2+1,6+a,2+z,a,2v+3,2+5,2+1,3+1,q+1,5+2,h+3,e,3+1,7,g,jk+2,qb+2,u+2,u+1,v+1,1t+1,2+6,9,3+a,a,1a+2,3c+1,z,3b+2,5+1,a,7+2,64+1,3,1n,2+6,2,2,3+7,7+9,3,1d+g,1s+3,1d,2+4,2,6,15+8,d+1,x+3,3+1,2+2,1l,2+1,4,2+2,1n+7,3+1,49+2,2+c,2+6,5,7,4+1,5j+1l,2+4,k1+w,2db+2,3y,2p+v,ff+3,30+1,n9x+3,2+9,x+1,29+1,7l,4,5,q+1,6,48+1,r+h,e,13+7,q+a,1b+2,1d,3+3,3+1,14,1w+5,3+1,3+1,d,9,1c,1g,2+2,3+1,6+1,2,17+1,9,6n,3,5,fn5,ki+f,h+f,r2,6b,46+4,1af+2,2+1,6+3,15+2,5,4m+1,fy+3,as+1,4a+a,4x,1j+e,1l+2,1e+3,3+1,1y+2,11+4,2+7,1r,d+1,1h+8,b+3,3,2o+2,3,2+1,7,4h,4+7,m+1,1m+1,4,12+6,4+4,5g+7,3+2,2,o,2d+5,2,5+1,2+1,6n+3,7+1,2+1,s+1,2e+7,3,2+1,2z,2,3+5,2,2u+2,3+3,2+4,78+8,2+1,75+1,2,5,41+3,3+1,5,x+5,3+1,15+5,3+3,9,a+5,3+2,1b+c,2+1,bb+6,2+5,2d+l,3+6,2+1,2+1,3f+5,4,2+1,2+6,2,21+1,4,2,9o+1,f0c+4,1o+6,t5,1s+3,2a,f5l+1,43t+2,i+7,3+6,v+3,45+2,1j0+1i,5+1d,9,f,n+4,2+e,11t+6,2+g,3+6,2+1,2+4,7a+6,c6+3,15t+6,32+6,gzhy+6n",
        "AL": "16w,3,2,e+1b,z+2,2+2s,g+1,8+1,b+m,2+t,s+2i,c+e,4h+f,1d+1e,1bwe+dp,3+3z,x+c,2+1,35+3y,2rm+z,5+7,b+5,dt+l,c+u,17nl+27,1t+27,4x+6n,3+d",
        "LRO": "6ct",
        "RLO": "6cu",
        "LRE": "6cq",
        "RLE": "6cr",
        "PDF": "6cs",
        "LRI": "6ee",
        "RLI": "6ef",
        "FSI": "6eg",
        "PDI": "6eh"
      };
      var TYPES = {};
      var TYPES_TO_NAMES = {};
      TYPES.L = 1;
      TYPES_TO_NAMES[1] = "L";
      Object.keys(DATA).forEach(function(type, i) {
        TYPES[type] = 1 << i + 1;
        TYPES_TO_NAMES[TYPES[type]] = type;
      });
      Object.freeze(TYPES);
      var ISOLATE_INIT_TYPES = TYPES.LRI | TYPES.RLI | TYPES.FSI;
      var STRONG_TYPES = TYPES.L | TYPES.R | TYPES.AL;
      var NEUTRAL_ISOLATE_TYPES = TYPES.B | TYPES.S | TYPES.WS | TYPES.ON | TYPES.FSI | TYPES.LRI | TYPES.RLI | TYPES.PDI;
      var BN_LIKE_TYPES = TYPES.BN | TYPES.RLE | TYPES.LRE | TYPES.RLO | TYPES.LRO | TYPES.PDF;
      var TRAILING_TYPES = TYPES.S | TYPES.WS | TYPES.B | ISOLATE_INIT_TYPES | TYPES.PDI | BN_LIKE_TYPES;
      var map = null;
      function parseData() {
        if (!map) {
          map = /* @__PURE__ */ new Map();
          var loop = function(type2) {
            if (DATA.hasOwnProperty(type2)) {
              var lastCode = 0;
              DATA[type2].split(",").forEach(function(range2) {
                var ref = range2.split("+");
                var skip = ref[0];
                var step = ref[1];
                skip = parseInt(skip, 36);
                step = step ? parseInt(step, 36) : 0;
                map.set(lastCode += skip, TYPES[type2]);
                for (var i = 0; i < step; i++) {
                  map.set(++lastCode, TYPES[type2]);
                }
              });
            }
          };
          for (var type in DATA) loop(type);
        }
      }
      function getBidiCharType(char) {
        parseData();
        return map.get(char.codePointAt(0)) || TYPES.L;
      }
      function getBidiCharTypeName(char) {
        return TYPES_TO_NAMES[getBidiCharType(char)];
      }
      var data$1 = {
        "pairs": "14>1,1e>2,u>2,2wt>1,1>1,1ge>1,1wp>1,1j>1,f>1,hm>1,1>1,u>1,u6>1,1>1,+5,28>1,w>1,1>1,+3,b8>1,1>1,+3,1>3,-1>-1,3>1,1>1,+2,1s>1,1>1,x>1,th>1,1>1,+2,db>1,1>1,+3,3>1,1>1,+2,14qm>1,1>1,+1,4q>1,1e>2,u>2,2>1,+1",
        "canonical": "6f1>-6dx,6dy>-6dx,6ec>-6ed,6ee>-6ed,6ww>2jj,-2ji>2jj,14r4>-1e7l,1e7m>-1e7l,1e7m>-1e5c,1e5d>-1e5b,1e5c>-14qx,14qy>-14qx,14vn>-1ecg,1ech>-1ecg,1edu>-1ecg,1eci>-1ecg,1eda>-1ecg,1eci>-1ecg,1eci>-168q,168r>-168q,168s>-14ye,14yf>-14ye"
      };
      function parseCharacterMap(encodedString, includeReverse) {
        var radix = 36;
        var lastCode = 0;
        var map2 = /* @__PURE__ */ new Map();
        var reverseMap = includeReverse && /* @__PURE__ */ new Map();
        var prevPair;
        encodedString.split(",").forEach(function visit(entry) {
          if (entry.indexOf("+") !== -1) {
            for (var i = +entry; i--; ) {
              visit(prevPair);
            }
          } else {
            prevPair = entry;
            var ref = entry.split(">");
            var a = ref[0];
            var b = ref[1];
            a = String.fromCodePoint(lastCode += parseInt(a, radix));
            b = String.fromCodePoint(lastCode += parseInt(b, radix));
            map2.set(a, b);
            includeReverse && reverseMap.set(b, a);
          }
        });
        return { map: map2, reverseMap };
      }
      var openToClose, closeToOpen, canonical;
      function parse$1() {
        if (!openToClose) {
          var ref = parseCharacterMap(data$1.pairs, true);
          var map2 = ref.map;
          var reverseMap = ref.reverseMap;
          openToClose = map2;
          closeToOpen = reverseMap;
          canonical = parseCharacterMap(data$1.canonical, false).map;
        }
      }
      function openingToClosingBracket(char) {
        parse$1();
        return openToClose.get(char) || null;
      }
      function closingToOpeningBracket(char) {
        parse$1();
        return closeToOpen.get(char) || null;
      }
      function getCanonicalBracket(char) {
        parse$1();
        return canonical.get(char) || null;
      }
      var TYPE_L = TYPES.L;
      var TYPE_R = TYPES.R;
      var TYPE_EN = TYPES.EN;
      var TYPE_ES = TYPES.ES;
      var TYPE_ET = TYPES.ET;
      var TYPE_AN = TYPES.AN;
      var TYPE_CS = TYPES.CS;
      var TYPE_B = TYPES.B;
      var TYPE_S = TYPES.S;
      var TYPE_ON = TYPES.ON;
      var TYPE_BN = TYPES.BN;
      var TYPE_NSM = TYPES.NSM;
      var TYPE_AL = TYPES.AL;
      var TYPE_LRO = TYPES.LRO;
      var TYPE_RLO = TYPES.RLO;
      var TYPE_LRE = TYPES.LRE;
      var TYPE_RLE = TYPES.RLE;
      var TYPE_PDF = TYPES.PDF;
      var TYPE_LRI = TYPES.LRI;
      var TYPE_RLI = TYPES.RLI;
      var TYPE_FSI = TYPES.FSI;
      var TYPE_PDI = TYPES.PDI;
      function getEmbeddingLevels(string, baseDirection) {
        var MAX_DEPTH = 125;
        var charTypes = new Uint32Array(string.length);
        for (var i = 0; i < string.length; i++) {
          charTypes[i] = getBidiCharType(string[i]);
        }
        var charTypeCounts = /* @__PURE__ */ new Map();
        function changeCharType(i2, type2) {
          var oldType = charTypes[i2];
          charTypes[i2] = type2;
          charTypeCounts.set(oldType, charTypeCounts.get(oldType) - 1);
          if (oldType & NEUTRAL_ISOLATE_TYPES) {
            charTypeCounts.set(NEUTRAL_ISOLATE_TYPES, charTypeCounts.get(NEUTRAL_ISOLATE_TYPES) - 1);
          }
          charTypeCounts.set(type2, (charTypeCounts.get(type2) || 0) + 1);
          if (type2 & NEUTRAL_ISOLATE_TYPES) {
            charTypeCounts.set(NEUTRAL_ISOLATE_TYPES, (charTypeCounts.get(NEUTRAL_ISOLATE_TYPES) || 0) + 1);
          }
        }
        var embedLevels = new Uint8Array(string.length);
        var isolationPairs = /* @__PURE__ */ new Map();
        var paragraphs = [];
        var paragraph = null;
        for (var i$1 = 0; i$1 < string.length; i$1++) {
          if (!paragraph) {
            paragraphs.push(paragraph = {
              start: i$1,
              end: string.length - 1,
              // 3.3.1 P2-P3: Determine the paragraph level
              level: baseDirection === "rtl" ? 1 : baseDirection === "ltr" ? 0 : determineAutoEmbedLevel(i$1, false)
            });
          }
          if (charTypes[i$1] & TYPE_B) {
            paragraph.end = i$1;
            paragraph = null;
          }
        }
        var FORMATTING_TYPES = TYPE_RLE | TYPE_LRE | TYPE_RLO | TYPE_LRO | ISOLATE_INIT_TYPES | TYPE_PDI | TYPE_PDF | TYPE_B;
        var nextEven = function(n) {
          return n + (n & 1 ? 1 : 2);
        };
        var nextOdd = function(n) {
          return n + (n & 1 ? 2 : 1);
        };
        for (var paraIdx = 0; paraIdx < paragraphs.length; paraIdx++) {
          paragraph = paragraphs[paraIdx];
          var statusStack = [{
            _level: paragraph.level,
            _override: 0,
            //0=neutral, 1=L, 2=R
            _isolate: 0
            //bool
          }];
          var stackTop = void 0;
          var overflowIsolateCount = 0;
          var overflowEmbeddingCount = 0;
          var validIsolateCount = 0;
          charTypeCounts.clear();
          for (var i$2 = paragraph.start; i$2 <= paragraph.end; i$2++) {
            var charType = charTypes[i$2];
            stackTop = statusStack[statusStack.length - 1];
            charTypeCounts.set(charType, (charTypeCounts.get(charType) || 0) + 1);
            if (charType & NEUTRAL_ISOLATE_TYPES) {
              charTypeCounts.set(NEUTRAL_ISOLATE_TYPES, (charTypeCounts.get(NEUTRAL_ISOLATE_TYPES) || 0) + 1);
            }
            if (charType & FORMATTING_TYPES) {
              if (charType & (TYPE_RLE | TYPE_LRE)) {
                embedLevels[i$2] = stackTop._level;
                var level = (charType === TYPE_RLE ? nextOdd : nextEven)(stackTop._level);
                if (level <= MAX_DEPTH && !overflowIsolateCount && !overflowEmbeddingCount) {
                  statusStack.push({
                    _level: level,
                    _override: 0,
                    _isolate: 0
                  });
                } else if (!overflowIsolateCount) {
                  overflowEmbeddingCount++;
                }
              } else if (charType & (TYPE_RLO | TYPE_LRO)) {
                embedLevels[i$2] = stackTop._level;
                var level$1 = (charType === TYPE_RLO ? nextOdd : nextEven)(stackTop._level);
                if (level$1 <= MAX_DEPTH && !overflowIsolateCount && !overflowEmbeddingCount) {
                  statusStack.push({
                    _level: level$1,
                    _override: charType & TYPE_RLO ? TYPE_R : TYPE_L,
                    _isolate: 0
                  });
                } else if (!overflowIsolateCount) {
                  overflowEmbeddingCount++;
                }
              } else if (charType & ISOLATE_INIT_TYPES) {
                if (charType & TYPE_FSI) {
                  charType = determineAutoEmbedLevel(i$2 + 1, true) === 1 ? TYPE_RLI : TYPE_LRI;
                }
                embedLevels[i$2] = stackTop._level;
                if (stackTop._override) {
                  changeCharType(i$2, stackTop._override);
                }
                var level$2 = (charType === TYPE_RLI ? nextOdd : nextEven)(stackTop._level);
                if (level$2 <= MAX_DEPTH && overflowIsolateCount === 0 && overflowEmbeddingCount === 0) {
                  validIsolateCount++;
                  statusStack.push({
                    _level: level$2,
                    _override: 0,
                    _isolate: 1,
                    _isolInitIndex: i$2
                  });
                } else {
                  overflowIsolateCount++;
                }
              } else if (charType & TYPE_PDI) {
                if (overflowIsolateCount > 0) {
                  overflowIsolateCount--;
                } else if (validIsolateCount > 0) {
                  overflowEmbeddingCount = 0;
                  while (!statusStack[statusStack.length - 1]._isolate) {
                    statusStack.pop();
                  }
                  var isolInitIndex = statusStack[statusStack.length - 1]._isolInitIndex;
                  if (isolInitIndex != null) {
                    isolationPairs.set(isolInitIndex, i$2);
                    isolationPairs.set(i$2, isolInitIndex);
                  }
                  statusStack.pop();
                  validIsolateCount--;
                }
                stackTop = statusStack[statusStack.length - 1];
                embedLevels[i$2] = stackTop._level;
                if (stackTop._override) {
                  changeCharType(i$2, stackTop._override);
                }
              } else if (charType & TYPE_PDF) {
                if (overflowIsolateCount === 0) {
                  if (overflowEmbeddingCount > 0) {
                    overflowEmbeddingCount--;
                  } else if (!stackTop._isolate && statusStack.length > 1) {
                    statusStack.pop();
                    stackTop = statusStack[statusStack.length - 1];
                  }
                }
                embedLevels[i$2] = stackTop._level;
              } else if (charType & TYPE_B) {
                embedLevels[i$2] = paragraph.level;
              }
            } else {
              embedLevels[i$2] = stackTop._level;
              if (stackTop._override && charType !== TYPE_BN) {
                changeCharType(i$2, stackTop._override);
              }
            }
          }
          var levelRuns = [];
          var currentRun = null;
          for (var i$3 = paragraph.start; i$3 <= paragraph.end; i$3++) {
            var charType$1 = charTypes[i$3];
            if (!(charType$1 & BN_LIKE_TYPES)) {
              var lvl = embedLevels[i$3];
              var isIsolInit = charType$1 & ISOLATE_INIT_TYPES;
              var isPDI = charType$1 === TYPE_PDI;
              if (currentRun && lvl === currentRun._level) {
                currentRun._end = i$3;
                currentRun._endsWithIsolInit = isIsolInit;
              } else {
                levelRuns.push(currentRun = {
                  _start: i$3,
                  _end: i$3,
                  _level: lvl,
                  _startsWithPDI: isPDI,
                  _endsWithIsolInit: isIsolInit
                });
              }
            }
          }
          var isolatingRunSeqs = [];
          for (var runIdx = 0; runIdx < levelRuns.length; runIdx++) {
            var run = levelRuns[runIdx];
            if (!run._startsWithPDI || run._startsWithPDI && !isolationPairs.has(run._start)) {
              var seqRuns = [currentRun = run];
              for (var pdiIndex = void 0; currentRun && currentRun._endsWithIsolInit && (pdiIndex = isolationPairs.get(currentRun._end)) != null; ) {
                for (var i$4 = runIdx + 1; i$4 < levelRuns.length; i$4++) {
                  if (levelRuns[i$4]._start === pdiIndex) {
                    seqRuns.push(currentRun = levelRuns[i$4]);
                    break;
                  }
                }
              }
              var seqIndices = [];
              for (var i$5 = 0; i$5 < seqRuns.length; i$5++) {
                var run$1 = seqRuns[i$5];
                for (var j = run$1._start; j <= run$1._end; j++) {
                  seqIndices.push(j);
                }
              }
              var firstLevel = embedLevels[seqIndices[0]];
              var prevLevel = paragraph.level;
              for (var i$6 = seqIndices[0] - 1; i$6 >= 0; i$6--) {
                if (!(charTypes[i$6] & BN_LIKE_TYPES)) {
                  prevLevel = embedLevels[i$6];
                  break;
                }
              }
              var lastIndex = seqIndices[seqIndices.length - 1];
              var lastLevel = embedLevels[lastIndex];
              var nextLevel = paragraph.level;
              if (!(charTypes[lastIndex] & ISOLATE_INIT_TYPES)) {
                for (var i$7 = lastIndex + 1; i$7 <= paragraph.end; i$7++) {
                  if (!(charTypes[i$7] & BN_LIKE_TYPES)) {
                    nextLevel = embedLevels[i$7];
                    break;
                  }
                }
              }
              isolatingRunSeqs.push({
                _seqIndices: seqIndices,
                _sosType: Math.max(prevLevel, firstLevel) % 2 ? TYPE_R : TYPE_L,
                _eosType: Math.max(nextLevel, lastLevel) % 2 ? TYPE_R : TYPE_L
              });
            }
          }
          for (var seqIdx = 0; seqIdx < isolatingRunSeqs.length; seqIdx++) {
            var ref = isolatingRunSeqs[seqIdx];
            var seqIndices$1 = ref._seqIndices;
            var sosType = ref._sosType;
            var eosType = ref._eosType;
            var embedDirection = embedLevels[seqIndices$1[0]] & 1 ? TYPE_R : TYPE_L;
            if (charTypeCounts.get(TYPE_NSM)) {
              for (var si = 0; si < seqIndices$1.length; si++) {
                var i$8 = seqIndices$1[si];
                if (charTypes[i$8] & TYPE_NSM) {
                  var prevType = sosType;
                  for (var sj = si - 1; sj >= 0; sj--) {
                    if (!(charTypes[seqIndices$1[sj]] & BN_LIKE_TYPES)) {
                      prevType = charTypes[seqIndices$1[sj]];
                      break;
                    }
                  }
                  changeCharType(i$8, prevType & (ISOLATE_INIT_TYPES | TYPE_PDI) ? TYPE_ON : prevType);
                }
              }
            }
            if (charTypeCounts.get(TYPE_EN)) {
              for (var si$1 = 0; si$1 < seqIndices$1.length; si$1++) {
                var i$9 = seqIndices$1[si$1];
                if (charTypes[i$9] & TYPE_EN) {
                  for (var sj$1 = si$1 - 1; sj$1 >= -1; sj$1--) {
                    var prevCharType = sj$1 === -1 ? sosType : charTypes[seqIndices$1[sj$1]];
                    if (prevCharType & STRONG_TYPES) {
                      if (prevCharType === TYPE_AL) {
                        changeCharType(i$9, TYPE_AN);
                      }
                      break;
                    }
                  }
                }
              }
            }
            if (charTypeCounts.get(TYPE_AL)) {
              for (var si$2 = 0; si$2 < seqIndices$1.length; si$2++) {
                var i$10 = seqIndices$1[si$2];
                if (charTypes[i$10] & TYPE_AL) {
                  changeCharType(i$10, TYPE_R);
                }
              }
            }
            if (charTypeCounts.get(TYPE_ES) || charTypeCounts.get(TYPE_CS)) {
              for (var si$3 = 1; si$3 < seqIndices$1.length - 1; si$3++) {
                var i$11 = seqIndices$1[si$3];
                if (charTypes[i$11] & (TYPE_ES | TYPE_CS)) {
                  var prevType$1 = 0, nextType = 0;
                  for (var sj$2 = si$3 - 1; sj$2 >= 0; sj$2--) {
                    prevType$1 = charTypes[seqIndices$1[sj$2]];
                    if (!(prevType$1 & BN_LIKE_TYPES)) {
                      break;
                    }
                  }
                  for (var sj$3 = si$3 + 1; sj$3 < seqIndices$1.length; sj$3++) {
                    nextType = charTypes[seqIndices$1[sj$3]];
                    if (!(nextType & BN_LIKE_TYPES)) {
                      break;
                    }
                  }
                  if (prevType$1 === nextType && (charTypes[i$11] === TYPE_ES ? prevType$1 === TYPE_EN : prevType$1 & (TYPE_EN | TYPE_AN))) {
                    changeCharType(i$11, prevType$1);
                  }
                }
              }
            }
            if (charTypeCounts.get(TYPE_EN)) {
              for (var si$4 = 0; si$4 < seqIndices$1.length; si$4++) {
                var i$12 = seqIndices$1[si$4];
                if (charTypes[i$12] & TYPE_EN) {
                  for (var sj$4 = si$4 - 1; sj$4 >= 0 && charTypes[seqIndices$1[sj$4]] & (TYPE_ET | BN_LIKE_TYPES); sj$4--) {
                    changeCharType(seqIndices$1[sj$4], TYPE_EN);
                  }
                  for (si$4++; si$4 < seqIndices$1.length && charTypes[seqIndices$1[si$4]] & (TYPE_ET | BN_LIKE_TYPES | TYPE_EN); si$4++) {
                    if (charTypes[seqIndices$1[si$4]] !== TYPE_EN) {
                      changeCharType(seqIndices$1[si$4], TYPE_EN);
                    }
                  }
                }
              }
            }
            if (charTypeCounts.get(TYPE_ET) || charTypeCounts.get(TYPE_ES) || charTypeCounts.get(TYPE_CS)) {
              for (var si$5 = 0; si$5 < seqIndices$1.length; si$5++) {
                var i$13 = seqIndices$1[si$5];
                if (charTypes[i$13] & (TYPE_ET | TYPE_ES | TYPE_CS)) {
                  changeCharType(i$13, TYPE_ON);
                  for (var sj$5 = si$5 - 1; sj$5 >= 0 && charTypes[seqIndices$1[sj$5]] & BN_LIKE_TYPES; sj$5--) {
                    changeCharType(seqIndices$1[sj$5], TYPE_ON);
                  }
                  for (var sj$6 = si$5 + 1; sj$6 < seqIndices$1.length && charTypes[seqIndices$1[sj$6]] & BN_LIKE_TYPES; sj$6++) {
                    changeCharType(seqIndices$1[sj$6], TYPE_ON);
                  }
                }
              }
            }
            if (charTypeCounts.get(TYPE_EN)) {
              for (var si$6 = 0, prevStrongType = sosType; si$6 < seqIndices$1.length; si$6++) {
                var i$14 = seqIndices$1[si$6];
                var type = charTypes[i$14];
                if (type & TYPE_EN) {
                  if (prevStrongType === TYPE_L) {
                    changeCharType(i$14, TYPE_L);
                  }
                } else if (type & STRONG_TYPES) {
                  prevStrongType = type;
                }
              }
            }
            if (charTypeCounts.get(NEUTRAL_ISOLATE_TYPES)) {
              var R_TYPES_FOR_N_STEPS = TYPE_R | TYPE_EN | TYPE_AN;
              var STRONG_TYPES_FOR_N_STEPS = R_TYPES_FOR_N_STEPS | TYPE_L;
              var bracketPairs = [];
              {
                var openerStack = [];
                for (var si$7 = 0; si$7 < seqIndices$1.length; si$7++) {
                  if (charTypes[seqIndices$1[si$7]] & NEUTRAL_ISOLATE_TYPES) {
                    var char = string[seqIndices$1[si$7]];
                    var oppositeBracket = void 0;
                    if (openingToClosingBracket(char) !== null) {
                      if (openerStack.length < 63) {
                        openerStack.push({ char, seqIndex: si$7 });
                      } else {
                        break;
                      }
                    } else if ((oppositeBracket = closingToOpeningBracket(char)) !== null) {
                      for (var stackIdx = openerStack.length - 1; stackIdx >= 0; stackIdx--) {
                        var stackChar = openerStack[stackIdx].char;
                        if (stackChar === oppositeBracket || stackChar === closingToOpeningBracket(getCanonicalBracket(char)) || openingToClosingBracket(getCanonicalBracket(stackChar)) === char) {
                          bracketPairs.push([openerStack[stackIdx].seqIndex, si$7]);
                          openerStack.length = stackIdx;
                          break;
                        }
                      }
                    }
                  }
                }
                bracketPairs.sort(function(a, b) {
                  return a[0] - b[0];
                });
              }
              for (var pairIdx = 0; pairIdx < bracketPairs.length; pairIdx++) {
                var ref$1 = bracketPairs[pairIdx];
                var openSeqIdx = ref$1[0];
                var closeSeqIdx = ref$1[1];
                var foundStrongType = false;
                var useStrongType = 0;
                for (var si$8 = openSeqIdx + 1; si$8 < closeSeqIdx; si$8++) {
                  var i$15 = seqIndices$1[si$8];
                  if (charTypes[i$15] & STRONG_TYPES_FOR_N_STEPS) {
                    foundStrongType = true;
                    var lr = charTypes[i$15] & R_TYPES_FOR_N_STEPS ? TYPE_R : TYPE_L;
                    if (lr === embedDirection) {
                      useStrongType = lr;
                      break;
                    }
                  }
                }
                if (foundStrongType && !useStrongType) {
                  useStrongType = sosType;
                  for (var si$9 = openSeqIdx - 1; si$9 >= 0; si$9--) {
                    var i$16 = seqIndices$1[si$9];
                    if (charTypes[i$16] & STRONG_TYPES_FOR_N_STEPS) {
                      var lr$1 = charTypes[i$16] & R_TYPES_FOR_N_STEPS ? TYPE_R : TYPE_L;
                      if (lr$1 !== embedDirection) {
                        useStrongType = lr$1;
                      } else {
                        useStrongType = embedDirection;
                      }
                      break;
                    }
                  }
                }
                if (useStrongType) {
                  charTypes[seqIndices$1[openSeqIdx]] = charTypes[seqIndices$1[closeSeqIdx]] = useStrongType;
                  if (useStrongType !== embedDirection) {
                    for (var si$10 = openSeqIdx + 1; si$10 < seqIndices$1.length; si$10++) {
                      if (!(charTypes[seqIndices$1[si$10]] & BN_LIKE_TYPES)) {
                        if (getBidiCharType(string[seqIndices$1[si$10]]) & TYPE_NSM) {
                          charTypes[seqIndices$1[si$10]] = useStrongType;
                        }
                        break;
                      }
                    }
                  }
                  if (useStrongType !== embedDirection) {
                    for (var si$11 = closeSeqIdx + 1; si$11 < seqIndices$1.length; si$11++) {
                      if (!(charTypes[seqIndices$1[si$11]] & BN_LIKE_TYPES)) {
                        if (getBidiCharType(string[seqIndices$1[si$11]]) & TYPE_NSM) {
                          charTypes[seqIndices$1[si$11]] = useStrongType;
                        }
                        break;
                      }
                    }
                  }
                }
              }
              for (var si$12 = 0; si$12 < seqIndices$1.length; si$12++) {
                if (charTypes[seqIndices$1[si$12]] & NEUTRAL_ISOLATE_TYPES) {
                  var niRunStart = si$12, niRunEnd = si$12;
                  var prevType$2 = sosType;
                  for (var si2 = si$12 - 1; si2 >= 0; si2--) {
                    if (charTypes[seqIndices$1[si2]] & BN_LIKE_TYPES) {
                      niRunStart = si2;
                    } else {
                      prevType$2 = charTypes[seqIndices$1[si2]] & R_TYPES_FOR_N_STEPS ? TYPE_R : TYPE_L;
                      break;
                    }
                  }
                  var nextType$1 = eosType;
                  for (var si2$1 = si$12 + 1; si2$1 < seqIndices$1.length; si2$1++) {
                    if (charTypes[seqIndices$1[si2$1]] & (NEUTRAL_ISOLATE_TYPES | BN_LIKE_TYPES)) {
                      niRunEnd = si2$1;
                    } else {
                      nextType$1 = charTypes[seqIndices$1[si2$1]] & R_TYPES_FOR_N_STEPS ? TYPE_R : TYPE_L;
                      break;
                    }
                  }
                  for (var sj$7 = niRunStart; sj$7 <= niRunEnd; sj$7++) {
                    charTypes[seqIndices$1[sj$7]] = prevType$2 === nextType$1 ? prevType$2 : embedDirection;
                  }
                  si$12 = niRunEnd;
                }
              }
            }
          }
          for (var i$17 = paragraph.start; i$17 <= paragraph.end; i$17++) {
            var level$3 = embedLevels[i$17];
            var type$1 = charTypes[i$17];
            if (level$3 & 1) {
              if (type$1 & (TYPE_L | TYPE_EN | TYPE_AN)) {
                embedLevels[i$17]++;
              }
            } else {
              if (type$1 & TYPE_R) {
                embedLevels[i$17]++;
              } else if (type$1 & (TYPE_AN | TYPE_EN)) {
                embedLevels[i$17] += 2;
              }
            }
            if (type$1 & BN_LIKE_TYPES) {
              embedLevels[i$17] = i$17 === 0 ? paragraph.level : embedLevels[i$17 - 1];
            }
            if (i$17 === paragraph.end || getBidiCharType(string[i$17]) & (TYPE_S | TYPE_B)) {
              for (var j$1 = i$17; j$1 >= 0 && getBidiCharType(string[j$1]) & TRAILING_TYPES; j$1--) {
                embedLevels[j$1] = paragraph.level;
              }
            }
          }
        }
        return {
          levels: embedLevels,
          paragraphs
        };
        function determineAutoEmbedLevel(start, isFSI) {
          for (var i2 = start; i2 < string.length; i2++) {
            var charType2 = charTypes[i2];
            if (charType2 & (TYPE_R | TYPE_AL)) {
              return 1;
            }
            if (charType2 & (TYPE_B | TYPE_L) || isFSI && charType2 === TYPE_PDI) {
              return 0;
            }
            if (charType2 & ISOLATE_INIT_TYPES) {
              var pdi = indexOfMatchingPDI(i2);
              i2 = pdi === -1 ? string.length : pdi;
            }
          }
          return 0;
        }
        function indexOfMatchingPDI(isolateStart) {
          var isolationLevel = 1;
          for (var i2 = isolateStart + 1; i2 < string.length; i2++) {
            var charType2 = charTypes[i2];
            if (charType2 & TYPE_B) {
              break;
            }
            if (charType2 & TYPE_PDI) {
              if (--isolationLevel === 0) {
                return i2;
              }
            } else if (charType2 & ISOLATE_INIT_TYPES) {
              isolationLevel++;
            }
          }
          return -1;
        }
      }
      var data = "14>1,j>2,t>2,u>2,1a>g,2v3>1,1>1,1ge>1,1wd>1,b>1,1j>1,f>1,ai>3,-2>3,+1,8>1k0,-1jq>1y7,-1y6>1hf,-1he>1h6,-1h5>1ha,-1h8>1qi,-1pu>1,6>3u,-3s>7,6>1,1>1,f>1,1>1,+2,3>1,1>1,+13,4>1,1>1,6>1eo,-1ee>1,3>1mg,-1me>1mk,-1mj>1mi,-1mg>1mi,-1md>1,1>1,+2,1>10k,-103>1,1>1,4>1,5>1,1>1,+10,3>1,1>8,-7>8,+1,-6>7,+1,a>1,1>1,u>1,u6>1,1>1,+5,26>1,1>1,2>1,2>2,8>1,7>1,4>1,1>1,+5,b8>1,1>1,+3,1>3,-2>1,2>1,1>1,+2,c>1,3>1,1>1,+2,h>1,3>1,a>1,1>1,2>1,3>1,1>1,d>1,f>1,3>1,1a>1,1>1,6>1,7>1,13>1,k>1,1>1,+19,4>1,1>1,+2,2>1,1>1,+18,m>1,a>1,1>1,lk>1,1>1,4>1,2>1,f>1,3>1,1>1,+3,db>1,1>1,+3,3>1,1>1,+2,14qm>1,1>1,+1,6>1,4j>1,j>2,t>2,u>2,2>1,+1";
      var mirrorMap;
      function parse() {
        if (!mirrorMap) {
          var ref = parseCharacterMap(data, true);
          var map2 = ref.map;
          var reverseMap = ref.reverseMap;
          reverseMap.forEach(function(value, key) {
            map2.set(key, value);
          });
          mirrorMap = map2;
        }
      }
      function getMirroredCharacter(char) {
        parse();
        return mirrorMap.get(char) || null;
      }
      function getMirroredCharactersMap(string, embeddingLevels, start, end) {
        var strLen = string.length;
        start = Math.max(0, start == null ? 0 : +start);
        end = Math.min(strLen - 1, end == null ? strLen - 1 : +end);
        var map2 = /* @__PURE__ */ new Map();
        for (var i = start; i <= end; i++) {
          if (embeddingLevels[i] & 1) {
            var mirror = getMirroredCharacter(string[i]);
            if (mirror !== null) {
              map2.set(i, mirror);
            }
          }
        }
        return map2;
      }
      function getReorderSegments(string, embeddingLevelsResult, start, end) {
        var strLen = string.length;
        start = Math.max(0, start == null ? 0 : +start);
        end = Math.min(strLen - 1, end == null ? strLen - 1 : +end);
        var segments = [];
        embeddingLevelsResult.paragraphs.forEach(function(paragraph) {
          var lineStart = Math.max(start, paragraph.start);
          var lineEnd = Math.min(end, paragraph.end);
          if (lineStart < lineEnd) {
            var lineLevels = embeddingLevelsResult.levels.slice(lineStart, lineEnd + 1);
            for (var i = lineEnd; i >= lineStart && getBidiCharType(string[i]) & TRAILING_TYPES; i--) {
              lineLevels[i] = paragraph.level;
            }
            var maxLevel = paragraph.level;
            var minOddLevel = Infinity;
            for (var i$1 = 0; i$1 < lineLevels.length; i$1++) {
              var level = lineLevels[i$1];
              if (level > maxLevel) {
                maxLevel = level;
              }
              if (level < minOddLevel) {
                minOddLevel = level | 1;
              }
            }
            for (var lvl = maxLevel; lvl >= minOddLevel; lvl--) {
              for (var i$2 = 0; i$2 < lineLevels.length; i$2++) {
                if (lineLevels[i$2] >= lvl) {
                  var segStart = i$2;
                  while (i$2 + 1 < lineLevels.length && lineLevels[i$2 + 1] >= lvl) {
                    i$2++;
                  }
                  if (i$2 > segStart) {
                    segments.push([segStart + lineStart, i$2 + lineStart]);
                  }
                }
              }
            }
          }
        });
        return segments;
      }
      function getReorderedString(string, embedLevelsResult, start, end) {
        var indices = getReorderedIndices(string, embedLevelsResult, start, end);
        var chars = [].concat(string);
        indices.forEach(function(charIndex, i) {
          chars[i] = (embedLevelsResult.levels[charIndex] & 1 ? getMirroredCharacter(string[charIndex]) : null) || string[charIndex];
        });
        return chars.join("");
      }
      function getReorderedIndices(string, embedLevelsResult, start, end) {
        var segments = getReorderSegments(string, embedLevelsResult, start, end);
        var indices = [];
        for (var i = 0; i < string.length; i++) {
          indices[i] = i;
        }
        segments.forEach(function(ref) {
          var start2 = ref[0];
          var end2 = ref[1];
          var slice = indices.slice(start2, end2 + 1);
          for (var i2 = slice.length; i2--; ) {
            indices[end2 - i2] = slice[i2];
          }
        });
        return indices;
      }
      exports2.closingToOpeningBracket = closingToOpeningBracket;
      exports2.getBidiCharType = getBidiCharType;
      exports2.getBidiCharTypeName = getBidiCharTypeName;
      exports2.getCanonicalBracket = getCanonicalBracket;
      exports2.getEmbeddingLevels = getEmbeddingLevels;
      exports2.getMirroredCharacter = getMirroredCharacter;
      exports2.getMirroredCharactersMap = getMirroredCharactersMap;
      exports2.getReorderSegments = getReorderSegments;
      exports2.getReorderedIndices = getReorderedIndices;
      exports2.getReorderedString = getReorderedString;
      exports2.openingToClosingBracket = openingToClosingBracket;
      Object.defineProperty(exports2, "__esModule", { value: true });
      return exports2;
    })({});
    return bidi;
  }
  var bidi_default = bidiFactory;

  // ../engine/pptx-render/text-layout.ts
  var DEFAULT_FONT = "Arial";
  var DEFAULT_SIZE_PT = 18;
  function runStyle(run, scale, fontScale) {
    const sizePt = run.fontSize ?? DEFAULT_SIZE_PT;
    return {
      fontFamily: run.fontFamily || DEFAULT_FONT,
      fontSizePx: ptToPx(sizePt, scale) * fontScale,
      bold: !!run.bold,
      italic: !!run.italic
    };
  }
  function tokenWidth(tok, metrics) {
    const w = metrics.measure(tok.text, tok.style);
    return tok.ls ? w + tok.ls * [...tok.text].length : w;
  }
  function tokenizeParagraph(p, scale, fontScale) {
    const tokens = [];
    p.runs.forEach((run, srcRun) => {
      const style = runStyle(run, scale, fontScale);
      const color = run.color ?? "#000000";
      const underline = !!run.underline;
      const ls = run.letterSpacing ? ptToPx(run.letterSpacing, scale) * fontScale : 0;
      const blShift = run.baseline ? style.fontSizePx * (run.baseline / 100) : 0;
      const base = {
        style,
        color,
        underline,
        ls,
        srcRun,
        ...run.fontFamily ? { srcFont: run.fontFamily } : {},
        ...run.hyperlink ? { link: run.hyperlink } : {},
        ...run.strike ? { strike: true } : {},
        ...run.baseline ? { blPct: run.baseline } : {},
        ...blShift ? { blShift } : {},
        ...run.outline ? {
          outline: {
            color: run.outline.color,
            widthPx: emuToPx(run.outline.widthEmu, scale) * fontScale
          }
        } : {}
      };
      let buf = "";
      const flushWord = () => {
        if (!buf) return;
        if (WORD_SEG && SEA_RE.test(buf)) {
          for (const s of WORD_SEG.segment(buf)) {
            tokens.push({ ...base, text: s.segment, breakable: true, isSpace: false });
          }
        } else {
          tokens.push({ ...base, text: buf, breakable: false, isSpace: false });
        }
        buf = "";
      };
      for (const ch of graphemes(run.text)) {
        const cp = ch.codePointAt(0) ?? 0;
        if (ch === "\n" || ch === "\v") {
          flushWord();
          tokens.push({ ...base, text: "\n", breakable: true, isSpace: false, isBreak: true });
        } else if (ch === " " || ch === "	") {
          flushWord();
          tokens.push({ ...base, text: ch, breakable: true, isSpace: true });
        } else if (isWideChar(cp)) {
          flushWord();
          tokens.push({ ...base, text: ch, breakable: true, isSpace: false });
        } else {
          buf += ch;
        }
      }
      flushWord();
    });
    return tokens;
  }
  var SEA_RE = /[฀-໿က-႟ក-៿]/;
  var WORD_SEG = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(void 0, { granularity: "word" }) : null;
  var RTL_RE = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/;
  var bidiApi = null;
  function applyBidi(tokens) {
    const text = tokens.map((t) => t.text).join("");
    if (!RTL_RE.test(text)) return tokens;
    bidiApi ??= bidi_default();
    const { levels } = bidiApi.getEmbeddingLevels(text);
    const out = [];
    let off = 0;
    for (const tok of tokens) {
      const end = off + tok.text.length;
      let segStart = off;
      for (let i = off + 1; i <= end; i++) {
        if (i === end || levels[i] !== levels[segStart]) {
          out.push({ ...tok, text: text.slice(segStart, i), level: levels[segStart] ?? 0 });
          segStart = i;
        }
      }
      off = end;
    }
    return out;
  }
  function visualOrder(toks) {
    let max = 0;
    let minOdd = Infinity;
    for (const t of toks) {
      const lv = t.level ?? 0;
      if (lv > max) max = lv;
      if (lv % 2 === 1 && lv < minOdd) minOdd = lv;
    }
    if (minOdd === Infinity) return toks;
    const arr = [...toks];
    for (let l = max; l >= minOdd; l--) {
      for (let i = 0; i < arr.length; ) {
        if ((arr[i].level ?? 0) >= l) {
          let j = i;
          while (j < arr.length && (arr[j].level ?? 0) >= l) j++;
          for (let a = i, b = j - 1; a < b; a++, b--) {
            const t = arr[a];
            arr[a] = arr[b];
            arr[b] = t;
          }
          i = j;
        } else {
          i++;
        }
      }
    }
    return arr;
  }
  function paraBaseRtl(p) {
    for (const r of p.runs) {
      for (const ch of r.text) {
        if (RTL_RE.test(ch)) return true;
        if (/[A-Za-z\u00c0-\u058f\u0900-\ud7ff\uf900-\ufdcf]/.test(ch)) return false;
      }
    }
    return false;
  }
  function layoutParagraph(p, availWidth, wrap, metrics, scale, fontScale, lnSpcRed = 0, firstLineShrinkPx = 0) {
    const tokens = applyBidi(tokenizeParagraph(p, scale, fontScale)).map((tok, logicalOrder) => ({
      ...tok,
      logicalOrder
    }));
    const lines = [];
    let cur = [];
    let curW = 0;
    const pushLine = (toks) => {
      let trailingSpace = false;
      while (toks.length && toks[toks.length - 1].isSpace) {
        toks.pop();
        trailingSpace = true;
      }
      if (!toks.length) {
        const src = p.runs[0];
        const st = src ? runStyle(src, scale, fontScale) : {
          fontFamily: DEFAULT_FONT,
          fontSizePx: ptToPx(DEFAULT_SIZE_PT, scale) * fontScale,
          bold: false,
          italic: false
        };
        const m = metrics.metrics(st);
        lines.push({
          runs: src ? [
            {
              text: "",
              x: 0,
              baselineY: 0,
              fontFamily: st.fontFamily,
              ...src.fontFamily ? { srcFontFamily: src.fontFamily } : {},
              fontSizePx: st.fontSizePx,
              color: src.color ?? "#000000",
              bold: st.bold,
              italic: st.italic,
              underline: !!src.underline,
              widthPx: 0,
              srcRunIdx: 0,
              ascentPx: m.ascent
            }
          ] : [],
          height: lineH(p, m, scale, lnSpcRed),
          ascent: m.ascent,
          descent: m.descent,
          singleH: Math.max(m.lineHeight, m.ascent + m.descent),
          ...trailingSpace ? { trailingSpace } : {}
        });
        return;
      }
      const line2 = buildLine(toks, metrics, p, scale, lnSpcRed);
      if (trailingSpace) line2.trailingSpace = true;
      lines.push(line2);
    };
    for (const tok of tokens) {
      if (tok.isBreak) {
        pushLine(cur);
        lines[lines.length - 1].softBreakAfter = tok.srcRun;
        cur = [];
        curW = 0;
        continue;
      }
      const w = tokenWidth(tok, metrics);
      const lineAvail = () => lines.length === 0 ? availWidth - firstLineShrinkPx : availWidth;
      if (wrap && cur.length && curW + w > lineAvail() && !tok.isSpace) {
        pushLine(cur);
        cur = [];
        curW = 0;
      }
      if (wrap && !cur.length && w > lineAvail() && tok.text.length > 1 && !tok.isSpace) {
        for (const seg of hardBreak(tok, lineAvail(), metrics)) {
          pushLine([seg]);
        }
        continue;
      }
      cur.push(tok);
      curW += w;
    }
    if (cur.length) pushLine(cur);
    if (!lines.length) pushLine([]);
    return lines;
  }
  function hardBreak(tok, availWidth, metrics) {
    const out = [];
    let buf = "";
    for (const ch of graphemes(tok.text)) {
      const test = buf + ch;
      if (buf && tokenWidth({ ...tok, text: test }, metrics) > availWidth) {
        out.push({ ...tok, text: buf });
        buf = ch;
      } else {
        buf = test;
      }
    }
    if (buf) out.push({ ...tok, text: buf });
    return out;
  }
  function buildLine(toks, metrics, p, scale, lnSpcRed = 0) {
    let x = 0;
    let ascent = 0;
    let descent = 0;
    let lineHM = 0;
    const runs = [];
    for (const tok of visualOrder(toks)) {
      const m = metrics.metrics(tok.style);
      ascent = Math.max(ascent, m.ascent);
      descent = Math.max(descent, m.descent);
      lineHM = Math.max(lineHM, m.lineHeight);
      const w = tokenWidth(tok, metrics);
      runs.push({
        text: tok.text,
        x,
        baselineY: 0,
        // filled in later from the line's ascent
        // When a missing font is substituted, draw with the substitute name so drawing and measuring use the same font file
        fontFamily: metrics.displayFamily?.(tok.style, tok.text) ?? tok.style.fontFamily,
        ...tok.srcFont ? { srcFontFamily: tok.srcFont } : {},
        fontSizePx: tok.style.fontSizePx,
        color: tok.color,
        bold: tok.style.bold,
        italic: tok.style.italic,
        underline: tok.underline,
        ...tok.strike ? { strike: true } : {},
        widthPx: w,
        ...tok.ls ? { letterSpacingPx: tok.ls } : {},
        ...tok.outline ? { outline: tok.outline } : {},
        ...tok.blShift ? { baselineShiftPx: tok.blShift } : {},
        ...tok.blPct ? { baselinePct: tok.blPct } : {},
        ...tok.level != null && tok.level % 2 === 1 ? { rtl: true } : {},
        srcRunIdx: tok.srcRun,
        ...tok.link ? { link: tok.link } : {},
        ...tok.logicalOrder != null ? { logicalOrder: tok.logicalOrder } : {},
        ascentPx: m.ascent
      });
      x += w;
    }
    const height = lineH(
      p,
      { ascent, descent, lineHeight: lineHM || ascent + descent },
      scale,
      lnSpcRed
    );
    return {
      runs,
      height,
      ascent,
      descent,
      singleH: Math.max(lineHM || ascent + descent, ascent + descent)
    };
  }
  function lineH(p, m, scale, lnSpcRed = 0) {
    const single = Math.max(m.lineHeight, m.ascent + m.descent);
    if (p.lineExact != null) return ptToPx(p.lineExact, scale);
    const base = p.lineHeight != null ? single * (p.lineHeight / 100) : single;
    return base * (1 - lnSpcRed);
  }
  function layoutText(input) {
    const { body, boxWidthPx, boxHeightPx, metrics, vp } = input;
    const insets = {
      l: emuToPx(body.insets?.l ?? 91440, vp.scale),
      t: emuToPx(body.insets?.t ?? 45720, vp.scale),
      r: emuToPx(body.insets?.r ?? 91440, vp.scale),
      b: emuToPx(body.insets?.b ?? 45720, vp.scale)
    };
    const availWidth = Math.max(boxWidthPx - insets.l - insets.r, 1);
    const availHeight = Math.max(boxHeightPx - insets.t - insets.b, 1);
    const wrap = body.wrap !== false;
    if (body.vert)
      return layoutTextVertical(
        body,
        body.vert,
        availWidth,
        availHeight,
        insets,
        wrap,
        metrics,
        vp.scale
      );
    const build = (fontScale2, lnSpcRed) => layoutAll(body, availWidth, wrap, metrics, vp.scale, fontScale2, lnSpcRed);
    const storedScale = body.autofit === "shrink" ? body.fontScale ?? 1 : 1;
    const storedRed = body.autofit === "shrink" ? body.lnSpcReduction ?? 0 : 0;
    let fontScale = storedScale;
    let lnSpcReduction = storedRed;
    let result = build(fontScale, lnSpcReduction);
    if (body.autofit === "shrink" && result.contentHeight > availHeight) {
      for (const [fs, red] of SHRINK_STEPS) {
        if (fs >= storedScale - 1e-6) continue;
        const effRed = Math.max(red, storedRed);
        const r = build(fs, effRed);
        fontScale = fs;
        lnSpcReduction = effRed;
        result = r;
        if (r.contentHeight <= availHeight) break;
      }
    }
    const anchor = body.anchor ?? "top";
    const extraH = availHeight - result.contentHeight;
    const dy = anchor === "middle" ? extraH / 2 : anchor === "bottom" ? extraH : 0;
    const lines = dy ? result.lines.map((ln) => ({
      ...ln,
      top: ln.top + dy,
      runs: ln.runs.map((r) => ({ ...r, baselineY: r.baselineY + dy }))
    })) : result.lines;
    return {
      lines,
      insets,
      anchor,
      fontScale,
      ...lnSpcReduction ? { lnSpcReduction } : {},
      contentHeight: result.contentHeight,
      wrap
    };
  }
  var SHRINK_STEPS = [
    [0.925, 0],
    [0.85, 0.1],
    [0.775, 0.1],
    [0.7, 0.2],
    [0.625, 0.2],
    [0.55, 0.2],
    [0.475, 0.2],
    [0.4, 0.2],
    [0.325, 0.2],
    [0.25, 0.2]
  ];
  function layoutTextVertical(body, vert, availWidth, availHeight, insets, wrap, metrics, scale) {
    const fontScale = body.autofit === "shrink" ? body.fontScale ?? 1 : 1;
    const cols = [];
    let autoNum = 0;
    for (const p of body.paragraphs) {
      const paraCols = [];
      let cur = [];
      let curH = 0;
      let agg = { ascent: 0, descent: 0, lineHeight: 0 };
      const finishCol = (soft) => {
        let m = agg;
        if (!cur.length) {
          const st = {
            fontFamily: DEFAULT_FONT,
            fontSizePx: ptToPx(DEFAULT_SIZE_PT, scale) * fontScale,
            bold: false,
            italic: false
          };
          m = metrics.metrics(st);
        }
        paraCols.push({
          runs: cur,
          usedH: curH,
          // Line height maps to column width: the column's max metrics × the paragraph line-spacing setting
          colW: lineH(p, { ...m, lineHeight: m.lineHeight || m.ascent + m.descent }, scale, 0),
          paraStart: false,
          ...soft != null ? { softBreakAfter: soft } : {},
          gapBefore: 0,
          gapAfter: 0
        });
        cur = [];
        curH = 0;
        agg = { ascent: 0, descent: 0, lineHeight: 0 };
      };
      const pushCell = (tok, g, isBullet = false) => {
        const m = metrics.metrics(tok.style);
        const adv = m.ascent + m.descent + tok.ls;
        if (wrap && cur.length && curH + adv > availHeight) finishCol();
        agg = {
          ascent: Math.max(agg.ascent, m.ascent),
          descent: Math.max(agg.descent, m.descent),
          lineHeight: Math.max(agg.lineHeight, m.lineHeight)
        };
        cur.push({
          text: g,
          x: 0,
          baselineY: curH + m.ascent,
          fontFamily: metrics.displayFamily?.(tok.style, g) ?? tok.style.fontFamily,
          ...tok.srcFont ? { srcFontFamily: tok.srcFont } : {},
          fontSizePx: tok.style.fontSizePx,
          color: tok.color,
          bold: tok.style.bold,
          italic: tok.style.italic,
          underline: tok.underline,
          ...tok.strike ? { strike: true } : {},
          ...tok.outline ? { outline: tok.outline } : {},
          widthPx: metrics.measure(g, tok.style),
          ...tok.blPct ? { baselinePct: tok.blPct } : {},
          ...isBullet ? { isBullet: true } : { srcRunIdx: tok.srcRun },
          ...!isBullet && tok.link ? { link: tok.link } : {},
          ascentPx: m.ascent
        });
        curH += adv;
      };
      const pushRotated = (tok) => {
        const m = metrics.metrics(tok.style);
        const adv = tokenWidth(tok, metrics);
        if (wrap && cur.length && curH + adv > availHeight) finishCol();
        agg = {
          ascent: Math.max(agg.ascent, m.ascent),
          descent: Math.max(agg.descent, m.descent),
          lineHeight: Math.max(agg.lineHeight, m.lineHeight)
        };
        cur.push({
          text: tok.text,
          x: 0,
          baselineY: curH + m.ascent,
          fontFamily: metrics.displayFamily?.(tok.style, tok.text) ?? tok.style.fontFamily,
          ...tok.srcFont ? { srcFontFamily: tok.srcFont } : {},
          fontSizePx: tok.style.fontSizePx,
          color: tok.color,
          bold: tok.style.bold,
          italic: tok.style.italic,
          underline: tok.underline,
          ...tok.strike ? { strike: true } : {},
          ...tok.outline ? { outline: tok.outline } : {},
          widthPx: adv,
          rotate90: true,
          srcRunIdx: tok.srcRun,
          ...tok.link ? { link: tok.link } : {},
          ascentPx: m.ascent
        });
        curH += adv;
      };
      const hasText = p.runs.some((r) => r.text.trim());
      const bulletType = p.bullet?.type;
      const hasBullet = hasText && (bulletType === "char" || bulletType === "number");
      if (bulletType === "number" && hasText) autoNum += 1;
      else if (bulletType !== "number") autoNum = 0;
      if (hasBullet && p.runs[0]) {
        const base = runStyle(p.runs[0], scale, fontScale);
        const st = p.bullet?.sizePct != null ? { ...base, fontSizePx: base.fontSizePx * (p.bullet.sizePct / 100) } : base;
        pushCell(
          {
            text: "",
            style: st,
            color: p.bullet?.color ?? p.runs[0].color ?? "#000000",
            underline: false,
            ls: 0,
            breakable: false,
            isSpace: false,
            srcRun: 0
          },
          bulletType === "char" ? p.bullet?.char ?? "\u2022" : `${autoNum}.`,
          true
        );
      }
      for (const tok of tokenizeParagraph(p, scale, fontScale)) {
        if (tok.isBreak) {
          finishCol(tok.srcRun);
          continue;
        }
        const hasWide = [...tok.text].some((ch) => isWideChar(ch.codePointAt(0) ?? 0));
        if (!hasWide && tok.text.trim()) {
          pushRotated(tok);
          continue;
        }
        for (const g of graphemes(tok.text)) pushCell(tok, g);
      }
      if (cur.length || !paraCols.length) finishCol();
      paraCols[0].paraStart = true;
      const singleW = paraCols[0].colW;
      paraCols[0].gapBefore = ptToPx(p.spaceBefore ?? 0, scale) + (p.spaceBeforePct ? singleW * (p.spaceBeforePct / 100) : 0);
      paraCols[paraCols.length - 1].gapAfter = ptToPx(p.spaceAfter ?? 0, scale) + (p.spaceAfterPct ? singleW * (p.spaceAfterPct / 100) : 0);
      if (p.align) {
        for (const c of paraCols) {
          c.align = p.align;
          c.alignExplicit = true;
        }
      }
      cols.push(...paraCols);
    }
    const contentW = cols.reduce((a, c) => a + c.gapBefore + c.colW + c.gapAfter, 0);
    const anchor = body.anchor ?? "top";
    const extraW = availWidth - contentW;
    let xRight = availWidth - (anchor === "middle" ? extraW / 2 : anchor === "bottom" ? extraW : 0);
    let contentHeight = 0;
    const lines = cols.map((c) => {
      xRight -= c.gapBefore;
      const colX = xRight - c.colW;
      xRight = colX - c.gapAfter;
      const dy = c.align === "center" ? (availHeight - c.usedH) / 2 : c.align === "right" ? availHeight - c.usedH : 0;
      contentHeight = Math.max(contentHeight, dy + c.usedH);
      return {
        runs: c.runs.map((r) => ({
          ...r,
          // Rotated word anchor = column center shifted right by half the font size (after 90° clockwise the text box lands back on the column center)
          x: r.rotate90 ? colX + (c.colW + r.fontSizePx) / 2 : colX + (c.colW - r.widthPx) / 2,
          baselineY: r.baselineY + dy
        })),
        top: dy,
        height: c.usedH,
        paraStart: c.paraStart,
        ...c.softBreakAfter != null ? { softBreakAfter: c.softBreakAfter } : {},
        ...c.alignExplicit && c.align ? { align: c.align } : {}
      };
    });
    return { lines, insets, anchor, fontScale, contentHeight, wrap, vert };
  }
  function alignOffset(align, availWidth, lineWidth) {
    if (align === "center") return (availWidth - lineWidth) / 2;
    if (align === "right") return availWidth - lineWidth;
    return 0;
  }
  function layoutAll(body, availWidth, wrap, metrics, scale, fontScale, lnSpcRed) {
    const outLines = [];
    let y = 0;
    let autoNum = 0;
    for (const p of body.paragraphs) {
      const marLPx = emuToPx(p.marL ?? 0, scale);
      const indentPx = emuToPx(p.indent ?? 0, scale);
      const hasText = p.runs.some((r) => r.text.trim());
      const bulletType = p.bullet?.type;
      const hasBullet = hasText && (bulletType === "char" || bulletType === "number");
      if (bulletType === "number" && hasText) autoNum += 1;
      else if (bulletType !== "number") autoNum = 0;
      const bulletText = bulletType === "char" ? p.bullet?.char ?? "\u2022" : `${autoNum}.`;
      const textX = marLPx;
      const avail = Math.max(availWidth - textX, 1);
      const align = p.align ?? (paraBaseRtl(p) ? "right" : void 0);
      let bulletSt;
      let bulletW = 0;
      if (hasBullet) {
        const base = runStyle(p.runs[0], scale, fontScale);
        bulletSt = p.bullet?.sizePct != null ? { ...base, fontSizePx: base.fontSizePx * (p.bullet.sizePct / 100) } : base;
        bulletW = metrics.measure(bulletText, bulletSt);
      }
      const bulletX = Math.max(marLPx + indentPx, 0);
      const bulletOverflowPx = hasBullet ? Math.max(bulletX + bulletW - textX, 0) : 0;
      const laid = layoutParagraph(
        p,
        avail,
        wrap,
        metrics,
        scale,
        fontScale,
        lnSpcRed,
        bulletOverflowPx
      );
      const singleH = laid[0]?.singleH ?? 0;
      y += ptToPx(p.spaceBefore ?? 0, scale) + (p.spaceBeforePct ? singleH * (p.spaceBeforePct / 100) : 0);
      laid.forEach((ln, li) => {
        const baseline = y + ln.ascent;
        const lineWidth = ln.runs.reduce((acc, r) => acc + r.widthPx, 0);
        const firstShift = !hasBullet && li === 0 ? indentPx : 0;
        const bulletShift = li === 0 ? bulletOverflowPx : 0;
        let lineRuns = ln.runs;
        if (align === "justify" && wrap && li < laid.length - 1 && ln.softBreakAfter == null && ln.runs.length) {
          const totalChars = ln.runs.reduce((acc, r) => acc + [...r.text].length, 0);
          const extra = avail - firstShift - bulletShift - lineWidth;
          if (totalChars > 1 && extra > 0) {
            const per = extra / (totalChars - 1);
            let consumed = 0;
            lineRuns = ln.runs.map((r) => {
              const chars = [...r.text].length;
              const jr = {
                ...r,
                x: r.x + consumed * per,
                widthPx: r.widthPx + chars * per,
                justifyExtraPx: per
              };
              consumed += chars;
              return jr;
            });
          }
        }
        const off = alignOffset(align, avail, lineWidth + bulletShift);
        const dx = textX + firstShift + bulletShift + off;
        const runs = lineRuns.map((r) => ({
          ...r,
          x: r.x + dx,
          baselineY: baseline - (r.baselineShiftPx ?? 0)
        }));
        if (hasBullet && li === 0) {
          const st = bulletSt;
          runs.unshift({
            text: bulletText,
            x: bulletX + off,
            baselineY: baseline,
            fontFamily: metrics.displayFamily?.(st, bulletText) ?? st.fontFamily,
            fontSizePx: st.fontSizePx,
            color: p.bullet?.color ?? p.runs[0]?.color ?? "#000000",
            bold: st.bold,
            italic: false,
            underline: false,
            widthPx: bulletW,
            isBullet: true,
            ascentPx: metrics.metrics(st).ascent
          });
        }
        outLines.push({
          runs,
          top: y,
          height: ln.height,
          paraStart: li === 0,
          ...ln.trailingSpace ? { trailingSpace: true } : {},
          ...ln.softBreakAfter != null ? { softBreakAfter: ln.softBreakAfter } : {},
          ...p.align ? { align: p.align } : {},
          ...p.level ? { level: p.level } : {},
          ...marLPx ? { marLPx } : {},
          ...indentPx ? { indentPx } : {}
        });
        y += ln.height;
      });
      y += ptToPx(p.spaceAfter ?? 0, scale) + (p.spaceAfterPct ? singleH * (p.spaceAfterPct / 100) : 0);
    }
    return { lines: outLines, contentHeight: y };
  }

  // ../engine/pptx-render/build-chart.ts
  var PALETTE = ["#4472C4", "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5", "#70AD47"];
  var LABEL_FONT = "Arial";
  function buildChartNode(id, sourceId, model, box, vp, metrics) {
    if (!model.title) return buildChartNodeInner(id, sourceId, model, box, vp, metrics);
    const titleSizePx = ptToPx(12, vp.scale);
    const titleH = titleSizePx * 1.7;
    const node = buildChartNodeInner(
      id,
      sourceId,
      model,
      { ...box, h: Math.max(box.h - titleH, 10) },
      vp,
      metrics
    );
    if (!node) return null;
    shiftChartNode(node, titleH);
    node.box = box;
    const tw = metrics.measure(model.title, {
      fontFamily: LABEL_FONT,
      fontSizePx: titleSizePx,
      bold: true,
      italic: false
    });
    node.labels.push({
      text: model.title,
      x: Math.max((box.w - tw) / 2, 4),
      y: titleSizePx * 0.3,
      fontSizePx: titleSizePx,
      color: "#333333",
      bold: true
    });
    return node;
  }
  function shiftChartNode(node, dy) {
    for (const g of node.gridLines) {
      g.y1 += dy;
      g.y2 += dy;
    }
    for (const a of node.axisLines) {
      a.y1 += dy;
      a.y2 += dy;
    }
    for (const l of node.labels) l.y += dy;
    for (const b of node.bars) b.y += dy;
    for (const p of node.polylines)
      for (let i = 1; i < p.points.length; i += 2) p.points[i] = p.points[i] + dy;
    for (const m of node.markers) m.y += dy;
    for (const s of node.swatches) s.y += dy;
    for (const w of node.wedges ?? []) w.cy += dy;
  }
  function buildChartNodeInner(id, sourceId, model, box, vp, metrics) {
    if (model.kind === "pie") return buildPieNode(id, sourceId, model, box, vp, metrics);
    if (model.kind === "scatter") return buildScatterNode(id, sourceId, model, box, vp, metrics);
    if (model.kind === "radar") return buildRadarNode(id, sourceId, model, box, vp, metrics);
    if (model.kind === "bar" && model.barDir === "bar") {
      return buildHBarNode(id, sourceId, model, box, vp, metrics);
    }
    if (model.kind !== "line" && model.kind !== "bar" && model.kind !== "area") return null;
    const grouping = model.kind === "bar" ? model.grouping ?? "clustered" : "standard";
    const stacked = grouping === "stacked" || grouping === "percentStacked";
    const serKind = (ser) => ser.plotKind ?? model.kind;
    const barSeriesIdx = model.series.map((s, i) => i).filter((i) => serKind(model.series[i]) === "bar");
    const numVals = (s) => s.values.filter((v) => v != null);
    let secVals = model.series.filter((s) => s.secondaryAxis && serKind(s) !== "bar").flatMap(numVals);
    let priVals = model.series.filter((s) => !(s.secondaryAxis && serKind(s) !== "bar")).flatMap(numVals);
    if (!priVals.length) {
      priVals = secVals;
      secVals = [];
    }
    const onSecAxis = (ser) => secVals.length > 0 && !!ser.secondaryAxis && serKind(ser) !== "bar";
    const node = {
      id,
      type: "chart",
      box,
      sourceId,
      gridLines: [],
      axisLines: [],
      labels: [],
      bars: [],
      polylines: [],
      markers: [],
      swatches: []
    };
    const labelSizePx = ptToPx(model.valAxis?.labelSizePt ?? 10, vp.scale);
    const labelColor = model.valAxis?.labelColor ?? "#666666";
    const catLabelSizePx = ptToPx(
      model.catAxis?.labelSizePt ?? model.valAxis?.labelSizePt ?? 10,
      vp.scale
    );
    const catLabelColor = model.catAxis?.labelColor ?? labelColor;
    const style = (sizePx) => ({
      fontFamily: LABEL_FONT,
      fontSizePx: sizePx,
      bold: false,
      italic: false
    });
    const measure = (text, sizePx) => metrics.measure(text, style(sizePx));
    const seriesColor = (i) => model.series[i]?.color ?? PALETTE[i % PALETTE.length];
    if (!priVals.length) return null;
    const catCount = Math.max(model.categories.length, ...model.series.map((s) => s.values.length), 1);
    const catAbsTotals = Array.from(
      { length: catCount },
      (_, i) => barSeriesIdx.reduce((a, si) => a + Math.abs(model.series[si].values[i] ?? 0), 0)
    );
    const valueAt = (si, i) => {
      const v = model.series[si]?.values[i];
      if (v == null) return null;
      if (grouping !== "percentStacked" || serKind(model.series[si]) !== "bar") return v;
      const total = catAbsTotals[i] || 1;
      return v / total * 100;
    };
    let dataMax;
    let dataMin;
    if (stacked) {
      const posSums = Array.from(
        { length: catCount },
        (_, i) => barSeriesIdx.reduce((a, si) => a + Math.max(valueAt(si, i) ?? 0, 0), 0)
      );
      const negSums = Array.from(
        { length: catCount },
        (_, i) => barSeriesIdx.reduce((a, si) => a + Math.min(valueAt(si, i) ?? 0, 0), 0)
      );
      const overlayVals = model.series.filter((s) => serKind(s) !== "bar" && !onSecAxis(s)).flatMap(numVals);
      dataMax = Math.max(...posSums, ...overlayVals, 0);
      dataMin = Math.min(...negSums, ...overlayVals, 0);
    } else {
      dataMax = Math.max(...priVals, 0);
      dataMin = Math.min(...priVals, 0);
    }
    const { min, max, ticks } = ppTicks(
      model.valAxis?.min ?? dataMin,
      model.valAxis?.max ?? dataMax,
      model.valAxis?.min == null,
      model.valAxis?.max == null
    );
    const sec = secVals.length ? ppTicks(
      model.valAxis2?.min ?? Math.min(...secVals, 0),
      model.valAxis2?.max ?? Math.max(...secVals, 0),
      model.valAxis2?.min == null,
      model.valAxis2?.max == null
    ) : void 0;
    const pad = Math.max(4, box.w * 0.01);
    const legendPos = model.legendPos;
    const legendH = legendPos === "t" || legendPos === "b" ? labelSizePx * 1.6 : 0;
    const tickLabels = ticks.map((t) => fmtNum(t));
    const yLabelW = Math.max(...tickLabels.map((t) => measure(t, labelSizePx)), 0);
    const axisTitleW = model.valAxis?.title ? labelSizePx * 2.2 : 0;
    const secLabelSizePx = ptToPx(
      model.valAxis2?.labelSizePt ?? model.valAxis?.labelSizePt ?? 10,
      vp.scale
    );
    const secTickLabels = sec ? sec.ticks.map((t) => fmtNum(t)) : [];
    const y2LabelW = sec ? Math.max(...secTickLabels.map((t) => measure(t, secLabelSizePx)), 0) : 0;
    const axisTitle2W = sec && model.valAxis2?.title ? secLabelSizePx * 2.2 : 0;
    const plotX = pad + axisTitleW + yLabelW + 10;
    const plotY = pad + (legendPos === "t" ? legendH + 4 : 0) + labelSizePx * 0.6;
    const plotR = box.w - pad - (sec ? y2LabelW + axisTitle2W + 10 : labelSizePx * 0.7);
    const plotB = box.h - pad - catLabelSizePx * 1.5 - (legendPos === "b" ? legendH : 0);
    const plot = {
      x: plotX,
      y: plotY,
      w: Math.max(plotR - plotX, 10),
      h: Math.max(plotB - plotY, 10)
    };
    const yOf = (v) => plot.y + plot.h * (1 - (v - min) / (max - min || 1));
    const yOf2 = (v) => plot.y + plot.h * (1 - (v - (sec?.min ?? 0)) / ((sec?.max ?? 1) - (sec?.min ?? 0) || 1));
    const gridColor = model.valAxis?.gridColor;
    for (let i = 0; i < ticks.length; i++) {
      const t = ticks[i];
      const y = yOf(t);
      if (gridColor && t !== min) {
        node.gridLines.push({
          x1: plot.x,
          y1: y,
          x2: plot.x + plot.w,
          y2: y,
          color: gridColor,
          ...model.valAxis?.gridDash ? { dash: [4, 4] } : {}
        });
      }
      const text = tickLabels[i];
      node.labels.push({
        text,
        x: plot.x - 6 - measure(text, labelSizePx),
        y: y - labelSizePx * 0.55,
        fontSizePx: labelSizePx,
        color: labelColor
      });
    }
    const axisColor = model.valAxis?.lineColor ?? model.catAxis?.lineColor ?? "#888888";
    const axisW = Math.max(1, ptToPx(1, vp.scale));
    node.axisLines.push({
      x1: plot.x,
      y1: plot.y + plot.h,
      x2: plot.x + plot.w,
      y2: plot.y + plot.h,
      color: axisColor,
      widthPx: axisW
    });
    node.axisLines.push({
      x1: plot.x,
      y1: plot.y,
      x2: plot.x,
      y2: plot.y + plot.h,
      color: axisColor,
      widthPx: axisW
    });
    if (sec) {
      const secLabelColor = model.valAxis2?.labelColor ?? labelColor;
      node.axisLines.push({
        x1: plot.x + plot.w,
        y1: plot.y,
        x2: plot.x + plot.w,
        y2: plot.y + plot.h,
        color: model.valAxis2?.lineColor ?? axisColor,
        widthPx: axisW
      });
      sec.ticks.forEach((t, i) => {
        node.labels.push({
          text: secTickLabels[i],
          x: plot.x + plot.w + 6,
          y: yOf2(t) - secLabelSizePx * 0.55,
          fontSizePx: secLabelSizePx,
          color: secLabelColor
        });
      });
      if (model.valAxis2?.title) {
        const tw = measure(model.valAxis2.title, secLabelSizePx);
        node.labels.push({
          text: model.valAxis2.title,
          x: box.w - pad,
          y: plot.y + plot.h / 2 - tw / 2,
          fontSizePx: secLabelSizePx,
          color: secLabelColor,
          rotationDeg: 90
        });
      }
    }
    if (model.valAxis?.title) {
      const tw = measure(model.valAxis.title, labelSizePx);
      node.labels.push({
        text: model.valAxis.title,
        x: pad,
        y: plot.y + plot.h / 2 + tw / 2,
        fontSizePx: labelSizePx,
        color: labelColor,
        rotationDeg: -90
      });
    }
    const n = Math.max(model.categories.length, 1);
    const slotW = plot.w / n;
    const maxCatW = Math.max(...model.categories.map((c) => measure(c, catLabelSizePx)), 1);
    const skip = maxCatW <= slotW * 1.3 ? 1 : Math.max(1, Math.ceil(maxCatW / slotW));
    model.categories.forEach((cat, i) => {
      if (i % skip !== 0 && i !== n - 1) return;
      const cx = plot.x + (i + 0.5) * slotW;
      node.labels.push({
        text: cat,
        x: cx - measure(cat, catLabelSizePx) / 2,
        y: plot.y + plot.h + catLabelSizePx * 0.35,
        fontSizePx: catLabelSizePx,
        color: catLabelColor
      });
    });
    const dlSize = labelSizePx * 0.9;
    const dLbl = (cx, y, v, inside) => {
      if (!model.dataLabels) return;
      const text = fmtNum(round12(v));
      node.labels.push({
        text,
        x: cx - measure(text, dlSize) / 2,
        y,
        fontSizePx: dlSize,
        color: inside ? "#FFFFFF" : "#404040"
      });
    };
    if (barSeriesIdx.length && stacked) {
      const gap = (model.gapWidthPct ?? 150) / 100;
      const barW = slotW / (1 + gap);
      for (let i = 0; i < n; i++) {
        const x = plot.x + i * slotW + (slotW - barW) / 2;
        let posAcc = 0;
        let negAcc = 0;
        barSeriesIdx.forEach((si) => {
          const ser = model.series[si];
          const v = valueAt(si, i);
          if (v == null || v === 0) return;
          const color = ser.pointColors?.[i] ?? seriesColor(si);
          const from = v > 0 ? posAcc : negAcc;
          const to = from + v;
          if (v > 0) posAcc = to;
          else negAcc = to;
          const yTop = yOf(Math.max(from, to));
          const yBot = yOf(Math.min(from, to));
          node.bars.push({ x, y: yTop, w: barW, h: Math.max(yBot - yTop, 0.5), color });
          dLbl(x + barW / 2, (yTop + yBot) / 2 - dlSize * 0.55, ser.values[i], true);
        });
      }
    } else if (barSeriesIdx.length) {
      const gap = (model.gapWidthPct ?? 150) / 100;
      const sCount = Math.max(barSeriesIdx.length, 1);
      const barW = slotW / (sCount + gap);
      const groupW = barW * sCount;
      const base = Math.max(min, 0);
      barSeriesIdx.forEach((si, slot) => {
        const ser = model.series[si];
        const color = seriesColor(si);
        ser.values.forEach((v, i) => {
          if (v == null || i >= n) return;
          const x = plot.x + i * slotW + (slotW - groupW) / 2 + slot * barW;
          const yTop = yOf(Math.max(v, base));
          const yBot = yOf(Math.min(v, base));
          node.bars.push({
            x,
            y: yTop,
            w: barW,
            h: Math.max(yBot - yTop, 0.5),
            color: ser.pointColors?.[i] ?? color
          });
          dLbl(x + barW / 2, v >= 0 ? yTop - dlSize * 1.15 : yBot + dlSize * 0.15, v, false);
        });
      });
    }
    {
      const lineW = Math.max(1.5, ptToPx(1.5, vp.scale));
      const markerR = Math.max(2, ptToPx(3, vp.scale));
      model.series.forEach((ser, si) => {
        const k = serKind(ser);
        if (k === "bar") return;
        const secSer = onSecAxis(ser);
        const yOfSer = secSer ? yOf2 : yOf;
        const color = seriesColor(si);
        const pts = [];
        ser.values.forEach((v, i) => {
          if (v == null || i >= n) return;
          const x = plot.x + (i + 0.5) * slotW;
          const y = yOfSer(v);
          pts.push(x, y);
          if (k === "line" && ser.marker) node.markers.push({ x, y, r: markerR, color });
          dLbl(x, y - dlSize * 1.3, v, false);
        });
        if (pts.length < 4) return;
        if (k === "area") {
          const sMin = secSer ? sec.min : min;
          const sMax = secSer ? sec.max : max;
          const baseY = yOfSer(Math.min(Math.max(0, sMin), sMax));
          node.polylines.push({
            points: [pts[0], baseY, ...pts, pts[pts.length - 2], baseY],
            color,
            widthPx: 1,
            closed: true,
            fill: color
          });
        } else {
          node.polylines.push({
            points: pts,
            color,
            widthPx: lineW,
            ...ser.smooth ? { smooth: true } : {}
          });
        }
      });
    }
    if (legendPos && model.series.some((s) => s.name)) {
      const sw = labelSizePx * 1.1;
      const items = model.series.map((s, i) => ({
        label: s.name ?? "",
        color: seriesColor(i)
      }));
      const itemWs = items.map((it) => sw + 4 + measure(it.label, labelSizePx) + labelSizePx);
      if (legendPos === "t" || legendPos === "b") {
        const total = itemWs.reduce((a, b) => a + b, 0);
        let x = Math.max((box.w - total) / 2, pad);
        const y = legendPos === "t" ? pad : box.h - pad - labelSizePx * 1.2;
        items.forEach((it, i) => {
          node.swatches.push({
            x,
            y: y + labelSizePx * 0.25,
            w: sw,
            h: labelSizePx * 0.6,
            color: it.color
          });
          node.labels.push({
            text: it.label,
            x: x + sw + 4,
            y,
            fontSizePx: labelSizePx,
            color: labelColor
          });
          x += itemWs[i];
        });
      } else {
        let y = plot.y;
        const x = plot.x + plot.w + 8 + (sec ? y2LabelW + axisTitle2W + 8 : 0);
        items.forEach((it) => {
          node.swatches.push({
            x,
            y: y + labelSizePx * 0.25,
            w: sw,
            h: labelSizePx * 0.6,
            color: it.color
          });
          node.labels.push({
            text: it.label,
            x: x + sw + 4,
            y,
            fontSizePx: labelSizePx,
            color: labelColor
          });
          y += labelSizePx * 1.5;
        });
      }
    }
    return node;
  }
  function buildPieNode(id, sourceId, model, box, vp, metrics) {
    const ser = model.series[0];
    if (!ser) return null;
    const vals = ser.values.map((v) => v != null && v > 0 ? v : 0);
    const total = vals.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    const node = {
      id,
      type: "chart",
      box,
      sourceId,
      gridLines: [],
      axisLines: [],
      labels: [],
      bars: [],
      polylines: [],
      markers: [],
      swatches: [],
      wedges: []
    };
    const labelSizePx = ptToPx(10, vp.scale);
    const style = {
      fontFamily: LABEL_FONT,
      fontSizePx: labelSizePx,
      bold: false,
      italic: false
    };
    const measure = (text) => metrics.measure(text, style);
    const sliceColor = (i) => ser.pointColors?.[i] ?? PALETTE[i % PALETTE.length];
    const pad = Math.max(6, Math.min(box.w, box.h) * 0.03);
    const legendPos = model.legendPos;
    const legendItems = model.categories.map((cat, i) => ({
      label: cat,
      color: sliceColor(i)
    }));
    const legendRowH = labelSizePx * 1.5;
    let plotW = box.w - pad * 2;
    let plotH = box.h - pad * 2;
    let plotX = pad;
    let plotY = pad;
    const sideLegendW = legendPos === "l" || legendPos === "r" || legendPos === "tr" ? Math.min(
      box.w * 0.4,
      Math.max(...legendItems.map((it) => measure(it.label)), 0) + labelSizePx * 2.2
    ) : 0;
    if (legendPos === "r" || legendPos === "tr") plotW -= sideLegendW;
    else if (legendPos === "l") {
      plotW -= sideLegendW;
      plotX += sideLegendW;
    } else if (legendPos === "t") {
      plotY += legendRowH;
      plotH -= legendRowH;
    } else if (legendPos === "b") plotH -= legendRowH;
    const outerR = Math.max(Math.min(plotW, plotH) / 2, 5);
    const cx = plotX + plotW / 2;
    const cy = plotY + plotH / 2;
    const innerR = outerR * Math.min(Math.max(model.holePct ?? 0, 0), 90) / 100;
    let angle = -90 + (model.firstSliceAngDeg ?? 0);
    vals.forEach((v, i) => {
      if (v <= 0) return;
      const sweep = v / total * 360;
      node.wedges.push({
        cx,
        cy,
        outerR,
        innerR,
        startDeg: angle,
        sweepDeg: sweep,
        color: sliceColor(i)
      });
      if (model.dataLabels) {
        const midRad = (angle + sweep / 2) * Math.PI / 180;
        const r = innerR > 0 ? (innerR + outerR) / 2 : outerR * 0.66;
        const text = model.dataLabelsPct ? `${Math.round(v / total * 100)}%` : fmtNum(v);
        node.labels.push({
          text,
          x: cx + Math.cos(midRad) * r - measure(text) / 2,
          y: cy + Math.sin(midRad) * r - labelSizePx * 0.55,
          fontSizePx: labelSizePx * 0.9,
          color: "#FFFFFF"
        });
      }
      angle += sweep;
    });
    if (legendPos) {
      const sw = labelSizePx * 1.1;
      if (legendPos === "t" || legendPos === "b") {
        const itemWs = legendItems.map((it) => sw + 4 + measure(it.label) + labelSizePx);
        const totalW = itemWs.reduce((a, b) => a + b, 0);
        let x = Math.max((box.w - totalW) / 2, pad);
        const y = legendPos === "t" ? pad * 0.5 : box.h - pad * 0.5 - labelSizePx * 1.2;
        legendItems.forEach((it, i) => {
          node.swatches.push({
            x,
            y: y + labelSizePx * 0.25,
            w: sw,
            h: labelSizePx * 0.6,
            color: it.color
          });
          node.labels.push({
            text: it.label,
            x: x + sw + 4,
            y,
            fontSizePx: labelSizePx,
            color: "#666666"
          });
          x += itemWs[i];
        });
      } else {
        const x = legendPos === "l" ? pad : box.w - sideLegendW;
        let y = Math.max(cy - legendItems.length * legendRowH / 2, pad);
        for (const it of legendItems) {
          node.swatches.push({
            x,
            y: y + labelSizePx * 0.25,
            w: sw,
            h: labelSizePx * 0.6,
            color: it.color
          });
          node.labels.push({
            text: it.label,
            x: x + sw + 4,
            y,
            fontSizePx: labelSizePx,
            color: "#666666"
          });
          y += legendRowH;
        }
      }
    }
    return node;
  }
  function buildHBarNode(id, sourceId, model, box, vp, metrics) {
    const grouping = model.grouping ?? "clustered";
    const stacked = grouping === "stacked" || grouping === "percentStacked";
    const node = emptyChartNode(id, sourceId, box);
    const labelSizePx = ptToPx(model.valAxis?.labelSizePt ?? 10, vp.scale);
    const labelColor = model.valAxis?.labelColor ?? "#666666";
    const catLabelSizePx = ptToPx(
      model.catAxis?.labelSizePt ?? model.valAxis?.labelSizePt ?? 10,
      vp.scale
    );
    const catLabelColor = model.catAxis?.labelColor ?? labelColor;
    const style = (sizePx) => ({
      fontFamily: LABEL_FONT,
      fontSizePx: sizePx,
      bold: false,
      italic: false
    });
    const measure = (text, sizePx) => metrics.measure(text, style(sizePx));
    const seriesColor = (i) => model.series[i]?.color ?? PALETTE[i % PALETTE.length];
    const allVals = model.series.flatMap((s) => s.values.filter((v) => v != null));
    if (!allVals.length) return null;
    const catCount = Math.max(model.categories.length, ...model.series.map((s) => s.values.length), 1);
    const catAbsTotals = Array.from(
      { length: catCount },
      (_, i) => model.series.reduce((a, s) => a + Math.abs(s.values[i] ?? 0), 0)
    );
    const valueAt = (si, i) => {
      const v = model.series[si]?.values[i];
      if (v == null) return null;
      if (grouping !== "percentStacked") return v;
      return v / (catAbsTotals[i] || 1) * 100;
    };
    let dataMax;
    let dataMin;
    if (stacked) {
      const posSums = Array.from(
        { length: catCount },
        (_, i) => model.series.reduce((a, _s, si) => a + Math.max(valueAt(si, i) ?? 0, 0), 0)
      );
      const negSums = Array.from(
        { length: catCount },
        (_, i) => model.series.reduce((a, _s, si) => a + Math.min(valueAt(si, i) ?? 0, 0), 0)
      );
      dataMax = Math.max(...posSums, 0);
      dataMin = Math.min(...negSums, 0);
    } else {
      dataMax = Math.max(...allVals, 0);
      dataMin = Math.min(...allVals, 0);
    }
    const { min, max, ticks } = ppTicks(
      model.valAxis?.min ?? dataMin,
      model.valAxis?.max ?? dataMax,
      model.valAxis?.min == null,
      model.valAxis?.max == null
    );
    const pad = Math.max(4, box.w * 0.01);
    const legendPos = model.legendPos;
    const legendH = legendPos === "t" || legendPos === "b" ? labelSizePx * 1.6 : 0;
    const catLabelW = Math.max(...model.categories.map((c) => measure(c, catLabelSizePx)), 0);
    const plotX = pad + Math.min(catLabelW, box.w * 0.35) + 8;
    const plotY = pad + (legendPos === "t" ? legendH + 4 : 0) + labelSizePx * 0.6;
    const plotR = box.w - pad - labelSizePx * 0.7;
    const plotB = box.h - pad - labelSizePx * 1.5 - (legendPos === "b" ? legendH : 0);
    const plot = {
      x: plotX,
      y: plotY,
      w: Math.max(plotR - plotX, 10),
      h: Math.max(plotB - plotY, 10)
    };
    const xOf = (v) => plot.x + plot.w * ((v - min) / (max - min || 1));
    const gridColor = model.valAxis?.gridColor;
    const tickLabels = ticks.map((t) => fmtNum(t));
    ticks.forEach((t, i) => {
      const x = xOf(t);
      if (gridColor && t !== min) {
        node.gridLines.push({
          x1: x,
          y1: plot.y,
          x2: x,
          y2: plot.y + plot.h,
          color: gridColor,
          ...model.valAxis?.gridDash ? { dash: [4, 4] } : {}
        });
      }
      const text = tickLabels[i];
      node.labels.push({
        text,
        x: x - measure(text, labelSizePx) / 2,
        y: plot.y + plot.h + labelSizePx * 0.35,
        fontSizePx: labelSizePx,
        color: labelColor
      });
    });
    const axisColor = model.valAxis?.lineColor ?? model.catAxis?.lineColor ?? "#888888";
    const axisW = Math.max(1, ptToPx(1, vp.scale));
    node.axisLines.push({
      x1: plot.x,
      y1: plot.y + plot.h,
      x2: plot.x + plot.w,
      y2: plot.y + plot.h,
      color: axisColor,
      widthPx: axisW
    });
    node.axisLines.push({
      x1: plot.x,
      y1: plot.y,
      x2: plot.x,
      y2: plot.y + plot.h,
      color: axisColor,
      widthPx: axisW
    });
    const n = Math.max(model.categories.length, 1);
    const slotH = plot.h / n;
    const rowY = (i) => {
      const pos = model.catAxis?.reversed ? n - 1 - i : i;
      return plot.y + pos * slotH;
    };
    model.categories.forEach((cat, i) => {
      node.labels.push({
        text: cat,
        x: plot.x - 8 - measure(cat, catLabelSizePx),
        y: rowY(i) + slotH / 2 - catLabelSizePx * 0.55,
        fontSizePx: catLabelSizePx,
        color: catLabelColor
      });
    });
    const gap = (model.gapWidthPct ?? 150) / 100;
    const dlSize = labelSizePx * 0.9;
    const dLbl = (x, yMid, v, inside) => {
      if (!model.dataLabels) return;
      const text = fmtNum(round12(v));
      node.labels.push({
        text,
        x: inside ? x - measure(text, dlSize) / 2 : x,
        y: yMid - dlSize * 0.55,
        fontSizePx: dlSize,
        color: inside ? "#FFFFFF" : "#404040"
      });
    };
    if (stacked) {
      const barH = slotH / (1 + gap);
      for (let i = 0; i < n; i++) {
        const y = rowY(i) + (slotH - barH) / 2;
        let posAcc = 0;
        let negAcc = 0;
        model.series.forEach((ser, si) => {
          const v = valueAt(si, i);
          if (v == null || v === 0) return;
          const from = v > 0 ? posAcc : negAcc;
          const to = from + v;
          if (v > 0) posAcc = to;
          else negAcc = to;
          const xL = xOf(Math.min(from, to));
          const xR = xOf(Math.max(from, to));
          node.bars.push({
            x: xL,
            y,
            w: Math.max(xR - xL, 0.5),
            h: barH,
            color: ser.pointColors?.[i] ?? seriesColor(si)
          });
          dLbl((xL + xR) / 2, y + barH / 2, ser.values[i], true);
        });
      }
    } else {
      const sCount = Math.max(model.series.length, 1);
      const barH = slotH / (sCount + gap);
      const groupH = barH * sCount;
      const base = Math.max(min, 0);
      model.series.forEach((ser, si) => {
        const color = seriesColor(si);
        ser.values.forEach((v, i) => {
          if (v == null || i >= n) return;
          const y = rowY(i) + (slotH - groupH) / 2 + si * barH;
          const xL = xOf(Math.min(v, base));
          const xR = xOf(Math.max(v, base));
          node.bars.push({
            x: xL,
            y,
            w: Math.max(xR - xL, 0.5),
            h: barH,
            color: ser.pointColors?.[i] ?? color
          });
          dLbl(v >= 0 ? xR + 4 : xL - 4 - measure(fmtNum(round12(v)), dlSize), y + barH / 2, v, false);
        });
      });
    }
    addSeriesLegend(node, model, box, plot, labelSizePx, measure, pad, seriesColor);
    return node;
  }
  function buildScatterNode(id, sourceId, model, box, vp, metrics) {
    const node = emptyChartNode(id, sourceId, box);
    const labelSizePx = ptToPx(model.valAxis?.labelSizePt ?? 10, vp.scale);
    const labelColor = model.valAxis?.labelColor ?? "#666666";
    const style = (sizePx) => ({
      fontFamily: LABEL_FONT,
      fontSizePx: sizePx,
      bold: false,
      italic: false
    });
    const measure = (text, sizePx) => metrics.measure(text, style(sizePx));
    const seriesColor = (i) => model.series[i]?.color ?? PALETTE[i % PALETTE.length];
    const points = model.series.map(
      (s) => s.values.map((y, i) => ({ x: s.xValues?.[i] ?? i + 1, y })).filter((p) => p.x != null && p.y != null)
    );
    const allX = points.flat().map((p) => p.x);
    const allY = points.flat().map((p) => p.y);
    if (!allY.length) return null;
    const xTicksR = ppTicks(
      model.catAxis?.min ?? Math.min(...allX, 0),
      model.catAxis?.max ?? Math.max(...allX, 0),
      model.catAxis?.min == null,
      model.catAxis?.max == null
    );
    const yTicksR = ppTicks(
      model.valAxis?.min ?? Math.min(...allY, 0),
      model.valAxis?.max ?? Math.max(...allY, 0),
      model.valAxis?.min == null,
      model.valAxis?.max == null
    );
    const pad = Math.max(4, box.w * 0.01);
    const legendPos = model.legendPos;
    const legendH = legendPos === "t" || legendPos === "b" ? labelSizePx * 1.6 : 0;
    const yLabelW = Math.max(...yTicksR.ticks.map((t) => measure(fmtNum(t), labelSizePx)), 0);
    const plotX = pad + yLabelW + 10;
    const plotY = pad + (legendPos === "t" ? legendH + 4 : 0) + labelSizePx * 0.6;
    const plotR = box.w - pad - labelSizePx * 0.7;
    const plotB = box.h - pad - labelSizePx * 1.5 - (legendPos === "b" ? legendH : 0);
    const plot = {
      x: plotX,
      y: plotY,
      w: Math.max(plotR - plotX, 10),
      h: Math.max(plotB - plotY, 10)
    };
    const xOf = (v) => plot.x + plot.w * ((v - xTicksR.min) / (xTicksR.max - xTicksR.min || 1));
    const yOf = (v) => plot.y + plot.h * (1 - (v - yTicksR.min) / (yTicksR.max - yTicksR.min || 1));
    const yGrid = model.valAxis?.gridColor;
    yTicksR.ticks.forEach((t) => {
      const y = yOf(t);
      if (yGrid && t !== yTicksR.min) {
        node.gridLines.push({
          x1: plot.x,
          y1: y,
          x2: plot.x + plot.w,
          y2: y,
          color: yGrid,
          ...model.valAxis?.gridDash ? { dash: [4, 4] } : {}
        });
      }
      const text = fmtNum(t);
      node.labels.push({
        text,
        x: plot.x - 6 - measure(text, labelSizePx),
        y: y - labelSizePx * 0.55,
        fontSizePx: labelSizePx,
        color: labelColor
      });
    });
    const xGrid = model.catAxis?.gridColor;
    xTicksR.ticks.forEach((t) => {
      const x = xOf(t);
      if (xGrid && t !== xTicksR.min) {
        node.gridLines.push({
          x1: x,
          y1: plot.y,
          x2: x,
          y2: plot.y + plot.h,
          color: xGrid,
          ...model.catAxis?.gridDash ? { dash: [4, 4] } : {}
        });
      }
      const text = fmtNum(t);
      node.labels.push({
        text,
        x: x - measure(text, labelSizePx) / 2,
        y: plot.y + plot.h + labelSizePx * 0.35,
        fontSizePx: labelSizePx,
        color: model.catAxis?.labelColor ?? labelColor
      });
    });
    const axisColor = model.valAxis?.lineColor ?? model.catAxis?.lineColor ?? "#888888";
    const axisW = Math.max(1, ptToPx(1, vp.scale));
    node.axisLines.push({
      x1: plot.x,
      y1: plot.y + plot.h,
      x2: plot.x + plot.w,
      y2: plot.y + plot.h,
      color: axisColor,
      widthPx: axisW
    });
    node.axisLines.push({
      x1: plot.x,
      y1: plot.y,
      x2: plot.x,
      y2: plot.y + plot.h,
      color: axisColor,
      widthPx: axisW
    });
    const st = model.scatterStyle ?? "lineMarker";
    const hasLine = st.startsWith("line") || st.startsWith("smooth");
    const smooth = st.startsWith("smooth");
    const defaultMarker = st !== "line" && st !== "smooth" && st !== "none";
    const lineW = Math.max(1.5, ptToPx(1.5, vp.scale));
    const markerR = Math.max(2, ptToPx(3, vp.scale));
    model.series.forEach((ser, si) => {
      const color = seriesColor(si);
      const pts = points[si];
      const showMarker = ser.marker ?? defaultMarker;
      const flat = [];
      for (const p of pts) {
        const x = xOf(p.x);
        const y = yOf(p.y);
        flat.push(x, y);
        if (showMarker) node.markers.push({ x, y, r: markerR, color });
        if (model.dataLabels) {
          const text = fmtNum(round12(p.y));
          node.labels.push({
            text,
            x: x - measure(text, labelSizePx * 0.9) / 2,
            y: y - labelSizePx * 1.3,
            fontSizePx: labelSizePx * 0.9,
            color: "#404040"
          });
        }
      }
      if (hasLine && flat.length >= 4) {
        node.polylines.push({
          points: flat,
          color,
          widthPx: lineW,
          ...smooth || ser.smooth ? { smooth: true } : {}
        });
      }
    });
    addSeriesLegend(node, model, box, plot, labelSizePx, measure, pad, seriesColor);
    return node;
  }
  function buildRadarNode(id, sourceId, model, box, vp, metrics) {
    const n = Math.max(model.categories.length, ...model.series.map((s) => s.values.length));
    if (n < 3) return null;
    const allVals = model.series.flatMap((s) => s.values.filter((v) => v != null));
    if (!allVals.length) return null;
    const node = emptyChartNode(id, sourceId, box);
    const labelSizePx = ptToPx(model.valAxis?.labelSizePt ?? 10, vp.scale);
    const labelColor = model.valAxis?.labelColor ?? "#666666";
    const catLabelColor = model.catAxis?.labelColor ?? labelColor;
    const style = (sizePx) => ({
      fontFamily: LABEL_FONT,
      fontSizePx: sizePx,
      bold: false,
      italic: false
    });
    const measure = (text, sizePx) => metrics.measure(text, style(sizePx));
    const seriesColor = (i) => model.series[i]?.color ?? PALETTE[i % PALETTE.length];
    const { min, max, ticks } = ppTicks(
      model.valAxis?.min ?? Math.min(...allVals, 0),
      model.valAxis?.max ?? Math.max(...allVals, 0),
      model.valAxis?.min == null,
      model.valAxis?.max == null
    );
    const pad = Math.max(6, Math.min(box.w, box.h) * 0.03);
    const legendPos = model.legendPos;
    const legendH = legendPos === "t" || legendPos === "b" ? labelSizePx * 1.6 : 0;
    const maxCatW = Math.max(...model.categories.map((c) => measure(c, labelSizePx)), 0);
    const sideLegendW = legendPos === "l" || legendPos === "r" || legendPos === "tr" ? Math.max(...model.series.map((s) => measure(s.name ?? "", labelSizePx)), 0) + labelSizePx * 2.2 : 0;
    const plotW = box.w - pad * 2 - sideLegendW - maxCatW * 2;
    const plotH = box.h - pad * 2 - legendH - labelSizePx * 2.4;
    const R = Math.max(Math.min(plotW, plotH) / 2, 5);
    const cx = pad + maxCatW + plotW / 2 + (legendPos === "l" ? sideLegendW : 0);
    const cy = pad + labelSizePx * 1.2 + (legendPos === "t" ? legendH : 0) + plotH / 2;
    const plot = { x: cx - R, y: cy - R, w: R * 2, h: R * 2 };
    const angleOf = (i) => -Math.PI / 2 + i / n * Math.PI * 2;
    const rOf = (v) => R * (v - min) / (max - min || 1);
    const ptAt = (i, v) => {
      const a = angleOf(i);
      const r = rOf(v);
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    };
    const gridColor = model.valAxis?.gridColor ?? "#D9D9D9";
    for (const t of ticks) {
      if (t === min) continue;
      const ring = [];
      for (let i = 0; i < n; i++) ring.push(...ptAt(i, t));
      node.polylines.push({ points: ring, color: gridColor, widthPx: 1, closed: true });
    }
    for (let i = 0; i < n; i++) {
      const [x, y] = ptAt(i, max);
      node.gridLines.push({ x1: cx, y1: cy, x2: x, y2: y, color: gridColor });
    }
    for (const t of ticks) {
      const [x, y] = ptAt(0, t);
      const text = fmtNum(t);
      node.labels.push({
        text,
        x: x - measure(text, labelSizePx) - 4,
        y: y - labelSizePx * 0.55,
        fontSizePx: labelSizePx * 0.9,
        color: labelColor
      });
    }
    model.categories.forEach((cat, i) => {
      const a = angleOf(i);
      const lx = cx + Math.cos(a) * (R + labelSizePx * 0.5);
      const ly = cy + Math.sin(a) * (R + labelSizePx * 0.5);
      const w = measure(cat, labelSizePx);
      const alignX = Math.cos(a) > 0.3 ? lx : Math.cos(a) < -0.3 ? lx - w : lx - w / 2;
      const alignY = Math.sin(a) > 0.3 ? ly : Math.sin(a) < -0.3 ? ly - labelSizePx : ly - labelSizePx * 0.55;
      node.labels.push({
        text: cat,
        x: alignX,
        y: alignY,
        fontSizePx: labelSizePx,
        color: catLabelColor
      });
    });
    const filled = model.radarStyle === "filled";
    const markerDefault = model.radarStyle === "marker";
    const lineW = Math.max(1.5, ptToPx(1.5, vp.scale));
    const markerR = Math.max(2, ptToPx(3, vp.scale));
    model.series.forEach((ser, si) => {
      const color = seriesColor(si);
      const flat = [];
      for (let i = 0; i < n; i++) {
        const v = ser.values[i];
        if (v == null) continue;
        const [x, y] = ptAt(i, v);
        flat.push(x, y);
        if (ser.marker ?? markerDefault) node.markers.push({ x, y, r: markerR, color });
      }
      if (flat.length >= 6) {
        node.polylines.push({
          points: flat,
          color,
          widthPx: lineW,
          closed: true,
          ...filled ? { fill: withAlpha(color, 0.4) } : {}
        });
      }
    });
    addSeriesLegend(node, model, box, plot, labelSizePx, measure, pad, seriesColor);
    return node;
  }
  function emptyChartNode(id, sourceId, box) {
    return {
      id,
      type: "chart",
      box,
      sourceId,
      gridLines: [],
      axisLines: [],
      labels: [],
      bars: [],
      polylines: [],
      markers: [],
      swatches: []
    };
  }
  function addSeriesLegend(node, model, box, plot, labelSizePx, measure, pad, seriesColor) {
    const legendPos = model.legendPos;
    if (!legendPos || !model.series.some((s) => s.name)) return;
    const sw = labelSizePx * 1.1;
    const items = model.series.map((s, i) => ({
      label: s.name ?? "",
      color: seriesColor(i)
    }));
    const itemWs = items.map((it) => sw + 4 + measure(it.label, labelSizePx) + labelSizePx);
    const labelColor = model.valAxis?.labelColor ?? "#666666";
    if (legendPos === "t" || legendPos === "b") {
      const total = itemWs.reduce((a, b) => a + b, 0);
      let x = Math.max((box.w - total) / 2, pad);
      const y = legendPos === "t" ? pad : box.h - pad - labelSizePx * 1.2;
      items.forEach((it, i) => {
        node.swatches.push({
          x,
          y: y + labelSizePx * 0.25,
          w: sw,
          h: labelSizePx * 0.6,
          color: it.color
        });
        node.labels.push({
          text: it.label,
          x: x + sw + 4,
          y,
          fontSizePx: labelSizePx,
          color: labelColor
        });
        x += itemWs[i];
      });
    } else {
      let y = plot.y;
      const x = plot.x + plot.w + 8;
      items.forEach((it) => {
        node.swatches.push({
          x,
          y: y + labelSizePx * 0.25,
          w: sw,
          h: labelSizePx * 0.6,
          color: it.color
        });
        node.labels.push({
          text: it.label,
          x: x + sw + 4,
          y,
          fontSizePx: labelSizePx,
          color: labelColor
        });
        y += labelSizePx * 1.5;
      });
    }
  }
  function withAlpha(hex, alpha) {
    const m = /^#([0-9a-fA-F]{6})/.exec(hex);
    if (!m) return hex;
    const v = parseInt(m[1], 16);
    return `rgba(${v >> 16 & 255}, ${v >> 8 & 255}, ${v & 255}, ${alpha})`;
  }
  function ppTicks(rawMin, rawMax, autoMin, autoMax) {
    let lo = autoMin ? Math.min(rawMin, 0) : rawMin;
    let hi = rawMax;
    if (hi <= lo) hi = lo + 1;
    const span0 = hi - lo;
    const hiT = autoMax && hi > 0 ? hi + span0 * 0.05 : hi;
    const loT = autoMin && lo < 0 ? lo - span0 * 0.05 : lo;
    const step = ppUnit((hiT - loT) / 8);
    if (autoMin) lo = Math.floor(loT / step) * step;
    if (autoMax) hi = Math.ceil(hiT / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(round12(v));
    return { min: lo, max: hi, ticks };
  }
  function ppUnit(x) {
    const exp = Math.floor(Math.log10(Math.max(x, 1e-12)));
    const f = x / 10 ** exp;
    const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return nf * 10 ** exp;
  }
  function round12(v) {
    return Math.round(v * 1e12) / 1e12;
  }
  function fmtNum(v) {
    if (Number.isInteger(v)) return v.toLocaleString("en-US");
    return String(v);
  }

  // ../engine/pptx-render/preset-geometry.ts
  var CONNECTOR_RE = /^(line|straightConnector\d?|bentConnector\d|curvedConnector\d)$/;
  function isConnectorPreset(preset) {
    return !!preset && CONNECTOR_RE.test(preset);
  }
  function connectorPoints(preset, w, h, flipH, flipV, adjust) {
    let pts;
    if (/^bentConnector|^curvedConnector/.test(preset)) {
      pts = bentConnectorPts(preset, w, h, adjust);
    } else {
      pts = [0, 0, w, h];
    }
    if (flipH) for (let i = 0; i < pts.length; i += 2) pts[i] = w - pts[i];
    if (flipV) for (let i = 1; i < pts.length; i += 2) pts[i] = h - pts[i];
    return pts;
  }
  function bentConnectorPts(preset, w, h, adjust) {
    const n = parseInt(preset.slice(-1), 10) || 2;
    const clamp = (v, lo = -2, hi = 3) => Math.min(Math.max(v, lo), hi);
    const adj = (name, dflt) => adjust?.[name] != null ? clamp(adjust[name] / 1e5) : dflt;
    if (n <= 2) {
      return [0, 0, w, 0, w, h];
    } else if (n === 3) {
      const a1 = adj("adj1", 0.5);
      const mx = w * a1;
      return [0, 0, mx, 0, mx, h, w, h];
    } else if (n === 4) {
      const a1 = adj("adj1", 0.5);
      const a2 = adj("adj2", 0.5);
      const mx = w * a1;
      const my = h * a2;
      return [0, 0, mx, 0, mx, my, w, my, w, h];
    } else {
      const a1 = adj("adj1", 0.333);
      const a2 = adj("adj2", 0.5);
      const a3 = adj("adj3", 0.667);
      const x1 = w * a1;
      const y1 = h * a2;
      const x2 = w * a3;
      return [0, 0, x1, 0, x1, y1, x2, y1, x2, h, w, h];
    }
  }
  function connectorBezier(pts) {
    const nPts = pts.length / 2;
    if (nPts < 3) return [];
    const bezier = [];
    for (let i = 1; i < nPts; i++) {
      const x0 = pts[(i - 1) * 2];
      const y0 = pts[(i - 1) * 2 + 1];
      const x1 = pts[i * 2];
      const y1 = pts[i * 2 + 1];
      const prevX = i > 1 ? pts[(i - 2) * 2] : x0;
      const prevY = i > 1 ? pts[(i - 2) * 2 + 1] : y0;
      const nextX = i < nPts - 1 ? pts[(i + 1) * 2] : x1;
      const nextY = i < nPts - 1 ? pts[(i + 1) * 2 + 1] : y1;
      const cp1x = x0 + (x1 - prevX) / 6;
      const cp1y = y0 + (y1 - prevY) / 6;
      const cp2x = x1 - (nextX - x0) / 6;
      const cp2y = y1 - (nextY - y0) / 6;
      bezier.push(cp1x, cp1y, cp2x, cp2y, x1, y1);
    }
    return bezier;
  }
  function presetPolygon(preset, w, h, adjust) {
    if (!preset || w <= 0 || h <= 0) return null;
    const ss = Math.min(w, h);
    const frac = (name, dflt) => Math.min(Math.max((adjust?.[name] ?? dflt) / 1e5, 0), 1);
    switch (preset) {
      case "triangle": {
        const apex = w * frac("adj", 5e4);
        return [apex, 0, w, h, 0, h];
      }
      case "rtTriangle":
        return [0, 0, w, h, 0, h];
      case "diamond":
      case "flowChartDecision":
        return [w / 2, 0, w, h / 2, w / 2, h, 0, h / 2];
      case "parallelogram": {
        const inset = ss * frac("adj", 25e3);
        return [inset, 0, w, 0, w - inset, h, 0, h];
      }
      case "trapezoid": {
        const inset = ss * frac("adj", 25e3);
        return [inset, 0, w - inset, 0, w, h, 0, h];
      }
      case "pentagon": {
        return [w / 2, 0, w, h * 0.382, w * 0.809, h, w * 0.191, h, 0, h * 0.382];
      }
      case "hexagon": {
        const inset = ss * frac("adj", 25e3);
        return [inset, 0, w - inset, 0, w, h / 2, w - inset, h, inset, h, 0, h / 2];
      }
      case "octagon": {
        const c = ss * frac("adj", 29289);
        return [c, 0, w - c, 0, w, c, w, h - c, w - c, h, c, h, 0, h - c, 0, c];
      }
      case "mathPlus": {
        const t = ss * frac("adj1", 23520);
        const dx = w * 73490 / 2e5;
        const dy = h * 73490 / 2e5;
        const hc = w / 2;
        const vc = h / 2;
        const x1 = hc - dx;
        const x2 = hc - t;
        const x3 = hc + t;
        const x4 = hc + dx;
        const y1 = vc - dy;
        const y2 = vc - t;
        const y3 = vc + t;
        const y4 = vc + dy;
        return [x1, y2, x2, y2, x2, y1, x3, y1, x3, y2, x4, y2, x4, y3, x3, y3, x3, y4, x2, y4, x2, y3, x1, y3];
      }
      case "plus": {
        const a = ss * frac("adj", 25e3);
        const x1 = a;
        const x2 = w - a;
        const y1 = a;
        const y2 = h - a;
        return [x1, 0, x2, 0, x2, y1, w, y1, w, y2, x2, y2, x2, h, x1, h, x1, y2, 0, y2, 0, y1, x1, y1];
      }
      case "rightArrow": {
        const thick = h * frac("adj1", 5e4);
        const head = Math.min(w, ss * frac("adj2", 5e4));
        const y1 = (h - thick) / 2;
        const y2 = (h + thick) / 2;
        const xh = w - head;
        return [0, y1, xh, y1, xh, 0, w, h / 2, xh, h, xh, y2, 0, y2];
      }
      case "notchedRightArrow": {
        const thick = h * frac("adj1", 5e4);
        const head = Math.min(w, ss * frac("adj2", 5e4));
        const y1 = (h - thick) / 2;
        const y2 = (h + thick) / 2;
        const xh = w - head;
        const notch = head * thick / h;
        return [0, y1, xh, y1, xh, 0, w, h / 2, xh, h, xh, y2, 0, y2, notch, h / 2];
      }
      case "leftArrow": {
        const thick = h * frac("adj1", 5e4);
        const head = Math.min(w, ss * frac("adj2", 5e4));
        const y1 = (h - thick) / 2;
        const y2 = (h + thick) / 2;
        return [w, y1, head, y1, head, 0, 0, h / 2, head, h, head, y2, w, y2];
      }
      case "upArrow": {
        const thick = w * frac("adj1", 5e4);
        const head = Math.min(h, ss * frac("adj2", 5e4));
        const x1 = (w - thick) / 2;
        const x2 = (w + thick) / 2;
        return [x1, h, x1, head, 0, head, w / 2, 0, w, head, x2, head, x2, h];
      }
      case "downArrow": {
        const thick = w * frac("adj1", 5e4);
        const head = Math.min(h, ss * frac("adj2", 5e4));
        const x1 = (w - thick) / 2;
        const x2 = (w + thick) / 2;
        const yh = h - head;
        return [x1, 0, x1, yh, 0, yh, w / 2, h, w, yh, x2, yh, x2, 0];
      }
      case "leftRightArrow": {
        const thick = h * frac("adj1", 5e4);
        const head = Math.min(w / 2, ss * frac("adj2", 5e4));
        const y1 = (h - thick) / 2;
        const y2 = (h + thick) / 2;
        return [
          0,
          h / 2,
          head,
          0,
          head,
          y1,
          w - head,
          y1,
          w - head,
          0,
          w,
          h / 2,
          w - head,
          h,
          w - head,
          y2,
          head,
          y2,
          head,
          h
        ];
      }
      case "upDownArrow": {
        const thick = w * frac("adj1", 5e4);
        const head = Math.min(h / 2, ss * frac("adj2", 5e4));
        const x1 = (w - thick) / 2;
        const x2 = (w + thick) / 2;
        return [
          w / 2,
          0,
          w,
          head,
          x2,
          head,
          x2,
          h - head,
          w,
          h - head,
          w / 2,
          h,
          0,
          h - head,
          x1,
          h - head,
          x1,
          head,
          0,
          head
        ];
      }
      case "chevron": {
        const d = ss * frac("adj", 5e4);
        return [0, 0, w - d, 0, w, h / 2, w - d, h, 0, h, d, h / 2];
      }
      case "homePlate": {
        const d = ss * frac("adj", 5e4);
        return [0, 0, w - d, 0, w, h / 2, w - d, h, 0, h];
      }
      case "snip1Rect": {
        const a = ss * frac("adj", 16667);
        return [0, 0, w - a, 0, w, a, w, h, 0, h];
      }
      case "snip2SameRect": {
        const a1 = ss * frac("adj1", 16667);
        const a2 = ss * frac("adj2", 0);
        return [a1, 0, w - a1, 0, w, a1, w, h - a2, w - a2, h, a2, h, 0, h - a2, 0, a1];
      }
      case "snip2DiagRect": {
        const a1 = ss * frac("adj1", 0);
        const a2 = ss * frac("adj2", 16667);
        return [a1, 0, w - a2, 0, w, a2, w, h - a1, w - a1, h, a2, h, 0, h - a2, 0, a1];
      }
      case "halfFrame": {
        const y1 = ss * frac("adj1", 33333);
        const x1 = ss * frac("adj2", 33333);
        const x2 = Math.max(w - y1 * w / h, x1);
        const y2 = Math.max(h - x1 * h / w, y1);
        return [0, 0, w, 0, x2, y1, x1, y1, x1, y2, 0, h];
      }
      case "corner": {
        const y1 = ss * frac("adj1", 5e4);
        const x1 = ss * frac("adj2", 5e4);
        return [0, 0, x1, 0, x1, h - y1, w, h - y1, w, h, 0, h];
      }
      case "diagStripe": {
        const a = frac("adj", 5e4);
        return [0, h * a, w * a, 0, w, 0, 0, h];
      }
      case "lightningBolt": {
        const u = [
          8472,
          0,
          12860,
          6672,
          11050,
          6672,
          16577,
          12007,
          14767,
          12007,
          21600,
          21600,
          10800,
          14387,
          12377,
          14387,
          5333,
          6667,
          7778,
          6667
        ];
        return u.map((v, i) => v / 21600 * (i % 2 === 0 ? w : h));
      }
      case "flowChartPreparation":
        return [w * 0.2, 0, w * 0.8, 0, w, h / 2, w * 0.8, h, w * 0.2, h, 0, h / 2];
      case "flowChartManualInput":
        return [0, h / 5, w, 0, w, h, 0, h];
      case "flowChartManualOperation":
        return [0, 0, w, 0, w * 0.8, h, w * 0.2, h];
      case "flowChartOffpageConnector":
        return [0, 0, w, 0, w, h * 0.8, w / 2, h, 0, h * 0.8];
      case "flowChartExtract":
        return [w / 2, 0, w, h, 0, h];
      case "flowChartMerge":
        return [0, 0, w, 0, w / 2, h];
      case "flowChartCollate":
        return [0, 0, w, 0, w / 2, h / 2, w, h, 0, h, w / 2, h / 2];
      case "gear6": {
        const depth = Math.min(frac("adj1", 15e3) * 2, 0.6);
        return gearPoints(6, w, h, 1 - depth);
      }
      case "funnel":
        return [0, 0, w, 0, w * 0.62, h * 0.62, w * 0.62, h, w * 0.38, h, w * 0.38, h * 0.62];
      case "quadArrow": {
        const sw2 = ss * frac("adj1", 22500) / 2;
        const hw = ss * frac("adj2", 22500);
        const hl = ss * frac("adj3", 22500);
        const cx = w / 2;
        const cy = h / 2;
        return [
          cx,
          0,
          cx + hw,
          hl,
          cx + sw2,
          hl,
          cx + sw2,
          cy - sw2,
          w - hl,
          cy - sw2,
          w - hl,
          cy - hw,
          w,
          cy,
          w - hl,
          cy + hw,
          w - hl,
          cy + sw2,
          cx + sw2,
          cy + sw2,
          cx + sw2,
          h - hl,
          cx + hw,
          h - hl,
          cx,
          h,
          cx - hw,
          h - hl,
          cx - sw2,
          h - hl,
          cx - sw2,
          cy + sw2,
          hl,
          cy + sw2,
          hl,
          cy + hw,
          0,
          cy,
          hl,
          cy - hw,
          hl,
          cy - sw2,
          cx - sw2,
          cy - sw2,
          cx - sw2,
          hl,
          cx - hw,
          hl
        ];
      }
      case "bentArrow": {
        const t = ss * frac("adj1", 25e3);
        const hw = ss * frac("adj2", 25e3);
        const hl = ss * frac("adj3", 25e3);
        const yc = Math.max(hw, t / 2);
        return [
          0,
          h,
          0,
          yc - t / 2,
          w - hl,
          yc - t / 2,
          w - hl,
          yc - hw,
          w,
          yc,
          w - hl,
          yc + hw,
          w - hl,
          yc + t / 2,
          t,
          yc + t / 2,
          t,
          h
        ];
      }
      case "wedgeRectCallout": {
        const tipX = w / 2 + w * adjRaw(adjust, "adj1", -20833);
        const tipY = h / 2 + h * adjRaw(adjust, "adj2", 62500);
        return wedgeCalloutPolygon(w, h, tipX, tipY);
      }
      case "irregularSeal1":
        return starPoints(11, w, h, 0.3);
      case "irregularSeal2":
        return starPoints(13, w, h, 0.25);
      case "star4":
        return starPoints(4, w, h, frac("adj", 12500));
      case "star5":
        return starPoints(5, w, h, frac("adj", 19098));
      case "star6":
        return starPoints(6, w, h, frac("adj", 28868));
      case "star7":
        return starPoints(7, w, h, frac("adj", 34601));
      case "star8":
        return starPoints(8, w, h, frac("adj", 37500));
      case "star10":
        return starPoints(10, w, h, frac("adj", 42533));
      case "star12":
        return starPoints(12, w, h, frac("adj", 37500));
      case "star16":
        return starPoints(16, w, h, frac("adj", 37500));
      case "star24":
        return starPoints(24, w, h, frac("adj", 37500));
      case "star32":
        return starPoints(32, w, h, frac("adj", 37500));
      default:
        return null;
    }
  }
  function adjRaw(adjust, name, dflt) {
    const v = (adjust?.[name] ?? dflt) / 1e5;
    return Math.min(Math.max(v, -2), 2);
  }
  function wedgeCalloutPolygon(w, h, tipX, tipY) {
    const g = Math.min(w, h) * 0.1;
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const nx = (tipX - w / 2) / w;
    const ny = (tipY - h / 2) / h;
    if (Math.abs(ny) >= Math.abs(nx)) {
      const bx = clamp(tipX, 2 * g, w - 2 * g);
      if (ny >= 0) return [0, 0, w, 0, w, h, bx + g, h, tipX, tipY, bx - g, h, 0, h];
      return [0, 0, bx - g, 0, tipX, tipY, bx + g, 0, w, 0, w, h, 0, h];
    }
    const by = clamp(tipY, 2 * g, h - 2 * g);
    if (nx >= 0) return [0, 0, w, 0, w, by - g, tipX, tipY, w, by + g, w, h, 0, h];
    return [0, 0, w, 0, w, h, 0, h, 0, by + g, tipX, tipY, 0, by - g];
  }
  function gearPoints(teeth, w, h, innerR) {
    const cx = w / 2;
    const cy = h / 2;
    const pitch = 360 / teeth;
    const tipHalf = pitch * 0.16;
    const rootHalf = pitch * 0.38;
    const pts = [];
    for (let i = 0; i < teeth; i++) {
      const c = -90 + i * pitch;
      for (const [off, r] of [[-rootHalf, innerR], [-tipHalf, 1], [tipHalf, 1], [rootHalf, innerR]]) {
        const a = (c + off) * Math.PI / 180;
        pts.push(cx + Math.cos(a) * cx * r, cy + Math.sin(a) * cy * r);
      }
    }
    return pts;
  }
  function starPoints(n, w, h, innerFrac) {
    const cx = w / 2;
    const cy = h / 2;
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const ang = -Math.PI / 2 + i * Math.PI / n;
      const f = i % 2 === 0 ? 1 : innerFrac * 2;
      const fr = Math.min(f, 1);
      pts.push(cx + Math.cos(ang) * cx * fr, cy + Math.sin(ang) * cy * fr);
    }
    return pts;
  }
  function isPillPreset(preset) {
    return preset === "flowChartTerminator" || preset === "flowChartAlternateProcess";
  }
  var R2 = (v) => Math.round(v * 100) / 100;
  var D2R = Math.PI / 180;
  var PathB = class {
    parts = [];
    M(x, y) {
      this.parts.push(`M ${R2(x)} ${R2(y)}`);
      return this;
    }
    L(x, y) {
      this.parts.push(`L ${R2(x)} ${R2(y)}`);
      return this;
    }
    Q(x1, y1, x, y) {
      this.parts.push(`Q ${R2(x1)} ${R2(y1)} ${R2(x)} ${R2(y)}`);
      return this;
    }
    C(x1, y1, x2, y2, x, y) {
      this.parts.push(`C ${R2(x1)} ${R2(y1)} ${R2(x2)} ${R2(y2)} ${R2(x)} ${R2(y)}`);
      return this;
    }
    Z() {
      this.parts.push("Z");
      return this;
    }
    /** Parametric angles (degrees, y-down clockwise positive); move says whether to M/L to the arc start first */
    arc(cx, cy, rx, ry, startDeg, sweepDeg, move) {
      const st = startDeg * D2R;
      const sw = sweepDeg * D2R;
      const sx = cx + rx * Math.cos(st);
      const sy = cy + ry * Math.sin(st);
      if (move === "M") this.M(sx, sy);
      else if (move === "L") this.L(sx, sy);
      if (sw === 0) return this;
      const segs = Math.max(1, Math.ceil(Math.abs(sw) / (Math.PI / 2)));
      const da = sw / segs;
      const k = 4 / 3 * Math.tan(da / 4);
      for (let i = 0; i < segs; i++) {
        const a1 = st + i * da;
        const a2 = a1 + da;
        const x1 = cx + rx * Math.cos(a1);
        const y1 = cy + ry * Math.sin(a1);
        const x2 = cx + rx * Math.cos(a2);
        const y2 = cy + ry * Math.sin(a2);
        this.C(
          x1 - k * rx * Math.sin(a1),
          y1 + k * ry * Math.cos(a1),
          x2 + k * rx * Math.sin(a2),
          y2 - k * ry * Math.cos(a2),
          x2,
          y2
        );
      }
      return this;
    }
    d() {
      return this.parts.join(" ");
    }
  };
  function ellipseSub(b, cx, cy, rx, ry, ccw = false) {
    b.arc(cx, cy, rx, ry, 0, ccw ? -360 : 360, "M").Z();
  }
  function mixedCornerRect(w, h, sizes, kinds) {
    const [tl, tr, br, bl] = sizes;
    const b = new PathB();
    b.M(tl, 0).L(w - tr, 0);
    if (kinds[1] === "round") b.arc(w - tr, tr, tr, tr, 270, 90);
    else if (kinds[1] === "snip") b.L(w, tr);
    b.L(w, h - br);
    if (kinds[2] === "round") b.arc(w - br, h - br, br, br, 0, 90);
    else if (kinds[2] === "snip") b.L(w - br, h);
    b.L(bl, h);
    if (kinds[3] === "round") b.arc(bl, h - bl, bl, bl, 90, 90);
    else if (kinds[3] === "snip") b.L(0, h - bl);
    b.L(0, tl);
    if (kinds[0] === "round") b.arc(tl, tl, tl, tl, 180, 90);
    else if (kinds[0] === "snip") b.L(tl, 0);
    return b.Z().d();
  }
  function cloudBlob(w, h) {
    const b = new PathB();
    const u = [
      [0.2, 0.85],
      [0.06, 0.86],
      [0, 0.72],
      [0.02, 0.59],
      [0.03, 0.47],
      [0.11, 0.39],
      [0.2, 0.42],
      [0.19, 0.26],
      [0.29, 0.14],
      [0.4, 0.2],
      [0.45, 0.07],
      [0.6, 0.04],
      [0.67, 0.14],
      [0.76, 0.04],
      [0.91, 0.1],
      [0.92, 0.26],
      [0.99, 0.31],
      [1, 0.46],
      [0.97, 0.56],
      [1, 0.69],
      [0.94, 0.81],
      [0.85, 0.82],
      [0.83, 0.94],
      [0.72, 0.98],
      [0.65, 0.91],
      [0.58, 1],
      [0.45, 1],
      [0.39, 0.91],
      [0.33, 0.98],
      [0.23, 0.95],
      [0.2, 0.85]
    ];
    b.M(u[0][0] * w, u[0][1] * h);
    for (let i = 1; i + 2 < u.length + 1; i += 3) {
      b.C(u[i][0] * w, u[i][1] * h, u[i + 1][0] * w, u[i + 1][1] * h, u[i + 2][0] * w, u[i + 2][1] * h);
    }
    return b.Z();
  }
  function presetPath(preset, w, h, adjust) {
    if (!preset || w <= 0 || h <= 0) return null;
    const ss = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;
    const frac = (name, dflt) => Math.min(Math.max((adjust?.[name] ?? dflt) / 1e5, 0), 1);
    const ang = (name, dflt) => (adjust?.[name] ?? dflt) / 6e4;
    const sweepCW = (a1, a2) => ((a2 - a1) % 360 + 360) % 360;
    switch (preset) {
      case "arc": {
        const a1 = ang("adj1", 162e5);
        const a2 = ang("adj2", 0);
        const sw = sweepCW(a1, a2) || 90;
        const fill = new PathB().M(cx, cy);
        fill.arc(cx, cy, cx, cy, a1, sw, "L").Z();
        const stroke = new PathB().arc(cx, cy, cx, cy, a1, sw, "M");
        return { fillPath: fill.d(), strokePath: stroke.d() };
      }
      case "chord": {
        const a1 = ang("adj1", 27e5);
        const a2 = ang("adj2", 162e5);
        return { path: new PathB().arc(cx, cy, cx, cy, a1, sweepCW(a1, a2) || 180, "M").Z().d() };
      }
      case "pie": {
        const a1 = ang("adj1", 0);
        const a2 = ang("adj2", 162e5);
        return { path: new PathB().M(cx, cy).arc(cx, cy, cx, cy, a1, sweepCW(a1, a2) || 270, "L").Z().d() };
      }
      case "blockArc": {
        const a1 = ang("adj1", 108e5);
        const a2 = ang("adj2", 0);
        const sw = sweepCW(a1, a2) || 180;
        const t = ss * frac("adj3", 25e3);
        const rxI = Math.max(cx - t, 0);
        const ryI = Math.max(cy - t, 0);
        const b = new PathB().arc(cx, cy, cx, cy, a1, sw, "M");
        b.arc(cx, cy, rxI, ryI, a1 + sw, -sw, "L").Z();
        return { path: b.d() };
      }
      case "donut": {
        const t = ss * frac("adj", 25e3);
        const b = new PathB();
        ellipseSub(b, cx, cy, cx, cy);
        ellipseSub(b, cx, cy, Math.max(cx - t, 0), Math.max(cy - t, 0), true);
        return { path: b.d() };
      }
      case "frame": {
        const t = ss * frac("adj1", 12500);
        const b = new PathB().M(0, 0).L(w, 0).L(w, h).L(0, h).Z();
        b.M(t, t).L(t, h - t).L(w - t, h - t).L(w - t, t).Z();
        return { path: b.d() };
      }
      case "round1Rect": {
        const r = ss * frac("adj", 16667);
        return { path: mixedCornerRect(w, h, [0, r, 0, 0], ["none", "round", "none", "none"]) };
      }
      case "round2SameRect": {
        const r1 = ss * frac("adj1", 16667);
        const r2 = ss * frac("adj2", 0);
        return { path: mixedCornerRect(w, h, [r1, r1, r2, r2], ["round", "round", "round", "round"]) };
      }
      case "round2DiagRect": {
        const r1 = ss * frac("adj1", 16667);
        const r2 = ss * frac("adj2", 0);
        return { path: mixedCornerRect(w, h, [r1, r2, r1, r2], ["round", "round", "round", "round"]) };
      }
      case "snipRoundRect": {
        const r1 = ss * frac("adj1", 16667);
        const r2 = ss * frac("adj2", 16667);
        return { path: mixedCornerRect(w, h, [r1, r2, 0, 0], ["round", "snip", "none", "none"]) };
      }
      case "heart": {
        const b = new PathB().M(0.5 * w, 0.3 * h);
        b.C(0.5 * w, 0.12 * h, 0.36 * w, 0.01 * h, 0.22 * w, 0.01 * h);
        b.C(0.06 * w, 0.01 * h, 0, 0.15 * h, 0, 0.28 * h);
        b.C(0, 0.5 * h, 0.2 * w, 0.65 * h, 0.5 * w, h);
        b.C(0.8 * w, 0.65 * h, w, 0.5 * h, w, 0.28 * h);
        b.C(w, 0.15 * h, 0.94 * w, 0.01 * h, 0.78 * w, 0.01 * h);
        b.C(0.64 * w, 0.01 * h, 0.5 * w, 0.12 * h, 0.5 * w, 0.3 * h);
        return { path: b.Z().d() };
      }
      case "moon": {
        const g = frac("adj", 5e4);
        const b = new PathB().arc(w, cy, w, cy, 270, -180, "M");
        b.arc(w, cy, w * (1 - g), cy, 90, 180);
        return { path: b.Z().d() };
      }
      case "sun": {
        const g = frac("adj", 25e3);
        const rx = w * g;
        const ry = h * g;
        const b = new PathB();
        for (let k = 0; k < 8; k++) {
          const a = k * 45 * D2R;
          const tipX = cx + cx * Math.cos(a);
          const tipY = cy + cy * Math.sin(a);
          const br = 1.35;
          const a1 = a - 12 * D2R;
          const a2 = a + 12 * D2R;
          b.M(cx + rx * br * Math.cos(a1), cy + ry * br * Math.sin(a1)).L(tipX, tipY).L(cx + rx * br * Math.cos(a2), cy + ry * br * Math.sin(a2)).Z();
        }
        ellipseSub(b, cx, cy, rx, ry);
        return { path: b.d() };
      }
      case "cloud":
        return { path: cloudBlob(w, h).d() };
      case "cloudCallout": {
        const tipX = cx + w * adjRaw(adjust, "adj1", -20833);
        const tipY = cy + h * adjRaw(adjust, "adj2", 62500);
        const b = cloudBlob(w, h);
        for (const [t, r] of [[0.72, 0.075], [0.92, 0.045]]) {
          ellipseSub(b, cx + (tipX - cx) * t, cy + (tipY - cy) * t, ss * r, ss * r);
        }
        return { path: b.d() };
      }
      case "teardrop": {
        const a = Math.min(Math.max((adjust?.adj ?? 1e5) / 1e5, 0), 2);
        const tipX = cx + cx * a;
        const tipY = cy - cy * a;
        const b = new PathB().arc(cx, cy, cx, cy, 0, 270, "M");
        b.Q(cx + (tipX - cx) / 2, tipY, tipX, tipY).Q(w, (tipY + cy) / 2, w, cy);
        return { path: b.Z().d() };
      }
      case "plaque": {
        const r = ss * frac("adj", 16667);
        const b = new PathB().M(r, 0).L(w - r, 0);
        b.arc(w, 0, r, r, 180, -90).L(w, h - r);
        b.arc(w, h, r, r, 270, -90).L(r, h);
        b.arc(0, h, r, r, 0, -90).L(0, r);
        b.arc(0, 0, r, r, 90, -90);
        return { path: b.Z().d() };
      }
      case "cube": {
        const d = ss * frac("adj", 25e3);
        const path = new PathB().M(0, d).L(d, 0).L(w, 0).L(w, h - d).L(w - d, h).L(0, h).Z().d();
        const inner = new PathB().M(0, d).L(w - d, d).L(w, 0).M(w - d, d).L(w - d, h).d();
        return { path, strokePath: inner };
      }
      case "can": {
        const ry = h * frac("adj", 25e3) / 2;
        const b = new PathB().M(0, ry).L(0, h - ry);
        b.arc(cx, h - ry, cx, ry, 180, -180).L(w, ry);
        b.arc(cx, ry, cx, ry, 0, -180).Z();
        const rim = new PathB().arc(cx, ry, cx, ry, 180, -180, "M").d();
        return { path: b.d(), strokePath: rim };
      }
      case "flowChartMagneticDisk": {
        const ry = h / 6;
        const b = new PathB().M(0, ry).L(0, h - ry);
        b.arc(cx, h - ry, cx, ry, 180, -180).L(w, ry);
        b.arc(cx, ry, cx, ry, 0, -180).Z();
        const rim = new PathB().arc(cx, ry, cx, ry, 180, -180, "M").d();
        return { path: b.d(), strokePath: rim };
      }
      case "flowChartMagneticDrum": {
        const rx = w / 6;
        const b = new PathB().arc(w - rx, cy, rx, cy, 270, 180, "M").L(rx, h);
        b.arc(rx, cy, rx, cy, 90, 180).Z();
        const rim = new PathB().arc(w - rx, cy, rx, cy, 270, -180, "M").d();
        return { path: b.d(), strokePath: rim };
      }
      case "bevel": {
        const t = ss * frac("adj", 12500);
        const path = new PathB().M(0, 0).L(w, 0).L(w, h).L(0, h).Z().d();
        const inner = new PathB().M(t, t).L(w - t, t).L(w - t, h - t).L(t, h - t).Z().M(0, 0).L(t, t).M(w, 0).L(w - t, t).M(w, h).L(w - t, h - t).M(0, h).L(t, h - t);
        return { path, strokePath: inner.d() };
      }
      case "foldedCorner": {
        const f = ss * frac("adj", 16667);
        const path = new PathB().M(0, 0).L(w, 0).L(w, h - f).L(w - f, h).L(0, h).Z().d();
        const fold = new PathB().M(w - f, h).L(w - 0.8 * f, h - 0.8 * f).L(w, h - f).d();
        return { path, strokePath: fold };
      }
      case "smileyFace": {
        const b = new PathB();
        ellipseSub(b, cx, cy, cx, cy);
        const g = adjRaw(adjust, "adj", 4653);
        const face = new PathB();
        ellipseSub(face, 0.35 * w, 0.37 * h, 0.05 * w, 0.05 * h);
        ellipseSub(face, 0.65 * w, 0.37 * h, 0.05 * w, 0.05 * h);
        face.M(0.3 * w, 0.67 * h).Q(cx, h * Math.min(Math.max(0.67 + 4 * g, 0.4), 0.95), 0.7 * w, 0.67 * h);
        return { path: b.d(), strokePath: face.d() };
      }
      case "noSmoking": {
        const t = ss * frac("adj", 18750);
        const b = new PathB();
        ellipseSub(b, cx, cy, cx, cy);
        const rxI = Math.max(cx - t, 0);
        const ryI = Math.max(cy - t, 0);
        ellipseSub(b, cx, cy, rxI, ryI, true);
        const p1x = cx + rxI * Math.cos(225 * D2R);
        const p1y = cy + ryI * Math.sin(225 * D2R);
        const p2x = cx + rxI * Math.cos(45 * D2R);
        const p2y = cy + ryI * Math.sin(45 * D2R);
        const len = Math.hypot(p2x - p1x, p2y - p1y) || 1;
        const nx = -(p2y - p1y) / len * (t / 2);
        const ny = (p2x - p1x) / len * (t / 2);
        b.M(p1x + nx, p1y + ny).L(p2x + nx, p2y + ny).L(p2x - nx, p2y - ny).L(p1x - nx, p1y - ny).Z();
        return { path: b.d() };
      }
      case "ribbon": {
        const b = new PathB();
        b.M(0, 0.25 * h).L(0.25 * w, 0.25 * h).L(0.25 * w, h).L(0, h).L(0.0833 * w, 0.625 * h).Z();
        b.M(w, 0.25 * h).L(0.75 * w, 0.25 * h).L(0.75 * w, h).L(w, h).L(0.9167 * w, 0.625 * h).Z();
        b.M(0.125 * w, 0).L(0.875 * w, 0).L(0.875 * w, 0.75 * h).L(0.125 * w, 0.75 * h).Z();
        return { path: b.d() };
      }
      case "ribbon2": {
        const b = new PathB();
        b.M(0, 0.75 * h).L(0.25 * w, 0.75 * h).L(0.25 * w, 0).L(0, 0).L(0.0833 * w, 0.375 * h).Z();
        b.M(w, 0.75 * h).L(0.75 * w, 0.75 * h).L(0.75 * w, 0).L(w, 0).L(0.9167 * w, 0.375 * h).Z();
        b.M(0.125 * w, h).L(0.875 * w, h).L(0.875 * w, 0.25 * h).L(0.125 * w, 0.25 * h).Z();
        return { path: b.d() };
      }
      case "wave": {
        const a = h * Math.min(frac("adj1", 12500), 0.25);
        const b = new PathB().M(0, a);
        b.C(w / 6, 0, w / 3, 0, w / 2, a).C(2 * w / 3, 2 * a, 5 * w / 6, 2 * a, w, a);
        b.L(w, h - a);
        b.C(5 * w / 6, h, 2 * w / 3, h, w / 2, h - a).C(w / 3, h - 2 * a, w / 6, h - 2 * a, 0, h - a);
        return { path: b.Z().d() };
      }
      case "doubleWave": {
        const a = h * Math.min(frac("adj1", 6250), 0.2);
        const b = new PathB().M(0, a);
        b.C(w / 12, 0, w / 6, 0, w / 4, a).C(w / 3, 2 * a, 5 * w / 12, 2 * a, w / 2, a);
        b.C(7 * w / 12, 0, 2 * w / 3, 0, 3 * w / 4, a).C(5 * w / 6, 2 * a, 11 * w / 12, 2 * a, w, a);
        b.L(w, h - a);
        b.C(11 * w / 12, h, 5 * w / 6, h, 3 * w / 4, h - a).C(2 * w / 3, h - 2 * a, 7 * w / 12, h - 2 * a, w / 2, h - a);
        b.C(5 * w / 12, h, w / 3, h, w / 4, h - a).C(w / 6, h - 2 * a, w / 12, h - 2 * a, 0, h - a);
        return { path: b.Z().d() };
      }
      case "uturnArrow": {
        const t = ss * frac("adj1", 25e3);
        const hw = 0.75 * t;
        const hl = t;
        const xrc = w - hw;
        const rxO = (xrc + t / 2) / 2;
        const ryO = Math.min(h / 2, rxO);
        const b = new PathB().M(0, h).L(0, ryO);
        b.arc(rxO, ryO, rxO, ryO, 180, 180);
        const yh = h - hl;
        b.L(xrc + t / 2, yh).L(xrc + hw, yh).L(xrc, h).L(xrc - hw, yh).L(xrc - t / 2, yh).L(xrc - t / 2, ryO);
        b.arc(rxO, ryO, Math.max(rxO - t, 0), Math.max(ryO - t, ryO * 0.2), 0, -180);
        b.L(t, h).Z();
        return { path: b.d() };
      }
      case "curvedRightArrow": {
        const t = ss * frac("adj1", 25e3);
        const b = new PathB().M(0, 0);
        b.arc(0, cy, w, cy, 270, 90);
        const bi = Math.max(w - 1.5 * t, 0);
        b.L((w + bi) / 2, Math.min(h, cy + 1.2 * t)).L(bi, cy).L(w - t, cy);
        b.arc(0, cy, Math.max(w - t, 0), Math.max(cy - t, 0), 0, -90);
        b.L(0, 0).Z();
        return { path: b.d() };
      }
      case "stripedRightArrow": {
        const thick = h * frac("adj1", 5e4);
        const head = Math.min(w, ss * frac("adj2", 5e4));
        const y1 = (h - thick) / 2;
        const y2 = (h + thick) / 2;
        const xh = w - head;
        const bs = ss * 5 / 32;
        const b = new PathB();
        b.M(bs, y1).L(xh, y1).L(xh, 0).L(w, cy).L(xh, h).L(xh, y2).L(bs, y2).Z();
        b.M(0, y1).L(ss / 32, y1).L(ss / 32, y2).L(0, y2).Z();
        b.M(ss / 16, y1).L(ss / 8, y1).L(ss / 8, y2).L(ss / 16, y2).Z();
        return { path: b.d() };
      }
      case "wedgeRoundRectCallout": {
        const r = ss * frac("adj3", 16667);
        const tipX = cx + w * adjRaw(adjust, "adj1", -20833);
        const tipY = cy + h * adjRaw(adjust, "adj2", 62500);
        const b = new PathB();
        b.M(r, 0).L(w - r, 0).arc(w - r, r, r, r, 270, 90).L(w, h - r);
        b.arc(w - r, h - r, r, r, 0, 90).L(r, h).arc(r, h - r, r, r, 90, 90).L(0, r);
        b.arc(r, r, r, r, 180, 90).Z();
        appendWedgeTail(b, w, h, tipX, tipY);
        return { path: b.d() };
      }
      case "wedgeEllipseCallout": {
        const tipX = cx + w * adjRaw(adjust, "adj1", -20833);
        const tipY = cy + h * adjRaw(adjust, "adj2", 62500);
        const b = new PathB();
        ellipseSub(b, cx, cy, cx, cy);
        const th = Math.atan2(tipY - cy, tipX - cx);
        b.M(cx + cx * Math.cos(th - 0.3), cy + cy * Math.sin(th - 0.3)).L(tipX, tipY).L(cx + cx * Math.cos(th + 0.3), cy + cy * Math.sin(th + 0.3)).Z();
        return { path: b.d() };
      }
      case "flowChartPredefinedProcess": {
        const path = new PathB().M(0, 0).L(w, 0).L(w, h).L(0, h).Z().d();
        const lines = new PathB().M(w / 8, 0).L(w / 8, h).M(7 * w / 8, 0).L(7 * w / 8, h).d();
        return { path, strokePath: lines };
      }
      case "flowChartInternalStorage": {
        const path = new PathB().M(0, 0).L(w, 0).L(w, h).L(0, h).Z().d();
        const lines = new PathB().M(w / 8, 0).L(w / 8, h).M(0, h / 8).L(w, h / 8).d();
        return { path, strokePath: lines };
      }
      case "flowChartDocument": {
        const b = new PathB().M(0, 0).L(w, 0).L(w, 0.83 * h);
        b.C(0.75 * w, 0.72 * h, 0.58 * w, 0.72 * h, 0.5 * w, 0.83 * h);
        b.C(0.42 * w, 0.94 * h, 0.25 * w, 0.94 * h, 0, 0.83 * h);
        return { path: b.Z().d() };
      }
      case "flowChartMultidocument": {
        const b = new PathB().M(0, 0.12 * h).L(0.88 * w, 0.12 * h).L(0.88 * w, 0.85 * h);
        b.C(0.66 * w, 0.74 * h, 0.51 * w, 0.74 * h, 0.44 * w, 0.85 * h);
        b.C(0.37 * w, 0.96 * h, 0.22 * w, 0.96 * h, 0, 0.85 * h);
        b.Z();
        const backs = new PathB().M(0.06 * w, 0.12 * h).L(0.06 * w, 0.06 * h).L(0.94 * w, 0.06 * h).L(0.94 * w, 0.6 * h).M(0.12 * w, 0.06 * h).L(0.12 * w, 0).L(w, 0).L(w, 0.53 * h);
        return { path: b.d(), strokePath: backs.d() };
      }
      case "flowChartConnector": {
        const b = new PathB();
        ellipseSub(b, cx, cy, cx, cy);
        return { path: b.d() };
      }
      case "flowChartOr": {
        const b = new PathB();
        ellipseSub(b, cx, cy, cx, cy);
        const lines = new PathB().M(cx, 0).L(cx, h).M(0, cy).L(w, cy).d();
        return { path: b.d(), strokePath: lines };
      }
      case "flowChartSummingJunction": {
        const b = new PathB();
        ellipseSub(b, cx, cy, cx, cy);
        const dx = cx * Math.SQRT1_2;
        const dy = cy * Math.SQRT1_2;
        const lines = new PathB().M(cx - dx, cy - dy).L(cx + dx, cy + dy).M(cx + dx, cy - dy).L(cx - dx, cy + dy).d();
        return { path: b.d(), strokePath: lines };
      }
      case "flowChartSort": {
        const path = new PathB().M(cx, 0).L(w, cy).L(cx, h).L(0, cy).Z().d();
        return { path, strokePath: new PathB().M(0, cy).L(w, cy).d() };
      }
      case "flowChartDelay": {
        const b = new PathB().M(0, 0).L(cx, 0);
        b.arc(cx, cy, cx, cy, 270, 180).L(0, h).Z();
        return { path: b.d() };
      }
      case "flowChartDisplay": {
        const b = new PathB().M(0, cy).L(w / 6, 0).L(5 * w / 6, 0);
        b.arc(5 * w / 6, cy, w / 6, cy, 270, 180).L(w / 6, h).Z();
        return { path: b.d() };
      }
      case "flowChartPunchedTape": {
        const a = 0.1 * h;
        const b = new PathB().M(0, a);
        b.C(w / 6, 0, w / 3, 0, w / 2, a).C(2 * w / 3, 2 * a, 5 * w / 6, 2 * a, w, a);
        b.L(w, h - a);
        b.C(5 * w / 6, h - 2 * a, 2 * w / 3, h - 2 * a, w / 2, h - a);
        b.C(w / 3, h, w / 6, h, 0, h - a);
        return { path: b.Z().d() };
      }
      case "leftBracket": {
        const r = Math.min(h / 2, ss * frac("adj", 8333));
        const b = new PathB().arc(w, r, w, r, 270, -90, "M").L(0, h - r).arc(w, h - r, w, r, 180, -90);
        return { strokePath: b.d() };
      }
      case "rightBracket": {
        const r = Math.min(h / 2, ss * frac("adj", 8333));
        const b = new PathB().arc(0, r, w, r, 270, 90, "M").L(w, h - r).arc(0, h - r, w, r, 0, 90);
        return { strokePath: b.d() };
      }
      case "leftBrace": {
        const r = Math.min(h / 4, ss * frac("adj1", 8333));
        const mid = h * frac("adj2", 5e4);
        const xm = w / 2;
        const b = new PathB().arc(w, r, xm, r, 270, -90, "M").L(xm, mid - r);
        b.arc(0, mid - r, xm, r, 0, 90).arc(0, mid + r, xm, r, 270, 90).L(xm, h - r);
        b.arc(w, h - r, xm, r, 180, -90);
        return { strokePath: b.d() };
      }
      case "rightBrace": {
        const r = Math.min(h / 4, ss * frac("adj1", 8333));
        const mid = h * frac("adj2", 5e4);
        const xm = w / 2;
        const b = new PathB().arc(0, r, xm, r, 270, 90, "M").L(xm, mid - r);
        b.arc(w, mid - r, xm, r, 180, -90).arc(w, mid + r, xm, r, 270, -90).L(xm, h - r);
        b.arc(0, h - r, xm, r, 0, 90);
        return { strokePath: b.d() };
      }
      default:
        return null;
    }
  }
  function appendWedgeTail(b, w, h, tipX, tipY) {
    const g = Math.min(w, h) * 0.1;
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const nx = (tipX - w / 2) / w;
    const ny = (tipY - h / 2) / h;
    if (Math.abs(ny) >= Math.abs(nx)) {
      const bx = clamp(tipX, 2 * g, w - 2 * g);
      const ey = ny >= 0 ? h : 0;
      b.M(bx - g, ey).L(tipX, tipY).L(bx + g, ey).Z();
    } else {
      const by = clamp(tipY, 2 * g, h - 2 * g);
      const ex = nx >= 0 ? w : 0;
      b.M(ex, by - g).L(tipX, tipY).L(ex, by + g).Z();
    }
  }

  // ../engine/pptx-render/build-slide.ts
  function withSlideNum(el, num) {
    if (el.type === "group") {
      const g = el;
      const children = g.children.map((c) => withSlideNum(c, num));
      return children.some((c, i) => c !== g.children[i]) ? { ...g, children } : el;
    }
    const text = el.text;
    const hit = text?.paragraphs.some(
      (p) => p.runs.some((r) => r.field === "slidenum" && r.text !== String(num))
    );
    if (!hit) return el;
    return {
      ...el,
      text: {
        ...text,
        paragraphs: text.paragraphs.map((p) => ({
          ...p,
          runs: p.runs.map((r) => r.field === "slidenum" ? { ...r, text: String(num) } : r)
        }))
      }
    };
  }
  var CHIP_LABEL = {
    chart: "Chart",
    table: "Table",
    smartart: "SmartArt",
    ole: "Embedded object",
    connector: "Connector",
    media: "Media",
    unknown: "Unsupported element"
  };
  function buildRenderSlide(slide, size, opts) {
    const vp = makeViewport(size, opts.fitWidthPx);
    const metrics = opts.metrics ?? new HeuristicMetrics();
    const sub = opts.slideNo != null ? (el) => withSlideNum(el, opts.slideNo) : (el) => el;
    const nodes = [];
    for (const el of slide.decorations ?? []) {
      const node = buildNode(sub(el), vp, metrics, opts.media, { x: 0, y: 0 });
      if (node && node.type !== "placeholder-chip") {
        node.decoration = true;
        nodes.push(node);
      }
    }
    let bgLeading = 0;
    while (bgLeading < slide.elements.length && isBackgroundLikeElement(slide.elements[bgLeading], size)) {
      bgLeading += 1;
    }
    for (const [i, el] of slide.elements.entries()) {
      const node = buildNode(sub(el), vp, metrics, opts.media, { x: 0, y: 0 });
      if (node) {
        if (i < bgLeading) node.background = true;
        nodes.push(node);
      }
    }
    const sldOpen = /<p:sld\b[^>]*>/.exec(slide.bodyPrefix)?.[0];
    const hidden = !!sldOpen && /\sshow="0"/.test(sldOpen);
    return {
      widthPx: vp.widthPx,
      heightPx: vp.heightPx,
      scale: vp.scale,
      background: resolveFill(slide.background, vp, opts.media),
      nodes,
      ...hidden ? { hidden: true } : {}
    };
  }
  function buildNode(el, vp, metrics, media, parentOffset) {
    const box = placeTransform(el.transform, vp, parentOffset);
    switch (el.type) {
      case "text":
      case "shape":
        return buildShape(el, box, vp, metrics, media);
      case "picture":
        return buildPicture(el, box, vp, media);
      case "group":
        return buildGroup(el, box, vp, metrics, media);
      case "table":
        return buildTable(el, box, vp, metrics, media);
      case "chart": {
        const chartEl = el;
        const appCreated = chartEl.descr === "aislides-chart";
        const node = buildChartNode(`r_${el.id}`, el.id, chartEl.chart, box, vp, metrics) ?? chipNode(el.id, box, "chart", CHIP_LABEL["chart"]);
        if (appCreated && node.type === "chart") {
          ;
          node.appCreated = true;
        }
        if (node.type === "chart") {
          ;
          node.styleInfo = chartStyleInfo(chartEl.chart);
        }
        return node;
      }
      case "passthrough": {
        const pt = el;
        if (pt.previewShapes?.length) {
          const pseudo = {
            id: pt.id,
            type: "group",
            anchor: pt.anchor,
            transform: pt.transform,
            children: pt.previewShapes,
            childOffset: { x: 0, y: 0, cx: pt.transform.offset.cx, cy: pt.transform.offset.cy }
          };
          return buildGroup(pseudo, box, vp, metrics, media);
        }
        if (pt.previewPicture) {
          return buildPicture({ ...pt.previewPicture, id: pt.id }, box, vp, media);
        }
        return buildChip(pt, box);
      }
      default:
        return null;
    }
  }
  function resolveArrowEnd(end, strokeWidthEmu, scale) {
    const lw = Math.max(emuToPx(strokeWidthEmu, scale), 1);
    const sizeMultW = end.w === "sm" ? 2 : end.w === "lg" ? 5 : 3;
    const sizeMultL = end.len === "sm" ? 2 : end.len === "lg" ? 5 : 3;
    return {
      type: end.type,
      widthPx: Math.max(lw * sizeMultW, 4),
      lengthPx: Math.max(lw * sizeMultL, 4)
    };
  }
  function scaleUnitPath(d, w, h) {
    let i = 0;
    return d.split(" ").map((tok) => {
      const n = Number(tok);
      if (!Number.isFinite(n)) return tok;
      return String(Math.round(n * (i++ % 2 === 0 ? w : h) * 100) / 100);
    }).join(" ");
  }
  function buildShape(el, box, vp, metrics, media) {
    const node = {
      id: `r_${el.id}`,
      type: el.type,
      box,
      sourceId: el.id,
      fill: resolveFill(el.fill, vp, media),
      ...el.placeholder ? { placeholder: el.placeholder } : {},
      ...el.presetGeometry ? { presetGeometry: el.presetGeometry } : {}
    };
    if (el.customGeometry) {
      const g = el.customGeometry;
      if (g.path) node.pathData = scaleUnitPath(g.path, box.w, box.h);
      if (g.fillPath) node.fillPathData = scaleUnitPath(g.fillPath, box.w, box.h);
      if (g.strokePath) node.strokePathData = scaleUnitPath(g.strokePath, box.w, box.h);
    } else if (el.presetGeometry === "roundRect") {
      const adj = el.adjust?.adj ?? 16667;
      node.cornerRadiusPx = Math.min(box.w, box.h) * Math.min(Math.max(adj, 0), 5e4) / 1e5;
    } else if (isPillPreset(el.presetGeometry)) {
      node.cornerRadiusPx = Math.min(box.w, box.h) / 2;
    } else if (isConnectorPreset(el.presetGeometry)) {
      const pts = connectorPoints(el.presetGeometry, box.w, box.h, box.flipH, box.flipV, el.adjust);
      const isCurved = /^curvedConnector/.test(el.presetGeometry ?? "");
      const bezier = isCurved ? connectorBezier(pts) : void 0;
      const strokeWidth = el.stroke?.width ?? 12700;
      node.line = {
        points: pts,
        ...bezier?.length ? { bezier } : {},
        ...el.stroke?.headEnd ? { headEnd: resolveArrowEnd(el.stroke.headEnd, strokeWidth, vp.scale) } : {},
        ...el.stroke?.tailEnd ? { tailEnd: resolveArrowEnd(el.stroke.tailEnd, strokeWidth, vp.scale) } : {}
      };
      node.box = { ...box, flipH: false, flipV: false };
    } else if (el.presetGeometry && el.presetGeometry !== "rect") {
      const poly = presetPolygon(el.presetGeometry, box.w, box.h, el.adjust);
      if (poly) node.polygonPoints = poly;
      else {
        const p = presetPath(el.presetGeometry, box.w, box.h, el.adjust);
        if (p) {
          if (p.path) node.pathData = p.path;
          if (p.fillPath) node.fillPathData = p.fillPath;
          if (p.strokePath) node.strokePathData = p.strokePath;
        }
      }
    }
    const stroke = resolveStroke(el.stroke, vp);
    if (stroke) node.stroke = stroke;
    const shadow = resolveShadow(el.shadow, vp);
    if (shadow) node.shadow = shadow;
    const glow = resolveGlow(el.glow, vp);
    if (glow) node.glow = glow;
    if (el.text && el.text.paragraphs.length) {
      node.text = layoutText({
        body: el.text,
        boxWidthPx: box.w,
        boxHeightPx: box.h,
        metrics,
        vp
      });
    }
    return node;
  }
  function pictureClip(preset, box, adjust) {
    if (!preset || preset === "rect") return void 0;
    if (preset === "roundRect") {
      const adj = adjust?.adj ?? 16667;
      return { cornerRadiusPx: Math.min(box.w, box.h) * Math.min(Math.max(adj, 0), 5e4) / 1e5 };
    }
    if (isPillPreset(preset)) return { cornerRadiusPx: Math.min(box.w, box.h) / 2 };
    if (preset === "ellipse") {
      const rx = box.w / 2;
      const ry = box.h / 2;
      return {
        pathData: `M 0 ${ry} A ${rx} ${ry} 0 1 0 ${box.w} ${ry} A ${rx} ${ry} 0 1 0 0 ${ry} Z`
      };
    }
    const poly = presetPolygon(preset, box.w, box.h, adjust);
    if (poly) return { polygonPoints: poly };
    const p = presetPath(preset, box.w, box.h, adjust);
    if (p?.path) return { pathData: p.path };
    return void 0;
  }
  function buildPicture(el, box, vp, media) {
    const dataUrl = el.dataUrl ?? (el.mediaRef ? media?.(el.mediaRef) : void 0);
    const clip = pictureClip(el.presetGeometry, box, el.adjust);
    const node = {
      id: `r_${el.id}`,
      type: "picture",
      box,
      sourceId: el.id,
      ...dataUrl ? { dataUrl } : {},
      ...clip ? { clip } : {},
      ...el.srcRect ? { srcRect: el.srcRect } : {},
      ...el.opacity != null ? { opacity: el.opacity } : {},
      ...el.softEdge ? { softEdgePx: emuToPx(el.softEdge, vp.scale) } : {},
      ...el.media ? { media: el.media.kind } : {},
      ...el.name ? { name: el.name } : {},
      ...el.descr ? { descr: el.descr } : {}
    };
    const stroke = resolveStroke(el.stroke, vp);
    if (stroke) node.stroke = stroke;
    const shadow = resolveShadow(el.shadow, vp);
    if (shadow) node.shadow = shadow;
    const glow = resolveGlow(el.glow, vp);
    if (glow) node.glow = glow;
    return node;
  }
  function buildGroup(el, box, vp, metrics, media) {
    const ch = el.childOffset;
    const chX = ch?.x ?? el.transform.offset.x;
    const chY = ch?.y ?? el.transform.offset.y;
    const chCx = ch?.cx || el.transform.offset.cx;
    const chCy = ch?.cy || el.transform.offset.cy;
    const chWpx = emuToPx(chCx, vp.scale);
    const chHpx = emuToPx(chCy, vp.scale);
    const childScaleX = chWpx > 0 ? box.w / chWpx : 1;
    const childScaleY = chHpx > 0 ? box.h / chHpx : 1;
    const parentOffset = {
      x: -emuToPx(chX, vp.scale) * childScaleX,
      y: -emuToPx(chY, vp.scale) * childScaleY,
      scaleX: childScaleX,
      scaleY: childScaleY
    };
    const children = [];
    for (const child of el.children ?? []) {
      const c = buildNode(child, vp, metrics, media, parentOffset);
      if (c) children.push(c);
    }
    return {
      id: `r_${el.id}`,
      type: "group",
      box,
      sourceId: el.id,
      children,
      ...Math.abs(childScaleX - 1) > 1e-6 ? { childScaleX } : {},
      ...Math.abs(childScaleY - 1) > 1e-6 ? { childScaleY } : {}
    };
  }
  function buildTable(el, box, vp, metrics, media) {
    const sumW = el.colWidths.reduce((a, b) => a + b, 0) || 1;
    const sumH = el.rowHeights.reduce((a, b) => a + b, 0) || 1;
    const colPx = el.colWidths.map((w) => w / sumW * box.w);
    const rowPx = el.rowHeights.map((h) => h / sumH * box.h);
    const colX = [0];
    for (const w of colPx) colX.push(colX[colX.length - 1] + w);
    el.rows.forEach((row, r) => {
      const gridCols = tableRowGridCols(row);
      row.forEach((cell, tcIdx) => {
        const cIdx = gridCols[tcIdx];
        if (cell.merged || (cell.rowSpan ?? 1) > 1) return;
        if (!cell.text || !cell.text.paragraphs.length) return;
        const x = colX[cIdx] ?? 0;
        const w = (colX[Math.min(cIdx + (cell.gridSpan ?? 1), colX.length - 1)] ?? x) - x;
        const probe = layoutText({
          body: cell.text,
          boxWidthPx: w,
          boxHeightPx: rowPx[r] ?? 0,
          metrics,
          vp
        });
        const needed = probe.contentHeight + probe.insets.t + probe.insets.b;
        if (needed > (rowPx[r] ?? 0)) rowPx[r] = needed;
      });
    });
    const rowY = [0];
    for (const h of rowPx) rowY.push(rowY[rowY.length - 1] + h);
    const totalH = rowY[rowY.length - 1];
    if (totalH > box.h + 0.5) box = { ...box, h: totalH };
    const cells = [];
    el.rows.forEach((row, r) => {
      const gridCols = tableRowGridCols(row);
      row.forEach((cell, tcIdx) => {
        const cIdx = gridCols[tcIdx];
        const gridSpan = cell.gridSpan ?? 1;
        if (cell.merged) return;
        const rowSpan = cell.rowSpan ?? 1;
        const x = colX[cIdx] ?? 0;
        const y = rowY[r] ?? 0;
        const w = (colX[Math.min(cIdx + gridSpan, colX.length - 1)] ?? x) - x;
        const h = (rowY[Math.min(r + rowSpan, rowY.length - 1)] ?? y) - y;
        const out = {
          x,
          y,
          w,
          h,
          row: r,
          col: tcIdx,
          ...gridSpan > 1 ? { gridSpan } : {},
          ...rowSpan > 1 ? { rowSpan } : {},
          fill: resolveFill(cell.fill, vp, media)
        };
        const borders = {};
        for (const k of ["l", "r", "t", "b"]) {
          const s = resolveStroke(cell.borders?.[k], vp);
          if (s) borders[k] = s;
        }
        if (Object.keys(borders).length) out.borders = borders;
        if (cell.text && cell.text.paragraphs.length) {
          out.text = layoutText({
            body: cell.text,
            boxWidthPx: w,
            boxHeightPx: h,
            metrics,
            vp
          });
        }
        cells.push(out);
      });
    });
    return {
      id: `r_${el.id}`,
      type: "table",
      box,
      sourceId: el.id,
      cells,
      gridX: colX,
      gridY: rowY,
      ...el.styleFlags ? { styleFlags: el.styleFlags } : {}
    };
  }
  function chartStyleInfo(m) {
    const kind = m.kind === "bar" ? m.series.some((s) => s.plotKind === "line") ? "comboBarLine" : m.grouping === "stacked" || m.grouping === "percentStacked" ? "barStacked" : "bar" : m.kind === "pie" ? (m.holePct ?? 0) > 0 ? "doughnut" : "pie" : m.kind;
    return {
      kind,
      legendPos: m.legendPos == null ? "none" : m.legendPos === "tr" ? "r" : m.legendPos,
      dataLabels: !!m.dataLabels,
      gridlines: !!m.valAxis?.gridColor,
      ...m.title ? { title: m.title } : {},
      ...m.catAxis?.title ? { catAxisTitle: m.catAxis.title } : {},
      ...m.valAxis?.title ? { valAxisTitle: m.valAxis.title } : {},
      ...m.gapWidthPct != null ? { gapWidthPct: m.gapWidthPct } : {}
    };
  }
  function buildChip(el, box) {
    return chipNode(el.id, box, el.kind, CHIP_LABEL[el.kind] ?? el.kind);
  }
  function chipNode(sourceId, box, kind, label) {
    return {
      id: `r_${sourceId}`,
      type: "placeholder-chip",
      box,
      sourceId,
      kind,
      label
    };
  }

  // browser/stub-shaped-metrics.ts
  async function shapedMetricsReady() {
  }
  var refineComplexWidths = async () => false;

  // browser/edit-text.ts
  function hex63(c) {
    return c?.replace(/^#/, "").slice(0, 6).toUpperCase();
  }
  var FONT_ALIAS = {
    \u5FAE\u8F6F\u96C5\u9ED1: "microsoft yahei",
    \u82F9\u65B9: "pingfang sc",
    \u5B8B\u4F53: "simsun",
    \u9ED1\u4F53: "simhei",
    \u6977\u4F53: "kaiti",
    \u4EFF\u5B8B: "fangsong",
    \u7B49\u7EBF: "dengxian"
  };
  function fontKey(name) {
    if (!name) return void 0;
    return FONT_ALIAS[name] ?? name.toLowerCase();
  }
  function applyEditParagraphs(oldParas, edited) {
    return edited.map((p, pi) => {
      const oldPara = oldParas[p.srcPara ?? pi];
      return {
        ...oldPara,
        // keep unedited paragraph attributes such as bullet/level/line spacing
        runs: p.runs.map((r, ri) => {
          const oldRun = r.srcRun != null ? oldPara?.runs[r.srcRun] : oldPara?.runs[ri] ?? oldPara?.runs[0];
          const merged = {
            ...oldRun,
            text: r.text,
            bold: r.bold ?? oldRun?.bold,
            italic: r.italic ?? oldRun?.italic,
            underline: r.underline ?? oldRun?.underline,
            strike: r.strike ?? oldRun?.strike,
            fontSize: r.fontSize ?? oldRun?.fontSize,
            fontFamily: r.fontFamily ?? oldRun?.fontFamily,
            color: r.color ?? oldRun?.color
          };
          if (r.baseline != null && Math.sign(r.baseline) !== Math.sign(oldRun?.baseline ?? 0)) {
            if (r.baseline === 0) delete merged.baseline;
            else merged.baseline = r.baseline;
          }
          if (merged.strike === false) delete merged.strikeStyle;
          if (r.color != null && hex63(r.color) !== hex63(oldRun?.color)) {
            delete merged.colorFollowsTheme;
            delete merged.colorInherited;
          }
          if (r.fontFamily != null && fontKey(r.fontFamily) !== fontKey(oldRun?.fontFamily)) {
            delete merged.latinFont;
            delete merged.eaFont;
            delete merged.fontImplicit;
          }
          if (merged.underline === false) delete merged.underlineStyle;
          if (r.underline != null && r.underline !== oldRun?.underline) {
            delete merged.underlineImplicit;
          }
          const newLink = r.link ? encodeRunLink(r.link) : void 0;
          if (r.link !== void 0 && newLink !== oldRun?.hyperlink && (newLink || oldRun?.hyperlink)) {
            if (newLink) {
              merged.hyperlink = newLink;
              delete merged.hyperlinkRId;
              delete merged.hyperlinkAction;
              delete merged.hyperlinkTooltip;
            } else {
              delete merged.hyperlink;
              delete merged.hyperlinkRId;
              delete merged.hyperlinkAction;
              delete merged.hyperlinkTooltip;
              if (merged.underlineImplicit) {
                merged.underline = false;
                delete merged.underlineImplicit;
                delete merged.underlineStyle;
              }
            }
          }
          if (r.fontSize != null && r.fontSize !== oldRun?.fontSize) {
            delete merged.fontSizeImplicit;
          }
          return merged;
        }),
        align: p.align ?? oldPara?.align,
        // Indent level: returned by the editor after Tab adjustment; 0 resets to the default
        // (lvl attribute removed). For a paragraph with its own bullet (explicit marL + hanging
        // indent), the left indent steps with the level; inherited indents are re-resolved by
        // materialize
        ...p.level != null && p.level !== (oldPara?.level ?? 0) ? {
          level: p.level || void 0,
          ...oldPara?.pPrExplicit?.marL && oldPara.indent != null && oldPara.indent < 0 ? { marL: -oldPara.indent * (p.level + 1) } : {}
        } : {},
        // Only mark alignment explicit on a real change (the editor always returns the computed
        // display value; untouched paragraphs keep inheriting)
        ...p.align != null && oldPara && p.align !== oldPara.align ? { pPrExplicit: { ...oldPara.pPrExplicit, align: true } } : {}
      };
    });
  }
  function collectParagraphFormatPatches(edited) {
    const out = [];
    edited.forEach((p, i) => {
      const patch = {
        ...p.bullet ? {
          bullet: p.bullet,
          ...p.bullet === "char" && p.bulletChar ? { bulletChar: p.bulletChar } : {}
        } : {},
        ...p.lineSpacingPct != null ? { lineSpacingPct: p.lineSpacingPct } : {},
        ...p.spaceBeforePt != null ? { spaceBeforePt: p.spaceBeforePt } : {},
        ...p.spaceAfterPt != null ? { spaceAfterPt: p.spaceAfterPt } : {}
      };
      if (Object.keys(patch).length) out.push({ index: i, patch });
    });
    return out;
  }
  function levelsChanged(oldParas, edited) {
    return edited.some((p, pi) => {
      if (p.level == null) return false;
      const oldPara = oldParas[p.srcPara ?? pi];
      return p.level !== (oldPara?.level ?? 0);
    });
  }

  // browser/cfb-sniff.ts
  var CFB_MAGIC = Buffer.from([208, 207, 17, 224, 161, 177, 26, 225]);
  var ENCRYPTED_STREAM_UTF16 = Buffer.from("EncryptedPackage", "utf16le");
  function isCfbHeader(head) {
    return head.length >= 8 && head.subarray(0, 8).equals(CFB_MAGIC);
  }
  function cfbKind(bytes) {
    if (!isCfbHeader(bytes)) return null;
    return bytes.includes(ENCRYPTED_STREAM_UTF16) ? "encrypted" : "legacy";
  }

  // browser/mp4-audio-sniff.ts
  var CONTAINER_BOXES = /* @__PURE__ */ new Set(["moov", "trak", "mdia", "minf", "stbl"]);
  var CHROMIUM_UNPLAYABLE_AUDIO = /* @__PURE__ */ new Set([
    "ac-3",
    "ec-3",
    "ac-4",
    "dtsc",
    "dtse",
    "dtsh",
    "dtsl",
    "dtsx",
    "alac",
    "mlpa",
    "samr",
    "sawb"
  ]);
  function fourcc(bytes, off) {
    return String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
  }
  function readU32(bytes, off) {
    return (bytes[off] << 24 | bytes[off + 1] << 16 | bytes[off + 2] << 8 | bytes[off + 3]) >>> 0;
  }
  function walk(bytes, start, end, track, out) {
    let off = start;
    while (off + 8 <= end) {
      let size = readU32(bytes, off);
      const type = fourcc(bytes, off + 4);
      let payload = off + 8;
      if (size === 1) {
        if (off + 16 > end) return;
        if (readU32(bytes, off + 8) !== 0) return;
        size = readU32(bytes, off + 12);
        payload = off + 16;
      } else if (size === 0) {
        size = end - off;
      }
      if (size < 8 || off + size > end) return;
      const boxEnd = off + size;
      if (type === "trak") {
        const t = { formats: [] };
        walk(bytes, payload, boxEnd, t, out);
        if (t.handler === "soun" && t.formats.length) out.push(t.formats);
      } else if (CONTAINER_BOXES.has(type)) {
        walk(bytes, payload, boxEnd, track, out);
      } else if (type === "hdlr" && track) {
        if (payload + 12 <= boxEnd) track.handler = fourcc(bytes, payload + 8);
      } else if (type === "stsd" && track) {
        let p = payload + 8;
        const count = payload + 8 <= boxEnd ? readU32(bytes, payload + 4) : 0;
        for (let i = 0; i < count && p + 8 <= boxEnd; i++) {
          const esize = readU32(bytes, p);
          if (esize < 8 || p + esize > boxEnd) break;
          track.formats.push(fourcc(bytes, p + 4));
          p += esize;
        }
      }
      off = boxEnd;
    }
  }
  function audioSampleFormats(bytes) {
    const out = [];
    walk(bytes, 0, bytes.length, null, out);
    return out.flat();
  }
  function unplayableAudioCodec(bytes) {
    for (const f of audioSampleFormats(bytes)) {
      const norm = f.trim().toLowerCase();
      if (CHROMIUM_UNPLAYABLE_AUDIO.has(norm)) return norm;
    }
    return null;
  }

  // shared/print-html.ts
  function printPageCount(slideCount, layout) {
    const perPage = layout === "handout2" ? 2 : layout === "handout3" ? 3 : layout === "handout6" ? 6 : 1;
    return Math.ceil(slideCount / perPage);
  }
  var A4_W = 8.27;
  var A4_H = 11.69;
  var SLIDE_H = 7.5;
  function buildPrintDocumentHtml(o) {
    const layout = o.layout;
    const isFull = layout === "full";
    const landscape = !isFull && o.orientation === "landscape";
    const slideW = Math.round(o.ratio * SLIDE_H * 1e3) / 1e3;
    const pageW = isFull ? slideW : landscape ? A4_H : A4_W;
    const pageH = isFull ? SLIDE_H : landscape ? A4_W : A4_H;
    const perPage = layout === "handout2" ? 2 : layout === "handout3" ? 3 : layout === "handout6" ? 6 : 1;
    const esc = (x) => x.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
    let body;
    if (isFull) {
      body = o.srcs.map((src) => `<div class="page"><img src="${src}"></div>`).join("");
    } else if (layout === "notes") {
      body = o.srcs.map(
        (src, i) => `<div class="page notes"><img src="${src}"><div class="note">${esc(o.notes?.[i] ?? "").replace(/\n/g, "<br>")}</div></div>`
      ).join("");
    } else {
      const pages = [];
      for (let i = 0; i < o.srcs.length; i += perPage) {
        const cells = o.srcs.slice(i, i + perPage).map(
          (src) => `<div class="cell"><img src="${src}">` + (perPage === 3 ? '<div class="rules"></div>' : "") + "</div>"
        ).join("");
        pages.push(`<div class="page handout h${perPage}">${cells}</div>`);
      }
      body = pages.join("");
    }
    const h6Cols = landscape ? "1fr 1fr 1fr" : "1fr 1fr";
    const frameCss = o.frame && isFull ? ".page > img { border: 1px solid #bbb; }" : "";
    const total = printPageCount(o.srcs.length, layout);
    const previewCss = o.preview ? `
body { counter-reset: pg; background: transparent; padding: 18px 0 6px; }
.page { counter-increment: pg; position: relative; margin: 0 auto 8px; background: #fff; box-shadow: 0 1px 5px rgba(0, 0, 0, 0.35); }
.page::after {
  content: counter(pg) ' / ${total}';
  position: absolute; left: 50%; bottom: 3%; transform: translateX(-50%);
  padding: 3px 12px; border-radius: 999px;
  background: rgba(32, 33, 36, 0.65); color: #fff;
  font-size: 10px; white-space: nowrap;
}
` : "";
    return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: ${pageW}in ${pageH}in; margin: 0; }
html, body { margin: 0; padding: 0; font-family: -apple-system, 'Segoe UI', sans-serif; }
.page { width: ${pageW}in; height: ${pageH}in; overflow: hidden; page-break-after: always; box-sizing: border-box; }
.page:last-of-type { page-break-after: auto; }
.page > img { display: block; width: 100%; height: 100%; }
.page.handout { padding: 0.4in; display: flex; flex-direction: ${landscape && perPage === 2 ? "row" : "column"}; gap: 0.24in; }
.page.handout .cell { display: flex; gap: 0.2in; align-items: center; flex: 1; min-width: 0; min-height: 0; }
.page.handout .cell img { border: 1px solid #bbb; object-fit: contain; max-height: 100%; }
.page.handout.h2 .cell img, .page.handout.h6 .cell img { width: 100%; height: auto; max-height: 100%; }
.page.handout.h3 .cell img { width: 55%; height: auto; }
.page.handout.h3 .rules {
  flex: 1; align-self: stretch;
  background: repeating-linear-gradient(#fff 0 0.28in, #ccc 0.28in calc(0.28in + 1px));
}
.page.handout.h6 { display: grid; grid-template-columns: ${h6Cols}; grid-auto-rows: 1fr; }
.page.notes { padding: 0.5in; display: flex; flex-direction: column; }
.page.notes img { width: ${landscape ? "auto" : "100%"}; ${landscape ? "max-height: 55%; align-self: center;" : "height: auto;"} border: 1px solid #bbb; }
.page.notes .note { margin-top: 0.3in; font-size: 11pt; line-height: 1.5; white-space: pre-wrap; }
${frameCss}
${previewCss}
</style></head><body>${body}</body></html>`;
  }

  // browser/stub-i18n-main.ts
  function tm(key) {
    return key;
  }

  // browser/stub-tiff.ts
  function tiffToPng(_bytes) {
    return null;
  }

  // browser/session-state.ts
  init_stub_node();

  // browser/stub-fonts.ts
  var createSystemFontMetrics = async () => null;

  // browser/session-state.ts
  var runtime = {
    preloadPath: join(__dirname, "../preload/index.js"),
    rendererDevUrl: process.env.ELECTRON_RENDERER_URL,
    rendererFilePath: join(__dirname, "../renderer/index.html")
  };
  var sessions = /* @__PURE__ */ new Map();
  var MAX_HISTORY = 50;
  function trimHistory(stack) {
    while (stack.length > MAX_HISTORY) stack.shift();
  }
  function takeSnapshot(session2) {
    return {
      slides: structuredClone(session2.opened.deck.slides),
      entries: new Map(session2.opened.archive.entries),
      size: { ...session2.opened.deck.size }
    };
  }
  function cloneSnapshot(snap) {
    return {
      slides: structuredClone(snap.slides),
      entries: new Map(snap.entries),
      size: { ...snap.size }
    };
  }
  function scheduleHistoryNotify(session2) {
    if (session2.historyNotifyScheduled) return;
    session2.historyNotifyScheduled = true;
    setImmediate(() => {
      session2.historyNotifyScheduled = false;
      for (const [id, s] of sessions) {
        if (s !== session2) continue;
        webContents.fromId(id)?.send("slides:history-changed", {
          canUndo: session2.undoStack.length > 0,
          canRedo: session2.redoStack.length > 0
        });
        return;
      }
    });
  }
  function pushHistory(session2) {
    session2.undoStack.push(takeSnapshot(session2));
    trimHistory(session2.undoStack);
    session2.redoStack = [];
    session2.htmlPages = null;
    scheduleHistoryNotify(session2);
  }
  function beginHistoryBatch(session2) {
    if (session2.historyBatch) {
      session2.historyBatch.depth += 1;
      return;
    }
    session2.historyBatch = {
      depth: 1,
      undoStart: session2.undoStack.length,
      before: takeSnapshot(session2)
    };
  }
  function endHistoryBatch(session2) {
    const batch = session2.historyBatch;
    if (!batch) return null;
    batch.depth -= 1;
    if (batch.depth > 0) return null;
    session2.historyBatch = void 0;
    if (session2.undoStack.length <= batch.undoStart) return null;
    session2.undoStack.splice(batch.undoStart);
    session2.undoStack.push(batch.before);
    trimHistory(session2.undoStack);
    scheduleHistoryNotify(session2);
    return batch.before;
  }
  function carryHistoryForReplacement(previous, replacement) {
    if (!previous) return;
    pushHistory(previous);
    replacement.undoStack = previous.undoStack;
    replacement.redoStack = previous.redoStack;
    replacement.historyBatch = previous.historyBatch;
    replacement.aiSnapshots = previous.aiSnapshots;
    scheduleHistoryNotify(replacement);
  }
  var MAX_AI_SNAPSHOTS = 20;
  var nextAiSnapshotId = 1;
  function registerAiSnapshot(session2, snap) {
    const map = session2.aiSnapshots ??= /* @__PURE__ */ new Map();
    const id = nextAiSnapshotId++;
    map.set(id, cloneSnapshot(snap));
    while (map.size > MAX_AI_SNAPSHOTS) map.delete(map.keys().next().value);
    return id;
  }
  function restoreAiSnapshot(session2, id) {
    const snap = session2.aiSnapshots?.get(id);
    if (!snap) return false;
    pushHistory(session2);
    restoreSnapshot(session2, snap);
    session2.aiSnapshots?.delete(id);
    return true;
  }
  function restoreSnapshot(session2, snap) {
    const fresh = cloneSnapshot(snap);
    session2.opened.deck.slides = fresh.slides;
    session2.opened.deck.size = fresh.size;
    const entries = session2.opened.archive.entries;
    entries.clear();
    for (const [k, v] of fresh.entries) entries.set(k, v);
  }
  function settleStaleHistoryBatch(session2) {
    while (session2.historyBatch) {
      const collapsed = endHistoryBatch(session2);
      if (collapsed) registerAiSnapshot(session2, collapsed);
    }
  }
  var windowRefs = {
    /** Parent window for dialogs in tab mode (the shell's single BrowserWindow) */
    shellWindow: null,
    /** Currently active slides renderer (window or tab view) — target of menu commands; the shell updates it on tab switch */
    activeWebContents: null
  };
  var showChrome = {
    setBleed: null
  };
  function dialogParent() {
    return windowRefs.shellWindow ?? BrowserWindow.getFocusedWindow() ?? void 0;
  }
  var fontMetrics = null;
  function getFontMetrics() {
    if (!fontMetrics) fontMetrics = createSystemFontMetrics();
    return fontMetrics;
  }
  function buildAllRenderSlides(opened, fitWidthPx) {
    return opened.deck.slides.map(
      (s, i) => buildRenderSlide(s, opened.deck.size, {
        fitWidthPx,
        media: makeMediaResolver(opened),
        metrics: getFontMetrics(),
        slideNo: i + 1
      })
    );
  }
  var DISPLAY_MIME = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    bmp: "image/bmp",
    webp: "image/webp",
    svg: "image/svg+xml"
  };
  function makeMediaResolver(opened) {
    const cache = /* @__PURE__ */ new Map();
    return (mediaRef) => {
      if (cache.has(mediaRef)) return cache.get(mediaRef);
      const bytes = opened.archive.readBytes(mediaRef);
      let url;
      if (bytes) {
        const ext = mediaRef.split(".").pop()?.toLowerCase() ?? "png";
        if (ext === "tif" || ext === "tiff") {
          const decoded = tiffToPng(bytes);
          if (decoded) url = `data:image/png;base64,${Buffer.from(decoded.png).toString("base64")}`;
        } else {
          const mime = DISPLAY_MIME[ext] ?? "image/png";
          url = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
        }
      }
      cache.set(mediaRef, url);
      return url;
    };
  }
  function rebuildSlide(session2, slideIndex) {
    const slide = session2.opened.deck.slides[slideIndex];
    if (!slide) return null;
    return buildRenderSlide(slide, session2.opened.deck.size, {
      fitWidthPx: session2.fitWidthPx,
      media: makeMediaResolver(session2.opened),
      metrics: getFontMetrics(),
      slideNo: slideIndex + 1
    });
  }
  function rebuildSlideWithReparse(session2, slideIndex) {
    const fresh = materializeSlide(session2.opened, slideIndex);
    if (!fresh) return null;
    return buildRenderSlide(fresh, session2.opened.deck.size, {
      fitWidthPx: session2.fitWidthPx,
      media: makeMediaResolver(session2.opened),
      metrics: getFontMetrics(),
      slideNo: slideIndex + 1
    });
  }

  // browser/stub-register.ts
  var registerSlidesOnlyAiIpc = () => {
  };
  var registerPresenterIpc = () => {
  };
  var registerAttachmentIpc = () => {
  };

  // browser/slides-main-browser.ts
  var slideClipboard = null;
  var lastSlidePaste = /* @__PURE__ */ new Map();
  var CLOUD_PAGE_PREFIX = "cloudpptx:";
  var issuedCloudPages = /* @__PURE__ */ new Set();
  var pendingOpenPath = null;
  var pendingBytes = null;
  function setPendingBytes(bytes) {
    pendingBytes = bytes;
  }
  var saveBytesHook = null;
  function setSaveBytesHook(fn) {
    saveBytesHook = fn;
  }
  async function saveBytesToDisk(opened, path) {
    const bytes = await savePptx(opened);
    if (saveBytesHook) {
      const r = await saveBytesHook(bytes, path);
      if (!r.ok) throw new Error(r.error || "\u4FDD\u5B58\u5931\u8D25");
    } else {
      throw new Error("\u672A\u6CE8\u518C\u4FDD\u5B58\u56DE\u8C03");
    }
  }
  async function openBytes(wc, bytes, path, fitWidthPx) {
    await shapedMetricsReady();
    const opened = await openPptx(bytes);
    sessions.set(wc.id, {
      path,
      opened,
      fitWidthPx,
      undoStack: [],
      redoStack: []
    });
    scheduleHistoryNotify(sessions.get(wc.id));
    const slides = buildAllRenderSlides(opened, fitWidthPx);
    return {
      path,
      slides,
      size: { cx: opened.deck.size.cx, cy: opened.deck.size.cy },
      defaultFont: deckDefaultFont(opened)
    };
  }
  var pendingByWc = /* @__PURE__ */ new Map();
  var clipboards = /* @__PURE__ */ new Map();
  var slidesOpenedHook = null;
  var RECENT_PATH = () => join(app.getPath("userData"), "slides-recent.json");
  function commentAuthorName() {
    try {
      return userInfo().username || "User";
    } catch {
      return "User";
    }
  }
  async function readRecent() {
    try {
      const raw = await readFile(RECENT_PATH(), "utf8");
      return JSON.parse(raw).filter((p) => existsSync(p));
    } catch {
      return [];
    }
  }
  async function pushRecent(path) {
    const cur = await readRecent();
    const next = [path, ...cur.filter((p) => p !== path)].slice(0, 10);
    try {
      await writeFile(RECENT_PATH(), JSON.stringify(next), "utf8");
    } catch {
    }
  }
  var autosaveDir = () => join(app.getPath("userData"), "slides-autosave");
  var autosavePathFor = (filePath) => join(autosaveDir(), `${createHash("sha1").update(filePath).digest("hex").slice(0, 16)}.pptx`);
  function sessionDirty(session2) {
    return !!session2.metaDirty || session2.opened.deck.slides.some(
      (s) => s.structureDirty || s.elements.some((el) => el.dirty || el.dirtyTransform)
    );
  }
  var autosaveBackoff = /* @__PURE__ */ new Map();
  var AUTOSAVE_BACKOFF_TICKS = 10;
  var autosaveRunning = false;
  var untitledRecovery = /* @__PURE__ */ new Map();
  function dropUntitledRecovery(wcId) {
    const draft = untitledRecovery.get(wcId);
    if (draft) void rm(draft, { force: true }).catch(() => {
    });
    untitledRecovery.delete(wcId);
  }
  setInterval(() => {
    if (autosaveRunning) return;
    autosaveRunning = true;
    void (async () => {
      for (const [wcId, session2] of sessions.entries()) {
        if (session2.masterEdit || !sessionDirty(session2)) continue;
        let target;
        if (session2.path) {
          target = autosavePathFor(session2.path);
        } else {
          let draft = untitledRecovery.get(wcId);
          if (!draft) {
            draft = join(getDraftsDir(), newDraftFilename());
            untitledRecovery.set(wcId, draft);
          }
          target = draft;
        }
        const backoffKey = session2.path ?? target;
        const skip = autosaveBackoff.get(backoffKey) ?? 0;
        if (skip > 0) {
          autosaveBackoff.set(backoffKey, skip - 1);
          continue;
        }
        try {
          await mkdir(dirname(target), { recursive: true });
          await savePptxToFile(session2.opened, target);
          autosaveBackoff.delete(backoffKey);
        } catch (error) {
          autosaveBackoff.set(backoffKey, AUTOSAVE_BACKOFF_TICKS);
          console.warn("[slides] autosave failed, retrying in ~5 min:", error);
        }
      }
    })().finally(() => {
      autosaveRunning = false;
    });
  }, 3e4);
  var closeSaveWaiters = /* @__PURE__ */ new Map();
  var autoSavePrefByWc = /* @__PURE__ */ new Map();
  ipcMain.on("slides:autosave-pref", (event, on) => {
    autoSavePrefByWc.set(event.sender.id, on === true);
  });
  ipcMain.on("slides:close-save-result", (event, ok) => {
    const waiter = closeSaveWaiters.get(event.sender.id);
    if (!waiter) return;
    closeSaveWaiters.delete(event.sender.id);
    waiter(ok === true);
  });
  async function maybeRecoverBytes(path, original) {
    const asPath = autosavePathFor(path);
    try {
      const [asStat, origStat] = await Promise.all([stat(asPath), stat(path)]);
      if (asStat.mtimeMs <= origStat.mtimeMs) {
        await rm(asPath, { force: true });
        return { bytes: original, recovered: false };
      }
    } catch {
      return { bytes: original, recovered: false };
    }
    const parent = dialogParent();
    const options = {
      type: "question",
      buttons: [tm("autosaveRestore"), tm("autosaveDiscard")],
      defaultId: 0,
      cancelId: 1,
      message: tm("autosaveFoundTitle"),
      detail: tm("autosaveFoundBody")
    };
    const r = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
    if (r.response === 0) {
      const bytes = await readFile(asPath);
      return { bytes: new Uint8Array(bytes), recovered: true };
    }
    await rm(asPath, { force: true });
    return { bytes: original, recovered: false };
  }
  async function rejectLegacyPpt(path) {
    let head;
    try {
      const fh = await open(path, "r");
      try {
        head = Buffer.alloc(8);
        await fh.read(head, 0, 8, 0);
      } finally {
        await fh.close();
      }
    } catch {
      return false;
    }
    if (!isCfbHeader(head)) return false;
    let kind = "legacy";
    try {
      kind = cfbKind(await readFile(path)) ?? "legacy";
    } catch {
    }
    const parent = dialogParent();
    const options = {
      type: "warning",
      buttons: [tm("legacyPptOk")],
      message: tm(kind === "encrypted" ? "encryptedPptxTitle" : "legacyPptTitle"),
      detail: tm(kind === "encrypted" ? "encryptedPptxBody" : "legacyPptBody")
    };
    if (parent) await dialog.showMessageBox(parent, options);
    else await dialog.showMessageBox(options);
    return true;
  }
  async function openAndBuild(wc, path, fitWidthPx) {
    const raw = await readFile(path);
    const { bytes, recovered } = await maybeRecoverBytes(path, new Uint8Array(raw));
    await shapedMetricsReady();
    const opened = await openPptx(bytes);
    sessions.set(wc.id, {
      path,
      opened,
      fitWidthPx,
      undoStack: [],
      redoStack: [],
      ...recovered ? { metaDirty: true } : {}
    });
    scheduleHistoryNotify(sessions.get(wc.id));
    await pushRecent(path);
    slidesOpenedHook?.(wc, path);
    let slides = buildAllRenderSlides(opened, fitWidthPx);
    if (await refineComplexWidths(wc)) slides = buildAllRenderSlides(opened, fitWidthPx);
    return {
      path,
      slides,
      size: { cx: opened.deck.size.cx, cy: opened.deck.size.cy },
      defaultFont: deckDefaultFont(opened)
    };
  }
  function getDraftsDir() {
    return configuredDefaultSaveDir(app);
  }
  function newDraftFilename() {
    const d = /* @__PURE__ */ new Date();
    const pad = (n, w = 2) => String(n).padStart(w, "0");
    const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    return `${tm("untitledDraft")}-${date}-${time}.pptx`;
  }
  function sanitizeDraftBaseName(raw) {
    if (!raw) return null;
    const cleaned = raw.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+|\.+$/g, "").trim();
    if (!cleaned) return null;
    return cleaned.length > 40 ? cleaned.slice(0, 40).trim() : cleaned;
  }
  function pickDraftPath(draftsDir, deckName) {
    const base = sanitizeDraftBaseName(deckName);
    if (base) {
      let candidate = join(draftsDir, `${base}.pptx`);
      for (let i = 2; existsSync(candidate) && i < 100; i++) {
        candidate = join(draftsDir, `${base}-${i}.pptx`);
      }
      if (!existsSync(candidate)) return candidate;
    }
    return join(draftsDir, newDraftFilename());
  }
  async function saveDraftAfterGenerate(wc, session2, bytes, mode, deckName) {
    try {
      const draftsDir = getDraftsDir();
      if (!existsSync(draftsDir)) mkdirSync(draftsDir, { recursive: true });
      let draftPath;
      if (mode === "append" && session2.path && session2.path.startsWith(draftsDir)) {
        draftPath = session2.path;
      } else {
        draftPath = pickDraftPath(draftsDir, deckName);
      }
      await writeFile(draftPath, Buffer.from(bytes));
      session2.path = draftPath;
      await pushRecent(draftPath);
      slidesOpenedHook?.(wc, draftPath);
    } catch (err) {
      console.warn(
        "[slides] Failed to persist AI-generated draft to disk; the in-memory session still works:",
        err
      );
    }
  }
  function deckDefaultFont(opened) {
    try {
      const slidePath = opened.archive.readPresentation().slidePaths[0];
      if (!slidePath) return void 0;
      const themePath = opened.archive.resolveSlideChain(slidePath).themePath;
      const xml = themePath ? opened.archive.readText(themePath) : void 0;
      return xml ? parseTheme(xml).minorFont : void 0;
    } catch {
      return void 0;
    }
  }
  function findEl(slide, sourceId) {
    const el = slide.elements.find((e) => e.id === sourceId);
    if (el && (el.type === "text" || el.type === "shape")) return el;
    return void 0;
  }
  function applyAutofitResize(session2, slideIndex, sourceId, rendered) {
    if (!rendered) return rendered;
    const slide = session2.opened.deck.slides[slideIndex];
    const el = slide ? findEl(slide, sourceId) : void 0;
    if (!el?.text || el.text.autofit !== "resize") return rendered;
    const node = rendered.nodes.find((n) => n.sourceId === sourceId);
    if (!node || node.type !== "shape" && node.type !== "text" || !node.text) return rendered;
    const needH = node.text.contentHeight + node.text.insets.t + node.text.insets.b;
    if (Math.abs(needH - node.box.h) < 1) return rendered;
    const baseWidthPx = session2.opened.deck.size.cx / EMU_PER_PX_96;
    const scale = session2.fitWidthPx / baseWidthPx;
    el.transform = {
      ...el.transform,
      offset: {
        ...el.transform.offset,
        cy: Math.max(Math.round(needH / scale * EMU_PER_PX_96), 1)
      }
    };
    el.dirtyTransform = true;
    return rebuildSlide(session2, slideIndex);
  }
  function syncAutofitScale(session2, slideIndex, sourceId, rendered) {
    if (!rendered) return rendered;
    const slide = session2.opened.deck.slides[slideIndex];
    const el = slide ? findEl(slide, sourceId) : void 0;
    if (!el?.text || el.text.autofit !== "shrink") return rendered;
    const node = rendered.nodes.find((n) => n.sourceId === sourceId);
    if (!node || node.type !== "shape" && node.type !== "text" || !node.text) return rendered;
    const effective = node.text.fontScale;
    const effectiveRed = node.text.lnSpcReduction ?? 0;
    if (Math.abs(effective - (el.text.fontScale ?? 1)) < 5e-3 && Math.abs(effectiveRed - (el.text.lnSpcReduction ?? 0)) < 5e-3)
      return rendered;
    el.text.fontScale = effective;
    if (effectiveRed) el.text.lnSpcReduction = effectiveRed;
    else delete el.text.lnSpcReduction;
    el.anchor.originalXml = patchBodyPrAutofit(el.anchor.originalXml, effective, effectiveRed);
    slide.structureDirty = true;
    return rendered;
  }
  var CHART_COLOR_SCHEMES = {
    default: [],
    blue: ["#2E75B6", "#4472C4", "#5B9BD5", "#70AD47", "#ED7D31"],
    warm: ["#ED7D31", "#FFC000", "#FF0000", "#C55A11", "#833C00"],
    cool: ["#0070C0", "#00B0F0", "#00B0A0", "#7030A0", "#2E75B6"],
    mono: ["#404040", "#666666", "#888888", "#AAAAAA", "#CCCCCC"]
  };
  var FALLBACK_ACCENTS = ["#4472C4", "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5", "#70AD47"];
  function mixHex(hex, target, ratio) {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
    if (!m) return hex;
    const v = parseInt(m[1], 16);
    const ch = (x) => Math.round(x + (target - x) * ratio);
    const r = ch(v >> 16 & 255);
    const g = ch(v >> 8 & 255);
    const b = ch(v & 255);
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, "0").toUpperCase()}`;
  }
  function deckAccents(opened) {
    const slide = opened.deck.slides[0];
    if (!slide) return FALLBACK_ACCENTS;
    try {
      const chain = opened.archive.resolveSlideChain(slide.path);
      const xml = chain.themePath ? opened.archive.readText(chain.themePath) : null;
      const colors = xml ? parseTheme(xml).colors : void 0;
      const acc = ["accent1", "accent2", "accent3", "accent4", "accent5", "accent6"].map((k) => colors?.[k]).filter((c) => !!c);
      return acc.length >= 3 ? acc : FALLBACK_ACCENTS;
    } catch {
      return FALLBACK_ACCENTS;
    }
  }
  function chartColorSchemes(opened) {
    const acc = deckAccents(opened);
    const rot = [...acc.slice(3), ...acc.slice(0, 3)];
    const mono = (c) => [
      mixHex(c, 0, 0.25),
      c,
      mixHex(c, 255, 0.25),
      mixHex(c, 255, 0.45),
      mixHex(c, 255, 0.65)
    ];
    return [
      { key: "default", label: tm("schemeThemeDefault"), colors: [] },
      { key: "colorful", label: tm("schemeColorful"), colors: acc },
      { key: "colorful2", label: tm("schemeColorful2"), colors: rot },
      ...acc.map((c, i) => ({
        key: `mono-accent${i + 1}`,
        label: tm("schemeMono", { n: i + 1 }),
        colors: mono(c)
      }))
    ];
  }
  var ipcRegistered = false;
  function registerSlidesIpc() {
    if (ipcRegistered) return;
    ipcRegistered = true;
    ipcMain.removeHandler("app:get-language");
    ipcMain.handle("app:get-language", () => getUiLang());
    void app.whenReady().then(() => {
      try {
        session.defaultSession.setDisplayMediaRequestHandler(
          (_request, callback) => {
            desktopCapturer.getSources({ types: ["screen", "window"] }).then((sources) => {
              if (sources[0]) callback({ video: sources[0] });
              else callback({});
            }).catch(() => callback({}));
          },
          { useSystemPicker: true }
        );
      } catch {
      }
    });
    ipcMain.handle("slides:open", async (e, fitWidthPx) => {
      const parent = dialogParent();
      const options = {
        properties: ["openFile"],
        filters: [{ name: "PowerPoint", extensions: ["pptx", "ppt"] }]
      };
      const r = await showOpenDialogWithMemory(dialog, parent, options);
      if (r.canceled || !r.filePaths[0]) return null;
      if (await rejectLegacyPpt(r.filePaths[0])) return null;
      return openAndBuild(e.sender, r.filePaths[0], fitWidthPx);
    });
    ipcMain.handle("slides:open-path", async (e, path, fitWidthPx) => {
      if (!path || !existsSync(path)) return null;
      if (await rejectLegacyPpt(path)) return null;
      return openAndBuild(e.sender, path, fitWidthPx);
    });
    ipcMain.handle("slides:consume-pending-open", async (e, fitWidthPx) => {
      if (pendingBytes) {
        const bytes = pendingBytes;
        pendingBytes = null;
        return openBytes(e.sender, bytes, "local.pptx", fitWidthPx);
      }
      vibFlip.get(e.sender.id)?.("#00000000");
      const queued = pendingByWc.get(e.sender.id) ?? pendingOpenPath;
      if (queued && existsSync(queued)) {
        const result = await openAndBuild(e.sender, queued, fitWidthPx);
        if (pendingByWc.get(e.sender.id) === queued) pendingByWc.delete(e.sender.id);
        if (pendingOpenPath === queued) pendingOpenPath = null;
        return result;
      }
      const session2 = sessions.get(e.sender.id);
      if (session2) {
        session2.fitWidthPx = fitWidthPx;
        return {
          path: session2.path,
          slides: buildAllRenderSlides(session2.opened, fitWidthPx),
          size: { cx: session2.opened.deck.size.cx, cy: session2.opened.deck.size.cy },
          defaultFont: deckDefaultFont(session2.opened)
        };
      }
      return null;
    });
    ipcMain.handle("slides:edit-text", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return null;
      if (op.groupId) {
        const found = findGroupChild(slide, op.groupId, op.sourceId);
        const child = found?.child;
        if (!child || child.type !== "text" && child.type !== "shape") return null;
        const textChild = child;
        if (!textChild.text) return null;
        pushHistory(session2);
        textChild.text.paragraphs = applyEditParagraphs(textChild.text.paragraphs, op.paragraphs);
        ensureRunLinkRels(session2.opened, op.slideIndex, textChild.text.paragraphs);
        if (!patchGroupChildText(slide, op.groupId, textChild)) {
          restoreSnapshot(session2, session2.undoStack.pop());
          return null;
        }
        for (const { index, patch } of collectParagraphFormatPatches(op.paragraphs)) {
          setGroupChildParagraphFormat(slide, op.groupId, op.sourceId, patch, [index]);
        }
        return rebuildSlide(session2, op.slideIndex);
      }
      const el = findEl(slide, op.sourceId);
      if (!el || !el.text) return null;
      pushHistory(session2);
      const levelDirty = levelsChanged(el.text.paragraphs, op.paragraphs);
      el.text.paragraphs = applyEditParagraphs(el.text.paragraphs, op.paragraphs);
      ensureRunLinkRels(session2.opened, op.slideIndex, el.text.paragraphs);
      el.dirty = true;
      for (const { index, patch } of collectParagraphFormatPatches(op.paragraphs)) {
        setElementParagraphFormat(slide, op.sourceId, patch, [index]);
      }
      if (levelDirty) {
        el.dirtyPPr = { ...el.dirtyPPr, level: true, indents: true };
        materializeSlide(session2.opened, op.slideIndex);
        return rebuildSlide(session2, op.slideIndex);
      }
      const rendered = applyAutofitResize(
        session2,
        op.slideIndex,
        op.sourceId,
        rebuildSlide(session2, op.slideIndex)
      );
      return syncAutofitScale(session2, op.slideIndex, op.sourceId, rendered);
    });
    ipcMain.handle("slides:set-element-font", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return null;
      pushHistory(session2);
      let changed = false;
      for (const id of op.sourceIds) {
        const ok = op.groupId ? setGroupChildFont(slide, op.groupId, id, {
          fontFamily: op.fontFamily,
          fontSizePt: op.fontSizePt,
          strike: op.strike,
          bold: op.bold,
          italic: op.italic,
          underline: op.underline,
          color: op.color
        }) : setElementFont(slide, id, {
          fontFamily: op.fontFamily,
          fontSizePt: op.fontSizePt,
          strike: op.strike,
          bold: op.bold,
          italic: op.italic,
          underline: op.underline,
          color: op.color
        });
        if (ok) changed = true;
      }
      if (!changed) {
        session2.undoStack.pop();
        return null;
      }
      let rendered = rebuildSlide(session2, op.slideIndex);
      for (const id of op.sourceIds) {
        rendered = applyAutofitResize(session2, op.slideIndex, id, rendered);
        rendered = syncAutofitScale(session2, op.slideIndex, id, rendered);
      }
      return rendered;
    });
    ipcMain.handle("slides:set-element-paragraph-format", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return null;
      pushHistory(session2);
      const patch = {
        bullet: op.bullet,
        bulletChar: op.bulletChar,
        bulletHangEmu: op.bulletHangEmu,
        bulletSizePct: op.bulletSizePct,
        bulletColor: op.bulletColor,
        lineSpacingPct: op.lineSpacingPct,
        spaceBeforePt: op.spaceBeforePt,
        spaceAfterPt: op.spaceAfterPt,
        align: op.align,
        indentDelta: op.indentDelta
      };
      let changed = false;
      for (const id of op.sourceIds) {
        const ok = op.groupId ? setGroupChildParagraphFormat(slide, op.groupId, id, patch) : setElementParagraphFormat(slide, id, patch);
        if (ok) changed = true;
      }
      if (!changed) {
        session2.undoStack.pop();
        return null;
      }
      if (op.indentDelta) {
        materializeSlide(session2.opened, op.slideIndex);
        return rebuildSlide(session2, op.slideIndex);
      }
      let rendered = rebuildSlide(session2, op.slideIndex);
      for (const id of op.sourceIds) {
        rendered = applyAutofitResize(session2, op.slideIndex, id, rendered);
        rendered = syncAutofitScale(session2, op.slideIndex, id, rendered);
      }
      return rendered;
    });
    ipcMain.handle("slides:edit-transform", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return null;
      const el = op.groupId ? null : slide.elements.find((x) => x.id === op.sourceId);
      const grpChild = op.groupId ? findGroupChild(slide, op.groupId, op.sourceId) : null;
      if (!el && !grpChild) return null;
      if (op.preview) {
        if (!session2.transformPreview) {
          pushHistory(session2);
          session2.transformPreview = true;
        }
      } else if (session2.transformPreview) {
        session2.transformPreview = false;
      } else {
        pushHistory(session2);
      }
      const baseWidthPx = session2.opened.deck.size.cx / EMU_PER_PX_96;
      const scale = op.fitWidthPx / baseWidthPx;
      const toEmu = (px) => Math.round(px / scale * EMU_PER_PX_96);
      if (grpChild) {
        const ch = grpChild.grp.childOffset;
        const chX = ch?.x ?? grpChild.grp.transform.offset.x;
        const chY = ch?.y ?? grpChild.grp.transform.offset.y;
        const gExt = grpChild.grp.transform.offset;
        const gsx = ch?.cx ? gExt.cx / ch.cx : 1;
        const gsy = ch?.cy ? gExt.cy / ch.cy : 1;
        const ok = editGroupChildTransform(
          slide,
          op.groupId,
          op.sourceId,
          {
            x: toEmu(op.xPx / gsx) + chX,
            y: toEmu(op.yPx / gsy) + chY,
            cx: toEmu(op.wPx / gsx),
            cy: toEmu(op.hPx / gsy)
          },
          op.rotationDeg
        );
        if (!ok) {
          session2.undoStack.pop();
          return null;
        }
        return rebuildSlide(session2, op.slideIndex);
      }
      const isTable = el.type === "table";
      if (isTable) resizeTable(slide, op.sourceId, toEmu(op.wPx), toEmu(op.hPx));
      el.transform = {
        ...el.transform,
        offset: {
          x: toEmu(op.xPx),
          y: toEmu(op.yPx),
          // resizeTable synced cx/cy to the redistributed sums
          cx: isTable ? el.transform.offset.cx : toEmu(op.wPx),
          cy: isTable ? el.transform.offset.cy : toEmu(op.hPx)
        },
        rot: Math.round(op.rotationDeg * 6e4)
      };
      el.dirtyTransform = true;
      updateConnectorsForMoved(slide, [op.sourceId]);
      return rebuildSlide(session2, op.slideIndex);
    });
    ipcMain.handle("slides:edit-connector-endpoints", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return null;
      const el = slide.elements.find((x) => x.id === op.sourceId);
      if (!el) return null;
      pushHistory(session2);
      const baseWidthPx = session2.opened.deck.size.cx / EMU_PER_PX_96;
      const scale = op.fitWidthPx / baseWidthPx;
      const toEmu = (px) => Math.round(px / scale * EMU_PER_PX_96);
      const p1 = { x: toEmu(op.x1Px), y: toEmu(op.y1Px) };
      const p2 = { x: toEmu(op.x2Px), y: toEmu(op.y2Px) };
      el.transform = {
        ...el.transform,
        offset: {
          x: Math.min(p1.x, p2.x),
          y: Math.min(p1.y, p2.y),
          cx: Math.abs(p2.x - p1.x),
          cy: Math.abs(p2.y - p1.y)
        },
        rot: 0,
        flipH: p1.x > p2.x,
        flipV: p1.y > p2.y
      };
      el.dirtyTransform = true;
      const toRef = (v) => {
        if (v === void 0) return void 0;
        if (v === null) return null;
        const target = slide.elements.find((x) => x.id === v.targetId);
        const spid = target ? elementSpid(target) : null;
        return spid != null ? { id: spid, idx: v.idx } : null;
      };
      setElementConnection(slide, op.sourceId, { start: toRef(op.start), end: toRef(op.end) });
      return rebuildSlide(session2, op.slideIndex);
    });
    ipcMain.handle("slides:get-render-slides", (e) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      return session2.opened.deck.slides.map((_, i) => rebuildSlide(session2, i));
    });
    ipcMain.handle("slides:batch-edit-transform", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return null;
      const baseWidthPx = session2.opened.deck.size.cx / EMU_PER_PX_96;
      const scale = op.fitWidthPx / baseWidthPx;
      const toEmu = (px) => Math.round(px / scale * EMU_PER_PX_96);
      const pairs = [];
      for (const item of op.items) {
        const el = slide.elements.find((x) => x.id === item.sourceId);
        if (!el) return null;
        pairs.push({ el, item });
      }
      pushHistory(session2);
      for (const { el, item } of pairs) {
        el.transform = {
          ...el.transform,
          offset: {
            x: toEmu(item.xPx),
            y: toEmu(item.yPx),
            cx: toEmu(item.wPx),
            cy: toEmu(item.hPx)
          },
          rot: Math.round(item.rotationDeg * 6e4)
        };
        el.dirtyTransform = true;
      }
      updateConnectorsForMoved(
        slide,
        op.items.map((i) => i.sourceId)
      );
      return rebuildSlide(session2, op.slideIndex);
    });
    const cloudSlideEnabled = () => process.env.GENOFFICE_CLOUD_SLIDE !== "0" && !!gskApiKey();
    ipcMain.handle("slides:cloud-gen-status", () => ({ enabled: cloudSlideEnabled() }));
    ipcMain.handle(
      "slides:cloud-page-generate",
      async (_e, op) => {
        if (!cloudSlideEnabled()) return { ok: false, error: "cloud slide generation is disabled" };
        try {
          const tier = process.env.GENOFFICE_CLOUD_SLIDE_TIER === "standard" ? "standard" : "ultra";
          const started = Date.now();
          const { bytes, model } = await gskSlideGenerate({
            tier,
            brief: String(op.brief ?? ""),
            title: op.title ? String(op.title) : void 0,
            styleSkill: op.styleSkill ? String(op.styleSkill) : void 0,
            deckContext: op.deckContext,
            images: Array.isArray(op.images) ? op.images : void 0,
            width: op.width,
            height: op.height
          });
          console.log(
            `[cloud-slide] page generated: tier=${tier} model=${model} bytes=${bytes.length} ms=${Date.now() - started}`
          );
          const dir = join(app.getPath("temp"), "genoffice-cloud-pages");
          mkdirSync(dir, { recursive: true });
          const path = join(dir, `${randomUUID()}.pptx`);
          await writeFile(path, bytes);
          issuedCloudPages.add(path);
          return { ok: true, marker: CLOUD_PAGE_PREFIX + path };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      }
    );
    ipcMain.handle(
      "slides:html-to-pptx",
      async (e, pagesHtml, fitWidthPx, mode, atIndex, deckName) => {
        const readCloudPage = async (marker) => {
          if (!marker.startsWith(CLOUD_PAGE_PREFIX)) throw new Error("expected a cloud page marker");
          const path = marker.slice(CLOUD_PAGE_PREFIX.length);
          if (!issuedCloudPages.has(path)) throw new Error("unknown cloud page marker");
          return { bytes: new Uint8Array(await readFile(path)) };
        };
        const assembleDeck = async () => {
          const perPage = await Promise.all(pagesHtml.map(readCloudPage));
          const base = await openPptx(perPage[0].bytes);
          for (const one of perPage.slice(1)) await mergeSlideFromPptx(base, one.bytes);
          for (const s of base.deck.slides) promoteSlideBackground(s, base.deck.size);
          return { bytes: await savePptx(base) };
        };
        try {
          if (mode === "append") {
            const existing = sessions.get(e.sender.id);
            if (!existing) {
              return { error: tm("errNoDeckAppend") };
            }
            const opened2 = existing.opened;
            const beforeCount = opened2.deck.slides.length;
            pushHistory(existing);
            let merged = 0;
            let lastErr;
            for (const html of pagesHtml) {
              try {
                const one = await readCloudPage(html);
                const slide = await mergeSlideFromPptx(opened2, one.bytes);
                if (slide) {
                  promoteSlideBackground(slide, opened2.deck.size);
                  merged += 1;
                } else lastErr = tm("errMergeFailed");
              } catch (pageErr) {
                lastErr = pageErr instanceof Error ? pageErr.message : String(pageErr);
              }
            }
            if (merged === 0) {
              existing.undoStack.pop();
              return { error: tm("errAppendFailed", { reason: lastErr ?? tm("errUnknown") }) };
            }
            existing.fitWidthPx = fitWidthPx;
            const bytes2 = await savePptx(opened2);
            await saveDraftAfterGenerate(e.sender, existing, bytes2, "append", deckName);
            if (existing.path) {
              existing.opened = await openPptx(bytes2);
              existing.metaDirty = false;
            }
            return {
              path: existing.path,
              slides: buildAllRenderSlides(existing.opened, fitWidthPx),
              size: { cx: existing.opened.deck.size.cx, cy: existing.opened.deck.size.cy },
              defaultFont: deckDefaultFont(existing.opened),
              appendedFrom: beforeCount,
              ...lastErr && merged < pagesHtml.length ? { fallbackReason: tm("errPartialAppend", { reason: lastErr }) } : {}
            };
          }
          if (mode === "replace_at") {
            const existing = sessions.get(e.sender.id);
            if (!existing) {
              return { error: tm("errNoDeckReplace") };
            }
            const opened2 = existing.opened;
            const total = opened2.deck.slides.length;
            if (atIndex == null || !Number.isInteger(atIndex) || atIndex < 0 || atIndex >= total) {
              return { error: tm("errIndexRange", { max: total - 1 }) };
            }
            const html = pagesHtml[0];
            if (!html || pagesHtml.length !== 1) {
              return { error: tm("errReplaceNeedsOne") };
            }
            const one = await readCloudPage(html);
            pushHistory(existing);
            const rollback = () => {
              const snap = existing.undoStack.pop();
              if (snap) restoreSnapshot(existing, snap);
            };
            const merged = await mergeSlideFromPptx(opened2, one.bytes);
            if (!merged) {
              rollback();
              return { error: tm("errMergeFailed") };
            }
            promoteSlideBackground(merged, opened2.deck.size);
            if (!moveSlide(opened2, total, atIndex) || !deleteSlide(opened2, atIndex + 1)) {
              rollback();
              return { error: tm("errReplaceFailed") };
            }
            existing.fitWidthPx = fitWidthPx;
            const bytes2 = await savePptx(opened2);
            await saveDraftAfterGenerate(e.sender, existing, bytes2, "append", deckName);
            if (existing.path) {
              existing.opened = await openPptx(bytes2);
              existing.metaDirty = false;
            }
            return {
              path: existing.path,
              slides: buildAllRenderSlides(existing.opened, fitWidthPx),
              size: { cx: existing.opened.deck.size.cx, cy: existing.opened.deck.size.cy },
              defaultFont: deckDefaultFont(existing.opened),
              replacedIndex: atIndex
            };
          }
          if (mode === "insert_at") {
            const existing = sessions.get(e.sender.id);
            if (!existing) {
              return { error: tm("errNoDeckInsert") };
            }
            const opened2 = existing.opened;
            const total = opened2.deck.slides.length;
            if (atIndex == null || !Number.isInteger(atIndex) || atIndex < 0 || atIndex > total) {
              return { error: tm("errIndexRange", { max: total }) };
            }
            const html = pagesHtml[0];
            if (!html || pagesHtml.length !== 1) {
              return { error: tm("errInsertNeedsOne") };
            }
            const one = await readCloudPage(html);
            pushHistory(existing);
            const rollback = () => {
              const snap = existing.undoStack.pop();
              if (snap) restoreSnapshot(existing, snap);
            };
            const merged = await mergeSlideFromPptx(opened2, one.bytes);
            if (!merged) {
              rollback();
              return { error: tm("errMergeFailed") };
            }
            promoteSlideBackground(merged, opened2.deck.size);
            if (atIndex < total && !moveSlide(opened2, total, atIndex)) {
              rollback();
              return { error: tm("errInsertFailed") };
            }
            existing.fitWidthPx = fitWidthPx;
            const bytes2 = await savePptx(opened2);
            await saveDraftAfterGenerate(e.sender, existing, bytes2, "append", deckName);
            if (existing.path) {
              existing.opened = await openPptx(bytes2);
              existing.metaDirty = false;
            }
            return {
              path: existing.path,
              slides: buildAllRenderSlides(existing.opened, fitWidthPx),
              size: { cx: existing.opened.deck.size.cx, cy: existing.opened.deck.size.cy },
              defaultFont: deckDefaultFont(existing.opened),
              insertedIndex: atIndex
            };
          }
          const { bytes } = await assembleDeck();
          const opened = await openPptx(bytes);
          const replaceSession = {
            path: "",
            opened,
            fitWidthPx,
            undoStack: [],
            redoStack: [],
            htmlPages: null
          };
          carryHistoryForReplacement(sessions.get(e.sender.id), replaceSession);
          sessions.set(e.sender.id, replaceSession);
          await saveDraftAfterGenerate(e.sender, replaceSession, bytes, "replace", deckName);
          return {
            path: replaceSession.path,
            slides: buildAllRenderSlides(opened, fitWidthPx),
            size: { cx: opened.deck.size.cx, cy: opened.deck.size.cy },
            defaultFont: deckDefaultFont(opened)
          };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      }
    );
    ipcMain.handle("slides:new-blank", async (e, fitWidthPx) => {
      const opened = await openPptx(await createBlankPptx());
      sessions.set(e.sender.id, { path: "", opened, fitWidthPx, undoStack: [], redoStack: [] });
      scheduleHistoryNotify(sessions.get(e.sender.id));
      return {
        path: "",
        slides: buildAllRenderSlides(opened, fitWidthPx),
        size: { cx: opened.deck.size.cx, cy: opened.deck.size.cy },
        defaultFont: deckDefaultFont(opened)
      };
    });
    ipcMain.handle("slides:add-element", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return null;
      pushHistory(session2);
      const baseWidthPx = session2.opened.deck.size.cx / EMU_PER_PX_96;
      const scale = op.fitWidthPx / baseWidthPx;
      const toEmu = (px) => Math.round(px / scale * EMU_PER_PX_96);
      const paragraphs = op.paragraphs?.length ? op.paragraphs : op.text ? op.text.split("\n").map((line2) => ({ runs: [{ text: line2 }] })) : void 0;
      const el = addElement(slide, {
        kind: op.kind,
        offset: { x: toEmu(op.xPx), y: toEmu(op.yPx), cx: toEmu(op.wPx), cy: toEmu(op.hPx) },
        ...paragraphs ? { paragraphs } : {},
        ...op.fillColor ? { fillColor: op.fillColor } : {},
        ...op.stroke ? {
          stroke: {
            color: op.stroke.color,
            widthEmu: Math.round(op.stroke.widthPt * EMU_PER_PT)
          }
        } : {}
      });
      const rebuilt = rebuildSlide(session2, op.slideIndex);
      return rebuilt ? { slide: rebuilt, sourceId: el.id } : null;
    });
    ipcMain.handle("slides:delete-element", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return null;
      if (!slide.elements.some((x) => x.id === op.sourceId)) return null;
      pushHistory(session2);
      if (!deleteElement(slide, op.sourceId)) return null;
      return rebuildSlide(session2, op.slideIndex);
    });
    ipcMain.handle("slides:edit-stroke", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return null;
      if (op.groupId) {
        pushHistory(session2);
        const stroke = op.stroke ? {
          color: op.stroke.color,
          widthEmu: Math.round(op.stroke.widthPt * EMU_PER_PT),
          ...op.stroke.dash ? { dash: op.stroke.dash } : {}
        } : null;
        if (!editGroupChildStroke(slide, op.groupId, op.sourceId, stroke)) {
          session2.undoStack.pop();
          return null;
        }
        return rebuildSlide(session2, op.slideIndex);
      }
      const el = slide.elements.find(
        (x) => x.id === op.sourceId && (x.type === "text" || x.type === "shape" || x.type === "picture")
      );
      if (!el) return null;
      pushHistory(session2);
      el.stroke = op.stroke ? {
        fill: { type: "solid", color: op.stroke.color },
        width: Math.round(op.stroke.widthPt * EMU_PER_PT),
        ...op.stroke.dash ? { dash: op.stroke.dash } : {}
      } : void 0;
      el.dirtyStroke = true;
      return rebuildSlide(session2, op.slideIndex);
    });
    ipcMain.handle("slides:flip-elements", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return null;
      const targets = op.sourceIds.map(
        (id) => op.groupId ? findGroupChild(slide, op.groupId, id)?.child : slide.elements.find((x) => x.id === id)
      ).filter((el) => !!el && !!el.transform);
      if (targets.length === 0) return null;
      pushHistory(session2);
      for (const el of targets) {
        const t = el.transform;
        const orbit = () => {
          const rad = (t.rot ?? 0) / 6e4 * Math.PI / 180;
          const bx = t.flipH ? t.offset.cx : 0;
          const by = t.flipV ? t.offset.cy : 0;
          const vx = (t.flipH ? -1 : 1) * t.offset.cx / 2;
          const vy = (t.flipV ? -1 : 1) * t.offset.cy / 2;
          return {
            x: bx + vx * Math.cos(rad) - vy * Math.sin(rad),
            y: by + vx * Math.sin(rad) + vy * Math.cos(rad)
          };
        };
        const before = orbit();
        if (op.axis === "h") t.flipH = !t.flipH;
        else t.flipV = !t.flipV;
        const after = orbit();
        t.offset.x += Math.round(before.x - after.x);
        t.offset.y += Math.round(before.y - after.y);
        el.dirtyTransform = true;
      }
      updateConnectorsForMoved(
        slide,
        targets.map((el) => el.id)
      );
      return rebuildSlide(session2, op.slideIndex);
    });
    ipcMain.handle("slides:edit-picture-src-rect", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return null;
      pushHistory(session2);
      if (!editPictureSrcRect(slide, op.sourceId, op.srcRect)) {
        session2.undoStack.pop();
        return null;
      }
      if (op.boxPx && op.fitWidthPx) {
        const el = slide.elements.find((x) => x.id === op.sourceId);
        if (el) {
          const baseWidthPx = session2.opened.deck.size.cx / EMU_PER_PX_96;
          const scale = op.fitWidthPx / baseWidthPx;
          const toEmu = (px) => Math.round(px / scale * EMU_PER_PX_96);
          el.transform = {
            ...el.transform,
            offset: {
              x: toEmu(op.boxPx.x),
              y: toEmu(op.boxPx.y),
              cx: toEmu(op.boxPx.w),
              cy: toEmu(op.boxPx.h)
            }
          };
          el.dirtyTransform = true;
          updateConnectorsForMoved(slide, [op.sourceId]);
        }
      }
      return rebuildSlide(session2, op.slideIndex);
    });
    ipcMain.handle("slides:group-elements", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      pushHistory(session2);
      const result = groupElements(session2.opened, op.slideIndex, op.sourceIds);
      if (!result) {
        session2.undoStack.pop();
        return null;
      }
      const renderSlide = rebuildSlide(session2, op.slideIndex);
      return renderSlide ? { slide: renderSlide, groupId: result.groupId } : null;
    });
    ipcMain.handle("slides:ungroup-element", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      pushHistory(session2);
      const fresh = ungroupElement(session2.opened, op.slideIndex, op.sourceId);
      if (!fresh) {
        session2.undoStack.pop();
        return null;
      }
      return rebuildSlide(session2, op.slideIndex);
    });
    const recolorFullBleedBackdrops = (slide, size, color) => {
      for (const el of slide.elements) {
        if (el.type !== "shape" && el.type !== "text") continue;
        const shaped = el;
        const fillType = shaped.fill?.type;
        if (fillType !== "solid" && fillType !== "gradient") continue;
        if (shaped.text?.paragraphs.some((p) => p.runs.some((r) => r.text.trim()))) continue;
        const { x, y, cx, cy } = el.transform.offset;
        const coversX = x <= size.cx * 0.05 && x + cx >= size.cx * 0.95;
        const coversY = y <= size.cy * 0.05 && y + cy >= size.cy * 0.95;
        if (!coversX || !coversY) continue;
        shaped.fill = { type: "solid", color };
        shaped.dirtyFill = true;
      }
    };
    ipcMain.handle("slides:edit-background", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slides = session2.opened.deck.slides;
      const targets = op.slideIndex === -1 ? slides : [slides[op.slideIndex]].filter(Boolean);
      if (targets.length === 0) return null;
      pushHistory(session2);
      for (const s of targets) {
        setSlideBackground(s, op.color);
        recolorFullBleedBackdrops(s, session2.opened.deck.size, op.color);
      }
      session2.fitWidthPx = op.fitWidthPx;
      return buildAllRenderSlides(session2.opened, op.fitWidthPx);
    });
    ipcMain.handle(
      "slides:edit-image-fill",
      async (e, op) => {
        const session2 = sessions.get(e.sender.id);
        if (!session2) return null;
        const slide = session2.opened.deck.slides[op.slideIndex];
        if (!slide) return null;
        const parent = dialogParent();
        const options = {
          title: tm("dlgInsertImage"),
          properties: ["openFile"],
          filters: [
            {
              name: tm("filterImages"),
              extensions: ["png", "jpg", "jpeg", "gif", "bmp", "webp", "tif", "tiff"]
            }
          ]
        };
        const r = await showOpenDialogWithMemory(dialog, parent, options);
        if (r.canceled || !r.filePaths[0]) return null;
        const bytes = await readFile(r.filePaths[0]);
        const ext = r.filePaths[0].split(".").pop().toLowerCase();
        pushHistory(session2);
        if (!setElementImageFill(session2.opened, slide, op.sourceId, bytes, ext)) {
          session2.undoStack.pop();
          return null;
        }
        return rebuildSlide(session2, op.slideIndex);
      }
    );
    ipcMain.handle("slides:insert-image", async (e, slideIndex, fitWidthPx) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[slideIndex];
      if (!slide) return null;
      const parent = dialogParent();
      const options = {
        title: tm("dlgInsertImage"),
        properties: ["openFile"],
        filters: [
          {
            name: tm("filterImages"),
            extensions: ["png", "jpg", "jpeg", "gif", "bmp", "webp", "tif", "tiff"]
          }
        ]
      };
      const r = await showOpenDialogWithMemory(dialog, parent, options);
      if (r.canceled || !r.filePaths[0]) return null;
      const filePath = r.filePaths[0];
      const bytes = await readFile(filePath);
      const ext = filePath.split(".").pop().toLowerCase();
      const deckSize = session2.opened.deck.size;
      let natural = { width: 4, height: 3 };
      if (ext === "tif" || ext === "tiff") {
        const decoded = tiffToPng(new Uint8Array(bytes));
        if (decoded) natural = { width: decoded.width, height: decoded.height };
      } else {
        const img = nativeImage.createFromPath(filePath);
        if (!img.isEmpty()) natural = img.getSize();
      }
      const maxW = deckSize.cx / 2;
      const maxH = deckSize.cy / 2;
      const scale = Math.min(maxW / natural.width, maxH / natural.height);
      const cx = Math.round(natural.width * scale);
      const cy = Math.round(natural.height * scale);
      const offset = {
        x: Math.round((deckSize.cx - cx) / 2),
        y: Math.round((deckSize.cy - cy) / 2),
        cx,
        cy
      };
      pushHistory(session2);
      const el = addPicture(session2.opened, slide, { bytes: new Uint8Array(bytes), ext, offset });
      if (!el) {
        session2.undoStack.pop();
        return { error: "unsupported", ext };
      }
      session2.fitWidthPx = fitWidthPx;
      const rebuilt = rebuildSlide(session2, slideIndex);
      return rebuilt ? { slide: rebuilt, sourceId: el.id } : null;
    });
    ipcMain.handle("slides:edit-fill", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return null;
      if (op.groupId) {
        pushHistory(session2);
        const fill = typeof op.fill === "string" ? op.fill : {
          stops: [
            { pos: 0, color: op.fill.gradient.from },
            { pos: 1, color: op.fill.gradient.to }
          ],
          ...op.fill.gradient.radial ? { radial: true } : { angle: Math.round((op.fill.gradient.angleDeg ?? 0) * 6e4) }
        };
        if (!editGroupChildFill(slide, op.groupId, op.sourceId, fill)) {
          session2.undoStack.pop();
          return null;
        }
        return rebuildSlide(session2, op.slideIndex);
      }
      const el = findEl(slide, op.sourceId);
      if (!el) return null;
      pushHistory(session2);
      if (typeof op.fill === "string") {
        el.fill = op.fill === "none" ? { type: "none" } : { type: "solid", color: op.fill };
      } else {
        const g = op.fill.gradient;
        el.fill = {
          type: "gradient",
          stops: [
            { pos: 0, color: g.from },
            { pos: 1, color: g.to }
          ],
          ...g.radial ? { path: "circle" } : { angle: Math.round((g.angleDeg ?? 0) * 6e4) }
        };
      }
      el.dirtyFill = true;
      return rebuildSlide(session2, op.slideIndex);
    });
    ipcMain.handle("slides:add-slide", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      pushHistory(session2);
      const slide = duplicateSlide(session2.opened, op.sourceIndex, { clearText: !!op.clearText });
      if (!slide) {
        session2.undoStack.pop();
        return null;
      }
      session2.fitWidthPx = op.fitWidthPx;
      return {
        slides: buildAllRenderSlides(session2.opened, op.fitWidthPx),
        index: op.sourceIndex + 1
      };
    });
    ipcMain.handle("slides:copy-slide", (e, slideIndex, pngBase64) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return false;
      const bundle = copySlide(session2.opened, slideIndex);
      if (!bundle) return false;
      slideClipboard = { bundle, ...pngBase64 ? { png: pngBase64 } : {} };
      clipboard.writeBuffer("io.genoffice.slides.slide", Buffer.from("1"));
      return true;
    });
    ipcMain.handle("slides:has-slide-clipboard", () => slideClipboard !== null);
    const performSlidePaste = (session2, op) => {
      if (!slideClipboard) return null;
      if (op.mode === "picture") {
        const { deck } = session2.opened;
        const anchorIndex = Math.min(Math.max(op.afterIndex, 0), deck.slides.length - 1);
        const slide2 = deck.slides[anchorIndex];
        if (!slide2 || !slideClipboard.png) return null;
        const el = addPicture(session2.opened, slide2, {
          bytes: new Uint8Array(Buffer.from(slideClipboard.png, "base64")),
          ext: "png",
          offset: { x: 0, y: 0, cx: deck.size.cx, cy: deck.size.cy }
        });
        if (!el) return null;
        session2.fitWidthPx = op.fitWidthPx;
        return {
          slides: buildAllRenderSlides(session2.opened, op.fitWidthPx),
          index: anchorIndex,
          sourceId: el.id
        };
      }
      const slide = pasteSlide(session2.opened, op.afterIndex, slideClipboard.bundle, {
        keepSourceFormatting: op.mode === "source"
      });
      if (!slide) return null;
      session2.fitWidthPx = op.fitWidthPx;
      return {
        slides: buildAllRenderSlides(session2.opened, op.fitWidthPx),
        index: session2.opened.deck.slides.indexOf(slide)
      };
    };
    ipcMain.handle("slides:paste-slide", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2 || !slideClipboard) return null;
      pushHistory(session2);
      const r = performSlidePaste(session2, op);
      if (!r) {
        session2.undoStack.pop();
        return null;
      }
      lastSlidePaste.set(e.sender.id, {
        afterIndex: op.afterIndex,
        undoLen: session2.undoStack.length
      });
      return r;
    });
    ipcMain.handle("slides:repaste-slide", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      const rec = lastSlidePaste.get(e.sender.id);
      if (!session2 || !slideClipboard || !rec) return null;
      if (session2.undoStack.length !== rec.undoLen) return null;
      const snap = session2.undoStack.pop();
      if (!snap) return null;
      restoreSnapshot(session2, snap);
      pushHistory(session2);
      const r = performSlidePaste(session2, {
        afterIndex: rec.afterIndex,
        fitWidthPx: op.fitWidthPx,
        mode: op.mode
      });
      if (!r) {
        session2.undoStack.pop();
        return null;
      }
      rec.undoLen = session2.undoStack.length;
      return r;
    });
    ipcMain.handle("slides:add-blank-slide", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      pushHistory(session2);
      const slide = insertBlankSlide(session2.opened, op.sourceIndex);
      if (!slide) {
        session2.undoStack.pop();
        return null;
      }
      session2.fitWidthPx = op.fitWidthPx;
      return {
        slides: buildAllRenderSlides(session2.opened, op.fitWidthPx),
        index: op.sourceIndex + 1
      };
    });
    const resolveLayoutPath = (session2, layoutPath) => {
      if (!layoutPath?.startsWith(BUILTIN_LAYOUT_PREFIX)) return layoutPath;
      return ensureBuiltinLayout(
        session2.opened.archive,
        session2.opened.deck.size,
        layoutPath.slice(BUILTIN_LAYOUT_PREFIX.length)
      ) ?? void 0;
    };
    ipcMain.handle("slides:add-slide-with-layout", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      pushHistory(session2);
      const layoutPath = resolveLayoutPath(session2, op.layoutPath);
      const slide = layoutPath ? insertSlideWithLayout(session2.opened, op.sourceIndex, layoutPath) : null;
      if (!slide) {
        session2.undoStack.pop();
        return null;
      }
      session2.fitWidthPx = op.fitWidthPx;
      return {
        slides: buildAllRenderSlides(session2.opened, op.fitWidthPx),
        index: op.sourceIndex + 1
      };
    });
    ipcMain.handle("slides:get-layouts", (e) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const layouts = listSlideLayouts(session2.opened.archive);
      if (shouldOfferBuiltinLayouts(layouts)) {
        layouts.push(
          ...builtinLayoutInfos(session2.opened.deck.size, new Set(layouts.map((l) => l.name)))
        );
      }
      return { layouts, size: { ...session2.opened.deck.size } };
    });
    const buildMasterRenderSlide = (session2) => {
      const me = session2.masterEdit;
      if (!me) return null;
      return buildRenderSlide(me.slide, session2.opened.deck.size, {
        fitWidthPx: session2.fitWidthPx,
        media: makeMediaResolver(session2.opened),
        metrics: getFontMetrics()
      });
    };
    const commitMasterEdit = (session2) => {
      const me = session2.masterEdit;
      session2.opened.archive.entries.set(me.partPath, Buffer.from(patchSlideXml(me.slide), "utf8"));
      for (let i = 0; i < session2.opened.deck.slides.length; i++) materializeSlide(session2.opened, i);
      session2.metaDirty = true;
    };
    ipcMain.handle("slides:master-enter", (e, fitWidthPx) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      session2.fitWidthPx = fitWidthPx;
      const items = [];
      for (const p of listMasterParts(session2.opened.archive)) {
        const slide = parseMasterPart(session2.opened.archive, p.partPath);
        if (!slide) continue;
        const rendered = buildRenderSlide(slide, session2.opened.deck.size, {
          fitWidthPx,
          media: makeMediaResolver(session2.opened),
          metrics: getFontMetrics()
        });
        items.push({ partPath: p.partPath, kind: p.kind, name: p.name, slide: rendered });
        if (!session2.masterEdit) session2.masterEdit = { partPath: p.partPath, slide };
      }
      return items.length ? { items } : null;
    });
    ipcMain.handle("slides:master-open", (e, partPath) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = parseMasterPart(session2.opened.archive, partPath);
      if (!slide) return null;
      session2.masterEdit = { partPath, slide };
      return buildMasterRenderSlide(session2);
    });
    ipcMain.handle("slides:master-close", (e) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      session2.masterEdit = null;
      return buildAllRenderSlides(session2.opened, session2.fitWidthPx);
    });
    ipcMain.handle("slides:master-edit-text", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      const me = session2?.masterEdit;
      if (!session2 || !me) return null;
      const el = findEl(me.slide, op.sourceId);
      if (!el?.text) return null;
      pushHistory(session2);
      el.text.paragraphs = applyEditParagraphs(el.text.paragraphs, op.paragraphs);
      el.dirty = true;
      commitMasterEdit(session2);
      return buildMasterRenderSlide(session2);
    });
    ipcMain.handle("slides:master-edit-transform", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      const me = session2?.masterEdit;
      if (!session2 || !me) return null;
      const el = me.slide.elements.find((x) => x.id === op.sourceId);
      if (!el) return null;
      if (op.preview) {
        if (!session2.transformPreview) {
          pushHistory(session2);
          session2.transformPreview = true;
        }
      } else if (session2.transformPreview) {
        session2.transformPreview = false;
      } else {
        pushHistory(session2);
      }
      const baseWidthPx = session2.opened.deck.size.cx / EMU_PER_PX_96;
      const scale = op.fitWidthPx / baseWidthPx;
      const toEmu = (px) => Math.round(px / scale * EMU_PER_PX_96);
      el.transform = {
        ...el.transform,
        offset: { x: toEmu(op.xPx), y: toEmu(op.yPx), cx: toEmu(op.wPx), cy: toEmu(op.hPx) },
        rot: Math.round(op.rotationDeg * 6e4)
      };
      el.dirtyTransform = true;
      if (!op.preview) commitMasterEdit(session2);
      return buildMasterRenderSlide(session2);
    });
    ipcMain.handle("slides:master-edit-fill", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      const me = session2?.masterEdit;
      if (!session2 || !me) return null;
      const el = findEl(me.slide, op.sourceId);
      if (!el) return null;
      pushHistory(session2);
      if (typeof op.fill === "string") {
        el.fill = op.fill === "none" ? { type: "none" } : { type: "solid", color: op.fill };
      } else {
        const g = op.fill.gradient;
        el.fill = {
          type: "gradient",
          stops: [
            { pos: 0, color: g.from },
            { pos: 1, color: g.to }
          ],
          ...g.radial ? { path: "circle" } : { angle: Math.round((g.angleDeg ?? 0) * 6e4) }
        };
      }
      el.dirtyFill = true;
      commitMasterEdit(session2);
      return buildMasterRenderSlide(session2);
    });
    ipcMain.handle("slides:master-edit-stroke", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      const me = session2?.masterEdit;
      if (!session2 || !me) return null;
      const el = findEl(me.slide, op.sourceId);
      if (!el) return null;
      pushHistory(session2);
      el.stroke = op.stroke ? {
        fill: { type: "solid", color: op.stroke.color },
        width: Math.round(op.stroke.widthPt * EMU_PER_PT)
      } : void 0;
      el.dirtyStroke = true;
      commitMasterEdit(session2);
      return buildMasterRenderSlide(session2);
    });
    ipcMain.handle("slides:master-delete-element", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      const me = session2?.masterEdit;
      if (!session2 || !me) return null;
      if (!me.slide.elements.some((x) => x.id === op.sourceId)) return null;
      pushHistory(session2);
      if (!deleteElement(me.slide, op.sourceId)) {
        session2.undoStack.pop();
        return null;
      }
      commitMasterEdit(session2);
      return buildMasterRenderSlide(session2);
    });
    ipcMain.handle("slides:edit-picture-opacity", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return null;
      pushHistory(session2);
      if (!setPictureOpacity(slide, op.sourceId, op.opacity)) {
        session2.undoStack.pop();
        return null;
      }
      return rebuildSlide(session2, op.slideIndex);
    });
    ipcMain.handle("slides:set-slide-size", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      pushHistory(session2);
      if (!setSlideSize(session2.opened, op.cx, op.cy)) {
        session2.undoStack.pop();
        return null;
      }
      session2.metaDirty = true;
      return buildAllRenderSlides(session2.opened, session2.fitWidthPx);
    });
    ipcMain.handle("slides:get-slide-size", (e) => {
      const session2 = sessions.get(e.sender.id);
      return session2 ? { ...session2.opened.deck.size } : null;
    });
    ipcMain.handle("slides:set-slide-layout", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      pushHistory(session2);
      const layoutPath = resolveLayoutPath(session2, op.layoutPath);
      const r = layoutPath ? setSlideLayout(session2.opened, op.slideIndex, layoutPath) : op.layoutPath ? null : resetSlideLayout(session2.opened, op.slideIndex);
      if (!r) {
        session2.undoStack.pop();
        return null;
      }
      return rebuildSlide(session2, op.slideIndex);
    });
    ipcMain.handle("slides:find-replace", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      pushHistory(session2);
      const { count } = replaceAllInDeck(session2.opened.deck, op.find, op.replace, {
        matchCase: op.matchCase,
        firstOnly: op.firstOnly,
        slideIndex: op.slideIndex,
        elementId: op.elementId
      });
      if (!count) {
        session2.undoStack.pop();
        return { count: 0, slides: null };
      }
      return { count, slides: buildAllRenderSlides(session2.opened, session2.fitWidthPx) };
    });
    ipcMain.handle("slides:delete-slide", (e, slideIndex) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      pushHistory(session2);
      if (!deleteSlide(session2.opened, slideIndex)) {
        session2.undoStack.pop();
        return null;
      }
      return buildAllRenderSlides(session2.opened, session2.fitWidthPx);
    });
    ipcMain.handle("slides:edit-table-cell", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return null;
      pushHistory(session2);
      if (!editTableCellText(slide, op.sourceId, op.row, op.col, op.paragraphs)) {
        session2.undoStack.pop();
        return null;
      }
      return rebuildSlide(session2, op.slideIndex);
    });
    ipcMain.handle("slides:table-merge", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      pushHistory(session2);
      const r = mergeTableCells(session2.opened, op.slideIndex, op.sourceId, {
        kind: op.kind,
        row: op.row,
        col: op.col
      });
      if (!r) {
        session2.undoStack.pop();
        return null;
      }
      const rebuilt = rebuildSlide(session2, op.slideIndex);
      return rebuilt ? { slide: rebuilt, sourceId: r.elementId } : null;
    });
    ipcMain.handle("slides:table-structure", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      pushHistory(session2);
      const r = editTableStructure(session2.opened, op.slideIndex, op.sourceId, {
        kind: op.kind,
        index: op.index,
        ...op.before ? { before: true } : {}
      });
      if (!r) {
        session2.undoStack.pop();
        return null;
      }
      const rebuilt = rebuildSlide(session2, op.slideIndex);
      return rebuilt ? { slide: rebuilt, sourceId: r.elementId } : null;
    });
    ipcMain.handle("slides:set-table-row-height", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return null;
      const baseWidthPx = session2.opened.deck.size.cx / EMU_PER_PX_96;
      const scale = op.fitWidthPx / baseWidthPx;
      pushHistory(session2);
      if (!setTableRowHeight(slide, op.sourceId, op.row, op.hPx / scale * EMU_PER_PX_96)) {
        session2.undoStack.pop();
        return null;
      }
      return rebuildSlide(session2, op.slideIndex);
    });
    ipcMain.handle("slides:set-table-cell-anchor", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return null;
      pushHistory(session2);
      if (!setTableCellAnchor(slide, op.sourceId, op.row, op.col, op.anchor)) {
        session2.undoStack.pop();
        return null;
      }
      return rebuildSlide(session2, op.slideIndex);
    });
    ipcMain.handle("slides:set-table-col-width", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return null;
      const baseWidthPx = session2.opened.deck.size.cx / EMU_PER_PX_96;
      const scale = op.fitWidthPx / baseWidthPx;
      pushHistory(session2);
      if (!setTableColWidth(slide, op.sourceId, op.col, op.wPx / scale * EMU_PER_PX_96)) {
        session2.undoStack.pop();
        return null;
      }
      return rebuildSlide(session2, op.slideIndex);
    });
    ipcMain.handle("slides:edit-table-style", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return null;
      const elIdx = slide.elements.findIndex((el) => el.id === op.sourceId);
      pushHistory(session2);
      let edit;
      if (op.styleName && TABLE_STYLE_PRESETS[op.styleName]) {
        const preset = TABLE_STYLE_PRESETS[op.styleName];
        if (preset.styleId && preset.styleDefXml) {
          ensureTableStylePart(session2.opened, preset.styleId, preset.styleDefXml);
        }
        edit = {
          tblPrXml: preset.tblPrXml,
          clearDirectFormatting: true,
          // Grid-style presets use direct borders (the style mechanism only has inner lines and cannot draw the outer frame)
          ...preset.border ? {
            borderPreset: "all",
            borderColor: preset.border.color,
            borderWidthEmu: preset.border.widthEmu
          } : {}
        };
      } else {
        const borderColor = op.borderColor ?? void 0;
        const borderWidthEmu = op.borderWidthPt != null ? Math.round(op.borderWidthPt * EMU_PER_PT) : void 0;
        edit = {
          ...op.firstRow !== void 0 ? { firstRow: op.firstRow } : {},
          ...op.bandRow !== void 0 ? { bandRow: op.bandRow } : {},
          ...op.shadingColor !== void 0 ? { shadingColor: op.shadingColor } : {},
          ...op.borderPreset !== void 0 ? { borderPreset: op.borderPreset } : {},
          ...borderColor !== void 0 ? { borderColor } : {},
          ...borderWidthEmu !== void 0 ? { borderWidthEmu } : {},
          ...op.cells ? { cells: op.cells } : {}
        };
      }
      if (!editTableStyle(slide, op.sourceId, edit)) {
        session2.undoStack.pop();
        return null;
      }
      const rebuilt = rebuildSlideWithReparse(session2, op.slideIndex);
      if (!rebuilt) return null;
      const newId = session2.opened.deck.slides[op.slideIndex]?.elements[elIdx]?.id ?? null;
      return { slide: rebuilt, sourceId: newId };
    });
    ipcMain.handle("slides:edit-chart", async (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return null;
      const elIdx = slide.elements.findIndex((el) => el.id === op.sourceId);
      const chartEl = slide.elements[elIdx];
      if (chartEl?.type === "chart" && chartEl.descr !== "aislides-chart") {
        const parent = dialogParent();
        const options = {
          type: "warning",
          buttons: [tm("chartSimplifyOk"), tm("btnCancel")],
          defaultId: 0,
          cancelId: 1,
          message: tm("chartSimplifyTitle"),
          detail: tm("chartSimplifyBody")
        };
        const r = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
        if (r.response !== 0) return null;
      }
      pushHistory(session2);
      markChartEditable(slide, op.sourceId);
      const patch = {
        ...op.kind ? { kind: op.kind === "barH" ? "bar" : op.kind } : {},
        ...op.kind === "barH" ? { barDir: "bar" } : {},
        ...op.categories ? { categories: op.categories } : {},
        ...op.series ? { series: op.series } : {},
        ...op.title !== void 0 ? { title: op.title } : {},
        ...op.colorScheme ? {
          colorScheme: chartColorSchemes(session2.opened).find((s) => s.key === op.colorScheme)?.colors ?? CHART_COLOR_SCHEMES[op.colorScheme]
        } : {},
        ...op.legendPos ? { legendPos: op.legendPos } : {},
        ...op.dataLabels !== void 0 ? { dataLabels: op.dataLabels } : {},
        ...op.gridlines !== void 0 ? { gridlines: op.gridlines } : {},
        ...op.catAxisTitle !== void 0 ? { catAxisTitle: op.catAxisTitle } : {},
        ...op.valAxisTitle !== void 0 ? { valAxisTitle: op.valAxisTitle } : {},
        ...op.gapWidthPct !== void 0 ? { gapWidthPct: op.gapWidthPct } : {},
        ...op.switchRowCol ? { switchRowCol: true } : {},
        ...op.pointColors ? { pointColors: op.pointColors } : {}
      };
      if (!editChartElement(session2.opened, op.slideIndex, op.sourceId, patch)) {
        session2.undoStack.pop();
        return null;
      }
      const rebuilt = rebuildSlideWithReparse(session2, op.slideIndex);
      if (!rebuilt) return null;
      const newId = session2.opened.deck.slides[op.slideIndex]?.elements[elIdx]?.id ?? null;
      return { slide: rebuilt, sourceId: newId };
    });
    ipcMain.handle("slides:chart-color-schemes", (e) => {
      const session2 = sessions.get(e.sender.id);
      return session2 ? chartColorSchemes(session2.opened) : null;
    });
    ipcMain.handle("slides:get-chart-data", (e, slideIndex, sourceId) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[slideIndex];
      if (!slide) return null;
      return getChartElementData(slide, sourceId);
    });
    ipcMain.handle("slides:reorder-element", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return null;
      pushHistory(session2);
      if (!reorderElement(slide, op.sourceId, op.dir)) {
        session2.undoStack.pop();
        return null;
      }
      return rebuildSlide(session2, op.slideIndex);
    });
    ipcMain.handle(
      "slides:set-text-anchor",
      (e, op) => {
        const session2 = sessions.get(e.sender.id);
        if (!session2) return null;
        const slide = session2.opened.deck.slides[op.slideIndex];
        if (!slide) return null;
        pushHistory(session2);
        if (!setElementTextAnchor(slide, op.sourceId, op.anchor)) {
          session2.undoStack.pop();
          return null;
        }
        return rebuildSlide(session2, op.slideIndex);
      }
    );
    ipcMain.handle("slides:clipboard-external", () => {
      const marker = (format) => {
        try {
          return clipboard.readBuffer(format).length > 0;
        } catch {
          return false;
        }
      };
      if (slideClipboard && marker("io.genoffice.slides.slide")) return { kind: "slide" };
      if (marker("io.genoffice.slides.elements")) return { kind: "internal" };
      const img = clipboard.readImage();
      if (!img.isEmpty()) return { kind: "image", base64: img.toPNG().toString("base64"), ext: "png" };
      const text = clipboard.readText();
      if (text.trim()) return { kind: "text", text };
      return { kind: "none" };
    });
    ipcMain.handle("slides:copy-elements", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return 0;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return 0;
      const items = op.sourceIds.map((id) => slide.elements.find((el) => el.id === id)).filter((el) => !!el).map((el) => copyElementData(session2.opened, slide, el));
      if (items.length) {
        clipboards.set(e.sender.id, { items, pasteCount: 0 });
        clipboard.writeBuffer("io.genoffice.slides.elements", Buffer.from("1"));
      }
      return items.length;
    });
    ipcMain.handle("slides:paste-elements", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      const clip = clipboards.get(e.sender.id);
      if (!session2 || !clip?.items.length) return null;
      if (!session2.opened.deck.slides[op.slideIndex]) return null;
      const baseWidthPx = session2.opened.deck.size.cx / EMU_PER_PX_96;
      const scale = op.fitWidthPx / baseWidthPx;
      const shift = Math.round(16 * (clip.pasteCount + 1) / scale * EMU_PER_PX_96);
      pushHistory(session2);
      const r = pasteElements(session2.opened, op.slideIndex, clip.items, { dx: shift, dy: shift });
      if (!r) {
        session2.undoStack.pop();
        return null;
      }
      clip.pasteCount++;
      session2.fitWidthPx = op.fitWidthPx;
      const rebuilt = rebuildSlide(session2, op.slideIndex);
      return rebuilt ? { slide: rebuilt, sourceIds: r.elementIds } : null;
    });
    ipcMain.handle("slides:duplicate-elements", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return null;
      const items = op.sourceIds.map((id) => slide.elements.find((el) => el.id === id)).filter((el) => !!el).map((el) => copyElementData(session2.opened, slide, el));
      if (!items.length) return null;
      const baseWidthPx = session2.opened.deck.size.cx / EMU_PER_PX_96;
      const scale = op.fitWidthPx / baseWidthPx;
      const toEmu = (px) => Math.round(px / scale * EMU_PER_PX_96);
      pushHistory(session2);
      const r = pasteElements(session2.opened, op.slideIndex, items, {
        dx: toEmu(op.dxPx),
        dy: toEmu(op.dyPx)
      });
      if (!r) {
        session2.undoStack.pop();
        return null;
      }
      session2.fitWidthPx = op.fitWidthPx;
      const rebuilt = rebuildSlide(session2, op.slideIndex);
      return rebuilt ? { slide: rebuilt, sourceIds: r.elementIds } : null;
    });
    ipcMain.handle("slides:add-table", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      if (!session2.opened.deck.slides[op.slideIndex]) return null;
      const baseWidthPx = session2.opened.deck.size.cx / EMU_PER_PX_96;
      const scale = op.fitWidthPx / baseWidthPx;
      const toEmu = (px) => Math.round(px / scale * EMU_PER_PX_96);
      pushHistory(session2);
      const r = addTable(session2.opened, op.slideIndex, {
        rows: op.rows,
        cols: op.cols,
        offset: { x: toEmu(op.xPx), y: toEmu(op.yPx), cx: toEmu(op.wPx), cy: toEmu(op.hPx) }
      });
      if (!r) {
        session2.undoStack.pop();
        return null;
      }
      session2.fitWidthPx = op.fitWidthPx;
      const rebuilt = rebuildSlide(session2, op.slideIndex);
      return rebuilt ? { slide: rebuilt, sourceId: r.elementId } : null;
    });
    ipcMain.handle("slides:add-ink", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return null;
      const baseWidthPx = session2.opened.deck.size.cx / EMU_PER_PX_96;
      const scale = op.fitWidthPx / baseWidthPx;
      const toEmu = (px) => Math.round(px / scale * EMU_PER_PX_96);
      pushHistory(session2);
      const el = addPicture(session2.opened, slide, {
        bytes: new Uint8Array(Buffer.from(op.base64, "base64")),
        ext: "png",
        offset: {
          x: toEmu(op.xPx),
          y: toEmu(op.yPx),
          cx: Math.max(1, toEmu(op.wPx)),
          cy: Math.max(1, toEmu(op.hPx))
        },
        name: `aislides-ink ${Date.now().toString(36)}`,
        descr: op.payload
      });
      if (!el) {
        session2.undoStack.pop();
        return null;
      }
      session2.fitWidthPx = op.fitWidthPx;
      const rebuilt = rebuildSlide(session2, op.slideIndex);
      return rebuilt ? { slide: rebuilt, sourceId: el.id } : null;
    });
    ipcMain.handle("slides:add-chart", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2 || !session2.opened.deck.slides[op.slideIndex]) return null;
      const baseWidthPx = session2.opened.deck.size.cx / EMU_PER_PX_96;
      const scale = op.fitWidthPx / baseWidthPx;
      const toEmu = (px) => Math.round(px / scale * EMU_PER_PX_96);
      pushHistory(session2);
      const r = addChart(session2.opened, op.slideIndex, {
        kind: op.kind === "barH" ? "bar" : op.kind,
        ...op.kind === "barH" ? { barDir: "bar" } : {},
        ...op.title ? { title: op.title } : {},
        categories: op.categories,
        series: op.series,
        offset: { x: toEmu(op.xPx), y: toEmu(op.yPx), cx: toEmu(op.wPx), cy: toEmu(op.hPx) }
      });
      if (!r) {
        session2.undoStack.pop();
        return null;
      }
      session2.fitWidthPx = op.fitWidthPx;
      const rebuilt = rebuildSlide(session2, op.slideIndex);
      return rebuilt ? { slide: rebuilt, sourceId: r.elementId } : null;
    });
    ipcMain.handle("slides:add-smartart", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2 || !session2.opened.deck.slides[op.slideIndex]) return null;
      const baseWidthPx = session2.opened.deck.size.cx / EMU_PER_PX_96;
      const scale = op.fitWidthPx / baseWidthPx;
      const toEmu = (px) => Math.round(px / scale * EMU_PER_PX_96);
      pushHistory(session2);
      const r = addSmartArt(session2.opened, op.slideIndex, {
        layout: op.layout,
        items: op.items,
        offset: { x: toEmu(op.xPx), y: toEmu(op.yPx), cx: toEmu(op.wPx), cy: toEmu(op.hPx) }
      });
      if (!r) {
        session2.undoStack.pop();
        return null;
      }
      session2.fitWidthPx = op.fitWidthPx;
      const rebuilt = rebuildSlide(session2, op.slideIndex);
      return rebuilt ? { slide: rebuilt, sourceId: r.elementId } : null;
    });
    ipcMain.handle("slides:add-image-bytes", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return null;
      const baseWidthPx = session2.opened.deck.size.cx / EMU_PER_PX_96;
      const scale = op.fitWidthPx / baseWidthPx;
      const toEmu = (px) => Math.round(px / scale * EMU_PER_PX_96);
      pushHistory(session2);
      const el = addPicture(session2.opened, slide, {
        bytes: new Uint8Array(Buffer.from(op.base64, "base64")),
        ext: op.ext,
        offset: {
          x: toEmu(op.xPx),
          y: toEmu(op.yPx),
          cx: Math.max(1, toEmu(op.wPx)),
          cy: Math.max(1, toEmu(op.hPx))
        },
        ...op.name ? { name: op.name } : {}
      });
      if (!el) {
        session2.undoStack.pop();
        return { error: "unsupported", ext: op.ext };
      }
      session2.fitWidthPx = op.fitWidthPx;
      const rebuilt = rebuildSlide(session2, op.slideIndex);
      return rebuilt ? { slide: rebuilt, sourceId: el.id } : null;
    });
    ipcMain.handle("slides:replace-picture-bytes", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return null;
      pushHistory(session2);
      const ok = replacePictureBytes(
        session2.opened,
        slide,
        op.sourceId,
        new Uint8Array(Buffer.from(op.base64, "base64")),
        op.ext,
        op.keepSrcRect ? { keepSrcRect: true } : void 0
      );
      if (!ok) {
        session2.undoStack.pop();
        return { error: "unsupported", ext: op.ext };
      }
      return rebuildSlide(session2, op.slideIndex);
    });
    ipcMain.handle(
      "slides:insert-media",
      async (e, slideIndex, kind, fitWidthPx) => {
        const session2 = sessions.get(e.sender.id);
        if (!session2 || !session2.opened.deck.slides[slideIndex]) return null;
        const parent = dialogParent();
        const filters = kind === "video" ? [{ name: tm("filterVideo"), extensions: ["mp4", "m4v", "mov", "webm", "avi"] }] : [{ name: tm("filterAudio"), extensions: ["mp3", "wav", "m4a", "aac", "ogg"] }];
        const options = {
          title: kind === "video" ? tm("dlgInsertVideo") : tm("dlgInsertAudio"),
          properties: ["openFile"],
          filters
        };
        const r = await showOpenDialogWithMemory(dialog, parent, options);
        if (r.canceled || !r.filePaths[0]) return null;
        const filePath = r.filePaths[0];
        const bytes = await readFile(filePath);
        const ext = filePath.split(".").pop().toLowerCase();
        const fileName = filePath.split("/").pop();
        if (kind === "video") {
          let detail = null;
          if (ext === "avi") detail = tm("mediaAviBody");
          else if (ext === "mp4" || ext === "m4v" || ext === "mov") {
            const codec = unplayableAudioCodec(new Uint8Array(bytes));
            if (codec) detail = tm("mediaNoAudioBody", { codec });
          }
          if (detail) {
            const warn = {
              type: "warning",
              buttons: [tm("legacyPptOk")],
              message: tm("mediaUnsupportedTitle"),
              detail
            };
            if (parent) await dialog.showMessageBox(parent, warn);
            else await dialog.showMessageBox(warn);
          }
        }
        let poster;
        if (kind === "video") {
          try {
            const thumb = await nativeImage.createThumbnailFromPath(filePath, {
              width: 960,
              height: 540
            });
            if (!thumb.isEmpty()) poster = { bytes: new Uint8Array(thumb.toPNG()), ext: "png" };
          } catch {
          }
        }
        const deckSize = session2.opened.deck.size;
        const offset = kind === "video" ? (() => {
          const cx = Math.round(deckSize.cx * 0.6);
          const cy = Math.round(cx * 9 / 16);
          return {
            x: Math.round((deckSize.cx - cx) / 2),
            y: Math.round((deckSize.cy - cy) / 2),
            cx,
            cy
          };
        })() : (() => {
          const cx = Math.round(deckSize.cx * 0.24);
          const cy = Math.round(deckSize.cy * 0.09);
          return {
            x: Math.round((deckSize.cx - cx) / 2),
            y: Math.round((deckSize.cy - cy) / 2),
            cx,
            cy
          };
        })();
        pushHistory(session2);
        const added = addMedia(session2.opened, slideIndex, {
          kind,
          bytes: new Uint8Array(bytes),
          ext,
          ...poster ? { poster } : {},
          offset,
          name: fileName
        });
        if (!added) {
          session2.undoStack.pop();
          return null;
        }
        session2.fitWidthPx = fitWidthPx;
        const rebuilt = rebuildSlide(session2, slideIndex);
        return rebuilt ? { slide: rebuilt, sourceId: added.elementId } : null;
      }
    );
    const AV_MIME = {
      mp4: "video/mp4",
      m4v: "video/mp4",
      // Chromium refuses to even load video/quicktime, but demuxes QuickTime bytes
      // fine through the ISO-BMFF path when served as video/mp4
      mov: "video/mp4",
      webm: "video/webm",
      avi: "video/x-msvideo",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      m4a: "audio/mp4",
      aac: "audio/aac",
      ogg: "audio/ogg"
    };
    ipcMain.handle("slides:media-data", (e, slideIndex, sourceId) => {
      const session2 = sessions.get(e.sender.id);
      const slide = session2?.opened.deck.slides[slideIndex];
      if (!session2 || !slide) return null;
      const el = slide.elements.find((x) => x.id === sourceId);
      if (!el || el.type !== "picture") return null;
      const media = el.media;
      if (!media?.target) return null;
      if (media.external) return { kind: media.kind, dataUrl: media.target };
      const bytes = session2.opened.archive.readBytes(media.target);
      if (!bytes) return null;
      const ext = media.target.split(".").pop()?.toLowerCase() ?? "";
      const mime = AV_MIME[ext] ?? (media.kind === "video" ? "video/mp4" : "audio/mpeg");
      return {
        kind: media.kind,
        dataUrl: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`
      };
    });
    ipcMain.handle("slides:add-media-bytes", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2 || !session2.opened.deck.slides[op.slideIndex]) return null;
      const deckSize = session2.opened.deck.size;
      const cx = Math.round(deckSize.cx * 0.6);
      const cy = Math.round(cx * 9 / 16);
      pushHistory(session2);
      const added = addMedia(session2.opened, op.slideIndex, {
        kind: op.kind,
        bytes: new Uint8Array(Buffer.from(op.base64, "base64")),
        ext: op.ext,
        offset: {
          x: Math.round((deckSize.cx - cx) / 2),
          y: Math.round((deckSize.cy - cy) / 2),
          cx,
          cy
        },
        ...op.name ? { name: op.name } : {}
      });
      if (!added) {
        session2.undoStack.pop();
        return null;
      }
      session2.fitWidthPx = op.fitWidthPx;
      const rebuilt = rebuildSlide(session2, op.slideIndex);
      return rebuilt ? { slide: rebuilt, sourceId: added.elementId } : null;
    });
    ipcMain.handle("slides:insert-model3d", async (e, slideIndex, fitWidthPx) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2 || !session2.opened.deck.slides[slideIndex]) return null;
      const parent = dialogParent();
      const options = {
        title: tm("dlgInsert3d"),
        properties: ["openFile"],
        filters: [{ name: tm("filter3d"), extensions: ["glb", "gltf"] }]
      };
      const r = await showOpenDialogWithMemory(dialog, parent, options);
      if (r.canceled || !r.filePaths[0]) return null;
      const filePath = r.filePaths[0];
      const bytes = await readFile(filePath);
      const ext = filePath.split(".").pop().toLowerCase();
      let poster;
      try {
        const thumb = await nativeImage.createThumbnailFromPath(filePath, { width: 640, height: 640 });
        if (!thumb.isEmpty()) poster = { bytes: new Uint8Array(thumb.toPNG()), ext: "png" };
      } catch {
      }
      const deckSize = session2.opened.deck.size;
      const cy = Math.round(deckSize.cy * 0.5);
      const cx = cy;
      pushHistory(session2);
      const added = addModel3d(session2.opened, slideIndex, {
        bytes: new Uint8Array(bytes),
        ext,
        ...poster ? { poster } : {},
        offset: {
          x: Math.round((deckSize.cx - cx) / 2),
          y: Math.round((deckSize.cy - cy) / 2),
          cx,
          cy
        },
        name: filePath.split("/").pop()
      });
      if (!added) {
        session2.undoStack.pop();
        return null;
      }
      session2.fitWidthPx = fitWidthPx;
      const rebuilt = rebuildSlide(session2, slideIndex);
      return rebuilt ? { slide: rebuilt, sourceId: added.elementId } : null;
    });
    ipcMain.handle("slides:set-link", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2 || !session2.opened.deck.slides[op.slideIndex]) return null;
      pushHistory(session2);
      const fresh = setElementLink(session2.opened, op.slideIndex, op.sourceId, op.target);
      if (!fresh) {
        session2.undoStack.pop();
        return null;
      }
      return rebuildSlide(session2, op.slideIndex);
    });
    ipcMain.handle("slides:get-link", (e, slideIndex, sourceId) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      return getElementLink(session2.opened, slideIndex, sourceId);
    });
    ipcMain.handle("slides:get-slide-links", (e, slideIndex) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return [];
      return getSlideLinks(session2.opened, slideIndex).map(({ elementId, target }) => ({
        sourceId: elementId,
        target
      }));
    });
    ipcMain.handle("slides:get-run-links", (e, slideIndex) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return [];
      return getRunLinks(session2.opened, slideIndex).map(({ elementId, ...rest }) => ({
        sourceId: elementId,
        ...rest
      }));
    });
    ipcMain.handle("slides:apply-header-footer", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      pushHistory(session2);
      const changed = applyHeaderFooter(session2.opened, {
        footer: op.footer ?? null,
        slideNum: !!op.slideNum,
        date: op.date ?? null,
        ...op.dateAuto ? { dateAuto: true } : {}
      });
      if (!changed) {
        session2.undoStack.pop();
        return null;
      }
      session2.fitWidthPx = op.fitWidthPx;
      return buildAllRenderSlides(session2.opened, op.fitWidthPx);
    });
    ipcMain.handle("slides:get-header-footer", (e, slideIndex) => {
      const session2 = sessions.get(e.sender.id);
      const slide = session2?.opened.deck.slides[slideIndex];
      return slide ? readHeaderFooter(slide) : { footer: null, slideNum: false, date: null };
    });
    ipcMain.handle("slides:apply-theme", async (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      pushHistory(session2);
      const spec = {
        name: op.name,
        colors: op.colors,
        ...op.majorFont ? { majorFont: op.majorFont } : {},
        ...op.minorFont ? { minorFont: op.minorFont } : {}
      };
      try {
        commitSaved(session2.opened);
        const patched = applyThemeToArchive(session2.opened, spec);
        const remapped = remapDeckColors(session2.opened, spec);
        if (patched === 0 && remapped === 0) {
          session2.undoStack.pop();
          return null;
        }
        session2.opened = reparseDeck(session2.opened);
      } catch (err) {
        restoreSnapshot(session2, session2.undoStack.pop());
        return { error: err instanceof Error ? err.message : String(err) };
      }
      const lt1 = op.colors.lt1;
      if (lt1) {
        for (const s of session2.opened.deck.slides) {
          if (!s.background) setSlideBackground(s, `#${lt1.replace(/^#/, "")}`);
        }
      }
      session2.metaDirty = true;
      session2.fitWidthPx = op.fitWidthPx;
      return buildAllRenderSlides(session2.opened, op.fitWidthPx);
    });
    ipcMain.handle("slides:set-transition", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return false;
      const slides = session2.opened.deck.slides;
      const targets = op.slideIndex === -1 ? slides : [slides[op.slideIndex]].filter(Boolean);
      if (targets.length === 0) return false;
      pushHistory(session2);
      for (const s of targets) setSlideTransition(s, op.kind);
      return true;
    });
    ipcMain.handle("slides:get-transition", (e, slideIndex) => {
      const session2 = sessions.get(e.sender.id);
      const slide = session2?.opened.deck.slides[slideIndex];
      return slide ? getSlideTransition(slide) : "none";
    });
    ipcMain.handle("slides:set-advance-times", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return false;
      const slides = session2.opened.deck.slides;
      const targets = op.times.filter((t) => slides[t.slideIndex]);
      if (targets.length === 0) return false;
      pushHistory(session2);
      for (const t of targets) setSlideAdvanceTime(slides[t.slideIndex], t.ms);
      return true;
    });
    ipcMain.handle("slides:get-animations", (e, slideIndex) => {
      const session2 = sessions.get(e.sender.id);
      const slide = session2?.opened.deck.slides[slideIndex];
      if (!slide) return [];
      const bySpid = /* @__PURE__ */ new Map();
      for (const el of slide.elements) {
        const spid = elementSpid(el);
        if (spid != null && !bySpid.has(spid)) bySpid.set(spid, el);
      }
      const typeLabel = {
        text: tm("labelTextBox"),
        shape: tm("labelShape"),
        picture: tm("labelPicture"),
        group: tm("labelGroup"),
        table: tm("labelTable"),
        chart: tm("labelChart"),
        passthrough: tm("labelObject")
      };
      const out = [];
      for (const a of getSlideAnimations(slide)) {
        const el = bySpid.get(a.spid);
        if (!el) continue;
        out.push({
          sourceId: el.id,
          targetName: el.name || typeLabel[el.type] || tm("labelObject"),
          effect: a.effect,
          trigger: a.trigger,
          durationMs: a.durationMs,
          delayMs: a.delayMs,
          ...a.motionPath != null ? { motionPath: a.motionPath } : {},
          ...a.paragraph != null ? { paragraph: a.paragraph } : {}
        });
      }
      return out;
    });
    ipcMain.handle("slides:get-shape-keys", (e, slideIndex) => {
      const session2 = sessions.get(e.sender.id);
      const slide = session2?.opened.deck.slides[slideIndex];
      if (!slide) return [];
      return slide.elements.map((el) => ({
        sourceId: el.id,
        spid: elementSpid(el),
        name: el.name ?? ""
      }));
    });
    ipcMain.handle("slides:set-animations", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      const slide = session2?.opened.deck.slides[op.slideIndex];
      if (!session2 || !slide) return false;
      const anims = [];
      for (const it of op.items) {
        const el = slide.elements.find((x) => x.id === it.sourceId);
        const spid = el ? elementSpid(el) : null;
        if (spid == null) continue;
        anims.push({
          spid,
          effect: it.effect,
          trigger: it.trigger,
          durationMs: Math.max(0, Math.round(it.durationMs)),
          delayMs: Math.max(0, Math.round(it.delayMs)),
          ...it.motionPath != null ? { motionPath: it.motionPath } : {},
          ...it.paragraph != null ? { paragraph: it.paragraph } : {}
        });
      }
      pushHistory(session2);
      setSlideAnimations(slide, anims);
      return true;
    });
    ipcMain.handle("slides:set-hidden", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const slide = session2.opened.deck.slides[op.slideIndex];
      if (!slide) return null;
      pushHistory(session2);
      setSlideHidden(slide, op.hidden);
      return rebuildSlide(session2, op.slideIndex);
    });
    ipcMain.handle("slides:get-sections", (e) => {
      const session2 = sessions.get(e.sender.id);
      return session2 ? getSections(session2.opened) : [];
    });
    ipcMain.handle("slides:set-sections", (e, sections) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      pushHistory(session2);
      setSections(session2.opened, sections);
      session2.metaDirty = true;
      return getSections(session2.opened);
    });
    ipcMain.handle("slides:add-section", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      pushHistory(session2);
      const r = addSection(session2.opened, op.atSlideIndex, op.name);
      if (!r) {
        session2.undoStack.pop();
        return null;
      }
      session2.metaDirty = true;
      return r;
    });
    ipcMain.handle("slides:rename-section", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      pushHistory(session2);
      const r = renameSection(session2.opened, op.id, op.name);
      if (!r) {
        session2.undoStack.pop();
        return null;
      }
      session2.metaDirty = true;
      return r;
    });
    ipcMain.handle("slides:remove-section", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      pushHistory(session2);
      const r = removeSection(session2.opened, op.id, { keepSlides: true });
      if (!r) {
        session2.undoStack.pop();
        return null;
      }
      session2.metaDirty = true;
      return r;
    });
    ipcMain.handle("slides:move-slide", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      pushHistory(session2);
      if (!moveSlide(session2.opened, op.fromIndex, op.toIndex)) {
        session2.undoStack.pop();
        return null;
      }
      session2.metaDirty = true;
      return {
        slides: buildAllRenderSlides(session2.opened, session2.fitWidthPx),
        sections: getSections(session2.opened)
      };
    });
    ipcMain.handle("slides:move-section", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      pushHistory(session2);
      const sections = moveSection(session2.opened, op.id, op.dir);
      if (!sections) {
        session2.undoStack.pop();
        return null;
      }
      session2.metaDirty = true;
      return {
        slides: buildAllRenderSlides(session2.opened, session2.fitWidthPx),
        sections
      };
    });
    ipcMain.handle("slides:get-notes", (e, slideIndex) => {
      const session2 = sessions.get(e.sender.id);
      const slide = session2?.opened.deck.slides[slideIndex];
      return session2 && slide ? getSlideNotes(session2.opened.archive, slide.path) : "";
    });
    ipcMain.handle("slides:set-notes", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2 || !session2.opened.deck.slides[op.slideIndex]) return false;
      pushHistory(session2);
      const ok = setSlideNotes(session2.opened, op.slideIndex, op.text);
      if (!ok) session2.undoStack.pop();
      else session2.metaDirty = true;
      return ok;
    });
    ipcMain.handle("slides:get-comments", (e, slideIndex) => {
      const session2 = sessions.get(e.sender.id);
      const slide = session2?.opened.deck.slides[slideIndex];
      return session2 && slide ? getSlideComments(session2.opened.archive, slide.path) : [];
    });
    ipcMain.handle("slides:add-comment", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      const slide = session2?.opened.deck.slides[op.slideIndex];
      if (!session2 || !slide) return null;
      pushHistory(session2);
      const author = commentAuthorName();
      const added = addSlideComment(session2.opened, op.slideIndex, { author, text: op.text });
      if (!added) {
        session2.undoStack.pop();
        return null;
      }
      session2.metaDirty = true;
      return getSlideComments(session2.opened.archive, slide.path);
    });
    ipcMain.handle("slides:delete-comment", (e, op) => {
      const session2 = sessions.get(e.sender.id);
      const slide = session2?.opened.deck.slides[op.slideIndex];
      if (!session2 || !slide) return null;
      pushHistory(session2);
      if (!deleteSlideComment(session2.opened, op.slideIndex, { authorId: op.authorId, idx: op.idx })) {
        session2.undoStack.pop();
        return null;
      }
      session2.metaDirty = true;
      return getSlideComments(session2.opened.archive, slide.path);
    });
    ipcMain.handle("slides:native-clipboard", (e, op) => {
      if (op === "cut") e.sender.cut();
      else if (op === "copy") e.sender.copy();
      else e.sender.paste();
    });
    ipcMain.handle("slides:history-batch-begin", (e) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return false;
      beginHistoryBatch(session2);
      return true;
    });
    ipcMain.handle("slides:history-batch-end", (e) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return null;
      const before = endHistoryBatch(session2);
      return before ? registerAiSnapshot(session2, before) : null;
    });
    ipcMain.handle("slides:ai-snapshot-restore", (e, id) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2 || session2.masterEdit || session2.historyBatch) return null;
      if (!restoreAiSnapshot(session2, id)) return null;
      return buildAllRenderSlides(session2.opened, session2.fitWidthPx);
    });
    ipcMain.handle("slides:undo", (e) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2 || session2.masterEdit) return null;
      settleStaleHistoryBatch(session2);
      if (session2.undoStack.length === 0) return null;
      session2.redoStack.push(takeSnapshot(session2));
      restoreSnapshot(session2, session2.undoStack.pop());
      scheduleHistoryNotify(session2);
      return buildAllRenderSlides(session2.opened, session2.fitWidthPx);
    });
    ipcMain.handle("slides:redo", (e) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2 || session2.masterEdit) return null;
      settleStaleHistoryBatch(session2);
      if (session2.redoStack.length === 0) return null;
      session2.undoStack.push(takeSnapshot(session2));
      restoreSnapshot(session2, session2.redoStack.pop());
      scheduleHistoryNotify(session2);
      return buildAllRenderSlides(session2.opened, session2.fitWidthPx);
    });
    ipcMain.handle("slides:is-dirty", (e) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return false;
      return !!session2.metaDirty || session2.opened.deck.slides.some(
        (s) => s.structureDirty || s.elements.some((el) => el.dirty || el.dirtyTransform)
      );
    });
    ipcMain.handle("slides:save", async (e) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return { ok: false, error: "no file open" };
      if (!session2.path) {
        const draftsDir = getDraftsDir();
        if (!existsSync(draftsDir)) mkdirSync(draftsDir, { recursive: true });
        session2.path = pickDraftPath(draftsDir, tm("untitledDeck"));
        await pushRecent(session2.path);
        slidesOpenedHook?.(e.sender, session2.path);
      }
      try {
        await saveBytesToDisk(session2.opened, session2.path);
        autosaveBackoff.delete(session2.path);
        void rm(autosavePathFor(session2.path), { force: true }).catch(() => {
        });
        dropUntitledRecovery(e.sender.id);
        commitSaved(session2.opened);
        session2.metaDirty = false;
        return {
          ok: true,
          path: session2.path,
          slides: buildAllRenderSlides(session2.opened, session2.fitWidthPx)
        };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    });
    ipcMain.handle("slides:save-as", async (e, defaultName) => {
      const session2 = sessions.get(e.sender.id);
      if (!session2) return { ok: false, error: "no file open" };
      const parent = dialogParent();
      const options = {
        defaultPath: defaultName,
        filters: [{ name: "PowerPoint", extensions: ["pptx"] }]
      };
      const r = await showSaveDialogWithMemory(dialog, parent, options, getDraftsDir());
      if (r.canceled || !r.filePath) return { ok: false };
      try {
        await saveBytesToDisk(session2.opened, r.filePath);
        session2.path = r.filePath;
        autosaveBackoff.delete(r.filePath);
        dropUntitledRecovery(e.sender.id);
        await pushRecent(r.filePath);
        slidesOpenedHook?.(e.sender, r.filePath);
        commitSaved(session2.opened);
        session2.metaDirty = false;
        return {
          ok: true,
          path: r.filePath,
          slides: buildAllRenderSlides(session2.opened, session2.fitWidthPx)
        };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    });
    ipcMain.handle("slides:pick-export-dir", async () => {
      const parent = dialogParent();
      const options = {
        title: tm("dlgPickExportDir"),
        buttonLabel: tm("btnExport"),
        properties: ["openDirectory", "createDirectory"]
      };
      const r = await showOpenDialogWithMemory(dialog, parent, options);
      return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
    });
    ipcMain.handle(
      "slides:export-images",
      async (_e, op) => {
        try {
          const pad = op.pngsBase64.length >= 100 ? 3 : 2;
          const paths = [];
          for (let i = 0; i < op.pngsBase64.length; i++) {
            const p = join(op.dir, `${op.baseName}-${String(i + 1).padStart(pad, "0")}.png`);
            await writeFile(p, Buffer.from(op.pngsBase64[i], "base64"));
            paths.push(p);
          }
          return { ok: true, paths };
        } catch (err) {
          return { ok: false, error: String(err) };
        }
      }
    );
    ipcMain.handle("slides:pick-export-pdf-path", async (_e, defaultName) => {
      const parent = dialogParent();
      const options = {
        title: tm("dlgExportPdf"),
        defaultPath: defaultName,
        filters: [{ name: "PDF", extensions: ["pdf"] }]
      };
      const r = await showSaveDialogWithMemory(dialog, parent, options, getDraftsDir());
      return r.canceled || !r.filePath ? null : r.filePath;
    });
    ipcMain.handle("slides:export-pdf", async (_e, op) => {
      const heightIn = 7.5;
      const widthIn = Math.round(op.widthPx / op.heightPx * heightIn * 1e3) / 1e3;
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: ${widthIn}in ${heightIn}in; margin: 0; }
html, body { margin: 0; padding: 0; }
.page { width: ${widthIn}in; height: ${heightIn}in; overflow: hidden; page-break-after: always; }
.page:last-child { page-break-after: auto; }
.page img { display: block; width: 100%; height: 100%; }
</style></head><body>${op.pngsBase64.map((b64) => `<div class="page"><img src="data:image/png;base64,${b64}"></div>`).join("")}</body></html>`;
      const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
      try {
        await win.loadURL("data:text/html;base64," + Buffer.from(html, "utf8").toString("base64"));
        await win.webContents.executeJavaScript(
          "Promise.all([document.fonts.ready, ...Array.from(document.images).map((i) => i.decode().catch(() => {}))])",
          true
        );
        const pdf = await win.webContents.printToPDF({
          landscape: false,
          // The page size is already landscape (width > height); passing landscape would rotate a second time
          printBackground: true,
          pageSize: { width: widthIn, height: heightIn },
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
          preferCSSPageSize: false
        });
        await writeFile(op.filePath, pdf);
        return { ok: true, path: op.filePath };
      } catch (err) {
        return { ok: false, error: String(err) };
      } finally {
        win.destroy();
      }
    });
    ipcMain.handle(
      "slides:print",
      async (e, op) => {
        const html = buildPrintDocumentHtml({
          srcs: op.pngsBase64.map((b64) => `data:image/png;base64,${b64}`),
          ratio: op.widthPx / op.heightPx,
          layout: op.layout ?? "full",
          ...op.notes ? { notes: op.notes } : {},
          ...op.orientation ? { orientation: op.orientation } : {},
          ...op.frame ? { frame: true } : {}
        });
        const owner = BrowserWindow.fromWebContents(e.sender) ?? dialogParent();
        const win = new BrowserWindow({
          show: false,
          ...owner && !owner.isDestroyed() ? { parent: owner } : {},
          ...process.platform === "win32" ? {
            width: 900,
            height: 700,
            autoHideMenuBar: true,
            closable: false,
            skipTaskbar: true
          } : {},
          webPreferences: { sandbox: true }
        });
        try {
          await win.loadURL("data:text/html;base64," + Buffer.from(html, "utf8").toString("base64"));
          await win.webContents.executeJavaScript(
            "Promise.all([document.fonts.ready, ...Array.from(document.images).map((i) => i.decode().catch(() => {}))])",
            true
          );
          if (process.platform === "win32") {
            win.show();
            win.focus();
          }
          const result = await new Promise((resolve2) => {
            win.webContents.print(
              { silent: false, printBackground: true },
              (success, failureReason) => resolve2({ success, failureReason })
            );
          });
          if (!result.success) {
            if (result.failureReason === "Print job canceled") return { ok: false };
            return { ok: false, error: result.failureReason };
          }
          return { ok: true };
        } catch (err) {
          return { ok: false, error: String(err) };
        } finally {
          if (!win.isDestroyed()) win.destroy();
        }
      }
    );
    ipcMain.handle("slides:recent", () => readRecent());
    let showFsRelease = null;
    ipcMain.handle("slides:show-fullscreen", (e, on) => {
      const win = BrowserWindow.fromWebContents(e.sender) ?? windowRefs.shellWindow;
      if (!win || win.isDestroyed()) return;
      const wc = e.sender;
      if (showFsRelease) {
        clearTimeout(showFsRelease);
        showFsRelease = null;
      }
      if (on) {
        showChrome.setBleed?.(wc, true);
        if (process.platform === "darwin" && !win.isFullScreen()) {
          win.setFullScreenable(false);
          if (!win.isSimpleFullScreen()) win.setSimpleFullScreen(true);
        }
        wc.focus();
        setTimeout(() => {
          if (!wc.isDestroyed()) wc.focus();
        }, 50);
      } else {
        showFsRelease = setTimeout(() => {
          showFsRelease = null;
          if (!wc.isDestroyed()) showChrome.setBleed?.(wc, false);
          if (win.isDestroyed()) return;
          if (process.platform === "darwin") {
            if (win.isSimpleFullScreen()) win.setSimpleFullScreen(false);
            win.setFullScreenable(true);
          }
        }, 150);
      }
    });
    registerAttachmentIpc();
    registerPresenterIpc();
    registerSlidesOnlyAiIpc();
  }
  var vibFlip = /* @__PURE__ */ new Map();

  // browser/slides-api-bridge.ts
  var WC = new WebContents();
  function installSlidesApiBridge(opts) {
    registerSlidesIpc();
    setSaveBytesHook(async (bytes, path) => {
      try {
        const b64 = bytesToBase64(bytes);
        const name = path.split(/[\\/]/).pop() || "document.pptx";
        const resp = await fetch("/api/office/save?api_key=" + (opts.apiKey || "dev-key-001"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "pptx", name, content: b64 })
        });
        const r = await resp.json();
        return r.ok ? { ok: true } : { ok: false, error: r.error || "\u4FDD\u5B58\u5931\u8D25" };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });
    return {
      setPendingBytes,
      call: async (channel, ...args) => {
        const fn = handlers[channel];
        if (!fn) throw new Error("\u672A\u77E5 channel: " + channel);
        return fn({ sender: WC }, ...args);
      }
    };
  }
  function bytesToBase64(bytes) {
    const chunks = [];
    const CH = 32768;
    for (let i = 0; i < bytes.length; i += CH) {
      chunks.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH))));
    }
    return btoa(chunks.join(""));
  }
  window.__slidesApiBridge = true;
})();
/*! Bundled license information:

jszip/dist/jszip.min.js:
  (*!
  
  JSZip v3.10.1 - A JavaScript class for generating and reading zip files
  <http://stuartk.com/jszip>
  
  (c) 2009-2016 Stuart Knightley <stuart [at] stuartk.com>
  Dual licenced under the MIT license or GPLv3. See https://raw.github.com/Stuk/jszip/main/LICENSE.markdown.
  
  JSZip uses the library pako released under the MIT license :
  https://github.com/nodeca/pako/blob/main/LICENSE
  *)
*/
