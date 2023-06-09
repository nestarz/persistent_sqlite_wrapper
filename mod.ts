import type {
  QueryParameterSet,
  RowObject,
} from "https://deno.land/x/sqlite@v3.7.2/mod.ts";
import { DB } from "https://deno.land/x/sqlite@v3.7.2/mod.ts";

export interface DBWithHash {
  _db: DB | null;
  hash: string | null | undefined;
  query: (
    query: string,
    values?: QueryParameterSet
  ) => Promise<RowObject[] | undefined>;
}

export default async (
  get_: () => Promise<ArrayBuffer | void>,
  set: (buffer: Uint8Array) => boolean | Promise<boolean>,
  gethash?: () => Promise<string | null | undefined>
): Promise<DBWithHash> => {
  let db0: DB;
  const strPrefix = (v) => `[s3lite] ${v}`;
  const get = async () => {
    if (db0) {
      console.time(strPrefix("close"));
      db0.close();
      console.timeEnd(strPrefix("close"));
    }
    console.time(strPrefix("open")); 
    const buffer = await get_().catch(() => null); 
    db0 = new DB("", { memory: true });
    if (buffer) db0.deserialize(new Uint8Array(buffer));
    console.timeEnd(strPrefix("open"));    
    return db0;
  };

  let hash = await gethash?.().catch(() => null);
  let db = await get().catch(() => null);

  let inTransaction = false;
  return {
    get _db() {
      return db;
    },
    get hash() {
      return hash;
    },
    query: async (query, values?: QueryParameterSet) => {
      console.log(strPrefix(query));
      const newhash = await gethash?.().catch(() => null);
      if (newhash !== hash || !newhash) db = await get();
      hash = newhash;

      if (typeof db === "undefined" || db === null) throw Error("Missing DB");

      return Promise.resolve()
        .then(() => db?.queryEntries(query, values))
        .then(async (res) => {
          if (query.match(/BEGIN/gi)) inTransaction = true;
          if (query.match(/ROLLBACK/gi) || query.match(/COMMIT/gi)) {
            inTransaction = false;
          }
          if (!inTransaction) {
            if (
              query.match(/DELETE|INSERT|UPDATE|CREATE|ALTER|COMMIT|DROP/gi)
            ) {
              console.log(strPrefix("saving..."));
              if (db) await set(db.serialize());
            }
          }
          return res;
        })
        .catch((error) => {
          console.error(error);
          throw Error(strPrefix(JSON.stringify(error)));
        });
    },
  };
};
