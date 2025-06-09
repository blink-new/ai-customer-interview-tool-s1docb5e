import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { OpenAI } from "npm:openai@^4.52.7"

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")
const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

// Using Record<string, unknown> for founderPersona for more type safety than any
const generateInsightPrompt = (productIdea: string, founderPersona: Record<string, unknown>, fullConversation: Array<{ type: string; content: string }>) => {
  let conversationText = ""
  fullConversation.forEach(msg => {
    // Accessing properties with type assertion or checking existence
    const founderName = typeof founderPersona.name === 'string' ? founderPersona.name : 'Founder';
    conversationText += `${msg.type === 'ai' ? founderName : 'User'}: ${msg.content}\n`
  })

  const founderNameString = typeof founderPersona.name === 'string' ? founderPersona.name : 'a founder';
  const companyNameString = typeof founderPersona.companyName === 'string' ? founderPersona.companyName : 'a startup';

  return `
    You are an expert product manager analyzing a customer interview transcript.
    The interview was conducted by ${founderNameString} of ${companyNameString} 
    to validate the product idea: "${productIdea}".

    Here is the full conversation transcript:
    --- START TRANSCRIPT ---
    ${conversationText}
    --- END TRANSCRIPT ---

    Based on this transcript, please provide a structured analysis in JSON format. 
    The JSON object should have the following top-level keys:
    - "executiveSummary": An object with two string properties: "whatWeLearned" and "whatToBuildNext".
    - "painPoints": An array of objects, where each object has "point" (string, the pain point) and "severity" (string, e.g., "high", "medium", "low"). List up to 5 key pain points.
    - "notableQuotes": An array of objects, where each object has "quote" (string, the direct quote), "speaker" (string, "User" or "Founder"), and "sentiment" (string, e.g., "positive", "negative", "neutral", "frustrated", "excited"). List up to 5 impactful quotes.
    - "objections": An array of objects, where each object has "objection" (string, the user's concern or reason not to use the product) and "type" (string, e.g., "price", "feature_missing", "complexity", "trust"). List up to 3 key objections.
    - "productIdeas": An array of objects, where each object has "idea" (string, a new feature or product idea suggested or implied) and "source" (string, "direct_suggestion" or "implied_need"). List up to 3 new ideas.

    Ensure the output is a valid JSON object only. Do not include any explanatory text before or after the JSON.
    Focus on extracting actionable insights. Be concise and specific.
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
    const { productIdea, founderPersona, fullConversation } = await req.json()

    if (!productIdea || !founderPersona || !fullConversation || fullConversation.length === 0) {
      return new Response(JSON.stringify({ error: "Missing required fields: productIdea, founderPersona, or fullConversation" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      })
    }

    const prompt = generateInsightPrompt(productIdea, founderPersona, fullConversation)

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1", // Using a more capable model for analysis
      messages: [
        { role: "system", content: "You are an expert product analyst. Your task is to analyze an interview transcript and provide structured insights in JSON format based on the user's instructions." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3, // Lower temperature for more deterministic and factual output
      response_format: { type: "json_object" }, // Ensure JSON output
      max_tokens: 2000, // Allow for a more detailed response
    })

    const rawResponse = completion.choices[0]?.message?.content
    if (!rawResponse) {
      throw new Error("OpenAI returned an empty response.")
    }

    // Attempt to parse the JSON response
    let insights
    try {
      insights = JSON.parse(rawResponse)
    } catch (e: unknown) { // Changed to unknown
      let errorMessage = "Failed to parse OpenAI JSON response."
      if (e instanceof Error) {
        errorMessage = e.message
      }
      console.error("Parse Error:", errorMessage, "Raw response:", rawResponse)
      throw new Error(`OpenAI response was not valid JSON. Error: ${errorMessage}. Raw response: ${rawResponse}`)
    }

    return new Response(JSON.stringify(insights), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    })

  } catch (error) {
    console.error("Error in process-interview-insights function:", error)
    return new Response(JSON.stringify({ error: error.message || "Failed to process interview insights" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    })
  }
})