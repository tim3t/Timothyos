// Spoken text (2.40.1): what Nova and Moira are given. Times in ship's style (Timothy's choice: 08:00 "oh eight
// hundred", 21:05 "twenty-one oh five") and symbols in words, so a voice never guesses (Nova read 08:00 as "8 OK").
const fs = require('fs'), assert = require('assert');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
const a = src.indexOf('  var VA_SPEECH = '), z = src.indexOf('  function vaTexts(');
assert.ok(a > 0 && z > a, 'the spoken-text rules are where this test expects them');
const speakable = new Function(src.slice(a, z) + '; return speakable;')();
const t = (x, want) => assert.strictEqual(speakable(x), want, x);
t('Five work meetings, first at 08:00 and the last ending at 16:30.', 'Five work meetings, first at oh eight hundred and the last ending at sixteen thirty.');
t('21:05', 'twenty-one oh five'); t('13:30', 'thirteen thirty'); t('00:00', 'zero hundred'); t('00:15', 'zero fifteen');
t('10:00', 'ten hundred'); t('9:45', 'oh nine forty-five'); t('23:59', 'twenty-three fifty-nine'); t('12:01', 'twelve oh one');
t('Open from 13:00 to 15:00.', 'Open from thirteen hundred to fifteen hundred.');
t('41°F rising to 58 °F.', '41 degrees Fahrenheit rising to 58 degrees Fahrenheit.');
t('About 1.2¢ this month', 'About 1.2 cents this month'); t('Mites at 2.8%.', 'Mites at 2.8 percent.');
t('Honey: 64 lb, then 1 lb more.', 'Honey: 64 pounds, then 1 pound more.');
t('Four meetings · hive check GO · 41°F', 'Four meetings, hive check GO, 41 degrees Fahrenheit');
t('Juniper rated 4 of 5; 12:3 is not a time.', 'Juniper rated 4 of 5; 12:3 is not a time.');
console.log('ALL SPOKEN TEXT CHECKS PASSED');
