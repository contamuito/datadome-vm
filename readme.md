# datadome vm

### Summary
This repository documents the first public version of DataDome’s in-browser JavaScript virtual machine (VM) used in their CAPTCHA/interstitial flow. The writeup explains how the VM loads and decodes bytecode, the VM memory layout, and includes a short proof-of-concept disassembler and control-flow notes.

> Note: this repository covers only the first (static) VM version and is intended for analysis and research. It does not include dynamic solvers or a production solver API.

### Background
On the 14.01.2026 DataDome began shipping a new VM-based component in their client tag (the plv3 parameter / vm.js file is used to generate the bytecode).

### Getting started
The VM code analyzed has been extracted into `vm.js` (available in the repository). 

The first step was deobfuscating the script.
<img src="/assets/1.png">

It's nothing special, evaluate each variable and replace it. For the people who care, a small script is in [deobf.js](deobf.js).

## actual beginning
pasting the [out.js](out.js) into devtools shows us the expected result of the vm.
<img src="/assets/2.png">

a json containing two numbers and a string. Let's dive into the actual script now.

<img src="/assets/3.png">

looking at the start of the Q.exports function we can immediately spot, how the bytecode is being decoded.
it first base64 decodes the string and then creates an array with the length of 129263. After that it checks whether the index is between a certain range, if it is, it will decode the value, otherwise it will return a random number. (B() is a pseudo random number generator).

<img src="/assets/4.png">

scrolling down a bit further, shows us the actual start of the vm. A function being called with "A", the bytecode and "Q", an empty dict (used for errors).

that was the time i spotted something unique about this vm: It has one Array (A) for everything!! The array contains the stack, registers, opcodes, the bytecode itself and even the instruction pointer. Just like in an actual computer with certain memory regions. Now our goal is to make sense of each "offset" and find out what is stored where.
I went ahead and did that:
```js
var stack_pointer = 4593
var instruction_pointer = 4635
var frame_base_pointer = 4674
var last_result = 4633
var exit_flag = 4656
var current_opcode_handler = 4685
var current_opcode_id = 4675
var stack_offset = 124482
var vm_start = 5258
```

<img src="/assets/5.png">

after that, the VM actually starts to make sense, doesn't it?
The VM starts of by having a bunch of helper functions, like reading certain types of values from the stack or moving stuff between the stack and "registers"

<img src="/assets/6.png">

after all the helper function, the VM initializes some values like the pointers, the exit flag and last result. And below that are all the instructions.

<img src="/assets/7.png">

below the opcodes is the dispatcher of the VM (The loop that runs until the exit_flag has been set)
"I" is the current instruction, but since it's obfuscated, "P" is the actual offset for the array. Then it sets the instruction to the current_opcode_handler and the opcode id.

## Opcodes

> how do they even work in this VM?

<img src="/assets/8.png">

here is the most basic example: It gets an immediate Value from the bytecode, then the thing that's ontop of the stack and performs and operation with it. "%=" & "^=" in this case.
at the end of each instruction, it calls the fetch() function. 

```js
function fetch() {
    var Q = A[instruction_pointer];
    var B = A[vm_start + Q];
    A[instruction_pointer] = Q + 1;
    var E = A[4783 + B];
    A[current_opcode_handler] = E;
    A[current_opcode_id] = B;
}
```

this is basically the same thing as in the dispatcher aka. setting things up for the next instruction.