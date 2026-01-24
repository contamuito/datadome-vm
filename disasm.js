const fs = require('fs');

// VM Constants
const VM_START = 5258;
const OPCODE_BASE = 4783;

// Value type markers
const VAL_TRUE = 40;      // 0x28
const VAL_FALSE = 125;    // 0x7D
const VAL_NULL = 76;      // 0x4C
const VAL_UNDEFINED = 61; // 0x3D
const VAL_STRING = 103;   // 0x67 - XOR encoded string
const VAL_UTF8 = 39;      // 0x27 - UTF-8 XOR encoded string
const VAL_FLOAT64 = 5;    // 0x05
const VAL_INT32 = 84;     // 0x54
const VAL_INT24 = 101;    // 0x65
const VAL_INT16 = 97;     // 0x61
const VAL_INT8 = 111;     // 0x6F

// Opcode definitions: [name, argFormat]
// argFormat: 'u16' = uint16, 'u8' = uint8, 'val' = getValue, combinations like 'u16,u16'
const OPCODES = {
    0:   ['POP_N', 'u16'],                    // 4783: stack_pointer -= n
    1:   ['RET_LOCAL', 'u16'],                // 4784: return frame local
    2:   ['SET', ''],                         // 4785: obj[key] = value
    4:   ['MUL', ''],                         // 4787: multiply
    8:   ['IN', ''],                          // 4791: 'in' operator
    15:  ['XOR_IMM', 'val'],                  // 4798: TOS ^= imm
    17:  ['EXIT', ''],                        // 4800: exit VM
    18:  ['GET_PROP_IMM', 'val'],             // 4801: TOS = TOS[imm]
    21:  ['PUSH_REG_IMM', 'u16,val'],         // 4804: push reg, push imm
    23:  ['USHR', ''],                        // 4806: unsigned right shift
    25:  ['PUSH_REG', 'u16'],                 // 4808: push register
    26:  ['S2R_LR_R', 'u16,u16'],             // 4809: stack2reg, lastResult, push reg
    27:  ['POP_FRAME_LR', 'u16'],             // 4810: pop to frame local + lastResult
    28:  ['STORE_SPECIAL', 'u16'],            // 4811: store to special stack
    31:  ['S2R_LR_RR', 'u16,u16,u16'],        // 4814: stack2reg, lastResult, push 2 regs
    41:  ['OR', ''],                          // 4824: bitwise OR
    43:  ['PUSH_WINDOW', ''],                 // 4826: push window object
    49:  ['XOR_IMM2', 'val'],                 // 4832: TOS ^= imm (duplicate)
    51:  ['SUB_REG', 'u16'],                  // 4834: TOS -= reg
    54:  ['SHR_IMM', 'val'],                  // 4837: signed right shift imm
    57:  ['EQ', ''],                          // 4840: == operator
    60:  ['GET_AND_MASK', ''],                // 4843: TOS = arr[idx & mask]
    61:  ['CALL_U8', 'u8'],                   // 4844: call with u8 arg count
    62:  ['R3_SET', 'u16,u16,u16'],           // 4845: push 3 regs, SET
    63:  ['AND_IMM', 'val'],                  // 4846: TOS &= imm
    68:  ['LR_R2', 'u16,u16'],                // 4851: lastResult, push 2 regs
    69:  ['SHR', ''],                         // 4852: signed right shift
    74:  ['JMP_FWD', 'u16'],                  // 4857: jump forward
    76:  ['MOD', ''],                         // 4859: modulo
    79:  ['GET_S2R_LR_R2', 'u16,u16,u16'],    // 4862: GET, s2r, lr, push 2 regs
    81:  ['LR_PUSH_IMM', 'val'],              // 4864: lastResult, push imm
    85:  ['REG_SET', 'u16,u16'],              // 4868: reg[reg] = pop
    89:  ['TYPEOF', ''],                      // 4872: typeof TOS
    90:  ['PUSH_REG_FRAME', 'u16,u16'],       // 4873: push reg, push frame local
    92:  ['LR_PUSH_REG', 'u16'],              // 4875: lastResult, push reg
    93:  ['STORE_FRAME', 'u16'],              // 4876: frame[n] = TOS (no pop)
    95:  ['SET_LR', ''],                      // 4878: SET with lastResult
    96:  ['PUSH_MULTI_IMM', 'u8,val*'],       // 4879: push n immediates
    97:  ['GET_FRAME_PROP', 'u16'],           // 4880: TOS = TOS[frame[n]]
    100: ['LOAD_SPECIAL', 'u16'],             // 4883: push from special stack
    102: ['GET_S2R_LR_R', 'u16,u16'],         // 4885: GET, s2r, lr, push reg
    103: ['DIV', ''],                         // 4886: divide
    104: ['PUSH_REG_PROP_IMM', 'u16,val'],    // 4887: push reg[imm]
    105: ['GET_XOR_IMM', 'val'],              // 4888: TOS = obj[pop] ^ imm
    106: ['SET_LR_R2', 'u16,u16'],            // 4889: SET, lr, push 2 regs
    111: ['XOR_S2R_LR_R2', 'u16,u16,u16'],    // 4894: XOR, s2r, lr, push 2 regs
    114: ['SET_LR_R', 'u16'],                 // 4897: SET, lr, push reg
    121: ['POP_REG', 'u16'],                  // 4904: stack2register (no pop)
    124: ['PUSH_FRAME', 'u16'],               // 4907: push frame local
    128: ['SHL', ''],                         // 4911: left shift
    129: ['JZ', 'u16'],                       // 4912: jump if false (pop)
    132: ['SHL_IMM', 'val'],                  // 4915: TOS <<= imm
    136: ['CLOSURE', 'u8,u8,u8*,jmp'],        // 4919: create closure
    143: ['JNZ_KEEP', 'u16'],                 // 4926: if TOS, jump (keep), else pop
    144: ['UNARY_PLUS', ''],                  // 4927: +TOS
    149: ['PUSH_R3', 'u16,u16,u16'],          // 4932: push 3 registers
    152: ['SUB_EQ_ZERO', ''],                 // 4935: TOS = (a - b === 0)
    155: ['PUSH_R2', 'u16,u16'],              // 4938: push 2 registers
    156: ['GT', ''],                          // 4939: greater than
    159: ['NEW_U8', 'u8'],                    // 4942: new with u8 arg count
    161: ['GET_REG_AND_IMM', 'u16,val'],      // 4944: TOS = TOS[reg & imm]
    162: ['FOR_IN', ''],                      // 4945: for-in enumeration
    163: ['GET_AND_IMM', 'val'],              // 4946: TOS = arr[idx & imm]
    165: ['ADD_IMM', 'val'],                  // 4948: TOS += imm
    166: ['PUSH_REG_AND_IMM', 'u16,u16,val'], // 4949: push reg, push reg & imm
    168: ['REG_GET_REG', 'u16,u16,u16'],      // 4951: reg = reg[reg]
    171: ['PUSH_R2_IMM', 'u16,u16,val'],      // 4954: push 2 regs, push imm
    176: ['XOR', ''],                         // 4959: bitwise XOR
    178: ['NEW_OBJ', 'u16'],                  // 4961: create object
    180: ['SET_LR_R3', 'u16,u16,u16'],        // 4963: SET, lr, push 3 regs
    182: ['VOID', ''],                        // 4965: void TOS
    183: ['AND', ''],                         // 4966: bitwise AND
    185: ['PUSH_FRAME_IMM', 'u16,val'],       // 4968: push frame local, push imm
    194: ['GET_REG_PROP', 'u16'],             // 4977: TOS = TOS[reg]
    195: ['JZ_KEEP', 'u16'],                  // 4978: if !TOS, jump (keep), else pop
    196: ['SUB', ''],                         // 4979: subtract
    197: ['INC_COUNTER', 'u16'],              // 4980: frame[n] = ++counter
    199: ['POP_LR', ''],                      // 4982: pop to lastResult
    200: ['NEG', ''],                         // 4983: -TOS
    205: ['GET_REG2_AND_IMM', 'u16,u16,val'], // 4988: push reg[reg & imm]
    206: ['XOR_REG', 'u16'],                  // 4989: TOS ^= reg
    210: ['POP2_LR', ''],                     // 4993: pop twice to lastResult
    217: ['PUSH_REG_AND_IMM', 'u16,val'],     // 5000: push reg & imm
    218: ['USHR_IMM', 'val'],                 // 5001: TOS >>>= imm
    220: ['PREP_CALL', ''],                   // 5003: prepare function call
    223: ['SEQ', ''],                         // 5006: strict equals ===
    224: ['LT', ''],                          // 5007: less than
    225: ['JMP_BACK', 'u16'],                 // 5008: jump backward
    229: ['NOT_BIT', ''],                     // 5012: ~TOS
    231: ['NOT', ''],                         // 5014: !TOS
    232: ['POP_REG_IMM', 'u16,val'],          // 5015: pop to reg, push imm
    234: ['RET', ''],                         // 5017: return
    235: ['ADD', ''],                         // 5018: add
    237: ['MOD_IMM', 'val'],                  // 5020: TOS %= imm
    238: ['GET', ''],                         // 5021: TOS = obj[key]
    241: ['POP_REG_LR', 'u16'],               // 5024: pop to register + lastResult
    244: ['SET_REG_AND_IMM', 'u16,u16,val'],  // 5027: reg[reg & imm] = TOS
    250: ['PUSH_IMM', 'val'],                 // 5033: push immediate
    252: ['MAKE_ARRAY', 'u16'],               // 5035: create array from stack
    253: ['PUSH_REG2_GET', 'u16,u16'],        // 5036: push reg[reg]
    254: ['GET_PUSH_IMM', 'val'],             // 5037: GET then push imm
};

class Disassembler {
    constructor(bytecode) {
        this.bytecode = bytecode;
        this.ip = 0;
        this.labels = new Set();
    }

    readUint8() {
        return this.bytecode[this.ip++];
    }

    readUint16() {
        const hi = this.bytecode[this.ip++];
        const lo = this.bytecode[this.ip++];
        return (hi << 8) | lo;
    }

    // Decode a value from the bytecode
    readValue() {
        const marker = this.readUint8();

        if (marker & 0x80) {
            return { type: 'int', value: marker & 0x7F };
        }

        switch (marker) {
            case VAL_TRUE:
                return { type: 'bool', value: true };
            case VAL_FALSE:
                return { type: 'bool', value: false };
            case VAL_NULL:
                return { type: 'null', value: null };
            case VAL_UNDEFINED:
                return { type: 'undefined', value: undefined };
            case VAL_STRING: {
                // XOR-encoded string
                let str = '';
                let xorKey = 183;
                let ch;
                while ((ch = this.readUint8() ^ (xorKey++ & 0xFF)) !== 0) {
                    str += String.fromCharCode(ch);
                }
                return { type: 'string', value: str };
            }
            case VAL_UTF8: {
                // UTF-8 XOR-encoded string
                let xorKey = 46;
                const bytes = [];
                let b;
                while ((b = this.readUint8() ^ (xorKey++ & 0xFF)) !== 0) {
                    bytes.push(b);
                }
                // Decode UTF-8
                let str = '';
                for (let i = 0; i < bytes.length; ) {
                    const b0 = bytes[i++];
                    if (b0 < 128) {
                        str += String.fromCharCode(b0);
                    } else if (b0 > 191 && b0 < 224) {
                        const b1 = bytes[i++];
                        str += String.fromCharCode(((b0 & 31) << 6) | (b1 & 63));
                    } else if (b0 > 239 && b0 < 365) {
                        const b1 = bytes[i++];
                        const b2 = bytes[i++];
                        const b3 = bytes[i++];
                        const cp = ((b0 & 7) << 18) | ((b1 & 63) << 12) | ((b2 & 63) << 6) | (b3 & 63) - 65536;
                        str += String.fromCharCode(55296 + (cp >> 10));
                        str += String.fromCharCode(56320 + (cp & 1023));
                    } else {
                        const b1 = bytes[i++];
                        const b2 = bytes[i++];
                        str += String.fromCharCode(((b0 & 15) << 12) | ((b1 & 63) << 6) | (b2 & 63));
                    }
                }
                return { type: 'string', value: str };
            }
            case VAL_FLOAT64: {
                // 8 bytes IEEE 754 double
                const bytes = [];
                for (let i = 0; i < 8; i++) {
                    bytes.push(this.readUint8());
                }
                const sign = (bytes[0] >> 7) ? -1 : 1;
                const exp = ((bytes[0] & 127) << 4) | ((bytes[1] >> 4) & 15);
                if (exp === 2047) {
                    return bytes[7] & 1 ? { type: 'float', value: NaN } : { type: 'float', value: sign * Infinity };
                }
                let mantissa = 1;
                for (let d = 0; d <= 52; d++) {
                    const bitPos = d + 12;
                    const byteIdx = Math.floor(bitPos / 8);
                    const bitIdx = 7 - (bitPos & 7);
                    mantissa += ((bytes[byteIdx] >> bitIdx) & 1) / Math.pow(2, d + 1);
                }
                return { type: 'float', value: sign * mantissa * Math.pow(2, exp - 1023) };
            }
            case VAL_INT32: {
                let val = this.readUint8() << 24;
                val |= this.readUint8() << 16;
                val |= this.readUint8() << 8;
                val |= this.readUint8();
                return { type: 'int', value: val | 0 }; // Sign extend
            }
            case VAL_INT24: {
                let val = this.readUint8() << 16;
                val |= this.readUint8() << 8;
                val |= this.readUint8();
                // Sign extend from 24 bits
                if (val & 0x800000) val |= 0xFF000000;
                return { type: 'int', value: val | 0 };
            }
            case VAL_INT16: {
                let val = this.readUint8() << 8;
                val |= this.readUint8();
                // Sign extend from 16 bits
                return { type: 'int', value: (val << 16) >> 16 };
            }
            case VAL_INT8: {
                let val = this.readUint8();
                // Sign extend from 8 bits
                return { type: 'int', value: (val << 24) >> 24 };
            }
            default:
                return { type: 'unknown', value: marker, raw: true };
        }
    }

    formatValue(val) {
        if (val.raw) return `0x${val.value.toString(16)}`;
        switch (val.type) {
            case 'string':
                return JSON.stringify(val.value);
            case 'bool':
                return val.value.toString();
            case 'null':
                return 'null';
            case 'undefined':
                return 'undefined';
            case 'int':
            case 'float':
                return val.value.toString();
            default:
                return String(val.value);
        }
    }

    // First pass: find all jump targets
    findLabels() {
        const savedIp = this.ip;
        this.ip = 0;

        while (this.ip < this.bytecode.length) {
            const addr = this.ip;
            const opcode = this.readUint8();
            const def = OPCODES[opcode];

            if (!def) {
                // Unknown opcode, skip
                continue;
            }

            const [name, format] = def;

            // Parse arguments to find jump targets
            if (format) {
                const parts = format.split(',');
                for (const part of parts) {
                    if (part === 'u16') {
                        const val = this.readUint16();
                        // Check if this is a jump instruction
                        if (name === 'JMP_FWD' || name === 'JNZ_KEEP' || name === 'JZ_KEEP') {
                            this.labels.add(addr + 3 + val); // After instruction + offset
                        } else if (name === 'JMP_BACK') {
                            this.labels.add(addr + 3 - val);
                        } else if (name === 'JZ') {
                            this.labels.add(addr + 3 + val);
                        }
                    } else if (part === 'u8') {
                        this.readUint8();
                    } else if (part === 'val') {
                        this.readValue();
                    } else if (part === 'u8*') {
                        // Variable number of u8s (for CLOSURE)
                        break; // Skip rest for now
                    } else if (part === 'val*') {
                        // Variable number of values
                        break;
                    } else if (part === 'jmp') {
                        // Skip closure jump
                        break;
                    }
                }
            }

            // Special handling for CLOSURE
            if (name === 'CLOSURE') {
                // Reset to read properly
                this.ip = addr + 1;
                const numLocals = this.readUint8();
                const numCaptures = this.readUint8();
                for (let i = 0; i < numCaptures; i++) {
                    this.readUint8();
                }
                const skipBytes = this.readUint16();
                const bodyStart = this.ip + 1;
                this.labels.add(bodyStart);
                this.labels.add(bodyStart + skipBytes);
                this.ip = bodyStart;
            }
        }

        this.ip = savedIp;
    }

    disassembleOne() {
        const addr = this.ip;
        const opcode = this.readUint8();
        const def = OPCODES[opcode];

        let label = '';
        if (this.labels.has(addr)) {
            label = `L_${addr.toString(16).padStart(4, '0')}:\n`;
        }

        if (!def) {
            return `${label}${addr.toString(16).padStart(6, '0')}:  ${opcode.toString(16).padStart(2, '0')}              UNK_${opcode}`;
        }

        const [name, format] = def;
        const args = [];
        let rawBytes = [opcode];

        if (format && format.length > 0) {
            const parts = format.split(',');

            // Special handling for CLOSURE
            if (name === 'CLOSURE') {
                const numLocals = this.readUint8();
                rawBytes.push(numLocals);
                const numCaptures = this.readUint8();
                rawBytes.push(numCaptures);
                args.push(`locals=${numLocals}`);
                const captures = [];
                for (let i = 0; i < numCaptures; i++) {
                    const c = this.readUint8();
                    rawBytes.push(c);
                    captures.push(c);
                }
                if (captures.length > 0) {
                    args.push(`captures=[${captures.join(',')}]`);
                }
                const skipHi = this.readUint8();
                const skipLo = this.readUint8();
                rawBytes.push(skipHi, skipLo);
                const skipBytes = (skipHi << 8) | skipLo;
                const bodyAddr = this.ip + 1;
                args.push(`body=L_${bodyAddr.toString(16).padStart(4, '0')}`);
                args.push(`end=L_${(bodyAddr + skipBytes).toString(16).padStart(4, '0')}`);
            }
            // Special handling for PUSH_MULTI_IMM
            else if (name === 'PUSH_MULTI_IMM') {
                const count = this.readUint8();
                rawBytes.push(count);
                args.push(`count=${count}`);
                const values = [];
                for (let i = 0; i < count; i++) {
                    const val = this.readValue();
                    values.push(this.formatValue(val));
                }
                args.push(`[${values.join(', ')}]`);
            }
            else {
                for (const part of parts) {
                    if (part === 'u16') {
                        const hi = this.readUint8();
                        const lo = this.readUint8();
                        rawBytes.push(hi, lo);
                        const val = (hi << 8) | lo;

                        // Format jump targets as labels
                        if (name === 'JMP_FWD' || name === 'JNZ_KEEP' || name === 'JZ_KEEP') {
                            args.push(`L_${(addr + 3 + val).toString(16).padStart(4, '0')}`);
                        } else if (name === 'JMP_BACK') {
                            args.push(`L_${(addr + 3 - val).toString(16).padStart(4, '0')}`);
                        } else if (name === 'JZ') {
                            args.push(`L_${(addr + 3 + val).toString(16).padStart(4, '0')}`);
                        } else {
                            args.push(val.toString());
                        }
                    } else if (part === 'u8') {
                        const val = this.readUint8();
                        rawBytes.push(val);
                        args.push(val.toString());
                    } else if (part === 'val') {
                        const startIp = this.ip;
                        const val = this.readValue();
                        for (let i = startIp; i < this.ip; i++) {
                            rawBytes.push(this.bytecode[i]);
                        }
                        args.push(this.formatValue(val));
                    }
                }
            }
        }

        const addrStr = addr.toString(16).padStart(6, '0');
        const bytesStr = rawBytes.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ');
        const argsStr = args.length > 0 ? ' ' + args.join(', ') : '';

        return `${label}${addrStr}:  ${bytesStr.padEnd(24)} ${name}${argsStr}`;
    }

    disassemble(maxInstructions = Infinity) {
        this.findLabels();
        this.ip = 0;
        const lines = [];
        let count = 0;

        while (this.ip < this.bytecode.length && count < maxInstructions) {
            try {
                lines.push(this.disassembleOne());
                count++;
            } catch (e) {
                lines.push(`; Error at ${this.ip.toString(16)}: ${e.message}`);
                break;
            }
        }

        return lines.join('\n');
    }
}

// Main
function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node disassembler.js <bytecode_file> [max_instructions]');
        console.log('');
        console.log('The bytecode_file should contain base64-encoded VM bytecode.');
        console.log('You can also pipe base64 data: echo "base64data" | node disassembler.js -');
        process.exit(1);
    }

    let base64Data;
    const maxInstructions = args[1] ? parseInt(args[1]) : Infinity;

    if (args[0] === '-') {
        // Read from stdin
        base64Data = fs.readFileSync(0, 'utf8').trim();
    } else {
        base64Data = fs.readFileSync(args[0], 'utf8').trim();
    }

    // Decode base64
    const decoded = Buffer.from(base64Data, 'base64');

    // The bytecode is at the beginning of the decoded data
    const bytecode = new Uint8Array(decoded);

    console.log(`; Bytecode size: ${bytecode.length} bytes`);
    console.log(`; VM Constants: VM_START=${VM_START}, OPCODE_BASE=${OPCODE_BASE}`);
    console.log('');

    const disasm = new Disassembler(bytecode);
    console.log(disasm.disassemble(maxInstructions));
}

main();