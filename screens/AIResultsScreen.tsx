import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { ScreenScrollView } from "@/components/ScreenScrollView";
import ThemedText from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { AIScanStackParamList } from "@/navigation/AIScanStackNavigator";
import { BorderRadius, Spacing, Typography } from "@/constants/theme";
import { storage } from "@/utils/storage";
import { authService } from "@/services/authService";
import { analyzeRecoverySituation, RecoveryAnalysis } from "@/services/openai";
import { hasAccountAccess, ScanSubmissionsService } from "@/utils/firebase";

 type ResultsRoute = RouteProp<AIScanStackParamList, "AIResults">;

const MAX_SCAN_IMAGE_BASE64_LENGTH = 1_000_000;

function severityLabel(severity: RecoveryAnalysis["severity"]): string {
  switch (severity) {
    case "low":
      return "Lower visible risk";
    case "moderate":
      return "Use caution";
    case "high":
      return "High risk — get professional help";
    case "critical":
      return "Critical — stop and get professional help";
  }
}

export default function AIResultsScreen() {
  const route = useRoute<ResultsRoute>();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { imageUri, imageBase64 } = route.params;
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [analysis, setAnalysis] = useState<RecoveryAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [shareWithCommunity, setShareWithCommunity] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [hasShared, setHasShared] = useState(false);
  const scanIdRef = useRef(Date.now().toString());

  const performAnalysis = useCallback(async () => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const result = await analyzeRecoverySituation(imageUri);
      setAnalysis(result);
      await storage.addScanHistory({
        id: scanIdRef.current,
        imageUri,
        timestamp: Date.now(),
        situationType: result.situation,
        analysis: JSON.stringify(result),
      });
    } catch (error) {
      console.error("Analysis error:", error);
      setAnalysis(null);
      setAnalysisError(
        error instanceof Error
          ? error.message
          : "We couldn't analyze this photo. Try again or use the recovery guides.",
      );
    } finally {
      setIsAnalyzing(false);
    }
  }, [imageUri]);

  useEffect(() => {
    void performAnalysis();
  }, [performAnalysis]);

  const handleShareToggle = async (enabled: boolean) => {
    if (!enabled || hasShared) {
      setShareWithCommunity(hasShared);
      return;
    }
    if (!hasAccountAccess() || !analysis) {
      setShareWithCommunity(false);
      Alert.alert("Sign in required", "Sign in to share a scan with the community.");
      return;
    }
    if (!imageBase64 || imageBase64.length > MAX_SCAN_IMAGE_BASE64_LENGTH) {
      setShareWithCommunity(false);
      Alert.alert(
        "Photo can't be shared",
        "This photo is missing or too large to share. Your analysis is still available on this device.",
      );
      return;
    }

    setSharing(true);
    try {
      const userProfile = await storage.getUserProfile();
      const userId = authService.getCurrentUser()?.uid;
      if (!userId) throw new Error("Please sign in again before sharing.");

      const difficultyScore: Record<string, number> = {
        Easy: 2,
        Moderate: 4,
        Difficult: 7,
        Expert: 10,
      };
      const submissionId = await ScanSubmissionsService.submitScan({
        situationType: analysis.situation,
        description: [...analysis.recommendations, ...analysis.safetyWarnings].join("\n"),
        difficultyScore: difficultyScore[analysis.estimatedDifficulty] ?? 5,
        userName: userProfile?.name || "Anonymous",
        userId,
      });
      await ScanSubmissionsService.submitScanImage(
        submissionId,
        `data:image/jpeg;base64,${imageBase64}`,
      );
      await storage.markScanShared(scanIdRef.current, submissionId);
      setHasShared(true);
      setShareWithCommunity(true);
    } catch (error) {
      console.error("Error sharing scan:", error);
      setShareWithCommunity(false);
      Alert.alert(
        "Couldn't share scan",
        error instanceof Error ? error.message : "Please try again later.",
      );
    } finally {
      setSharing(false);
    }
  };

  if (isAnalyzing) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <ThemedText style={[Typography.h4, styles.loadingTitle]}>
          Analyzing your photo…
        </ThemedText>
        <ThemedText style={{ color: theme.tabIconDefault, textAlign: "center" }}>
          AI can miss hazards. Treat any suggestions as general information, not a safety assessment.
        </ThemedText>
      </View>
    );
  }

  if (!analysis) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.backgroundRoot }]}>
        <Feather name="alert-circle" size={42} color={theme.error} />
        <ThemedText style={[Typography.h4, styles.loadingTitle]}>
          Analysis unavailable
        </ThemedText>
        <ThemedText style={[styles.errorMessage, { color: theme.tabIconDefault }]}>
          {analysisError || "We couldn't analyze this photo."}
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          style={[styles.actionButton, { backgroundColor: theme.primary }]}
          onPress={() => void performAnalysis()}
        >
          <ThemedText style={{ color: theme.buttonText, fontWeight: "700" }}>
            Try Again
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={styles.textButton}
          onPress={() => navigation.navigate("Guides")}
        >
          <ThemedText style={{ color: theme.primary }}>Open Recovery Guides</ThemedText>
        </Pressable>
      </View>
    );
  }

  const severityColor =
    analysis.severity === "critical" || analysis.severity === "high"
      ? theme.error
      : analysis.severity === "moderate"
        ? theme.warning
        : theme.success;

  return (
    <ScreenScrollView>
      <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />

      <View style={[styles.summary, { backgroundColor: theme.backgroundDefault }]}>
        <ThemedText style={[Typography.h3, styles.situation]}>
          {analysis.situation}
        </ThemedText>
        <View style={[styles.severityBadge, { backgroundColor: severityColor + "20" }]}>
          <Feather name="alert-triangle" size={18} color={severityColor} />
          <ThemedText style={[styles.severityText, { color: severityColor }]}>
            {severityLabel(analysis.severity)}
          </ThemedText>
        </View>
        <ThemedText style={[styles.limitation, { color: theme.tabIconDefault }]}>
          Photo-based AI can be wrong and cannot verify vehicle stability, hidden damage, equipment ratings, or anchor points. No recoverability percentage or confidence score is provided because a photo cannot establish those reliably.
        </ThemedText>
      </View>

      {analysis.severity === "high" || analysis.severity === "critical" ? (
        <View style={[styles.urgentWarning, { backgroundColor: theme.error + "18", borderColor: theme.error }]}>
          <ThemedText style={[Typography.label, { color: theme.error, marginBottom: Spacing.xs }]}>
            Stop and prioritize safety
          </ThemedText>
          <ThemedText style={{ color: theme.text, lineHeight: 22 }}>
            Keep people clear of the vehicle and any recovery lines. Do not attempt a recovery based only on this analysis; contact a qualified recovery professional or emergency services if anyone is injured or in immediate danger.
          </ThemedText>
        </View>
      ) : null}

      {analysis.requiredEquipment.length > 0 && (
        <View style={styles.section}>
          <ThemedText style={[Typography.h4, styles.sectionTitle]}>
            Possible Equipment
          </ThemedText>
          <ThemedText style={[styles.sectionNote, { color: theme.tabIconDefault }]}>
            AI suggestions only; verify that equipment is suitable and rated for your situation.
          </ThemedText>
          <View style={[styles.card, { backgroundColor: theme.backgroundDefault }]}>
            {analysis.requiredEquipment.map((item, index) => (
              <View key={`${item}-${index}`} style={styles.listItem}>
                <Feather name="tool" size={17} color={theme.primary} />
                <ThemedText style={styles.listText}>{item}</ThemedText>
              </View>
            ))}
          </View>
        </View>
      )}

      {analysis.recommendations.length > 0 && (
        <View style={styles.section}>
          <ThemedText style={[Typography.h4, styles.sectionTitle]}>
            General Guidance
          </ThemedText>
          {analysis.recommendations.map((recommendation, index) => (
            <View key={`${index}-${recommendation}`} style={[styles.stepCard, { backgroundColor: theme.backgroundDefault }]}>
              <View style={[styles.stepNumber, { backgroundColor: theme.primary }]}>
                <ThemedText style={{ color: theme.buttonText, fontWeight: "700" }}>{index + 1}</ThemedText>
              </View>
              <ThemedText style={styles.listText}>{recommendation}</ThemedText>
            </View>
          ))}
        </View>
      )}

      {analysis.safetyWarnings.length > 0 && (
        <View style={styles.section}>
          <ThemedText style={[Typography.h4, styles.sectionTitle]}>Safety cautions</ThemedText>
          {analysis.safetyWarnings.map((warning, index) => (
            <View key={`${index}-${warning}`} style={[styles.warningCard, { backgroundColor: theme.warning + "15" }]}>
              <Feather name="alert-triangle" size={18} color={theme.warning} />
              <ThemedText style={[styles.listText, { marginLeft: Spacing.sm }]}>{warning}</ThemedText>
            </View>
          ))}
        </View>
      )}

      <View style={[styles.disclaimer, { backgroundColor: theme.backgroundSecondary }]}>
        <Feather name="info" size={20} color={theme.tabIconDefault} />
        <ThemedText style={[styles.disclaimerText, { color: theme.tabIconDefault }]}>
          This is general information, not professional recovery advice. Never get under an unstable vehicle or stand in line with a tensioned strap or winch. Stop if anything is uncertain.
        </ThemedText>
      </View>

      {imageBase64 ? (
        <View style={[styles.shareRow, { backgroundColor: theme.backgroundDefault }]}>
          <View style={styles.shareCopy}>
            <ThemedText style={Typography.label}>Share with community</ThemedText>
            <ThemedText style={[styles.sectionNote, { color: theme.tabIconDefault }]}>
              {hasShared ? "Shared with the community." : "Share this photo and analysis publicly."}
            </ThemedText>
          </View>
          {sharing ? <ActivityIndicator color={theme.primary} /> : (
            <Switch
              value={shareWithCommunity}
              onValueChange={(value) => void handleShareToggle(value)}
              disabled={hasShared || !hasAccountAccess()}
              trackColor={{ false: theme.backgroundSecondary, true: theme.primary }}
              thumbColor={shareWithCommunity ? theme.primary : theme.tabIconDefault}
            />
          )}
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        style={[styles.actionButton, styles.helpButton, { backgroundColor: theme.error }]}
        onPress={() => navigation.navigate("NearbyTab")}
      >
        <Feather name="alert-circle" size={21} color={theme.buttonText} />
        <ThemedText style={{ color: theme.buttonText, fontWeight: "700", marginLeft: Spacing.sm }}>
          Find Nearby Help
        </ThemedText>
      </Pressable>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing["3xl"] },
  loadingTitle: { marginTop: Spacing.lg, marginBottom: Spacing.md, textAlign: "center" },
  errorMessage: { textAlign: "center", lineHeight: 22, marginTop: Spacing.sm },
  image: { width: "100%", height: 250, borderRadius: BorderRadius.md, marginBottom: Spacing.lg },
  summary: { padding: Spacing.lg, borderRadius: BorderRadius.md, marginBottom: Spacing.xl },
  situation: { marginBottom: Spacing.md },
  severityBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm },
  severityText: { fontSize: 15, fontWeight: "700", flexShrink: 1 },
  limitation: { marginTop: Spacing.md, fontSize: 14, lineHeight: 21 },
  urgentWarning: { borderWidth: 2, borderRadius: BorderRadius.md, padding: Spacing.lg, marginBottom: Spacing.xl },
  section: { marginBottom: Spacing.xl },
  sectionTitle: { marginBottom: Spacing.sm },
  sectionNote: { fontSize: 13, lineHeight: 19, marginBottom: Spacing.sm },
  card: { padding: Spacing.lg, borderRadius: BorderRadius.md },
  listItem: { flexDirection: "row", alignItems: "flex-start", paddingVertical: Spacing.sm, gap: Spacing.sm },
  listText: { flex: 1, fontSize: 15, lineHeight: 22 },
  stepCard: { flexDirection: "row", alignItems: "flex-start", padding: Spacing.lg, borderRadius: BorderRadius.md, marginTop: Spacing.sm, gap: Spacing.md },
  stepNumber: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  warningCard: { flexDirection: "row", alignItems: "flex-start", padding: Spacing.md, borderRadius: BorderRadius.md, marginTop: Spacing.sm },
  disclaimer: { flexDirection: "row", alignItems: "flex-start", padding: Spacing.lg, borderRadius: BorderRadius.md, marginBottom: Spacing.xl, gap: Spacing.md },
  disclaimerText: { flex: 1, fontSize: 14, lineHeight: 21 },
  shareRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: Spacing.lg, borderRadius: BorderRadius.md, marginBottom: Spacing.xl },
  shareCopy: { flex: 1, marginRight: Spacing.md },
  actionButton: { minHeight: 52, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  textButton: { padding: Spacing.lg },
  helpButton: { marginBottom: Spacing.xl },
});
