import assert from "node:assert/strict";
import fs from "node:fs";

const css = `${fs.readFileSync("styles/intro.css", "utf8")}\n${fs.readFileSync("styles/responsive.css", "utf8")}`;

const defaultChoicesRule = css.match(/\.intro-choices\s*\{(?<body>[\s\S]*?)\}/);
assert.ok(defaultChoicesRule, "intro choices default rule exists");
assert.match(defaultChoicesRule.groups.body, /opacity:\s*0\s*;/, "intro choices are hidden before the reveal timer in the normal-motion path");
assert.match(defaultChoicesRule.groups.body, /pointer-events:\s*none\s*;/, "intro choices ignore pointer events before the reveal timer in the normal-motion path");

const focusWithinRule = css.match(/\.intro-choices:focus-within\s*\{(?<body>[\s\S]*?)\}/);
assert.ok(
    focusWithinRule,
    "keyboard focus before the reveal timer must reveal .intro-choices so focused Resume/Blog/Resources links have a visible indicator"
);
assert.match(focusWithinRule.groups.body, /opacity:\s*1\s*;/, "focus-within reveal makes hidden choices visible");
assert.match(focusWithinRule.groups.body, /pointer-events:\s*auto\s*;/, "focus-within reveal restores interaction state");
assert.match(focusWithinRule.groups.body, /transform:\s*(?:none|translateY\(0\))\s*;/, "focus-within reveal removes the hidden offset");

console.log("SBR-001 keyboard focus regression assertions passed");
