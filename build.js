// Builds index.min.html from index.html for the js13kgames submission.
//
//   npm run build
//
// Steps: pull the <style> and <script> blocks out of index.html, minify the
// CSS with a few regexes, minify the JS with terser (top-level mangling, so
// every constant and function name shrinks to one letter), then reassemble
// a minimal HTML shell. Prints the raw and zipped sizes at the end.

const fs = require("fs");
const zlib = require("zlib");
const { execSync } = require("child_process");
const { minify } = require("terser");

const SRC = "index.html";
const OUT = "index.min.html";
const JS13K_LIMIT = 13 * 1024;

async function build() {
  const src = fs.readFileSync(SRC, "utf8");
  const pick = re => (src.match(re) || [, ""])[1];

  const title = pick(/<title>([\s\S]*?)<\/title>/);
  const css = pick(/<style>([\s\S]*?)<\/style>/);
  const js = pick(/<script>([\s\S]*?)<\/script>/);
  const canvas = pick(/(<canvas[^>]*>)/).replace(/="([^"\s]+)"/g, "=$1");

  const minCss = css
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();

  const result = await minify(js, {
    toplevel: true,
    compress: {
      passes: 3,
      unsafe: true,
      unsafe_arrows: true,
      unsafe_math: true,
      unsafe_methods: true,
      booleans_as_integers: true,
      pure_getters: true,
      drop_console: true,
    },
    mangle: { toplevel: true },
    format: { comments: false },
  });
  if (result.error) throw result.error;

  const html =
    `<!doctype html><title>${title}</title><style>${minCss}</style>` +
    `${canvas}</canvas><script>${result.code}</script>`;
  fs.writeFileSync(OUT, html);

  const raw = Buffer.byteLength(html);
  let zipped;
  try {
    // Real zip size, as the compo measures it.
    const zipPath = "index.min.zip";
    execSync(`zip -9 -q -j ${zipPath} ${OUT}`);
    zipped = fs.statSync(zipPath).size;
    fs.unlinkSync(zipPath);
  } catch {
    zipped = zlib.deflateSync(html, { level: 9 }).length + 120; // estimate incl. zip headers
  }

  console.log(`${OUT}: ${raw} bytes raw, ${zipped} bytes zipped`);
  console.log(`js13k budget: ${zipped} / ${JS13K_LIMIT} bytes (${(100 * zipped / JS13K_LIMIT).toFixed(1)}%)`);
  if (zipped > JS13K_LIMIT) {
    console.error("Over the 13 KB limit!");
    process.exit(1);
  }
}

build().catch(e => {
  console.error(e);
  process.exit(1);
});
