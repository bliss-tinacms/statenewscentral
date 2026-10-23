import { createClient } from "tinacms/dist/client";
import { queries } from "./types.js";
export const client = createClient({ cacheDir: 'tina/__generated__/.cache', url: 'http://localhost:4001/graphql', token: '', queries,  });
export default client;
  