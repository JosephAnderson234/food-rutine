import { groq } from "@ai-sdk/groq";
import {
  inventoryPrompt,
  inventorySchema,
  weekBlocksSchema,
  weekPrompt,
} from "@app/domain/ai";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";

/** Modelo con salida estructurada estricta en Groq (decodificación restringida al esquema). */
const MODEL = "openai/gpt-oss-120b";

const text = z.string().trim().min(1).max(1000);

const body = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("week"),
    text,
    context: z.object({
      weekStart: z.string(),
      today: z.string(),
      days: z
        .array(
          z.object({
            date: z.string(),
            dayName: z.string(),
            busy: z.array(z.string()).max(40),
          }),
        )
        .length(7),
    }),
  }),
  z.object({
    kind: z.literal("inventory"),
    text,
    ingredients: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          unit: z.enum(["g", "ml", "u"]),
        }),
      )
      .min(1)
      .max(300),
  }),
]);

const fail = (status: number, error: string) =>
  Response.json({ error }, { status });

export async function POST(req: Request) {
  // Solo la propia app: evita que otro sitio gaste la key desde el navegador de alguien.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) {
    return fail(403, "Origen no permitido.");
  }
  if (!process.env.GROQ_API_KEY) {
    return fail(
      501,
      "Falta GROQ_API_KEY en .env.local (reinicia el servidor después de agregarla).",
    );
  }

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "Pedido inválido.");
  const input = parsed.data;

  try {
    const common = {
      model: groq(MODEL),
      providerOptions: { groq: { reasoningEffort: "low" } },
    } as const;

    if (input.kind === "week") {
      const { system, prompt } = weekPrompt(input.context, input.text);
      const result = await generateText({
        ...common,
        system,
        prompt,
        output: Output.object({ schema: weekBlocksSchema }),
      });
      return Response.json({ output: result.output });
    }

    const { system, prompt } = inventoryPrompt(input.ingredients, input.text);
    const result = await generateText({
      ...common,
      system,
      prompt,
      output: Output.object({
        schema: inventorySchema(input.ingredients.map((i) => i.id)),
      }),
    });
    return Response.json({ output: result.output });
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) {
      return fail(502, "La IA no devolvió algo válido. Prueba reformulando.");
    }
    return fail(
      502,
      e instanceof Error ? e.message : "Error al hablar con Groq.",
    );
  }
}
