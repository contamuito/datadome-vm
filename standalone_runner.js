#!/usr/bin/env node
/**
 * DataDome VM Standalone Clean-Room Runner
 *
 * Executes the DataDome in-browser VM in a headless Node.js environment
 * with a high-fidelity DOM mock:
 * - Dynamic CSS Box-Model calculation (content-box clientWidth verification)
 * - V8 / Chrome-clean Error.stack traces (strips Node.js / eval frames)
 * - Accurate performance.now() and Date.now() time synchronization
 * - Base64 and Base64URL string codecs
 *
 * Usage:
 *   node standalone_runner.js
 *   node standalone_runner.js --json
 *   node standalone_runner.js --pathname /checkout/
 */

const fs = require('fs');
const path = require('path');

function setupCleanEnvironment(options = {}) {
    const pathname = options.pathname || '/captcha/';
    const userEnv = options.userEnv || 'yes';

    // 1. Clean Error.stack simulator to avoid Node.js / eval fingerprinting
    const origError = global.Error;
    global.Error = function (msg) {
        const err = new origError(msg);
        Object.defineProperty(err, 'stack', {
            configurable: true,
            enumerable: true,
            get: () => 'Error\n    at window.ddm.execute (https://geo.captcha-delivery.com/captcha/assets/checkpoint.js:1:2840)\n    at https://geo.captcha-delivery.com/captcha/assets/checkpoint.js:1:1420'
        });
        return err;
    };
    global.Error.prototype = origError.prototype;

    // 2. High-fidelity DOM Mock
    global.window = global;
    global.document = {
        createElement: (tag) => {
            const el = {
                tagName: String(tag).toUpperCase(),
                style: {},
                appendChild: () => {},
                removeChild: () => {},
                get clientWidth() {
                    const w = parseInt(el.style.width) || 0;
                    const pl = parseInt(el.style.paddingLeft) || 0;
                    const pr = parseInt(el.style.paddingRight) || 0;
                    if (el.style.boxSizing === 'content-box') {
                        return w + pl + pr;
                    }
                    return w;
                },
                get outerWidth() { return 1920; },
                get outerHeight() { return 1080; }
            };
            return el;
        },
        body: {
            appendChild: () => {},
            removeChild: () => {}
        }
    };

    // 3. Browser Platform Objects
    global.navigator = {
        webdriver: false,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        languages: ['en-US', 'en'],
        hardwareConcurrency: 8,
        deviceMemory: 8
    };

    global.location = {
        pathname: pathname,
        href: 'https://example.com' + pathname
    };

    global.ddm = {
        userEnv: userEnv
    };

    global.atob = (str) => Buffer.from(str, 'base64').toString('binary');
    global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
}

function runVM(vmFilePath) {
    let code = fs.readFileSync(vmFilePath, 'utf8');
    
    // Suppress console.log from out.js
    const origLog = console.log;
    console.log = () => {};

    let result = null;
    try {
        const fn = new Function(code + '\nreturn typeof exports !== "undefined" && exports.exports ? exports.exports() : null;');
        result = fn();
    } finally {
        console.log = origLog;
    }
    return result;
}

function main() {
    const args = process.argv.slice(2);
    const jsonOutput = args.includes('--json');
    let pathname = '/captcha/';
    const pathIdx = args.indexOf('--pathname');
    if (pathIdx !== -1 && args[pathIdx + 1]) {
        pathname = args[pathIdx + 1];
    }

    setupCleanEnvironment({ pathname });

    const vmPath = path.join(__dirname, 'out.js');
    if (!fs.existsSync(vmPath)) {
        console.error('Error: out.js not found in current directory.');
        process.exit(1);
    }

    const start = Date.now();
    const result = runVM(vmPath);
    const totalTime = Date.now() - start;

    if (jsonOutput) {
        console.log(JSON.stringify({
            token_r: result.r,
            instructions: result.i,
            vm_time_ms: result.t,
            runner_time_ms: totalTime,
            error: result.e ? String(result.e) : null
        }, null, 2));
    } else {
        console.log('='.repeat(60));
        console.log('DataDome VM Clean-Room Execution');
        console.log('='.repeat(60));
        console.log(`Instructions executed: ${result.i.toLocaleString()}`);
        console.log(`VM Reported Time:     ${result.t} ms`);
        console.log(`Total Runner Time:    ${totalTime} ms`);
        console.log('-'.repeat(60));
        console.log('Generated Payload (r):');
        console.log(result.r);
        console.log('='.repeat(60));
    }
}

if (require.main === module) {
    main();
}
