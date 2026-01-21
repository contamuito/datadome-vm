// deobfuscate.js
// Usage: node deobfuscate.js input.js > output.js
// haters will say this file has been AI generated!! don't be a hater!!
const fs = require('fs');
const acorn = require('acorn');
const estraverse = require('estraverse');
const escodegen = require('escodegen');

if (process.argv.length < 3) {
    console.error('Usage: node deobfuscate.js input.js > output.js');
    process.exit(2);
}

const inputPath = process.argv[2];
const code = fs.readFileSync(inputPath, 'utf8');
const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script' });

function collectPatternIdentifiers(node, cb) {
    if (!node) return;
    if (node.type === 'Identifier') cb(node.name);
    else if (node.type === 'ObjectPattern') {
        for (const prop of node.properties) {
            if (prop.type === 'Property') collectPatternIdentifiers(prop.value || prop.key, cb);
            if (prop.type === 'RestElement') collectPatternIdentifiers(prop.argument, cb);
        }
    } else if (node.type === 'ArrayPattern') {
        for (const elem of node.elements) if (elem) collectPatternIdentifiers(elem, cb);
    } else if (node.type === 'RestElement') collectPatternIdentifiers(node.argument, cb);
    else if (node.type === 'AssignmentPattern') collectPatternIdentifiers(node.left || node, cb);
    else if (node.type === 'Property') collectPatternIdentifiers(node.value, cb);
}

function isDeclarationIdentifier(node, parent) {
    if (!parent) return false;
    if (parent.type === 'VariableDeclarator' && parent.id === node) return true;
    if ((parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression' || parent.type === 'ArrowFunctionExpression') && parent.id === node) return true;
    if ((parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression' || parent.type === 'ArrowFunctionExpression') && parent.params && parent.params.includes(node)) return true;
    if (parent.type === 'ClassDeclaration' && parent.id === node) return true;
    if (parent.type === 'CatchClause' && parent.param === node) return true;
    return false;
}

function isPropertyKey(node, parent) {
    if (!parent) return false;
    if (parent.type === 'Property' && parent.key === node && parent.computed === false) return true;
    if (parent.type === 'MethodDefinition' && parent.key === node && parent.computed === false) return true;
    if (parent.type === 'MemberExpression' && parent.property === node && parent.computed === false) return true;
    return false;
}

function isAssignmentTarget(node, parent) {
    if (!parent) return false;
    if (parent.type === 'AssignmentExpression' && parent.left === node) return true;
    if (parent.type === 'UpdateExpression' && parent.argument === node) return true;
    if ((parent.type === 'ForStatement' || parent.type === 'ForInStatement' || parent.type === 'ForOfStatement') && parent.init === node) return true;
    return false;
}

function isMemberObject(node, parent) {
    return parent && parent.type === 'MemberExpression' && parent.object === node;
}

function isMemberPropertyNonComputed(node, parent) {
    return parent && parent.type === 'MemberExpression' && parent.property === node && parent.computed === false;
}

function isCallee(node, parent) {
    return parent && (parent.type === 'CallExpression' || parent.type === 'NewExpression') && parent.callee === node;
}

function numberNode(value) {
    if (typeof value === 'number' && value < 0) {
        return {
            type: 'UnaryExpression',
            operator: '-',
            prefix: true,
            argument: { type: 'Literal', value: Math.abs(value), raw: String(Math.abs(value)) }
        };
    }
    return { type: 'Literal', value, raw: String(value) };
}

function evalBinary(op, a, b) {
    switch (op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return a / b;
        case '%': return a % b;
        case '<<': return a << b;
        case '>>': return a >> b;
        case '>>>': return a >>> b;
        case '|': return a | b;
        case '&': return a & b;
        case '^': return a ^ b;
        default: return null;
    }
}
function evalUnary(op, a) {
    switch (op) {
        case '+': return +a;
        case '-': return -a;
        case '~': return ~a;
        case '!': return !a ? 1 : 0;
        default: return null;
    }
}
function foldConstants(node) {
    if (!node || typeof node !== 'object') return node;
    if (node.type === 'BinaryExpression') {
        node.left = foldConstants(node.left);
        node.right = foldConstants(node.right);
        if (node.left && node.right && node.left.type === 'Literal' && node.right.type === 'Literal' &&
            typeof node.left.value === 'number' && typeof node.right.value === 'number') {
            const val = evalBinary(node.operator, node.left.value, node.right.value);
            if (val !== null && Number.isFinite(val)) return numberNode(val);
        }
    } else if (node.type === 'UnaryExpression') {
        node.argument = foldConstants(node.argument);
        if (node.argument && node.argument.type === 'Literal' && typeof node.argument.value === 'number') {
            const val = evalUnary(node.operator, node.argument.value);
            if (val !== null && (typeof val === 'number' || typeof val === 'boolean')) return numberNode(val);
        }
    } else if (node.type === 'LogicalExpression') {
        node.left = foldConstants(node.left);
        node.right = foldConstants(node.right);
        if (node.left && node.right && node.left.type === 'Literal' && node.right.type === 'Literal') {
            try {
                const lv = node.left.value;
                const rv = node.right.value;
                let res;
                if (node.operator === '&&') res = lv && rv;
                if (node.operator === '||') res = lv || rv;
                return { type: 'Literal', value: res, raw: String(res) };
            } catch (e) {}
        }
    } else if (node.type === 'ConditionalExpression') {
        node.test = foldConstants(node.test);
        node.consequent = foldConstants(node.consequent);
        node.alternate = foldConstants(node.alternate);
        if (node.test && node.test.type === 'Literal') {
            return node.test.value ? node.consequent : node.alternate;
        }
    } else if (node.type === 'ArrayExpression') {
        node.elements = node.elements.map(e => foldConstants(e));
    } else if (node.type === 'ObjectExpression') {
        node.properties = node.properties.map(p => {
            if (p.value) p.value = foldConstants(p.value);
            return p;
        });
    }
    return node;
}

// initial collection
const declCount = Object.create(null);
const tentativeMap = Object.create(null);

estraverse.traverse(ast, {
    enter(node) {
        if (node.type === 'VariableDeclaration') {
            for (const decl of node.declarations) {
                if (decl.id && decl.id.type === 'Identifier') {
                    const name = decl.id.name;
                    declCount[name] = (declCount[name] || 0) + 1;
                    if (decl.init && decl.init.type === 'Literal' && typeof decl.init.value === 'number') {
                        tentativeMap[name] = decl.init.value;
                    }
                } else if (node.declarations) {
                    for (const d of node.declarations) collectPatternIdentifiers(d.id, n => { declCount[n] = (declCount[n] || 0) + 1; });
                }
            }
        }
    }
});

// conservative invalidation
const invalid = new Set();

estraverse.traverse(ast, {
    enter(node, parent) {
        if (node.type === 'AssignmentExpression') {
            const left = node.left;
            if (left.type === 'Identifier') invalid.add(left.name);
            else collectPatternIdentifiers(left, n => invalid.add(n));
        }
        if (node.type === 'UpdateExpression') {
            const arg = node.argument;
            if (arg.type === 'Identifier') invalid.add(arg.name);
            else collectPatternIdentifiers(arg, n => invalid.add(n));
        }
        if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
            for (const p of node.params) collectPatternIdentifiers(p, n => invalid.add(n));
            if (node.id && node.id.type === 'Identifier') invalid.add(node.id.name);
        }
        if (node.type === 'VariableDeclarator' && node.id && node.id.type !== 'Identifier') {
            collectPatternIdentifiers(node.id, n => invalid.add(n));
        }
        if (node.type === 'CatchClause' && node.param) collectPatternIdentifiers(node.param, n => invalid.add(n));
        if (node.type === 'ForInStatement' || node.type === 'ForOfStatement' || node.type === 'ForStatement') {
            if (node.left) collectPatternIdentifiers(node.left, n => invalid.add(n));
        }
        if (node.type === 'ImportSpecifier' || node.type === 'ImportDefaultSpecifier' || node.type === 'ImportNamespaceSpecifier') {
            if (node.local && node.local.type === 'Identifier') invalid.add(node.local.name);
        }
    }
});

for (const name of Object.keys(declCount)) {
    if (declCount[name] > 1) invalid.add(name);
}
for (const name of Object.keys(tentativeMap)) {
    if (invalid.has(name)) delete tentativeMap[name];
}

// helper: attempt to fold an initializer to numeric using current constMap
function tryFoldInitToNumber(initNode, constMap) {
    if (!initNode) return null;
    // clone the node to avoid mutating original AST
    const nodeClone = JSON.parse(JSON.stringify(initNode));
    // replace identifiers inside clone using constMap where safe (in the subtree)
    const replaced = estraverse.replace(nodeClone, {
        enter(n, parent) {
            if (n && n.type === 'Identifier' && Object.prototype.hasOwnProperty.call(constMap, n.name)) {
                // check safety relative to parent in the subtree
                if (isDeclarationIdentifier(n, parent)) return;
                if (isPropertyKey(n, parent)) return;
                if (isAssignmentTarget(n, parent)) return;
                if (isMemberObject(n, parent)) return;
                if (isMemberPropertyNonComputed(n, parent)) return;
                if (isCallee(n, parent)) return;
                return numberNode(constMap[n.name]);
            }
        }
    });
    const folded = foldConstants(replaced);
    if (folded && folded.type === 'Literal' && typeof folded.value === 'number') return folded.value;
    return null;
}

// iterative propagation: if some var's init can be resolved to number given known constants, add it
const finalConstMap = Object.create(null);
for (const k of Object.keys(tentativeMap)) finalConstMap[k] = tentativeMap[k];

let changed = true;
while (changed) {
    changed = false;
    estraverse.traverse(ast, {
        enter(node) {
            if (node.type === 'VariableDeclarator' && node.id && node.id.type === 'Identifier') {
                const name = node.id.name;
                if (Object.prototype.hasOwnProperty.call(finalConstMap, name)) return;
                if (invalid.has(name)) return;
                const init = node.init;
                // if init is missing, skip
                if (!init) return;
                const val = tryFoldInitToNumber(init, finalConstMap);
                if (val !== null) {
                    finalConstMap[name] = val;
                    changed = true;
                }
            }
        }
    });
}

// remove any that later became invalid
for (const name of Object.keys(finalConstMap)) if (invalid.has(name)) delete finalConstMap[name];

// compute final safe-to-replace predicate for global replacement
function safeToReplace(node, parent) {
    if (!parent || !node || node.type !== 'Identifier') return false;
    if (!Object.prototype.hasOwnProperty.call(finalConstMap, node.name)) return false;
    if (isDeclarationIdentifier(node, parent)) return false;
    if (isPropertyKey(node, parent)) return false;
    if (isAssignmentTarget(node, parent)) return false;
    if (parent.type === 'LabeledStatement' && parent.label === node) return false;
    if (parent.type === 'BreakStatement' && parent.label === node) return false;
    if (parent.type === 'ContinueStatement' && parent.label === node) return false;
    if (isMemberObject(node, parent)) return false;
    if (isMemberPropertyNonComputed(node, parent)) return false;
    if (isCallee(node, parent)) return false;
    // computed member property (A[c]) is fine to replace the property Identifier
    return true;
}

// apply global replacement using finalConstMap
const replacedAst = estraverse.replace(ast, {
    enter(node, parent) {
        if (node && node.type === 'Identifier' && safeToReplace(node, parent)) {
            return numberNode(finalConstMap[node.name]);
        }
    }
});

// fold constants globally
const foldedAst = estraverse.replace(replacedAst, {
    enter(node) {
        const f = foldConstants(node);
        if (f !== node) return f;
    }
});

// remove declarations for variables in finalConstMap whose initializer was a pure numeric expression (now literal)
const cleanedAst = estraverse.replace(foldedAst, {
    enter(node, parent) {
        if (node.type === 'VariableDeclaration') {
            const keep = [];
            for (const decl of node.declarations) {
                if (decl.id && decl.id.type === 'Identifier' && Object.prototype.hasOwnProperty.call(finalConstMap, decl.id.name)) {
                    // skip this declarator (we inlined it)
                    continue;
                }
                keep.push(decl);
            }
            if (keep.length === 0) return this.remove();
            if (keep.length !== node.declarations.length) {
                node.declarations = keep;
                return node;
            }
        }
    }
});

const output = escodegen.generate(cleanedAst, { format: { indent: { style: '  ' } } });
process.stdout.write(output);
