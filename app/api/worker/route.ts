import { after } from "next/server"

import { kickWorker } from "@/lib/api"
import { runNext } from "@/lib/queue"

// Vercel Hobby's ceiling (with Fluid compute). One edit must finish inside it.
export const maxDuration = 300

/**
 * Runs one queued job per invocation, after responding so the caller isn't held open. When
 * it finishes a job it kicks itself again to pick up the next one.
 */
export async function POST(request: Request) {
  const origin = new URL(request.url).origin
  after(async () => {
    try {
      if (await runNext()) await kickWorker(origin)
    } catch (err) {
      console.error("[worker]", err)
    }
  })
  return new Response(null, { status: 202 })
}
