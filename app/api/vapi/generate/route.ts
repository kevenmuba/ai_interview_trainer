import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { getRandomInterviewCover } from "@/lib/utils";
import { db } from "@/firebase/admin";

const jsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export async function GET() {
  return jsonResponse({ success: true, data: "THANK YOU!" }, 200);
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    console.error("[POST] Invalid JSON:", err);
    return jsonResponse({ success: false, error: "Invalid JSON" }, 400);
  }

  const { type, role, level, techstack, amount, userid } = body ?? {};

  if (!role || !level || !techstack || !amount || !userid || !type) {
    return jsonResponse(
      { success: false, error: "Missing required fields" },
      400
    );
  }

  const safeTechstack = Array.isArray(techstack) ? techstack.join(", ") : String(techstack);

  const prompt = `Prepare questions for a job interview.
The job role is ${role}.
The job experience level is ${level}.
The tech stack used in the job is: ${safeTechstack}.
The focus between behavioural and technical questions should lean towards: ${type}.
The amount of questions required is: ${amount}.
Return only the questions in JSON array format.
`;

  try {
    console.log("[POST] Calling generateText...");

    const result = await generateText({
      model: openai("gpt-4o-mini", {
        apiKey: process.env.OPENAI_API_KEY,
      }),
      prompt,
    });

    const questionsText = result?.text;
    if (!questionsText) {
      console.error("[POST] AI response missing text:", result);
      return jsonResponse({ success: false, error: "AI response missing text" }, 502);
    }

    let questions;
    try {
      questions = JSON.parse(questionsText);
      if (!Array.isArray(questions)) throw new Error("Not an array");
    } catch {
      // fallback: split by lines
      questions = questionsText
        .split(/\r?\n/)
        .map((l) => l.trim().replace(/^["\s-]+|["\s]+$/g, ""))
        .filter(Boolean);
    }

    const interview = {
      role,
      type,
      level,
      techstack: typeof techstack === "string" ? techstack.split(",").map(s => s.trim()) : techstack,
      questions,
      userId: userid,
      finalized: true,
      coverImage: getRandomInterviewCover(),
      createdAt: new Date().toISOString(),
    };

    await db.collection("interviews").add(interview);
    console.log("[POST] Saved interview to Firestore.");

    return jsonResponse({ success: true, questions }, 200);
  } catch (err) {
    console.error("[POST] Error:", err);
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
}
