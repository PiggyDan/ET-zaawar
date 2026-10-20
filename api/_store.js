/**
 * Where submissions wait for the mechanic, so /mechanic can list them.
 *
 * - On Vercel: a private Vercel Blob store (Storage → Blob, connected to the
 *   project, which sets BLOB_STORE_ID, or BLOB_READ_WRITE_TOKEN on older
 *   setups).
 * - Locally: a JSON file (MECHANIC_STORE_FILE, default .data/submissions.json).
 * - On Vercel without Blob: no store. Email links still work, but /mechanic
 *   reports that it is not set up.
 *
 * Each submission is one immutable blob: "pending/<id>.json" when sent to
 * the mechanic, replaced by "done/<id>.json" once checked. Blobs are never
 * overwritten, so CDN caching can never serve a stale record, and the done
 * blob is created without overwrite as a claim: if two mechanics send the
 * same form at once, only one claim succeeds. That keeps Blob's small free
 * allowance of writes and lists in mind (about 2 writes per trip).
 *
 * Files prefixed with "_" are not routed by Vercel.
 */

/** Pending forms expire with their link; checked ones stay listed a week. */
const PENDING_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const DONE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const PREFIX = "mechanic/";
const pathOf = (status, id) => `${PREFIX}${status}/${id}.json`;

const isExpired = (record, now = Date.now()) =>
  record.status === "done"
    ? !(now - record.done.at < DONE_MAX_AGE_MS)
    : !(now - record.createdAt < PENDING_MAX_AGE_MS);

async function blobStore() {
  const { del, get, list, put } = await import("@vercel/blob");

  const write = (path, record) =>
    put(path, JSON.stringify(record), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: false
    });

  const read = async (path, useCache) => {
    const result = await get(path, { access: "private", useCache });
    return result?.statusCode === 200 ? JSON.parse(await new Response(result.stream).text()) : null;
  };

  return {
    async savePending(record) {
      await write(pathOf("pending", record.id), record);
    },
    async getDone(id) {
      // Straight from storage: a cached "not found" must not hide a claim.
      return read(pathOf("done", id), false);
    },
    async claimDone(record) {
      try {
        await write(pathOf("done", record.id), record);
        return true;
      } catch (error) {
        if (/already exists/i.test(error.message)) return false;
        throw error;
      }
    },
    async releaseDone(id) {
      await del(pathOf("done", id));
    },
    async finishDone(id) {
      await del(pathOf("pending", id)).catch(() => {});
    },
    async all() {
      const blobs = [];
      let cursor;
      do {
        const page = await list({ prefix: PREFIX, cursor, limit: 1000 });
        blobs.push(...page.blobs);
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);

      // A done blob supersedes the pending one left behind by a failed delete.
      const doneIds = new Set(blobs.filter((blob) => blob.pathname.includes("/done/")).map((blob) => blob.pathname));
      const wanted = blobs.filter(
        (blob) => !(blob.pathname.includes("/pending/") && doneIds.has(blob.pathname.replace("/pending/", "/done/")))
      );

      // Records never change, so the CDN copy is always current.
      const records = (await Promise.all(wanted.map((blob) => read(blob.pathname, true).catch(() => null)))).filter(Boolean);

      const now = Date.now();
      const expired = records.filter((record) => isExpired(record, now));
      if (expired.length > 0) {
        await del(expired.map((record) => pathOf(record.status, record.id))).catch(() => {});
      }

      return records.filter((record) => !isExpired(record, now));
    }
  };
}

async function fileStore() {
  const { mkdir, readFile, rename, writeFile } = await import("fs/promises");
  const path = await import("path");
  const file = process.env.MECHANIC_STORE_FILE || path.join(process.cwd(), ".data", "submissions.json");

  const load = async () => JSON.parse(await readFile(file, "utf8").catch(() => "{}"));
  const save = async (records) => {
    await mkdir(path.dirname(file), { recursive: true });
    // Write then rename, so a crash never leaves half a file.
    await writeFile(`${file}.tmp`, JSON.stringify(records, null, 2));
    await rename(`${file}.tmp`, file);
  };
  const update = async (change) => {
    const records = await load();
    const result = change(records);
    await save(records);
    return result;
  };

  return {
    savePending: (record) => update((records) => { records[record.id] = record; }),
    async getDone(id) {
      const record = (await load())[id];
      return record?.status === "done" ? record : null;
    },
    claimDone: (record) =>
      update((records) => {
        if (records[record.id]?.status === "done") return false;
        records[record.id] = record;
        return true;
      }),
    releaseDone: (id) =>
      update((records) => {
        if (records[id]?.status === "done") records[id] = { ...records[id], status: "pending", done: undefined };
      }),
    async finishDone() {},
    all: () =>
      update((records) => {
        const now = Date.now();
        Object.values(records).forEach((record) => {
          if (isExpired(record, now)) delete records[record.id];
        });
        return Object.values(records);
      })
  };
}

/** The configured store, or null when there is none. */
export async function getStore() {
  // A store connected from the dashboard sets BLOB_STORE_ID and signs in with
  // Vercel's OIDC token; older setups use a read-write token.
  if (process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN) return blobStore();
  // Vercel's filesystem is read-only and not shared between requests.
  if (process.env.VERCEL) return null;
  return fileStore();
}

/** All live records, newest first. */
export async function listRecords(store) {
  return (await store.all()).sort((a, b) => b.createdAt - a.createdAt);
}
