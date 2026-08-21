import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "../../../../src/auth/server.js";

export const { GET, POST } = toNextJsHandler(auth);
