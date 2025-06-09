
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { OpenAI } from "npm:openai@^4.52.7"

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")
const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

const generateGuidePrompt = (productIdeaPrompt: string) => {
  return `
    You are an expert customer interview designer.
    A founder wants to validate the following product idea and goals:
    --- PRODUCT IDEA & GOALS ---
    ${productIdeaPrompt}
    --- END PRODUCT IDEA & GOALS ---

    Based on this, generate a structured interview guide in JSON format. 
    The JSON object should have a top-level key "questions".
    "questions" should be an array of 5-7 question objects.
    Each question object should have:
    - "id": A unique string identifier (e.g., "q1", "q2").
    - "text": The full question text (string).
    - "type": The type of question (e.g., "open_ended", "pain_discovery", "solution_probing", "closing").
    
    The first question should be a warm, open-ended icebreaker. 
    Subsequent questions should dig into potential pain points, current solutions, and desired outcomes related to the product idea.
    The final question should be a polite closing question.
    Ensure the questions are conversational and designed to elicit detailed responses.

    Output a valid JSON object only. Do not include any explanatory text before or after the JSON.
  `
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { 
      headers: { 
        "Access-Control-Allow-Origin": "*", 
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
      } 
    })
  }

  try {
    const { productIdeaPrompt } = await req.json()

    if (!productIdeaPrompt) {
      return new Response(JSON.stringify({ error: "Missing required field: productIdeaPrompt" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      })
    }

    const prompt = generateGuidePrompt(productIdeaPrompt)

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-nano", // Can use gpt-4.1 for more nuanced questions if needed
      messages: [
        { role: "system", content: "You are an expert interview guide designer. Output JSON only." },
        { role: "user", content: prompt },
      ],
      temperature: 0.5,
      response_format: { type: "json_object" },
      max_tokens: 1000, 
    })

    const rawResponse = completion.choices[0]?.message?.content
    if (!rawResponse) {
      throw new Error("OpenAI returned an empty response for interview guide.")
    }

    let guideJson
    try {
      guideJson = JSON.parse(rawResponse)
      // Basic validation of the structure
      if (!guideJson.questions || !Array.isArray(guideJson.questions)) {
        throw new Error("Generated guide is missing 'questions' array.")
      }
    } catch (parseError: unknown) {
      console.error("Failed to parse OpenAI JSON response for guide:", rawResponse, parseError)
      throw new Error(`OpenAI response for guide was not valid JSON. Error: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`)
    }

    return new Response(JSON.stringify(guideJson), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    })

  } catch (error: unknown) {
    console.error("Error in generate-interview-guide function:", error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Failed to generate interview guide" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    })
  }
})
