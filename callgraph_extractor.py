#!/usr/bin/env python3
"""
DataDome VM Call Graph & Function Slicer

Parses the clean disassembly (out_improved.txt) to identify and slice
all 117 closure functions, their parameters, captured variables,
referenced strings, and call relationships.

Usage:
  python3 callgraph_extractor.py
"""

import re
import json
import sys

def parse_disassembly(filename="out_improved.txt"):
    with open(filename, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()

    # Step 1: Scan for all closures
    closures = []
    # e.g.: 0045bb:  88 0e 00                 CLOSURE locals=14, body=L_45c1
    closure_pattern = re.compile(r"([0-9a-fA-F]+):\s+([0-9a-fA-F\s]+)\s+CLOSURE locals=(\d+)(?:, captures=\[([^\]]*)\])?, body=(L_[0-9a-fA-F]+)")
    jmp_pattern = re.compile(r"([0-9a-fA-F]+):\s+([0-9a-fA-F\s]+)\s+JMP_FWD\s+(L_[0-9a-fA-F]+)")

    for i, line in enumerate(lines):
        m = closure_pattern.search(line)
        if m:
            addr_hex = m.group(1)
            locals_cnt = int(m.group(3))
            captures_str = m.group(4) or ""
            captures = [int(c) for c in captures_str.split(",") if c.strip()]
            body_label = m.group(5)

            # Find matching JMP_FWD right after
            end_label = None
            if i + 1 < len(lines):
                m_jmp = jmp_pattern.search(lines[i+1])
                if m_jmp:
                    end_label = m_jmp.group(3)

            closures.append({
                "decl_addr": f"0x{addr_hex}",
                "body_label": body_label,
                "end_label": end_label,
                "locals": locals_cnt,
                "captures": captures,
                "line_idx": i
            })

    print(f"Discovered {len(closures)} closures in bytecode.")

    # Step 2: Slice each function's instructions, strings, and calls
    label_to_line = {}
    for i, line in enumerate(lines):
        m_lbl = re.match(r"^(L_[0-9a-fA-F]+):", line.strip())
        if m_lbl:
            label_to_line[m_lbl.group(1)] = i

    functions = []
    for idx, c in enumerate(closures):
        body_lbl = c["body_label"]
        end_lbl = c["end_label"]
        start_line = label_to_line.get(body_lbl)
        end_line = label_to_line.get(end_lbl) if end_lbl else None

        if start_line is None:
            continue

        if end_line is None or end_line <= start_line:
            # Fallback to next closure start or EOF
            if idx + 1 < len(closures):
                next_c = closures[idx + 1]
                end_line = label_to_line.get(next_c["body_label"], len(lines))
            else:
                end_line = len(lines)

        func_lines = lines[start_line:end_line]
        
        # Collect strings, calls, and registers used in this function
        strings = set()
        calls = 0
        branches = 0
        opcodes_used = set()

        for f_line in func_lines:
            # Extract string literals
            s_matches = re.findall(r"\"([^\"]*)\"", f_line)
            for s in s_matches:
                if s:
                    strings.add(s)

            # Check calls
            if "CALL" in f_line:
                calls += 1
            if any(j in f_line for j in ["JMP", "JZ", "JNZ"]):
                branches += 1

            # Opcode name
            m_op = re.search(r"\s+([A-Z0-9_]+)(?:\s+|$)", f_line)
            if m_op:
                opcodes_used.add(m_op.group(1))

        functions.append({
            "id": f"fn_{idx:03d}",
            "declaration": c["decl_addr"],
            "entry_label": body_lbl,
            "exit_label": end_lbl,
            "instructions_count": len(func_lines),
            "locals_count": c["locals"],
            "captures_count": len(c["captures"]),
            "captures": c["captures"],
            "calls_made": calls,
            "branches_count": branches,
            "referenced_strings": sorted(list(strings)),
            "opcodes_used": sorted(list(opcodes_used))
        })

    # Summary analysis
    print(f"Successfully sliced {len(functions)} discrete functions.")

    output_path = "call_graph.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(functions, f, indent=2)
    print(f"Exported call graph to {output_path}")

    # Top interesting functions (with identified string signatures)
    print("\nNotable Functions Identified:")
    for fn in functions:
        if fn["referenced_strings"]:
            print(f" - {fn['id']} ({fn['entry_label']}): {fn['instructions_count']} insns, strings: {fn['referenced_strings']}")

if __name__ == "__main__":
    parse_disassembly()
