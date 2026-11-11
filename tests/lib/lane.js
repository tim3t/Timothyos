// Which copy of each simulated server this test's lane uses (D76). run.sh starts several copies of the busy simulated
// bridges (8103, 8104, 8105) so long lanes can split, and gives each lane PORT_8103/8104/8105. Tests read them as
// P8103/P8104/P8105, in Node and, through lane(ctxOrPage), inside the page too (code passed to page.evaluate runs there).
const P = { P8103: process.env.PORT_8103 || '8103', P8104: process.env.PORT_8104 || '8104', P8105: process.env.PORT_8105 || '8105' };
async function lane(target) { await target.addInitScript((p) => { Object.assign(window, p); }, P); }
module.exports = Object.assign({ lane }, P);
