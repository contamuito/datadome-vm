#!/usr/bin/env python3
"""
DataDome VM Payload Decryptor & Analyzer

Decrypts and inspects the 'r' payload token produced by the DataDome in-browser JavaScript VM.
Uses the static 256-byte S-Box extracted from the VM bytecode.

Usage:
  python3 datadome_decryptor.py "<token_r>"
  python3 datadome_decryptor.py --file token.txt
"""

import sys
import base64
import json
import argparse

# 256-byte keystream / S-Box hardcoded in the VM bytecode (reg[23])
DATADOME_SBOX = [
    45, 88, 224, 195, 201, 95, 157, 15, 93, 123, 4, 239, 81, 202, 208, 187,
    206, 33, 120, 67, 67, 4, 141, 153, 147, 192, 128, 192, 182, 166, 171, 22,
    57, 56, 254, 206, 1, 154, 253, 210, 89, 183, 121, 31, 182, 120, 25, 177,
    183, 89, 142, 254, 189, 136, 145, 242, 174, 93, 69, 17, 239, 52, 204, 116,
    37, 4, 37, 172, 83, 250, 156, 120, 26, 10, 46, 185, 55, 250, 104, 14,
    82, 61, 230, 108, 34, 23, 252, 251, 1, 115, 191, 124, 9, 233, 190, 221,
    89, 203, 176, 18, 116, 131, 161, 118, 194, 61, 101, 248, 51, 28, 147, 122,
    150, 221, 37, 205, 79, 53, 47, 128, 133, 87, 239, 95, 114, 6, 14, 28,
    71, 188, 184, 245, 147, 137, 236, 164, 242, 105, 223, 242, 42, 165, 14, 25,
    46, 33, 27, 48, 228, 195, 134, 42, 204, 14, 251, 206, 241, 201, 192, 187,
    48, 55, 228, 4, 236, 188, 239, 85, 35, 117, 43, 141, 226, 38, 187, 28,
    66, 172, 214, 157, 110, 150, 43, 182, 233, 172, 132, 92, 202, 106, 249, 204,
    194, 206, 122, 245, 132, 101, 116, 121, 165, 235, 14, 42, 152, 149, 181, 145,
    233, 10, 221, 209, 168, 53, 64, 98, 216, 34, 8, 229, 54, 219, 12, 142,
    71, 86, 216, 192, 205, 227, 224, 65, 236, 213, 29, 222, 143, 104, 110, 0,
    253, 107, 140, 52, 120, 102, 131, 113, 65, 79, 242, 225, 1, 60, 153, 136
]

def decrypt_datadome_payload(token_b64: str) -> dict:
    """Decrypt a DataDome VM 'r' token into raw telemetry bytes and metadata."""
    # 1. Base64URL to standard Base64
    clean_b64 = token_b64.strip().replace("-", "+").replace("_", "/")
    pad = len(clean_b64) % 4
    if pad:
        clean_b64 += "=" * (4 - pad)

    raw_enc = base64.b64decode(clean_b64)
    total_len = len(raw_enc)

    # 2. Decrypt the telemetry bytes (first 147 bytes)
    telemetry_len = min(147, total_len)
    decrypted_telemetry = bytearray()
    for i in range(telemetry_len):
        decrypted_telemetry.append(raw_enc[i] ^ DATADOME_SBOX[i])

    # 3. Trailing verification / tag bytes
    tag_bytes = raw_enc[telemetry_len:]

    return {
        "encrypted_length": total_len,
        "telemetry_length": len(decrypted_telemetry),
        "tag_length": len(tag_bytes),
        "decrypted_telemetry": bytes(decrypted_telemetry),
        "tag_bytes": bytes(tag_bytes)
    }

def format_hex_dump(data: bytes, width: int = 16) -> str:
    lines = []
    for i in range(0, len(data), width):
        chunk = data[i:i+width]
        hex_str = " ".join(f"{b:02x}" for b in chunk)
        ascii_str = "".join(chr(b) if 32 <= b <= 126 else "." for b in chunk)
        lines.append(f"{i:04x}:  {hex_str:<{width*3}}  |{ascii_str}|")
    return "\n".join(lines)

def main():
    parser = argparse.ArgumentParser(description="Decrypt DataDome VM 'r' payload tokens.")
    parser.add_argument("token", nargs="?", help="DataDome 'r' Base64URL token")
    parser.add_argument("--file", "-f", help="Read token from file")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    token = None
    if args.file:
        with open(args.file, "r") as f:
            token = f.read().strip()
    elif args.token:
        token = args.token.strip()
    elif not sys.stdin.isatty():
        token = sys.stdin.read().strip()

    if not token:
        parser.print_help()
        sys.exit(1)

    result = decrypt_datadome_payload(token)

    if args.json:
        out = {
            "encrypted_bytes": result["encrypted_length"],
            "telemetry_bytes": result["telemetry_length"],
            "telemetry_hex": result["decrypted_telemetry"].hex(),
            "tag_hex": result["tag_bytes"].hex(),
        }
        print(json.dumps(out, indent=2))
        return

    print("=" * 60)
    print("DataDome VM Payload Decryption Report")
    print("=" * 60)
    print(f"Total Encrypted Length: {result['encrypted_length']} bytes")
    print(f"Raw Telemetry Buffer:   {result['telemetry_length']} bytes (reg[318])")
    print(f"Verification Tag:       {result['tag_length']} bytes (reg[19] checksums)")
    print("-" * 60)
    print("Decrypted Telemetry Hex Dump:")
    print(format_hex_dump(result["decrypted_telemetry"]))
    print("-" * 60)
    print(f"Trailer Tag (Hex): {result['tag_bytes'].hex()}")
    print("=" * 60)

if __name__ == "__main__":
    main()
