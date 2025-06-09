#!/usr/bin/env ts-node

import { formatDate } from "./dateUtils";

let testsPassed = 0;
let testsFailed = 0;

const testResults: string[] = [];

const runTest = (description: string, testFn: () => void) => {
    try {
        testFn();
        testResults.push(`[PASS] ${description}`);
        testsPassed++;
    } catch (e: any) {
        testResults.push(`[FAIL] ${description}: ${String(e.message)}`);
        testsFailed++;
    }
};

// Test cases
runTest("formats a known timestamp correctly (01/01/2023 08:05)", () => {
    const fixedTimestamp = new Date(2023, 0, 1, 8, 5, 0).getTime();
    const fixedExpected = "01/01/2023 08:05";
    const actual = formatDate(fixedTimestamp);
    if (actual !== fixedExpected) {
        throw new Error(`Expected ${fixedExpected}, got ${actual}`);
    }
});

runTest("pads single digit day and month (05/03/2024 07:09)", () => {
    const timestamp = new Date(2024, 2, 5, 7, 9).getTime();
    const expected = "05/03/2024 07:09";
    const actual = formatDate(timestamp);
    if (actual !== expected) {
        throw new Error(`Expected ${expected}, got ${actual}`);
    }
});

runTest("pads single digit hour and minute (15/11/2022 03:04)", () => {
    const timestamp = new Date(2022, 10, 15, 3, 4).getTime();
    const expected = "15/11/2022 03:04";
    const actual = formatDate(timestamp);
    if (actual !== expected) {
        throw new Error(`Expected ${expected}, got ${actual}`);
    }
});

runTest("formats another known timestamp correctly (22/05/2025 12:30)", () => {
    const timestamp = new Date(2025, 4, 22, 12, 30, 0).getTime();
    const expected = "22/05/2025 12:30";
    const actual = formatDate(timestamp);
    if (actual !== expected) {
        throw new Error(`Expected ${expected}, got ${actual}`);
    }
});

// Print all results
testResults.forEach(result => console.log(result));

// Summary
console.log(`\nTests Summary: ${testsPassed} passed, ${testsFailed} failed.`);

// Exit with a non-zero code if tests failed
if (testsFailed > 0) {
    console.error(`\n${testsFailed} test(s) failed. Exiting with error code 1.`);
    process.exit(1);
} else {
    console.log("\nAll tests passed. Exiting with code 0.");
    process.exit(0);
}
