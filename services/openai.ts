import { callAIProxy } from "@/services/aiProxy";

export interface RecoveryAnalysis {
  situation: string;
  severity: "low" | "moderate" | "high" | "critical";
  recommendations: string[];
  requiredEquipment: string[];
  safetyWarnings: string[];
  estimatedDifficulty: string;
}

const VALID_SEVERITIES = new Set(["low", "moderate", "high", "critical"]);

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string" && item.trim().length > 0)
  );
}

function parseRecoveryAnalysis(content: string): RecoveryAnalysis {
  const jsonContent = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed: unknown = JSON.parse(jsonContent);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid response format from AI");
  }

  const result = parsed as Record<string, unknown>;
  if (
    typeof result.situation !== "string" ||
    !result.situation.trim() ||
    typeof result.severity !== "string" ||
    !VALID_SEVERITIES.has(result.severity) ||
    !isStringArray(result.recommendations) ||
    !isStringArray(result.requiredEquipment) ||
    !isStringArray(result.safetyWarnings) ||
    typeof result.estimatedDifficulty !== "string" ||
    !result.estimatedDifficulty.trim()
  ) {
    throw new Error("Invalid response format from AI");
  }

  return {
    situation: result.situation.trim(),
    severity: result.severity as RecoveryAnalysis["severity"],
    recommendations: result.recommendations.map((item) => item.trim()),
    requiredEquipment: result.requiredEquipment.map((item) => item.trim()),
    safetyWarnings: result.safetyWarnings.map((item) => item.trim()),
    estimatedDifficulty: result.estimatedDifficulty.trim(),
  };
}

export async function analyzeRecoverySituation(
  imageUri: string,
): Promise<RecoveryAnalysis> {
  try {
    const base64Image = await convertImageToBase64(imageUri);

    const data = await callAIProxy({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an off-road recovery information assistant. A photo alone cannot reliably establish whether a recovery is safe, identify hidden hazards, verify anchor points or equipment ratings, or diagnose vehicle damage. Be conservative and explicitly state uncertainty.

Never claim a vehicle is definitely recoverable or assign a probability/confidence score. Do not instruct users to get under a vehicle, stand in a winch/strap line, use an unverified anchor, or perform a high-risk recovery. For steep angles, unstable vehicles, injury, damaged equipment, uncertain anchor points, or any situation that appears dangerous, recommend stopping, keeping people clear, and contacting qualified recovery professionals or emergency services as appropriate. Do not invent details that are not visible.

Return JSON only with this exact structure:
{
  "situation": "Brief description, including relevant uncertainty",
  "severity": "low|moderate|high|critical",
  "recommendations": ["Conservative, low-risk assessment step"],
  "requiredEquipment": ["Equipment only when reasonably supported by the image"],
  "safetyWarnings": ["Specific caution or limitation"],
  "estimatedDifficulty": "Easy|Moderate|Difficult|Expert|Cannot determine"
}

Base severity on visible risk; choose high or critical when key safety conditions cannot be assessed. Prefer recommending a professional over giving operational recovery instructions when risk is unclear.`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Describe only what can reasonably be inferred from this photo. Give conservative safety-first guidance and clearly state what cannot be determined.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: 0.3,
    });

    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("No response from AI service");
    }

    return parseRecoveryAnalysis(content);
  } catch (error: any) {
    console.error("AI analysis error:", error);
    throw new Error(
      error?.message || "Failed to analyze image. Please try again.",
    );
  }
}

async function convertImageToBase64(uri: string): Promise<string> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("Image could not be read"));
          return;
        }
        const base64 = result.split(",")[1];
        if (!base64) {
          reject(new Error("Image data is empty"));
          return;
        }
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Image could not be read"));
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Error converting image to base64:", error);
    throw new Error("Failed to process image");
  }
}

export function getSeverityColor(severity: string): string {
  switch (severity) {
    case "low":
      return "#10b981";
    case "moderate":
      return "#f59e0b";
    case "high":
      return "#ef4444";
    case "critical":
      return "#dc2626";
    default:
      return "#6b7280";
  }
}

export function getSeverityLabel(severity: string): string {
  switch (severity) {
    case "low":
      return "Low Risk";
    case "moderate":
      return "Moderate Risk";
    case "high":
      return "High Risk";
    case "critical":
      return "Critical - Professional Help Recommended";
    default:
      return "Unknown";
  }
}
