const vm = function (A, Q, B) {
    'use strict';

    var stack_pointer = 4593
    var instruction_pointer = 4635
    var frame_base_pointer = 4674
    var last_result = 4633
    var exit_flag = 4656
    var current_opcode_handler = 4685
    var current_opcode_id = 4675
    var stack_offset = 124482
    var vm_start = 5258

    function E(A) {
        E = typeof Symbol == 'function' && typeof Symbol.iterator == 'symbol' ? function (A) {
            return typeof A;
        } : function (A) {
            if (A && typeof Symbol == 'function' && A.constructor === Symbol && A !== Symbol.prototype) {
                return 'symbol';
            } else {
                return typeof A;
            }
        };
        return E(A);
    }

    function prng() {
        var A = 29715775;
        var Q = 0;
        return function () {
            if (!(Q++ & 3)) {
                A ^= A << 13;
                A ^= A >> 17;
                A ^= A << 5;
            }
            return (A >> ((Q & 3) << 3)) % 256;
        };
    }

    function getValue(A) {
        var Q = A();
        if (Q & 128) {
            return Q & 127;
        }
        var B = 0;
        var E = 24;
        switch (Q) {
            case 40:
                return true;
            case 125:
                return false;
            case 76:
                return null;
            case 61:
                return;
            case 103:
                for (var e, D = '', g = 183; e = A() ^ g++ & 255;) {
                    D += String.fromCharCode(e);
                }
                return D;
            case 39:
                var a = 46;
                return function (A) {
                    for (var Q, B = [], E = 0; Q = A();) {
                        if (Q < 128) {
                            B[E++] = String.fromCharCode(Q);
                        } else if (Q > 191 && Q < 224) {
                            var e = A();
                            B[E++] = String.fromCharCode((Q & 31) << 6 | e & 63);
                        } else if (Q > 239 && Q < 365) {
                            var D = ((Q & 7) << 18 | ((e = A()) & 63) << 12 | ((g = A()) & 63) << 6 | A() & 63) - 65536;
                            B[E++] = String.fromCharCode(55296 + (D >> 10));
                            B[E++] = String.fromCharCode(56320 + (D & 1023));
                        } else {
                            e = A();
                            var g = A();
                            B[E++] = String.fromCharCode((Q & 15) << 12 | (e & 63) << 6 | g & 63);
                        }
                    }
                    return B.join('');
                }(function () {
                    return A() ^ a++ & 255;
                });
            case 5:
                return function (A) {
                    var Q = Array.from({length: 8}, A);
                    var B = -(Q[0] >> 7) || 1;
                    var E = (Q[0] & 127) << 4 | Q[1] >> 4 & 15;
                    if (E == 2047) {
                        if (Q[7] & 1) {
                            return NaN;
                        } else {
                            return B * Infinity;
                        }
                    }
                    var e = 1;
                    for (var D = 0; D <= 52; D++) {
                        var g = D + 12;
                        var a = 7 - (g & 7);
                        e += (Q[Math.floor(g / 8)] >> a & 1) / Math.pow(2, D + 1);
                    }
                    var h = E - 1023;
                    return B * e * Math.pow(2, h);
                }(A);
            case 84:
                B |= A() << 24;
                E -= 8;
            case 101:
                B |= A() << 16;
                E -= 8;
            case 97:
                B |= A() << 8;
                E -= 8;
            case 111:
                return (B |= A()) << E >> E;
        }
    }

    Q.exports = function () {
        return function (A) {
            var Q = performance.now();
            var B = 0;
            var e = {};
            try {
                var D = function (A) {

                    var B = prng();
                    return Array.from({length: 129263}, function (Q, E) {
                        if (E >= vm_start && E < vm_start + 119224) {
                            return A.charCodeAt(E - vm_start);
                        } else {
                            return B();
                        }
                    });
                }(atob(A));
                (function (A, Q) {
                    function readUint16() {
                        var Q = A[instruction_pointer];
                        var B = A[vm_start + Q];
                        var E = A[vm_start + Q + 1];
                        A[instruction_pointer] = Q + 2;
                        return B << 8 | E;
                    }

                    function readUint8() {
                        return A[vm_start + A[instruction_pointer]++];
                    }

                    function register2stack(Q) {
                        A[A[stack_pointer]++] = A[stack_offset + Q];
                    }

                    function stack2register(Q) {
                        A[stack_offset + Q] = A[A[stack_pointer] - 1];
                    }

                    function getVal() {
                        return getValue(function () {
                            return A[vm_start + A[instruction_pointer]++];
                        });
                    }

                    function storeToLastResult() {
                        A[last_result] = A[--A[stack_pointer]]; // POP
                    }

                    function GET() { // (obj, key) → (obj[key])
                        var Q = A[--A[stack_pointer]]; // POP
                        var B = A[A[stack_pointer] - 1];
                        A[A[stack_pointer] - 1] = B[Q];
                    }

                    function SET() { // (obj, key, value) → (obj), performs key[value] = obj
                        var Q = A[--A[stack_pointer]]; // POP
                        A[--A[stack_pointer]][Q] = A[A[stack_pointer] - 1];
                    }

                    function fetch() {
                        var Q = A[instruction_pointer];
                        var B = A[vm_start + Q];
                        A[instruction_pointer] = Q + 1;
                        var E = A[4783 + B];
                        A[current_opcode_handler] = E;
                        A[current_opcode_id] = B;
                    }

                    A[stack_pointer] = stack_offset;
                    A[frame_base_pointer] = stack_offset;
                    A[instruction_pointer] = 0;
                    A[4639] = 0;
                    A[exit_flag] = 0;
                    A[last_result] = undefined;

                    //opcodes
                    A[4919] = function () {
                        var Q = readUint8();
                        var B = [];
                        for (var E = readUint8(), D = 0; D < E; D++) {
                            var g = readUint8();
                            var a = A[A[frame_base_pointer] + g];
                            B.push(a);
                        }
                        var h = A[instruction_pointer] + 3;
                        A[A[stack_pointer]++] = function (E) {
                            var e = A[stack_pointer] - E;
                            while (E < Q) {
                                A[e + E++] = undefined;
                            }
                            A[stack_pointer] = e + Q;
                            for (var D = 0; D < B.length; D++) {
                                var g = B[D];
                                A[A[stack_pointer]++] = g;
                            }
                            A[e - 2] = A[frame_base_pointer];
                            A[e - 1] = A[instruction_pointer];
                            A[frame_base_pointer] = e;
                            A[instruction_pointer] = h;
                        };
                        fetch();
                    };
                    A[4791] = function () {
                        var Q = --A[stack_pointer];
                        A[Q - 1] = A[Q - 1] in A[Q];
                        fetch();
                    };
                    A[5006] = function () {
                        var Q = --A[stack_pointer];
                        A[Q - 1] = A[Q - 1] === A[Q];
                        fetch();
                    };
                    A[4951] = function () {
                        var Q = readUint16();
                        var E = readUint16();
                        var e = readUint16();
                        var D = A[stack_offset + Q];
                        var g = A[stack_offset + E];
                        A[stack_offset + e] = D[g];
                        fetch();
                    };
                    A[4859] = function () {
                        var Q = --A[stack_pointer];
                        A[Q - 1] %= A[Q];
                        fetch();
                    };
                    A[4843] = function () {
                        var Q = A[stack_pointer];
                        var B = A[--Q];
                        var E = A[--Q] & B;
                        var e = A[Q - 1];
                        A[Q - 1] = e[E];
                        A[stack_pointer] = Q;
                        fetch();
                    };
                    A[4862] = function () {
                        var A = readUint16();
                        var Q = readUint16();
                        var E = readUint16();
                        GET();
                        stack2register(A);
                        storeToLastResult();
                        register2stack(Q);
                        register2stack(E);
                        fetch();
                    };
                    A[4904] = function () {
                        stack2register(readUint16());
                        fetch();
                    };
                    A[4886] = function () {
                        var Q = --A[stack_pointer];
                        A[Q - 1] /= A[Q];
                        fetch();
                    };
                    A[4911] = function () {
                        var Q = --A[stack_pointer];
                        A[Q - 1] <<= A[Q];
                        fetch();
                    };
                    A[4801] = function () {
                        var Q = getVal();
                        var B = A[stack_pointer];
                        var E = A[B - 1];
                        A[B - 1] = E[Q];
                        fetch();
                    };
                    A[4965] = function () {
                        var Q = A[stack_pointer];
                        A[Q - 1] = void A[Q - 1];
                        fetch();
                    };
                    A[4887] = function () {
                        var Q = readUint16();
                        var E = getVal();
                        var e = A[stack_offset + Q];
                        var D = A[stack_pointer];
                        A[D] = e[E];
                        A[stack_pointer] = D + 1;
                        fetch();
                    };
                    A[5037] = function () {
                        var Q = A[--A[stack_pointer]]; // POP
                        var B = A[A[stack_pointer] - 1];
                        A[A[stack_pointer] - 1] = B[Q];
                        var E = getVal();
                        A[A[stack_pointer]] = E;
                        A[stack_pointer]++;
                        fetch();
                    };
                    A[4980] = function () {
                        var Q = readUint16();
                        A[A[frame_base_pointer] + Q] = ++A[4639];
                        fetch();
                    };
                    A[4932] = function () {
                        register2stack(readUint16());
                        register2stack(readUint16());
                        register2stack(readUint16());
                        fetch();
                    };
                    A[4880] = function () {
                        var Q = readUint16();
                        var E = A[A[frame_base_pointer] + Q];
                        var e = A[stack_pointer];
                        var D = A[e - 1];
                        A[e - 1] = D[E];
                        fetch();
                    };
                    A[4894] = function () {
                        var Q = --A[stack_pointer];
                        A[Q - 1] = A[Q - 1] ^ A[Q];
                        var E = readUint16();
                        A[stack_offset + E] = A[Q - 1];
                        storeToLastResult();
                        var e = readUint16();
                        A[A[stack_pointer]++] = A[stack_offset + e];
                        var D = readUint16();
                        A[A[stack_pointer]++] = A[stack_offset + D];
                        fetch();
                    };
                    A[4883] = function () {
                        var Q = readUint16();
                        var E = A[A[frame_base_pointer] + Q];
                        A[A[stack_pointer]++] = A[4591 - E];
                        fetch();
                    };
                    A[4988] = function () {
                        var Q = readUint16();
                        var E = readUint16();
                        var e = getVal();
                        var D = A[stack_offset + Q];
                        var g = A[stack_offset + E];
                        var a = A[stack_pointer];
                        A[a] = D[g & e];
                        A[stack_pointer] = a + 1;
                        fetch();
                    };
                    A[5008] = function () {
                        var Q = readUint16();
                        A[instruction_pointer] -= Q;
                        fetch();
                    };
                    A[4889] = function () {
                        var A = readUint16();
                        var Q = readUint16();
                        SET();
                        storeToLastResult();
                        register2stack(A);
                        register2stack(Q);
                        fetch();
                    };
                    A[4885] = function () {
                        var A = readUint16();
                        var Q = readUint16();
                        GET();
                        stack2register(A);
                        storeToLastResult();
                        register2stack(Q);
                        fetch();
                    };
                    A[5017] = function () {
                        var Q = A[--A[stack_pointer]]; // POP
                        A[stack_pointer] = A[frame_base_pointer];
                        A[instruction_pointer] = A[--A[stack_pointer]]; // POP
                        A[frame_base_pointer] = A[--A[stack_pointer]]; // POP
                        A[A[stack_pointer]++] = Q;
                        fetch();
                    };
                    A[4876] = function () {
                        var Q = readUint16();
                        A[A[frame_base_pointer] + Q] = A[A[stack_pointer] - 1];
                        fetch();
                    };
                    A[4949] = function () {
                        var Q = readUint16();
                        var E = readUint16();
                        var e = getVal();
                        var D = A[stack_pointer];
                        A[D++] = A[stack_offset + Q];
                        A[D++] = A[stack_offset + E] & e;
                        A[stack_pointer] = D;
                        fetch();
                    };
                    A[4946] = function () {
                        var Q = getVal();
                        var B = A[stack_pointer];
                        var E = B - 2;
                        var e = B - 1;
                        var D = A[E];
                        var g = A[e] & Q;
                        A[E] = D[g];
                        A[stack_pointer] = B - 1;
                        fetch();
                    };
                    A[4989] = function () {
                        var Q = readUint16();
                        var E = A[stack_pointer];
                        A[E - 1] = A[E - 1] ^ A[stack_offset + Q];
                        fetch();
                    };
                    A[5036] = function () {
                        var Q = readUint16();
                        var E = readUint16();
                        var e = A[stack_pointer];
                        var D = A[stack_offset + Q];
                        var g = A[stack_offset + E];
                        A[e] = D[g];
                        A[stack_pointer] = e + 1;
                        fetch();
                    };
                    A[4948] = function () {
                        var Q = getVal();
                        var B = A[stack_pointer];
                        A[B - 1] = A[B - 1] + Q;
                        fetch();
                    };
                    A[4961] = function () {
                        var Q = {};
                        for (var E = readUint16(), e = 0; e < E; e++) {
                            var D = A[--A[stack_pointer]]; // POP
                            var g = A[--A[stack_pointer]]; // POP
                            Q[D] = g;
                        }
                        A[A[stack_pointer]++] = Q;
                        fetch();
                    };
                    A[4944] = function () {
                        var Q = readUint16();
                        var E = getVal();
                        var e = A[stack_pointer] - 1;
                        var D = A[e];
                        var g = A[stack_offset + Q] & E;
                        A[e] = D[g];
                        fetch();
                    };
                    A[4888] = function () {
                        var Q = A[--A[stack_pointer]]; // POP
                        var B = A[A[stack_pointer] - 1][Q];
                        var E = getVal();
                        A[A[stack_pointer] - 1] = B ^ E;
                        fetch();
                    };
                    A[4926] = function () {
                        var Q = readUint16();
                        if (A[A[stack_pointer] - 1]) {
                            A[instruction_pointer] += Q;
                        } else {
                            A[stack_pointer]--;
                        }
                        fetch();
                    };
                    A[4878] = function () {
                        var Q = A[--A[stack_pointer]]; // POP
                        var B = A[--A[stack_pointer]]; // POP
                        var E = A[--A[stack_pointer]]; // POP
                        B[Q] = E;
                        A[last_result] = E;
                        fetch();
                    };
                    A[4824] = function () {
                        var Q = --A[stack_pointer];
                        A[Q - 1] |= A[Q];
                        fetch();
                    };
                    A[4857] = function () {
                        var Q = readUint16();
                        A[instruction_pointer] += Q;
                        fetch();
                    };
                    A[4787] = function () {
                        var Q = --A[stack_pointer];
                        A[Q - 1] *= A[Q];
                        fetch();
                    };
                    A[4942] = function () {
                        var Q = readUint8();
                        new A[--A[stack_pointer]](Q);
                        fetch();
                    };
                    A[5018] = function () {
                        var Q = --A[stack_pointer];
                        A[Q - 1] += A[Q];
                        fetch();
                    };
                    A[4804] = function () {
                        register2stack(readUint16());
                        var Q = getVal();
                        A[A[stack_pointer]++] = Q;
                        fetch();
                    };
                    A[4814] = function () {
                        stack2register(readUint16());
                        storeToLastResult();
                        register2stack(readUint16());
                        register2stack(readUint16());
                        fetch();
                    };
                    A[4978] = function () {
                        var Q = readUint16();
                        if (A[A[stack_pointer] - 1]) {
                            A[stack_pointer]--;
                        } else {
                            A[instruction_pointer] += Q;
                        }
                        fetch();
                    };
                    A[4864] = function () {
                        storeToLastResult();
                        var Q = getVal();
                        A[A[stack_pointer]++] = Q;
                        fetch();
                    };
                    A[4840] = function () {
                        var Q = --A[stack_pointer];
                        A[Q - 1] = A[Q - 1] == A[Q];
                        fetch();
                    };
                    A[4927] = function () {
                        var Q = A[stack_pointer];
                        A[Q - 1] = +A[Q - 1];
                        fetch();
                    };
                    A[4826] = function () {
                        A[A[stack_pointer]++] = window;
                        fetch();
                    };
                    A[4977] = function () {
                        var Q = readUint16();
                        var E = A[stack_offset + Q];
                        var e = A[stack_pointer];
                        var D = A[e - 1];
                        A[e - 1] = D[E];
                        fetch();
                    };
                    A[4915] = function () {
                        var Q = getVal();
                        var B = A[stack_pointer];
                        A[B - 1] <<= Q;
                        fetch();
                    };
                    A[4875] = function () {
                        storeToLastResult();
                        register2stack(readUint16());
                        fetch();
                    };
                    A[4954] = function () {
                        register2stack(readUint16());
                        register2stack(readUint16());
                        var Q = getVal();
                        A[A[stack_pointer]++] = Q;
                        fetch();
                    };
                    A[5014] = function () {
                        var Q = A[stack_pointer];
                        A[Q - 1] = !A[Q - 1];
                        fetch();
                    };
                    A[4852] = function () {
                        var Q = --A[stack_pointer];
                        A[Q - 1] >>= A[Q];
                        fetch();
                    };
                    A[4897] = function () {
                        var A = readUint16();
                        SET();
                        storeToLastResult();
                        register2stack(A);
                        fetch();
                    };
                    A[4939] = function () {
                        var Q = --A[stack_pointer];
                        A[Q - 1] = A[Q - 1] > A[Q];
                        fetch();
                    };
                    A[4851] = function () {
                        storeToLastResult();
                        register2stack(readUint16());
                        register2stack(readUint16());
                        fetch();
                    };
                    A[5015] = function () {
                        var Q = readUint16();
                        var E = A[--A[stack_pointer]]; // POP
                        A[stack_offset + Q] = E;
                        A[last_result] = E;
                        var e = getVal();
                        A[A[stack_pointer]++] = e;
                        fetch();
                    };
                    A[4844] = function () {
                        var Q = readUint8();
                        A[--A[stack_pointer]](Q);
                        fetch();
                    };
                    A[4966] = function () {
                        var Q = --A[stack_pointer];
                        A[Q - 1] &= A[Q];
                        fetch();
                    };
                    A[5003] = function () {
                        var Q = A[--A[stack_pointer]]; // POP
                        var B = A[--A[stack_pointer]]; // POP

                        function E(e) {
                            var D = A[stack_pointer];
                            var g = A.slice(D - e, D);
                            if (this instanceof E) {
                                g.unshift(null);
                                var a;
                                var h = Function.prototype.bind.apply(Q, g);
                                A[stack_pointer] -= e;
                                try {
                                    a = new h();
                                } catch (A) {
                                    a = A.message;
                                }
                                A[A[stack_pointer]++] = a;
                            } else {
                                var t;
                                try {
                                    t = Q.apply(B, g);
                                } catch (A) {
                                    t = A.message;
                                }
                                A[stack_pointer] -= e + 2;
                                A[A[stack_pointer]++] = t;
                            }
                        }

                        A[A[stack_pointer]++] = E;
                        fetch();
                    };
                    A[4935] = function () {
                        var Q = A[--A[stack_pointer]]; // POP
                        var B = A[--A[stack_pointer]]; // POP
                        A[A[stack_pointer]++] = B - Q === 0;
                        fetch();
                    };
                    A[4907] = function () {
                        var Q = readUint16();
                        A[A[stack_pointer]++] = A[A[frame_base_pointer] + Q];
                        fetch();
                    };
                    A[4784] = function () {
                        var Q = readUint16();
                        var E = A[A[frame_base_pointer] + Q];
                        A[stack_pointer] = A[frame_base_pointer];
                        A[instruction_pointer] = A[--A[stack_pointer]]; // POP
                        A[frame_base_pointer] = A[--A[stack_pointer]]; // POP
                        A[A[stack_pointer]++] = E;
                        fetch();
                    };
                    A[5012] = function () {
                        var Q = A[stack_pointer];
                        A[Q - 1] = ~A[Q - 1];
                        fetch();
                    };
                    A[4912] = function () {
                        var Q = readUint16();
                        if (!A[--A[stack_pointer]]) {
                            A[instruction_pointer] += Q;
                        }
                        fetch();
                    };
                    A[4809] = function () {
                        stack2register(readUint16());
                        storeToLastResult();
                        register2stack(readUint16());
                        fetch();
                    };
                    A[5007] = function () {
                        var Q = --A[stack_pointer];
                        A[Q - 1] = A[Q - 1] < A[Q];
                        fetch();
                    };
                    A[4983] = function () {
                        var Q = A[stack_pointer];
                        A[Q - 1] = -A[Q - 1];
                        fetch();
                    };
                    A[4834] = function () {
                        var Q = readUint16();
                        var E = A[stack_pointer];
                        var e = A[E - 1];
                        var D = A[stack_offset + Q];
                        A[E - 1] = e - D;
                        fetch();
                    };
                    A[4808] = function () {
                        register2stack(readUint16());
                        fetch();
                    };
                    A[4846] = function () {
                        var Q = getVal();
                        var B = A[stack_pointer];
                        A[B - 1] &= Q;
                        fetch();
                    };
                    A[4959] = function () {
                        var Q = --A[stack_pointer];
                        A[Q - 1] ^= A[Q];
                        fetch();
                    };
                    A[4873] = function () {
                        var Q = readUint16();
                        var E = readUint16();
                        var e = A[stack_pointer];
                        A[e++] = A[stack_offset + Q];
                        A[e++] = A[A[frame_base_pointer] + E];
                        A[stack_pointer] = e;
                        fetch();
                    };
                    A[4806] = function () {
                        var Q = --A[stack_pointer];
                        A[Q - 1] >>>= A[Q];
                        fetch();
                    };
                    A[4982] = function () {
                        storeToLastResult();
                        fetch();
                    };
                    A[4785] = function () {
                        var Q = A[--A[stack_pointer]]; // POP
                        A[--A[stack_pointer]][Q] = A[A[stack_pointer] - 1];
                        fetch();
                    };
                    A[4800] = function () {
                        Q.r = A[last_result];
                        A[exit_flag] = 1;
                    };
                    A[4783] = function () {
                        var Q = readUint16();
                        A[stack_pointer] -= Q;
                        fetch();
                    };
                    A[5001] = function () {
                        var Q = getVal();
                        var B = A[stack_pointer];
                        A[B - 1] >>>= Q;
                        fetch();
                    };
                    A[4798] = function () {
                        var Q = getVal();
                        var B = A[stack_pointer];
                        A[B - 1] ^= Q;
                        fetch();
                    };
                    A[5021] = function () {
                        var Q = A[--A[stack_pointer]]; // POP
                        var B = A[A[stack_pointer] - 1];
                        A[A[stack_pointer] - 1] = B[Q];
                        fetch();
                    };
                    A[4811] = function () {
                        var Q = readUint16();
                        var E = A[A[frame_base_pointer] + Q];
                        A[4591 - E] = A[A[stack_pointer] - 1];
                        fetch();
                    };
                    A[5033] = function () {
                        var Q = getVal();
                        A[A[stack_pointer]++] = Q;
                        fetch();
                    };
                    A[4963] = function () {
                        var A = readUint16();
                        var Q = readUint16();
                        var E = readUint16();
                        SET();
                        storeToLastResult();
                        register2stack(A);
                        register2stack(Q);
                        register2stack(E);
                        fetch();
                    };
                    A[4810] = function () {
                        var Q = readUint16();
                        var E = A[--A[stack_pointer]]; // POP
                        A[A[frame_base_pointer] + Q] = E;
                        A[last_result] = E;
                        fetch();
                    };
                    A[4837] = function () {
                        var Q = getVal();
                        var B = A[stack_pointer];
                        A[B - 1] >>= Q;
                        fetch();
                    };
                    A[4868] = function () {
                        var Q = readUint16();
                        var E = readUint16();
                        var e = A[stack_offset + E];
                        var D = A[stack_offset + Q];
                        var g = A[--A[stack_pointer]]; // POP
                        D[e] = g;
                        A[last_result] = g;
                        fetch();
                    };
                    A[5027] = function () {
                        var Q = readUint16();
                        var E = readUint16();
                        var e = getVal();
                        var D = A[stack_pointer];
                        var g = A[D - 1];
                        A[stack_offset + Q][A[stack_offset + E] & e] = g;
                        storeToLastResult();
                        fetch();
                    };
                    A[4979] = function () {
                        var Q = --A[stack_pointer];
                        A[Q - 1] -= A[Q];
                        fetch();
                    };
                    A[4968] = function () {
                        var Q = readUint16();
                        var E = getVal();
                        var e = A[stack_pointer];
                        A[e++] = A[A[frame_base_pointer] + Q];
                        A[e++] = E;
                        A[stack_pointer] = e;
                        fetch();
                    };
                    A[5000] = function () {
                        var Q = readUint16();
                        var E = getVal();
                        var e = A[stack_pointer];
                        A[e] = A[stack_offset + Q] & E;
                        A[stack_pointer] = e + 1;
                        fetch();
                    };
                    A[4938] = function () {
                        var A = readUint16();
                        var Q = readUint16();
                        register2stack(A);
                        register2stack(Q);
                        fetch();
                    };
                    A[4993] = function () {
                        storeToLastResult();
                        storeToLastResult();
                        fetch();
                    };
                    A[4945] = function () {
                        var Q = A[stack_pointer];
                        var B = A[Q - 1];
                        var E = [];
                        A[Q - 1] = E;
                        for (var e in B) {
                            E.push(e);
                        }
                        fetch();
                    };
                    A[5035] = function () {
                        var Q = readUint16();
                        var E = A[stack_pointer] - Q;
                        var e = A.slice(E, A[stack_pointer]).reverse();
                        A[stack_pointer] = E;
                        A[A[stack_pointer]++] = e;
                        fetch();
                    };
                    A[4845] = function () {
                        var A = readUint16();
                        var Q = readUint16();
                        var E = readUint16();
                        register2stack(A);
                        register2stack(Q);
                        register2stack(E);
                        SET();
                        storeToLastResult();
                        fetch();
                    };
                    A[5020] = function () {
                        var Q = getVal();
                        var B = A[stack_pointer];
                        A[B - 1] %= Q;
                        fetch();
                    };
                    A[4832] = function () {
                        var Q = getVal();
                        var B = A[stack_pointer];
                        A[B - 1] ^= Q;
                        fetch();
                    };
                    A[5024] = function () {
                        var Q = readUint16();
                        var E = A[--A[stack_pointer]]; // POP
                        A[stack_offset + Q] = E;
                        A[last_result] = E;
                        fetch();
                    };
                    A[4879] = function () {
                        for (var Q = readUint8(), B = 0; B < Q; B++) {
                            A[A[stack_pointer]++] = getVal();
                        }
                        fetch();
                    };
                    A[4872] = function () {
                        var Q = A[stack_pointer];
                        A[Q - 1] = E(A[Q - 1]);
                        fetch();
                    };
                }(D, e));
                var I = D[vm_start + D[instruction_pointer]++];
                var P = 4783 + I;
                D[current_opcode_handler] = D[P];
                D[current_opcode_id] = I;
                while (!D[exit_flag] && B++ < 100000000) {
                    D[current_opcode_handler]();
                }
                e.u = D[-1];
            } catch (A) {
                e.e = A;
            } finally {
                e.i = B;
                e.t = performance.now() - Q | 0;
                return e;
            }
        }('<BYTECODE>');
    };
};
window.ddm = {userEnv: '826d28a53668380c3cd985abd41cc8466922c5d628fe3775cc7f8a98d7abdf3fb92b268caa3216ad1bf21fd5b28a902c'};
const exports = {};
vm(null, exports, null);
console.log(exports.exports());