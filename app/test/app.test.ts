import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Point storage at a throwaway directory before the server module loads, so a
// test run never touches whatever the founder has been clicking through.
const DATA_DIR = mkdtempSync(join(tmpdir(), "elongo-test-"));
process.env.ELONGO_DATA_DIR = DATA_DIR;
process.env.PORT = "0";

const { server } = await import("../src/server.ts");
const { esc, h } = await import("../src/html.ts");

let base = "";

before(async () => {
  await new Promise<void>((resolve) => {
    if (server.listening) return resolve();
    server.once("listening", () => resolve());
  });
  const addr = server.address();
  if (addr === null || typeof addr === "string") throw new Error("server did not bind a port");
  base = `http://127.0.0.1:${addr.port}`;
});

after(() => {
  server.close();
  rmSync(DATA_DIR, { recursive: true, force: true });
});

async function post(path: string, fields: Record<string, string>): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
    redirect: "manual",
  });
}

async function book(over: Record<string, string> = {}): Promise<string> {
  const res = await post("/book", {
    eventName: "Mariage de Grace",
    place: "Makélékélé, Brazzaville",
    bookerName: "Sylvain",
    bookerCountry: "FR",
    when: "2026-09-12T14:00",
    tierId: "ceremonie",
    expected: "9",
    ...over,
  });
  assert.equal(res.status, 303, "booking should redirect");
  const location = res.headers.get("location") ?? "";
  const ref = /^\/p\/([A-Z0-9]+)/.exec(location)?.[1];
  assert.ok(ref, `no reference in redirect: ${location}`);
  return ref;
}

describe("escaping", () => {
  it("neutralises every character that could break out of HTML", () => {
    assert.equal(esc(`<script>alert("x")&'`), "&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;");
  });

  it("escapes interpolated values in the template tag", () => {
    assert.equal(h`<p>${"<b>hi</b>"}</p>`, "<p>&lt;b&gt;hi&lt;/b&gt;</p>");
  });

  it("handles null and undefined without printing them", () => {
    assert.equal(esc(null), "");
    assert.equal(esc(undefined), "");
  });
});

describe("booking", () => {
  it("creates a pool and redirects to its page", async () => {
    const ref = await book();
    const page = await (await fetch(`${base}/p/${ref}`)).text();
    assert.match(page, /Mariage de Grace/);
    assert.match(page, /€89\.00/);
  });

  it("rejects a booking with no event name", async () => {
    const res = await post("/book", {
      eventName: "",
      place: "Brazzaville",
      bookerName: "Sylvain",
      when: "2026-09-12T14:00",
      tierId: "fete",
    });
    assert.equal(res.status, 303);
    assert.match(res.headers.get("location") ?? "", /^\/\?error=/);
  });

  it("rejects an invalid date", async () => {
    const res = await post("/book", {
      eventName: "Test",
      place: "Brazzaville",
      bookerName: "Sylvain",
      when: "not-a-date",
      tierId: "fete",
    });
    assert.match(res.headers.get("location") ?? "", /error/);
  });

  it("does not let a hostile event name reach the page unescaped", async () => {
    const ref = await book({ eventName: `<img src=x onerror="alert(1)">` });
    const page = await (await fetch(`${base}/p/${ref}`)).text();
    assert.ok(!page.includes("<img src=x"), "raw markup reached the page");
    assert.match(page, /&lt;img src=x/);
  });

  it("escapes the name inside the page title and the WhatsApp card metadata", async () => {
    const ref = await book({ eventName: `Fête "des <fous>"` });
    const page = await (await fetch(`${base}/p/${ref}`)).text();
    const title = /<title>([^<]*)<\/title>/.exec(page)?.[1] ?? "";
    assert.ok(!title.includes("<fous>"), "unescaped markup in <title>");
    assert.match(page, /property="og:title" content="Fête &quot;des &lt;fous&gt;&quot;"/);
  });
});

describe("contributing", () => {
  it("accepts a contribution and shows it", async () => {
    const ref = await book();
    await post(`/p/${ref}/contribute`, { name: "Bernadette", country: "BE", amount: "10" });
    const page = await (await fetch(`${base}/p/${ref}`)).text();
    assert.match(page, /Bernadette/);
    assert.match(page, /€10\.00/);
  });

  it("refuses below the five euro minimum, in French", async () => {
    const ref = await book();
    const res = await post(`/p/${ref}/contribute`, { name: "Petit", country: "FR", amount: "2" });
    const location = decodeURIComponent(res.headers.get("location") ?? "");
    assert.match(location, /k=bad/);
    assert.match(location, /minimum est de 5/);
  });

  it("refuses a contribution with no name", async () => {
    const ref = await book();
    const res = await post(`/p/${ref}/contribute`, { name: "", country: "FR", amount: "10" });
    assert.match(decodeURIComponent(res.headers.get("location") ?? ""), /prénom/);
  });

  it("refuses contributions after the pool closes", async () => {
    const ref = await book();
    await post(`/p/${ref}/contribute`, { name: "Bernadette", country: "BE", amount: "10" });
    await post(`/p/${ref}/close`, {});
    const res = await post(`/p/${ref}/contribute`, { name: "Tardif", country: "FR", amount: "10" });
    assert.match(decodeURIComponent(res.headers.get("location") ?? ""), /fermée/);
  });

  it("does not count the booker as a newly reached relative", async () => {
    const ref = await book({ bookerName: "Sylvain" });
    await post(`/p/${ref}/contribute`, { name: "Sylvain", country: "FR", amount: "15" });
    await post(`/p/${ref}/contribute`, { name: "Bernadette", country: "BE", amount: "10" });
    const ops = await (await fetch(`${base}/ops`)).text();
    // The growth number in docs/03 is only meaningful if it counts strangers.
    assert.ok(ops.includes("1 nouv."), "booker should not be counted as newly reached");
  });
});

describe("the pool lifecycle", () => {
  it("charges the shortfall to the booker rather than cancelling", async () => {
    const ref = await book();
    await post(`/p/${ref}/contribute`, { name: "Bernadette", country: "BE", amount: "20" });
    const res = await post(`/p/${ref}/close`, {});
    const location = decodeURIComponent(res.headers.get("location") ?? "");
    assert.match(location, /Complément de 69\.00/);
    assert.match(location, /Sylvain/);
  });

  it("will not deliver a pool that was never closed", async () => {
    const ref = await book();
    const res = await post(`/p/${ref}/deliver`, {});
    assert.match(decodeURIComponent(res.headers.get("location") ?? ""), /clôturer/);
  });

  it("delivers a closed pool", async () => {
    const ref = await book();
    await post(`/p/${ref}/contribute`, { name: "Sylvain", country: "FR", amount: "89" });
    await post(`/p/${ref}/close`, {});
    const res = await post(`/p/${ref}/deliver`, {});
    assert.match(decodeURIComponent(res.headers.get("location") ?? ""), /Livrée/);
  });

  it("reports the fees it cannot recover when refunding", async () => {
    const ref = await book();
    await post(`/p/${ref}/contribute`, { name: "Bernadette", country: "BE", amount: "20" });
    const res = await post(`/p/${ref}/refund`, {});
    const location = decodeURIComponent(res.headers.get("location") ?? "");
    assert.match(location, /Remboursé 20\.00/);
    assert.match(location, /non récupérables/);
  });
});

describe("routing", () => {
  it("serves the booking page", async () => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Être là, même de loin/);
  });

  it("serves the stylesheet", async () => {
    const res = await fetch(`${base}/styles.css`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/css/);
  });

  it("404s an unknown reference", async () => {
    const res = await fetch(`${base}/p/ZZZZZZ`);
    assert.equal(res.status, 404);
  });

  it("404s an unknown path", async () => {
    assert.equal((await fetch(`${base}/nope`)).status, 404);
  });

  it("does not serve files outside the public directory", async () => {
    // Only an explicit allow-list is served; nothing joins user input onto a path.
    for (const attack of ["/../src/server.ts", "/../../package.json", "/..%2fsrc%2fserver.ts"]) {
      const res = await fetch(`${base}${attack}`, { redirect: "manual" });
      assert.ok(res.status >= 300, `${attack} returned ${res.status}`);
      const body = await res.text();
      assert.ok(!body.includes("createServer"), `${attack} leaked source`);
    }
  });

  it("sets defensive response headers", async () => {
    const res = await fetch(`${base}/`);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.match(res.headers.get("content-security-policy") ?? "", /default-src 'self'/);
  });
});
