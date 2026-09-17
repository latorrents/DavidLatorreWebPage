/*
 * Latorredev — matrix effects
 *  1. Digital rain on the background canvas
 *  2. The white rabbit drawn as ASCII on a canvas that scales with the viewport
 *  3. Text "decoding" intro (inspired by musicforprogramming.net)
 */
(function () {
	'use strict';

	var FONT = "'Share Tech Mono', ui-monospace, monospace";
	var GREEN = '#00ff41';
	var KATAKANA = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ';
	var RAIN_GLYPHS = KATAKANA + '0123456789Z:.=*+-<>¦|';
	var NOISE_GLYPHS = '—~±§|[].+$^@*()•x%!?#' + KATAKANA.slice(0, 12);

	var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	function pick(set) { return set[(Math.random() * set.length) | 0]; }
	function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

	/* ------------------------------------------------------------------ */
	/* 1. Digital rain                                                     */
	/* ------------------------------------------------------------------ */

	function Rain(canvas) {
		var ctx = canvas.getContext('2d');
		var size, cols, drops, w, h, last = 0;

		function resize() {
			if (w === window.innerWidth && window.innerHeight <= h) return;
			var dpr = Math.min(window.devicePixelRatio || 1, 2);
			w = window.innerWidth;
			h = window.innerHeight;
			canvas.width = w * dpr;
			canvas.height = h * dpr;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			size = w < 600 ? 14 : 18;
			cols = Math.ceil(w / size);
			drops = [];
			for (var i = 0; i < cols; i++) {
				drops.push({ y: Math.random() * -h / size, speed: 0.35 + Math.random() * 0.75 });
			}
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, w, h);
			if (reduceMotion) paintStatic();
		}

		function paintStatic() {
			ctx.font = size + 'px ' + FONT;
			for (var i = 0; i < cols; i++) {
				var len = (Math.random() * 18) | 0;
				var y0 = (Math.random() * h / size) | 0;
				for (var j = 0; j < len; j++) {
					ctx.fillStyle = 'rgba(0,255,65,' + (0.05 + 0.35 * j / len) + ')';
					ctx.fillText(pick(RAIN_GLYPHS), i * size, (y0 + j) * size);
				}
			}
		}

		function frame(t) {
			requestAnimationFrame(frame);
			if (t - last < 45 || document.hidden) return;
			last = t;

			ctx.fillStyle = 'rgba(0,0,0,0.09)';
			ctx.fillRect(0, 0, w, h);
			ctx.font = size + 'px ' + FONT;

			for (var i = 0; i < cols; i++) {
				var d = drops[i];
				var prev = Math.floor(d.y);
				d.y += d.speed;
				var row = Math.floor(d.y);
				if (row === prev) continue;
				var x = i * size, y = row * size;
				// repaint the previous head in green, new head in near-white
				ctx.fillStyle = GREEN;
				ctx.fillText(pick(RAIN_GLYPHS), x, y - size);
				ctx.fillStyle = '#d6ffe0';
				ctx.fillText(pick(RAIN_GLYPHS), x, y);
				if (y > h && Math.random() > 0.975) {
					d.y = Math.random() * -20;
					d.speed = 0.35 + Math.random() * 0.75;
				}
			}
		}

		resize();
		window.addEventListener('resize', debounce(resize, 150));
		if (!reduceMotion) requestAnimationFrame(frame);
	}

	/* ------------------------------------------------------------------ */
	/* 2. ASCII rabbit                                                     */
	/* ------------------------------------------------------------------ */

	function Rabbit(canvas, art) {
		var ctx = canvas.getContext('2d');
		var ROWS = art.length;
		var COLS = art.reduce(function (m, l) { return Math.max(m, l.length); }, 0);
		var ASPECT = 2; // cell height / cell width, same as the original render

		// cells that contain ink, grouped per column so rain drops can hit them
		var cells = [];
		var byCol = [];
		for (var c = 0; c < COLS; c++) byCol.push([]);
		art.forEach(function (line, r) {
			for (var c = 0; c < line.length; c++) {
				if (line[c] !== ' ') {
					var cell = { r: r, c: c, ch: line[c], reveal: 0, glitch: 0, glow: 0 };
					cells.push(cell);
					byCol[c].push(cell);
				}
			}
		});

		var cw, chH, dpr, base = document.createElement('canvas');
		var state = 'idle'; // 'intro' | 'idle'
		var introStart = 0, INTRO_MS = 2200;
		var drops = [];
		var pointer = null;
		var onIntroDone = null;

		function resize() {
			var box = canvas.parentElement.getBoundingClientRect();
			dpr = Math.min(window.devicePixelRatio || 1, 3);
			cw = Math.min(box.width / COLS, box.height / (ROWS * ASPECT));
			if (!isFinite(cw) || cw <= 0) cw = box.width / COLS;
			chH = cw * ASPECT;
			var cssW = cw * COLS, cssH = chH * ROWS;
			canvas.style.width = cssW + 'px';
			canvas.style.height = cssH + 'px';
			canvas.width = Math.round(cssW * dpr);
			canvas.height = Math.round(cssH * dpr);
			base.width = canvas.width;
			base.height = canvas.height;
			paintBase();
			draw(performance.now(), true);
		}

		function fontFor(ctx2) {
			// glyphs a touch smaller than the line so rows breathe like a terminal
			ctx2.font = (chH * 0.92) + 'px ' + FONT;
			ctx2.textAlign = 'center';
			ctx2.textBaseline = 'middle';
		}

		function paintBase() {
			var b = base.getContext('2d');
			b.setTransform(dpr, 0, 0, dpr, 0, 0);
			b.clearRect(0, 0, base.width, base.height);
			fontFor(b);
			b.shadowColor = 'rgba(0,255,65,0.55)';
			b.shadowBlur = Math.max(2, cw * 0.8);
			b.fillStyle = GREEN;
			cells.forEach(function (cell) {
				b.fillText(cell.ch, (cell.c + 0.5) * cw, (cell.r + 0.5) * chH);
			});
		}

		function glyph(cell, ch, color, blur) {
			var x = cell.c * cw, y = cell.r * chH;
			ctx.clearRect(x - 1, y, cw + 2, chH);
			if (!ch) return;
			ctx.shadowBlur = blur;
			ctx.fillStyle = color;
			ctx.fillText(ch, x + cw / 2, y + chH / 2);
		}

		function spawnDrop() {
			var col = (Math.random() * COLS) | 0;
			if (!byCol[col].length) return;
			drops.push({ col: col, y: -Math.random() * 10, speed: 0.25 + Math.random() * 0.45 });
		}

		function draw(now, force) {
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			fontFor(ctx);
			ctx.shadowColor = 'rgba(0,255,65,0.9)';

			if (state === 'intro') {
				// top-down decode: noise front sweeps over the rabbit, leaving the real glyphs
				var p = Math.min(1, (now - introStart) / INTRO_MS);
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				var front = p * (ROWS + 12) - 6;
				cells.forEach(function (cell) {
					var d = front - cell.r + (Math.sin(cell.c * 0.7) * 2);
					if (d < 0) return;
					if (d < 5) glyph(cell, pick(NOISE_GLYPHS), d < 1.5 ? '#eafff0' : GREEN, cw);
					else glyph(cell, cell.ch, GREEN, cw * 0.8);
				});
				if (p >= 1) {
					state = 'idle';
					ctx.clearRect(0, 0, canvas.width, canvas.height);
					ctx.drawImage(base, 0, 0, canvas.width / dpr, canvas.height / dpr);
					if (onIntroDone) onIntroDone();
				}
				return;
			}

			// idle: base image + only the cells that are currently animated
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(base, 0, 0, canvas.width / dpr, canvas.height / dpr);
			if (reduceMotion && !force) return;

			// rain drops falling through the rabbit light up the glyphs they touch
			for (var i = drops.length - 1; i >= 0; i--) {
				var drop = drops[i];
				drop.y += drop.speed;
				var list = byCol[drop.col];
				for (var k = 0; k < list.length; k++) {
					var dist = drop.y - list[k].r;
					if (dist >= 0 && dist < 1) list[k].glow = 1;
				}
				if (drop.y > ROWS + 2) drops.splice(i, 1);
			}
			if (drops.length < Math.max(6, COLS / 8) && Math.random() < 0.35) spawnDrop();

			// random background glitches
			if (Math.random() < 0.5) {
				var victim = cells[(Math.random() * cells.length) | 0];
				victim.glitch = 4 + (Math.random() * 10) | 0;
			}

			// pointer / touch scrambles the glyphs around it
			if (pointer) {
				var R = 4.5;
				cells.forEach(function (cell) {
					var dx = cell.c - pointer.c, dy = (cell.r - pointer.r) * ASPECT;
					if (dx * dx + dy * dy < R * R * ASPECT && Math.random() < 0.45) cell.glitch = 3;
				});
			}

			cells.forEach(function (cell) {
				if (cell.glow > 0.05) {
					var head = cell.glow > 0.9;
					glyph(cell, head ? pick(RAIN_GLYPHS) : cell.ch,
						head ? '#f0fff4' : 'rgba(170,255,190,' + (0.45 + cell.glow * 0.55) + ')', cw * 1.6);
					cell.glow *= 0.86;
				} else if (cell.glitch > 0) {
					glyph(cell, Math.random() < 0.15 ? '' : pick(NOISE_GLYPHS), GREEN, cw);
					cell.glitch--;
				}
			});
			ctx.shadowBlur = 0;
		}

		function setPointer(e) {
			var rect = canvas.getBoundingClientRect();
			pointer = {
				c: (e.clientX - rect.left) / cw,
				r: (e.clientY - rect.top) / chH
			};
		}
		canvas.addEventListener('pointermove', setPointer);
		canvas.addEventListener('pointerdown', function (e) {
			setPointer(e);
			// burst: a volley of drops starting where you tapped
			for (var i = 0; i < 14; i++) {
				var col = Math.max(0, Math.min(COLS - 1, Math.round(pointer.c + (Math.random() - 0.5) * 30)));
				drops.push({ col: col, y: pointer.r - Math.random() * 6, speed: 0.5 + Math.random() * 0.6 });
			}
		});
		canvas.addEventListener('pointerleave', function () { pointer = null; });
		canvas.addEventListener('pointerup', function (e) { if (e.pointerType !== 'mouse') pointer = null; });

		var last = 0, running = false;
		function run() {
			if (running || reduceMotion) return;
			running = true;
			requestAnimationFrame(loop);
		}
		function loop(t) {
			requestAnimationFrame(loop);
			if (document.hidden || t - last < 40) return;
			last = t;
			draw(t);
		}

		window.addEventListener('resize', debounce(resize, 100));
		if (window.ResizeObserver) new ResizeObserver(debounce(resize, 100)).observe(canvas.parentElement);
		resize();

		return {
			intro: function () {
				return new Promise(function (resolve) {
					if (reduceMotion) { resolve(); return; }
					state = 'intro';
					introStart = performance.now();
					onIntroDone = resolve;
					ctx.clearRect(0, 0, canvas.width, canvas.height);
					run();
				});
			},
			start: run,
			repaint: function () { paintBase(); draw(performance.now(), true); }
		};
	}

	/* ------------------------------------------------------------------ */
	/* 3. Text decoding                                                    */
	/* ------------------------------------------------------------------ */

	function textNodes(el) {
		var out = [];
		var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
			acceptNode: function (n) {
				return n.parentElement.closest('.cursor') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
			}
		});
		while (walker.nextNode()) out.push(walker.currentNode);
		return out;
	}

	// Reveals text left to right with a band of noise glyphs ahead of the cursor.
	function decode(el, duration) {
		var nodes = textNodes(el);
		var originals = nodes.map(function (n) { return n.nodeValue; });
		var total = originals.reduce(function (s, t) { return s + t.length; }, 0);
		var BAND = 8;
		el.classList.add('is-live');
		if (reduceMotion) return Promise.resolve();

		duration = duration || Math.min(1400, 180 + total * 14);
		var start = performance.now();
		el.style.minHeight = el.offsetHeight + 'px'; // keep layout still while text grows

		return new Promise(function (resolve) {
			(function step(now) {
				var p = Math.min(1, (now - start) / duration);
				var shown = Math.floor(p * (total + BAND));
				var offset = 0;
				nodes.forEach(function (node, i) {
					var src = originals[i], out = '';
					for (var j = 0; j < src.length; j++) {
						var idx = offset + j;
						if (idx < shown - BAND || /\s/.test(src[j])) out += src[j];
						else if (idx < shown) out += pick(NOISE_GLYPHS);
						else break;
					}
					node.nodeValue = out;
					offset += src.length;
				});
				if (p < 1) requestAnimationFrame(step);
				else {
					nodes.forEach(function (n, i) { n.nodeValue = originals[i]; });
					el.style.minHeight = '';
					resolve();
				}
			})(start);
		});
	}

	// Quick scramble on hover for inline links.
	function hoverScramble(a) {
		var node = textNodes(a)[0];
		if (!node) return;
		var original = node.nodeValue, busy = false;
		a.addEventListener('mouseenter', function () {
			if (busy || reduceMotion) return;
			busy = true;
			var frames = 0;
			(function tick() {
				frames++;
				var fixed = Math.floor(frames / 10 * original.length);
				node.nodeValue = original.split('').map(function (ch, i) {
					return i < fixed || ch === ' ' ? ch : pick(NOISE_GLYPHS);
				}).join('');
				if (frames < 10) setTimeout(tick, 35);
				else { node.nodeValue = original; busy = false; }
			})();
		});
	}

	function debounce(fn, ms) {
		var id;
		return function () { clearTimeout(id); id = setTimeout(fn, ms); };
	}

	/* ------------------------------------------------------------------ */
	/* Boot                                                                */
	/* ------------------------------------------------------------------ */

	function boot() {
		new Rain(document.getElementById('rain'));

		var rabbitCanvas = document.getElementById('rabbit');
		var rabbit = window.RABBIT && rabbitCanvas ? Rabbit(rabbitCanvas, window.RABBIT) : null;
		var blocks = Array.prototype.slice.call(document.querySelectorAll('[data-scramble]'));
		var header = blocks.filter(function (b) { return b.closest('#header'); });
		var rest = blocks.filter(function (b) { return !b.closest('#header'); });
		var links = document.querySelector('.links');

		// hide rabbit until its turn
		if (rabbit && !reduceMotion) rabbitCanvas.style.visibility = 'hidden';

		document.querySelectorAll('#footer a').forEach(hoverScramble);

		// once the webfont is in, repaint the rabbit with it
		if (document.fonts && document.fonts.load) {
			document.fonts.load('16px "Share Tech Mono"').then(function () { if (rabbit) rabbit.repaint(); });
		}

		(async function () {
			await sleep(reduceMotion ? 0 : 350);
			for (var i = 0; i < header.length; i++) {
				await decode(header[i]);
				if (!reduceMotion) await sleep(80);
			}
			if (rabbit) {
				rabbitCanvas.style.visibility = 'visible';
				await rabbit.intro();
				rabbit.start();
			}
			if (links) links.classList.add('is-live');
			for (var j = 0; j < rest.length; j++) await decode(rest[j]);
		})();
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
	else boot();
})();
