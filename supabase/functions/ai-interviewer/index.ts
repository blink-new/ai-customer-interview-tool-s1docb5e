import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { OpenAI } from "npm:openai@^4.52.7"

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")
const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

serve(async (req) => {
  // Handle CORS preflight request
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
    const { productIdea, founderPersona, conversationHistory, userResponse } = await req.json()

    if (!productIdea || !conversationHistory || !userResponse) {
      return new Response(JSON.stringify({ error: "Missing required fields: productIdea, conversationHistory, or userResponse" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      })
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-nano", // Using nano for faster responses in a chat context
      messages: [
        { role: "system", content: `You are ${founderPersona.name || 'a founder'} of ${founderPersona.companyName || 'a startup'} conducting a customer interview about: ${productIdea}. Be conversational, empathetic, and ask insightful follow-up questions.` },
        ...conversationHistory.map((msg: { type: string; content: string }) => ({
          role: msg.type === 'ai' ? "assistant" : "user",
          content: msg.content,
        })),
        { role: "user", content: userResponse },
      ],
      temperature: 0.7,
      max_tokens: 150,
      stop: ["\nUser:", `\n${founderPersona.name || 'Founder'}:`], // Stop generation if it tries to simulate user or another AI turn
    })

    const aiResponse = completion.choices[0]?.message?.content?.trim() || "I'm not sure how to respond to that. Could you tell me more?"

    return new Response(JSON.stringify({ aiResponse }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    })

  } catch (error) {
    console.error("Error calling OpenAI:", error)
    return new Response(JSON.stringify({ error: error.message || "Failed to process AI response" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    })
  }
})