/* Browser regression: node tests/ux-regression.cjs (serve the checkout first). */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const baseURL = process.env.LEAP_BASE_URL || "http://127.0.0.1:8080";
const oldID = "suxlegacy";
const fixture = {
  v: 1,
  history: { 1: { correct: 2, total: 3 }, 20: { correct: 4, total: 6 } },
  missRec: {
    1: { n: 1, s: 0, t: 1700000000000 },
    20: { n: 2, s: 3, t: 1700000000001 },
  },
  marks: { 5: 1700000000010 },
  upd: { 1: 1700000000000, 5: 1700000000010, 20: 1700000000001 },
  studyPos: { no: 35, start: 1, end: 50, at: 1700000000015 },
  daily: { "2026-10-01": { fixture: { a: 9, c: 6, v: 4, ts: 60, tq: 30 } } },
  sessions: [
    {
      id: "fixture-session",
      at: 1700000000020,
      mode: "test",
      label: "No.1〜50",
      n: 9,
      c: 6,
      sec: 30,
    },
  ],
  wstat: { 1: { f: 1700000000000, ms: 1000, k: 2, v: 1 } },
  masteryN: 3,
  masteryAt: 1700000000025,
  ranges: { study: [1, 50], test: [1, 50], typing: [1, 50], review: [1, 2300] },
  lastAnswerAt: 1700000000030,
};
const index = {
  active: oldID,
  order: [oldID],
  meta: {
    [oldID]: {
      name: "以前の記録",
      createdAt: 1690000000000,
      nameAt: 1690000000000,
    },
  },
};
function teachingDatasetsUnchanged() {
  const previous = execFileSync("git", ["show", "HEAD:index.html"], {
    cwd: root,
    encoding: "utf8",
  });
  const current = fs.readFileSync(path.join(root, "index.html"), "utf8");
  for (const [start, end] of [
    ["const WORDS =", "// WORDS.length"],
    ["const EXAMPLES =", "// ── 発音記号"],
    ["const IPA =", "// 発音記号 +"],
  ]) {
    const extract = (text) => {
      const at = text.indexOf(start),
        until = text.indexOf(end, at);
      assert.ok(at >= 0 && until > at);
      return text.slice(at, until);
    };
    assert.equal(
      extract(current),
      extract(previous),
      start + " must remain byte-for-byte unchanged",
    );
  }
}
async function createCase(browser, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    hasTouch: true,
    ...options,
  });
  await context.route("https://api.github.com/**", (route) => route.abort());
  await context.addInitScript(
    ({ fixture, index, oldID }) => {
      if (!localStorage.getItem("ux_regression_seeded")) {
        localStorage.clear();
        localStorage.setItem("leap_device_id", "ux-regression-device");
        localStorage.setItem("leap_slots_v1", JSON.stringify(index));
        localStorage.setItem(
          "leap_slot_data_" + oldID,
          JSON.stringify(fixture),
        );
        localStorage.setItem("ux_regression_seeded", "1");
      }
      window.uxSpeechCalls = [];
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: {
          cancel() {},
          getVoices() {
            return [];
          },
          speak(utterance) {
            window.uxSpeechCalls.push({
              text: utterance.text,
              lang: utterance.lang,
              rate: utterance.rate,
            });
          },
        },
      });
    },
    { fixture, index, oldID },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("net::ERR_FAILED")
    )
      errors.push(message.text());
  });
  await page.goto(baseURL, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.LEAPUX && !!window.LEAPMotion);
  return { context, page, errors };
}
const exportedFields = [
  "history",
  "marks",
  "studyPos",
  "daily",
  "sessions",
  "wstat",
  "masteryN",
  "ranges",
  "lastAnswerAt",
];
(async () => {
  teachingDatasetsUnchanged();
  console.log("PASS teaching datasets unchanged");
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  let failures = 0;
  async function run(name, body, options) {
    let test;
    try {
      test = await createCase(browser, options);
      await body(test);
      assert.deepEqual(test.errors, [], "browser console/page errors");
      console.log("PASS " + name);
    } catch (error) {
      failures++;
      console.error("FAIL " + name + "\n" + error.stack);
    } finally {
      await test?.context.close();
    }
  }
  try {
    await run(
      "old slot survives loading and reload; JSON backup round trip",
      async ({ page }) => {
        assert.deepEqual(
          await page.evaluate(
            (id) => JSON.parse(localStorage.getItem("leap_slot_data_" + id)),
            oldID,
          ),
          fixture,
        );
        assert.deepEqual(
          await page.evaluate(() =>
            JSON.parse(localStorage.getItem("leap_slots_v1")),
          ),
          index,
        );
        await page.reload();
        await page.waitForFunction(() => !!window.LEAPUX);
        assert.deepEqual(
          await page.evaluate(
            (id) => JSON.parse(localStorage.getItem("leap_slot_data_" + id)),
            oldID,
          ),
          fixture,
        );
        await page.evaluate(() => showSection("settings"));
        const downloadPromise = page.waitForEvent("download");
        await page
          .getByRole("button", { name: "エクスポート", exact: true })
          .click();
        const download = await downloadPromise;
        const data = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
        assert.equal(data.version, 3);
        assert.equal(data.slotName, "以前の記録");
        for (const key of exportedFields)
          assert.deepEqual(data[key], fixture[key], key);
        assert.deepEqual(data.missRecords, fixture.missRec);
        await page
          .locator("#import-file")
          .setInputFiles({
            name: "old-leap-backup.json",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(data)),
          });
        await page.waitForFunction(
          () =>
            slotIndex.order.length === 2 && slotIndex.active !== "suxlegacy",
        );
        const restored = await page.evaluate(() =>
          JSON.parse(JSON.stringify(currentSlotData())),
        );
        for (const key of exportedFields)
          assert.deepEqual(restored[key], fixture[key], key);
        assert.deepEqual(restored.missRec, fixture.missRec);
        assert.deepEqual(
          await page.evaluate(
            (id) => JSON.parse(localStorage.getItem("leap_slot_data_" + id)),
            oldID,
          ),
          fixture,
          "original slot overwritten by import",
        );
        await page.evaluate(() => switchSlot("suxlegacy"));
        assert.equal(await page.evaluate(() => slotIndex.active), oldID);
      },
    );
    await run(
      "legacy version-1 backup imports without erasing old slot",
      async ({ page }) => {
        const legacy = {
          version: 1,
          slotName: "旧バックアップ",
          wrongList: [2],
          history: { 2: { correct: 1, total: 3 }, 3: { correct: 4, total: 6 } },
        };
        await page.evaluate(() => showSection("settings"));
        await page
          .locator("#import-file")
          .setInputFiles({
            name: "legacy.json",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(legacy)),
          });
        await page.waitForFunction(() => slotIndex.order.length === 2);
        const result = await page.evaluate(() => ({
          history,
          missRec,
          masteryN,
          old: readSlotData("suxlegacy"),
        }));
        assert.deepEqual(result.history, legacy.history);
        assert.equal(result.missRec[2].n, 2);
        assert.equal(result.missRec[2].s, 0);
        assert.equal(result.missRec[3].n, 2);
        assert.equal(result.missRec[3].s, 5);
        assert.deepEqual(result.old, fixture);
      },
    );
    await run(
      "study click preserves list position; speech remains synchronous",
      async ({ page }) => {
        const previous = await page
          .locator(".study-list-panel")
          .evaluate((panel) => {
            panel.scrollTop = 450;
            const box = panel.getBoundingClientRect();
            const row = [...panel.querySelectorAll(".word-list-item")].find(
              (row) => {
                const r = row.getBoundingClientRect();
                return r.top > box.top + 100 && r.bottom < box.bottom - 25;
              },
            );
            return {
              no: row.dataset.no,
              scroll: panel.scrollTop,
              y: row.getBoundingClientRect().top,
            };
          });
        await page
          .locator('.word-list-item[data-no="' + previous.no + '"]')
          .click();
        await page.waitForTimeout(120);
        const after = await page
          .locator(".study-list-panel")
          .evaluate((panel) => ({
            scroll: panel.scrollTop,
            y: panel.querySelector(".selected").getBoundingClientRect().top,
            overflow: panel.scrollWidth > panel.clientWidth,
          }));
        assert.ok(Math.abs(previous.scroll - after.scroll) < 1);
        assert.ok(Math.abs(previous.y - after.y) < 1);
        assert.equal(after.overflow, false);
        await page.evaluate(() => {
          studySelect(0);
          window.uxSpeechCalls = [];
        });
        await page
          .getByRole("button", { name: "自動読み上げ", exact: true })
          .click();
        assert.equal(
          await page.evaluate(() => window.uxSpeechCalls.at(-1).text),
          "agree",
        );
        const call = await page.evaluate(() => {
          studyNext();
          return window.uxSpeechCalls.at(-1);
        });
        assert.equal(call.text, "oppose");
        assert.equal(call.lang, "en-US");
        assert.ok(Math.abs(call.rate - 0.85) < 0.00001);
        const count = await page.evaluate(() => window.uxSpeechCalls.length);
        await page.evaluate(() => studyReveal());
        assert.equal(
          await page.evaluate(() => window.uxSpeechCalls.length),
          count,
        );
        await page
          .getByRole("button", { name: "自動読み上げ", exact: true })
          .click();
        await page.evaluate(() => studyNext());
        assert.equal(
          await page.evaluate(() => window.uxSpeechCalls.length),
          count,
        );
        const original = await page.evaluate(() => ({
          history,
          missRec,
          marks: markRec,
        }));
        assert.deepEqual(original, {
          history: fixture.history,
          missRec: fixture.missRec,
          marks: fixture.marks,
        });
      },
    );
    for (const mobile of [false, true])
      for (const scheme of ["light", "dark"]) {
        await run(
          (mobile ? "mobile" : "desktop") +
            " " +
            scheme +
            " navigation, search and overlays",
          async ({ page }) => {
            assert.equal(
              await page.locator("html").getAttribute("data-theme"),
              scheme,
            );
            for (const section of [
              "study",
              "test",
              "typing",
              "review",
              "wordlist",
              "record",
              "settings",
            ]) {
              await page
                .locator(
                  "#nav .nav-btn[onclick=\"showSection('" + section + "')\"]",
                )
                .click();
              assert.equal(
                await page.locator("#section-" + section).isVisible(),
                true,
              );
              assert.equal(
                await page.evaluate(
                  () => document.documentElement.scrollWidth > innerWidth,
                ),
                false,
                section + " horizontal overflow",
              );
            }
            await page.evaluate(() => showSection("wordlist"));
            const input = page.locator("#list-search-input");
            await input.focus();
            await input.fill("agr");
            await page
              .locator('[role="option"]')
              .first()
              .waitFor({ state: "visible" });
            await input.press("ArrowDown");
            await input.press("Enter");
            assert.equal(await input.inputValue(), "agree");
            assert.equal(await input.getAttribute("aria-expanded"), "false");
            assert.equal(
              await input.evaluate((input) => document.activeElement === input),
              true,
            );
            assert.match(await page.locator(".list-count").innerText(), /1語/);
            await input.fill("zzzz-no-word-zzzz");
            await page
              .locator(".ux-search-empty")
              .waitFor({ state: "visible" });
            await input.press("Escape");
            assert.equal(await input.getAttribute("aria-expanded"), "false");
            await page.evaluate(() => showSection("study"));
            const before = await page.evaluate(() =>
              JSON.stringify(currentSlotData()),
            );
            await page.evaluate(() => LEAPUX.openRange("study"));
            assert.equal(await page.locator("dialog[open]").count(), 1);
            await page.keyboard.press("Escape");
            await page.locator("dialog[open]").waitFor({ state: "detached" });
            assert.equal(await page.locator("dialog[open]").count(), 0);
            assert.notEqual(
              await page
                .locator("body")
                .evaluate((body) => body.style.overflow),
              "hidden",
            );
            assert.equal(
              await page.evaluate(() => JSON.stringify(currentSlotData())),
              before,
              "cancel changed records",
            );
            await page.evaluate(() => LEAPUX.openRange("study"));
            await page.locator('dialog [name="start"]').fill("10");
            await page.locator('dialog [name="end"]').fill("20");
            await page
              .getByRole("button", { name: "この範囲を使う", exact: true })
              .click();
            assert.deepEqual(
              await page.evaluate(() => [state.studyStart, state.studyEnd]),
              [10, 20],
            );
            await page.locator("dialog[open]").waitFor({ state: "detached" });
            assert.equal(await page.locator("dialog[open]").count(), 0);
          },
          {
            viewport: mobile
              ? { width: 390, height: 844 }
              : { width: 1280, height: 900 },
            colorScheme: scheme,
          },
        );
      }
    await run(
      "reduced motion disables JS motion and keeps final values",
      async ({ page }) => {
        assert.equal(await page.evaluate(() => LEAPMotion.reduced), true);
        await page.evaluate(() => showSection("record"));
        await page.waitForTimeout(100);
        assert.equal(await page.locator(".ux-number-overlay").count(), 0);
        const seconds = await page
          .locator("#nav .nav-btn")
          .first()
          .evaluate((el) =>
            parseFloat(getComputedStyle(el).transitionDuration),
          );
        assert.ok(seconds <= 0.001, String(seconds));
        const animation = await page.evaluate(() =>
          LEAPMotion.animate(document.getElementById("section-record"), [
            { opacity: 0 },
            { opacity: 1 },
          ]),
        );
        assert.equal(animation, null);
        await page.evaluate(() => LEAPUX.openRange("study"));
        assert.equal(await page.locator("dialog[open]").isVisible(), true);
        await page.keyboard.press("Escape");
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await page.waitForFunction(() => !LEAPMotion.reduced);
        await page.evaluate(() => showSection("settings"));
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.waitForFunction(() => LEAPMotion.reduced);
        assert.equal(await page.locator(".ux-number-overlay").count(), 0);
      },
      { reducedMotion: "reduce" },
    );
  } finally {
    await browser.close();
  }
  if (failures) throw new Error(failures + " regression case(s) failed");
  console.log(
    "All UX regression cases passed. Audio calls are stubbed; no real GitHub requests were sent.",
  );
})().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
