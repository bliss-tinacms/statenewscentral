import { createClient } from "tinacms/dist/client";
import { queries } from "./types.js";
export const client = createClient({ cacheDir: 'tina/__generated__/.cache', url: process.env.TINA_LOCAL_URL || 'https://www.statenewscentral.com/tina-content-proxy', token: '', queries,  });
export default client;
  