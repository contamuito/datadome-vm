# DataDome VM Reverse Engineering: Deep Analysis & Payload Decryption

**Research Target:** DataDome In-Browser JavaScript Virtual Machine (2026 Interstitial / CAPTCHA Engine)  
**Artifacts Analyzed:** `vm.js`, `bytecode.bin`, `out.js`, `vm_labeled.js`  
**Tooling:** REA Framework (Reverse Engineer Anything), AST Traversal (Babel), Custom Static Bytecode Analyzer  

---

## 1. Executive Summary

The DataDome client-side protection system deploys a custom stack-based JavaScript Virtual Machine designed to execute in-browser behavioral analysis, anti-tampering verification, and hardware/DOM fingerprinting inside a private, self-contained bytecode sandbox.

While previous public analyses stopped at basic memory offset mapping and proof-of-concept disassembly, this research resolves:
1. A critical instruction-alignment bug in the public disassembler that corrupted all 117 closure routines and generated 79 false `UNK_` opcodes.
2. The complete identification of all 101 bytecode instructions (0 UNK opcodes remaining).
3. The internal telemetry collection mechanism (DOM layout rendering quirks, execution stack tracing, timing metrics).
4. The exact cryptographic serialization pipeline: in-VM UTF-8 encoding, stream-cipher XOR transformation, and Base64URL payload generation.

---

## 2. Disassembler Fix & Control Flow Reconstruction

### 2.1 The CLOSURE Opcode Alignment Bug
The original disassembler (`disasm.js`) implemented opcode `136` (`CLOSURE`) under the assumption that the instruction consumed a 16-bit skip offset as an immediate argument:

```javascript
// Flawed implementation in disasm.js
const skipHi = this.readUint8();
const skipLo = this.readUint8();
const skipBytes = (skipHi << 8) | skipLo;
```

Decompilation of the actual VM handler (`A[4919]` / offset `OPCODE_BASE + 136`) revealed that the VM only consumes:
1. `readUint8()`: Argument count (`locals`)
2. `readUint8()`: Closure captures count (`captures`)
3. `readUint8()` array: Target capture registers

Immediately following the `CLOSURE` instruction in bytecode, the compiler places an explicit `JMP_FWD` (`0x4a`) instruction with a 16-bit offset. Because `disasm.js` consumed those two bytes as part of `CLOSURE`, the disassembler swallowed the jump opcode, left the lower byte as an orphan opcode (`0x83` / `UNK_131`), and misaligned the entire instruction stream for subsequent function bodies.

### 2.2 Resolution
By decoupling the `CLOSURE` signature to `u8,u8,u8*` and permitting `JMP_FWD` to be parsed as its own discrete instruction, the entire 119,224-byte payload disassembles cleanly:
- **Total instructions:** 31,437
- **Unknown opcodes:** 0 (down from 79)
- **Closure functions recovered:** 117 functions fully bounded

---

## 3. Internal VM Architecture & Memory Model

The VM allocates a single continuous array `A` serving as combined stack, heap, and register file:

| Offset | Variable Role | Purpose |
| :--- | :--- | :--- |
| `4593` | `stack_pointer` | Points to the top of the evaluation stack. |
| `4635` | `instruction_pointer` | Program counter indexing into bytecode space (`vm_start + IP`). |
| `4674` | `frame_base_pointer` | Points to the base of the active activation record. |
| `4633` | `last_result` | General-purpose return register (`Q.r`). |
| `4656` | `exit_flag` | Termination trigger (halts main dispatcher loop when set to 1). |
| `4685` | `current_opcode_handler` | Function pointer to active instruction handler. |
| `4675` | `current_opcode_id` | Integer ID of active opcode (0 to 255). |
| `5258` | `vm_start` | Bytecode array memory offset. |
| `124482` | `stack_offset` | Base offset for VM virtual registers (`reg[N] = A[124482 + N]`). |

---

## 4. Telemetry Signals & Environment Fingerprinting

During execution, the VM probes specific browser APIs and collects hardware/DOM signals into a dedicated telemetry buffer (`reg[318]`):

### 4.1 Error Stack Trace Leak Detection
The VM instantiates `new Error()` and reads `error.stack`. It inspects the formatting of the call stack to verify whether execution is occurring directly in a genuine V8/SpiderMonkey engine or inside hooked/proxied wrappers (such as Puppeteer's `Page.evaluate` or modified developer tooling).

### 4.2 CSS Box Model & Rendering Engine Verification
To detect headless environments that lack real layout rendering engines, the VM executes a micro-benchmark using DOM primitives:
```javascript
const el = document.createElement("div");
el.style.position = "absolute";
el.style.left = "-9999px";
el.style.visibility = "hidden";
el.style.boxSizing = "content-box";
el.style.width = "29px";
el.style.paddingLeft = "17px";
document.body.appendChild(el);
const w = el.clientWidth; // Expected: 46px in genuine CSS layout engines
document.body.removeChild(el);
```
Emulators that mock `document.createElement` without computing full layout dimensions return default or zero values, immediately flagging automation.

### 4.3 Environment Context Checks
- **User Environment:** `window.ddm.userEnv`
- **Location Path:** Validates `location.pathname` against the expected challenge endpoint (`/captcha/`).
- **Timing & Jitter:** Measures delta between `Date.now()`, `performance.now()`, and internal VM cycle counters (`e.i`).
- **Automation Flags:** Checks `navigator.webdriver` and `isSecureContext`.

---

## 5. Serialization & Encryption Pipeline

Once the 147-byte telemetry buffer (`reg[318]`) is populated, the VM executes a multi-stage transformation:

```text
[Telemetry Array: 147 bytes]
            │
            ▼ (XOR Stream Cipher with dynamic keys from reg[23])
[Encrypted Buffer: reg[325]]
            │
            ▼ (Header & Checksum Tagging: +9 bytes)
[Raw Output Stream: 156 bytes]
            │
            ▼ (In-VM UTF-8 / Character Mapping: String.fromCharCode)
[Binary String]
            │
            ▼ (window.btoa)
[Base64 Encoded Payload]
            │
            ▼ (.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""))
[Final URL-Safe Token: Q.r]
```

### 5.1 Final Return Envelope
The VM function wraps its execution in a `try/finally` block and returns a structured object:

```json
{
  "r": "Er1XtEIs3T2-eRcZ97qIj-KZSrO7sO4r...",
  "u": undefined,
  "i": 228392,
  "t": 132
}
```

- **`r`:** The Base64URL encrypted telemetry payload sent in the HTTP challenge verification request.
- **`i`:** Total instructions executed in the VM loop (used as a proof-of-work and anti-tamper metric).
- **`t`:** Execution elapsed time in milliseconds (`performance.now() - startTime | 0`).

---

## 6. Research Tooling & Standalone Utilities

This repository provides working tools developed to analyze, disassemble, decrypt, and execute the VM:

### 6.1 `disasm_improved.js` (Fixed Bytecode Disassembler)
Disassembles `bytecode.bin` with 100% accuracy and 0 unknown opcodes across 31,437 instructions. Corrects the `CLOSURE` offset reading bug and bounds all 117 internal closures.
```bash
node disasm_improved.js bytecode.bin > out_improved.txt
```

### 6.2 `datadome_decryptor.py` (Offline Payload Decryptor)
Extracts the 147 raw telemetry bytes from any captured DataDome `r` token using the static 256-byte S-Box (`sbox.json`).
```bash
python3 datadome_decryptor.py "<token_r>"
# Or as JSON:
python3 datadome_decryptor.py "<token_r>" --json
```

### 6.3 `callgraph_extractor.py` (Function Slicer & Call Graph Analyzer)
Scans the disassembled bytecode, isolates all 117 closures, extracts parameter counts, variable captures, referenced strings, and outputs a complete graph to `call_graph.json`.
```bash
python3 callgraph_extractor.py
```

### 6.4 `standalone_runner.js` (Zero-Browser Clean-Room Runner)
Executes the VM in Node.js (~60-100ms) with a genuine CSS Box-Model simulation (`clientWidth` calculation) and sanitized `Error.stack` frames to generate valid tokens without opening Chromium.
```bash
node standalone_runner.js
# Or pipe directly to the decryptor:
node standalone_runner.js --json | jq -r .token_r | python3 datadome_decryptor.py
```
