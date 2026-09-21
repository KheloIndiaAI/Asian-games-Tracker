import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { statusKeyIsValid } from "./status-auth.server";

export const requireStatusKey = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ key: z.string().min(1).max(500) }).parse(data))
  .handler(async ({ data }) => {
    return statusKeyIsValid(data.key);
  });