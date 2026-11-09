/**
 * DataDome VM Disassembler
 *
 * A proof-of-concept disassembler for the DataDome JavaScript VM bytecode.
 * Converts base64-encoded VM bytecode into human-readable assembly instructions.
 *
 * Features:
 * - Decodes all value types (strings, numbers, booleans, etc.)
 * - Handles XOR-encoded strings with UTF-8 support
 * - Generates labels for jump targets
 * - Special handling for complex opcodes (closures, multi-push, etc.)
 * - Formats output with addresses and raw bytes for analysis
 *
 * Usage:
 *   node disasm.js <bytecode_file> [max_instructions]
 *   echo "base64data" | node disasm.js -
 */

const fs = require('fs');

// VM Constants - Memory offsets in the VM's unified array
const VM_START = 5258;      // Starting offset of bytecode in VM memory
const OPCODE_BASE = 4783;   // Base offset where opcode handlers are stored

/**
 * Value Type Markers
 *
 * The VM encodes immediate values in bytecode using type markers.
 * Each marker byte indicates how to decode the following bytes.
 *
 * Small integers (0-127) are encoded with the high bit set: 0x80 | value
 * Other types use specific marker bytes followed by their data.
 */
const VAL_TRUE = 40;      // 0x28 - Boolean true (no additional bytes)
const VAL_FALSE = 125;    // 0x7D - Boolean false (no additional bytes)
const VAL_NULL = 76;      // 0x4C - null value (no additional bytes)
const VAL_UNDEFINED = 61; // 0x3D - undefined value (no additional bytes)
const VAL_STRING = 103;   // 0x67 - XOR-encoded ASCII string (null-terminated)
const VAL_UTF8 = 39;      // 0x27 - XOR-encoded UTF-8 string (null-terminated)
const VAL_FLOAT64 = 5;    // 0x05 - IEEE 754 double (8 bytes)
const VAL_INT32 = 84;     // 0x54 - Signed 32-bit integer (4 bytes, big-endian)
const VAL_INT24 = 101;    // 0x65 - Signed 24-bit integer (3 bytes, big-endian)
const VAL_INT16 = 97;     // 0x61 - Signed 16-bit integer (2 bytes, big-endian)
const VAL_INT8 = 111;     // 0x6F - Signed 8-bit integer (1 byte)

/**
 * Opcode Definitions
 *
 * Maps opcode bytes to [name, argFormat] pairs.
 * The opcode number corresponds to the handler offset: OPCODE_BASE + opcode
 *
 * Argument format notation:
 *   'u8'     - Unsigned 8-bit integer
 *   'u16'    - Unsigned 16-bit integer (big-endian)
 *   'val'    - Immediate value (type-tagged, decoded by readValue())
 *   'u8*'    - Variable number of u8 values
 *   'val*'   - Variable number of immediate values
 *   'jmp'    - Jump offset (used in CLOSURE)
 *   Multiple args separated by commas: 'u16,u16' or 'u16,val'
 *
 * Stack notation (where used in comments):
 *   TOS = Top of Stack
 *   POP = Remove from stack
 *   PUSH = Add to stack
 */
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
    136: ['CLOSURE', 'u8,u8,u8*'],        // 4919: create closure
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

/**
 * Disassembler Class
 *
 * Main disassembler that converts raw VM bytecode into assembly-like output.
 * Performs two passes:
 *   1. Label discovery pass - finds all jump targets
 *   2. Disassembly pass - converts opcodes to readable instructions
 */
class Disassembler {
    constructor(bytecode) {
        this.bytecode = bytecode;
        this.ip = 0;                // Instruction pointer (current position in bytecode)
        this.labels = new Set();    // Set of addresses that are jump targets
    }

    readUint8() {
        return this.bytecode[this.ip++];
    }

    readUint16() {
        const hi = this.bytecode[this.ip++];
        const lo = this.bytecode[this.ip++];
        return (hi << 8) | lo;
    }

    /**
     * Decode a type-tagged immediate value from bytecode
     *
     * The VM uses a type-marker system where the first byte indicates
     * the type and encoding of the following data.
     *
     * @returns {Object} {type: string, value: any, raw?: boolean}
     */
    readValue() {
        const marker = this.readUint8();

        // Small integers (0-127) are encoded directly with high bit set
        if (marker & 0x80) {
            return { type: 'int', value: marker & 0x7F };
        }
        //tbh just stole this from the vm and let claude label it 🤷
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
                // XOR-encoded ASCII string (null-terminated)
                // XOR key starts at 183 and increments for each byte
                let str = '';
                let xorKey = 183;
                let ch;
                while ((ch = this.readUint8() ^ (xorKey++ & 0xFF)) !== 0) {
                    str += String.fromCharCode(ch);
                }
                return { type: 'string', value: str };
            }
            case VAL_UTF8: {
                // XOR-encoded UTF-8 string (null-terminated)
                // XOR key starts at 46 and increments for each byte
                let xorKey = 46;
                const bytes = [];
                let b;
                while ((b = this.readUint8() ^ (xorKey++ & 0xFF)) !== 0) {
                    bytes.push(b);
                }
                // Decode UTF-8 byte sequence to JavaScript string
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
                // IEEE 754 double-precision float (8 bytes, big-endian)
                const bytes = [];
                for (let i = 0; i < 8; i++) {
                    bytes.push(this.readUint8());
                }
                // Extract sign, exponent, and mantissa
                const sign = (bytes[0] >> 7) ? -1 : 1;
                const exp = ((bytes[0] & 127) << 4) | ((bytes[1] >> 4) & 15);
                // Handle special values (NaN, Infinity)
                if (exp === 2047) {
                    return bytes[7] & 1 ? { type: 'float', value: NaN } : { type: 'float', value: sign * Infinity };
                }
                // Calculate mantissa from the 52 fractional bits
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

    /**
     * Format a decoded value for display in disassembly
     * @param {Object} val - Value object from readValue()
     * @returns {string} Formatted string representation
     */
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

    /**
     * First pass: Scan bytecode to find all jump targets
     *
     * This creates labels for any address that is the target of a jump,
     * making the disassembly output easier to follow. Labels are named
     * L_<hex_address> (e.g., L_0042 for address 0x42).
     */
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

            // Special handling for CLOSURE opcode
            // Closures contain a jump offset to skip over the function body
            if (name === 'CLOSURE') {
                this.ip = addr + 1;
                const numLocals = this.readUint8();
                const numCaptures = this.readUint8();
                for (let i = 0; i < numCaptures; i++) {
                    this.readUint8();
                }
                const bodyStart = this.ip + 3;
                this.labels.add(bodyStart);
            }
        }

        this.ip = savedIp;
    }

    /**
     * Disassemble a single instruction at the current IP
     *
     * Output format:
     *   [label:]
     *   address:  raw_bytes (hex)    OPCODE arg1, arg2, ...
     *
     * Example:
     *   L_0042:
     *   000042:  fa 00 0a           PUSH_IMM 10
     *
     * @returns {string} Formatted disassembly line
     */
    disassembleOne() {
        const addr = this.ip;
        const opcode = this.readUint8();
        const def = OPCODES[opcode];

        // Add label if this address is a jump target
        let label = '';
        if (this.labels.has(addr)) {
            label = `L_${addr.toString(16).padStart(4, '0')}:\n`;
        }

        // Unknown opcode
        if (!def) {
            return `${label}${addr.toString(16).padStart(6, '0')}:  ${opcode.toString(16).padStart(2, '0')}              UNK_${opcode}`;
        }

        const [name, format] = def;
        const args = [];
        let rawBytes = [opcode];

        if (format && format.length > 0) {
            const parts = format.split(',');

            // Special handling for CLOSURE opcode
            // Format: CLOSURE locals, captures, [capture_indices...], skip_offset
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
                const bodyAddr = this.ip + 3;
                args.push(`body=L_${bodyAddr.toString(16).padStart(4, '0')}`);
            }
            // Special handling for PUSH_MULTI_IMM opcode
            // Pushes multiple immediate values onto the stack
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

                        // Format jump targets as labels (relative to end of instruction)
                        // Instruction ends at: addr + 1 (opcode) + 2 (u16) = addr + 3
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

        // Format output line
        const addrStr = addr.toString(16).padStart(6, '0');
        const bytesStr = rawBytes.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ');
        const argsStr = args.length > 0 ? ' ' + args.join(', ') : '';

        return `${label}${addrStr}:  ${bytesStr.padEnd(24)} ${name}${argsStr}`;
    }

    /**
     * Disassemble the entire bytecode (or up to maxInstructions)
     *
     * Performs two passes:
     * 1. Label discovery (findLabels)
     * 2. Instruction disassembly
     *
     * @param {number} maxInstructions - Maximum number of instructions to disassemble
     * @returns {string} Complete disassembly output
     */
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

/**
 * Main entry point
 *
 * Usage:
 *   node disasm.js bytecode.txt              - Disassemble from file
 *   node disasm.js bytecode.txt 100          - Disassemble first 100 instructions
 *   echo "base64..." | node disasm.js -      - Disassemble from stdin
 *
 * The input should be base64-encoded VM bytecode. This is typically
 * extracted from the DataDome VM's initialization code.
 */
function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node disasm.js <bytecode_file> [max_instructions]');
        console.log('');
        console.log('Arguments:');
        console.log('  bytecode_file      Path to file containing base64-encoded bytecode, or "-" for stdin');
        console.log('  max_instructions   Optional limit on number of instructions to disassemble');
        console.log('');
        console.log('Examples:');
        console.log('  node disasm.js bytecode.txt');
        console.log('  node disasm.js bytecode.txt 50');
        console.log('  echo "base64data..." | node disasm.js -');
        process.exit(1);
    }

    let base64Data;
    const maxInstructions = args[1] ? parseInt(args[1]) : Infinity;

    // Read input from file or stdin
    if (args[0] === '-') {
        base64Data = fs.readFileSync(0, 'utf8').trim();
    } else {
        base64Data = fs.readFileSync(args[0], 'utf8').trim();
    }

    // Decode base64 to raw bytes
    const decoded = Buffer.from(base64Data, 'base64');
    const bytecode = new Uint8Array(decoded);

    // Output header with metadata
    console.log(`; DataDome VM Disassembly`);
    console.log(`; Bytecode size: ${bytecode.length} bytes`);
    console.log(`; VM Constants: VM_START=${VM_START}, OPCODE_BASE=${OPCODE_BASE}`);
    console.log('');

    // Disassemble and output
    const disasm = new Disassembler(bytecode);
    console.log(disasm.disassemble(maxInstructions));
}

// Run if executed directly
if (require.main === module) {
    main();
}

// Export for use as a library
module.exports = { Disassembler, OPCODES, VM_START, OPCODE_BASE };